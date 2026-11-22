/* 常减压蒸馏塔 · 交互运行时
   数据：Blender 程序化导出 tower.obj / tower.mtl / tower.meta.json
   相机：自实现轨道控制（用户输入优先，自动镜头可被立即接管） */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var stage = document.querySelector('.stage');

  function showFallback(msg) {
    var box = document.createElement('div');
    box.className = 'fallback';
    box.innerHTML =
      '<b>三维场景不可用，已切换到 2D 剖面。</b>' +
      (msg ? ' <span style="color:#7d96a2;font-size:12px">（' + msg + '）</span>' : '') +
      '<svg viewBox="0 0 520 300" role="img" aria-label="常压塔剖面示意：塔顶油气、上部石脑油、中部煤油柴油、塔底常压渣油">' +
      '<rect width="520" height="300" fill="#0b1620"/>' +
      '<rect x="196" y="26" width="70" height="216" rx="8" fill="#1b2c36" stroke="#4f6b77"/>' +
      '<circle cx="231" cy="30" r="10" fill="#25404d" stroke="#4f6b77"/>' +
      '<text x="278" y="52" fill="#8fa9b4" font-size="11">塔顶气 → 冷凝器</text>' +
      '<text x="278" y="96" fill="#9fd8e6" font-size="11">石脑油（上部侧线）</text>' +
      '<text x="278" y="140" fill="#9fd8e6" font-size="11">煤油</text>' +
      '<text x="278" y="180" fill="#9fd8e6" font-size="11">柴油</text>' +
      '<text x="278" y="228" fill="#e0b071" font-size="11">常压渣油 → 减压塔</text>' +
      '<path d="M60 220 H188" stroke="#f0a22e" stroke-width="3"/>' +
      '<text x="60" y="210" fill="#f0a22e" font-size="11">原油进料（加热后）</text>' +
      '</svg>' +
      '<p>塔板数量与侧线位置为教学简化；真实装置以工艺资料为准。</p>';
    stage.appendChild(box);
    var list = document.getElementById('hotspot-list');
    if (list) list.innerHTML = '<p style="color:#8fa9b4;font-size:12.5px">2D 模式：请直接阅读右侧文字说明。</p>';
  }

  /* Three.js r180 只支持 WebGL2，检测必须对齐运行时能力 */
  function webglOK() {
    try {
      if (!window.WebGL2RenderingContext) return false;
      var c = document.createElement('canvas');
      return !!c.getContext('webgl2');
    } catch (e) { return false; }
  }
  if (!window.THREE || !webglOK()) { showFallback('WebGL 不可用'); return; }

  var state = { level: 0, selected: null, loaded: false, frames: 0, cutEnabled: false };
  window.__tower = state;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  } catch (e) {
    showFallback('三维渲染器初始化失败：' + (e && e.message || e));
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); showFallback('三维上下文已丢失，正在等待恢复…'); });
  canvas.addEventListener('webglcontextrestored', function () { window.location.reload(); });
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f11);
  scene.fog = new THREE.Fog(0x0b0f11, 95, 180);
  var camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);

  scene.add(new THREE.HemisphereLight(0xf2ead9, 0x0b0f11, 0.8));
  var key = new THREE.DirectionalLight(0xfff3df, 1.35); key.position.set(26, 40, 30); scene.add(key);
  var rim = new THREE.DirectionalLight(0x9fd3c6, 0.45); rim.position.set(-30, 18, -24); scene.add(rim);
  var warm = new THREE.PointLight(0xd8a24a, 7, 20, 2); warm.position.set(-7, 7, 0); scene.add(warm);
  var fill = new THREE.DirectionalLight(0xb6b0a2, 0.75); fill.position.set(-18, 14, -26); scene.add(fill);

  var grid = new THREE.GridHelper(120, 60, 0x4a4437, 0x2a271f);
  grid.position.y = 0.01;
  scene.add(grid);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x14140f, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; scene.add(floor);

  var clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

  // ---------------------------------------------------------------- OBJ / MTL
  function parseMTL(text) {
    var colors = {}, cur = null;
    text.split('\n').forEach(function (line) {
      var t = line.trim();
      if (t.indexOf('newmtl ') === 0) { cur = t.slice(7).trim(); colors[cur] = 0x9b968a; }
      else if (t.indexOf('Kd ') === 0 && cur) {
        var p = t.split(/\s+/);
        var r = Math.round(parseFloat(p[1]) * 255), g = Math.round(parseFloat(p[2]) * 255), b = Math.round(parseFloat(p[3]) * 255);
        colors[cur] = (r << 16) | (g << 8) | b;
      }
    });
    return colors;
  }

  function parseOBJ(text, mtlColors) {
    var pos = [], nrm = [], groups = [], cur = null;
    function startGroup(name) { cur = { name: name, mat: null, pos: [], nrm: [], idx: [], map: {}, n: 0 }; groups.push(cur); }
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line[0] === 'v' && line[1] === ' ') {
        var a = line.split(/\s+/);
        pos.push(+a[1], +a[2], +a[3]);
      } else if (line[0] === 'v' && line[1] === 'n' && line[2] === ' ') {
        var b = line.split(/\s+/);
        nrm.push(+b[1], +b[2], +b[3]);
      } else if (line[0] === 'o' && line[1] === ' ') {
        startGroup(line.slice(2).trim());
      } else if (line.indexOf('usemtl ') === 0) {
        if (!cur) startGroup('mesh');
        cur.mat = line.slice(7).trim();
      } else if (line[0] === 'f' && line[1] === ' ') {
        if (!cur) startGroup('mesh');
        var f = line.split(/\s+/).slice(1);
        var faceIdx = [];
        for (var k = 0; k < f.length; k++) {
          var parts = f[k].split('/');
          var vi = parseInt(parts[0], 10);
          var ni = parts[2] ? parseInt(parts[2], 10) : 0;
          var key = vi + '/' + ni;
          if (cur.map[key] === undefined) {
            cur.map[key] = cur.n;
            cur.pos.push(pos[(vi - 1) * 3], pos[(vi - 1) * 3 + 1], pos[(vi - 1) * 3 + 2]);
            if (ni) cur.nrm.push(nrm[(ni - 1) * 3], nrm[(ni - 1) * 3 + 1], nrm[(ni - 1) * 3 + 2]);
            cur.n += 1;
          }
          faceIdx.push(cur.map[key]);
        }
        // OBJ 的面可能是四边形/多边形，必须自己三角化；直接塞 4 个索引会让 Three 拼错面
        for (var t = 1; t < faceIdx.length - 1; t++) {
          cur.idx.push(faceIdx[0], faceIdx[t], faceIdx[t + 1]);
        }
      }
    }
    var root = new THREE.Group();
    groups.forEach(function (g) {
      if (!g.pos.length || g.name === 'Ground') return;
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      if (g.nrm.length === g.pos.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
      else geo.computeVertexNormals();
      geo.setIndex(g.idx);
      var isShell = /Shell|Dome/.test(g.name);
      var isHalf = /ShellHalf$/.test(g.name);
      var color = isHalf ? 0x9b968a : 0x8a8478;
      if (/Shell|Dome/.test(g.name)) color = 0x8a8478;
      else if (/Tray/.test(g.name)) color = 0xb6b0a2;
      else if (/Heater/.test(g.name)) color = 0x6b5840;
      else if (/Pipe_Side|Pipe_Top/.test(g.name)) color = 0x8fb6ad;
      else if (/Pipe_Feed|Pipe_Bottom/.test(g.name)) color = 0xd8a24a;
      else if (/Box_/.test(g.name)) color = 0x3a3830;
      else if (/Railing|Post|Ladder|Manway|Skirt|Pump/.test(g.name)) color = 0x33312a;
      var mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: color,
        metalness: isShell ? 0.55 : 0.35,
        roughness: isShell ? 0.42 : 0.6,
        side: THREE.DoubleSide,
        emissive: /ShellHalf$/.test(g.name) ? 0x2a2418 : (/Pipe_Side|Pipe_Top/.test(g.name) ? 0x1f2a26 : (/Pipe_Feed|Pipe_Bottom/.test(g.name) ? 0x3a2408 : 0x000000))
      }));
      mesh.name = g.name;
      mesh.userData.groupName = g.name;
      root.add(mesh);
    });
    return root;
  }

  // ---------------------------------------------------------------- 热点
  var HOTSPOTS = [
    {
      id: 'hs_crude_feed', name: '原油进料', pos: new THREE.Vector3(-9.2, 15.2, 0), match: /Pipe_Feed_Horizontal/,
      title: '原油进料：先变成"能挥发的状态"',
      lede: '原油是油、气、水、盐和多种组分的混合物，不能直接"切"。进装置后先换热、再进加热炉，让它部分汽化，才有条件按沸点分开。',
      bullets: ['混合物 → 先汽化，才谈得上按沸点分', '进料位置通常在塔中部，给上下段都留出分离空间', '这一层不讲温度、压力等操作参数'],
      ask: '原油进常压塔前为什么要先加热'
    },
    {
      id: 'hs_heater', name: '加热炉', pos: new THREE.Vector3(-10.4, 9.0, 0), match: /^Heater$/,
      title: '加热炉：把热量交给原油',
      lede: '炉管内走原油，炉膛里烧燃料，通过管壁把热量传给原油。温度要控制在"能汽化但不至于大量裂解"的区间——这是工艺设计的核心取舍。',
      bullets: ['热量通过炉管壁传给原油', '温度过高会让分子裂解，改变产品结构', '真实参数属于工艺资料，这里不展开'],
      ask: '加热炉为什么不把原油加热到更高温度'
    },
    {
      id: 'hs_atm_tower', name: '常压塔', pos: new THREE.Vector3(-0.8, 26.0, 0), match: /^Tower_Atmospheric_Shell$/,
      title: '常压塔：按沸点范围分段',
      lede: '塔内有多层塔板，上升的油气与下降的回流液在塔板上反复接触：轻组分往上走，重组分往下走，于是在不同高度抽出不同沸点范围的馏分。',
      bullets: ['塔顶出气相；上部石脑油，中部煤油、柴油，塔底常压渣油', '塔板让汽液充分接触、反复冷凝与汽化', '抽出的叫"馏分"，不等于最终成品油'],
      ask: '常压塔为什么不同高度能抽出不同馏分'
    },
    {
      id: 'hs_vacuum', name: '减压塔', pos: new THREE.Vector3(11.2, 10.2, 0), match: /^Tower_Vacuum_Shell$/,
      title: '减压塔：降压，让重油"低烧"也能分',
      lede: '常压塔底的重油，在常压下要很高温度才馏得动，而那个温度会大量裂解。把压力降下来，沸点随之降低，就能在较低温度继续分离。',
      bullets: ['降低压力 → 沸点下降 → 避免高温裂解', '得到减压馏分（去进一步加工）与减压渣油', '两座塔串起来才是"常减压"'],
      ask: '减压塔为什么要抽真空'
    },
    {
      id: 'hs_products', name: '馏分去向', pos: new THREE.Vector3(9.6, 17, 0), match: /^Box_|Pipe_Side_/,
      title: '馏分去向：塔里出来的不是成品油',
      lede: '侧线抽出的是沸点范围不同的馏分，还要经过精制、调和、裂解、重整等后续加工，才成为汽油、柴油、航煤、润滑油或化工原料。',
      bullets: ['石脑油 → 乙烯/重整原料；煤油 → 航煤；柴油 → 车用柴油', '同一馏分在不同炼厂去向不同，取决于配置与需求', '把"馏分"直接说成"成品油"是常见错误'],
      ask: '常压塔抽出的馏分为什么还要继续加工'
    }
  ];

  var hotspotMeshes = [];
  var labelsEl = document.getElementById('labels');
  var labelEls = {};
  var listEl = document.getElementById('hotspot-list');
  var detailEl = document.getElementById('detail');

  function buildLabels() {
    HOTSPOTS.forEach(function (h) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'hs';
      el.textContent = h.name;
      el.setAttribute('aria-label', '查看' + h.name);
      el.addEventListener('click', function () { select(h.id, true); });
      labelsEl.appendChild(el);
      labelEls[h.id] = el;
    });
  }

  function buildList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    HOTSPOTS.forEach(function (h) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = h.id;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = h.name + '<small>' + (h.id === 'hs_atm_tower' ? '16 层塔板，剖开可看' : '点击定位并看说明') + '</small>';
      b.addEventListener('click', function () { select(h.id, true); });
      listEl.appendChild(b);
    });
  }

  function renderDetail(h) {
    if (!detailEl) return;
    if (!h) {
      detailEl.innerHTML = '<h3>先看哪里？</h3><p>点设备上的标签，或点下面的按钮。切到「半剖」能看见塔内的塔板。</p>' +
        '<p class="hint">程序化示意模型：塔板数量、侧线位置为教学简化，真实装置以工艺资料为准。</p>';
      return;
    }
    detailEl.innerHTML = '<h3>' + h.title + '</h3><p>' + h.lede + '</p><ul>' +
      h.bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' +
      '<p class="hint"><a href="ask.html?q=' + encodeURIComponent(h.ask) + '">就这一点去问 AI →</a></p>';
  }

  function select(id, fly) {
    state.selected = (state.selected === id) ? null : id;
    HOTSPOTS.forEach(function (h) {
      var on = h.id === state.selected;
      if (labelEls[h.id]) labelEls[h.id].classList.toggle('on', on);
      if (listEl) {
        var b = listEl.querySelector('[data-id="' + h.id + '"]');
        if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      hotspotMeshes.forEach(function (m) {
        if (m.userData.hotspot === h.id) {
          if (!m.material.emissive) m.material.emissive = new THREE.Color(0x000000);
          m.material.emissive.setHex(on ? 0x3a3423 : 0x000000);
        }
      });
    });
    var sel = HOTSPOTS.filter(function (h) { return h.id === state.selected; })[0];
    renderDetail(sel || null);
    if (fly && sel) flyTo({ target: sel.pos.clone(), az: 0.95, el: 0.24, dist: 30 });
  }

  // ---------------------------------------------------------------- 剖切
  function setLevel(n) {
    state.level = n;
    state.cutEnabled = n > 0;
    scene.traverse(function (o) {
      if (!o.isMesh) return;
      var name = o.userData.groupName || '';
      if (/ShellHalf$|DomeHalf$/.test(name)) o.visible = n > 0;         // 半剖壳/半穹顶：剖开时显示
      else if (/^(Tower_Atmospheric_Shell|Tower_Vacuum_Shell|Tower_Atmospheric_Dome|Tower_Vacuum_Dome)$/.test(name)) {
        o.visible = n === 0;                                           // 整壳/整穹顶：外观时显示
      }
    });
    document.querySelectorAll('#levels button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.level) === n));
    });
    var note = document.getElementById('flow-note');
    if (note) note.hidden = n !== 2;
    if (internals) internals.visible = n === 2;
    flyTo({ target: new THREE.Vector3(0, 11.5, 0), az: 0.42, el: n > 0 ? 0.16 : 0.30, dist: n > 0 ? 23 : 33 });
  }

  // ---------------------------------------------------------------- 相机
  var cam = { az: 0.72, el: 0.26, dist: 33, target: new THREE.Vector3(0.5, 9.6, 0) };
  var tween = null, dragging = false, moved = 0, lastPt = { x: 0, y: 0 };

  function applyCamera() {
    var ce = Math.cos(cam.el), se = Math.sin(cam.el);
    camera.position.set(
      cam.target.x + cam.dist * ce * Math.sin(cam.az),
      cam.target.y + cam.dist * se,
      cam.target.z + cam.dist * ce * Math.cos(cam.az)
    );
    camera.lookAt(cam.target);
  }
  function flyTo(to, ms) {
    tween = {
      t0: performance.now(), ms: ms || 800,
      from: { az: cam.az, el: cam.el, dist: cam.dist, target: cam.target.clone() },
      to: { az: to.az, el: to.el, dist: to.dist, target: (to.target || cam.target).clone() }
    };
  }
  function stepTween(now) {
    if (!tween) return;
    var p = Math.min(1, (now - tween.t0) / tween.ms);
    var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    cam.az = tween.from.az + (tween.to.az - tween.from.az) * e;
    cam.el = tween.from.el + (tween.to.el - tween.from.el) * e;
    cam.dist = tween.from.dist + (tween.to.dist - tween.from.dist) * e;
    cam.target.lerpVectors(tween.from.target, tween.to.target, e);
    if (p >= 1) tween = null;
  }

  canvas.addEventListener('pointerdown', function (e) {
    tween = null; dragging = true; moved = 0;
    lastPt.x = e.clientX; lastPt.y = e.clientY;
    canvas.classList.add('dragging');
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y;
    moved += Math.abs(dx) + Math.abs(dy);
    lastPt.x = e.clientX; lastPt.y = e.clientY;
    cam.az -= dx * 0.006;
    cam.el = Math.max(0.05, Math.min(1.35, cam.el + dy * 0.005));
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { dragging = false; canvas.classList.remove('dragging'); });
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault(); tween = null;
    cam.dist = Math.max(18, Math.min(110, cam.dist + e.deltaY * 0.04));
  }, { passive: false });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { state.selected = null; renderDetail(null); }
  });

  canvas.addEventListener('click', function (e) {
    if (moved > 6) return;
    var rect = canvas.getBoundingClientRect();
    var m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    var ray = new THREE.Raycaster();
    ray.setFromCamera(m, camera);
    var hits = ray.intersectObjects(hotspotMeshes, false);
    if (hits.length && hits[0].object.userData.hotspot) select(hits[0].object.userData.hotspot, false);
  });

  // ---------------------------------------------------------------- 流向
  var flows = [];
  var internals = null;
  var flowGeo = new THREE.SphereGeometry(0.22, 10, 8);
  function addFlow(points, color, speed) {
    var mat = new THREE.MeshBasicMaterial({ color: color });
    var pts = points.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
    var n = 6;
    for (var i = 0; i < n; i++) {
      var s = new THREE.Mesh(flowGeo, mat);
      s.userData.flow = { pts: pts, t: i / n, speed: speed };
      scene.add(s);
      flows.push(s);
    }
  }
  function pathPoint(pts, t) {
    var segs = [], total = 0;
    for (var i = 1; i < pts.length; i++) { var d = pts[i].distanceTo(pts[i - 1]); segs.push(d); total += d; }
    var want = t * total, acc = 0;
    for (var k = 0; k < segs.length; k++) {
      if (acc + segs[k] >= want) {
        var f = segs[k] ? (want - acc) / segs[k] : 0;
        return pts[k].clone().lerp(pts[k + 1], f);
      }
      acc += segs[k];
    }
    return pts[pts.length - 1].clone();
  }
  function stepFlows(dt) {
    flows.forEach(function (s) {
      var f = s.userData.flow;
      f.t = (f.t + dt * f.speed) % 1;
      s.position.copy(pathPoint(f.pts, f.t));
    });
  }

  // ---------------------------------------------------------------- 加载
  var BASE = 'assets/tower/';
  Promise.all([
    fetch(BASE + 'tower.obj').then(function (r) { if (!r.ok) throw new Error('OBJ ' + r.status); return r.text(); }),
    fetch(BASE + 'tower.mtl').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
  ]).then(function (res) {
    var obj = parseOBJ(res[0], parseMTL(res[1] || ''));
    scene.add(obj);
    state.loaded = true;
    setLevel(0);   // 显式初始化外观：整壳显示、半剖壳隐藏

    HOTSPOTS.forEach(function (h) {
      obj.traverse(function (o) {
        if (!o.isMesh) return;
        if (h.match.test(o.name)) { o.userData.hotspot = h.id; hotspotMeshes.push(o); }
      });
    });

    // 塔内汽液：全剖时显示（青色上升=汽相，琥珀下降=回流液，均为示意）
    internals = new THREE.Group();
    var vaporMat = new THREE.MeshBasicMaterial({ color: 0x9fd3c6, transparent: true, opacity: 0.85 });
    var liquidMat = new THREE.MeshBasicMaterial({ color: 0xd8a24a, transparent: true, opacity: 0.8 });
    var vaporGeo = new THREE.ConeGeometry(0.14, 0.46, 8);
    var liquidGeo = new THREE.SphereGeometry(0.11, 8, 6);
    for (var vi = 0; vi < 9; vi++) {
      var v = new THREE.Mesh(vaporGeo, vaporMat);
      var ang = Math.random() * Math.PI * 2, rr = 0.35 + Math.random() * 1.2;
      v.position.set(Math.cos(ang) * rr, 5 + Math.random() * 18, Math.sin(ang) * rr);
      v.userData.dir = 1;
      internals.add(v);
    }
    for (var li = 0; li < 7; li++) {
      var lq = new THREE.Mesh(liquidGeo, liquidMat);
      var ang2 = Math.random() * Math.PI * 2, rr2 = 1.3 + Math.random() * 0.5;
      lq.position.set(Math.cos(ang2) * rr2, 6 + Math.random() * 16, Math.sin(ang2) * rr2);
      lq.userData.dir = -1;
      internals.add(lq);
    }
    internals.visible = false;
    scene.add(internals);
    addFlow([[-7, 7.2, 0], [-7, 13, 0], [-2.2, 13, 0]], 0xd8a24a, 0.22);
    addFlow([[2.2, 21, 0], [9, 21, 0]], 0x9fd3c6, 0.30);
    addFlow([[2.2, 18.4, 0], [9, 18.4, 0]], 0x9fd3c6, 0.32);
    addFlow([[2.2, 15.8, 0], [9, 15.8, 0]], 0x9fd3c6, 0.34);
    addFlow([[0, 26, 0], [2.2, 26, 0], [2.2, 27.4, 0], [6.5, 27.4, 0]], 0x9fd3c6, 0.24);

    cam.dist = 80; cam.el = 0.42;
    flyTo({ target: new THREE.Vector3(0.5, 9.6, 0), az: 0.72, el: 0.26, dist: 33 }, 1400);

    document.querySelectorAll('#levels button').forEach(function (b) {
      b.addEventListener('click', function () { setLevel(Number(b.dataset.level)); });
    });
    var reset = document.getElementById('reset');
    if (reset) reset.addEventListener('click', function () { flyTo({ target: new THREE.Vector3(0.5, 9.6, 0), az: 0.72, el: 0.26, dist: 33 }); });

    buildLabels(); buildList(); renderDetail(null);
  }).catch(function (err) {
    showFallback('模型加载失败：' + (err && err.message || err));
  });

  // ---------------------------------------------------------------- 循环
  var clock = new THREE.Clock();
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  var tmp = new THREE.Vector3();
  function stepLabels() {
    var w = stage.clientWidth, h = stage.clientHeight;
    HOTSPOTS.forEach(function (hd) {
      var el = labelEls[hd.id];
      if (!el) return;
      tmp.copy(hd.pos).project(camera);
      var vis = tmp.z < 1 && tmp.x > -1.08 && tmp.x < 1.08 && tmp.y > -1.08 && tmp.y < 1.08;
      el.style.display = vis ? 'block' : 'none';
      if (vis) {
        el.style.left = ((tmp.x * 0.5 + 0.5) * w) + 'px';
        el.style.top = ((-tmp.y * 0.5 + 0.5) * h) + 'px';
      }
    });
  }

  function loop() {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, clock.getDelta());
    stepTween(performance.now());
    applyCamera();
    if (state.loaded) {
      stepFlows(dt);
      stepLabels();
      if (internals && internals.visible) {
        internals.children.forEach(function (m) {
          m.position.y += m.userData.dir * dt * (m.userData.dir > 0 ? 2.4 : 1.6);
          if (m.userData.dir > 0 && m.position.y > 24.6) m.position.y = 4.6;
          if (m.userData.dir < 0 && m.position.y < 4.6) m.position.y = 24.6;
        });
      }
    }
    renderer.render(scene, camera);
    state.frames += 1;
  }

  resize();
  document.addEventListener('visibilitychange', function () { if (document.hidden) tween = null; });
  loop();
})();
