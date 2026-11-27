/**
 * 统一资产加载接口（Phase 6）。
 *
 * 目标：把「取 GLB + 校验契约 + 建语义索引 + 回收资源」收在一处，
 * 让关卡脚本不再各自拼 fetch / parse / dispose。
 *
 * 依赖：window.THREE 与 window.GLTFLoader（由 three.bundle.js 提供，
 * 二者来自同一个 three@0.180.0 实例）。本文件是经典脚本，不引入 module。
 *
 * 明确的能力边界：
 *  - 浏览器侧只做**结构完整性**校验（必填字段、nodeUid 唯一、extras↔manifest 对账、
 *    sha256/字节绑定）。**完整 JSON-Schema 校验仍以 Node 侧 validate:assets 为准**，
 *    不在浏览器里塞 AJV —— 那会把 120KB+ 的校验器塞进首屏。
 *  - OBJ 回退只是**迁移期**兜底；一旦回退，调用方必须把 usedFallback 暴露到 UI。
 */
(function () {
  'use strict';

  if (!window.THREE) throw new Error('[ModelLoader] 需要先加载 three.bundle.js（window.THREE 缺失）');
  if (typeof window.GLTFLoader !== 'function') {
    throw new Error('[ModelLoader] 需要 window.GLTFLoader（three.bundle.js 未正确提供）');
  }

  var THREE = window.THREE;

  /* ------------------------------------------------------------------ 工具 */

  function bytesToHex(buf) {
    var b = new Uint8Array(buf);
    var out = '';
    for (var i = 0; i < b.length; i++) out += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return out;
  }

  async function sha256Hex(arrayBuffer) {
    if (!window.crypto || !window.crypto.subtle) return null; // 非安全上下文时跳过（会在 stats 里标注）
    var digest = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
    return bytesToHex(digest);
  }

  function indexBy(arr, keyFn) {
    var m = new Map();
    (arr || []).forEach(function (item) {
      var k = keyFn(item);
      if (k == null) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(item);
    });
    return m;
  }

  /* ------------------------------------------------ 浏览器侧结构完整性校验 */

  function validateStructure(manifest) {
    var problems = [];
    if (!manifest || typeof manifest !== 'object') {
      problems.push('manifest 不是对象');
      return problems;
    }
    ['schemaVersion', 'assetId', 'assetVersion', 'runtime', 'nodes'].forEach(function (k) {
      if (manifest[k] == null) problems.push('缺少必填字段 ' + k);
    });
    if (manifest.runtime && manifest.runtime.format !== 'glb') {
      problems.push('runtime.format 不是 glb：' + manifest.runtime.format);
    }
    if (manifest.runtime && !manifest.runtime.sha256) problems.push('runtime.sha256 缺失');
    var seen = new Set();
    (manifest.nodes || []).forEach(function (n, i) {
      if (!n.nodeUid) problems.push('nodes[' + i + '] 缺少 nodeUid');
      else if (seen.has(n.nodeUid)) problems.push('nodeUid 重复：' + n.nodeUid);
      else seen.add(n.nodeUid);
    });
    return problems;
  }

  /* ------------------------------------------------------ GLB ↔ manifest 对账 */

  function reconcile(gltfJson, manifest) {
    var result = { ok: true, problems: [], glbNodes: 0, glbWithExtras: 0, matched: 0 };
    var nodes = (gltfJson && gltfJson.nodes) || [];
    result.glbNodes = nodes.length;

    var byUid = new Map();
    (manifest.nodes || []).forEach(function (n) { byUid.set(n.nodeUid, n); });
    (manifest.nonInteractiveSupport || []).forEach(function (n) { byUid.set(n.nodeUid, n); });

    var seenUids = new Set();
    for (var i = 0; i < nodes.length; i++) {
      var petro = nodes[i].extras && nodes[i].extras.petro;
      if (!petro || !petro.nodeUid) continue;
      result.glbWithExtras++;
      var m = byUid.get(petro.nodeUid);
      if (!m) {
        result.ok = false;
        result.problems.push('GLB 节点未在 Manifest 登记：' + petro.nodeUid);
        continue;
      }
      seenUids.add(petro.nodeUid);
      if (petro.objectId && m.objectId && petro.objectId !== m.objectId) {
        result.ok = false;
        result.problems.push('objectId 不一致：' + petro.nodeUid);
        continue;
      }
      if (petro.semanticId && m.semanticId && petro.semanticId !== m.semanticId) {
        result.ok = false;
        result.problems.push('semanticId 不一致：' + petro.nodeUid);
        continue;
      }
      result.matched++;
    }

    var manifestNodeCount = (manifest.nodes || []).length + (manifest.nonInteractiveSupport || []).length;
    if (result.glbWithExtras !== result.glbNodes) {
      result.ok = false;
      result.problems.push(
        'GLB 有 ' + result.glbNodes + ' 个节点，其中 ' + result.glbWithExtras + ' 个带 extras.petro（应为全部）',
      );
    }
    if (result.matched !== manifestNodeCount) {
      result.ok = false;
      result.problems.push(
        'Manifest 登记 ' + manifestNodeCount + ' 个节点，GLB 里只对账上 ' + result.matched + ' 个',
      );
    }
    return result;
  }

  /* ---------------------------------------------------------------- 资源回收 */

  function collectDisposables(root) {
    var geometries = new Set();
    var materials = new Set();
    var textures = new Set();
    root.traverse(function (o) {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      if (o.geometry) geometries.add(o.geometry);
      var mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach(function (mat) {
        materials.add(mat);
        /* 同一 texture 可能被多个 material 引用，去重后再 dispose */
        Object.keys(mat).forEach(function (k) {
          var v = mat[k];
          if (v && v.isTexture) textures.add(v);
        });
      });
    });
    return { geometries: geometries, materials: materials, textures: textures };
  }

  function disposeAll(disposables) {
    disposables.textures.forEach(function (t) {
      /* ImageBitmap 需要显式 close，否则解码后的位图仍驻留内存 */
      if (t.image && typeof t.image.close === 'function') {
        try { t.image.close(); } catch (e) {}
      }
      t.dispose();
    });
    disposables.materials.forEach(function (m) { m.dispose(); });
    disposables.geometries.forEach(function (g) { g.dispose(); });
  }

  /* ------------------------------------------------------------------ 索引 */

  function buildIndices(manifest, root) {
    var nodeByUid = new Map();
    var byObjectId = new Map();
    var bySystemId = new Map();
    var bySemanticId = new Map();
    var anchors = new Map();

    function bucket(map, key, value) {
      if (key == null) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(value);
    }

    (manifest.nodes || []).forEach(function (n) {
      nodeByUid.set(n.nodeUid, n);
      bucket(byObjectId, n.objectId, n);
      bucket(bySystemId, n.systemId, n);
      bucket(bySemanticId, n.semanticId, n);
    });
    (manifest.nonInteractiveSupport || []).forEach(function (n) { nodeByUid.set(n.nodeUid, n); });
    (manifest.anchors || []).forEach(function (a) { anchors.set(a.anchorId, a); });

    /* 把 Object3D 与 nodeUid 关联，供调用方从节点反查契约 */
    var object3dByUid = new Map();
    root.traverse(function (o) {
      var petro = o.userData && o.userData.petro;
      if (petro && petro.nodeUid) {
        object3dByUid.set(petro.nodeUid, o);
        o.userData.objectId = petro.objectId;
        o.userData.semanticId = petro.semanticId;
      }
    });

    return {
      nodeByUid: nodeByUid,
      object3dByUid: object3dByUid,
      byObjectId: byObjectId,
      bySystemId: bySystemId,
      bySemanticId: bySemanticId,
      anchors: anchors,
    };
  }

  /* ------------------------------------------------------------------ 加载 */

  async function fetchArrayBuffer(url, onProgress, label) {
    var res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error((label || '资源') + ' 请求失败：HTTP ' + res.status + ' ' + url);
    var total = Number(res.headers.get('content-length') || 0);
    if (!res.body || !onProgress) return await res.arrayBuffer();

    var reader = res.body.getReader();
    var chunks = [];
    var received = 0;
    for (;;) {
      var step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      received += step.value.byteLength;
      onProgress({ loaded: received, total: total || null, ratio: total ? received / total : null, label: label });
    }
    var out = new Uint8Array(received);
    var offset = 0;
    chunks.forEach(function (c) { out.set(c, offset); offset += c.byteLength; });
    return out.buffer;
  }

  /**
   * 加载一个 GLB 资产。
   * @param {object} opts
   * @param {string} opts.glbUrl      GLB 地址
   * @param {string} opts.manifestUrl Manifest 地址
   * @param {function} [opts.onProgress] 进度回调
   * @param {boolean} [opts.verifyHash=true] 是否校验 sha256/字节数
   */
  async function load(opts) {
    var onProgress = opts.onProgress || function () {};
    var started = (window.performance && performance.now()) || Date.now();

    onProgress({ phase: 'manifest', ratio: 0 });
    var manifest = await (await fetch(opts.manifestUrl, { cache: 'no-cache' })).json();

    var problems = validateStructure(manifest);
    if (problems.length) {
      throw new Error('[ModelLoader] Manifest 结构校验失败：\n  - ' + problems.join('\n  - '));
    }

    onProgress({ phase: 'download', ratio: 0 });
    var buffer = await fetchArrayBuffer(opts.glbUrl, onProgress, 'GLB');

    var hashOk = null;
    if (opts.verifyHash !== false) {
      if (buffer.byteLength !== manifest.runtime.bytes) {
        throw new Error(
          '[ModelLoader] GLB 字节数不符：Manifest 声明 ' + manifest.runtime.bytes + '，实际 ' + buffer.byteLength,
        );
      }
      var digest = await sha256Hex(buffer);
      if (digest === null) {
        hashOk = null; // 非安全上下文（http 非 localhost）无法算 sha256
      } else if (digest !== manifest.runtime.sha256) {
        throw new Error(
          '[ModelLoader] GLB sha256 不符：Manifest ' + manifest.runtime.sha256.slice(0, 16) + '…，实际 ' + digest.slice(0, 16) + '…',
        );
      } else {
        hashOk = true;
      }
    }

    onProgress({ phase: 'parse', ratio: 0 });
    var loader = new window.GLTFLoader();
    var gltf = await new Promise(function (resolve, reject) {
      loader.parse(buffer.slice(0), '', resolve, reject);
    });

    var check = reconcile(gltf.json || gltf.parser && gltf.parser.json, manifest);
    if (!check.ok) {
      throw new Error(
        '[ModelLoader] GLB 与 Manifest 对账失败：\n  - ' + check.problems.slice(0, 8).join('\n  - '),
      );
    }

    var root = gltf.scene || gltf.scenes[0];
    root.name = manifest.assetId || root.name;
    var indices = buildIndices(manifest, root);
    var disposables = collectDisposables(root);
    var mixers = [];

    var stats = {
      assetId: manifest.assetId,
      assetVersion: manifest.assetVersion,
      nodes: check.glbNodes,
      withExtras: check.glbWithExtras,
      reconciled: check.matched,
      meshes: disposables.geometries.size,
      materials: disposables.materials.size,
      textures: disposables.textures.size,
      hashVerified: hashOk,
      usedFallback: false,
      loadMs: Math.round(((window.performance && performance.now()) || Date.now()) - started),
    };

    var handle = {
      root: root,
      manifest: manifest,
      stats: stats,
      indices: indices,
      gltf: gltf,
      findByNodeUid: function (uid) { return indices.object3dByUid.get(uid) || null; },
      findManifestNode: function (uid) { return indices.nodeByUid.get(uid) || null; },
      nodesOfObject: function (id) { return indices.byObjectId.get(id) || []; },
      nodesOfSystem: function (id) { return indices.bySystemId.get(id) || []; },
      nodesOfSemantic: function (id) { return indices.bySemanticId.get(id) || []; },
      anchor: function (id) { return indices.anchors.get(id) || null; },
      createMixer: function (obj) {
        var mixer = new window.THREE.AnimationMixer(obj || root);
        mixers.push(mixer);
        return mixer;
      },
      dispose: function () {
        mixers.forEach(function (m) { try { m.stopAllAction(); m.uncacheRoot(m.getRoot()); } catch (e) {} });
        mixers.length = 0;
        disposeAll(disposables);
        if (root.parent) root.parent.remove(root);
        indices.nodeByUid.clear();
        indices.object3dByUid.clear();
        indices.byObjectId.clear();
        indices.bySystemId.clear();
        indices.bySemanticId.clear();
        indices.anchors.clear();
        handle.disposed = true;
      },
      disposed: false,
    };

    onProgress({ phase: 'done', ratio: 1, stats: stats });
    return handle;
  }

  /**
   * OBJ 回退（仅迁移期）。GLB 失败时由调用方决定是否使用。
   * 返回 { root, usedFallback: true, reason }。
   */
  async function loadObjFallback(objUrl, mtlUrl, reason) {
    if (!window.ObjLite || typeof window.ObjLite.load !== 'function') {
      throw new Error('[ModelLoader] 无法回退：window.ObjLite 不可用');
    }
    var root = await window.ObjLite.load(objUrl, mtlUrl);
    return {
      root: root,
      usedFallback: true,
      reason: reason || 'GLB 加载失败',
      dispose: function () {
        var d = collectDisposables(root);
        disposeAll(d);
        if (root.parent) root.parent.remove(root);
      },
    };
  }

  window.ModelLoader = {
    load: load,
    loadObjFallback: loadObjFallback,
    /* 暴露给测试：不加载资产也能单独验证对账逻辑 */
    __internals: { validateStructure: validateStructure, reconcile: reconcile, collectDisposables: collectDisposables },
    threeRevision: THREE.REVISION,
  };
})();
