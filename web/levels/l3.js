/* 关卡 03｜储运 —— 同样长在 V2 的场景里
   在「储运」节点旁立两个罐：左边固定顶，右边外浮顶，同一个液位滑块同时灌。
   液位越低，固定顶罐里油气空间越大、蒸发越猛；外浮顶的顶盖始终贴着油面。 */
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null, camera = null, baseScene = null, anchor = null;
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
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x33434e, roughness: 0.45, metalness: 0.7, transparent: true, opacity: 0.36, side: THREE.DoubleSide });
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
      G.add(g);
      return { group: g, oil: oil, roof: roof, ventFlow: ventFlow, floating: floating, x: x, z: z };
    }

    built.fixed = tank(-2.0, 0, false);
    built.float = tank(2.0, 0, true);

    /* 标签 */
    const l1 = window.__lvlLabel('固定顶罐', '#c3d1d6');
    l1.position.set(-2.0, 6.9, 0);
    G.add(l1);
    const l1s = window.__lvlLabel('油气空间大', '#8fa3ad');
    l1s.scale.set(1.5, 0.5, 1);
    l1s.position.set(-2.0, 6.05, 0);
    G.add(l1s);

    const l2 = window.__lvlLabel('外浮顶罐', '#48d7f0');
    l2.position.set(2.0, 6.9, 0);
    G.add(l2);
    const l2s = window.__lvlLabel('顶盖贴着油面', '#8fb8c4');
    l2s.scale.set(1.65, 0.5, 1);
    l2s.position.set(2.0, 6.05, 0);
    G.add(l2s);

    /* 地面 */
    const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 5.4), new THREE.MeshStandardMaterial({ color: 0x263239, roughness: 0.95 }));
    pad.position.y = 0.02;
    G.add(pad);

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
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!stage.isLevel()) return;
    flows.forEach(function (f) { f.update(0.016); });
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

    /* 液位越低，固定顶罐蒸发越猛 */
    if (built.fixed.ventFlow) built.fixed.ventFlow.speed = 0.05 + (1 - k) * 0.75;

    const space = Math.round((1 - k) * 100);
    const pct = Math.round(k * 100);
    uiPct.textContent = pct + '%';
    uiSpace.textContent = '油气空间 ' + space + '% · 蒸发' + (space > 55 ? '很猛' : space > 25 ? '明显' : '很少');
    uiSpace.style.color = space > 55 ? '#ff8a5c' : space > 25 ? '#f0a22e' : '#7fd6a8';
  }

  /* ---------- UI ---------- */
  const ui = document.createElement('div');
  ui.className = 'lvl';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">03 / 05</span><b>储运 · 浮顶罐</b><span class="lvl__hint" id="l3-hint">镜头正在靠近罐区…</span></div>',
    '<div class="lvl__act" id="l3-act" hidden>',
    '<p>两个罐装的是同样的油。拖液位，看<b>固定顶罐</b>顶上冒出的油气。</p>',
    '<div class="lvl__row"><input type="range" min="0" max="100" value="2" id="l3-level" aria-label="液位"><b id="l3-pct">2%</b></div>',
    '<div class="lvl__out"><span id="l3-space">油气空间 98% · 蒸发很猛</span></div>',
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

  slider.addEventListener('input', function () {
    level = +slider.value / 100;
    applyLevel();
    if (level >= 0.85 && !completed) complete();
    else if (level < 0.85) hint.textContent = '固定顶罐在冒油气 · 外浮顶没有';
  });

  function complete() {
    completed = true;
    ui.classList.add('done');
    hint.textContent = '浮顶把油气空间压没了';
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '储运：固定顶罐 vs 外浮顶罐' });
    log.push({ k: '动手', t: '把液位提上去，看油气空间被压没', d: Math.round(level * 100) + '%' });
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
    ui.classList.add('on');
    document.body.classList.add('in-level');
    hint.textContent = '镜头正在靠近罐区…';
    if (!running) { running = true; loop(); }

    fly(startPos, startT,
      new THREE.Vector3(anchor.x + 4.5, 8.8, anchor.z + 14.5), new THREE.Vector3(anchor.x, 2.9, anchor.z), 1700, function () {
        hint.textContent = '固定顶罐在冒油气 · 外浮顶没有';
        act.hidden = false;
      });
  }

  function exit() {
    act.hidden = true;
    ui.classList.remove('on', 'done');
    document.body.classList.remove('in-level');
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
  window.__l3 = { enter: enter, exit: exit };
})();
