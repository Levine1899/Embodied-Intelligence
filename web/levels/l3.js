/* 关卡 03｜储运 —— 同样长在 V2 的场景里
   在「储运」节点旁立两个罐：左边固定顶，右边外浮顶，同一个液位滑块同时灌。
   液位越低，固定顶罐的油气空间越大；外浮顶的顶盖始终贴着油面。此为教学示意，不换算真实排放量。 */
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null, camera = null, baseScene = null, anchor = null;
  let pumpFlow = null, pumpRunning = false, pumpPaused = false, cutMode = false, pumpMesh = null, selectedTankId = 'fixed_roof_tank';
  let routeInfo = null;
  const flows = [];
  const built = {};

  function makeFlowInGroup(curve, color, count, speed, size, opacity) {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(size * 1.35, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity == null ? 0.9 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
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
      }
    };
    flows.push(api);
    return api;
  }

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
    const mOil = new THREE.MeshStandardMaterial({ color: 0x2a1c08, emissive: 0xd8a24a, emissiveIntensity: 0.85, roughness: 0.4 });
    const mRoof = new THREE.MeshStandardMaterial({ color: 0x3a4a55, roughness: 0.45, metalness: 0.8 });

    function tank(x, z, floating) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x33434e, roughness: 0.45, metalness: 0.7, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 3.6, 26, 1, true), bodyMat);
      body.position.y = 1.8;
      g.add(body);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 26), mSteel);
      base.position.y = 0.06;
      g.add(base);

      /* 油面 */
      const oil = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.5, 26), mOil);
      oil.position.y = 1.9;
      oil.scale.y = 0.02;
      g.add(oil);

      let roof, vent = null, ventFlow = null;
      if (floating) {
        /* 外浮顶：一块贴着油面的盖板，随液位升降 */
        roof = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.16, 26), mRoof);
        roof.position.y = 0.2;
        g.add(roof);
      } else {
        /* 固定顶：锥顶 + 呼吸阀 */
        roof = new THREE.Mesh(new THREE.ConeGeometry(1.62, 0.8, 26), mSteel);
        roof.position.y = 4.0;
        g.add(roof);
        vent = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12), mSteel);
        vent.position.y = 4.5;
        g.add(vent);
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 4.75, 0),
          new THREE.Vector3(0.2, 5.4, 0.1),
          new THREE.Vector3(-0.1, 6.1, 0)
        ]);
        ventFlow = makeFlowInGroup(curve, 0xd8e2e8, 10, 0.25, 0.07, 0.55);
      }
      const selRing = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.035, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xf0a22e, transparent: true, opacity: 0.9, depthWrite: false }));
      selRing.rotation.x = Math.PI / 2;
      selRing.position.y = 0.08;
      selRing.visible = false;
      g.add(selRing);
      G.add(g);
      return { group: g, body: body, bodyMat: bodyMat, oil: oil, roof: roof, ventFlow: ventFlow, selRing: selRing, floating: floating, x: x, z: z };
    }

    built.fixed = tank(-2.0, 0, false);
    built.float = tank(2.0, 0, true);

    /* 标签 */
    const l1 = window.__lvlLabel('固定顶罐', '#cfc8ba');
    l1.position.set(-2.0, 4.7, 0);
    l1.scale.setScalar(0.9);
    G.add(l1);
    const l1s = window.__lvlLabel('油气空间大', '#9a948a');
    l1s.scale.set(1.5, 0.5, 1);
    l1s.position.set(-2.0, 4.15, 0);
    l1s.scale.setScalar(0.76);
    G.add(l1s);

    const l2 = window.__lvlLabel('外浮顶罐', '#8fb6ad');
    l2.position.set(2.0, 4.7, 0);
    l2.scale.setScalar(0.9);
    G.add(l2);
    const l2s = window.__lvlLabel('顶盖贴着油面', '#b6b0a2');
    l2s.scale.set(1.65, 0.5, 1);
    l2s.position.set(2.0, 4.15, 0);
    l2s.scale.setScalar(0.76);
    G.add(l2s);

    /* 地面 */
    const pad = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 6.2), new THREE.MeshStandardMaterial({ color: 0x263239, roughness: 0.95 }));
    pad.position.y = 0.02;
    G.add(pad);

    /* 转输泵组：可识别泵体/电机/阀门/管架 */
    pumpMesh = new THREE.Group();
    pumpMesh.position.set(3.9, 0, 1.8);
    pumpMesh.userData.objectId = 'transfer_pump';
    G.add(pumpMesh);
    const pumpBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.5), mSteel);
    pumpBase.position.y = 0.12; pumpMesh.add(pumpBase);
    const pumpBody = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.8, 24), mSteel);
    pumpBody.rotation.z = Math.PI / 2; pumpBody.position.set(-0.55, 0.65, 0); pumpMesh.add(pumpBody);
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.8), new THREE.MeshStandardMaterial({ color: 0x3d4a44, roughness: 0.55, metalness: 0.5 }));
    motor.position.set(0.7, 0.58, 0); pumpMesh.add(motor);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 18), new THREE.MeshStandardMaterial({ color: 0xd8a24a, roughness: 0.45 }));
    wheel.rotation.x = Math.PI / 2; wheel.position.set(-0.55, 1.18, 0); pumpMesh.add(wheel);
    const pumpLabel = window.__lvlLabel('转输泵组', '#d8a24a'); pumpLabel.position.set(3.9, 2.7, 1.8); pumpLabel.scale.setScalar(0.78); G.add(pumpLabel);

    /* 泵送路径：终点接到全局 path_store_refine 的 storage 出口。 */
    const globalRoute = stage.getRoute ? stage.getRoute('path_store_refine') : null;
    if (globalRoute) {
      const localStart = globalRoute.start.clone().sub(G.position);
      routeInfo = {
        pathId: 'path_store_refine',
        storageOutlet: globalRoute.start.toArray(),
        refineryFeed: globalRoute.end.toArray(),
        localEnd: localStart.toArray()
      };
    }
    const routeEnd = routeInfo
      ? new THREE.Vector3(routeInfo.localEnd[0], routeInfo.localEnd[1], routeInfo.localEnd[2])
      : new THREE.Vector3(9.2, 1.2, 3.4);
    const pumpCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.7, 1.15, 1.4),
      new THREE.Vector3(5.3, 1.0, 2.0),
      new THREE.Vector3((5.3 + routeEnd.x) / 2, Math.max(1.0, routeEnd.y), (2.0 + routeEnd.z) / 2),
      routeEnd
    ]);
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(pumpCurve, 40, 0.07, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x8b6b3f, roughness: 0.5, metalness: 0.4 }));
    pipe.name = 'store_transfer_pipe'; pipe.userData.pathId = 'path_store_refine'; G.add(pipe);
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 18), new THREE.MeshStandardMaterial({ color: 0xd8a24a, roughness: 0.45 }));
    valve.rotation.x = Math.PI / 2; valve.position.set(5.2, 1.4, 1.9); G.add(valve);
    const valveLabel = window.__lvlLabel('出口阀', '#d8a24a'); valveLabel.position.set(5.2, 2.0, 1.9); valveLabel.scale.setScalar(0.72); G.add(valveLabel);
    pumpFlow = makeFlowInGroup(pumpCurve, 0x7fd6a8, 12, 0.28, 0.06, 0.8);
    pumpFlow.speed = 0;

    return built;
  }

  /* ---------- 相机 ---------- */
  let flyHandle = null;
  function fly(from, fromT, to, toT, dur, done) {
    const t0 = performance.now();
    if (flyHandle) cancelAnimationFrame(flyHandle);
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = ease(k);
      camera.position.lerpVectors(from, to, e);
      camera.lookAt(new THREE.Vector3().lerpVectors(fromT, toT, e));
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
  }

  /* ---------- 状态 ---------- */
  let level = 0.02;
  let completed = false;

  function applyLevel() {
    const k = level;
    /* 固定顶：油面升高，油气空间变小 */
    built.fixed.oil.scale.y = Math.max(0.02, k);
    built.fixed.oil.position.y = 0.12 + (3.5 * k) / 2;
    /* 外浮顶：盖板跟着油面走 */
    built.float.oil.scale.y = Math.max(0.02, k);
    built.float.oil.position.y = 0.12 + (3.5 * k) / 2;
    built.float.roof.position.y = 0.14 + 3.5 * k;

    /* 液位越低，固定顶罐油气空间越大（教学示意） */
    if (built.fixed.ventFlow) built.fixed.ventFlow.speed = 0.05 + (1 - k) * 0.75;

    if (stage.deviceState) {
      stage.deviceState.set('fixed_roof_tank', { level: k }, 'level');
      stage.deviceState.set('floating_roof_tank', { level: k }, 'level');
    }
    syncStorageUi();
  }

  /* ---------- UI ---------- */
  const ui = document.createElement('div');
  ui.className = 'lvl';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">03 / 05</span><b>储运 · 浮顶罐</b><span class="lvl__hint" id="l3-hint">镜头正在靠近罐区…</span></div>',
    '<div class="lvl__act" id="l3-act" hidden>',
    '<p>两个罐装同样的油。拖液位，对比油气空间变化（教学示意，不代表实际排放）。</p>',
    '<div class="lvl__row"><input type="range" min="0" max="100" value="2" id="l3-level" aria-label="液位"><b id="l3-pct">2%</b></div>',
    '<div class="lvl__out"><span id="l3-space">油气空间 98%（示意）</span></div>',
    '<div class="lvl__btns"><button type="button" class="lvl__btn" id="l3-fixed">固定顶罐</button><button type="button" class="lvl__btn" id="l3-float">外浮顶罐</button><button type="button" class="lvl__btn" id="l3-pump">转输泵组</button><button type="button" class="lvl__btn" id="l3-cut" aria-pressed="false">罐体剖面</button><button type="button" class="lvl__btn" id="l3-pumpstart">启动泵送</button><button type="button" class="lvl__btn" id="l3-pumppause">暂停泵送</button><button type="button" class="lvl__btn" id="l3-pumpreplay">重播路径</button></div>',
    '<div class="lvl__out"><span id="l3-route">路径：储罐 → 转输泵 → 炼化入口（示意）</span></div>',
    '</div>',
    '<button type="button" class="lvl__back" id="l3-back">返回总览</button>'
  ].join('');
  stage.viewport.appendChild(ui);

  const hint = ui.querySelector('#l3-hint');
  const act = ui.querySelector('#l3-act');
  const slider = ui.querySelector('#l3-level');
  const uiPct = ui.querySelector('#l3-pct');
  const uiSpace = ui.querySelector('#l3-space');
  const back = ui.querySelector('#l3-back');
  const cutBtn = ui.querySelector('#l3-cut');
  ui.querySelector('#l3-fixed').addEventListener('click', function () { selectTank('fixed_roof_tank'); });
  ui.querySelector('#l3-float').addEventListener('click', function () { selectTank('floating_roof_tank'); });
  ui.querySelector('#l3-pump').addEventListener('click', function () { if (stage.setContextObject) stage.setContextObject('transfer_pump', 'storage'); if (stage.deviceState) stage.deviceState.select('transfer_pump'); if (stage.setInteraction) stage.setInteraction('inspect_tank_structure', 'transfer_pump', '泵组'); hint.textContent = '转输泵组 · 把油相送往炼化入口'; });
  const pumpStart = ui.querySelector('#l3-pumpstart');
  const pumpPause = ui.querySelector('#l3-pumppause');
  const pumpReplay = ui.querySelector('#l3-pumpreplay');
  function selectTank(id) {
    selectedTankId = id;
    if (stage.setContextObject) stage.setContextObject(id, 'storage');
    if (stage.deviceState) stage.deviceState.select(id);
    if (built.fixed && built.fixed.selRing) built.fixed.selRing.visible = id === 'fixed_roof_tank';
    if (built.float && built.float.selRing) built.float.selRing.visible = id === 'floating_roof_tank';
    if (stage.setInteraction) stage.setInteraction('inspect_tank_structure', id, '罐型');
    hint.textContent = id === 'fixed_roof_tank' ? '固定顶罐 · 油气空间较大' : '外浮顶罐 · 浮盘贴着液面；减少油气空间，不等于零排放';
  }

  function syncStorageUi() {
    if (!slider) return;
    slider.value = String(Math.round(level * 100));
    uiPct.textContent = Math.round(level * 100) + '%';
    const space = Math.round((1 - level) * 100);
    uiSpace.textContent = '油气空间 ' + space + '%（示意）';
    uiSpace.style.color = space > 55 ? '#ff8a5c' : space > 25 ? '#f0a22e' : '#7fd6a8';
    cutBtn.textContent = cutMode ? '恢复罐壁' : '罐体剖面';
    cutBtn.setAttribute('aria-pressed', String(cutMode));
  }

  function storageHint() {
    if (pumpRunning) return '泵送中 · 沿管线追踪到下一环节';
    if (pumpPaused) return '泵送已暂停 · 可重播';
    return selectedTankId === 'floating_roof_tank'
      ? '外浮顶罐 · 浮盘贴着液面；减少油气空间，不等于零排放'
      : '固定顶罐油气空间大 · 外浮顶减少油气空间，不等于零排放';
  }
  cutBtn.addEventListener('click', function () {
    cutMode = !cutMode; cutBtn.setAttribute('aria-pressed', String(cutMode));
    cutBtn.textContent = cutMode ? '恢复罐壁' : '罐体剖面';
    [built.fixed, built.float].forEach(function (t) {
      if (!t || !t.bodyMat) return;
      t.bodyMat.transparent = true; t.bodyMat.opacity = cutMode ? 0.28 : 0.94; t.bodyMat.depthWrite = !cutMode; t.bodyMat.needsUpdate = true;
    });
    if (stage.deviceState) {
      stage.deviceState.set('fixed_roof_tank', { structure: cutMode ? 'half' : 'external' }, 'level');
      stage.deviceState.set('floating_roof_tank', { structure: cutMode ? 'half' : 'external' }, 'level');
    }
    if (stage.setInteraction) stage.setInteraction('inspect_tank_structure', 'tank_cut', cutMode ? 'on' : 'off');
    syncStorageUi();
  });
  pumpStart.addEventListener('click', function () { if (!pumpFlow) return; pumpRunning = true; pumpPaused = false; pumpFlow.speed = 0.3; if (stage.deviceState) stage.deviceState.set('transfer_pump', { animation: 'running' }, 'level'); if (stage.setInteraction) stage.setInteraction('start_pump', 'transfer_pump', '示意'); hint.textContent = storageHint(); });
  pumpPause.addEventListener('click', function () { pumpRunning = false; pumpPaused = true; if (pumpFlow) pumpFlow.speed = 0; if (stage.deviceState) stage.deviceState.set('transfer_pump', { animation: 'paused' }, 'level'); if (stage.setInteraction) stage.setInteraction('pause_pump', 'transfer_pump', '示意'); hint.textContent = storageHint(); });
  pumpReplay.addEventListener('click', function () { pumpRunning = true; pumpPaused = false; if (pumpFlow) pumpFlow.speed = 0.3; if (stage.deviceState) stage.deviceState.set('transfer_pump', { animation: 'running' }, 'level'); if (stage.setInteraction) stage.setInteraction('replay_pump', 'transfer_pump', '示意'); hint.textContent = '泵送路径重播'; });


  slider.addEventListener('input', function () {
    level = +slider.value / 100;
    if (stage.setInteraction) stage.setInteraction('change_liquid_level', Math.round(level * 100), '示意百分比');
    applyLevel();
    if (level >= 0.85 && !completed) complete();
    else if (level < 0.85) hint.textContent = '固定顶罐油气空间大 · 外浮顶减少油气空间，不等于零排放';
  });

  function complete() {
    completed = true;
    ui.classList.add('done');
    hint.textContent = '浮顶把油气空间压小了';
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '储运：固定顶罐 vs 外浮顶罐' });
    log.push({ k: '动手', t: '调节液位，对比固定顶与外浮顶的油气空间', d: Math.round(level * 100) + '%（示意）' });
    if (stage.setNodeDone) stage.setNodeDone(2, true);
    back.classList.add('pulse');
    back.textContent = '完成，返回总览 →';
  }

  /* ---------- 进 / 出 ---------- */
  function ensureCamera() {
    if (!camera) camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    camera.aspect = (stage.viewport.clientWidth || 800) / (stage.viewport.clientHeight || 480);
    camera.updateProjectionMatrix();
  }

  function enter() {
    if (stage.isLevel()) return;
    if (!G) build();
    ensureCamera();
    applyLevel();

    const startPos = stage.camera.position.clone();
    const startT = new THREE.Vector3(anchor.x, 1.4, anchor.z);
    camera.position.copy(startPos);
    camera.lookAt(startT);

    stage.use(baseScene, camera);
    if (stage.setOverviewVisible) stage.setOverviewVisible(false);
    G.visible = true;
    if (stage.deviceState) {
      stage.deviceState.bind('fixed_roof_tank', 'detail', built.fixed.group);
      stage.deviceState.bind('floating_roof_tank', 'detail', built.float.group);
      if (pumpMesh) stage.deviceState.bind('transfer_pump', 'detail', pumpMesh);
    }
    if (stage.setContextObject) stage.setContextObject(selectedTankId, 'storage');
    selectTank(selectedTankId);
    ui.classList.add('on');
    document.body.classList.add('in-level');
    syncStorageUi();
    hint.textContent = '镜头正在靠近罐区…';
    if (!running) { running = true; loop(); }

    fly(startPos, startT,
      new THREE.Vector3(anchor.x + 5.5, 6.2, anchor.z + 14.0), new THREE.Vector3(anchor.x + 0.8, 2.0, anchor.z), 1700, function () {
        hint.textContent = storageHint();
        act.hidden = false;
      });
  }

  function exit() {
    act.hidden = true;
    ui.classList.remove('on', 'done');
    document.body.classList.remove('in-level');
    G.visible = false;
    if (stage.setContextObject) stage.setContextObject(null, 'storage');
    if (stage.deviceState) stage.deviceState.select(null);
    fly(camera.position.clone(), new THREE.Vector3(anchor.x, 2.6, anchor.z),
      new THREE.Vector3(anchor.x, 11, anchor.z + 20), new THREE.Vector3(0, 1.2, 0), 1500, function () {
        running = false;
        if (stage.setOverviewVisible) stage.setOverviewVisible(true);
        stage.back();
        const seg = document.querySelector('#stages [data-stage="2"]');
        if (seg) seg.classList.add('done-level');
      });
  }

  back.onclick = exit;
  window.__lvlEntry(2, '进入 03 储运', enter);
  window.__l3 = { enter: enter, exit: exit, selectTank: selectTank, get routeInfo() { return routeInfo; }, get lastInteraction() { return window.__sceneContext ? (window.__sceneContext.interaction || null) : null; }, get cutMode() { return cutMode; }, get pumpRunning() { return pumpRunning; }, get pumpPaused() { return pumpPaused; }, get level() { return level; },
    setLevel: function (pct) {
      if (!slider) return;
      slider.value = String(Math.max(0, Math.min(100, Number(pct) || 0)));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    },
    startPump: function () { if (pumpStart) pumpStart.click(); },
    pausePump: function () { if (pumpPause) pumpPause.click(); }
  };
})();

