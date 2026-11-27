/* 关卡 05｜产品去向 —— 长在 V2 的场景里
   台面上摆一批出厂物品，挑出「常见的石油 / 石化路线产品」。

   Phase 8：
   - 物品数据从 `data/products.json` 读，不再是 name + oil 布尔
   - 每件物品的模型来自真实 GLB，按 (modelAssetId, modelNodeUid) 绑定
   - 判定从 typicalFeedstocks 推导，`oil` 布尔已删除
   - 材料样本与制品/应用场景是不同资产节点（沥青块 ≠ 道路剖面，树脂颗粒 ≠ 塑料瓶）
   - 模型没加载出来时**显式标注未加载**，不用球/方块冒充

   玩法（多选 + 确认）与 UI 操作方式保持不变，仅物品数由 10 → 12。
*/
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null, camera = null, baseScene = null, anchor = null;
  let factoryGroup = null, factoryVisible = true;
  const pickables = [];
  const built = {};

  const DATA_URL = 'data/products.json';
  const MODELS_URL = 'data/products.models.json';
  const COLS = 6;

  let PRODUCTS = null;
  let MAPPING = null;
  let ITEMS = [];
  const assetHandles = new Map();
  const modelStats = { requested: 0, loaded: 0, failed: 0, failedItems: [], assets: {} };
  let assetsReady = null;
  let usingFallbackAsset = false;

  /* ------------------------------------------------------------ 数据 */
  function isPetroleumRoute(item) {
    return Array.isArray(item.typicalFeedstocks) && item.typicalFeedstocks.indexOf('petroleum') >= 0;
  }

  function feedstockLabel(list) {
    const label = { petroleum: '石油', natural_gas: '天然气', coal: '煤', biomass: '生物质', other: '其它矿产/无机原料' };
    return list.map(function (f) { return label[f] || f; }).join(' / ');
  }

  function repTypeLabel(t) {
    return ({ product: '产品', material: '材料', manufactured_item: '制品', application_scene: '应用场景' })[t] || t;
  }

  async function ensureData() {
    if (PRODUCTS) return;
    const res = await Promise.all([
      fetch(DATA_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('products.json HTTP ' + r.status); return r.json(); }),
      fetch(MODELS_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('products.models.json HTTP ' + r.status); return r.json(); }),
    ]);
    PRODUCTS = res[0];
    MAPPING = res[1];
    ITEMS = PRODUCTS.items.filter(function (i) { return i.inTask !== false; }).map(function (src, index) {
      const bound = MAPPING.entries[src.modelNodeUid] || null;
      return {
        index: index,
        productId: src.productId,
        displayName: src.displayName,
        productCategory: src.productCategory,
        representationType: src.representationType,
        typicalFeedstocks: src.typicalFeedstocks.slice(),
        petroleumRouteDescription: src.petroleumRouteDescription,
        teachingNote: src.teachingNote,
        modelAssetId: src.modelAssetId,
        modelNodeUid: src.modelNodeUid,
        isPetroleumRoute: isPetroleumRoute(src),
        /* 一个产品是一个装配单元（可能含多个零件节点），必须整件渲染 */
        boundNodeUid: bound ? bound.anchorNodeUid : null,
        boundNodeUids: bound && Array.isArray(bound.nodeUids) ? bound.nodeUids.slice() : [],
        boundGlbUri: bound ? bound.glbUri : null,
        modelLoaded: false,
        obj: null,
        ring: null,
        ringMat: null,
      };
    });
  }

  /* ------------------------------------------------------------ 构建 */
  function slotPosition(i) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const x = (col - (COLS - 1) / 2) * 2.05;
    const z = row === 0 ? -1.9 : 2.0;
    return { x: x, z: z };
  }

  function styleModel(obj, item) {
    obj.traverse(function (o) {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.userData.productId = item.productId;
      o.userData.modelNodeUid = item.boundNodeUid;
      o.userData.itemIndex = item.index;
      /* 逐网格克隆材质：选中高亮只影响这一件，不会连带其它物品 */
      if (o.material) {
        o.material = Array.isArray(o.material)
          ? o.material.map(function (m) { return m.clone(); })
          : o.material.clone();
        o.userData.baseColor = o.material.color ? o.material.color.getHex() : 0xffffff;
      }
    });
  }

  function placeModel(item, sources) {
    const stage2 = new THREE.Group();
    sources.forEach(function (src) {
      const clone = src.clone(true);
      styleModel(clone, item);
      stage2.add(clone);
    });

    const bbox = new THREE.Box3().setFromObject(stage2);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 0.92 / maxDim;

    stage2.scale.multiplyScalar(scale);
    stage2.position.set(-center.x * scale, -bbox.min.y * scale, -center.z * scale);

    const holder = new THREE.Group();
    holder.add(stage2);
    holder.userData.productId = item.productId;
    item.obj = holder;
    item.modelLoaded = true;
    return holder;
  }

  /* 模型缺失时的**显式**占位：只有线框轮廓 + 文字标注，不是实心几何冒充成功 */
  function missingModel(item) {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 0.62, 0.62));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff7a5c }));
    line.position.y = 0.4;
    const holder = new THREE.Group();
    holder.add(line);
    holder.userData.productId = item.productId;
    holder.userData.modelMissing = true;
    item.obj = holder;
    item.modelLoaded = false;
    return holder;
  }

  function buildBase() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[4] || new THREE.Vector3(-5, 0, 5);
    anchor = new THREE.Vector3(p.x, 0, p.z);

    G = new THREE.Group();
    G.position.copy(anchor);
    baseScene.add(G);
    if (window.__lvlGroup) window.__lvlGroup(4, G);

    const mPad = new THREE.MeshStandardMaterial({ color: 0x252420, roughness: 0.95 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.14, 7.6), mPad);
    pad.position.set(0, 0.03, 0);
    G.add(pad);

    const title = window.__lvlLabel('哪些是常见的石油 / 石化路线产品？', '#f0a22e');
    title.scale.set(3.4, 0.74, 1);
    title.position.set(0, 4.75, -0.6);
    G.add(title);

    const sub = window.__lvlLabel('石油不是它们的唯一来源', '#8fb6ad');
    sub.scale.set(2.2, 0.44, 1);
    sub.position.set(0, 4.2, -0.6);
    G.add(sub);

    return built;
  }

  function buildItems() {
    if (!ITEMS.length || built.items) return;
    built.items = true;

    ITEMS.forEach(function (it) {
      const slot = slotPosition(it.index);
      const g = new THREE.Group();
      g.position.set(slot.x, 0.1, slot.z);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.05, 8, 26),
        new THREE.MeshStandardMaterial({ color: 0x40382a, emissive: 0xd8a24a, emissiveIntensity: 0.16, roughness: 0.5 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.06;
      g.add(ring);

      const lb = window.__lvlLabel(it.displayName, '#c9d6dc');
      lb.scale.set(1.5, 0.46, 1);
      lb.position.set(0, 1.5, 0);
      g.add(lb);

      /* 拾取用命中区：只负责点击，不承担"模型"职责 */
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52, 0.52, 1.15, 10),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.y = 0.6;
      hit.userData.productId = it.productId;
      hit.userData.itemIndex = it.index;
      g.add(hit);
      pickables.push(hit);

      G.add(g);
      it.group = g;
      it.ring = ring;
      it.ringMat = ring.material;
      it.label = lb;
    });

    G.updateMatrixWorld(true);
  }

  /* ------------------------------------------------------------ 资产 */
  function loadAssets() {
    if (!window.ModelLoader) return Promise.reject(new Error('ModelLoader 不可用'));
    const assetIds = Array.from(new Set(ITEMS.map(function (i) { return i.modelAssetId; })));
    modelStats.requested = ITEMS.length;

    return Promise.all(assetIds.map(function (aid) {
      const uri = 'assets/products/' + aid + '/' + aid + '.glb';
      const man = 'assets/products/' + aid + '/' + aid + '.manifest.json';
      return window.ModelLoader.load({ glbUrl: uri, manifestUrl: man })
        .then(function (handle) {
          assetHandles.set(aid, handle);
          modelStats.assets[aid] = { nodes: handle.stats.nodes, reconciled: handle.stats.reconciled, ok: true };
          return handle;
        })
        .catch(function (err) {
          modelStats.assets[aid] = { ok: false, error: (err && err.message) || String(err) };
          return null;
        });
    })).then(function () {
      ITEMS.forEach(function (it) {
        const handle = assetHandles.get(it.modelAssetId);
        const sources = (handle && it.boundNodeUids.length)
          ? it.boundNodeUids.map(function (u) { return handle.findByNodeUid(u); }).filter(Boolean)
          : [];
        const node = sources.length ? placeModel(it, sources) : missingModel(it);
        it.group.add(node);
        if (sources.length) {
          modelStats.loaded++;
        } else {
          modelStats.failed++;
          modelStats.failedItems.push(it.productId);
          usingFallbackAsset = true;
          /* 标签后缀显式说明，避免"看起来有东西"被当成加载成功 */
          it.label.userData && (it.label.userData.missing = true);
        }
      });
      G.updateMatrixWorld(true);
      if (badge) {
        badge.hidden = modelStats.failed === 0;
        badge.textContent = modelStats.failed ? ('⚠ ' + modelStats.failed + ' 件模型未加载（已标注，未用占位几何冒充）') : '';
      }
      syncHintAfterLoad();
      return modelStats;
    });
  }

  function syncHintAfterLoad() {
    if (modelStats.failed > 0) {
      hint.textContent = modelStats.failed + ' 件模型未加载 · 分类判断仍可用';
    } else {
      hint.textContent = '点模型或按钮选出石油路线产品';
    }
  }

  /* ------------------------------------------------------------ 相机 */
  let flyHandle = null;
  function fly(from, fromT, to, toT, dur, done) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.copy(to); camera.lookAt(toT); if (typeof done === 'function') done(); return;
    }
    const durMs = Math.max(1, dur || 1000);
    const t0 = performance.now();
    if (flyHandle) cancelAnimationFrame(flyHandle);
    const ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / durMs);
      const e = ease(k);
      camera.position.lerpVectors(from, to, e);
      camera.lookAt(new THREE.Vector3().lerpVectors(fromT, toT, e));
      if (k < 1) flyHandle = requestAnimationFrame(step);
      else if (done) done();
    })();
  }

  /* ------------------------------------------------------------ UI */
  const ui = document.createElement('div');
  ui.className = 'lvl';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">05 / 05</span><b>产品去向 · 挑出石油化工常见下游产品</b><span class="lvl__hint" id="l5-hint">镜头正在靠近产品台…</span></div>',
    '<div class="lvl__act lvl2" id="l5-act" hidden>',
    '<div class="lvl2__head"><div><span class="lvl2__eyebrow">产品去向</span><b>挑出石油 / 石化路线产品</b></div><span class="lvl2__state" id="l5-state">已选 0</span></div>',
    '<p class="lvl2__lede">这些是同一批出厂的东西。选出<b>常见石油 / 石化路线</b>的产品；石油不是它们的唯一来源。</p>',
    '<div class="lvl2__step">',
    '<div class="lvl2__stephead"><span class="lvl2__num">1</span><b>选择产品</b><span class="lvl2__stepnote">点按钮，或点台上模型</span></div>',
    '<div class="lvl__chips" id="l5-chips" role="group" aria-label="选择产品"></div>',
    '</div>',
    '<div class="lvl2__step">',
    '<div class="lvl2__stephead"><span class="lvl2__num">2</span><b>确认选择</b><span class="lvl2__stepnote">多选判断</span></div>',
    '<div class="lvl__row"><b id="l5-count">已选 0</b><button type="button" class="lvl__btn" id="l5-check">确认选择</button></div>',
    '</div>',
    '<div class="lvl2__detail" id="l5-detail" hidden></div>',
    '<div class="lvl__out"><span id="l5-note">还没选</span></div>',
    '<div class="lvl2__toolrow"><span class="lvl2__tool-label">资产</span><span class="lvl2__badge" id="l5-asset-badge" hidden></span></div>',
    '</div>',
    '<button type="button" class="lvl__back" id="l5-back">返回总览</button>',
  ].join('');
  stage.viewport.appendChild(ui);

  const hint = ui.querySelector('#l5-hint');
  const act = ui.querySelector('#l5-act');
  const countEl = ui.querySelector('#l5-count');
  const note = ui.querySelector('#l5-note');
  const checkBtn = ui.querySelector('#l5-check');
  const stateEl = ui.querySelector('#l5-state');
  const chipsEl = ui.querySelector('#l5-chips');
  const detailEl = ui.querySelector('#l5-detail');
  const badge = ui.querySelector('#l5-asset-badge');
  const back = ui.querySelector('#l5-back');

  const picked = new Set();
  let completed = false;
  let chips = [];

  function buildChips() {
    chipsEl.innerHTML = ITEMS.map(function (it, i) {
      const missing = it.modelLoaded === false && it.obj && it.obj.userData.modelMissing;
      return '<button type="button" class="lvl__chip" data-item="' + i + '" data-product="' + it.productId + '">' +
        it.displayName + (missing ? ' ⚠' : '') + '</button>';
    }).join('');
    chips = Array.prototype.slice.call(chipsEl.querySelectorAll('.lvl__chip'));
    chips.forEach(function (b) {
      b.addEventListener('click', function () { toggle(Number(b.getAttribute('data-item'))); });
    });
  }

  function refreshCount() {
    countEl.textContent = '已选 ' + picked.size;
    if (stateEl) stateEl.textContent = completed ? '已完成' : '已选 ' + picked.size;
    chips.forEach(function (b) {
      const i = Number(b.getAttribute('data-item'));
      b.classList.toggle('on', picked.has(i));
      b.setAttribute('aria-pressed', picked.has(i) ? 'true' : 'false');
    });
  }

  function showDetail(item) {
    if (!item || !detailEl) return;
    const rows = [
      '<div class="lvl2__detailhead"><b>' + item.displayName + '</b><span>' + repTypeLabel(item.representationType) + ' · ' + item.productCategory + '</span></div>',
      '<div class="lvl2__detailrow"><span>典型原料</span><b>' + feedstockLabel(item.typicalFeedstocks) + '</b></div>',
      '<div class="lvl2__detailrow"><span>石油路线</span><span>' + item.petroleumRouteDescription + '</span></div>',
      '<div class="lvl2__detailrow lvl2__detailnote"><span>说明</span><span>' + item.teachingNote + '</span></div>',
    ];
    if (item.isPetroleumRoute) {
      rows.splice(1, 0, '<div class="lvl2__detailrow"><span>判定</span><b class="ok">常见石油 / 石化路线产品</b></div>');
    } else {
      rows.splice(1, 0, '<div class="lvl2__detailrow"><span>判定</span><b class="no">不属于石油产品路线</b></div>');
    }
    detailEl.innerHTML = rows.join('');
    detailEl.hidden = false;
  }

  function setHighlight(item, on) {
    if (!item) return;
    if (item.ringMat) item.ringMat.emissiveIntensity = on ? 1.8 : 0.16;
    if (!item.obj) return;
    item.obj.traverse(function (o) {
      if (!o.isMesh || !o.material || !o.material.color) return;
      const base = o.userData.baseColor == null ? 0xffffff : o.userData.baseColor;
      o.material.color.setHex(on ? 0x6a5426 : base);
      o.scale.setScalar(on ? 1.12 : 1);
    });
  }

  function toggle(i) {
    const it = ITEMS[i];
    if (!it) return;
    if (picked.has(i)) {
      picked.delete(i);
      setHighlight(it, false);
    } else {
      picked.add(i);
      setHighlight(it, true);
    }
    showDetail(it);
    refreshCount();
    if (stage.setInteraction) stage.setInteraction('select_product', it.displayName, picked.size + ' 件');
    note.textContent = '已选 ' + picked.size + ' 件';
  }

  checkBtn.addEventListener('click', function () {
    if (completed) return;
    /* 判定只认数据里的 typicalFeedstocks，没有任何 oil 布尔参与 */
    const targetIdx = ITEMS.map(function (it, i) { return it.isPetroleumRoute ? i : -1; }).filter(function (i) { return i >= 0; });
    const missing = targetIdx.filter(function (i) { return !picked.has(i); });
    const extra = Array.from(picked).filter(function (i) { return !ITEMS[i].isPetroleumRoute; });

    if (!missing.length && !extra.length) {
      complete();
      return;
    }
    const parts = [];
    if (missing.length) parts.push('漏了 ' + missing.map(function (i) { return ITEMS[i].displayName; }).join('、'));
    if (extra.length) parts.push('多了 ' + extra.map(function (i) { return ITEMS[i].displayName; }).join('、'));
    hint.textContent = '再想想 · ' + parts.join('，');
    note.textContent = parts.join('；');
  });

  function complete() {
    completed = true;
    ui.classList.add('done');
    hint.textContent = '已完成 · 石油不只是燃料';
    ITEMS.forEach(function (it) {
      if (it.ringMat) {
        it.ringMat.emissiveIntensity = it.isPetroleumRoute ? 1.9 : 0;
        it.ringMat.emissive.setHex(it.isPetroleumRoute ? 0xd8a24a : 0x2a333a);
      }
    });
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '产品去向：石油制品与它以外的东西' });
    log.push({ k: '动手', t: '挑出常见石油 / 石化路线产品', d: picked.size + ' 件' });
    if (stage.setNodeDone) stage.setNodeDone(4, true);
    back.classList.add('pulse');
    back.textContent = '完成，返回总览 →';
    checkBtn.disabled = true;
    refreshCount();
    note.textContent = '共 ' + ITEMS.filter(function (i) { return i.isPetroleumRoute; }).length +
      ' 件常见石油 / 石化路线产品；塑料、合成纤维、合成橡胶也可能来自天然气、煤基或生物基原料';
  }

  /* ------------------------------------------------------------ 拾取 */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  stage.viewport.addEventListener('pointerup', function (e) {
    if (!stage.isLevel() || window.__l5active !== true) return;
    if (performance.now() - (window.__stageDragAt || 0) < 300) return;
    if (e.target.closest && e.target.closest('.lvl')) return;
    const rect = stage.viewport.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);

    /* 先打命中区，再打模型本体（模型 mesh 上也带 productId，两条路都通） */
    const hits = ray.intersectObjects(pickables, false);
    if (hits.length) {
      toggle(hits[0].object.userData.itemIndex);
      return;
    }
    const modelMeshes = [];
    ITEMS.forEach(function (it) { if (it.obj) it.obj.traverse(function (o) { if (o.isMesh) modelMeshes.push(o); }); });
    const mh = ray.intersectObjects(modelMeshes, false)[0];
    if (mh && mh.object.userData.productId) {
      const idx = ITEMS.findIndex(function (it) { return it.productId === mh.object.userData.productId; });
      if (idx >= 0) toggle(idx);
    }
  });

  /* ------------------------------------------------------------ 进 / 出 */
  function ensureCamera() {
    if (!camera) camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    camera.aspect = (stage.viewport.clientWidth || 800) / (stage.viewport.clientHeight || 480);
    camera.updateProjectionMatrix();
  }

  function enter() {
    if (stage.isLevel()) return;

    /* 入场必须是同步的：stage.use 一旦晚于舞台的入场时序，渲染循环就停住（实测 calls=0，
       视口全黑）。所以先把场景/相机接上，数据与模型随后挂载。 */
    if (!G) buildBase();
    ensureCamera();

    /* 重进必须回到初态：原来没复位，退出重进会带着上一轮的选中集合与"已完成"状态，
       表现为按钮仍 disabled、少选也能"完成"。 */
    picked.clear();
    completed = false;
    checkBtn.disabled = false;
    ui.classList.remove('done');
    if (detailEl) { detailEl.hidden = true; detailEl.innerHTML = ''; }
    ITEMS.forEach(function (it) { setHighlight(it, false); });
    factoryGroup = stage.scene && stage.scene.getObjectByName ? stage.scene.getObjectByName('industry-sandbox') : null;
    if (factoryGroup) {
      factoryVisible = factoryGroup.visible;
      factoryGroup.visible = false;
    }

    const startPos = stage.camera.position.clone();
    const startT = new THREE.Vector3(anchor.x, 1.4, anchor.z);
    camera.position.copy(startPos);
    camera.lookAt(startT);

    stage.use(baseScene, camera);
    if (stage.setOverviewVisible) stage.setOverviewVisible(false);
    /* 必须显式打开关卡组：__lvlGroup 注册的组默认不可见，L3/L4 都有这一步，
       L5 原来漏了 —— 结果是整个视口全黑（renderer 调用数 0），并非"占位几何难看"。 */
    if (G) G.visible = true;
    window.__l5active = true;
    ui.classList.add('on');
    document.body.classList.add('in-level');
    hint.textContent = '正在加载产品模型…';
    refreshCount();

    assetsReady = ensureData()
      .then(function () {
        buildItems();
        buildChips();
        refreshCount();
        return loadAssets();
      })
      .catch(function (err) {
        console.error('[L5] 产品数据/模型加载失败', err);
        hint.textContent = '产品数据加载失败：' + ((err && err.message) || err);
        return modelStats;
      });

    fly(startPos, startT,
      new THREE.Vector3(anchor.x - 3.6, 12.6, anchor.z + 12.4),
      new THREE.Vector3(anchor.x - 3.6, 1.4, anchor.z), 1800, function () {
        act.hidden = false;
        if (!modelStats.loaded && !modelStats.failed) hint.textContent = '点出石油 / 石化路线产品';
      });
  }

  function exit() {
    if (factoryGroup) {
      factoryGroup.visible = factoryVisible;
      factoryGroup = null;
    }
    act.hidden = true;
    ui.classList.remove('on', 'done');
    document.body.classList.remove('in-level');
    window.__l5active = false;
    fly(camera.position.clone(), new THREE.Vector3(anchor.x, 1.6, anchor.z),
      new THREE.Vector3(anchor.x, 11, anchor.z + 20), new THREE.Vector3(0, 1.2, 0), 1500, function () {
        if (stage.setOverviewVisible) stage.setOverviewVisible(true);
        stage.back();
        const seg = document.querySelector('#stages [data-stage="4"]');
        if (seg) seg.classList.add('done-level');
      });
  }

  /* 模块加载期就预取数据，通常入场时已就绪 */
  ensureData().catch(function (err) { console.error('[L5] 预取产品数据失败', err); });

  back.onclick = exit;
  window.__lvlEntry(4, '进入 05 产品去向', enter);
  window.__l5 = {
    enter: enter,
    exit: exit,
    toggle: toggle,
    select: function (i) { if (!picked.has(i)) toggle(i); },
    get picked() { return Array.from(picked); },
    get items() { return ITEMS.map(function (it) { return {
      index: it.index,
      productId: it.productId,
      displayName: it.displayName,
      representationType: it.representationType,
      productCategory: it.productCategory,
      typicalFeedstocks: it.typicalFeedstocks.slice(),
      isPetroleumRoute: it.isPetroleumRoute,
      modelAssetId: it.modelAssetId,
      modelNodeUid: it.modelNodeUid,
      boundNodeUid: it.boundNodeUid,
      modelLoaded: it.modelLoaded,
      /* 装配单元里包含多少零件节点：用于断言"整件渲染"而不是只渲染一根管子 */
      partCount: it.boundNodeUids.length,
      boundNodeUids: it.boundNodeUids.slice(),
    }; }); },
    get modelStats() { return modelStats; },
    get usingFallbackAsset() { return usingFallbackAsset; },
    get assetsReady() { return assetsReady; },
    get completed() { return completed; },
    get detailText() { return detailEl && !detailEl.hidden ? detailEl.textContent : ''; },
    get currentDetail() {
      const last = Array.from(picked).pop();
      return last == null ? null : ITEMS[last];
    },
    /* 判定口径自证：返回由数据推导出的目标集合，供 E2E 与数据校验对照 */
    get classification() {
      return {
        targets: ITEMS.filter(function (i) { return i.isPetroleumRoute; }).map(function (i) { return i.productId; }),
        nonTargets: ITEMS.filter(function (i) { return !i.isPetroleumRoute; }).map(function (i) { return i.productId; }),
        usesOilBoolean: false,
      };
    },
    productInfo: function (productId) {
      const it = ITEMS.find(function (x) { return x.productId === productId; });
      if (!it) return null;
      return {
        productId: it.productId,
        displayName: it.displayName,
        representationType: it.representationType,
        typicalFeedstocks: it.typicalFeedstocks.slice(),
        petroleumRouteDescription: it.petroleumRouteDescription,
        teachingNote: it.teachingNote,
        modelLoaded: it.modelLoaded,
      };
    },
    screenPoint: function (i) {
      const it = ITEMS[i];
      if (!it || !it.obj || !camera || !stage || !stage.viewport) return null;
      const v = new THREE.Vector3();
      it.obj.getWorldPosition(v);
      v.y += 0.35;
      v.project(camera);
      const r = stage.viewport.getBoundingClientRect();
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, visible: v.z > -1 && v.z < 1 };
    },
  };
})();
