/* 关卡 02｜地面处理 —— 同样长在 V2 的场景里
   在「处理设施」节点旁边做三相分离器与三个罐，镜头从总览推过去。
   点出口 → 点罐，送错变红退回；送对后开一条常流。 */
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null, camera = null, baseScene = null, anchor = null;
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

    const mSteel = new THREE.MeshStandardMaterial({ color: 0x2b3a45, roughness: 0.5, metalness: 0.7 });
    const mPipe = new THREE.MeshStandardMaterial({ color: 0x252420, roughness: 0.65, metalness: 0.5 });
    const gasMat = new THREE.MeshStandardMaterial({ color: 0x1f2a26, emissive: 0x9fd3c6, emissiveIntensity: 1.0, roughness: 0.4 });
    const oilMat = new THREE.MeshStandardMaterial({ color: 0x2a1c08, emissive: 0xd8a24a, emissiveIntensity: 1.0, roughness: 0.4 });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x0d2338, emissive: 0x8fb6ad, emissiveIntensity: 0.9, roughness: 0.4 });

    /* 分离器 */
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 6.0, 26), mSteel);
    vessel.rotation.z = Math.PI / 2;
    vessel.position.set(0, 2.1, 0);
    G.add(vessel);
    const capL = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mSteel);
    capL.rotation.z = -Math.PI / 2; capL.position.set(-3.0, 2.1, 0); G.add(capL);
    const capR = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mSteel);
    capR.rotation.z = Math.PI / 2; capR.position.set(3.0, 2.1, 0); G.add(capR);
    [-1.6, 1.2].forEach(function (x) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.1, 1.5), mPipe);
      leg.position.set(x, 1.05, 0);
      G.add(leg);
    });

    /* 进口 */
    const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.6, 14), mPipe);
    inlet.rotation.z = Math.PI / 2;
    inlet.position.set(-4.4, 2.1, 0);
    G.add(inlet);
    const inletLabel = window.__lvlLabel('混合产出物', '#93a6b2');
    inletLabel.position.set(-4.6, 3.15, 0);
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

    /* 三个罐 */
    const TANKS = [
      { key: 'gas', name: '气罐', x: 5.0, z: -3.4, mat: gasMat },
      { key: 'oil', name: '油罐', x: 7.0, z: 0.4, mat: oilMat },
      { key: 'water', name: '水罐', x: 5.4, z: 4.0, mat: waterMat }
    ];

    TANKS.forEach(function (t) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.5, 22), mSteel);
      body.position.set(t.x, 1.25, t.z);
      G.add(body);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.11, 0.06, 8, 26), t.mat);
      band.rotation.x = Math.PI / 2;
      band.position.set(t.x, 2.1, t.z);
      G.add(band);
      const top = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mSteel);
      top.position.set(t.x, 2.5, t.z);
      G.add(top);

      const lb = window.__lvlLabel(t.name, '#c3d1d6');
      lb.position.set(t.x, 4.55, t.z);
      G.add(lb);

      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.1, 20), t.mat.clone());
      fill.material.emissiveIntensity = 0.5;
      fill.position.set(t.x, 0.25, t.z);
      fill.scale.y = 0.05;
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

    return { OUTLETS: OUTLETS, TANKS: TANKS, pickables: pickables };
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
  }

  /* ---------- UI ---------- */
  const ui = document.createElement('div');
  ui.className = 'lvl';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">02 / 05</span><b>地面处理 · 三相分离</b><span class="lvl__hint" id="l2-hint">镜头正在靠近分离器…</span></div>',
    '<div class="lvl__act" id="l2-act" hidden>',
    '<p>井口出来的是<b>油、气、水混在一起</b>。先点一个出口，再点它该去的罐。</p>',
    '<div class="lvl__out"><span id="l2-note">未选择出口</span></div>',
    '</div>',
    '<button type="button" class="lvl__back" id="l2-back">返回总览</button>'
  ].join('');
  stage.viewport.appendChild(ui);

  const hint = ui.querySelector('#l2-hint');
  const act = ui.querySelector('#l2-act');
  const note = ui.querySelector('#l2-note');
  const back = ui.querySelector('#l2-back');

  let built = null;
  let picked = null;
  let completed = false;
  const solved = { gas: false, oil: false, water: false };

  function pickOutlet(key) {
    picked = key;
    built.OUTLETS.forEach(function (o) {
      o.ring.scale.setScalar(o.key === key ? 1.5 : 1);
      o.ring.material.emissiveIntensity = o.key === key ? 2.2 : 1.0;
    });
    const o = built.OUTLETS.find(x => x.key === key);
    note.textContent = '已选「' + o.name + '」出口，现在点一个罐';
  }

  function assignTank(key) {
    if (!picked) { note.textContent = '先点一个出口'; return; }
    const o = built.OUTLETS.find(x => x.key === picked);
    const t = built.TANKS.find(x => x.key === key);
    const ok = picked === key;
    hint.textContent = ok ? '对了 · ' + o.name + ' → ' + t.name : '再看一眼：' + o.name + ' 不该进 ' + t.name;

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
      dot.position.copy(curve.getPoint(k));
      if (k < 1) requestAnimationFrame(step);
      else {
        G.remove(dot);
        if (ok) {
          solved[picked] = true;
          t.fill.scale.y = 0.95;
          t.fill.material.emissiveIntensity = 1.3;
          addStream(picked);
          note.textContent = o.name + '已进' + t.name;
          if (solved.gas && solved.oil && solved.water) complete();
        } else {
          note.textContent = '送错了：' + o.name + ' 回到了分离器';
        }
        picked = null;
        built.OUTLETS.forEach(function (x) { x.ring.scale.setScalar(1); x.ring.material.emissiveIntensity = 1.0; });
      }
    })();
  }

  function complete() {
    completed = true;
    ui.classList.add('done');
    hint.textContent = '已完成 · 三相分离';
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '地面处理：三相分离器' });
    log.push({ k: '动手', t: '把气、油、水分别送进对的罐' });
    if (stage.setNodeDone) stage.setNodeDone(1, true);
    back.classList.add('pulse');
    back.textContent = '完成，返回总览 →';
    act.hidden = true;
  }

  /* ---------- 拾取 ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  stage.viewport.addEventListener('pointerup', function (e) {
    if (!stage.isLevel() || window.__l2active !== true) return;
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
    window.__l2active = true;
    ui.classList.add('on');
    document.body.classList.add('in-level');
    hint.textContent = '镜头正在靠近分离器…';
    if (!running) { running = true; loop(); }

    fly(startPos, startT,
      new THREE.Vector3(anchor.x + 4.4, 7.6, anchor.z + 13.0), new THREE.Vector3(anchor.x - 1.0, 2.0, anchor.z), 1700, function () {
        hint.textContent = '三相分离器 · 点击出口';
        setTimeout(function () {
          fly(camera.position.clone(), new THREE.Vector3(anchor.x + 1.2, 1.9, anchor.z),
            new THREE.Vector3(anchor.x + 8.2, 7.9, anchor.z + 12.4), new THREE.Vector3(anchor.x - 1.2, 1.6, anchor.z + 0.3), 1300, function () {
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
  window.__l2 = { enter: enter, exit: exit };
})();
