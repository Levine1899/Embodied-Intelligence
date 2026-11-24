/* Phase 04 · 地下开采体验
 * 长在阶段 03 的同一个 Three.js 世界与 subsurface 区，不是独立 Demo。
 * Hero OBJ 由 tools/blender/build_underground_hero.py 生成；对象名/语义 ID 见
 * docs/phase-reports/evidence/phase-04/underground-asset-manifest.json。
 */
(function () {
  'use strict';

  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  const ASSET_OBJ = 'assets/underground/underground.obj';
  const ASSET_MTL = 'assets/underground/underground.mtl';
  const ASSET_OBJECT = 'underground_hero';

  const LAYERS = [
    { key: 'overburden', name: '上覆地层', object: 'geo_overburden', tone: '#7d654d', desc: '地表以下的沉积岩层，像盖子一样压在上方。这里只表达“层层叠置”的概念，厚度不是真实比例。' },
    { key: 'caprock', name: '盖层', object: 'geo_caprock', tone: '#73756d', desc: '致密、低渗透的岩层，可阻挡油气继续向上逸散；真实盖层是否有效还取决于连续性和封闭条件。' },
    { key: 'reservoir', name: '储层', object: 'geo_reservoir_layer', tone: '#a87a2d', desc: '有孔隙/裂缝、能容纳流体的岩层。油、气、水赋存在孔隙中，不是地下“油湖”。' },
    { key: 'basement', name: '基底', object: 'geo_basement', tone: '#3a4245', desc: '储层下方的致密岩层，通常不作为主要储集层；这里用深色表达剖面底部边界。' }
  ];

  const PARTS = [
    { key: 'casing', name: '套管', object: 'well_casing', desc: '钢制套管加固井壁，隔开松散地层；它不是“吸油管”，而是井筒的结构边界。' },
    { key: 'cement', name: '水泥环', object: 'well_cement', desc: '套管与井壁之间的水泥环封隔不同层位，减少层间窜流；真实施工还要做固井质量检测。' },
    { key: 'tubing', name: '油管', object: 'well_tubing', desc: '生产油管是把储层流体引到地面的通道；井口阀组再控制流出与压力。' },
    { key: 'perforation', name: '射孔段', object: 'well_perforation', desc: '在目标储层段射开套管/水泥环，让储层流体进入井筒；这里只表达“打开通道”的概念。' }
  ];

  const FLUID = {
    oil: { name: '油', color: 0xd8a24a, css: '#d8a24a' },
    gas: { name: '气', color: 0x8fd3c6, css: '#8fd3c6' },
    water: { name: '水', color: 0x6f9fc4, css: '#6f9fc4' }
  };

  let G = null, baseScene = null, anchor = null, camera = null, worldGroup = null;
  let surfaceApron = null, surfaceEndpoint = null, surfaceGround = null, surfaceGrid = null;
  let savedBackground = null;
  let levelLights = [];
  let assetRoot = null, assetLoaded = false, assetFailed = false;
  let layerMeshes = {}, partMeshes = {}, reservoirLens = null, wellheadMeshes = [];
  let poreGroup = null, poreDrops = [], poreFlow = null;
  let wellFlow = null, surfaceFlow = null, flowCurve = null;
  let convFlows = [], extractionRing = null, extractionAt = 0, extractionMarked = false, extractionStarted = false;
  let running = false, lastT = 0, flyHandle = null;
  let pressure = 0, paused = false, completed = false, clipped = true;
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  let selectedLayer = null, selectedPart = null, poreMode = false, highlightedLayer = null;
  let viewMode = 'block';
  let layerVisibility = { overburden: true, caprock: true, reservoir: true, basement: true };
  let originalVisibility = null;
  let down = null, dragged = false;
  let orbit = { target: new THREE.Vector3(), yaw: 0.36, pitch: 0.22, dist: 25 };
  let ui = null, hint = null, info = null, panel = null, legend = null;
  let autoPoreTimer = 0;
  let lastInteraction = null;

  function style() {
    if (document.getElementById('ug-style')) return;
    const s = document.createElement('style');
    s.id = 'ug-style';
    s.textContent = `
      .ug-left{position:absolute;left:14px;top:58px;width:286px;max-height:calc(100% - 100px);overflow:auto;pointer-events:auto;
        background:linear-gradient(180deg,rgba(8,17,24,.95),rgba(8,17,24,.86));border:1px solid #2a3d47;padding:12px 13px;z-index:3}
      .ug-kicker{font:600 10.5px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.13em;color:#8da2ad;text-transform:uppercase;margin-bottom:8px}
      .ug-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 9px}
      .ug-chip{font:600 11.5px/1 "Microsoft YaHei UI",sans-serif;color:#bfd0d7;background:#0c1a23;border:1px solid #304651;border-radius:999px;
        padding:6px 9px;cursor:pointer;pointer-events:auto}
      .ug-chip:hover{border-color:#e3ad58;color:#f2cf91}
      .ug-chip.on{border-color:#e3ad58;color:#f0bd6e;background:#1b1509}
      .ug-chip.off{opacity:.48;text-decoration:line-through}
      .ug-info{font-size:12.5px;line-height:1.7;color:#c7d3d8;border-top:1px solid #263a44;padding-top:9px;margin-top:3px}
      .ug-info b{color:#efc16e;font-size:13px}
      .ug-info p{margin:4px 0 0}
      .ug-info small{color:#86a0ac;font-size:11.5px}
      .ug-legend{display:none;gap:10px;flex-wrap:wrap;margin-top:9px;padding-top:8px;border-top:1px dashed #314650;font-size:11.5px;color:#b8c9d0}
      .ug-legend.on{display:flex}
      .ug-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:1px}
      .ug-controls{position:absolute;right:14px;top:58px;display:flex;flex-direction:column;gap:7px;pointer-events:auto;z-index:3}
      .ug-btn{font:600 12px/1 "Microsoft YaHei UI",sans-serif;color:#c9d6dc;background:rgba(11,22,32,.92);border:1px solid #334b56;
        padding:9px 11px;border-radius:2px;cursor:pointer;min-width:122px;text-align:left}
      .ug-btn:hover{border-color:#e3ad58;color:#f2cf91}
      .ug-btn[aria-pressed="true"]{border-color:#e3ad58;color:#f0bd6e;background:#1a1408}
      .ug-btn:disabled{opacity:.4;cursor:not-allowed}
      .ug-scale{font:11px/1.5 ui-monospace,Consolas,monospace;color:#89a1ab;background:rgba(8,17,24,.8);padding:6px 8px;border-left:2px solid #e3ad58;max-width:150px}
      .ug-readout{font:11.5px/1.5 "Microsoft YaHei UI",sans-serif;color:#adc0c8;border-top:1px solid #263a44;margin-top:8px;padding-top:7px}
      .ug-task{margin-top:10px;padding:10px 11px;border:1px solid #8a6a33;background:#1b1509;pointer-events:auto}
      .ug-task b{display:block;color:#f0c476;font-size:13px;margin-bottom:4px}
      .ug-task p{margin:0 0 8px;color:#c8d3d7;font-size:11.5px;line-height:1.65}
      .ug-task button{width:100%;border:1px solid #e3ad58;background:#2a1d0b;color:#f3c77d;padding:8px 10px;font:600 12.5px/1 "Microsoft YaHei UI",sans-serif;cursor:pointer}
      .ug-task button:hover{background:#3b2a10}
      .ug-tag{display:inline-block;border:1px solid #385561;color:#9fc0cc;border-radius:2px;padding:1px 5px;font-size:10.5px;margin-right:4px}
      .lvl.on #l1-act{position:static;left:auto;right:auto;bottom:auto;max-width:none;background:transparent;border:0;padding:10px 0 4px;margin-top:8px;border-top:1px solid #263a44}
      .lvl.on #l1-act p{font-size:12px;line-height:1.65}
      @media(max-width:900px){.ug-left{width:238px}.ug-controls{top:auto;bottom:108px}.ug-btn{min-width:104px}.lvl.on #l1-act{max-width:none}}
    `;
    document.head.appendChild(s);
  }

  function makeUI() {
    style();
    ui = document.createElement('div');
    ui.className = 'lvl';
    ui.innerHTML = [
      '<div class="lvl__bar"><span class="lvl__step">01 / 05</span><b>地下开采 · 地质剖面</b><span class="lvl__hint" id="l1-hint">镜头正在进入地下…</span></div>',
      '<div class="ug-left" id="l1-panel">',
      '  <div class="ug-kicker">地层 / 储层 / 井筒</div>',
      '  <div class="ug-chips" id="l1-layers" aria-label="地层显示切换"></div>',
      '  <div class="ug-chips" id="l1-parts" aria-label="井筒部件显示切换"></div>',
      '  <div class="ug-info" id="l1-info" hidden><b>先找到储层</b><p>点击剖面中的岩层、储层或井筒部件。标签和解释只在你选中时出现。</p><small>教学示意：不是真实油藏数据，也不是真实地质比例。</small></div>',
      '  <div class="ug-legend" id="l1-legend"><span><i class="ug-dot" style="background:#d8a24a"></i>油（示意）</span><span><i class="ug-dot" style="background:#8fd3c6"></i>气（示意）</span><span><i class="ug-dot" style="background:#6f9fc4"></i>水（示意）</span></div>',
      '  <div class="ug-readout" id="l1-readout" hidden>状态：总览剖面 · 流体静止</div>',
      '</div>',
      '<div class="ug-controls">',
      '  <button type="button" class="ug-btn" id="l1-up" hidden>沿井筒上行 ↑</button>',
      '  <button type="button" class="ug-btn" id="l1-pore">孔隙放大（示意）</button>',
      '  <button type="button" class="ug-btn" id="l1-well">井筒整体</button>',
      '  <button type="button" class="ug-btn" id="l1-perf">射孔井段</button>',
      '  <button type="button" class="ug-btn" id="l1-play" aria-pressed="false" hidden>播放流动</button>',
      '  <button type="button" class="ug-btn" id="l1-cut">显示完整地层</button>',
      '  <button type="button" class="ug-btn" id="l1-reset">重置观察</button>',
      '  <div class="ug-scale">地层/井筒 Hero<br>OBJ + Blender 源文件</div>',
      '</div>',
      '<div class="lvl__act" id="l1-act">',
      '  <div class="lvl__row"><input type="range" min="0" max="100" value="0" id="l1-press" aria-label="压力差示意（教学控制量）"><b id="l1-pct">0%</b></div>',
      '</div>',
      '<button type="button" class="lvl__back" id="l1-back">返回总览</button>'
    ].join('');
    stage.viewport.appendChild(ui);
    const actPanel = ui.querySelector('#l1-act');
    const leftPanel = ui.querySelector('#l1-panel');
    if (actPanel && leftPanel) leftPanel.appendChild(actPanel);

    hint = ui.querySelector('#l1-hint');
    info = ui.querySelector('#l1-info');
    panel = ui.querySelector('#l1-panel');
    legend = ui.querySelector('#l1-legend');
    const layers = ui.querySelector('#l1-layers');
    const parts = ui.querySelector('#l1-parts');
    const press = ui.querySelector('#l1-press');
    const pct = ui.querySelector('#l1-pct');
    const note = ui.querySelector('#l1-note');
    const back = ui.querySelector('#l1-back');

    LAYERS.forEach(function (layer) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ug-chip on';
      b.dataset.layer = layer.key;
      b.textContent = layer.name;
      b.setAttribute('aria-pressed', 'true');
      b.title = '显示/隐藏' + layer.name;
      b.onclick = function () { toggleLayer(layer.key); };
      layers.appendChild(b);
    });
    PARTS.forEach(function (part) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ug-chip on';
      b.dataset.part = part.key;
      b.textContent = part.name;
      b.setAttribute('aria-pressed', 'true');
      b.title = '显示/隐藏' + part.name;
      b.onclick = function () { togglePart(part.key); };
      parts.appendChild(b);
    });

    press.addEventListener('input', function () {
      pressure = +press.value;
      pct.textContent = pressure + '%';
      if (stage.setInteraction) stage.setInteraction('adjust_pressure', pressure, '示意百分比');
      lastInteraction = { actionId: 'adjust_pressure', value: pressure, unit: '示意百分比' };
      if (pressure >= 50) startExtraction();
      updatePressureUI();
    });
    back.onclick = exitLevel;

    ui.querySelector('#l1-up').onclick = traceUp;
    ui.querySelector('#l1-cut').onclick = function (e) {
      clipped = !clipped;
      applyClip();
      e.currentTarget.textContent = clipped ? '显示完整地层' : '剖切地层';
    };
    ui.querySelector('#l1-pore').onclick = function () { poreMode ? exitPore() : enterPore(); };
    ui.querySelector('#l1-well').onclick = function () { focusWellbore('whole'); };
    ui.querySelector('#l1-perf').onclick = function () { focusWellbore('perforation'); };
    ui.querySelector('#l1-play').onclick = function (e) {
      paused = !paused;
      e.currentTarget.setAttribute('aria-pressed', String(paused));
      e.currentTarget.textContent = paused ? '继续流动' : '暂停流动';
      setReadout();
    };
    ui.querySelector('#l1-reset').onclick = resetView;

    // raycast + free observation on the actual renderer.
    const canvas = stage.renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown, true);
    canvas.addEventListener('pointermove', onPointerMove, true);
    canvas.addEventListener('pointerup', onPointerUp, true);
    canvas.addEventListener('pointercancel', onPointerUp, true);
  canvas.addEventListener('contextmenu', function (e) { if (stage.isLevel()) e.preventDefault(); });
    canvas.addEventListener('wheel', onWheel, { passive: false, capture: true });
  }

  function setReadout() {
    const el = ui && ui.querySelector('#l1-readout');
    if (!el) return;
    const act = selectedLayer ? LAYERS.filter(function (x) { return x.key === selectedLayer; })[0] : null;
    const part = selectedPart ? PARTS.filter(function (x) { return x.key === selectedPart; })[0] : null;
    let s = '状态：';
    if (poreMode) s += '孔隙放大（教学示意）';
    else if (viewMode === 'surface') s += '地面井口 · 集输管线';
    else if (part) s += part.name + ' 结构查看';
    else if (selectedLayer) s += act ? act.name : selectedLayer;
    else s += '总览剖面';
    s += ' · ' + (paused ? '流动已暂停' : pressure > 0 ? '压差 ' + pressure + '%（示意）' : '流体静止');
    el.textContent = s;
  }

  function setInfo(title, body, extra) {
    const disclaimer = '教学示意：不是真实油藏数据、真实地质比例或数值模拟。';
    const hasDisclaimer = (body + (extra || '')).indexOf('教学示意') >= 0 || (body + (extra || '')).indexOf('不是真实') >= 0;
    info.innerHTML = '<b>' + title + '</b><p>' + body + '</p>' +
      (extra ? '<p><small>' + extra + '</small></p>' : '') +
      (hasDisclaimer ? '' : '<p><small>' + disclaimer + '</small></p>');
    setReadout();
  }

  function buildFlow(curve, count, color, speed, radius) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
    const geo = new THREE.SphereGeometry(radius || 0.055, 7, 5);
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const m = new THREE.Mesh(geo, mat);
      m.userData.t = i / count;
      group.add(m);
      items.push(m);
    }
    group.userData.speed = speed;
    group.userData.items = items;
    group.userData.curve = curve;
    group.userData.update = function (dt) {
      if (paused) return;
      items.forEach(function (m) {
        m.userData.t = (m.userData.t + dt * (group.userData.speed + pressure / 100 * 0.45)) % 1;
        m.position.copy(curve.getPoint(m.userData.t));
        m.scale.setScalar(0.7 + 0.4 * Math.sin(m.userData.t * Math.PI * 2));
      });
    };
    return group;
  }

  function buildProceduralFallback() {
    assetFailed = true;
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0x7d654d, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x73756d, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ color: 0xa87a2d, roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ color: 0x3a4245, roughness: 0.98 })
    ];
    const heights = [[0, -2.35], [-2.35, -4.45], [-4.45, -7.55], [-7.55, -12]];
    LAYERS.forEach(function (layer, i) {
      const h = heights[i][0] - heights[i][1];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(17.6, h, 11.6), mats[i]);
      mesh.position.y = heights[i][0] - h / 2;
      mesh.name = layer.object;
      mesh.userData.ugLayer = layer.key;
      G.add(mesh);
      layerMeshes[layer.key] = mesh;
    });
    const steel = new THREE.MeshStandardMaterial({ color: 0x68706b, roughness: 0.45, metalness: 0.7 });
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 8.2, 20), steel);
    casing.position.y = -3.0; casing.name = 'well_casing'; G.add(casing); partMeshes.casing = casing;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), steel);
    head.position.y = 0.72; head.name = 'wellhead_tree'; G.add(head); wellheadMeshes.push(head);
  }

  function loadAsset() {
    if (!window.ObjLite) { buildProceduralFallback(); return; }
    window.ObjLite.load(ASSET_OBJ, ASSET_MTL).then(function (root) {
      assetRoot = root;
      assetRoot.name = 'underground_hero';
      assetRoot.userData.assetId = ASSET_OBJECT;
      assetRoot.position.set(0, 0, 0);
      root.traverse(function (node) {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        node.frustumCulled = false;
        const name = node.name || '';
        LAYERS.forEach(function (layer) {
          if (name === layer.object) {
            node.userData.ugLayer = layer.key;
            layerMeshes[layer.key] = node;
          }
        });
        if (name === 'reservoir_lens') {
          reservoirLens = node;
          node.userData.ugLayer = 'reservoir_lens';
          node.userData.objectId = 'reservoir';
        }
        PARTS.forEach(function (part) {
          if (name === part.object || name.indexOf(part.object) === 0) {
            node.userData.ugPart = part.key;
            node.userData.objectId = 'wellbore';
            if (!partMeshes[part.key]) partMeshes[part.key] = [];
            partMeshes[part.key].push(node);
          }
        });
        if (name.indexOf('wellhead') === 0 || name === 'surface_pad') {
          node.userData.objectId = 'wellhead';
          if (name.indexOf('wellhead') === 0) wellheadMeshes.push(node);
        }
        if (name === 'well_flowline') node.userData.ugFlowline = true;
      });
      // Cement is deliberately translucent so casing/cement relationship is visible.
      (partMeshes.cement || []).forEach(function (m) {
        m.material.transparent = true;
        m.material.opacity = 0.52;
        m.material.depthWrite = false;
        m.renderOrder = 2;
      });
      G.add(assetRoot);
      var geologyProxy = new THREE.Object3D();
      geologyProxy.name = 'underground_geology_proxy';
      geologyProxy.position.set(0, -5.5, 0);
      G.add(geologyProxy);
      G.userData.geologyProxy = geologyProxy;
      assetLoaded = true;
      if (stage.isLevel() && !poreMode) setTimeout(function () { if (stage.isLevel() && !poreMode) enterPore(); }, 400);
      bindAssetState();
      applyClip();
      addSurfacePipe();
      updateLayerChips();
      updatePartChips();
      if (ui) {
        hint.textContent = '地下剖面 · 点击岩层、储层或井筒';
        setInfo('地下剖面已加载', '四层岩性、储层透镜和井筒在同一空间里。点击剖面岩层或右侧按钮逐层查看。', '资产来源：项目自制 Blender 4.5 / OBJ；语义见资产清单。');
      }
    }).catch(function () {
      buildProceduralFallback();
      if (ui) {
        hint.textContent = 'Hero 资产未加载，当前为备用剖面';
        setInfo('备用剖面', 'Hero OBJ 加载失败，页面保留可运行的程序化剖面；此状态不能作为资产门禁通过。', '请检查 assets/underground/underground.obj。');
      }
    });
  }

  function applyClip() {
    if (!stage.renderer) return;
    stage.renderer.localClippingEnabled = true;
    clipPlane.constant = anchor.z - 0.05;
    Object.keys(layerMeshes).forEach(function (key) {
      const m = layerMeshes[key];
      if (!m || !m.material) return;
      m.material.clippingPlanes = clipped ? [clipPlane] : [];
      m.material.clipShadows = true;
      m.material.side = THREE.DoubleSide;
      if (m.material.emissive) {
        m.material.emissive.setHex(0x1b1209);
        m.material.emissiveIntensity = 0.28;
      }
      m.material.needsUpdate = true;
    });
    if (reservoirLens && reservoirLens.material) {
      reservoirLens.material.clippingPlanes = clipped ? [clipPlane] : [];
      reservoirLens.material.side = THREE.DoubleSide;
      reservoirLens.material.needsUpdate = true;
    }
  }

  function bindAssetState() {
    if (!window.PETRO_DEVICE_STATE) return;
    const st = window.PETRO_DEVICE_STATE;
    if (G.userData.geologyProxy) st.bind('underground_geology', 'detail', G.userData.geologyProxy);
    if (reservoirLens) st.bind('reservoir', 'detail', reservoirLens);
    Object.keys(partMeshes).forEach(function (key) {
      partMeshes[key].forEach(function (m) { st.bind('wellbore', 'detail', m); });
    });
    wellheadMeshes.forEach(function (m) { st.bind('wellhead', 'detail', m); });
  }

  function addSurfacePipe() {
    const pts = [
      new THREE.Vector3(8.2, 0.55, -1.2),
      new THREE.Vector3(11.5, 0.35, -2.8),
      new THREE.Vector3(15.2, 0.25, -4.8),
      new THREE.Vector3(18.0, 0.2, -6.0)
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const pipe = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, 0.075, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x7b8075, roughness: 0.55, metalness: 0.55 })
    );
    pipe.name = 'surface_gathering_pipe';
    pipe.userData.ugSurfacePipe = true;
    G.add(pipe);
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x4d514b, roughness: 0.6, metalness: 0.55 });
    [2.0, 4.4, 6.8, 10.2, 13.8, 16.6].forEach(function (x, i) {
      const z = i < 3 ? -0.2 : -2.4 - i * 0.55;
      const h = Math.max(0.2, (i < 3 ? 0.52 : 0.35));
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), supportMat);
      post.position.set(x, h / 2, z);
      G.add(post);
    });
    const fl = buildFlow(curve, 12, 0xd8a24a, 0.12, 0.045);
    fl.name = 'surface_flow_particles';
    fl.visible = false;
    G.add(fl);
    surfaceFlow = fl;
    flowCurve = curve;
  }

  function buildSurfaceApron() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f3029, roughness: 0.98, metalness: 0.0 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(48, 34), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(6, -0.06, -2);
    plane.receiveShadow = true;
    plane.name = 'surface_apron';
    plane.visible = false;
    G.add(plane);
    surfaceApron = plane;

    const g = new THREE.Group();
    g.name = 'gathering_endpoint';
    g.position.set(18, 0.15, -6);
    const steel = new THREE.MeshStandardMaterial({ color: 0x666d63, roughness: 0.5, metalness: 0.65 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 1.4), steel);
    base.position.y = 0.12; g.add(base);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 10), steel);
    mast.position.y = 0.75; g.add(mast);
    const flange = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 8, 18), steel);
    flange.rotation.x = Math.PI / 2; flange.position.y = 1.35; g.add(flange);
    g.visible = false;
    G.add(g);
    surfaceEndpoint = g;
  }

  function showSurfaceScene() {
    layerVisibility = { overburden: false, caprock: false, reservoir: false, basement: false };
    applyLayerVisibility();
    updateLayerChips();
    if (surfaceApron) surfaceApron.visible = true;
    if (surfaceGround) surfaceGround.visible = true;
    if (surfaceGrid) surfaceGrid.visible = true;
    if (surfaceEndpoint) surfaceEndpoint.visible = true;
    if (surfaceFlow) surfaceFlow.visible = true;
    if (reservoirLens) reservoirLens.visible = false;
  }

  function hideSurfaceScene() {
    if (surfaceApron) surfaceApron.visible = false;
    if (surfaceGround) surfaceGround.visible = false;
    if (surfaceGrid) surfaceGrid.visible = false;
    if (surfaceEndpoint) surfaceEndpoint.visible = false;
    if (surfaceFlow) surfaceFlow.visible = false;
  }

  function buildPore() {
    poreGroup = new THREE.Group();
    poreGroup.name = 'pore_detail';
    poreGroup.position.set(0, -5.8, 1.1);
    poreGroup.visible = false;
    G.add(poreGroup);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e5a3e, roughness: 0.95 });
    const oilMat = new THREE.MeshBasicMaterial({ color: FLUID.oil.color });
    const gasMat = new THREE.MeshBasicMaterial({ color: FLUID.gas.color, transparent: true, opacity: 0.75 });
    const waterMat = new THREE.MeshBasicMaterial({ color: FLUID.water.color });
    const grainGeo = new THREE.IcosahedronGeometry(0.16, 0);
    for (let i = 0; i < 34; i += 1) {
      const g = new THREE.Mesh(grainGeo, rockMat);
      const a = i * 2.399;
      const r = 0.2 + (i % 7) * 0.18;
      g.position.set(Math.cos(a) * r * 2.1, Math.sin(a) * r * 0.9, Math.cos(a * 0.7) * r * 1.3);
      g.rotation.set(a, a * 1.3, a * 0.7);
      poreGroup.add(g);
    }
    ['oil', 'gas', 'water'].forEach(function (key, k) {
      const mat = k === 0 ? oilMat : k === 1 ? gasMat : waterMat;
      for (let i = 0; i < 10; i += 1) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(k === 1 ? 0.09 : 0.075, 8, 6), mat);
        const a = i * 2.1 + k;
        d.position.set(Math.cos(a) * (0.7 + (i % 4) * 0.28), Math.sin(a * 0.8) * 0.55, Math.sin(a) * 0.8);
        d.userData.base = d.position.clone();
        d.userData.phase = a;
        poreGroup.add(d);
        poreDrops.push(d);
      }
    });
    const upCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -2.65, 0),
      new THREE.Vector3(0.02, -0.6, 0.02),
      new THREE.Vector3(0, 1.4, 0),
      new THREE.Vector3(0, 2.65, 0)
    ]);
    poreFlow = buildFlow(upCurve, 16, 0xffc45f, 0.24, 0.09);
    poreFlow.name = 'pore_upflow';
    poreFlow.children.forEach(function (m) { m.material.depthTest = false; m.renderOrder = 4; });
    poreGroup.add(poreFlow);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(3.1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x8b6b3f, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
    );
    poreGroup.add(shell);
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(3.11, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0x9f7b46, wireframe: true, transparent: true, opacity: 0.18 })
    );
    poreGroup.add(wire);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.45, 0.035, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xe3ad58, transparent: true, opacity: 0.72 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    poreGroup.add(ring);
  }

  function buildWellFlow() {
    /* 抽取演示：储层两侧的油滴汇入射孔段，再沿井筒上行（V3 动画的可见版本）。 */
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -6.0, 0),
      new THREE.Vector3(0.05, -4.2, 0.02),
      new THREE.Vector3(0.03, -2.0, 0),
      new THREE.Vector3(0, 0.8, 0)
    ]);
    wellFlow = buildFlow(curve, 26, 0xffb347, 0.26, 0.07);
    wellFlow.name = 'wellbore_flow_particles';
    G.add(wellFlow);
    const c1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.8, -5.7, 0.8),
      new THREE.Vector3(-1.4, -5.35, 0.35),
      new THREE.Vector3(0, -5.2, 0)
    ]);
    const c2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.6, -5.5, -0.8),
      new THREE.Vector3(1.2, -5.25, -0.3),
      new THREE.Vector3(0, -5.2, 0)
    ]);
    convFlows = [buildFlow(c1, 9, 0xf7b24a, 0.16, 0.055), buildFlow(c2, 9, 0xf7b24a, 0.16, 0.055)];
    convFlows.forEach(function (f, i) { f.name = 'reservoir_inflow_' + i; G.add(f); });
    extractionRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.035, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xffc56a, transparent: true, opacity: 0.55, depthWrite: false })
    );
    extractionRing.rotation.x = Math.PI / 2;
    extractionRing.position.set(0, -5.2, 0);
    extractionRing.name = 'extraction_pulse';
    G.add(extractionRing);
  }

  function build() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[0] || new THREE.Vector3(-24, 0, 8);
    anchor = new THREE.Vector3(p.x, 0, p.z);
    G = new THREE.Group();
    G.name = 'underground-experience';
    G.position.copy(anchor);
    G.visible = false;
    baseScene.add(G);
    if (window.__lvlGroup) window.__lvlGroup(0, G);
    if (!savedBackground) savedBackground = baseScene.background;
    baseScene.background = new THREE.Color(0x0d1518);
    layerVisibility = { overburden: true, caprock: true, reservoir: true, basement: true };
    buildPore();
    buildWellFlow();
    buildSurfaceApron();
    loadAsset();
    orbit.target.set(0, -4.2, 0);
    return { G: G, anchor: anchor };
  }

  function ensureCamera() {
    if (!camera) camera = new THREE.PerspectiveCamera(42, 1, 0.05, 300);
    camera.aspect = (stage.viewport.clientWidth || 800) / (stage.viewport.clientHeight || 480);
    camera.updateProjectionMatrix();
  }

  function worldPoint(x, y, z) {
    return new THREE.Vector3(anchor.x + x, y, anchor.z + z);
  }

  function setOrbitFromCamera() {
    const off = camera.position.clone().sub(orbit.target);
    orbit.dist = Math.max(3, off.length());
    orbit.yaw = Math.atan2(off.x, off.z);
    orbit.pitch = Math.asin(Math.max(-0.9, Math.min(0.9, off.y / orbit.dist)));
  }

  function applyOrbit() {
    if (!camera) return;
    const cp = Math.cos(orbit.pitch);
    camera.position.set(
      orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist,
      orbit.target.y + Math.sin(orbit.pitch) * orbit.dist,
      orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist
    );
    camera.lookAt(orbit.target);
    camera.updateMatrixWorld();
  }

  function flyTo(position, target, duration, done) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(position); camera.lookAt(target); if (typeof done === 'function') done(); return; }
    if (!camera) return;
    if (flyHandle) cancelAnimationFrame(flyHandle);
    const from = camera.position.clone();
    const fromTarget = orbit.target.clone();
    const to = position.clone();
    const toTarget = target.clone();
    const t0 = performance.now();
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / duration);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(from, to, e);
      orbit.target.lerpVectors(fromTarget, toTarget, e);
      camera.lookAt(orbit.target);
      camera.updateMatrixWorld();
      if (k < 1) flyHandle = requestAnimationFrame(step);
      else {
        flyHandle = null;
        setOrbitFromCamera();
        if (done) done();
      }
    })();
  }

  function topView() {
    viewMode = 'block';
    flyTo(worldPoint(14, 9, 18), worldPoint(0, -4.5, 0), 900);
  }

  function resetView() {
    if (poreMode) exitPore();
    pressure = 0;
    completed = false;
    paused = false;
    const playBtn = ui && ui.querySelector('#l1-play');
    if (playBtn) { playBtn.textContent = '暂停流动'; playBtn.setAttribute('aria-pressed', 'false'); }
    ui && ui.classList.remove('done');
    const press = ui && ui.querySelector('#l1-press');
    if (press) press.value = 0;
    const pct = ui && ui.querySelector('#l1-pct');
    if (pct) pct.textContent = '0%';
    LAYERS.forEach(function (l) { layerVisibility[l.key] = true; });
    applyLayerVisibility();
    applyPartVisibilityAll(true);
    updateLayerChips();
    updatePartChips();
    hideSurfaceScene();
    clipped = true;
    applyClip();
    const cutBtn = ui && ui.querySelector('#l1-cut');
    if (cutBtn) cutBtn.textContent = '显示完整地层';
    selectedLayer = null;
    selectedPart = null;
    clearLayerHighlight();
    viewMode = 'block';
    if (stage.setContextObject) stage.setContextObject(null, 'subsurface');
    setInfo('总览剖面', '点击剖面中的岩层、储层或井筒部件，查看它们的关系。可用按钮逐层显示/隐藏。');
    topView();
    updatePressureUI();
  }

  function updateLayerChips() {
    if (!ui) return;
    ui.querySelectorAll('#l1-layers .ug-chip').forEach(function (b) {
      const key = b.dataset.layer;
      const on = key !== 'reservoir' ? layerVisibility[key] : (layerMeshes.reservoir && layerMeshes.reservoir.visible);
      b.classList.toggle('on', on);
      b.classList.toggle('off', !on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function updatePartChips() {
    if (!ui) return;
    ui.querySelectorAll('#l1-parts .ug-chip').forEach(function (b) {
      const key = b.dataset.part;
      const list = partMeshes[key] || [];
      const on = list.length ? list.every(function (m) { return m.visible; }) : false;
      b.classList.toggle('on', on);
      b.classList.toggle('off', !on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function applyLayerVisibility() {
    LAYERS.forEach(function (l) {
      const m = layerMeshes[l.key];
      if (m) m.visible = !!layerVisibility[l.key];
    });
    if (reservoirLens) reservoirLens.visible = !!layerVisibility.reservoir;
  }

  function toggleLayer(key) {
    if (poreMode) return;
    layerVisibility[key] = !layerVisibility[key];
    applyLayerVisibility();
    updateLayerChips();
    if (!layerVisibility[key] && selectedLayer === key) {
      selectedLayer = null;
      setInfo('逐层探索', '已隐藏「' + (LAYERS.filter(function (l) { return l.key === key; })[0].name) + '」。其他岩层和井筒仍可点击。');
    }
    lastInteraction = { actionId: 'toggle_layer', value: key, unit: '图层开关' };
    if (stage.setInteraction) stage.setInteraction('toggle_layer', key, '图层开关');
  }

  function applyPartVisibilityAll(v) {
    PARTS.forEach(function (p) {
      (partMeshes[p.key] || []).forEach(function (m) { m.visible = v; });
    });
    wellheadMeshes.forEach(function (m) { m.visible = v; });
    updatePartChips();
  }

  function togglePart(key) {
    if (poreMode) return;
    const list = partMeshes[key] || [];
    const currently = list.length ? list[0].visible : false;
    list.forEach(function (m) { m.visible = !currently; });
    updatePartChips();
    lastInteraction = { actionId: 'toggle_wellbore_part', value: key, unit: '部件开关' };
    if (stage.setInteraction) stage.setInteraction('toggle_wellbore_part', key, '部件开关');
    const p = PARTS.filter(function (x) { return x.key === key; })[0];
    if (p) setInfo(p.name, p.desc, currently ? '已隐藏该部件；显示后可继续选择。' : '部件已显示。');
  }

  function pick(clientX, clientY) {
    if (!assetLoaded || !G) return;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(G.children, true);
    for (let i = 0; i < hits.length; i += 1) {
      const o = hits[i].object;
      if (!o.visible) continue;
      if (o.userData.ugLayer) { selectLayer(o.userData.ugLayer); return; }
      if (o.userData.ugPart) { selectPart(o.userData.ugPart); return; }
      if (o === reservoirLens) { selectReservoir(); return; }
      if (o.userData.objectId === 'wellhead') { selectWellhead(); return; }
    }
  }

  function clearLayerHighlight() {
    if (highlightedLayer && layerMeshes[highlightedLayer]) {
      const m = layerMeshes[highlightedLayer];
      if (m.material && m.material.emissive) {
        m.material.emissive.setRGB(0, 0, 0);
        m.material.emissiveIntensity = 0;
      }
    }
    if (reservoirLens && reservoirLens.material && reservoirLens.material.emissive) {
      reservoirLens.material.emissive.setRGB(0, 0, 0);
      reservoirLens.material.emissiveIntensity = 0;
    }
    highlightedLayer = null;
    if (assetLoaded) applyClip();
  }

  function highlightLayer(key) {
    clearLayerHighlight();
    const m = layerMeshes[key];
    if (m && m.material && m.material.emissive) {
      m.material.emissive.setHex(0x6b3e12);
      m.material.emissiveIntensity = 0.34;
      highlightedLayer = key;
    }
    if (key === 'reservoir' && reservoirLens && reservoirLens.material && reservoirLens.material.emissive) {
      reservoirLens.material.emissive.setHex(0x6b3e12);
      reservoirLens.material.emissiveIntensity = 0.34;
    }
  }

  function selectLayer(key) {
    if (key === 'reservoir_lens' || key === 'reservoir') { selectReservoir(); return; }
    const layer = LAYERS.filter(function (l) { return l.key === key; })[0];
    if (!layer) return;
    selectedLayer = key;
    selectedPart = null;
    highlightLayer(key);
    legend.classList.remove('on');
    setInfo(layer.name, layer.desc, '选中语义：' + layer.object + ' · 可继续逐层隐藏/显示。');
    if (stage.setContextObject) stage.setContextObject('underground_geology', 'subsurface');
    if (stage.setInteraction) stage.setInteraction('inspect_layer', key, '教学图层');
    lastInteraction = { actionId: 'inspect_layer', value: key, unit: '教学图层' };
  }

  function selectReservoir() {
    selectedLayer = 'reservoir';
    selectedPart = null;
    highlightLayer('reservoir');
    legend.classList.add('on');
    setInfo('储层 · 孔隙与流体', '储层岩石有孔隙/裂缝，油、气、水赋存其中。颜色只是教学编码；孔隙大小和连通性会影响流动，但不等于真实产能。',
      '可点「孔隙放大（示意）」查看局部概念图；这不是实际岩心扫描。');
    if (stage.setContextObject) stage.setContextObject('reservoir', 'subsurface');
    if (stage.setInteraction) stage.setInteraction('inspect_reservoir', 'reservoir', '教学对象');
    lastInteraction = { actionId: 'inspect_reservoir', value: 'reservoir', unit: '教学对象' };
  }

  function selectPart(key) {
    const p = PARTS.filter(function (x) { return x.key === key; })[0];
    if (!p) return;
    selectedPart = key;
    selectedLayer = null;
    clearLayerHighlight();
    legend.classList.remove('on');
    setInfo(p.name, p.desc, '井筒对象 ID：wellbore · 井段：' + p.object);
    if (stage.setContextObject) stage.setContextObject('wellbore', 'subsurface');
    if (stage.setInteraction) stage.setInteraction('inspect_wellbore_part', key, '教学部件');
    lastInteraction = { actionId: 'inspect_wellbore_part', value: key, unit: '教学部件' };
  }

  function selectWellhead(silent) {
    selectedLayer = null;
    selectedPart = 'wellhead';
    clearLayerHighlight();
    legend.classList.remove('on');
    setInfo('井口 / 采油树', '井口阀组控制流出与压力，把产出物导入集输管线。井口与地下井筒是同一口井的两个位置，不是两个设备。',
      '地面管线终点接到集输处理区；阀门操作在阶段 05 继续。');
    if (stage.setContextObject) stage.setContextObject('wellhead', 'oilfield');
    if (!silent) {
      if (stage.setInteraction) stage.setInteraction('inspect_wellhead', 'wellhead', '教学设备');
      lastInteraction = { actionId: 'inspect_wellhead', value: 'wellhead', unit: '教学设备' };
    }
  }

  function focusWellbore(mode) {
    if (!assetLoaded) return;
    if (poreMode) exitPore();
    if (!clipped) {
      clipped = true;
      applyClip();
      const cutBtn = ui.querySelector('#l1-cut');
      if (cutBtn) cutBtn.textContent = '显示完整地层';
    }
    viewMode = mode === 'perforation' ? 'wellbore-local' : 'wellbore';
    if (mode === 'perforation') {
      selectPart('perforation');
      flyTo(worldPoint(4.6, -3.0, 7.8), worldPoint(0, -5.5, 0), 900);
      hint.textContent = '射孔井段 · 储层与井筒的连接';
    } else {
      selectPart('casing');
      flyTo(worldPoint(9, 2.4, 13.5), worldPoint(0, -3.2, 0), 900);
      hint.textContent = '井筒整体 · 从地表到储层';
    }
    setReadout();
  }

  function enterPore() {
    if (poreMode) return;
    if (!assetLoaded || !poreGroup) return;
    poreMode = true;
    clearLayerHighlight();
    originalVisibility = Object.assign({}, layerVisibility);
    LAYERS.forEach(function (l) { if (layerMeshes[l.key]) layerMeshes[l.key].visible = false; });
    if (reservoirLens) reservoirLens.visible = false;
    poreGroup.visible = true;
    applyExtractionProgress();
    selectedLayer = 'reservoir';
    selectedPart = null;
    legend.classList.add('on');
    setInfo('孔隙放大（教学示意）', '岩骨架之间的孔隙里可以赋存油、气、水。放大视图只表达概念，不是实际岩心扫描，也不是流场模拟。',
      '退出放大后恢复地层剖面。');
    flyTo(worldPoint(4.2, -4.0, 8.2), worldPoint(0, -5.8, 1.1), 900);
    ui.querySelector('#l1-pore').textContent = '退出孔隙放大';
    if (stage.setInteraction) stage.setInteraction('inspect_pores', 'reservoir', '教学示意');
    lastInteraction = { actionId: 'inspect_pores', value: 'reservoir', unit: '教学示意' };
    setReadout();
  }

  function exitPore() {
    if (!poreMode) return;
    poreMode = false;
    poreGroup.visible = false;
    if (originalVisibility) {
      layerVisibility = Object.assign({}, originalVisibility);
      applyLayerVisibility();
      updateLayerChips();
      originalVisibility = null;
    }
    ui.querySelector('#l1-pore').textContent = '孔隙放大（示意）';
    topView();
    setInfo('储层 · 孔隙与流体', '已退出局部放大。继续点击其他岩层或井筒部件，或沿井筒上行到地面。');
    setReadout();
  }

  function traceUp() {
    if (!assetLoaded) return;
    if (poreMode) exitPore();
    viewMode = 'surface';
    clearLayerHighlight();
    LAYERS.forEach(function (l) {
      if (layerMeshes[l.key] && (l.key === 'overburden' || l.key === 'caprock')) layerMeshes[l.key].visible = false;
    });
    if (reservoirLens) reservoirLens.visible = true;
    flyTo(worldPoint(10.5, 6.2, 19), worldPoint(5.4, 0.7, -2.2), 1500, function () {
      hint.textContent = '地面井口 · 产出物进入集输管线';
      showSurfaceScene();
      selectWellhead(true);
      if (!completed) {
        completed = true;
        ui.classList.add('done');
        stage.setNodeDone && stage.setNodeDone(0, true);
        const log = (window.__leadai && window.__leadai.ledger) || [];
        log.push({ k: '看', t: '地下开采：地层、储层与井筒' });
        log.push({ k: '动手', t: '沿井筒上行到井口', d: '同一口井 · 同一 objectId' });
      }
    });
    if (surfaceFlow) surfaceFlow.visible = false;
    if (stage.setInteraction) stage.setInteraction('trace_up_wellbore', 'wellhead', '教学动作');
    lastInteraction = { actionId: 'trace_up_wellbore', value: 'wellhead', unit: '教学动作' };
    setReadout();
  }

  function startExtraction() {
    extractionStarted = true;
    extractionAt = performance.now();
    extractionMarked = true;
    if (wellFlow) wellFlow.visible = true;
    if (extractionRing) extractionRing.visible = true;
    if (ui) hint.textContent = '抽取演示 · 油滴从孔隙进入井筒并上升';
    if (stage.setInteraction) stage.setInteraction('trace_up_wellbore', 'wellhead', '抽取动画');
    lastInteraction = { actionId: 'trace_up_wellbore', value: 'wellhead', unit: '抽取动画' };
    setReadout();
  }

  function applyExtractionProgress() {
    const p = Math.max(0, Math.min(1, pressure / 100));
    if (wellFlow) {
      wellFlow.visible = p > 0.001;
      wellFlow.userData.speed = 0.03 + p * 0.62;
    }
    convFlows.forEach(function (f) {
      f.visible = p > 0.001;
      f.userData.speed = 0.02 + p * 0.32;
    });
    if (extractionRing) extractionRing.visible = p > 0.001;
    if (poreFlow) {
      poreFlow.visible = p > 0.001;
      poreFlow.userData.speed = 0.04 + p * 0.62;
    }
    if (surfaceFlow) surfaceFlow.userData.speed = 0.1 + p * 0.35;
    /* 储层孔隙里的油/气/水颗粒随抽取进度减少；反向拖动会恢复。 */
    const visible = Math.ceil(poreDrops.length * (1 - p));
    poreDrops.forEach(function (d, i) { d.visible = i < visible; });
  }

  function updatePressureUI() {
    if (!ui) return;
    const note = ui.querySelector('#l1-note');
    if (note) {
      if (pressure < 25) note.textContent = '孔隙里的流体还没有明显运移';
      else if (pressure < 55) note.textContent = '示意流体开始向井筒方向移动';
      else if (pressure < 85) note.textContent = '更多流体向井筒方向移动（教学示意）';
      else note.textContent = '示意：压差推动流体向井筒流动；真实产能还受渗透性、流体性质、井底流压和开发方式影响';
    }
    applyExtractionProgress();
    setReadout();
  }

  function onPointerDown(e) {
    if (!stage.isLevel() || !ui.classList.contains('on')) return;
    if (flyHandle) { cancelAnimationFrame(flyHandle); flyHandle = null; }
    down = { x: e.clientX, y: e.clientY, button: e.button };
    dragged = false;
    e.stopPropagation();
  }
  function onPointerMove(e) {
    if (!down || !stage.isLevel()) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
    if (dragged) {
      window.__stageDragAt = performance.now();
      orbit.yaw -= dx * 0.006;
      orbit.pitch = Math.max(-0.4, Math.min(0.85, orbit.pitch + dy * 0.005));
      applyOrbit();
      down = { x: e.clientX, y: e.clientY, button: down.button };
      e.stopPropagation();
      e.preventDefault();
    }
  }
  function onPointerUp(e) {
    if (!down || !stage.isLevel()) return;
    const wasDragged = dragged;
    const button = down.button;
    down = null;
    e.stopPropagation();
    if (!wasDragged && button === 0) pick(e.clientX, e.clientY);
  }
  function onWheel(e) {
    if (!stage.isLevel()) return;
    if (flyHandle) { cancelAnimationFrame(flyHandle); flyHandle = null; }
    e.preventDefault();
    e.stopPropagation();
    orbit.dist = Math.max(5, Math.min(48, orbit.dist * (e.deltaY > 0 ? 1.08 : 0.92)));
    applyOrbit();
  }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!stage.isLevel()) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    if (!paused) {
      if (pressure > 0) {
        if (wellFlow) wellFlow.userData.update(dt);
        if (poreMode && poreFlow) poreFlow.userData.update(dt);
        convFlows.forEach(function (f) { f.userData.update(dt); });
      }
      if (extractionRing) {
        var pulse = 1 + 0.18 * Math.sin(now * 0.004);
        extractionRing.scale.setScalar(pulse);
        extractionRing.material.opacity = 0.32 + 0.22 * (0.5 + 0.5 * Math.sin(now * 0.004));
      }
      if (!extractionMarked && extractionStarted && extractionAt && now - extractionAt > 2600) {
        extractionMarked = true;
        if (stage.setInteraction) stage.setInteraction('trace_up_wellbore', 'wellhead', '抽取动画');
        lastInteraction = { actionId: 'trace_up_wellbore', value: 'wellhead', unit: '抽取动画' };
      }
      if (surfaceFlow && surfaceFlow.visible) surfaceFlow.userData.update(dt);
      if (poreMode) {
        poreDrops.forEach(function (d) {
          d.position.y = d.userData.base.y + Math.sin(now * 0.0012 + d.userData.phase) * 0.06;
          d.material.opacity = 0.72 + 0.2 * Math.sin(now * 0.002 + d.userData.phase);
        });
      }
    }
  }

  function schedulePoreOnEntry() {
    if (autoPoreTimer) clearTimeout(autoPoreTimer);
    autoPoreTimer = setTimeout(function () {
      autoPoreTimer = 0;
      if (stage.isLevel() && assetLoaded && !poreMode) enterPore();
    }, 1200);
  }

  function enterLevel() {
    if (stage.isLevel()) return;
    if (!G) build();
    ensureCamera();
    if (!savedBackground) savedBackground = baseScene.background;
    baseScene.background = new THREE.Color(0x0d1518);
    layerVisibility = { overburden: true, caprock: true, reservoir: true, basement: true };
    applyLayerVisibility();
    applyPartVisibilityAll(true);
    updateLayerChips();
    updatePartChips();
    pressure = 0;
    completed = false;
    paused = false;
    extractionAt = performance.now();
    extractionMarked = false;
    extractionStarted = false;
    viewMode = 'block';
    const press = ui.querySelector('#l1-press');
    if (press) press.value = 0;
    const pct = ui.querySelector('#l1-pct');
    if (pct) pct.textContent = '0%';
    const playBtn = ui.querySelector('#l1-play');
    if (playBtn) { playBtn.textContent = '暂停流动'; playBtn.setAttribute('aria-pressed', 'false'); }
    ui.classList.remove('done');
    updatePressureUI();
    selectedLayer = null;
    selectedPart = null;
    clearLayerHighlight();
    clipped = true;
    applyClip();
    const cutBtn = ui.querySelector('#l1-cut');
    if (cutBtn) cutBtn.textContent = '显示完整地层';
    hideSurfaceScene();
    G.visible = true;
    if (assetRoot) assetRoot.visible = true;
    const startPos = stage.camera.position.clone();
    const startTarget = new THREE.Vector3(anchor.x, 0, anchor.z);
    camera.position.copy(startPos);
    orbit.target.copy(startTarget);
    camera.lookAt(orbit.target);
    stage.use(baseScene, camera);
    if (stage.setContextObject) stage.setContextObject(null, 'subsurface');
    worldGroup = baseScene.children.filter(function (c) { return c.name === 'industry-sandbox'; })[0] || null;
    if (worldGroup) worldGroup.visible = false;
    if (!levelLights.length) {
      const fill = new THREE.DirectionalLight(0xffe3bd, 1.1);
      fill.position.set(anchor.x + 10, 15, anchor.z + 16);
      fill.target.position.set(anchor.x, -4, anchor.z);
      baseScene.add(fill);
      baseScene.add(fill.target);
      const rim = new THREE.HemisphereLight(0xcfe0e0, 0x1a2223, 0.45);
      baseScene.add(rim);
      const ambient = new THREE.AmbientLight(0xffe0b8, 0.55);
      baseScene.add(ambient);
      levelLights = [fill, fill.target, rim, ambient];
    }
    stage.setOverviewVisible && stage.setOverviewVisible(false);
    ui.classList.add('on');
    document.body.classList.add('in-level');
    hint.textContent = '镜头进入地下剖面…';
    if (!running) { running = true; lastT = performance.now(); loop(); }
    flyTo(worldPoint(14, 8.6, 18), worldPoint(0, -4.2, 0), 1500, function () {
      hint.textContent = '剖面总览 · 找到储层';
      setInfo('地下地质剖面', '四层岩性、储层透镜和井筒都在这一个空间里。点击剖面岩层，或使用左侧按钮逐层查看。',
        '教学示意：不是真实油藏数据，也不是真实地质比例。');
    });
    lastInteraction = null;
    schedulePoreOnEntry();
  }

  function exitLevel() {
    if (!G) return;
    if (autoPoreTimer) { clearTimeout(autoPoreTimer); autoPoreTimer = 0; }
    if (poreMode) exitPore();
    if (flyHandle) { cancelAnimationFrame(flyHandle); flyHandle = null; }
    ui.classList.remove('on', 'done');
    document.body.classList.remove('in-level');
    G.visible = false;
    hideSurfaceScene();
    if (worldGroup) worldGroup.visible = true;
    levelLights.forEach(function (o) { if (o.parent) o.parent.remove(o); });
    levelLights = [];
    stage.setOverviewVisible && stage.setOverviewVisible(true);
    if (window.PETRO_DEVICE_STATE) window.PETRO_DEVICE_STATE.select(null);
    if (stage.setContextObject) stage.setContextObject(null, null);
    running = false;
    extractionMarked = false;
    extractionStarted = false;
    extractionAt = 0;
    stage.back();
    const seg = document.querySelector('#stages [data-stage="0"]');
    if (seg) seg.classList.add('done-level');
  }

  function init() {
    makeUI();
    window.__lvlEntry(0, '进入 01 地下开采', enterLevel);
    window.__l1 = {
      enter: enterLevel,
      exit: exitLevel,
      get assetLoaded() { return assetLoaded; },
      get assetFailed() { return assetFailed; },
      get assetObject() { return ASSET_OBJECT; },
      get layers() { return Object.keys(layerMeshes); },
      get parts() { return Object.keys(partMeshes); },
      get poreMode() { return poreMode; },
      get pressure() { return pressure; },
      get paused() { return paused; },
      get extraction() { return { wellFlow: !!wellFlow && wellFlow.visible, inflows: convFlows.filter(function (f) { return f.visible; }).length, pulse: !!extractionRing && extractionRing.visible, started: extractionStarted, marked: extractionMarked, pressure: pressure, reservoirTotal: poreDrops.length, reservoirVisible: poreDrops.filter(function (d) { return d.visible; }).length, poreFlow: !!poreFlow && poreFlow.visible }; },
      get lastInteraction() { return lastInteraction; },
      get objectId() { return window.__sceneContext && window.__sceneContext.selectedObjectId; },
      get selected() { return selectedPart || selectedLayer || null; },
      get clipped() { return clipped; },
      get viewMode() { return viewMode; },
      get layerState() { return Object.assign({}, layerVisibility); },
      get layerVisible() { var out = {}; Object.keys(layerMeshes).forEach(function (k) { out[k] = !!(layerMeshes[k] && layerMeshes[k].visible); }); return out; },
      get partVisible() { var out = {}; Object.keys(partMeshes).forEach(function (k) { var l = partMeshes[k] || []; out[k] = l.length ? l.every(function (m) { return m.visible; }) : null; }); return out; },
      get cameraPosition() { return camera ? camera.position.toArray() : null; },
      get camera() { return camera; },
      selectLayer: selectLayer,
      selectReservoir: selectReservoir,
      selectWellhead: selectWellhead,
      selectPart: selectPart,
      enterPore: enterPore,
      exitPore: exitPore,
      traceUp: traceUp,
      focusWellbore: focusWellbore,
      toggleLayer: toggleLayer,
      togglePart: togglePart,
      setPressure: function (v) {
        var press = ui && ui.querySelector('#l1-press');
        if (!press) return;
        press.value = String(Math.max(0, Math.min(100, Number(v) || 0)));
        press.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
  }

  init();
})();
