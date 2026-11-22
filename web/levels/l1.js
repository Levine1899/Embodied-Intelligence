/* 关卡 01｜地下开采 —— 长在 V2 的同一个场景里
   在「井筒与储层」那个节点正下方做一条剖面，镜头从总览位置直接沉下去。
   不做独立场景，不做独立动画：同一个 scene、同一套灯光与雾。 */
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null;          // 剖面组（挂在 V2 场景里）
  let camera = null;     // 本关相机（复用 V2 的 renderer）
  let baseScene = null;
  let anchor = null;     // 井下剖面挂点

  const WELL_BOTTOM = -19.5;

  /* ---------- 剖面几何 ---------- */
  const built2 = [];
  function build() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[0] || new THREE.Vector3(-12, 0, -4);
    anchor = new THREE.Vector3(p.x, 0, p.z);

    G = new THREE.Group();
    G.position.copy(anchor);
    baseScene.add(G);
    if (window.__lvlGroup) window.__lvlGroup(0, G);

    const mSteel = new THREE.MeshStandardMaterial({ color: 0x2f2d26, roughness: 0.55, metalness: 0.65 });
    const mRock = new THREE.MeshStandardMaterial({ color: 0x3b4a52, roughness: 0.95 });
    const mOil = new THREE.MeshStandardMaterial({ color: 0x1a1204, emissive: 0xd8a24a, emissiveIntensity: 0.9, roughness: 0.35 });
    const mAmber = new THREE.MeshStandardMaterial({ color: 0x2a1a06, emissive: 0xe8a33a, emissiveIntensity: 1.0, roughness: 0.5 });

    /* 井架：原来只借用了总览的模型，进关卡后被隐藏，远景就成了空地 */
    const derrick = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: 0xc98a2e, roughness: 0.55, metalness: 0.5 });
    const legH = 6.2, baseR = 1.5, topR = 0.42;
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, legH, 6), legMat);
      leg.position.set(Math.cos(a) * (baseR + topR) / 2, legH / 2, Math.sin(a) * (baseR + topR) / 2);
      leg.rotation.z = -Math.cos(a) * 0.16;
      leg.rotation.x = Math.sin(a) * 0.16;
      derrick.add(leg);
    }
    for (let L = 0; L < 3; L += 1) {
      const y = 1.4 + L * 1.9;
      const k = 1 - (y / legH) * 0.72;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(baseR * k, 0.026, 5, 4), legMat);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ring.position.y = y;
      derrick.add(ring);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.9), legMat);
    crown.position.y = legH;
    derrick.add(crown);
    const platformM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.34, 2.4), new THREE.MeshStandardMaterial({ color: 0x2f3f49, roughness: 0.8 }));
    platformM.position.y = 0.17;
    derrick.add(platformM);
    G.add(derrick);
    /* 地下剖面：给一个「土体盒子」和深度网格，避免镜头下沉后一片纯黑 */

    [0, -3.4, -8.6, -14.2, -20.6].forEach(function (y) {
      const grid = new THREE.GridHelper(26, 26, 0x9fd3c6, 0x24505c);
      grid.position.set(0, y, 0);
      grid.material.transparent = true;
      grid.material.opacity = y === 0 ? 0.2 : (y === -20.6 ? 0.26 : 0.13);
      G.add(grid);
    });

    /* 井筒（从地表往下） */
    const casingMat = new THREE.MeshStandardMaterial({ color: 0x33434f, roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0.34, side: THREE.DoubleSide });
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, -WELL_BOTTOM, 20, 1, true), casingMat);
    casing.position.y = WELL_BOTTOM / 2;
    G.add(casing);
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, -WELL_BOTTOM, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9fd3c6, transparent: true, opacity: 0.10, side: THREE.BackSide })
    );
    glow.position.y = WELL_BOTTOM / 2;
    G.add(glow);

    /* 井口：采油树 */
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.5), mSteel);
    head.position.y = 0.4;
    G.add(head);
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.085, 8, 20), mAmber);
    valve.rotation.x = Math.PI / 2;
    valve.position.y = 1.0;
    G.add(valve);

    /* 三层岩层 */
    [
      { y: -3.4, h: 3.0, c: 0x4a3b2c },
      { y: -8.6, h: 4.2, c: 0x3a4148 },
      { y: -14.2, h: 5.0, c: 0x2f3a3f }
    ].forEach(function (s) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(14, s.h, 9),
        new THREE.MeshStandardMaterial({ color: s.c, roughness: 1, transparent: true, opacity: 0.5 })
      );
      m.position.y = s.y;
      G.add(m);
    });

    /* 油层 */
    const reservoir = new THREE.Mesh(new THREE.BoxGeometry(14, 2.0, 9), new THREE.MeshStandardMaterial({
      color: 0x3a2408, emissive: 0xd98a20, emissiveIntensity: 0.32, roughness: 0.9, transparent: true, opacity: 0.5
    }));
    reservoir.position.y = WELL_BOTTOM + 0.6;
    G.add(reservoir);

    /* 岩粒与油滴 */
    let seed = 20261120;
    const rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const grains = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.10 + rnd() * 0.12, 8, 6), mRock);
      g.position.set((rnd() - 0.5) * 6.2, WELL_BOTTOM + (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 4.0);
      grains.add(g);
    }
    G.add(grains);

    const droplets = new THREE.Group();
    for (let i = 0; i < 30; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.07 + rnd() * 0.05, 8, 6), mOil);
      d.position.set((rnd() - 0.5) * 5.4, WELL_BOTTOM + (rnd() - 0.5) * 1.3, (rnd() - 0.5) * 3.4);
      d.userData.base = d.position.clone();
      d.userData.seed = rnd();
      droplets.add(d);
    }
    G.add(droplets);

    /* 岩壁，让特写有包裹感 */
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x232e34, roughness: 1 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(10, 5.2, 0.5), wallMat);
    back.position.set(0, WELL_BOTTOM + 0.4, -3.2);
    G.add(back);

    /* ---------- 流动：井筒里持续上行，压力驱动 ---------- */
    const riseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, WELL_BOTTOM + 0.5, 0),
      new THREE.Vector3(0.10, WELL_BOTTOM + 6, 0.08),
      new THREE.Vector3(-0.08, -8, 0),
      new THREE.Vector3(0.06, -2.4, 0),
      new THREE.Vector3(0, 1.1, 0)
    ]);
    /* 曲线点在组内坐标系，先建到组里 */
    const riseFlow = makeFlowInGroup(riseCurve, 0xf0b45e, 26, 0.055, 0.10);
    const headCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 1.0, 0),
      new THREE.Vector3(-1.6, 1.7, 0.5),
      new THREE.Vector3(-3.0, 1.2, 0)
    ]);
    /* 井口横向流已去掉：看起来像漏油，改成井筒内部流动 */

    /* 孔隙汇入井筒的两股流 */
    const conv1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.4, WELL_BOTTOM + 0.2, 0.6),
      new THREE.Vector3(-1.2, WELL_BOTTOM + 0.5, 0.2),
      new THREE.Vector3(0, WELL_BOTTOM + 0.7, 0)
    ]);
    const conv2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.2, WELL_BOTTOM - 0.1, -0.5),
      new THREE.Vector3(1.0, WELL_BOTTOM + 0.3, -0.2),
      new THREE.Vector3(0, WELL_BOTTOM + 0.7, 0)
    ]);
    const c1 = makeFlowInGroup(conv1, 0xf0b45e, 7, 0.05, 0.055);
    const c2 = makeFlowInGroup(conv2, 0xf0b45e, 7, 0.05, 0.055);
    built2.push(c1, c2);

    return { droplets: droplets, riseFlow: riseFlow, extra: built2 };
  }

  /* 组内坐标的流动粒子 */
  function makeFlowInGroup(curve, color, count, speed, size) {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(size * 1.45, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.userData.t = i / count;
      m.userData.flow = true;
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
    animations.push(api);
    return api;
  }

  const animations = [];
  let running = false;
  let lastT = performance.now();

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!stage.isLevel()) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    animations.forEach(function (a) { a.update(dt); });
  }

  /* ---------- 相机 ---------- */
  function ensureCamera() {
    if (!camera) camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    camera.aspect = (stage.viewport.clientWidth || 800) / (stage.viewport.clientHeight || 480);
    camera.updateProjectionMatrix();
  }

  let flyHandle = null;
  const gateTimers = [];
  function later(ms, fn) { const id = setTimeout(fn, ms); gateTimers.push(id); return id; }
  function fly(from, fromT, to, toT, dur, done) {
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

  const A = () => new THREE.Vector3(anchor.x, 0, anchor.z);

  /* ---------- UI ---------- */
  const ui = document.createElement('div');
  ui.className = 'lvl';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">01 / 05</span><b>地下开采 · 井筒剖面</b><span class="lvl__hint" id="l1-hint">镜头正在下沉…</span></div>',
    '<div class="lvl__act" id="l1-act" hidden>',
    '<p>油不在“油湖”里，它躲在<b>岩石孔隙</b>中。拖动“压力差示意”，看油被推向井底。</p><p style="color:#9a948a;font-size:12px;margin:4px 0 8px">教学示意：滑块不代表真实井底压力、注入量或采收率。</p>',
    '<div class="lvl__row"><input type="range" min="0" max="100" value="0" id="l1-press" aria-label="压力差示意（教学控制量）"><b id="l1-pct">0%</b></div>',
    '<div class="lvl__out"><span id="l1-note">孔隙里的油还没动</span></div>',
    '</div>',
    '<button type="button" class="lvl__back" id="l1-back">返回总览</button>'
  ].join('');
  stage.viewport.appendChild(ui);

  const hint = ui.querySelector('#l1-hint');
  const act = ui.querySelector('#l1-act');
  const press = ui.querySelector('#l1-press');
  const pct = ui.querySelector('#l1-pct');
  const note = ui.querySelector('#l1-note');
  const back = ui.querySelector('#l1-back');

  let built = null;
  let pressure = 0;
  let completed = false;

  press.addEventListener('input', function () {
    pressure = +press.value;
    if (stage.setInteraction) stage.setInteraction('adjust_pressure', pressure, '示意百分比');
    pct.textContent = pressure + '%';
    if (built) {
      built.droplets.children.forEach(function (d) {
        const k = pressure / 100;
        d.position.y = d.userData.base.y + k * (2.4 + d.userData.seed * 1.3);
        d.position.x = d.userData.base.x * (1 - k * 0.8);
        d.position.z = d.userData.base.z * (1 - k * 0.8);
        d.material.emissiveIntensity = 0.5 + k * 1.7;
      });
      built.riseFlow.speed = 0.04 + (pressure / 100) * 0.42;
      (built.extra || []).forEach(function (f) { f.speed = 0.03 + (pressure / 100) * 0.5; });
    }
    if (pressure < 30) note.textContent = '孔隙里的油还没动';
    else if (pressure < 60) note.textContent = '油开始向井底方向运移';
    else if (pressure < 90) note.textContent = '更多油向井底运移（示意）';
    else note.textContent = '教学示意：压差推动油向井底流动；真实采收率还受储层与开发条件影响';
    if (pressure >= 90 && !completed) complete();
  });

  function complete() {
    completed = true;
    ui.classList.add('done');
    hint.textContent = '已完成 · 观察压差驱动';
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '地下开采：井筒剖面与孔隙' });
    log.push({ k: '动手', t: '调节压力差示意，观察油向井底流动', d: pressure + '%（示意）' });
    if (stage.setNodeDone) stage.setNodeDone(0, true);
    back.classList.add('pulse');
    back.textContent = '完成，返回总览 →';
  }

  back.onclick = exitLevel;

  /* ---------- 进 / 出 ---------- */
  const END_POS = () => new THREE.Vector3(anchor.x + 4.6, WELL_BOTTOM + 4.2, anchor.z + 10.5);
  const END_T = () => new THREE.Vector3(anchor.x, WELL_BOTTOM + 1.2, anchor.z);

  function skipToReservoir() {
    gateTimers.forEach(clearTimeout); gateTimers.length = 0;
    if (flyHandle) cancelAnimationFrame(flyHandle);
    camera.position.copy(END_POS());
    camera.lookAt(END_T());
    hint.textContent = '油层 · 拖动压力差示意';
    act.hidden = false;
    const b = ui.querySelector('#l1-skip'); if (b) b.remove();
  }

  function enterLevel() {
    if (stage.isLevel()) return;
    if (!G) built = build();
    ensureCamera();

    /* 起点沿用总览当前机位，避免跳变 */
    const startPos = stage.camera.position.clone();
    const startTarget = new THREE.Vector3(anchor.x, 0, anchor.z);
    camera.position.copy(startPos);
    camera.lookAt(startTarget);

    stage.use(baseScene, camera);
    if (stage.setOverviewVisible) stage.setOverviewVisible(false);
    ui.classList.add('on');
    document.body.classList.add('in-level');
    hint.textContent = '镜头正在下沉…';
    let sk = ui.querySelector('#l1-skip');
    if (!sk) {
      sk = document.createElement('button');
      sk.type = 'button';
      sk.id = 'l1-skip';
      sk.className = 'lvl__skip';
      sk.textContent = '跳过镜头 →';
      sk.onclick = skipToReservoir;
      ui.appendChild(sk);
    }
    if (!running) { running = true; loop(); }

    const p0 = A();
    fly(startPos, startTarget,
      new THREE.Vector3(p0.x + 9.4, 7.2, p0.z + 14.8), new THREE.Vector3(p0.x, 2.2, p0.z), 2000, function () {
        hint.textContent = '井场 · 井架与地面';
        later(1500, function () {
          fly(camera.position.clone(), new THREE.Vector3(p0.x, 0.8, p0.z),
            new THREE.Vector3(p0.x + 3.2, -8.5, p0.z + 4.6), new THREE.Vector3(p0.x, -8.5, p0.z), 2100, function () {
              hint.textContent = '井筒 · 套管与岩层';
              later(500, function () {
                fly(camera.position.clone(), new THREE.Vector3(p0.x, -8.5, p0.z),
                  new THREE.Vector3(p0.x + 4.6, WELL_BOTTOM + 4.2, p0.z + 10.5), new THREE.Vector3(p0.x, WELL_BOTTOM + 1.2, p0.z), 2400, function () {
                    hint.textContent = '油层 · 拖动压力差示意';
              const sb = ui.querySelector('#l1-skip'); if (sb) sb.remove();
                    act.hidden = false;
                  });
              });
            });
        });
      });
  }

  function exitLevel() {
    act.hidden = true;
    ui.classList.remove('on', 'done');
    document.body.classList.remove('in-level');
    const p0 = A();
    fly(camera.position.clone(), new THREE.Vector3(p0.x, WELL_BOTTOM + 0.5, p0.z),
      new THREE.Vector3(p0.x, 12, p0.z + 22), new THREE.Vector3(0, 1.2, 0), 1600, function () {
        running = false;
        if (stage.setOverviewVisible) stage.setOverviewVisible(true);
        stage.back();
        const seg = document.querySelector('#stages [data-stage="0"]');
        if (seg) seg.classList.add('done-level');
      });
  }

  window.__lvlEntry(0, '进入 01 地下开采', enterLevel);
  window.__l1 = { enter: enterLevel, exit: exitLevel };
})();
