/* 关卡 04｜炼化 —— 同样长在 V2 的场景里
   分馏塔：越轻的组分沸点越低，从越靠上的位置被抽走。
   用户先点一个产品，再点塔上的一个抽出口；对的亮起并接出一条管线。 */
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null, camera = null, baseScene = null, anchor = null;
  const flows = [];
  const streams = {};

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
          m.scale.setScalar(0.7 + 0.5 * Math.sin(m.userData.t * Math.PI));
        });
      }
    };
    flows.push(api);
    return api;
  }

  /* 产品：从塔顶往下 */
  const PRODUCTS = [
    { key: 'topgas', name: '塔顶油气', y: 8.0, color: 0xbfd8cf, hint: '最轻 · 塔顶' },
    { key: 'naphtha', name: '石脑油馏分', y: 6.5, color: 0x9fd3c6, hint: '较轻 · 上部' },
    { key: 'kerosene', name: '煤油馏分', y: 5.1, color: 0xd8c9a0, hint: '中等 · 中部' },
    { key: 'diesel', name: '柴油馏分', y: 3.7, color: 0xd8a24a, hint: '较重 · 下部' },
    { key: 'residue', name: '常压渣油', y: 2.0, color: 0xb38a4a, hint: '最重 · 塔底' }
  ];

  function build() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[3] || new THREE.Vector3(8, 0, 5);
    anchor = new THREE.Vector3(p.x, 0, p.z);

    G = new THREE.Group();
    G.position.copy(anchor);
    baseScene.add(G);
    if (window.__lvlGroup) window.__lvlGroup(3, G);

    const mShell = new THREE.MeshStandardMaterial({
      color: 0x33444f, roughness: 0.45, metalness: 0.7,
      transparent: true, opacity: 0.30, side: THREE.DoubleSide
    });
    const mSteel = new THREE.MeshStandardMaterial({ color: 0x2f2d26, roughness: 0.5, metalness: 0.7 });
    const mTray = new THREE.MeshStandardMaterial({ color: 0x1a1a16, roughness: 0.8 });

    /* 塔体 */
    const H = 9.6, R = 1.6;
    built.R = R;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 32, 1, true), mShell);
    shell.position.y = H / 2;
    G.add(shell);
    const capT = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mSteel);
    capT.position.y = H;
    capT.scale.y = 0.42;
    G.add(capT);
    const capB = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mSteel);
    capB.rotation.z = Math.PI;
    capB.position.y = 0;
    capB.scale.y = 0.42;
    G.add(capB);

    /* 塔板：越往上越轻，颜色越冷 */
    for (let i = 0; i < 7; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.08, 28), mTray);
      t.position.y = 1.0 + i * 1.22;
      G.add(t);
    }

    /* 工业细节：平台环、直梯、顶部馏出线、裙座 —— 让它看起来像真塔 */
    const mPlate = new THREE.MeshStandardMaterial({ color: 0x3a4c58, roughness: 0.6, metalness: 0.55 });
    [2.2, 5.1, 7.9].forEach(function (yy) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.34, 0.05, 8, 40), mPlate);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = yy;
      G.add(ring);
      const rail = new THREE.Mesh(new THREE.TorusGeometry(R + 0.34, 0.022, 6, 40), mPlate);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = yy + 0.42;
      G.add(rail);
      for (let a = 0; a < 8; a += 1) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 5), mPlate);
        post.position.set(Math.cos(a * Math.PI / 4) * (R + 0.34), yy + 0.21, Math.sin(a * Math.PI / 4) * (R + 0.34));
        G.add(post);
      }
    });
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.06, H - 1.2, 0.34), mPlate);
    ladder.position.set(-(R + 0.42), H / 2 - 0.2, 0);
    G.add(ladder);
    const distill = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.5, 12), mSteel);
    distill.rotation.z = Math.PI / 2;
    distill.position.set(-(R * 0.55), H + 0.42, 0);
    G.add(distill);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.9, 0.9, 24), mSteel);
    skirt.position.y = -0.45;
    G.add(skirt);

    /* 加热炉进料 */
    const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 14), mSteel);
    inlet.rotation.z = Math.PI / 2;
    inlet.position.set(-2.0, 0.9, 0);
    G.add(inlet);
    const inletLabel = window.__lvlLabel('加热后的原油', '#93a6b2');
    inletLabel.scale.set(5.4, 0.62, 1);
    inletLabel.position.set(-2.3, 2.0, 0);
    G.add(inletLabel);

    /* 塔内上升的油气 */
    const riseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(0.22, 3.0, 0.1),
      new THREE.Vector3(-0.15, 6.0, 0),
      new THREE.Vector3(0.1, 8.6, 0)
    ]);
    built.rise = makeFlowInGroup(riseCurve, 0xf0b45e, 22, 0.13, 0.085);

    /* 抽样口 */
    PRODUCTS.forEach(function (pr, i) {
      const g = new THREE.Group();
      g.position.set(0, pr.y, 0);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 12), mSteel);
      neck.rotation.z = Math.PI / 2;
      neck.position.x = R + 0.35;
      g.add(neck);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a1a16, emissive: pr.color, emissiveIntensity: 0.25, roughness: 0.5
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 20), mat);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = R + 0.78;
      g.add(ring);
      G.add(g);
      pr.ring = ring;
      pr.mat = mat;

      const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.set(R + 0.85, pr.y, 0);
      proxy.userData.tray = i;
      G.add(proxy);
      pickables.push(proxy);

      /* 右侧接出的小罐 */
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 18), mSteel);
      tank.position.set(4.4, 0.55, (i - 1.5) * 1.5);
      G.add(tank);
      pr.tankPos = new THREE.Vector3(4.4, 1.15, (i - 1.5) * 1.5);
    });

    /* 地面 */
    const pad = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x25313a, roughness: 0.95 }));
    pad.position.set(1.0, 0.02, 0);
    G.add(pad);

    return built;
  }

  const built = {};
  const pickables = [];

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

  /* ---------- UI ---------- */
  const ui = document.createElement('div');
  ui.className = 'lvl';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">04 / 05</span><b>炼化 · 分馏</b><span class="lvl__hint" id="l4-hint">镜头正在靠近分馏塔…</span></div>',
    '<div class="lvl__act" id="l4-act" hidden>',
    '<p>原油被加热后进塔，<b>沸点低的往上走</b>。先点一个馏分，再点它该出来的位置。</p><p style="color:#9a948a;font-size:12px;margin:4px 0 8px">馏分不等于成品油：后续还要裂化、重整、加氢、精制与调和；塔上位置为教学示意。</p>',
    '<div class="lvl__chips" id="l4-chips">',
    PRODUCTS.map(function (p, i) {
      return '<button type="button" class="lvl__chip" data-p="' + p.key + '">' + p.name + '</button>';
    }).join(''),
    '</div>',
    '<div class="lvl__out"><span id="l4-note">未选择馏分</span></div>',
    '</div>',
    '<button type="button" class="lvl__back" id="l4-back">返回总览</button>'
  ].join('');
  stage.viewport.appendChild(ui);

  const hint = ui.querySelector('#l4-hint');
  const act = ui.querySelector('#l4-act');
  const note = ui.querySelector('#l4-note');
  const chips = ui.querySelector('#l4-chips');
  const back = ui.querySelector('#l4-back');

  let picked = null;
  const solved = {};
  let doneCount = 0;
  let completed = false;

  chips.addEventListener('click', function (e) {
    const b = e.target.closest('[data-p]');
    if (!b || b.disabled) return;
    picked = b.getAttribute('data-p');
    if (stage.setInteraction) stage.setInteraction('choose_fraction', picked);
    Array.from(chips.children).forEach(function (c) { c.classList.toggle('on', c === b); });
    const pr = PRODUCTS.find(function (x) { return x.key === picked; });
    note.textContent = '已选「' + pr.name + '」，点塔上它该出来的位置';
  });

  function pickTray(index) {
    if (!picked) { note.textContent = '先在上面选一个馏分'; return; }
    const want = PRODUCTS.findIndex(function (x) { return x.key === picked; });
    const pr = PRODUCTS[want];
    if (index === want) {
      solved[pr.key] = true;
      doneCount++;
      pr.mat.emissiveIntensity = 1.6;
      pr.ring.scale.setScalar(1.35);
      /* 接一条管线到側罐 */
      const from = new THREE.Vector3(built.R + 0.85, pr.y, 0);
      const to = pr.tankPos.clone();
      const mid = new THREE.Vector3((from.x + to.x) / 2 + 0.6, Math.max(from.y, to.y) + 0.5, (from.z + to.z) / 2);
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      streams[pr.key] = makeFlowInGroup(curve, pr.color, 9, 0.3, 0.055);
      note.textContent = pr.name + ' · ' + pr.hint + ' ✓';
      hint.textContent = '对了 · ' + pr.name + ' 从' + (index === 0 ? '塔顶' : index === 3 ? '塔底' : '第 ' + (index + 1) + ' 层') + '出来';
      const chip = chips.querySelector('[data-p="' + pr.key + '"]');
      if (chip) { chip.classList.add('done'); chip.disabled = true; }
      if (stage.setInteraction) stage.setInteraction('place_fraction', PRODUCTS[want] ? PRODUCTS[want].name : picked);
    if (doneCount === PRODUCTS.length) complete();
    } else {
      hint.textContent = '不对 · ' + pr.name + ' 应该更' + (index < want ? '靠下' : '靠上');
      note.textContent = pr.name + ' 不从这里出来';
    }
    picked = null;
    Array.from(chips.children).forEach(function (c) { c.classList.remove('on'); });
  }

  function complete() {
    completed = true;
    ui.classList.add('done');
    hint.textContent = '已完成 · 五种馏分各归其位';
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '炼化：分馏塔的四个抽出口' });
    log.push({ k: '动手', t: '把五种馏分放到对的塔位', d: '全对' });
    if (stage.setNodeDone) stage.setNodeDone(3, true);
    back.classList.add('pulse');
    back.textContent = '完成，返回总览 →';
    act.hidden = true;
  }

  /* ---------- 拾取 ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  stage.viewport.addEventListener('pointerup', function (e) {
    if (!stage.isLevel() || window.__l4active !== true) return;
    if (e.target.closest('.lvl')) return;
    const rect = stage.viewport.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) pickTray(hit.object.userData.tray);
  });

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

    const startPos = stage.camera.position.clone();
    const startT = new THREE.Vector3(anchor.x, 4.0, anchor.z);
    camera.position.copy(startPos);
    camera.lookAt(startT);

    stage.use(baseScene, camera);
    if (stage.setOverviewVisible) stage.setOverviewVisible(false);
    window.__l4active = true;
    ui.classList.add('on');
    document.body.classList.add('in-level');
    hint.textContent = '镜头正在靠近分馏塔…';
    if (!running) { running = true; loop(); }

    fly(startPos, startT,
      new THREE.Vector3(anchor.x + 7.2, 10.2, anchor.z + 16.5), new THREE.Vector3(anchor.x + 1.2, 4.4, anchor.z), 1800, function () {
        hint.textContent = '越轻的馏分 · 从越高的位置出来';
        act.hidden = false;
      });
  }

  function exit() {
    act.hidden = true;
    ui.classList.remove('on', 'done');
    document.body.classList.remove('in-level');
    window.__l4active = false;
    fly(camera.position.clone(), new THREE.Vector3(anchor.x + 0.6, 4.6, anchor.z),
      new THREE.Vector3(anchor.x, 11, anchor.z + 20), new THREE.Vector3(0, 1.2, 0), 1500, function () {
        running = false;
        if (stage.setOverviewVisible) stage.setOverviewVisible(true);
        stage.back();
        const seg = document.querySelector('#stages [data-stage="3"]');
        if (seg) seg.classList.add('done-level');
      });
  }

  back.onclick = exit;
  window.__lvlEntry(3, '进入 04 炼化', enter);
  window.__l4 = { enter: enter, exit: exit };
})();
