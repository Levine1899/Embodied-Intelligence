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
  const detailGroups = {};
  let detailBindings = [];
  let residueTarget = 'vacuum_tower';
  const fullMeshes = [], halfMeshes = [], trayMeshes = [], insulationMeshes = [], internals = [];
  const flows = [];
  const fractionGroups = {};
  let feedGroup = null, feedGroups = {}, trayGroup = null, flowGroup = null;
  let level = 1, flowOn = false, flowPaused = false, selectedFraction = null;
  const pipeMeshes = [];
  let running = false, lastT = performance.now();
  let enterTimer = null, exitTimer = null;
  const hiddenWorld = [];
  let hotspotGroup = null;
  let pipeClip = null;
  const hotspotMeshes = [];
  let selectedHotspot = null;

  const SCALE = 0.46;
  const FRACTIONS = [
    { key: 'topgas', name: '塔顶油气', y: 12.4, color: 0xbfd8cf, route: '冷凝/气分（典型路线）', target: 'atmospheric_tower' },
    { key: 'naphtha', name: '石脑油馏分', y: 9.66, color: 0x9fd3c6, route: '重整 / 乙烯原料（典型路线）', target: 'atmospheric_tower' },
    { key: 'kerosene', name: '煤油馏分', y: 8.46, color: 0xd8c9a0, route: '航煤 / 精制（典型路线）', target: 'atmospheric_tower' },
    { key: 'diesel', name: '柴油馏分', y: 7.27, color: 0xd8a24a, route: '加氢精制 / 调和（典型路线）', target: 'atmospheric_tower' },
    { key: 'residue', name: '常压渣油', y: 3.2, color: 0xb38a4a, route: '塔底 → 减压蒸馏 / 深加工（典型路线）', target: 'vacuum_tower' }
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

  function isolateWorld() {
    if (!baseScene || hiddenWorld.length) return;
    baseScene.children.forEach(function (child) {
      if (child === G || child.isLight || child.isCamera) return;
      if (child.visible) { hiddenWorld.push(child); child.visible = false; }
    });
  }

  function restoreWorld() {
    hiddenWorld.forEach(function (child) { child.visible = true; });
    hiddenWorld.length = 0;
  }

  function build() {
    baseScene = stage.baseScene;
    const nodes = stage.nodes || [];
    const p = nodes[3] || new THREE.Vector3(24, 0, -11);
    anchor = new THREE.Vector3(p.x, 0, p.z);
    /* 管道随塔体一起在镜头这一侧切开，便于看到管内的流。 */
    pipeClip = new THREE.Plane(new THREE.Vector3(0, 0, -1), anchor.z);

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
    buildHotspots();
    buildInternals();
    buildPaths();
    buildTrayHighlight();
    syncUi();
    return G;
  }

  function splitAndBindDetails() {
    if (!unit || detailGroups.atmospheric_tower) { bindDetails(); return; }
    const meshes = [];
    unit.traverse(function (o) { if (o.isMesh) meshes.push(o); });
    ['atmospheric_tower', 'vacuum_tower', 'heater'].forEach(function (id) {
      const g = new THREE.Group();
      g.name = 'L4_Detail_' + id;
      unit.add(g);
      detailGroups[id] = g;
    });
    meshes.forEach(function (o) {
      const n = o.name || '';
      let id = null;
      if (/^Tower_Atmospheric|^Trays_A|^Pipe_Side_(Naphtha|Kerosene|Diesel)|^Box_(Naphtha|Kerosene|Diesel)|^Pipe_Top|^Pipe_Feed/.test(n)) id = 'atmospheric_tower';
      else if (/^Tower_Vacuum|^Trays_V|^Condenser|^Pipe_Bottom_To_Vacuum|^Pipe_Residue_Bottom|^Box_Residue/.test(n)) id = 'vacuum_tower';
      else if (/^Heater/.test(n)) id = 'heater';
      if (id) detailGroups[id].attach(o);
    });
    bindDetails();
  }

  function bindDetails() {
    if (!stage.deviceState || !detailGroups.atmospheric_tower) return;
    ['atmospheric_tower', 'vacuum_tower', 'heater'].forEach(function (id) {
      stage.deviceState.bind(id, 'detail', detailGroups[id]);
    });
    detailBindings = ['atmospheric_tower', 'vacuum_tower', 'heater'];
  }

  /* 管道物质色：进料/油气/石脑油/煤油/柴油/渣油分开，便于在图里对应物质。 */
  function pipeColor(name) {
    if (/Pipe_Feed/.test(name)) return 0xe0a24a;
    if (/Pipe_Top/.test(name)) return 0xbfd8cf;
    if (/Naphtha/.test(name)) return 0x9fd3c6;
    if (/Kerosene/.test(name)) return 0xd8c9a0;
    if (/Diesel/.test(name)) return 0xd8a24a;
    if (/Vacuum|Residue|Bottom/.test(name)) return 0xb38a4a;
    return 0x9fb7c0;
  }

  function loadAsset() {
    if (!window.ObjLite) { hint.textContent = '装置模型加载器不可用'; return; }
    window.ObjLite.load('assets/tower/tower.obj?v=08', 'assets/tower/tower.mtl?v=08').then(function (root) {
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
        } else if (/^Insulation_Band/.test(n)) {
          insulationMeshes.push(o);
        }
        if (/^Pipe_/.test(n)) {
          pipeMeshes.push(o);
          if (o.material) {
            o.material = o.material.clone();
            o.material.color.setHex(pipeColor(n));
            o.userData.pipeColor = pipeColor(n);
            o.material.transparent = true;
            o.material.opacity = 1;
            o.material.depthWrite = true;
            o.material.side = THREE.DoubleSide;
            o.material.needsUpdate = true;
          }
        }
        if (/^Heater|^Pipe_Feed|^Pipe_Bottom|^Pipe_Side|^Pipe_Top|^Box_|^Pump_|^Railing_|^Ladder|^Skirt|^Manway_|^Nozzle_|^Flange_|^Exchanger_|^PumpSkid_|^PipeRack_|^Platform_|^Foundation_|^Stair_/.test(n)) {
          o.userData.towerPart = true;
        }
      });
      assetLoaded = true;
      splitAndBindDetails();
      if (!window.__l4active) { unit.visible = false; return; }
      unit.visible = true;
      setLevel(1, false);
      if (stage.deviceState) stage.deviceState.select('atmospheric_tower');
      syncUi();
      hint.textContent = '常减压装置 · 常压塔 / 减压塔 / 加热炉';
    }).catch(function () {
      if (window.__l4active) hint.textContent = '装置模型加载失败；可用 tower.html 的 2D 剖面 fallback';
    });
  }

  function buildTowerLabels() {
    const defs = [
      ['常压塔', [0, 12.8, 0], '#c9d6dc'],
      ['减压塔', [4.5, 7.2, 0], '#8fb6ad'],
      ['加热炉', [-3.7, 3.8, 0], '#d8a24a']
    ];
    defs.forEach(function (d) {
      const l = window.__lvlLabel(d[0], d[2]);
      l.position.set(d[1][0], d[1][1], d[1][2]);
      l.scale.multiplyScalar(1.9);
      G.add(l);
    });
  }


  const HOTSPOTS = [
    { id: 'atm', objectId: 'atmospheric_tower', label: '常压塔', pos: [0, 8.4, 0], color: 0xc9d6dc, text: '常压塔按沸点范围分馏；切到半剖/全剖看塔板。' },
    { id: 'vacuum', objectId: 'vacuum_tower', label: '减压塔', pos: [3.5, 6.2, 0], color: 0x8fb6ad, text: '减压塔降低压力，让重油在较低温度继续分离，避免高温裂解。' },
    { id: 'heater', objectId: 'heater', label: '加热炉', pos: [-3.3, 4.2, 0], color: 0xd8a24a, text: '加热炉把原油加热到进塔条件；这里只做流程定位，不提供炉温/热负荷。' },
    { id: 'feed', objectId: 'atmospheric_tower', label: '进料口', pos: [-2.0, 5.8, 0], color: 0xe0b35c, text: '常压进料进塔中部；也可切换减压进料，观察常压塔底→减压塔。' },

  ];
  const hotspotItems = [];

  function buildHotspots() {
    hotspotGroup = new THREE.Group();
    G.add(hotspotGroup);
    HOTSPOTS.forEach(function (h) {
      const mat = new THREE.MeshBasicMaterial({ color: h.color, transparent: true, opacity: 0.88, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), mat);
      mesh.position.set(h.pos[0], h.pos[1], h.pos[2]);
      mesh.userData.hotspot = h.id;
      mesh.userData.baseColor = h.color;
      hotspotGroup.add(mesh);
      hotspotMeshes.push(mesh);
      hotspotItems.push({ def: h, mesh: mesh });
    });
    stage.viewport.addEventListener('click', onHotspotClick);
  }

  function syncHotspots() {
    if (hotspotGroup) hotspotGroup.visible = !!window.__l4active;
    hotspotMeshes.forEach(function (m) {
      const on = m.userData.hotspot === selectedHotspot;
      m.material.opacity = on ? 1 : 0.82;
      m.scale.setScalar(on ? 1.55 : 1);
    });
  }

  function selectHotspot(id) {
    const item = hotspotItems.filter(function (x) { return x.def.id === id; })[0];
    if (!item) return;
    selectedHotspot = id;
    const d = item.def;
    if (stage.setContextObject) stage.setContextObject(d.objectId, 'refining');
    if (stage.deviceState) stage.deviceState.select(d.objectId);
    if (stage.setInteraction) stage.setInteraction('select_refining_hotspot', id, '示意');
    hint.textContent = d.label + ' · 设备热点';
    note.innerHTML = '<b>' + d.label + '</b><br>' + d.text;
    syncHotspots();
  }

  function hotspotPoint(id) {
    const item = hotspotItems.filter(function (x) { return x.def.id === id; })[0];
    if (!item || !camera) return null;
    const p = new THREE.Vector3();
    item.mesh.getWorldPosition(p);
    p.project(camera);
    const rect = stage.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * 0.5 * rect.width, y: rect.top + (1 - p.y) * 0.5 * rect.height };
  }

  function onHotspotClick(e) {
    if (performance.now() - (window.__stageDragAt || 0) < 300) return;
    if (!window.__l4active || !camera) return;
    if (e.target !== stage.renderer.domElement) return;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(hotspotMeshes, false);
    if (hits.length) selectHotspot(hits[0].object.userData.hotspot);
  }

  function buildInternals() {
    internals.length = 0;
    flowGroup = new THREE.Group();
    G.add(flowGroup);
    const vaporMat = new THREE.MeshBasicMaterial({ color: 0x9fd3c6, transparent: true, opacity: 0.9, depthWrite: false });
    const liqMat = new THREE.MeshBasicMaterial({ color: 0xd8a24a, transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < 20; i++) {
      const v = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.4, 6), vaporMat);
      const a = (i / 20) * Math.PI * 2;
      const rr = 0.15 + (i % 4) * 0.11;
      v.position.set(Math.cos(a) * rr, 1.4 + (i / 20) * 9.8, Math.sin(a) * rr);
      v.userData.base = v.position.y;
      v.userData.dir = 1;
      flowGroup.add(v);
      internals.push(v);
    }
    for (let i = 0; i < 14; i++) {
      const q = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), liqMat);
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
      const isResidue = f.key === 'residue';
      const from = isResidue ? new THREE.Vector3(0.55, 2.25, 0) : new THREE.Vector3(1.2, f.y, 0);
      const to = isResidue ? new THREE.Vector3(3.05, 3.45, 0) : new THREE.Vector3(4.35, f.y, 0);
      const curve = new THREE.CatmullRomCurve3(isResidue ? [
        from,
        new THREE.Vector3(1.1, 2.25, 0),
        new THREE.Vector3(2.2, 3.0, 0),
        to
      ] : [
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
      fractionGroups[f.key] = { group: group, flow: flow, target: f.target, isResidue: isResidue };
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
    const stateEl = ui.querySelector('#l4-state');
    if (stateEl) {
      const names = ['外观', '半剖', '全剖'];
      const f = FRACTIONS.filter(function (x) { return x.key === selectedFraction; })[0];
      stateEl.textContent = (f ? f.name : '常压塔') + ' · ' + names[level];
    }
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
    trayMeshes.forEach(function (o) {
      o.visible = level > 0 && trayGroup && trayGroup.userData.on === true;
      if (!o.material) return;
      if (!o.userData.cutMat) {
        o.userData.cutMat = o.material.clone();
        o.userData.cutMat.color = new THREE.Color(0x66777f);
        o.userData.cutMat.transparent = true;
        o.userData.cutMat.depthWrite = false;
      }
      o.material = o.userData.cutMat;
      o.material.opacity = level === 2 ? 0.38 : 0.55;
      o.material.needsUpdate = true;
    });
    insulationMeshes.forEach(function (o) { o.visible = level === 0; });
    pipeMeshes.forEach(function (o) {
      if (!o.material) return;
      o.material.transparent = level > 0;
      o.material.opacity = level === 0 ? 1 : (level === 1 ? 0.68 : 0.42);
      o.material.depthWrite = level === 0;
      o.material.clippingPlanes = level > 0 && pipeClip ? [pipeClip] : [];
      o.material.clipIntersection = false;
      if (o.material.emissive && o.userData.pipeColor != null) {
        o.material.emissive.setHex(o.userData.pipeColor);
        o.material.emissiveIntensity = level === 0 ? 0 : 0.35;
      }
      o.material.needsUpdate = true;
    });
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
      const target = new THREE.Vector3(anchor.x, level === 0 ? 4.0 : 5.2, anchor.z);
      const dist = level === 0 ? 24 : 23;
      fly(camera.position.clone(), target, new THREE.Vector3(anchor.x - (level === 0 ? 11.5 : 9.0), level === 0 ? 10.8 : 10.8, anchor.z + dist), target, 1000);
    }
  }

  function selectFraction(key) {
    selectedFraction = key;
    Object.keys(fractionGroups).forEach(function (k) { fractionGroups[k].group.visible = false; });
    const f = FRACTIONS.find(function (x) { return x.key === key; });
    if (!f) return;
    fractionGroups[key].group.visible = true;
    if (stage.setInteraction) stage.setInteraction('select_fraction', key, '示意');
    if (stage.setContextObject) stage.setContextObject(f.target, 'refining');
    note.innerHTML = '<b>' + f.name + '</b> → ' + f.route + '<br><span style="color:#9a948a">' + (key === 'residue' ? '塔底渣油去向，不是中部侧线；' : '') + '馏分不是最终成品油；路线为典型示意，不代表唯一工艺。</span>';
    hint.textContent = f.name + (key === 'residue' ? ' · 塔底至减压塔路径' : ' · 侧线馏分路径');
    syncUi();
  }

  let ui = null;
  let hint = null, note = null, back = null;

  function buildUiOnce() {
    if (ui) return;
    ui = document.createElement('div');
    ui.className = 'lvl';
    ui.dataset.levelId = 'l4';
    ui.innerHTML = [
      '<div class="lvl__bar"><span class="lvl__step">04 / 05</span><b>炼化 · 常减压</b><span class="lvl__hint" id="l4-hint">装置群正在加载…</span></div>',
      '<div class="lvl__act lvl2" id="l4-act" hidden>',
      '<div class="lvl2__head"><div><span class="lvl2__eyebrow">炼化操作</span><b>看塔内，先选剖切</b></div><span class="lvl2__state" id="l4-state">常压塔 · 半剖</span></div>',
      '<p class="lvl2__lede">半剖看塔板、汽液和侧线路径；馏分不是成品油。</p>',
      '<div class="lvl2__step">',
      '<div class="lvl2__stephead"><span class="lvl2__num">1</span><b>塔体剖切</b><span class="lvl2__stepnote">默认半剖</span></div>',
      '<div class="lvl__btns lvl2__choices" role="group" aria-label="塔体剖切"><button type="button" class="lvl__btn" data-level="0" aria-pressed="false">外观</button><button type="button" class="lvl__btn" data-level="1" aria-pressed="true">半剖</button><button type="button" class="lvl__btn" data-level="2" aria-pressed="false">全剖</button></div>',
      '</div>',
      '<div class="lvl2__step">',
      '<div class="lvl2__stephead"><span class="lvl2__num">2</span><b>观察过程</b><span class="lvl2__stepnote">进料 → 汽液 → 馏分</span></div>',
      '<div class="lvl__btns lvl2__choices" role="group" aria-label="塔内过程"><button type="button" class="lvl__btn" id="l4-feed-atm" aria-pressed="false">常压进料</button><button type="button" class="lvl__btn" id="l4-feed-vac" aria-pressed="false">减压进料</button><button type="button" class="lvl__btn" id="l4-flow" aria-pressed="false">启动汽液接触</button><button type="button" class="lvl__btn" id="l4-tray" aria-pressed="false">塔板结构</button></div>',
      '</div>',
      '<div class="lvl2__step">',
      '<div class="lvl2__stephead"><span class="lvl2__num">3</span><b>选择馏分</b><span class="lvl2__stepnote">看它的典型去向</span></div>',
      '<div class="lvl__chips" id="l4-chips" role="group" aria-label="选择馏分">',
      FRACTIONS.map(function (f) { return '<button type="button" class="lvl__chip" data-fraction="' + f.key + '">' + f.name + '</button>'; }).join(''),
      '</div>',
      '</div>',
      '<div class="lvl__out"><span id="l4-note">先选一个馏分，查看它的典型去向。</span></div>',
      '<details class="lvl2__more" id="l4-more"><summary>演示与结构</summary><div class="lvl2__tools">',
      '<div class="lvl2__toolrow"><span class="lvl2__tool-label">过程</span><button type="button" class="lvl__btn" id="l4-replay">重播</button><button type="button" class="lvl__btn" id="l4-reset">恢复外观</button></div>',
      '</div></details>',
      '</div>',
      '<div class="l4-legend" aria-label="管道颜色"><span><i style="background:#e0a24a"></i>进料</span><span><i style="background:#bfd8cf"></i>油气</span><span><i style="background:#9fd3c6"></i>石脑油</span><span><i style="background:#d8c9a0"></i>煤油</span><span><i style="background:#d8a24a"></i>柴油</span><span><i style="background:#b38a4a"></i>渣油</span></div>',
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
      if (level === 0) setLevel(1, false);
      trayGroup.userData.on = !(trayGroup.userData.on === true);
      trayGroup.visible = trayGroup.userData.on && level > 0;
      if (stage.setInteraction) stage.setInteraction('inspect_tower_trays', 'atmospheric_tower', '示意');
      hint.textContent = '塔板/泡罩/降液板 · 让汽液反复接触';
      syncUi();
    });
    ui.querySelector('#l4-replay').addEventListener('click', function () {
      internals.forEach(function (p) { p.position.y = p.userData.base; });
      if (level === 0) setLevel(1, false);
      flowOn = true; flowPaused = false;
      if (stage.deviceState) stage.deviceState.set('atmospheric_tower', { animation: 'running' }, 'level');
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
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(to); camera.lookAt(toT); return; }
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
    if (exitTimer) { clearTimeout(exitTimer); exitTimer = null; }
    if (enterTimer) { clearTimeout(enterTimer); enterTimer = null; }
    if (!G) build();
    ensureCamera();
    const startPos = stage.camera.position.clone();
    const startT = new THREE.Vector3(anchor.x, 4.0, anchor.z);
    camera.position.copy(startPos);
    camera.lookAt(startT);
    if (stage.renderer) stage.renderer.localClippingEnabled = true;
    stage.use(baseScene, camera);
    if (stage.setOverviewVisible) stage.setOverviewVisible(false);
    isolateWorld();
    window.__l4active = true;
    if (G) G.visible = true;
    if (unit) unit.visible = true;
    if (hotspotGroup) hotspotGroup.visible = true;
    ui.classList.add('on');
    document.body.classList.add('in-level');
    if (stage.setContextObject) stage.setContextObject('atmospheric_tower', 'refining');
    if (stage.deviceState) {
      stage.deviceState.select('atmospheric_tower');
      if (assetLoaded) bindDetails();
    }
    if (!running) { running = true; loop(); }
    flowOn = true;
    flowPaused = false;
    setLevel(1, false);
    if (flowGroup) flowGroup.visible = true;
    syncUi();
    enterTimer = setTimeout(function () {
      enterTimer = null;
      if (!window.__l4active) return;
      ui.querySelector('#l4-act').hidden = false;
      ui.querySelector('#l4-act').scrollTop = 0;
      hint.textContent = assetLoaded ? '装置群 · 选择剖切、进料或馏分' : '装置模型加载中…';
      syncHotspots();
    }, 1500);
  }

  function exit() {
    if (!window.__l4active) return;
    window.__l4active = false;
    if (stage.renderer) stage.renderer.localClippingEnabled = false;
    if (enterTimer) { clearTimeout(enterTimer); enterTimer = null; }
    if (exitTimer) { clearTimeout(exitTimer); exitTimer = null; }
    if (unit) unit.visible = false;
    if (hotspotGroup) hotspotGroup.visible = false;
    if (G) G.visible = false;
    ui.querySelector('#l4-act').hidden = true;
    ui.classList.remove('on');
    document.body.classList.remove('in-level');
    if (stage.setContextObject) stage.setContextObject(null, 'refining');
    if (stage.deviceState) stage.deviceState.select(null);
    fly(camera.position.clone(), new THREE.Vector3(anchor.x + 0.6, 5.0, anchor.z),
      new THREE.Vector3(anchor.x, 11, anchor.z + 24), new THREE.Vector3(0, 1.2, 0), 1500);
    exitTimer = setTimeout(function () {
      exitTimer = null;
      running = false;
      if (stage.setOverviewVisible) stage.setOverviewVisible(true);
      restoreWorld();
      stage.back();
      const seg = document.querySelector('#stages [data-stage="3"]');
      if (seg) seg.classList.add('done-level');
    }, 1600);
  }


  window.__lvlEntry(3, '进入 04 炼化', enter);
  window.__l4 = {
    enter: enter, exit: exit, setLevel: setLevel,
    get level() { return level; }, get loaded() { return assetLoaded; },
    get flowOn() { return flowOn; }, get flowPaused() { return flowPaused; },
    get selectedFraction() { return selectedFraction; },
    get groups() { return { full: fullMeshes.length, half: halfMeshes.length, trays: trayMeshes.length, hotspots: hotspotMeshes.length }; },
    selectHotspot: selectHotspot,
    selectFraction: selectFraction,
    startFlow: function () {
      var b = ui && ui.querySelector('#l4-flow');
      if (!b) return;
      if (!flowOn) b.click();
    },
    hotspotPoint: hotspotPoint,
    get detailBindings() { return detailBindings.slice(); },
    get detailGroups() {
      const out = {};
      Object.keys(detailGroups).forEach(function (k) {
        out[k] = { uuid: detailGroups[k].uuid, children: detailGroups[k].children.length, visible: detailGroups[k].visible, name: detailGroups[k].name };
      });
      return out;
    },
    fractionTarget: function (key) { return key === 'residue' ? residueTarget : 'atmospheric_tower'; },
    fractionInfo: function (key) {
      const f = FRACTIONS.filter(function (x) { return x.key === key; })[0];
      return f ? { key: f.key, name: f.name, target: f.target, y: f.y, kind: f.key === 'residue' ? 'bottom' : 'side' } : null;
    },
    get residueTarget() { return residueTarget; },
    get isolated() { return hiddenWorld.length; }
  };
})();

