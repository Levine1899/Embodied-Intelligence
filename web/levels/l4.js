/* 关卡 04｜炼化 —— 常减压装置近景
 * 使用现有 tower.obj 装置群：常压塔、减压塔、加热炉、管廊、侧线/产品箱。
 * 三档剖切、进料、汽液接触、塔板和馏分路径都绑定同一 atmospheric_tower 逻辑设备。
 */
(function () {
  const stage = window.__stage;
  if (!stage || !window.__lvlEntry) return;
  const THREE = window.THREE;

  let G = null, camera = null, baseScene = null, anchor = null;
  let unit = null, assetLoaded = false;
  const fullMeshes = [], halfMeshes = [], trayMeshes = [], internals = [];
  const flows = [];
  const fractionGroups = {};
  let feedGroup = null, feedGroups = {}, trayGroup = null, flowGroup = null;
  let level = 0, flowOn = false, flowPaused = false, selectedFraction = null;
  let running = false, lastT = performance.now();

  const SCALE = 0.46;
  const FRACTIONS = [
    { key: 'topgas', name: '塔顶油气', y: 12.4, color: 0xbfd8cf, route: '冷凝/气分（典型示意）' },
    { key: 'naphtha', name: '石脑油馏分', y: 9.66, color: 0x9fd3c6, route: '重整 / 乙烯原料（典型示意）' },
    { key: 'kerosene', name: '煤油馏分', y: 8.46, color: 0xd8c9a0, route: '航煤 / 精制（典型示意）' },
    { key: 'diesel', name: '柴油馏分', y: 7.27, color: 0xd8a24a, route: '加氢精制 / 调和（典型示意）' },
    { key: 'residue', name: '常压渣油', y: 6.07, color: 0xb38a4a, route: '减压蒸馏 / 深加工（典型示意）' }
  ];

  function makeFlow(curve, color, count, speed, size, parent) {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(size, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.userData.t = i / count;
      group.add(m);
      items.push(m);
    }
    (parent || G).add(group);
    return {
      group: group,
      items: items,
      update: function (dt) {
        items.forEach(function (m) {
          m.userData.t = (m.userData.t + dt * speed) % 1;
          m.position.copy(curve.getPoint(m.userData.t));
        });
      }
    };
  }

  function build() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[3] || new THREE.Vector3(24, 0, -11);
    anchor = new THREE.Vector3(p.x, 0, p.z);

    G = new THREE.Group();
    G.position.copy(anchor);
    baseScene.add(G);
    if (window.__lvlGroup) window.__lvlGroup(3, G);

    /* 先用一个薄底座占位；Hero 加载后整个装置群替换它。 */
    const pad = new THREE.Mesh(new THREE.BoxGeometry(17, 0.12, 11), new THREE.MeshStandardMaterial({ color: 0x25313a, roughness: 0.95 }));
    pad.position.set(0.8, 0.02, 0);
    G.add(pad);

    buildUi();
    loadAsset();
    buildTowerLabels();
    buildInternals();
    buildPaths();
    buildTrayHighlight();
    syncUi();
    return G;
  }

  function loadAsset() {
    if (!window.ObjLite) { hint.textContent = '装置模型加载器不可用'; return; }
    window.ObjLite.load('assets/tower/tower.obj?v=06', 'assets/tower/tower.mtl?v=06').then(function (root) {
      unit = root;
      unit.scale.setScalar(SCALE);
      unit.position.set(0, 0, 0);
      G.add(unit);
      unit.traverse(function (o) {
        if (!o.isMesh) return;
        const n = o.name || '';
        if (n === 'Ground') { o.visible = false; return; }
        if (/ShellHalf$|DomeHalf$/.test(n)) {
          halfMeshes.push(o);
          o.visible = false;
          if (o.material) { o.material.transparent = true; o.material.side = THREE.DoubleSide; o.material.needsUpdate = true; }
        } else if (/^(Tower_Atmospheric_Shell|Tower_Vacuum_Shell|Tower_Atmospheric_Dome|Tower_Vacuum_Dome)$/.test(n)) {
          fullMeshes.push(o);
        } else if (/^Trays_/.test(n)) {
          trayMeshes.push(o);
          o.visible = false;
        }
        if (/^Heater|^Pipe_Feed|^Pipe_Bottom|^Pipe_Side|^Pipe_Top|^Box_|^Pump_|^Railing_|^Ladder|^Skirt|^Manway_|^Nozzle_|^Flange_/.test(n)) {
          o.userData.towerPart = true;
        }
      });
      assetLoaded = true;
      setLevel(0, false);
      if (stage.deviceState) {
        stage.deviceState.bind('atmospheric_tower', 'detail', unit);
        stage.deviceState.bind('vacuum_tower', 'detail', unit);
        stage.deviceState.bind('heater', 'detail', unit);
        stage.deviceState.select('atmospheric_tower');
      }
      syncUi();
      hint.textContent = '常减压装置 · 常压塔 / 减压塔 / 加热炉';
    }).catch(function () {
      hint.textContent = '装置模型加载失败；可用 tower.html 的 2D 剖面 fallback';
    });
  }

  function buildTowerLabels() {
    const defs = [
      ['常压塔', [0, 13.2, 0], '#c9d6dc'],
      ['减压塔', [3.5, 8.0, 0], '#8fb6ad'],
      ['加热炉', [-3.2, 4.4, 0], '#d8a24a'],
      ['馏分出口', [4.5, 8.8, 0], '#d8c9a0']
    ];
    defs.forEach(function (d) {
      const l = window.__lvlLabel(d[0], d[2]);
      l.position.set(d[1][0], d[1][1], d[1][2]);
      l.scale.setScalar(0.72);
      G.add(l);
    });
  }

  function buildInternals() {
    internals.length = 0;
    flowGroup = new THREE.Group();
    G.add(flowGroup);
    const vaporMat = new THREE.MeshBasicMaterial({ color: 0x9fd3c6, transparent: true, opacity: 0.9, depthWrite: false });
    const liqMat = new THREE.MeshBasicMaterial({ color: 0xd8a24a, transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < 20; i++) {
      const v = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 6), vaporMat);
      const a = (i / 20) * Math.PI * 2;
      const rr = 0.15 + (i % 4) * 0.11;
      v.position.set(Math.cos(a) * rr, 1.4 + (i / 20) * 9.8, Math.sin(a) * rr);
      v.userData.base = v.position.y;
      v.userData.dir = 1;
      flowGroup.add(v);
      internals.push(v);
    }
    for (let i = 0; i < 14; i++) {
      const q = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), liqMat);
      const a = (i / 14) * Math.PI * 2;
      const rr = 0.48 + (i % 3) * 0.1;
      q.position.set(Math.cos(a) * rr, 1.2 + (i / 14) * 9.0, Math.sin(a) * rr);
      q.userData.base = q.position.y;
      q.userData.dir = -1;
      flowGroup.add(q);
      internals.push(q);
    }
    flowGroup.visible = false;
  }

  function buildPaths() {
    /* 两条教学进料路径：加热炉→常压塔中部；常压塔底→减压塔。 */
    function makeFeed(name, pts, color) {
      const group = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.035, 6, false),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85 }));
      group.add(tube);
      G.add(group);
      group.visible = false;
      feedGroups[name] = group;
      return group;
    }
    makeFeed('atm', [
      new THREE.Vector3(-3.25 * 0.46, 2.3, 0),
      new THREE.Vector3(-2.4, 3.4, 0),
      new THREE.Vector3(-1.2, 5.8, 0)
    ], 0xd8a24a);
    makeFeed('vac', [
      new THREE.Vector3(0.7, 2.2, 0),
      new THREE.Vector3(1.8, 2.7, 0),
      new THREE.Vector3(3.0, 3.4, 0)
    ], 0xd8a24a);
    feedGroup = null;

    FRACTIONS.forEach(function (f) {
      const from = new THREE.Vector3(1.2, f.y, 0);
      const to = new THREE.Vector3(4.35, f.y, 0);
      const curve = new THREE.CatmullRomCurve3([
        from,
        new THREE.Vector3(2.4, f.y + 0.12, 0),
        new THREE.Vector3(3.4, f.y, 0),
        to
      ]);
      const group = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.028, 6, false),
        new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.8 }));
      group.add(tube);
      group.visible = false;
      G.add(group);
      const flow = makeFlow(curve, f.color, 7, 0.35, 0.06, group);
      flow.group.visible = true;
      fractionGroups[f.key] = { group: group, flow: flow };
    });
  }

  function buildTrayHighlight() {
    trayGroup = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x9fd3c6, transparent: true, opacity: 0.7 });
    [3.2, 5.2, 7.2, 9.2].forEach(function (y) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.018, 6, 30), m);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      trayGroup.add(ring);
    });
    trayGroup.visible = false;
    G.add(trayGroup);
  }

  function syncUi() {
    if (!ui) return;
    ui.querySelectorAll('[data-level]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-level')) === level));
    });
    const flowBtn = ui.querySelector('#l4-flow');
    if (flowBtn) {
      flowBtn.textContent = flowOn ? (flowPaused ? '继续汽液' : '暂停汽液') : '启动汽液接触';
      flowBtn.setAttribute('aria-pressed', String(flowOn));
    }
    ['atm', 'vac'].forEach(function (k) {
      const b = ui.querySelector('#l4-feed-' + k);
      if (b) b.setAttribute('aria-pressed', String(feedGroups[k] && feedGroups[k].visible));
    });
    const trayBtn = ui.querySelector('#l4-tray');
    if (trayBtn) trayBtn.setAttribute('aria-pressed', String(trayGroup && trayGroup.visible));
    FRACTIONS.forEach(function (f) {
      const b = ui.querySelector('[data-fraction="' + f.key + '"]');
      if (b) b.setAttribute('aria-pressed', String(selectedFraction === f.key));
    });
  }

  function setLevel(n, record) {
    level = Math.max(0, Math.min(2, Number(n) || 0));
    fullMeshes.forEach(function (o) { o.visible = level === 0; });
    halfMeshes.forEach(function (o) {
      o.visible = level > 0;
      if (o.material) {
        o.material.transparent = true;
        o.material.opacity = level === 2 ? 0.18 : 1;
        o.material.depthWrite = level !== 2;
        o.material.needsUpdate = true;
      }
    });
    trayMeshes.forEach(function (o) { o.visible = level > 0; });
    if (flowGroup) flowGroup.visible = flowOn && level > 0;
    if (trayGroup) trayGroup.visible = trayGroup.userData.on === true && level > 0;
    const names = ['外观', '半剖', '全剖'];
    hint.textContent = '常减压装置 · ' + names[level];
    syncUi();
    if (stage.deviceState) {
      ['atmospheric_tower', 'vacuum_tower'].forEach(function (id) {
        stage.deviceState.set(id, { structure: level === 0 ? 'external' : (level === 1 ? 'half' : 'full') }, 'level');
      });
    }
    if (record !== false && stage.setInteraction) stage.setInteraction('inspect_tower_structure', level === 0 ? 'external' : (level === 1 ? 'half' : 'full'), '示意');
    if (camera) {
      const target = new THREE.Vector3(anchor.x + 0.5, 5.0, anchor.z);
      const dist = level === 0 ? 23 : 16;
      fly(camera.position.clone(), target, new THREE.Vector3(anchor.x + dist * 0.45, 8.8, anchor.z + dist), target, 1000);
    }
  }

  function selectFraction(key) {
    selectedFraction = key;
    Object.keys(fractionGroups).forEach(function (k) { fractionGroups[k].group.visible = false; });
    const f = FRACTIONS.find(function (x) { return x.key === key; });
    if (!f) return;
    fractionGroups[key].group.visible = true;
    if (stage.setInteraction) stage.setInteraction('select_fraction', key, '示意');
    if (stage.setContextObject) stage.setContextObject('atmospheric_tower', 'refining');
    note.innerHTML = '<b>' + f.name + '</b> → ' + f.route + '<br><span style="color:#9a948a">馏分不是最终成品油；路线为典型示意，不代表唯一工艺。</span>';
    hint.textContent = f.name + ' · 侧线馏分路径（教学示意）';
    syncUi();
  }

  let ui = null;
  let hint = null, note = null, back = null;

  function buildUiOnce() {
    if (ui) return;
    ui = document.createElement('div');
    ui.className = 'lvl';
    ui.innerHTML = [
      '<div class="lvl__bar"><span class="lvl__step">04 / 05</span><b>炼化 · 常减压</b><span class="lvl__hint" id="l4-hint">装置群正在加载…</span></div>',
      '<div class="lvl__act" id="l4-act" hidden>',
      '<p>常压塔按<b>沸点范围</b>切分馏分；切到半剖/全剖看塔板。馏分 ≠ 成品油。</p>',
      '<div class="lvl__btns" role="group" aria-label="塔体剖切">',
      '<button type="button" class="lvl__btn" data-level="0" aria-pressed="true">外观</button>',
      '<button type="button" class="lvl__btn" data-level="1" aria-pressed="false">半剖</button>',
      '<button type="button" class="lvl__btn" data-level="2" aria-pressed="false">全剖</button>',
      '</div>',
      '<div class="lvl__btns" role="group" aria-label="塔内过程">',
      '<button type="button" class="lvl__btn" id="l4-feed-atm" aria-pressed="false">常压进料</button><button type="button" class="lvl__btn" id="l4-feed-vac" aria-pressed="false">减压进料</button>',
      '<button type="button" class="lvl__btn" id="l4-flow" aria-pressed="false">启动汽液接触</button>',
      '<button type="button" class="lvl__btn" id="l4-tray" aria-pressed="false">塔板结构</button>',
      '<button type="button" class="lvl__btn" id="l4-replay">重播</button>',
      '<button type="button" class="lvl__btn" id="l4-reset">恢复外观</button>',
      '</div>',
      '<div class="lvl__chips" id="l4-chips" role="group" aria-label="选择馏分">',
      FRACTIONS.map(function (f) { return '<button type="button" class="lvl__chip" data-fraction="' + f.key + '">' + f.name + '</button>'; }).join(''),
      '</div>',
      '<div class="lvl__out"><span id="l4-note">先选一个馏分，查看它的典型去向。</span></div>',
      '</div>',
      '<button type="button" class="lvl__back" id="l4-back">返回总览</button>'
    ].join('');
    stage.viewport.appendChild(ui);
    hint = ui.querySelector('#l4-hint');
    note = ui.querySelector('#l4-note');
    back = ui.querySelector('#l4-back');
    ui.querySelectorAll('[data-level]').forEach(function (b) {
      b.addEventListener('click', function () { setLevel(Number(b.getAttribute('data-level'))); });
    });
    ['atm', 'vac'].forEach(function (k) {
      ui.querySelector('#l4-feed-' + k).addEventListener('click', function () {
        Object.keys(feedGroups).forEach(function (x) { feedGroups[x].visible = false; });
        feedGroups[k].visible = true;
        feedGroup = feedGroups[k];
        if (stage.setInteraction) stage.setInteraction('choose_feed_position', k === 'atm' ? '常压塔中部' : '减压塔入口', '示意');
        hint.textContent = k === 'atm' ? '常压进料 · 加热炉 → 常压塔中部' : '减压进料 · 常压塔底 → 减压塔入口';
        syncUi();
      });
    });
    ui.querySelector('#l4-flow').addEventListener('click', function () {
      if (!flowOn) {
        flowOn = true; flowPaused = false;
        if (level === 0) setLevel(1, false);
        if (stage.deviceState) stage.deviceState.set('atmospheric_tower', { animation: 'running' }, 'level');
      if (stage.setInteraction) stage.setInteraction('start_vapor_liquid', 'atmospheric_tower', '示意');
      } else if (!flowPaused) {
        flowPaused = true;
        if (stage.deviceState) stage.deviceState.set('atmospheric_tower', { animation: 'paused' }, 'level');
        if (stage.setInteraction) stage.setInteraction('pause_vapor_liquid', 'atmospheric_tower', '示意');
      } else {
        flowPaused = false;
        if (stage.deviceState) stage.deviceState.set('atmospheric_tower', { animation: 'running' }, 'level');
        if (stage.setInteraction) stage.setInteraction('resume_vapor_liquid', 'atmospheric_tower', '示意');
      }
      if (flowGroup) flowGroup.visible = level > 0;
      hint.textContent = flowPaused ? '汽液接触已暂停' : '汽相上升 · 液相下降（教学示意，不是 CFD）';
      syncUi();
    });
    ui.querySelector('#l4-tray').addEventListener('click', function () {
      if (!trayGroup) return;
      trayGroup.userData.on = !(trayGroup.userData.on === true);
      trayGroup.visible = trayGroup.userData.on && level > 0;
      if (stage.setInteraction) stage.setInteraction('inspect_tower_trays', 'atmospheric_tower', '示意');
      hint.textContent = '塔板/泡罩/降液板 · 让汽液反复接触';
      syncUi();
    });
    ui.querySelector('#l4-replay').addEventListener('click', function () {
      internals.forEach(function (p) { p.position.y = p.userData.base; });
      flowOn = true; flowPaused = false;
      if (flowGroup) flowGroup.visible = level > 0;
      selectedFraction = null;
      Object.keys(fractionGroups).forEach(function (k) { fractionGroups[k].group.visible = false; });
      if (stage.setInteraction) stage.setInteraction('replay_refining_flow', 'atmospheric_tower', '示意');
      hint.textContent = '重播：进料、汽液、侧线路径回到起点';
      syncUi();
    });
    ui.querySelector('#l4-reset').addEventListener('click', function () {
      flowOn = false; flowPaused = false; selectedFraction = null;
      if (stage.deviceState) stage.deviceState.set('atmospheric_tower', { animation: 'idle' }, 'level');
      Object.keys(feedGroups).forEach(function (k) { feedGroups[k].visible = false; });
      feedGroup = null;
      if (trayGroup) { trayGroup.userData.on = false; trayGroup.visible = false; }
      Object.keys(fractionGroups).forEach(function (k) { fractionGroups[k].group.visible = false; });
      setLevel(0);
      if (stage.setInteraction) stage.setInteraction('restore_refining_view', 'atmospheric_tower', '示意');
      note.textContent = '已恢复外观；可重新打开剖切或选择馏分。';
    });
    ui.querySelector('#l4-chips').addEventListener('click', function (e) {
      const b = e.target.closest('[data-fraction]');
      if (b) selectFraction(b.getAttribute('data-fraction'));
    });
    back.onclick = exit;
  }

  /* UI 需要先存在才能被 loadAsset 回调更新；build() 中创建。 */
  function buildUi() { buildUiOnce(); }

  /* ---------- 相机 ---------- */
  let flyHandle = null;
  function fly(from, fromT, to, toT, dur) {
    if (!camera) return;
    const t0 = performance.now();
    if (flyHandle) cancelAnimationFrame(flyHandle);
    const ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = ease(k);
      camera.position.lerpVectors(from, to, e);
      camera.lookAt(new THREE.Vector3().lerpVectors(fromT, toT, e));
      if (k < 1) flyHandle = requestAnimationFrame(step);
    })();
  }

  function ensureCamera() {
    if (!camera) camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    camera.aspect = (stage.viewport.clientWidth || 800) / (stage.viewport.clientHeight || 480);
    camera.updateProjectionMatrix();
  }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!stage.isLevel()) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    flows.forEach(function (f) { if (!flowPaused) f.update(dt); });
    Object.keys(fractionGroups).forEach(function (k) {
      if (fractionGroups[k].group.visible) fractionGroups[k].flow.update(dt);
    });
    if (flowOn && !flowPaused) {
      internals.forEach(function (p) {
        p.position.y += p.userData.dir * dt * 0.45;
        if (p.position.y > 11.8) p.position.y = 1.2;
        if (p.position.y < 1.2) p.position.y = 11.8;
      });
    }
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
    if (stage.setContextObject) stage.setContextObject('atmospheric_tower', 'refining');
    if (stage.deviceState) {
      stage.deviceState.select('atmospheric_tower');
      if (assetLoaded) stage.deviceState.bind('atmospheric_tower', 'detail', unit);
    }
    if (!running) { running = true; loop(); }
    setLevel(0, false);
    fly(startPos, startT,
      new THREE.Vector3(anchor.x + 12.0, 8.0, anchor.z + 16.0),
      new THREE.Vector3(anchor.x + 0.8, 4.4, anchor.z), 1700);
    setTimeout(function () {
      if (!window.__l4active) return;
      ui.querySelector('#l4-act').hidden = false;
      hint.textContent = assetLoaded ? '装置群 · 选择剖切、进料或馏分' : '装置模型加载中…';
    }, 1500);
  }

  function exit() {
    window.__l4active = false;
    ui.querySelector('#l4-act').hidden = true;
    ui.classList.remove('on');
    document.body.classList.remove('in-level');
    if (stage.setContextObject) stage.setContextObject(null, 'refining');
    if (stage.deviceState) stage.deviceState.select(null);
    fly(camera.position.clone(), new THREE.Vector3(anchor.x + 0.6, 5.0, anchor.z),
      new THREE.Vector3(anchor.x, 11, anchor.z + 20), new THREE.Vector3(0, 1.2, 0), 1500);
    setTimeout(function () {
      running = false;
      if (stage.setOverviewVisible) stage.setOverviewVisible(true);
      stage.back();
      const seg = document.querySelector('#stages [data-stage="3"]');
      if (seg) seg.classList.add('done-level');
    }, 1600);
  }

  function buildUi() { buildUiOnce(); }

  window.__lvlEntry(3, '进入 04 炼化', enter);
  window.__l4 = {
    enter: enter, exit: exit, setLevel: setLevel,
    get level() { return level; }, get loaded() { return assetLoaded; },
    get flowOn() { return flowOn; }, get flowPaused() { return flowPaused; },
    get selectedFraction() { return selectedFraction; },
    get groups() { return { full: fullMeshes.length, half: halfMeshes.length, trays: trayMeshes.length }; }
  };
})();
