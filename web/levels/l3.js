/* 关卡 03｜储运 —— 长在 V2 的场景里
   左边固定顶罐，右边外浮顶罐，同一个液位滑块同时灌。
   液位越低，固定顶罐的油气空间越大；外浮顶的浮盘始终贴着油面。此为教学示意，不换算真实排放量。

   Phase 7：
   - 罐体/泵组改为独立 Hero GLB（经 ModelLoader 加载、hash 与 extras 对账）
   - 油面仍是本关的动态对象；浮盘按 manifest 的 floating_deck 绑定跟随油面
   - 固定顶罐 roof_cone 是静态节点，任何液位下都不动
   - 两个罐的结构状态**各自独立**（剖切按钮只作用于当前选中的罐）
   - 泵送路径只认 process-connections.json 的 connectionId；未登记就不画管线，
     绝不在 l3.js 里另造一条与实体不一致的 CatmullRom
*/
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  /* 资产清单：目的一是让加载集中，二是失败时能明确说出是哪一个 */
  const ASSETS = {
    fixed: { assetId: 'storage_fixed_roof_tank', dir: 'assets/storage/storage_fixed_roof_tank' },
    floating: { assetId: 'storage_floating_roof_tank', dir: 'assets/storage/storage_floating_roof_tank' },
    pump: { assetId: 'transfer_pump_set', dir: 'assets/storage/transfer_pump_set' },
  };
  const PUMP_CONNECTION_ID = 'conn_store_transfer_to_refinery';

  /* 储运区布局集中在一处：重排罐位时不会漏改标签/选择环/粒子曲线。 */
  const LAYOUT = { fixedX: -2.6, floatX: 3.4, pumpX: 9.2, pumpZ: 1.8 };

  /* 取景预设（局部坐标，调用时加 G.position 变成世界坐标）。
     分"全景"与三个近景，避免所有信息挤在一个机位里。 */
  const VIEWS = {
    wide: { cam: [-1.2 + 13.7, 10.2, 23.0], tgt: [-1.2, 3.0, 0] },
    /* 近景要能看到整台罐（含罐顶栏杆），且把罐推到左侧面板右方：
       目标点取罐体左侧 → 罐在画面偏右。 */
    fixed: { cam: [LAYOUT.fixedX + 5.0, 8.2, 11.2], tgt: [LAYOUT.fixedX - 2.2, 3.6, 0] },
    floating: { cam: [LAYOUT.floatX + 5.0, 8.2, 11.2], tgt: [LAYOUT.floatX - 2.2, 3.6, 0] },
    pump: { cam: [LAYOUT.pumpX + 4.6, 4.4, 7.6], tgt: [LAYOUT.pumpX - 1.4, 1.2, LAYOUT.pumpZ] },
  };

  let G = null, camera = null, baseScene = null, anchor = null;
  let pumpFlow = null, pumpRunning = false, pumpPaused = false, pumpMesh = null, pumpRing = null;
  let selectTag = null, selectedTankId = 'fixed_roof_tank';
  let routeInfo = null;
  const flows = [];
  let occluderMeshes = [];
  const built = {};
  const tanks = { fixed: null, floating: null };
  let assetsReady = null, usingFallback = false, assetError = null;
  let deckBindings = [];

  /* ---------------------------------------------------------------- 流动粒子 */
  function makeFlowInGroup(curve, color, count, speed, size, opacity) {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(size * 1.35, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity == null ? 0.9 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.userData.t = i / count;
      group.add(m);
      items.push(m);
    }
    G.add(group);
    const api = {
      speed: speed,
      update: function (dt) {
        items.forEach(function (m) {
          m.userData.t = (m.userData.t + dt * api.speed) % 1;
          m.position.copy(curve.getPoint(m.userData.t));
          m.scale.setScalar(0.6 + 0.6 * Math.sin(m.userData.t * Math.PI));
        });
      },
    };
    flows.push(api);
    return api;
  }

  /* ---------------------------------------------------------------- 结构模式 */
  function modeOf(key) {
    const t = tanks[key];
    return t ? t.mode : null;
  }

  function applyStructure(key, mode, record) {
    const t = tanks[key];
    if (!t || !t.handle) return;
    const rules = t.handle.manifest.structureModes;
    const rule = rules[mode];
    if (!rule) return;
    t.mode = mode;

    const show = new Set(rule.show || []);
    const hide = new Set(rule.hide || []);
    const ghost = new Set(rule.ghost || []);

    /* 先全部按 hide/show 定可见性，再对 ghost 集合改材质。
       材质已在加载时逐网格克隆，这里改不会波及其它网格（Phase 6 教训）。 */
    t.handle.indices.object3dByUid.forEach(function (obj, uid) {
      if (!obj.isMesh) return;
      if (hide.has(uid)) obj.visible = false;
      else if (show.has(uid)) obj.visible = true;
      else obj.visible = true;   // 未列出的附件默认可见（如螺栓、铭牌）
      if (ghost.has(uid)) {
        obj.visible = true;
        setGhost(obj, true);
      } else {
        setGhost(obj, false);
      }
    });

    if (record !== false && stage.deviceState) {
      stage.deviceState.set(t.objectId, { structure: mode }, 'level');
    }
    if (stage.setInteraction && record !== false) {
      stage.setInteraction('inspect_tank_structure', t.objectId, mode);
    }
  }

  const GHOST_OPACITY = 0.28;
  function setGhost(mesh, on) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(function (m) {
      if (!m) return;
      if (!m.userData.ghostOrig) {
        m.userData.ghostOrig = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      }
      const o = m.userData.ghostOrig;
      if (on) {
        m.transparent = true;
        m.opacity = Math.min(o.opacity == null ? 1 : o.opacity, GHOST_OPACITY);
        m.depthWrite = false;
      } else {
        m.transparent = o.transparent;
        m.opacity = o.opacity;
        m.depthWrite = o.depthWrite;
      }
      m.needsUpdate = true;
    });
  }

  /* ---------------------------------------------------------------- 液位驱动 */
  function tankMetrics(key) {
    const t = tanks[key];
    if (!t) return null;
    const b = t.handle.manifest.bounds;
    const baseKey = key === 'fixed' ? 'anchor_fixed_liquid' : 'anchor_floating_liquid';
    const baseAnchor = t.handle.indices.anchors.get(baseKey);
    const baseZ = baseAnchor ? baseAnchor.position[1] : 0;
    return {
      radius: Math.abs(b.max[0]) - 0.06,
      baseZ: baseZ,
      height: b.max[1] - baseZ,
    };
  }

  function applyLevel() {
    const k = level;
    Object.keys(tanks).forEach(function (key) {
      const t = tanks[key];
      if (!t) return;
      const m = tankMetrics(key);
      if (!m) return;
      const surfaceY = m.baseZ + m.height * k;

      /* 油面：本关自己的动态对象，不随资产走 */
      if (t.oil) {
        t.oil.scale.y = Math.max(0.01, k);
        t.oil.position.y = m.baseZ + (m.height * k) / 2;
        t.oil.visible = k > 0.015;
      }

      /* 外浮顶：浮盘总成跟随油面。固定顶罐没有这个总成，roof_cone 保持静止。 */
      if (t.deckAssembly) {
        t.deckAssembly.position.y = surfaceY - t.deckRestZ;
      }

    });

    /* 设备状态与资产加载解耦：液位是任务/状态机的事实，不能因为 GLB 还没到
       就不写（否则进关早期读 deviceState 会拿到 0，属于行为回归）。 */
    if (stage.deviceState) {
      stage.deviceState.set('fixed_roof_tank', { level: k }, 'level');
      stage.deviceState.set('floating_roof_tank', { level: k }, 'level');
    }

    /* 固定顶：液位越低，油气空间越大 —— 呼吸阀溢出粒子的速度随之变化 */
    if (built.fixed && built.fixed.ventFlow) built.fixed.ventFlow.speed = 0.05 + (1 - k) * 0.75;
    syncStorageUi();
  }

  /* ---------------------------------------------------------------- 资产加载 */
  function loadOne(cfg, onProgress) {
    return window.ModelLoader.load({
      glbUrl: cfg.dir + '/' + cfg.assetId + '.glb',
      manifestUrl: cfg.dir + '/' + cfg.assetId + '.manifest.json',
      onProgress: onProgress,
    });
  }

  function buildTankFromHandle(key, handle, x, z) {
    const objectId = key === 'fixed' ? 'fixed_roof_tank' : 'floating_roof_tank';
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.objectId = objectId;
    group.add(handle.root);
    G.add(group);

    /* 每个网格克隆材质：结构模式逐网格改材质，共享实例会互相覆盖 */
    handle.root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      o.material = Array.isArray(o.material) ? o.material.map(function (m) { return m.clone(); }) : o.material.clone();
      o.frustumCulled = false;
    });

    const m = (function () {
      const b = handle.manifest.bounds;
      const baseAnchor = handle.indices.anchors.get(
        key === 'fixed' ? 'anchor_fixed_liquid' : 'anchor_floating_liquid',
      );
      const baseZ = baseAnchor ? baseAnchor.position[1] : 0;
      return { radius: Math.abs(b.max[0]) - 0.06, baseZ: baseZ, height: b.max[1] - baseZ };
    })();

    /* 油面：半径贴合罐壁，高度按液位缩放 */
    /* 油面必须和剖切壳同一侧：整圈圆柱会把开口挡住，看起来像实心桶，
       真实半剖就白做了。用 thetaStart/thetaLength 取后半圈，带半圆盖。 */
    const oil = new THREE.Mesh(
      new THREE.CylinderGeometry(m.radius, m.radius, m.height, 48, 1, false, Math.PI / 2, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xd9a14a, toneMapped: false, side: THREE.DoubleSide }),
    );
    oil.position.y = m.baseZ + m.height * level / 2;
    oil.scale.y = Math.max(0.01, level);
    oil.name = key + '_oil';
    group.add(oil);

    /* 浮盘总成：把 manifest 声明为 floating_deck / rim_seal / guide 滚轮的节点
       收进一个 Group，统一按油面平移；坐标是烘焙的，所以组位移=目标Z-原始Z。 */
    let deckAssembly = null, deckRestZ = 0;
    if (key === 'floating') {
      const deckAnchor = handle.indices.anchors.get('anchor_floating_deck');
      deckRestZ = deckAnchor ? deckAnchor.position[1] : 0;
      deckAssembly = new THREE.Group();
      deckAssembly.name = 'deck_assembly';
      group.add(deckAssembly);
      deckBindings = [];
      handle.indices.object3dByUid.forEach(function (obj, uid) {
        const node = handle.manifest.nodes.find(function (n) { return n.nodeUid === uid; });
        if (!node) return;
        const isDeck = node.role === 'floating_deck' || node.role === 'rim_seal' ||
          (node.role === 'guide' && /roller/.test(node.semanticId));
        if (!isDeck) return;
        deckAssembly.attach(obj);
        deckBindings.push(node.semanticId);
      });
    }

    const tank = {
      key: key,
      objectId: objectId,
      handle: handle,
      group: group,
      oil: oil,
      deckAssembly: deckAssembly,
      deckRestZ: deckRestZ,
      mode: 'external',
      radius: m.radius,
      baseZ: m.baseZ,
      height: m.height,
      stats: handle.stats,
    };
    tanks[key] = tank;

    /* 选择环 */
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(m.radius + 0.35, 0.065, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xf0a22e, transparent: true, opacity: 0.98, depthWrite: false, depthTest: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.24;
    ring.renderOrder = 7;
    ring.visible = false;
    group.add(ring);
    tank.selRing = ring;

    applyStructure(key, 'external', false);
    return tank;
  }

  function buildPumpFromHandle(handle) {
    pumpMesh = new THREE.Group();
    pumpMesh.position.set(LAYOUT.pumpX, 0, LAYOUT.pumpZ);
    pumpMesh.userData.objectId = 'transfer_pump';
    pumpMesh.add(handle.root);
    handle.root.traverse(function (o) {
      if (o.isMesh && o.material) {
        o.material = Array.isArray(o.material) ? o.material.map(function (m) { return m.clone(); }) : o.material.clone();
      }
    });
    G.add(pumpMesh);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.0, 0.065, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xf0a22e, transparent: true, opacity: 0.98, depthWrite: false, depthTest: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(LAYOUT.pumpX, 0.18, LAYOUT.pumpZ);
    ring.renderOrder = 7;
    ring.visible = false;
    G.add(ring);
    pumpRing = ring;

    /* 泵组自身的排出管段（资产内真实存在的 pipe_spool）——只在这段里示意流动。
       跨装置管线必须来自 process-connections.json，未登记就不画。 */
    const spool = handle.manifest.nodes.find(function (n) { return n.semanticId === 'pipe_spool'; });
    if (spool) {
      const bound = new THREE.Box3().setFromObject(handle.indices.object3dByUid.get(spool.nodeUid));
      const cx = (bound.min.x + bound.max.x) / 2 + LAYOUT.pumpX;
      const cz = (bound.min.z + bound.max.z) / 2 + LAYOUT.pumpZ;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cx, bound.min.y, cz),
        new THREE.Vector3(cx, (bound.min.y + bound.max.y) / 2, cz),
        new THREE.Vector3(cx, bound.max.y, cz),
      ]);
      pumpFlow = makeFlowInGroup(curve, 0x7fd6a8, 8, 0.28, 0.055, 0.8);
      pumpFlow.speed = 0;
    }
    return pumpMesh;
  }

  async function loadAssets() {
    if (!window.ModelLoader) throw new Error('ModelLoader 不可用');
    const progress = function (p) {
      if (hint && p && p.phase === 'download' && p.ratio != null) {
        hint.textContent = '正在加载储运资产 ' + Math.round(p.ratio * 100) + '%';
      }
    };
    const fixed = await loadOne(ASSETS.fixed, progress);
    const floating = await loadOne(ASSETS.floating, progress);
    const pump = await loadOne(ASSETS.pump, progress);
    return { fixed: fixed, floating: floating, pump: pump };
  }

  /* ---------------------------------------------------------------- 构建 */
  function build() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[2] || new THREE.Vector3(9, 0, -4);
    anchor = new THREE.Vector3(p.x, 0, p.z);

    G = new THREE.Group();
    G.position.copy(anchor);
    baseScene.add(G);
    if (window.__lvlGroup) window.__lvlGroup(2, G);

    const mSteel = new THREE.MeshStandardMaterial({ color: 0x2c3b46, roughness: 0.5, metalness: 0.7 });

    /* 地面 */
    const pad = new THREE.Mesh(new THREE.BoxGeometry(13, 0.12, 8.2),
      new THREE.MeshStandardMaterial({ color: 0x263239, roughness: 0.95 }));
    pad.position.y = 0.02;
    G.add(pad);

    /* 标签 */
    const l1 = window.__lvlLabel('固定顶罐', '#cfc8ba');
    l1.position.set(LAYOUT.fixedX, 8.3, 0);
    l1.scale.multiplyScalar(1.08);
    G.add(l1);
    const l2 = window.__lvlLabel('外浮顶罐', '#8fb6ad');
    l2.position.set(LAYOUT.floatX, 8.3, 0);
    l2.scale.multiplyScalar(1.08);
    G.add(l2);
    selectTag = window.__lvlLabel('已选', '#f0a22e');
    selectTag.scale.multiplyScalar(0.62);
    selectTag.visible = false;
    G.add(selectTag);

    /* 固定顶罐的呼吸阀溢出粒子（挂在关卡组上，随资产定位） */
    const ventCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(LAYOUT.fixedX + 0.95, 8.0, 0),
      new THREE.Vector3(LAYOUT.fixedX + 1.15, 8.7, 0.1),
      new THREE.Vector3(LAYOUT.fixedX + 0.85, 9.4, 0),
    ]);
    const ventFlow = makeFlowInGroup(ventCurve, 0xd8e2e8, 10, 0.25, 0.07, 0.55);
    built.fixed = { ventFlow: ventFlow };

    const pumpLabel = window.__lvlLabel('转输泵组', '#d8a24a');
    pumpLabel.position.set(LAYOUT.pumpX, 3.4, LAYOUT.pumpZ);
    pumpLabel.scale.multiplyScalar(1.0);
    G.add(pumpLabel);

    /* 资产异步加载：UI 立即可用，加载完成后接上模型 */
    assetsReady = loadAssets().then(function (handles) {
      buildTankFromHandle('fixed', handles.fixed, LAYOUT.fixedX, 0);
      buildTankFromHandle('floating', handles.floating, LAYOUT.floatX, 0);
      buildPumpFromHandle(handles.pump);
      G.updateMatrixWorld(true);

      applyStructure('fixed', 'half', false);
      applyStructure('floating', 'half', false);

      if (stage.deviceState) {
        stage.deviceState.bind('fixed_roof_tank', 'detail', tanks.fixed.group);
        stage.deviceState.bind('floating_roof_tank', 'detail', tanks.floating.group);
        stage.deviceState.bind('transfer_pump', 'detail', pumpMesh);
      }
      applyLevel();
      usingFallback = false;
      if (badge) badge.hidden = true;
      if (act) act.hidden = false;
      hint.textContent = storageHint();
      return handles;
    }).catch(function (err) {
      /* 资产不可用：明确标记，不静默用方块冒充 */
      usingFallback = true;
      assetError = (err && err.message) || String(err);
      console.warn('[L3] 储运资产加载失败：' + assetError);
      if (badge) {
        badge.hidden = false;
        badge.textContent = '⚠ 储运 HG 资产未加载（' + assetError.slice(0, 40) + '…）';
        badge.title = assetError;
      }
      hint.textContent = '储运资产加载失败，仅保留液位与任务判定';
      if (act) act.hidden = false;
      applyLevel();
      return null;
    });

    /* 泵送路由只读连接注册表，不依赖 GLB，因此在 build 阶段就解析，
       让 UI 一进关就能显示"已登记/未登记"，而不是等资产加载完。 */
    resolvePumpRoute();
    G.updateMatrixWorld(true);
    return built;
  }

  /* ---------------------------------------------------------------- 泵送路径 */
  /* 优先级：
     1) process-connections.json 里登记的 connectionId（工艺连接，需 basis）
     2) 都没有 → 复用总览已有连廊的**同一条曲线几何**（只做世界→局部平移），
        绝不在这里新造控制点。
     两条路都不通才不画线，并如实说明。 */
  const OVERVIEW_ROUTE_ID = 'path_store_refine';

  function sampleLocalCurve(worldCurve, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(worldCurve.getPoint(i / n).clone().sub(G.position));
    return new THREE.CatmullRomCurve3(pts);
  }

  function resolvePumpRoute() {
    const reg = window.PETRO_CONNECTIONS;
    const conn = reg && typeof reg.get === 'function' ? reg.get(PUMP_CONNECTION_ID) : null;
    let curve = null, routeSource = null, pathId = null, note = '';

    if (conn) {
      try { curve = reg.resolveCurve ? reg.resolveCurve(PUMP_CONNECTION_ID) : null; } catch (e) { curve = null; }
      if (curve) {
        routeSource = 'process-connections';
        pathId = PUMP_CONNECTION_ID;
      } else {
        routeSource = 'process-connections-no-curve';
        note = '连接已登记但锚点无法解析（注册表当前只认单一 Manifest）';
      }
    }

    if (!curve) {
      const overview = stage.getRoute ? stage.getRoute(OVERVIEW_ROUTE_ID) : null;
      if (overview && overview.curve) {
        /* 直接对总览曲线采样，不引入任何新控制点 */
        curve = sampleLocalCurve(overview.curve, 48);
        routeSource = 'overview-corridor';
        pathId = OVERVIEW_ROUTE_ID;
        note = '复用总览 ' + OVERVIEW_ROUTE_ID + ' 连廊的同一路径（区域连廊，非工艺连接，未登记工艺依据）';
      }
    }

    const routeEl = ui.querySelector('#l3-route');
    if (!curve) {
      routeInfo = {
        connectionId: PUMP_CONNECTION_ID,
        routeSource: routeSource || 'unregistered',
        status: 'blocked',
        pipe: null,
        note: note || '无可用路径',
      };
      if (routeEl) routeEl.textContent = '泵送：无可用路径（' + (note || '未登记工艺连接') + '）';
      return null;
    }

    const pipe = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 60, 0.07, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x8b6b3f, roughness: 0.5, metalness: 0.4 }),
    );
    pipe.name = 'store_transfer_pipe';
    pipe.userData.connectionId = conn ? PUMP_CONNECTION_ID : null;
    pipe.userData.pathId = pathId;
    G.add(pipe);

    pumpFlow = makeFlowInGroup(curve, 0x7fd6a8, 12, 0.28, 0.06, 0.8);
    pumpFlow.speed = 0;

    const startLocal = curve.getPoint(0);
    const endLocal = curve.getPoint(1);
    const endWorld = endLocal.clone().add(G.position);

    /* 「终点与总览一致」用世界坐标里对总览 anchor 的误差证明，不用自证 */
    let endError = null;
    const overview = stage.getRoute ? stage.getRoute(OVERVIEW_ROUTE_ID) : null;
    if (overview && overview.end) endError = endWorld.distanceTo(overview.end);

    routeInfo = {
      connectionId: conn ? PUMP_CONNECTION_ID : null,
      requestedConnectionId: PUMP_CONNECTION_ID,
      routeSource: routeSource,
      status: conn ? 'ok' : 'unregistered-basis',
      pathId: pathId,
      pipe: pipe.name,
      reusedOverviewGeometry: routeSource === 'overview-corridor',
      start: startLocal.toArray(),
      end: endLocal.toArray(),
      startWorld: startLocal.clone().add(G.position).toArray(),
      endWorld: endWorld.toArray(),
      endError: endError,
      note: note,
    };

    if (routeEl) {
      routeEl.textContent = routeSource === 'overview-corridor'
        ? '泵送：沿总览 ' + OVERVIEW_ROUTE_ID + ' 同一路径（未登记工艺依据，终点一致 Δ' + (endError == null ? '?' : endError.toFixed(3)) + '）'
        : '泵送：工艺连接 ' + PUMP_CONNECTION_ID + '（已登记）';
    }
    return routeInfo;
  }

  /* ---------------------------------------------------------------- 相机 */
  let flyHandle = null;
  function isFiniteVec(v) {
    return !!v && isFinite(v.x) && isFinite(v.y) && isFinite(v.z);
  }

  function fly(from, fromT, to, toT, dur, done) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.copy(to); camera.lookAt(toT); if (typeof done === 'function') done(); return;
    }
    /* 守卫：lerpVectors 遇到 NaN 会把相机永久写成 NaN（画面冻结、四张截图字节相同）。
       这里先判定，坏值直接落位到目标，并记录是哪个参数坏了。 */
    if (![from, fromT, to, toT].every(isFiniteVec)) {
      console.warn('[L3] fly 收到非有限坐标，已跳过插值并直接落位', {
        from: isFiniteVec(from), fromT: isFiniteVec(fromT),
        to: isFiniteVec(to), toT: isFiniteVec(toT),
      });
      if (isFiniteVec(to)) camera.position.copy(to);
      if (isFiniteVec(toT)) camera.lookAt(toT);
      if (typeof done === 'function') done();
      return;
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

  let running = false, lastT = performance.now();
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!stage.isLevel()) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    flows.forEach(function (f) { f.update(dt); });
  }

  /* ---------------------------------------------------------------- 状态 */
  let level = 0.02;
  let completed = false;
  let observedTanks = { fixed_roof_tank: false, floating_roof_tank: false };

  /* ---------------------------------------------------------------- UI */
  const ui = document.createElement('div');
  ui.className = 'lvl';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">03 / 05</span><b>储运 · 浮顶罐</b><span class="lvl__hint" id="l3-hint">镜头正在靠近罐区…</span></div>',
    '<div class="lvl__act lvl2" id="l3-act" hidden>',
    '<div class="lvl2__head"><div><span class="lvl2__eyebrow">储运操作</span><b>选设备，再调液位</b></div><span class="lvl2__state" id="l3-state">固定顶罐</span></div>',
    '<p class="lvl2__lede">两个罐装同样的油。拖动液位，比较固定顶与外浮顶的油气空间。</p>',
    '<div class="lvl2__step">',
    '<div class="lvl2__stephead"><span class="lvl2__num">1</span><b>选择设备</b><span class="lvl2__stepnote">点按钮，或点场景标签</span></div>',
    '<div class="lvl__btns lvl2__choices" role="group" aria-label="选择设备"><button type="button" class="lvl__btn" id="l3-fixed" aria-pressed="true">固定顶罐</button><button type="button" class="lvl__btn" id="l3-float" aria-pressed="false">外浮顶罐</button><button type="button" class="lvl__btn" id="l3-pump" aria-pressed="false">转输泵组</button></div>',
    '</div>',
    '<div class="lvl2__step">',
    '<div class="lvl2__stephead"><span class="lvl2__num">2</span><b>调节液位</b><span class="lvl2__stepnote">拖动滑块</span></div>',
    '<div class="lvl__row"><input type="range" min="0" max="100" value="2" id="l3-level" aria-label="液位"><b id="l3-pct">2%</b></div>',
    '<div class="lvl__out"><span id="l3-space">油气空间 98%</span></div>',
    '</div>',
    '<details class="lvl2__more" id="l3-more"><summary>演示与结构</summary><div class="lvl2__tools">',
    '<div class="lvl2__toolrow"><span class="lvl2__tool-label">取景</span><button type="button" class="lvl__btn" id="l3-view-wide" aria-pressed="true">全景</button><button type="button" class="lvl__btn" id="l3-view-fixed" aria-pressed="false">固定顶近景</button><button type="button" class="lvl__btn" id="l3-view-floating" aria-pressed="false">外浮顶近景</button><button type="button" class="lvl__btn" id="l3-view-pump" aria-pressed="false">泵组近景</button></div>',
    '<div class="lvl2__toolrow"><span class="lvl2__tool-label">结构</span><button type="button" class="lvl__btn" id="l3-cut" aria-pressed="true">恢复罐壁</button><span class="lvl2__stepnote" id="l3-cut-note">只作用于当前选中的罐</span></div>',
    '<div class="lvl2__toolrow"><span class="lvl2__tool-label">泵送</span><button type="button" class="lvl__btn" id="l3-pumpstart">启动泵送</button><button type="button" class="lvl__btn" id="l3-pumppause">暂停泵送</button><button type="button" class="lvl__btn" id="l3-pumpreplay">重播路径</button></div>',
    '<div class="lvl2__toolrow"><span class="lvl2__tool-label">资产</span><span class="lvl2__badge" id="l3-asset-badge" hidden></span></div>',
    '</div></details>',
    '<div class="lvl__out"><span id="l3-route">泵送路径：读取中…</span></div>',
    '</div>',
    '<button type="button" class="lvl__back" id="l3-back">返回总览</button>',
  ].join('');
  stage.viewport.appendChild(ui);

  const hint = ui.querySelector('#l3-hint');
  const stateEl = ui.querySelector('#l3-state');
  const act = ui.querySelector('#l3-act');
  const slider = ui.querySelector('#l3-level');
  const uiPct = ui.querySelector('#l3-pct');
  const uiSpace = ui.querySelector('#l3-space');
  const back = ui.querySelector('#l3-back');
  const cutBtn = ui.querySelector('#l3-cut');
  const cutNote = ui.querySelector('#l3-cut-note');
  const badge = ui.querySelector('#l3-asset-badge');
  const pumpStart = ui.querySelector('#l3-pumpstart');
  const pumpPause = ui.querySelector('#l3-pumppause');
  const pumpReplay = ui.querySelector('#l3-pumpreplay');

  function selectedKey() {
    if (selectedTankId === 'fixed_roof_tank') return 'fixed';
    if (selectedTankId === 'floating_roof_tank') return 'floating';
    return null;
  }

  function selectTank(id) {
    selectedTankId = id;
    if (id === 'fixed_roof_tank' || id === 'floating_roof_tank') observedTanks[id] = true;
    if (stage.setContextObject) stage.setContextObject(id, 'storage');
    if (stage.deviceState) stage.deviceState.select(id);
    if (tanks.fixed && tanks.fixed.selRing) tanks.fixed.selRing.visible = id === 'fixed_roof_tank';
    if (tanks.floating && tanks.floating.selRing) tanks.floating.selRing.visible = id === 'floating_roof_tank';
    if (pumpRing) pumpRing.visible = id === 'transfer_pump';
    if (selectTag) {
      selectTag.visible = true;
      if (id === 'fixed_roof_tank') selectTag.position.set(LAYOUT.fixedX, 9.05, 0);
      else if (id === 'floating_roof_tank') selectTag.position.set(LAYOUT.floatX, 9.05, 0);
      else selectTag.position.set(LAYOUT.pumpX, 4.15, LAYOUT.pumpZ);
    }
    if (stage.setInteraction) stage.setInteraction('inspect_tank_structure', id, '罐型');
    [['fixed_roof_tank', '#l3-fixed'], ['floating_roof_tank', '#l3-float'], ['transfer_pump', '#l3-pump']]
      .forEach(function (pair) {
        const btn = ui.querySelector(pair[1]);
        if (btn) btn.setAttribute('aria-pressed', String(pair[0] === id));
      });
    if (id === 'transfer_pump') hint.textContent = '转输泵组 · 把油相送往炼化入口';
    else if (id === 'fixed_roof_tank') hint.textContent = '固定顶罐 · 油气空间随液位变化';
    else hint.textContent = '外浮顶罐 · 浮盘随液面升降';
    syncStorageUi();
    if (level >= 0.70 && !completed) complete();
  }

  function syncStorageUi() {
    if (!slider) return;
    slider.value = String(Math.round(level * 100));
    uiPct.textContent = Math.round(level * 100) + '%';
    if (selectedTankId === 'floating_roof_tank') {
      uiSpace.textContent = '油气空间 约 1%（边缘密封残余，示意）';
      uiSpace.style.color = '#7fd6a8';
    } else if (selectedTankId === 'fixed_roof_tank') {
      const space = Math.round((1 - level) * 100);
      uiSpace.textContent = '油气空间 ' + space + '%（顶部气相，示意）';
      uiSpace.style.color = space > 55 ? '#ff8a5c' : space > 25 ? '#f0a22e' : '#7fd6a8';
    } else {
      uiSpace.textContent = '油气空间 —（泵组不适用）';
      uiSpace.style.color = '#a9bac2';
    }
    const names = { fixed_roof_tank: '固定顶罐', floating_roof_tank: '外浮顶罐', transfer_pump: '转输泵组' };
    if (stateEl) stateEl.textContent = names[selectedTankId] || '固定顶罐';

    const key = selectedKey();
    const m = key ? modeOf(key) : null;
    cutBtn.hidden = !key;
    if (cutNote) cutNote.hidden = !key;
    if (key) {
      const isHalf = m === 'half' || m === 'ghost';
      cutBtn.textContent = isHalf ? '恢复罐壁' : '罐体剖面';
      cutBtn.setAttribute('aria-pressed', String(isHalf));
      if (cutNote) cutNote.textContent = (key === 'fixed' ? '固定顶罐' : '外浮顶罐') + '当前：' + m;
    }
    if (badge && !usingFallback) badge.hidden = true;
  }

  function storageHint() {
    if (pumpRunning) return '泵送中 · 沿管线追踪到下一环节';
    if (pumpPaused) return '泵送已暂停 · 可重播';
    return selectedTankId === 'floating_roof_tank'
      ? '外浮顶罐 · 浮盘随液面升降'
      : '固定顶罐 · 油气空间随液位变化';
  }

  ['wide', 'fixed', 'floating', 'pump'].forEach(function (v) {
    const btn = ui.querySelector('#l3-view-' + v);
    if (btn) btn.addEventListener('click', function () { applyView(v); });
  });

  cutBtn.addEventListener('click', function () {
    const key = selectedKey();
    if (!key) return;
    const cur = modeOf(key);
    /* 只改当前选中的这个罐，另一个罐的状态保持不变 */
    if (cur === 'external') applyStructure(key, 'half', true);
    else if (cur === 'half') applyStructure(key, 'ghost', true);
    else applyStructure(key, 'external', true);
    syncStorageUi();
  });

  pumpStart.addEventListener('click', function () {
    pumpRunning = true; pumpPaused = false;
    if (pumpFlow) pumpFlow.speed = 0.3;
    if (stage.deviceState) stage.deviceState.set('transfer_pump', { animation: 'running' }, 'level');
    if (stage.setInteraction) stage.setInteraction('start_pump', 'transfer_pump', '运行');
    hint.textContent = storageHint();
  });
  pumpPause.addEventListener('click', function () {
    pumpRunning = false; pumpPaused = true;
    if (pumpFlow) pumpFlow.speed = 0;
    if (stage.deviceState) stage.deviceState.set('transfer_pump', { animation: 'paused' }, 'level');
    if (stage.setInteraction) stage.setInteraction('pause_pump', 'transfer_pump', '暂停');
    hint.textContent = storageHint();
  });
  pumpReplay.addEventListener('click', function () {
    pumpRunning = true; pumpPaused = false;
    if (pumpFlow) pumpFlow.speed = 0.3;
    if (stage.deviceState) stage.deviceState.set('transfer_pump', { animation: 'running' }, 'level');
    if (stage.setInteraction) stage.setInteraction('replay_pump', 'transfer_pump', '重播');
    hint.textContent = '泵送路径重播';
  });

  slider.addEventListener('input', function () {
    level = +slider.value / 100;
    if (stage.setInteraction) stage.setInteraction('change_liquid_level', Math.round(level * 100), '百分比');
    applyLevel();
    if (level >= 0.70 && !completed) complete();
    else if (level < 0.70) hint.textContent = storageHint();
  });

  function complete() {
    completed = true;
    ui.classList.add('done');
    const fixedSpace = Math.round((1 - level) * 100);
    hint.textContent = '固定顶仍有约 ' + fixedSpace + '% 顶部气相空间；外浮顶仅剩边缘密封残余，油气空间显著更小';
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '储运：固定顶罐 vs 外浮顶罐' });
    log.push({ k: '动手', t: '调节液位，对比固定顶与外浮顶的油气空间', d: Math.round(level * 100) + '%' });
    if (stage.setNodeDone) stage.setNodeDone(2, true);
    back.classList.add('pulse');
    back.textContent = '完成，返回总览 →';
  }

  /* ---------------------------------------------------------------- 取景 */
  function viewCam(id) {
    const v = VIEWS[id] || VIEWS.wide;
    return new THREE.Vector3(anchor.x + v.cam[0], v.cam[1], anchor.z + v.cam[2]);
  }
  function viewTgt(id) {
    const v = VIEWS[id] || VIEWS.wide;
    return new THREE.Vector3(anchor.x + v.tgt[0], v.tgt[1], anchor.z + v.tgt[2]);
  }
  let currentView = 'wide';
  function applyView(id, dur) {
    if (!VIEWS[id] || !camera) return false;
    currentView = id;
    const from = camera.position.clone();
    const fromT = new THREE.Vector3(anchor.x + (VIEWS[id] || VIEWS.wide).tgt[0], 2.0, anchor.z);
    const _dur = dur == null ? 1100 : dur;
    if (_dur <= 0) {
      /* 立即落位：不走插值（dur=0 会导致除零 NaN） */
      if (flyHandle) { cancelAnimationFrame(flyHandle); flyHandle = null; }
      camera.position.copy(viewCam(id));
      camera.lookAt(viewTgt(id));
    } else {
      fly(from, fromT, viewCam(id), viewTgt(id), _dur, null);
    }
    ['wide', 'fixed', 'floating', 'pump'].forEach(function (v) {
      const btn = ui.querySelector('#l3-view-' + v);
      if (btn) btn.setAttribute('aria-pressed', String(v === id));
    });
    if (stage.setInteraction) stage.setInteraction('change_view', id, '取景');
    return true;
  }

  /* ---------------------------------------------------------------- 进 / 出 */
  function ensureCamera() {
    if (!camera) camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    stage.renderer.localClippingEnabled = true;
    camera.aspect = (stage.viewport.clientWidth || 800) / (stage.viewport.clientHeight || 480);
    camera.updateProjectionMatrix();
  }

  function setStorageOccluders(hide) {
    if (!occluderMeshes.length) {
      window.__stage.baseScene.traverse(function (o) {
        if (!o.isMesh || !o.material || !o.material.color) return;
        const c = o.material.color.getHexString();
        if (c !== '4a4235' && c !== '6b5a3a' && c !== '1e1e18' && c !== '14140f' && c !== '3a3830' &&
            c !== '2a2822' && c !== '33312a' && c !== '22221b') return;
        if (!o.geometry) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
        const largeTerrain = sx > 10 && sz > 10;
        const slab = sy < 1.2 && sx > 5 && sz > 0.8 && b.max.y > 1.2;
        const darkSlab = c === '3a3830' || c === '2a2822' || c === '33312a';
        const stageWall = c === '14140f' && sx > 70 && sz > 6;
        const stageDeck = c === '2a2822' && sx > 8 && sz > 7 && b.min.y > 1.2 && b.max.y < 3.2;
        const stageBackdrop = c === '22221b' && sx > 70 && sz > 20;
        if (largeTerrain || (slab && darkSlab) || stageWall || stageDeck || stageBackdrop) occluderMeshes.push(o);
      });
    }
    if (hide) {
      function inLevelGroup(o) {
        let p = o;
        while (p) { if (p === G) return true; p = p.parent; }
        return false;
      }
      window.__stage.baseScene.traverse(function (o) {
        if (!o.isMesh || !o.visible || inLevelGroup(o)) return;
        const b = new THREE.Box3().setFromObject(o);
        const s = b.getSize(new THREE.Vector3());
        const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
        let keep = false, q = o;
        while (q) {
          if (/tank|pump|pipe|well|store/i.test(q.name || '')) { keep = true; break; }
          q = q.parent;
        }
        const crossing = s.y < 1.6 && s.x > 4 && s.z > 0.6 && b.max.y > 1.2 && b.min.y < 3.2 &&
            Math.abs(cx - anchor.x) < 9 && Math.abs(cz - anchor.z) < 8;
        const backdrop = !keep && b.min.y > 1.0;
        if (crossing || backdrop) {
          if (occluderMeshes.indexOf(o) < 0) occluderMeshes.push(o);
        }
      });
    }
    occluderMeshes.forEach(function (o) { o.visible = !hide; });
  }

  function setProcessLines(hide) {
    const root = window.__stage.baseScene.getObjectByName('processLines');
    if (root) root.visible = !hide;
  }

  function enter() {
    if (stage.isLevel()) return;
    if (!G) build();
    /* 每次重新进入储运关都从默认液位/泵送状态开始；不能把上一次的 100% 带进来。 */
    level = 0.02;
    pumpRunning = false;
    pumpPaused = false;
    completed = false;
    selectedTankId = 'fixed_roof_tank';
    observedTanks = { fixed_roof_tank: false, floating_roof_tank: false };
    if (pumpFlow) pumpFlow.speed = 0;
    if (slider) slider.value = '2';
    ensureCamera();
    applyLevel();

    const startPos = stage.camera.position.clone();
    const startT = new THREE.Vector3(anchor.x, 1.4, anchor.z);
    camera.position.copy(startPos);
    camera.lookAt(startT);

    stage.use(baseScene, camera);
    if (stage.setOverviewVisible) stage.setOverviewVisible(false);
    G.visible = true;
    setProcessLines(true);
    setStorageOccluders(true);

    ui.classList.remove('done');
    back.classList.remove('pulse');
    back.textContent = '返回总览';
    if (stage.setContextObject) stage.setContextObject(selectedTankId, 'storage');
    selectTank(selectedTankId);
    ui.classList.add('on');
    document.body.classList.add('in-level');
    syncStorageUi();
    hint.textContent = '镜头正在靠近罐区…';
    currentView = 'wide';
    ['wide', 'fixed', 'floating', 'pump'].forEach(function (v) {
      const btn = ui.querySelector('#l3-view-' + v);
      if (btn) btn.setAttribute('aria-pressed', String(v === 'wide'));
    });
    if (!running) { running = true; loop(); }

    fly(startPos, startT, viewCam('wide'), viewTgt('wide'), 1700, function () {
      hint.textContent = storageHint();
      act.hidden = false;
    });
  }

  function exit() {
    setProcessLines(false);
    act.hidden = true;
    ui.classList.remove('on', 'done');
    document.body.classList.remove('in-level');
    G.visible = false;
    setStorageOccluders(false);
    if (stage.setContextObject) stage.setContextObject(null, 'storage');
    if (stage.deviceState) stage.deviceState.select(null);
    /* 收尾必须无条件执行：之前退出偶发卡住 45s，根因是回调里任一步抛错就会
       跳过 stage.back()，isLevel 永远是 true。用 try/finally 把状态复位钉死。 */
    fly(camera.position.clone(), new THREE.Vector3(anchor.x, 2.6, anchor.z),
      new THREE.Vector3(anchor.x, 11, anchor.z + 20), new THREE.Vector3(0, 1.2, 0), 1500, function () {
        running = false;
        try {
          if (stage.setOverviewVisible) stage.setOverviewVisible(true);
          const seg = document.querySelector('#stages [data-stage="2"]');
          if (seg) seg.classList.add('done-level');
        } catch (e) {
          console.warn('[L3] exit 收尾异常（已吞掉，保证能回到总览）', e);
        } finally {
          stage.back();
        }
      });
  }

  back.onclick = exit;
  window.__lvlEntry(2, '进入 03 储运', enter);
  window.__l3 = {
    enter: enter,
    exit: exit,
    selectTank: selectTank,
    get routeInfo() { return routeInfo; },
    get lastInteraction() {
      return window.__sceneContext ? (window.__sceneContext.interaction || null) : null;
    },
    get cutMode() { const k = selectedKey(); return k ? (modeOf(k) === 'half' || modeOf(k) === 'ghost') : false; },
    structureModeOf: function (objectId) {
      if (objectId === 'fixed_roof_tank') return modeOf('fixed');
      if (objectId === 'floating_roof_tank') return modeOf('floating');
      return null;
    },
    setStructureMode: function (objectId, mode) {
      const key = objectId === 'fixed_roof_tank' ? 'fixed' : objectId === 'floating_roof_tank' ? 'floating' : null;
      if (!key || ['external', 'half', 'ghost'].indexOf(mode) < 0) return false;
      applyStructure(key, mode, true);
      syncStorageUi();
      return true;
    },
    get pumpRunning() { return pumpRunning; },
    get pumpPaused() { return pumpPaused; },
    get completed() { return completed; },
    get level() { return level; },
    get selectedTankId() { return selectedTankId; },
    get observedTanks() { return Object.assign({}, observedTanks); },
    get usingFallback() { return usingFallback; },
    get assetError() { return assetError; },
    get assetsReady() { return assetsReady; },
    get deckBindings() { return deckBindings.slice(); },
    probe: function () {
      /* E2E 用的只读探针：油面/浮盘/固定顶在某一液位下的世界坐标与可见性 */
      const out = { level: level, tanks: {} };
      Object.keys(tanks).forEach(function (key) {
        const t = tanks[key];
        if (!t) return;
        const oilY = t.oil ? t.oil.position.y : null;
        const oilTop = t.oil && t.oil.geometry ? t.oil.position.y + (t.oil.geometry.parameters.height * t.oil.scale.y) / 2 : null;
        const deckY = t.deckAssembly ? t.deckAssembly.position.y + t.deckRestZ : null;
        const roof = t.handle.indices.object3dByUid.get(
          (t.handle.manifest.nodes.find(function (n) { return n.semanticId === 'roof_cone'; }) || {}).nodeUid,
        );
        out.tanks[key] = {
          objectId: t.objectId,
          mode: t.mode,
          oilTop: oilTop,
          deckY: deckY,
          deckOffset: t.deckAssembly ? t.deckAssembly.position.y : null,
          roofY: roof ? roof.position.y : null,
          roofStatic: roof ? (roof.position.y === 0) : null,
          visibleMeshes: (function () {
            let n = 0;
            t.handle.root.traverse(function (o) { if (o.isMesh && o.visible) n++; });
            return n;
          })(),
          /* 按语义 ID 报可见性：结构模式断言必须比"身份"，不能只比数量 */
          vis: (function () {
            const want = ['shell', 'shell_cut', 'roof_cone', 'roof_rim', 'wind_girder',
                          'deck', 'rim_seal', 'guide_pole_1', 'nozzle_inlet'];
            const out = {};
            want.forEach(function (sid) {
              const node = t.handle.manifest.nodes.find(function (n) { return n.semanticId === sid; });
              if (!node) return;
              const obj = t.handle.indices.object3dByUid.get(node.nodeUid);
              out[sid] = obj ? { visible: obj.visible, opacity: (function () {
                const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                return m ? m.opacity : null;
              })() } : null;
            });
            return out;
          })(),
          totalMeshes: t.handle.stats.meshes,
          nodes: t.handle.stats.nodes,
          reconciled: t.handle.stats.reconciled,
        };
      });
      return out;
    },
    setView: function (id) { return applyView(id, 0); },
    get currentView() { return currentView; },
    cameraDistanceTo: function (id) {
      if (!camera) return null;
      return camera.position.distanceTo(viewTgt(id));
    },
    setLevel: function (pct) {
      if (!slider) return;
      slider.value = String(Math.max(0, Math.min(100, Number(pct) || 0)));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    },
    startPump: function () { if (pumpStart) pumpStart.click(); },
    pausePump: function () { if (pumpPause) pumpPause.click(); },
  };
})();
