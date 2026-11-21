/* 关卡 05｜产品去向 —— 同样长在 V2 的场景里
   台面上摆 8 件东西，挑出「来自石油」的那几件。
   多选判断：点亮选中的，点「确认」校验。 */
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null, camera = null, baseScene = null, anchor = null;
  const pickables = [];
  const built = {};

  /* 石基 = true 表示来自石油 */
  const ITEMS = [
    { name: '汽油', oil: true, shape: 'box' },
    { name: '柴油', oil: true, shape: 'cyl' },
    { name: '航空煤油', oil: true, shape: 'cone' },
    { name: '沥青', oil: true, shape: 'sphere' },
    { name: '塑料', oil: true, shape: 'box' },
    { name: '石蜡', oil: true, shape: 'cyl' },
    { name: '玻璃', oil: false, shape: 'box' },
    { name: '棉花', oil: false, shape: 'sphere' },
    { name: '水泥', oil: false, shape: 'cyl' },
    { name: '食盐', oil: false, shape: 'cone' }
  ];

  function build() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[4] || new THREE.Vector3(-5, 0, 5);
    anchor = new THREE.Vector3(p.x, 0, p.z);

    G = new THREE.Group();
    G.position.copy(anchor);
    baseScene.add(G);
    if (window.__lvlGroup) window.__lvlGroup(4, G);

    const mNeutral = new THREE.MeshStandardMaterial({ color: 0x3a3830, roughness: 0.55, metalness: 0.45 });
    const mPad = new THREE.MeshStandardMaterial({ color: 0x252420, roughness: 0.95 });

    const pad = new THREE.Mesh(new THREE.BoxGeometry(13, 0.14, 7.4), mPad);
    pad.position.set(0, 0.03, 0);
    G.add(pad);

    const cols = 5;
    ITEMS.forEach(function (it, i) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = (col - (cols - 1) / 2) * 2.95;
      const z = row === 0 ? -2.0 : 2.2;

      const g = new THREE.Group();
      g.position.set(x, 0.1, z);

      const m = mNeutral.clone();
      let mesh;
      if (it.shape === 'box') mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), m);
      else if (it.shape === 'cyl') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.95, 20), m);
      else if (it.shape === 'cone') mesh = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.0, 20), m);
      else mesh = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 14), m);
      mesh.position.y = 0.62;
      g.add(mesh);

      /* 选中时的环 */
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.055, 8, 26),
        new THREE.MeshStandardMaterial({ color: 0x1a1a16, emissive: 0xd8a24a, emissiveIntensity: 0, roughness: 0.5 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      g.add(ring);

      const lb = window.__lvlLabel(it.name, '#c9d6dc');
      lb.scale.set(1.6, 0.5, 1);
      lb.position.set(0, 1.85, 0);
      g.add(lb);

      const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.position.set(x, 0.75, z);
      proxy.userData.item = i;
      G.add(proxy);
      pickables.push(proxy);

      G.add(g);
      it.mesh = mesh;
      it.ring = ring;
      it.ringMat = ring.material;
    });

    const title = window.__lvlLabel('哪些来自石油？', '#f0a22e');
    title.scale.set(3.1, 0.72, 1);
    title.position.set(0, 4.2, -1.5);
    G.add(title);

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

  /* ---------- UI ---------- */
  const ui = document.createElement('div');
  ui.className = 'lvl lvl--bottom';
  ui.innerHTML = [
    '<div class="lvl__bar"><span class="lvl__step">05 / 05</span><b>产品去向 · 挑出来自石油的</b><span class="lvl__hint" id="l5-hint">镜头正在靠近产品台…</span></div>',
    '<div class="lvl__act" id="l5-act" hidden>',
    '<p>这些是同一批出厂的东西。<b>点出真正来自石油的</b>，其他不用管。</p>',
    '<div class="lvl__row"><b id="l5-count">已选 0</b><button type="button" class="lvl__chip on" id="l5-check">确认选择</button></div>',
    '<div class="lvl__out"><span id="l5-note">还没选</span></div>',
    '</div>',
    '<button type="button" class="lvl__back" id="l5-back">返回总览</button>'
  ].join('');
  stage.viewport.appendChild(ui);

  const hint = ui.querySelector('#l5-hint');
  const act = ui.querySelector('#l5-act');
  const countEl = ui.querySelector('#l5-count');
  const note = ui.querySelector('#l5-note');
  const checkBtn = ui.querySelector('#l5-check');
  const back = ui.querySelector('#l5-back');

  const picked = new Set();
  let completed = false;

  function refreshCount() {
    countEl.textContent = '已选 ' + picked.size;
  }

  function toggle(i) {
    const it = ITEMS[i];
    if (!it) return;
    if (picked.has(i)) {
      picked.delete(i);
      it.ringMat.emissiveIntensity = 0;
      it.mesh.material.color.setHex(0x3a3830);
      it.mesh.scale.setScalar(1);
    } else {
      picked.add(i);
      it.ringMat.emissiveIntensity = 1.8;
      it.mesh.material.color.setHex(0x6a5426);
      it.mesh.scale.setScalar(1.14);
    }
    refreshCount();
    note.textContent = '已选 ' + picked.size + ' 件';
  }

  checkBtn.addEventListener('click', function () {
    if (completed) return;
    const oilIdx = ITEMS.map(function (it, i) { return it.oil ? i : -1; }).filter(function (i) { return i >= 0; });
    const missing = oilIdx.filter(function (i) { return !picked.has(i); });
    const extra = Array.from(picked).filter(function (i) { return !ITEMS[i].oil; });

    if (!missing.length && !extra.length) {
      complete();
      return;
    }
    const parts = [];
    if (missing.length) parts.push('漏了 ' + missing.map(function (i) { return ITEMS[i].name; }).join('、'));
    if (extra.length) parts.push('多了 ' + extra.map(function (i) { return ITEMS[i].name; }).join('、'));
    hint.textContent = '再想想 · ' + parts.join('，');
    note.textContent = parts.join('；');
  });

  function complete() {
    completed = true;
    ui.classList.add('done');
    hint.textContent = '已完成 · 石油不只是燃料';
    ITEMS.forEach(function (it, i) {
      it.ringMat.emissiveIntensity = it.oil ? 1.9 : 0;
      it.ringMat.emissive.setHex(it.oil ? 0xd8a24a : 0x2a333a);
      it.mesh.material.color.setHex(it.oil ? 0x5c4a2a : 0x3a3830);
    });
    const log = (window.__leadai && window.__leadai.ledger) || [];
    log.push({ k: '看', t: '产品去向：石油制品与它以外的东西' });
    log.push({ k: '动手', t: '挑出真正来自石油的', d: picked.size + ' 件' });
    if (stage.setNodeDone) stage.setNodeDone(4, true);
    back.classList.add('pulse');
    back.textContent = '完成，返回总览 →';
    checkBtn.disabled = true;
    note.textContent = '六件石油制品 · 四件不是';
  }

  /* ---------- 拾取 ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  stage.viewport.addEventListener('pointerup', function (e) {
    if (!stage.isLevel() || window.__l5active !== true) return;
    if (e.target.closest('.lvl')) return;
    const rect = stage.viewport.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) toggle(hit.object.userData.item);
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
    const startT = new THREE.Vector3(anchor.x, 1.4, anchor.z);
    camera.position.copy(startPos);
    camera.lookAt(startT);

    stage.use(baseScene, camera);
    if (stage.setOverviewVisible) stage.setOverviewVisible(false);
    window.__l5active = true;
    ui.classList.add('on');
    document.body.classList.add('in-level');
    hint.textContent = '镜头正在靠近产品台…';
    refreshCount();

    fly(startPos, startT,
      new THREE.Vector3(anchor.x, 11.5, anchor.z + 10.5), new THREE.Vector3(anchor.x, 1.2, anchor.z), 1800, function () {
        hint.textContent = '点出真正来自石油的';
        act.hidden = false;
      });
  }

  function exit() {
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

  back.onclick = exit;
  window.__lvlEntry(4, '进入 05 产品去向', enter);
  window.__l5 = { enter: enter, exit: exit };
})();
