/* 关卡 02｜地面处理 —— 同样长在 V2 的场景里
   在「处理设施」节点旁边做三相分离器与三个出口去向，镜头从总览推过去。
   点出口 → 点去向，送错变红退回；送对后开一条常流。 */
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null, camera = null, baseScene = null, anchor = null;
  let overviewSeparator = [];
  let sepTimers = [];
  let assetRoot = null, assetLoaded = false, assetFailed = false;
  let procShell = null, structMode = false, runningSep = false, pausedSep = false;
  let shellMats = [], externalShell = [], cutShell = [], internalMeshes = [], internalLabels = [], cutRim = null, phaseT = 0;
  const phaseFlows = [];
  const flows = [];

  function makeFlowInGroup(curve, color, count, speed, size) {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(size * 1.4, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
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
          m.scale.setScalar(0.75 + 0.45 * Math.sin(m.userData.t * Math.PI));
        });
      }
    };
    flows.push(api);
    return api;
  }

  function build() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[1] || new THREE.Vector3(-2, 0, -4);
    anchor = new THREE.Vector3(p.x, 0, p.z);

    G = new THREE.Group();
    G.position.copy(anchor);
    baseScene.add(G);
    if (window.__lvlGroup) window.__lvlGroup(1, G);
    procShell = new THREE.Group();
    G.add(procShell);

    const mSteel = new THREE.MeshStandardMaterial({ color: 0x2b3a45, roughness: 0.5, metalness: 0.7 });
    const mPipe = new THREE.MeshStandardMaterial({ color: 0x252420, roughness: 0.65, metalness: 0.5 });
    const gasMat = new THREE.MeshStandardMaterial({ color: 0x1f2a26, emissive: 0x9fd3c6, emissiveIntensity: 1.0, roughness: 0.4 });
    const oilMat = new THREE.MeshStandardMaterial({ color: 0x2a1c08, emissive: 0xd8a24a, emissiveIntensity: 1.0, roughness: 0.4 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x0d2338, emissive: 0x8fb6ad, emissiveIntensity: 0.9, roughness: 0.4 });

    /* 分离器 */
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 6.0, 26), mSteel);
    vessel.rotation.z = Math.PI / 2;
    vessel.position.set(0, 2.1, 0);
    procShell.add(vessel);
    const capL = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mSteel);
    capL.rotation.z = -Math.PI / 2; capL.position.set(-3.0, 2.1, 0); procShell.add(capL);
    const capR = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mSteel);
    capR.rotation.z = Math.PI / 2; capR.position.set(3.0, 2.1, 0); procShell.add(capR);
    [-1.6, 1.2].forEach(function (x) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.1, 1.5), mPipe);
      leg.position.set(x, 1.05, 0);
      procShell.add(leg);
    });

    /* 进口 */
    const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.6, 14), mPipe);
    inlet.rotation.z = Math.PI / 2;
    inlet.position.set(-4.4, 2.1, 0);
    procShell.add(inlet);
    const inletLabel = window.__lvlLabel('混合产出物', '#93a6b2');
    inletLabel.position.set(-4.9, 3.15, 0);
    inletLabel.scale.setScalar(0.82);
    G.add(inletLabel);

    /* 出口 */
    const OUTLETS = [
      { key: 'gas', name: '气', mat: gasMat, pos: [0, 3.1, 0], dir: 'up' },
      { key: 'oil', name: '油', mat: oilMat, pos: [2.0, 2.1, 1.0], dir: 'front' },
      { key: 'water', name: '水', mat: waterMat, pos: [-2.1, 1.5, 1.0], dir: 'front' }
    ];
    const pickables = [];

    OUTLETS.forEach(function (o) {
      const g = new THREE.Group();
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.66, 12), mPipe);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 8, 20), o.mat);
      if (o.dir === 'up') { neck.position.y = 0.33; ring.rotation.x = Math.PI / 2; ring.position.y = 0.68; }
      else if (o.dir === 'down') { neck.position.y = -0.33; ring.rotation.x = Math.PI / 2; ring.position.y = -0.68; }
      else { neck.rotation.x = Math.PI / 2; neck.position.z = 0.33; ring.position.z = 0.68; }
      g.add(neck); g.add(ring);
      g.position.set(o.pos[0], o.pos[1], o.pos[2]);
      G.add(g);
      o.group = g; o.ring = ring;

      const lb = window.__lvlLabel(o.name, o.key === 'gas' ? '#48d7f0' : o.key === 'oil' ? '#f0a22e' : '#5aa7d8');
      lb.position.set(
        o.pos[0] + (o.dir === 'front' ? 0 : -0.85),
        o.pos[1] + (o.dir === 'up' ? 0.95 : o.dir === 'down' ? -0.95 : 0),
        o.pos[2] + (o.dir === 'front' ? 1.0 : 0)
      );
      G.add(lb);

      const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.copy(g.position).add(new THREE.Vector3(
        o.dir === 'front' ? 0 : 0,
        o.dir === 'up' ? 0.6 : o.dir === 'down' ? -0.6 : 0,
        o.dir === 'front' ? 0.62 : 0
      ));
      proxy.userData.outlet = o.key;
      G.add(proxy);
      pickables.push(proxy);
    });

    /* 三个出口去向（几何仍为示意占位，不表示气/水都进罐） */
    const TANKS = [
      { key: 'gas', name: '气回收/处理', x: 8.0, z: -4.0, mat: gasMat },
      { key: 'oil', name: '油储罐', x: 9.6, z: 0.8, mat: oilMat },
      { key: 'water', name: '采出水处理', x: 8.2, z: 4.8, mat: waterMat }
    ];

    TANKS.forEach(function (t) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.5, 22), mSteel);
      body.position.set(t.x, 1.25, t.z);
      body.scale.setScalar(0.68);
      G.add(body);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.11, 0.06, 8, 26), t.mat);
      band.rotation.x = Math.PI / 2;
      band.position.set(t.x, 2.1, t.z);
      band.scale.setScalar(0.68);
      G.add(band);
      const top = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mSteel);
      top.position.set(t.x, 2.5, t.z);
      top.scale.setScalar(0.68);
      G.add(top);

      const lb = window.__lvlLabel(t.name, '#c3d1d6');
      lb.position.set(t.x, 3.55, t.z);
      lb.scale.setScalar(0.72);
      G.add(lb);

      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.1, 20), t.mat.clone());
      fill.material.emissiveIntensity = 0.5;
      fill.position.set(t.x, 0.18, t.z);
      fill.scale.set(0.68, 0.03, 0.68);
      G.add(fill);
      t.fill = fill;

      const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.0, 2.3), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.set(t.x, 1.5, t.z);
      proxy.userData.tank = t.key;
      G.add(proxy);
      pickables.push(proxy);
    });

    /* 进口常流 */
    const inletCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-5.8, 2.1, 0),
      new THREE.Vector3(-4.4, 2.1, 0),
      new THREE.Vector3(-3.1, 2.1, 0)
    ]);
    makeFlowInGroup(inletCurve, 0xffd27a, 9, 0.34, 0.055);

        loadHero();
    return { OUTLETS: OUTLETS, TANKS: TANKS, pickables: pickables };
  }


  /* ---------- Hero separator asset + internal structure ---------- */
  function bindAssetState() {
    if (!assetRoot) return;
    assetRoot.userData.objectId = 'three_phase_separator';
    assetRoot.userData.assetId = 'separator_three_phase';
    if (stage.deviceState) stage.deviceState.bind('three_phase_separator', 'detail', assetRoot);
  }

  function syncSeparatorState() {
    if (!stage.deviceState) return;
    var animation = runningSep ? 'running' : (pausedSep ? 'paused' : 'idle');
    stage.deviceState.set('three_phase_separator', {
      structure: structMode ? 'half' : 'external',
      animation: animation
    }, 'level');
  }

  function applyStructure(show, record) {
    hideOverviewSeparator();
    structMode = !!show;
    externalShell.forEach(function (m) {
      m.visible = true;
      if (m.material) {
        m.material.transparent = structMode;
        m.material.opacity = structMode ? 0.10 : 1;
        m.material.depthWrite = !structMode;
        m.material.side = THREE.DoubleSide;
        m.material.needsUpdate = true;
      }
    });
    /* Use a ghost shell in the web view: it keeps the vessel silhouette without
       hiding the cutaway internals. The exported half shell remains in the .blend. */
    cutShell.forEach(function (m) { m.visible = false; });
    internalMeshes.forEach(function (m) { m.visible = structMode; });
    internalLabels.forEach(function (l) { l.visible = structMode; });
    if (cutRim) cutRim.visible = structMode;
    phaseFlows.forEach(function (f) { f.tube.visible = structMode; f.group.visible = structMode && (runningSep || pausedSep); });
    var b = ui && ui.querySelector('#l2-structure');
    if (b) {
      b.textContent = structMode ? '恢复外壳' : '打开内部结构';
      b.setAttribute('aria-pressed', String(structMode));
    }
    syncUi();
    syncSeparatorState();
    if (record !== false && stage.setInteraction) {
      stage.setInteraction('inspect_separator_structure', structMode ? 'half' : 'external', '示意');
    }
    if (hint) hint.textContent = structMode ? '内部结构 · 油/水/气按密度与相态差异分离' : '外壳 · 点击出口观察去向';
  }

  function hideOverviewSeparator() {
    if (!stage.baseScene) return;
    var found = [];
    stage.baseScene.traverse(function (o) {
      if (o.isMesh && /^separator__/.test(o.name || '')) found.push(o);
    });
    found.forEach(function (o) {
      if (!o.parent) return;
      var rec = { object: o, parent: o.parent };
      overviewSeparator.push(rec);
      o.removeFromParent();
    });
  }

  function syncUi() {
    if (playBtn) {
      playBtn.textContent = runningSep ? '暂停分离' : (pausedSep ? '继续分离' : '启动分离');
      playBtn.setAttribute('aria-pressed', String(runningSep));
    }
    var b = ui && ui.querySelector('#l2-structure');
    if (b) {
      b.textContent = structMode ? '恢复外壳' : '打开内部结构';
      b.setAttribute('aria-pressed', String(structMode));
    }
  }

  function buildInternalLabels() {
    if (internalLabels.length) return;
    var defs = [
      ['气相空间', [0, 3.45, 0.95], '#9fd3c6'],
      ['油层', [-1.7, 2.35, 0.95], '#d8a24a'],
      ['水层', [1.55, 1.55, 0.95], '#5aa7d8'],
      ['堰板', [1.35, 2.85, 0.95], '#c9d6dc']
    ];
    defs.forEach(function (d) {
      var l = window.__lvlLabel(d[0], d[2]);
      l.position.set(d[1][0], d[1][1], d[1][2]);
      l.scale.setScalar(0.66);
      l.visible = false;
      G.add(l);
      internalLabels.push(l);
    });
  }

  function addPhasePath(name, points, color) {
    var curve = new THREE.CatmullRomCurve3(points.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }));
    var tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 36, 0.035, 6, false),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.7, depthWrite: false })
    );
    tube.name = 'sep_path_' + name;
    tube.visible = false;
    G.add(tube);
    var group = new THREE.Group();
    var count = 7;
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    var items = [];
    for (var i = 0; i < count; i += 1) {
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
      dot.userData.base = i / count;
      group.add(dot);
      items.push(dot);
    }
    group.visible = false;
    G.add(group);
    phaseFlows.push({ curve: curve, items: items, tube: tube, group: group, name: name });
  }

  function buildPhasePaths() {
    addPhasePath('gas', [[-2.4, 2.15, 0], [-0.4, 3.0, 0], [0, 4.1, 0]], 0x9fd3c6);
    addPhasePath('oil', [[-1.8, 2.1, 0], [1.6, 2.25, 0], [3.35, 2.1, 0.2]], 0xd8a24a);
    addPhasePath('water', [[-1.8, 2.0, 0], [1.0, 1.75, -0.35], [2.6, 1.9, -0.9]], 0x5aa7d8);
    phaseT = 0;
  }

  function loadHero() {
    if (!window.ObjLite) { assetFailed = true; return; }
    window.ObjLite.load('assets/separator/separator.obj?v=08', 'assets/separator/separator.mtl?v=08').then(function (root) {
      assetLoaded = true;
      assetRoot = root;
      root.name = 'separator_hero';
      root.userData.objectId = 'three_phase_separator';
      root.userData.assetId = 'separator_three_phase';
      G.add(root);
      hideOverviewSeparator();
      if (procShell) procShell.visible = false;
      internalMeshes = [];
      externalShell = [];
      cutShell = [];
      internalLabels = [];
      shellMats = [];
      cutRim = null;
      root.traverse(function (o) {
        if (!o.isMesh) return;
        var n = (o.name || '').toLowerCase();
        o.userData.objectId = 'three_phase_separator';
        if (n.indexOf('separator_internal') === 0) {
          internalMeshes.push(o);
          o.visible = false;
        }
        if (n === 'separator_shell' || n.indexOf('separator_head') === 0) {
          externalShell.push(o);
          shellMats.push(o.material);
        }
        if (n.indexOf('separator_cut_') === 0) {
          cutShell.push(o);
          o.visible = false;
          if (o.material) {
            o.material.side = THREE.DoubleSide;
            o.material.transparent = true;
            o.material.opacity = 0.26;
            o.material.depthWrite = false;
          }
        }
        if (n === 'separator_cutaway_rim') cutRim = o;
        if (n === 'separator_internal_gas' && o.material) {
          o.material.transparent = true;
          o.material.opacity = 0.42;
          o.material.depthWrite = false;
        }
      });
      bindAssetState();
      buildPhasePaths();
      buildInternalLabels();
      applyStructure(false, false);
      var b = ui && ui.querySelector('#l2-structure');
      if (b) b.disabled = false;
      if (ui) hint.textContent = '三相分离器 Hero · 可打开内部结构';
    }).catch(function () {
      assetFailed = true;
      if (ui) hint.textContent = '分离器 Hero 未加载，保留教学备用剖面';
    });
  }

  function startSeparation() {
    if (!assetLoaded) return;
    if (!structMode) applyStructure(true);
    runningSep = true;
    pausedSep = false;
    if (phaseT >= 1) phaseT = 0;
    syncSeparatorState();
    if (stage.setInteraction) stage.setInteraction('start_separation', 'started', '示意');
    syncUi();
    hint.textContent = '分离演示 · 气上浮 / 油水按密度分层';
  }

  function pauseSeparation() {
    runningSep = false;
    pausedSep = true;
    syncSeparatorState();
    if (stage.setInteraction) stage.setInteraction('pause_separation', 'paused', '示意');
    syncUi();
    hint.textContent = '已暂停 · 可单步或重播';
  }

  function stepSeparation() {
    if (!assetLoaded) return;
    if (!structMode) applyStructure(true, false);
    runningSep = false;
    pausedSep = true;
    phaseT = Math.min(1, phaseT + 0.12);
    syncSeparatorState();
    if (stage.setInteraction) stage.setInteraction('step_separation', 'step', '示意');
    syncUi();
    hint.textContent = '单步 · 观察相态在出口附近的去向';
  }

  function replaySeparation() {
    if (!assetLoaded) return;
    phaseT = 0;
    runningSep = true;
    pausedSep = false;
    syncSeparatorState();
    if (stage.setInteraction) stage.setInteraction('replay_separation', 'replay', '示意');
    syncUi();
    hint.textContent = '重播 · 气、油、水从同一进料分流';
  }


  const streams = {};
  function addStream(key) {
    if (streams[key] || !built) return;
    const o = built.OUTLETS.find(x => x.key === key);
    const t = built.TANKS.find(x => x.key === key);
    const from = new THREE.Vector3(o.pos[0], o.pos[1] + (o.dir === 'up' ? 0.7 : o.dir === 'down' ? -0.7 : 0), o.pos[2] + (o.dir === 'front' ? 0.75 : 0));
    const to = new THREE.Vector3(t.x, 2.15, t.z);
    const mid = new THREE.Vector3((from.x + to.x) / 2, Math.max(from.y, to.y) + 1.9, (from.z + to.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const color = key === 'gas' ? 0x9fd3c6 : key === 'oil' ? 0xd8a24a : 0x8fb6ad;
    streams[key] = makeFlowInGroup(curve, color, 12, 0.26, 0.07);
  }

  /* ---------- 相机 ---------- */
  let flyHandle = null;
  function fly(from, fromT, to, toT, dur, done) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(to); camera.lookAt(toT); if (typeof done === 'function') done(); return; }
    const t0 = performance.now();
    if (flyHandle) cancelAnimationFrame(flyHandle);
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = ease(k);
      camera.position.lerpVectors(from, to, e);
      const look = new THREE.Vector3().lerpVectors(fromT, toT, e);
      camera.lookAt(look);
      if (k < 1) flyHandle = requestAnimationFrame(step);
      else if (done) done();
    })();
  }

  let running = false;
  let lastT = performance.now();
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!stage.isLevel()) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    flows.forEach(function (f) { f.update(dt); });
    if (runningSep) phaseT = (phaseT + dt * 0.22) % 1;
    phaseFlows.forEach(function (f) {
      f.items.forEach(function (dot) {
        var t = (phaseT + dot.userData.base) % 1;
        dot.position.copy(f.curve.getPoint(t));
        dot.visible = structMode && (runningSep || pausedSep);
      });
      f.tube.visible = structMode;
      f.group.visible = structMode && (runningSep || pausedSep);
    });
  }

  /* ---------- UI ---------- */
  const ui = document.createElement('div');
  ui.className = 'lvl';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">02 / 05</span><b>地面处理 · 三相分离</b><span class="lvl__hint" id="l2-hint">镜头正在靠近分离器…</span></div>',
    '<div class="lvl__act lvl2" id="l2-act" hidden>',
    '<div class="lvl2__head"><div><span class="lvl2__eyebrow">三相分离操作</span><b>先选出口，再选去向</b></div><span class="lvl2__state" id="l2-note">未选择出口</span></div>',
    '<p class="lvl2__lede">井口出来的是<b>油、气、水混在一起</b>。按 1 → 2 两步完成。</p>',
    '<div class="lvl2__step">',
    '<div class="lvl2__stephead"><span class="lvl2__num">1</span><b>选择出口</b><span class="lvl2__stepnote">点按钮，或点场景标签</span></div>',
    '<div class="lvl__btns lvl2__choices" role="group" aria-label="选择出口"><button type="button" class="lvl__btn" data-outlet="gas" aria-pressed="false">气出口</button><button type="button" class="lvl__btn" data-outlet="oil" aria-pressed="false">油出口</button><button type="button" class="lvl__btn" data-outlet="water" aria-pressed="false">水出口</button></div>',
    '</div>',
    '<div class="lvl2__step">',
    '<div class="lvl2__stephead"><span class="lvl2__num">2</span><b>选择去向</b><span class="lvl2__stepnote">与出口匹配</span></div>',
    '<div class="lvl__btns lvl2__choices" role="group" aria-label="选择去向"><button type="button" class="lvl__btn" data-target="gas" aria-pressed="false" disabled>气回收/处理</button><button type="button" class="lvl__btn" data-target="oil" aria-pressed="false" disabled>油储罐</button><button type="button" class="lvl__btn" data-target="water" aria-pressed="false" disabled>采出水处理</button></div>',
    '</div>',
    '<details class="lvl2__more"><summary>演示与结构</summary><div class="lvl2__tools">',
    '<div class="lvl2__toolrow"><span class="lvl2__tool-label">结构</span><button type="button" class="lvl__btn" id="l2-structure" aria-pressed="false" disabled>打开内部结构</button></div>',
    '<div class="lvl2__toolrow"><span class="lvl2__tool-label">演示</span><button type="button" class="lvl__btn" id="l2-play">启动分离</button><button type="button" class="lvl__btn" id="l2-step">单步</button><button type="button" class="lvl__btn" id="l2-replay">重播</button></div>',
    '</div></details>',
    '<p class="lvl__dragtip">拖动画面空白处可旋转视角</p>',
    '</div>',
    '<button type="button" class="lvl__back" id="l2-back">返回总览</button>'
  ].join('');
  stage.viewport.appendChild(ui);

  const hint = ui.querySelector('#l2-hint');
  const act = ui.querySelector('#l2-act');
  const note = ui.querySelector('#l2-note');
  const back = ui.querySelector('#l2-back');
  const structureBtn = ui.querySelector('#l2-structure');
  const playBtn = ui.querySelector('#l2-play');
  const stepBtn = ui.querySelector('#l2-step');
  const replayBtn = ui.querySelector('#l2-replay');
  const outletBtns = Array.prototype.slice.call(ui.querySelectorAll('[data-outlet]'));
  const targetBtns = Array.prototype.slice.call(ui.querySelectorAll('[data-target]'));
  outletBtns.forEach(function (b) { b.addEventListener('click', function () { pickOutlet(b.getAttribute('data-outlet')); }); });
  targetBtns.forEach(function (b) { b.addEventListener('click', function () { assignTank(b.getAttribute('data-target')); }); });
  structureBtn.addEventListener('click', function () { applyStructure(!structMode); });
  playBtn.addEventListener('click', function () { if (runningSep) pauseSeparation(); else startSeparation(); });
  stepBtn.addEventListener('click', stepSeparation);
  replayBtn.addEventListener('click', replaySeparation);

  let built = null;
  let picked = null;
  let completed = false;
  const solved = { gas: false, oil: false, water: false };

  function pickOutlet(key) {
    picked = key;
    if (stage.setContextObject) stage.setContextObject('three_phase_separator', 'gathering');
    if (stage.setInteraction) stage.setInteraction('choose_outlet', key);
    built.OUTLETS.forEach(function (o) {
      o.ring.scale.setScalar(o.key === key ? 1.5 : 1);
      o.ring.material.emissiveIntensity = o.key === key ? 2.2 : 1.0;
    });
    outletBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-outlet') === key)); });
    targetBtns.forEach(function (b) { b.disabled = false; b.setAttribute('aria-pressed', 'false'); });
    const o = built.OUTLETS.find(x => x.key === key);
    note.classList.remove('is-on', 'is-ok', 'is-error');
    note.classList.add('is-on');
    note.textContent = '已选 ' + o.name + ' 出口';
  }

  function assignTank(key) {
    if (!picked) { note.classList.remove('is-on', 'is-ok', 'is-error'); note.textContent = '先选择出口'; return; }
    const o = built.OUTLETS.find(x => x.key === picked);
    const t = built.TANKS.find(x => x.key === key);
    const ok = picked === key;
    hint.textContent = ok ? '对了 · ' + o.name + ' → ' + t.name : '再看一眼：' + o.name + ' 不该进 ' + t.name;
    if (stage.setInteraction) stage.setInteraction('assign_outlet_target', picked + '>' + key, '示意', ok ? 'success' : 'error');

    /* 一次性输送的粒子，走完落位 */
    const from = new THREE.Vector3(o.pos[0], o.pos[1] + (o.dir === 'up' ? 0.7 : o.dir === 'down' ? -0.7 : 0), o.pos[2] + (o.dir === 'front' ? 0.75 : 0));
    const to = new THREE.Vector3(t.x, 2.2, t.z);
    const mid = new THREE.Vector3((from.x + to.x) / 2, Math.max(from.y, to.y) + 1.6, (from.z + to.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const color = ok ? (picked === 'gas' ? 0x9fd3c6 : picked === 'oil' ? 0xd8a24a : 0x8fb6ad) : 0xff5a6e;

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10),
      new THREE.MeshBasicMaterial({ color: color, blending: THREE.AdditiveBlending, transparent: true }));
    G.add(dot);
    const t0 = performance.now();
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / 900);
      /* Wrong target goes to the target and returns: "拦截" is visible. */
      const p = ok ? k : (k < 0.5 ? k * 2 : (1 - k) * 2);
      dot.position.copy(curve.getPoint(p));
      if (k < 1) requestAnimationFrame(step);
      else {
        G.remove(dot);
        if (ok) {
          solved[picked] = true;
          t.fill.scale.y = 0.95;
          t.fill.material.emissiveIntensity = 1.3;
          addStream(picked);
          note.classList.remove('is-on', 'is-ok', 'is-error');
          note.classList.add('is-ok');
          note.textContent = o.name + ' → ' + t.name;
          if (solved.gas && solved.oil && solved.water) complete();
        } else {
          note.classList.remove('is-on', 'is-ok', 'is-error');
          note.classList.add('is-error');
          note.textContent = '去向不匹配，已拦截';
        }
        outletBtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        targetBtns.forEach(function (b) { b.disabled = true; b.setAttribute('aria-pressed', 'false'); });
        picked = null;
        built.OUTLETS.forEach(function (x) { x.ring.scale.setScalar(1); x.ring.material.emissiveIntensity = 1.0; });
      }
    })();
  }

  function complete() {
    completed = true;
    ui.classList.add('done');
    hint.textContent = '已完成 · 三相分离';
    if (stage.setInteraction) stage.setInteraction('complete_separation', 'gas,oil,water', '完成', 'success');
    if (stage.setNodeDone) stage.setNodeDone(1, true);
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '地面处理：三相分离器' });
    log.push({ k: '动手', t: '把气、油、水接到正确出口' });
    back.classList.add('pulse');
    back.textContent = '完成，返回总览 →';
    act.hidden = true;
  }

  /* ---------- 拾取 ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  stage.viewport.addEventListener('pointerup', function (e) {
    if (!stage.isLevel() || window.__l2active !== true) return;
    if (performance.now() - (window.__stageDragAt || 0) < 300) return;
    if (e.target.closest('.lvl')) return;
    const rect = stage.viewport.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);

    const outlets = built.pickables.filter(p => p.userData.outlet);
    const tanks = built.pickables.filter(p => p.userData.tank);
    const hitO = ray.intersectObjects(outlets, false)[0];
    if (hitO) { pickOutlet(hitO.object.userData.outlet); return; }
    const hitT = ray.intersectObjects(tanks, false)[0];
    if (hitT) assignTank(hitT.object.userData.tank);
  });

  /* ---------- 进 / 出 ---------- */
  function ensureCamera() {
    if (!camera) camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    camera.aspect = (stage.viewport.clientWidth || 800) / (stage.viewport.clientHeight || 480);
    camera.updateProjectionMatrix();
  }

  function screenPoint(kind, key) {
    var list = built.pickables.filter(function (p) { return kind === 'tank' ? p.userData.tank === key : p.userData.outlet === key; });
    var obj = list[0];
    if (!obj) return null;
    var p = new THREE.Vector3();
    obj.getWorldPosition(p);
    p.project(camera);
    var rect = stage.viewport.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (-p.y + 1) / 2 * rect.height };
  }

  function enter() {
    if (stage.isLevel()) return;
    if (!built) built = build();
    ensureCamera();

    const startPos = stage.camera.position.clone();
    const startT = new THREE.Vector3(anchor.x, 1.2, anchor.z);
    camera.position.copy(startPos);
    camera.lookAt(startT);

    stage.use(baseScene, camera);
    if (stage.setOverviewVisible) stage.setOverviewVisible(false);
    /* The overview hero is material-merged under separator__*; hide it so
       the detail Hero does not render a second shell in the same place. */
    overviewSeparator = [];
    sepTimers.forEach(clearTimeout);
    sepTimers = [];
    hideOverviewSeparator();
    sepTimers.push(setTimeout(function () { if (window.__l2active) hideOverviewSeparator(); }, 500));
    sepTimers.push(setTimeout(function () { if (window.__l2active) hideOverviewSeparator(); }, 1400));
    G.visible = true;
    if (stage.setContextObject) stage.setContextObject('three_phase_separator', 'gathering');
    if (stage.deviceState) stage.deviceState.select('three_phase_separator');
    window.__l2active = true;
    ui.classList.add('on');
    document.body.classList.add('in-level');
    syncUi();
    hint.textContent = '镜头正在靠近分离器…';
    if (!running) { running = true; loop(); }

    fly(startPos, startT,
      new THREE.Vector3(anchor.x + 7.0, 10.8, anchor.z + 19.0), new THREE.Vector3(anchor.x - 1.0, 2.1, anchor.z), 1700, function () {
        hint.textContent = '三相分离器 · 点击出口';
        setTimeout(function () {
          fly(camera.position.clone(), new THREE.Vector3(anchor.x + 1.2, 1.9, anchor.z),
            new THREE.Vector3(anchor.x + 9.0, 10.8, anchor.z + 18.0), new THREE.Vector3(anchor.x - 1.0, 2.0, anchor.z + 0.3), 1300, function () {
              act.hidden = false;
    if (!ui.querySelector('.lvl__dragtip')) {
      const tip = document.createElement('p');
      tip.className = 'lvl__dragtip';
      tip.textContent = '拖动画面空白处可旋转视角';
      act.appendChild(tip);
    }
            });
        }, 480);
      });
  }

  function exit() {
    act.hidden = true;
    ui.classList.remove('on', 'done');
    document.body.classList.remove('in-level');
    window.__l2active = false;
    sepTimers.forEach(clearTimeout);
    sepTimers = [];
    G.visible = false;
    overviewSeparator.forEach(function (rec) { rec.parent.add(rec.object); rec.object.visible = true; });
    overviewSeparator = [];
    if (stage.setContextObject) stage.setContextObject(null, 'gathering');
    if (stage.deviceState) stage.deviceState.select(null);
    fly(camera.position.clone(), new THREE.Vector3(anchor.x + 2.2, 1.7, anchor.z),
      new THREE.Vector3(anchor.x, 11, anchor.z + 20), new THREE.Vector3(0, 1.2, 0), 1500, function () {
        running = false;
        if (stage.setOverviewVisible) stage.setOverviewVisible(true);
        stage.back();
        const seg = document.querySelector('#stages [data-stage="1"]');
        if (seg) seg.classList.add('done-level');
      });
  }

  back.onclick = exit;
  window.__lvlEntry(1, '进入 02 地面处理', enter);
  window.__l2 = { enter: enter, exit: exit, pickOutlet: pickOutlet, assignTank: assignTank, screenPoint: screenPoint, get lastInteraction() { return window.__sceneContext ? (window.__sceneContext.interaction || null) : null; }, applyStructure: applyStructure, startSeparation: startSeparation, pauseSeparation: pauseSeparation, stepSeparation: stepSeparation, replaySeparation: replaySeparation, get assetLoaded() { return assetLoaded; }, get assetFailed() { return assetFailed; }, get structMode() { return structMode; }, get running() { return runningSep; }, get paused() { return pausedSep; }, get phaseT() { return phaseT; }, get completed() { return completed; }, get solved() { return Object.assign({}, solved); }, get phaseDots() { return phaseFlows.reduce(function (n, f) { return n + f.items.filter(function (d) { return d.visible; }).length; }, 0); } };
})();



