(function () {
  'use strict';

  const viewport = document.getElementById('viewport');
  const stageButtons = Array.from(document.querySelectorAll('[data-stage]'));
  const depthSelect = document.getElementById('depth');
  const feedback = document.getElementById('feedback');
  const live = document.getElementById('live');
  const dialog = document.getElementById('details');
  const discoveries = new Set();
  /* ---------- 右栏：和关卡对齐 ---------- */
  const LEVEL_BRIEF = [
    { goal: '油藏在孔隙里，怎么把它“挤”出来？', take: '油不在“油湖”里，它藏在岩石孔隙中，靠压力被顶出来。' },
    { goal: '井口出来的混在一起的东西，怎么分开？', take: '油、气、水密度不同，三相分离器把它们送进各自的罐。' },
    { goal: '同样装一罐油，哪种罐更不漏油气？', take: '外浮顶的盖板贴着油面，油气空间被压到接近零，蒸发最少。' },
    { goal: '一塔原油，凭什么分出四种产品？', take: '沸点不同，出来的高度就不同：越轻越靠上。' },
    { goal: '石油除了烧，还能变成什么？', take: '塑料、沥青、石蜡都来自石油，它不只是燃料。' }
  ];

  function levelDone(i) {
    try { return JSON.parse(localStorage.getItem('kepu.level.done.v1') || '[]').indexOf(i) >= 0; } catch (e) { return false; }
  }

  function syncTaskPanel() {
    const i = currentStage;
    const hook = window.__levelHooks && window.__levelHooks[i];
    const btn = document.getElementById('enter-level');
    const choices = document.getElementById('choices');
    if (!hook) {
      if (choices) choices.style.display = '';
      if (btn) btn.remove();
      return;
    }
    const b = LEVEL_BRIEF[i] || { goal: '进场景完成本环节', take: '' };
    const done = levelDone(i);
    const label = document.getElementById('task-label');
    const state = document.getElementById('task-state');
    const q = document.getElementById('question');
    const fb = document.getElementById('feedback');
    if (label) label.textContent = '本环节 · 动手';
    if (state) state.textContent = done ? '已通关' : '待动手';
    if (q) q.textContent = b.goal;
    if (choices) choices.style.display = 'none';
    if (fb) {
      fb.textContent = done ? b.take : '点下面的按钮进三维场景，做完这一关就算过。';
      fb.classList.toggle('success', done);
    }
    let el = btn;
    if (!el && fb) {
      el = document.createElement('button');
      el.type = 'button';
      el.id = 'enter-level';
      el.className = 'enter-level';
      fb.parentNode.insertBefore(el, fb.nextSibling);
    }
    if (el) {
      el.textContent = done ? '再看一遍 →' : '进入本环节 →';
      el.onclick = function () {
        const h = window.__levelHooks && window.__levelHooks[i];
        if (h) h();
      };
    }
  }

  function syncProgress() {
    let n = 0;
    try { n = (JSON.parse(localStorage.getItem('kepu.level.done.v1') || '[]')).length; } catch (e) { n = 0; }
    const total = modelGroups.length || 5;
    const el = document.getElementById('progress-text');
    if (el) el.textContent = '五关进度 ' + n + ' / ' + total;
    Array.from(document.querySelectorAll('.bars i')).forEach(function (bar, index) {
      bar.classList.toggle('done', index < n);
    });
  }
  const answers = new Map();
  const stageNames = ['地下开采', '地面处理', '储运', '炼化', '产品去向'];
  const sourceUrls = [
    'https://news.cnpc.com.cn/system/2025/09/08/030173060.shtml',
    'https://www.eia.gov/energyexplained/oil-and-petroleum-products/',
    'https://www.eia.gov/energyexplained/oil-and-petroleum-products/refining-crude-oil-the-refining-process.php',
    'https://www.eia.gov/energyexplained/oil-and-petroleum-products/refining-crude-oil-the-refining-process.php',
    'https://www.eia.gov/energyexplained/oil-and-petroleum-products/refining-crude-oil-the-refining-process.php'
  ];

  const explanations = [
    [
      '很多油藏中的油藏在岩石的孔隙和裂缝中。井筒把地面与储层连接起来，具体怎样采出还要看地下条件。',
      '地下开采先建立井筒通道，再根据储层和流体条件组织生产。这里用一口井说明从地下到地面的连接。',
      '井型、储层特征和采油方式需要分别理解。井筒提供通道，产出能力还取决于储层流体与相应开发条件。',
      '本环节呈现井筒与储层的连接关系。不同井况涉及不同完井及举升方案，进一步研读需结合具体储层、井况与工程资料。'
    ],
    [
      '刚从井里出来的东西，可能是油、气和水等的混合物。进入后面的流程之前，需要进行相应处理。',
      '井口产出物可能包含多种组分。地面设施按实际工艺进行分离和处理，为后续储存、输送提供条件。',
      '地面处理连接井口生产与后续输送。分离、脱水等具体环节和要求，应结合实际产出物及工艺资料解释。',
      '地面处理的单元和边界取决于产出物流体性质及下游要求。本图仅呈现处理环节的位置，实际流程与设备需按工程资料核对。'
    ],
    [
      '处理后的原油，通过相应设施储存和输送，继续前往炼厂。储罐与管线在旅程中承担不同的任务。',
      '储存与输送连接生产端和加工端。储罐、管道及其他运输方式按实际场景配合使用。',
      '储运环节需要结合物料性质、设施和运输方式理解。流程图中的单条管线用于表达物料连接。',
      '储运方案涉及物料、设施及运行边界。当前模型表达环节连接，具体设备、物性与运行条件应依据实际资料展开。'
    ],
    [
      '原油会经过分离、转化和处理等加工，逐步成为燃料或化工原料。它的用途来自多种加工过程。',
      '炼厂通过分离、转化和处理等环节加工原油。不同加工环节承担不同作用，最后形成相应产品。',
      '蒸馏分离和分子转化是不同的过程。炼厂中的加工单元组合及产品路线，需结合实际工艺理解。',
      '本模型用塔器和连接关系表示炼化环节。分离、转化及处理的具体单元、物流与产品路线，需结合已审定的工艺资料研读。'
    ],
    [
      '经过加工，石油可以成为燃料，也能提供制造材料的原料。继续观察它们与交通和日常用品的联系。',
      '石油产品用于交通、供能等领域，也可作为化工原料。具体生活用品的原料与制造路线需要分别核实。',
      '从原油到日常产品，需要经过相应炼化及制造环节。产品用途与材料组成应沿具体路线解释。',
      '终端产品和化工原料具有不同的规格及下游路线。本图呈现用途方向，进一步资料应对应具体产品、组成和加工路径。'
    ]
  ];

  const questions = {
    0: {
      title: '很多油藏中的油，主要藏在哪里？',
      options: ['岩石的孔隙和裂缝等空间', '地下处处都是巨大的油湖'],
      correct: 0,
      success: '发现已记录。储集空间、井筒通道和采油方式，是接下来可以分别观察的问题。'
    },
    1: {
      title: '井口产出物为什么需要地面处理？',
      options: ['因为井口产出物已经是成品汽油', '为混合产出物进行相应分离和处理'],
      correct: 1,
      success: '发现已记录。地面处理把井口生产与后续储运连接起来。'
    },
    3: {
      title: '原油怎样逐步成为不同产品？',
      options: ['经过分离、转化和处理等加工', '只加热一次，就能直接得到所有产品'],
      correct: 0,
      success: '发现已记录。继续沿产品路线查看燃料与化工原料的用途。'
    }
  };

  let currentStage = 0;
  let playing = false;
  let scene;
  let camera;
  let renderer;
  const resizeHooks = [];
  let activeScene = null;   // 关卡场景（null = 总览）
  let activeCamera = null;  // 关卡相机
  let modelGroups = [];
  let pipes = [];
  let particles = [];
  let labels = [];
  let raycaster;
  let THREE;
  let lastFrame = 0;
  let phase = 0;
  let dragging = null;
  let levelPivotDist = 7;   // 关卡内旋转的绕点距离
  let levelPivot = null;    // 按下时锁定的轴心，拖动中不再重算
  let cameraTransition = null;
  const orbit = {
    azimuth: 0.18,
    elevation: 0.55,
    radius: 34,
    targetX: 0,
    targetY: 1.2,
    targetZ: 0
  };

  function updateTask() {
    document.getElementById('chapter').textContent = stageNames[currentStage];
    document.getElementById('explanation').textContent = explanations[currentStage][Number(depthSelect.value)];
    document.getElementById('source-link').href = sourceUrls[currentStage];
  stageButtons.forEach(function (button, index) {
      if (index === currentStage) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      button.classList.toggle('complete', discoveries.has(index));
    });

    const question = questions[currentStage];
    const choices = document.getElementById('choices');
    choices.replaceChildren();
    feedback.classList.remove('success');
    document.getElementById('task-label').textContent = question ? '探究任务' : '沿流程观察';
    document.getElementById('task-state').textContent = discoveries.has(currentStage) ? '已发现' : '待观察';
    if (!question) {
      document.getElementById('question').textContent = currentStage === 2 ? '储罐和管线，各自承担什么作用？' : '从产品，继续看到生活。';
      feedback.textContent = '旋转模型、聚焦设备，或展开原理继续研读。';
    } else {
      document.getElementById('question').textContent = question.title;
      question.options.forEach(function (option, index) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option;
        button.setAttribute('aria-pressed', String(answers.get(currentStage) === index));
        button.classList.toggle('correct', discoveries.has(currentStage) && index === question.correct);
        button.addEventListener('click', function () { chooseAnswer(index); });
        choices.appendChild(button);
      });
      feedback.textContent = discoveries.has(currentStage) ? question.success : '观察模型与讲解，再选出你的判断。';
      feedback.classList.toggle('success', discoveries.has(currentStage));
    }

    syncProgress();
    syncTaskPanel();
    labels.forEach(function (label, index) { label.element.classList.toggle('selected', index === currentStage); });
    modelGroups.forEach(function (group, index) {
      group.traverse(function (object) {
        if (!object.isMesh || !object.material.emissive) return;
        object.material.emissive.set(index === currentStage ? 0x12363b : 0x000000);
        object.material.emissiveIntensity = index === currentStage ? 0.25 : 0;
      });
    });
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function chooseAnswer(index) {
    const question = questions[currentStage];
    if (!question) return;
    answers.set(currentStage, index);
    if (index === question.correct) {
      discoveries.add(currentStage);
      live.textContent = discoveries.size === 3 ? '三个关键环节已经发现，可以导出本次探索记录。' : '已记录这次发现，可以继续查看下一环节。';
      updateTask();
    } else {
      updateTask();
      feedback.textContent = '再看看本环节的原理，找到支持判断的依据。';
      document.getElementById('task-state').textContent = '继续观察';
    }
  }

  function selectStage(index, focus) {
    currentStage = index;
    updateTask();
    if (focus && modelGroups[index]) {
      const p = modelGroups[index].position;
      moveCamera({ targetX: p.x, targetY: 1.8, targetZ: p.z, radius: 18 });
    }
  }

  function moveCamera(values) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      Object.assign(orbit, values);
      cameraTransition = null;
      return;
    }
    cameraTransition = {
      from: Object.assign({}, orbit),
      to: Object.assign({}, orbit, values),
      start: performance.now(),
      duration: 700
    };
  }

  function updateCamera(timestamp) {
    if (activeScene) return;   // 关卡自己管相机，别用总览轨道覆盖它
    if (cameraTransition) {
      const progress = Math.min(1, (timestamp - cameraTransition.start) / cameraTransition.duration);
      const eased = progress * progress * (3 - 2 * progress);
      Object.keys(orbit).forEach(function (key) {
        orbit[key] = cameraTransition.from[key] + (cameraTransition.to[key] - cameraTransition.from[key]) * eased;
      });
      if (progress === 1) cameraTransition = null;
    }
    const horizontal = orbit.radius * Math.cos(orbit.elevation);
    camera.position.set(
      orbit.targetX + horizontal * Math.sin(orbit.azimuth),
      orbit.targetY + orbit.radius * Math.sin(orbit.elevation),
      orbit.targetZ + horizontal * Math.cos(orbit.azimuth)
    );
    camera.lookAt(orbit.targetX, orbit.targetY, orbit.targetZ);
  }

  function material(color, metallic) {
    return new THREE.MeshStandardMaterial({
      color: color,
      metalness: metallic ? 0.55 : 0.08,
      roughness: metallic ? 0.48 : 0.9
    });
  }

  function mesh(group, geometry, surface, x, y, z) {
    const object = new THREE.Mesh(geometry, surface.clone());
    object.position.set(x, y, z);
    group.add(object);
    return object;
  }

  function box(group, width, height, depth, surface, x, y, z) {
    return mesh(group, new THREE.BoxGeometry(width, height, depth), surface, x, y, z);
  }

  function cylinder(group, radius, height, surface, x, y, z) {
    return mesh(group, new THREE.CylinderGeometry(radius, radius, height, 32), surface, x, y, z);
  }

  function rod(group, start, end, radius, surface) {
    const a = new THREE.Vector3(start[0], start[1], start[2]);
    const b = new THREE.Vector3(end[0], end[1], end[2]);
    const direction = b.clone().sub(a);
    const object = mesh(group, new THREE.CylinderGeometry(radius, radius, direction.length(), 10), surface, 0, 0, 0);
    object.position.copy(a.clone().add(b).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return object;
  }

  function ring(group, radius, y, surface, x, z) {
    const object = mesh(group, new THREE.TorusGeometry(radius, 0.045, 8, 40), surface, x, y, z);
    object.rotation.x = Math.PI / 2;
    return object;
  }

  function buildModels() {
    const steel = material(0x879ba3, true);
    const lightSteel = material(0xb8c5c6, true);
    const darkSteel = material(0x324b58, true);
    const yellow = material(0xcb9a40, true);
    const cyan = material(0x6bc1c8, true);
    const foundation = material(0x263c49, false);
    const positions = [[-12, -4], [-2, -4], [9, -4], [8, 5], [-5, 5]];

    positions.forEach(function (position, index) {
      const group = new THREE.Group();
      group.position.set(position[0], 0, position[1]);
      group.userData.stage = index;
      box(group, 6.3, 0.3, 5.5, foundation, 0, 0, 0);
      modelGroups.push(group);
      scene.add(group);
    });

    const underground = modelGroups[0];
    const layers = [0x514d43, 0x6f6250, 0x4d6468];
    layers.forEach(function (color, index) {
      box(underground, 5.1, 0.6, 4.3, material(color, false), 0, 0.5 + index * 0.6, 0);
    });
    cylinder(underground, 0.12, 5.7, cyan, 0, 3.0, -0.3);
    const corners = [[-1, -0.3, 0.8], [1, -0.3, 0.8], [-1, -0.3, -1.1], [1, -0.3, -1.1]];
    corners.forEach(function (corner) {
      rod(underground, [corner[0], 2.1, corner[2]], [corner[0] * 0.25, 6.2, corner[2] * 0.25], 0.07, yellow);
    });
    for (let level = 0; level < 4; level += 1) {
      const y = 2.3 + level;
      const w = 0.96 - level * 0.17;
      rod(underground, [-w, y, 0.5], [w, y + 0.9, 0.35], 0.035, lightSteel);
      rod(underground, [w, y, 0.5], [-w, y + 0.9, 0.35], 0.035, lightSteel);
    }
    box(underground, 1.4, 0.8, 1, steel, 1.7, 2.5, 1);

    const processing = modelGroups[1];
    const separator = cylinder(processing, 0.9, 4.7, lightSteel, 0, 1.8, 0);
    separator.rotation.z = Math.PI / 2;
    [-1.5, 1.5].forEach(function (x) {
      box(processing, 0.32, 1.05, 0.7, darkSteel, x, 0.67, 0);
    });
    cylinder(processing, 0.12, 1, cyan, -1, 2.5, 0);
    box(processing, 1.1, 1.2, 1.3, steel, 1.9, 0.9, 1.9);
    rod(processing, [-2.4, 1.8, 0], [-2.4, 0.5, 1.5], 0.13, yellow);

    const storage = modelGroups[2];
    cylinder(storage, 2.1, 2.7, steel, 0, 1.52, 0);
    mesh(storage, new THREE.ConeGeometry(2.2, 0.35, 40), lightSteel, 0, 3.04, 0);
    ring(storage, 2.12, 0.55, darkSteel, 0, 0);
    ring(storage, 2.12, 1.55, darkSteel, 0, 0);
    ring(storage, 2.12, 2.7, darkSteel, 0, 0);
    for (let y = 0.4; y < 2.8; y += 0.3) {
      rod(storage, [2.1, y, -0.2], [2.1, y, 0.2], 0.025, yellow);
    }

    const refining = modelGroups[3];
    [[-1.7, 4.5, 0.66], [0, 5.6, 0.77], [1.8, 3.3, 0.6]].forEach(function (tower) {
      cylinder(refining, tower[2], tower[1], lightSteel, tower[0], tower[1] / 2 + 0.2, 0);
      mesh(refining, new THREE.SphereGeometry(tower[2], 24, 16), steel, tower[0], tower[1] + 0.2, 0);
      for (let y = 0.7; y < tower[1]; y += 0.65) ring(refining, tower[2] + 0.07, y, darkSteel, tower[0], 0);
      rod(refining, [tower[0], 0.3, 0.95], [tower[0], tower[1], 0.95], 0.055, yellow);
    });
    box(refining, 5.5, 0.15, 1.2, darkSteel, 0, 2.5, 0.3);
    rod(refining, [-2.5, 2.8, 0.9], [2.5, 2.8, 0.9], 0.04, yellow);
    box(refining, 1.5, 1, 1.3, steel, 0, 0.7, 2);

    const products = modelGroups[4];
    [[-1.8, -0.6], [-0.3, -0.6], [-1.1, 1]].forEach(function (p) {
      cylinder(products, 0.53, 1.65, steel, p[0], 1.02, p[1]);
      ring(products, 0.55, 0.55, yellow, p[0], p[1]);
      ring(products, 0.55, 1.55, yellow, p[0], p[1]);
    });
    box(products, 2.1, 1.6, 2.2, lightSteel, 1.5, 0.95, 0.3);
    box(products, 2.3, 0.18, 2.4, cyan, 1.5, 1.86, 0.3);

    const anchors = modelGroups.map(function (group, index) { return group.position.clone().add(new THREE.Vector3(0, [4.4, 1.8, 1.5, 1.5, 1.1][index], index === 0 ? -0.3 : 0)); });
    for (let i = 0; i < anchors.length - 1; i += 1) {
      const a = anchors[i].clone();
      const b = anchors[i + 1].clone();
      const curve = new THREE.CatmullRomCurve3([
        a, a.clone().lerp(b, 0.28).setY(0.8),
        a.clone().lerp(b, 0.72).setY(0.8), b
      ]);
      const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.11, 10, false), yellow.clone());
      scene.add(pipe);
      pipes.push({ curve: curve, object: pipe });
      const particle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8ae4e4 }));
      particle.position.copy(curve.getPoint(0.3));
      scene.add(particle);
      particles.push(particle);
    }

    modelGroups.forEach(function (group, index) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'object-label';
      button.textContent = ['井筒与储层', '处理设施', '储罐', '炼化单元', '燃料与化工原料'][index];
      button.setAttribute('aria-label', '查看' + stageNames[index]);
      button.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
      button.addEventListener('click', function () { selectStage(index, true); });
      viewport.appendChild(button);
      labels.push({ element: button, anchor: new THREE.Vector3(group.position.x, [6.8, 3.7, 3.8, 6.8, 3.1][index], group.position.z) });
    });
  }

  function updateLabels() {
    const placed = [];
    labels.forEach(function (label) {
      const point = label.anchor.clone().project(camera);
      let x = (point.x + 1) * viewport.clientWidth / 2;
      const y = (1 - point.y) * viewport.clientHeight / 2;
      const visible = point.z < 1 && x > 10 && x < viewport.clientWidth - 10 && y > 12 && y < viewport.clientHeight - 30;
      label.element.hidden = !visible;
      if (!visible) return;
      const width = label.element.offsetWidth;
      const height = label.element.offsetHeight;
      x = Math.max(width / 2 + 6, Math.min(viewport.clientWidth - width / 2 - 6, x));
      let top = y - height / 2;
      for (let attempt = 0; attempt <= placed.length; attempt += 1) {
        const collision = placed.find(function (other) {
          return x - width / 2 < other.right + 5 && x + width / 2 > other.left - 5 &&
            top < other.bottom + 5 && top + height > other.top - 5;
        });
        if (!collision) break;
        top = collision.bottom + 8;
      }
      if (top + height > viewport.clientHeight - 24) {
        label.element.hidden = true;
        return;
      }
      label.element.style.left = x + 'px';
      label.element.style.top = (top + height / 2) + 'px';
      placed.push({ left: x - width / 2, right: x + width / 2, top: top, bottom: top + height });
    });
  }

  function render(timestamp) {
    requestAnimationFrame(render);
    if (document.hidden || !renderer) return;
    const delta = Math.min(50, timestamp - lastFrame);
    lastFrame = timestamp;
    if (playing && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) phase = (phase + delta / 2800) % 1;
    updateCamera(timestamp);
    particles.forEach(function (particle, index) {
      particle.position.copy(pipes[index].curve.getPoint((phase + index * 0.19) % 1));
      particle.visible = playing;
    });
    updateLabels();
    renderer.render(activeScene || scene, activeCamera || camera);
  }

  function resize() {
    if (!renderer) return;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (activeCamera) { activeCamera.aspect = width / height; activeCamera.updateProjectionMatrix(); }
    resizeHooks.forEach(function (fn) { fn(width, height); });
  }

  function initThree() {
    THREE = window.THREE;
    if (!THREE) throw new Error('三维运行库未加载');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a151f);
    scene.fog = new THREE.FogExp2(0x0a151f, 0.004);
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    viewport.prepend(renderer.domElement);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '井筒、处理设施、储罐、炼化单元和产品的三维模型');
    scene.add(new THREE.HemisphereLight(0xe0f2ff, 0x29301e, 2.0));
    const key = new THREE.DirectionalLight(0xe5faff, 3.5);
    key.position.set(-12, 30, 18);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6cccd3, 2.8);
    rim.position.set(10, 15, -22);
    scene.add(rim);
    const warm = new THREE.DirectionalLight(0xffcc7a, 1.5);
    warm.position.set(-22, 10, -5);
    scene.add(warm);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(35, 23), material(0x122532, false));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.25;
    scene.add(floor);
    const grid = new THREE.GridHelper(44, 22, 0x416777, 0x213946);
    grid.position.y = -0.23;
    scene.add(grid);
    buildModels();
    raycaster = new THREE.Raycaster();
    resize();
    new ResizeObserver(resize).observe(viewport);
    updateTask();
    requestAnimationFrame(render);

    viewport.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button')) return;
      if (event.target.closest('input,button,select,textarea,.lvl-entry,.lvl__chip')) return;
      if (activeScene) {
        const c0 = activeCamera || camera;
        const d0 = new THREE.Vector3();
        c0.getWorldDirection(d0);
        levelPivot = c0.position.clone().add(d0.multiplyScalar(levelPivotDist));
      }
      dragging = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      if (Math.abs(event.clientX - dragging.x) + Math.abs(event.clientY - dragging.y) > 5) dragging.moved = true;
    if (activeScene && dragging) {
      if (!dragging.moved) return;
      const cam = activeCamera || camera;
      const pivot = levelPivot || (function () {
        const d = new THREE.Vector3();
        cam.getWorldDirection(d);
        return cam.position.clone().add(d.multiplyScalar(levelPivotDist));
      })();
      const off = cam.position.clone().sub(pivot);
      const sph = new THREE.Spherical().setFromVector3(off);
      sph.theta -= (event.clientX - dragging.lastX) * 0.006;
      sph.phi = Math.max(0.35, Math.min(1.45, sph.phi - (event.clientY - dragging.lastY) * 0.005));
      off.setFromSpherical(sph);
      cam.position.copy(pivot).add(off);
      cam.lookAt(pivot);
      dragging.lastX = event.clientX;
      dragging.lastY = event.clientY;
      return;
    }      if (!dragging.moved) return;
      cameraTransition = null;
      orbit.azimuth -= (event.clientX - dragging.lastX) * 0.006;
      orbit.elevation = Math.max(0.16, Math.min(1.15, orbit.elevation + (event.clientY - dragging.lastY) * 0.005));
      dragging.lastX = event.clientX;
      dragging.lastY = event.clientY;
    });
    viewport.addEventListener('pointerup', function (event) {
      levelPivot = null;
      if (activeScene) { dragging = null; return; }
      if (dragging && !dragging.moved) {
        const bounds = viewport.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2(
          (event.clientX - bounds.left) / bounds.width * 2 - 1,
          1 - (event.clientY - bounds.top) / bounds.height * 2
        ), camera);
        const hits = raycaster.intersectObjects(modelGroups, true);
        if (hits.length) {
          let object = hits[0].object;
          while (object && object.userData.stage === undefined) object = object.parent;
          if (object) {
            const idx = object.userData.stage;
            const hook = window.__stage && window.__stage.levelHook && window.__stage.levelHook(idx);
            if (hook) { hook(); return; }
            selectStage(idx, true);
          }
        }
      }
      dragging = null;
    });
    viewport.addEventListener('pointercancel', function () { dragging = null; });
    viewport.addEventListener('wheel', function (event) {
      event.preventDefault();
      cameraTransition = null;
      orbit.radius = Math.max(9, Math.min(90, orbit.radius * (event.deltaY > 0 ? 1.07 : 0.93)));
    }, { passive: false });
  }


  stageButtons.forEach(function (button, index) {
    button.addEventListener('click', function () { selectStage(index, true); });
  });
  depthSelect.addEventListener('change', updateTask);
  document.getElementById('overview').addEventListener('click', function () {
    moveCamera({ targetX: 0, targetY: 1.2, targetZ: 0, radius: 34, azimuth: 0.18, elevation: 0.55 });
  });
  document.getElementById('focus').addEventListener('click', function () { selectStage(currentStage, true); });
  document.getElementById('next').addEventListener('click', function () {
    selectStage((currentStage + 1) % stageNames.length, true);
  });
  document.getElementById('play').addEventListener('click', function () {
    playing = !playing;
    this.setAttribute('aria-pressed', String(playing));
    this.textContent = playing ? '暂停流向' : '播放流向';
    live.textContent = playing ? '青色标记沿管线移动，表示物料连接方向。' : '流向播放已暂停，可以继续查看设备和原理。';
  });

  function openDetails(withPhoto) {
    const content = document.getElementById('details-content');
    content.replaceChildren();
    document.getElementById('details-title').textContent = withPhoto ? '岩芯如何被研究' : stageNames[currentStage] + ' · 原理与资料';
    if (withPhoto) {
      const img = document.createElement('img');
      img.src = 'assets/core-rock.jpg';
      img.alt = '中国石油报报道中的古龙页岩岩芯照片';
      content.appendChild(img);
    }
    const paragraph = document.createElement('p');
    paragraph.textContent = withPhoto ? '岩芯与实验室观察为研究储层提供资料。照片来自中国石油报《解构地球深部“藏宝图”》，可以结合原文了解相关岩石观察和测试。' : explanations[currentStage][Math.min(3, Number(depthSelect.value) + 1)];
    content.appendChild(paragraph);
    const link = document.createElement('a');
    link.href = withPhoto ? sourceUrls[0] : sourceUrls[currentStage];
    link.textContent = '查看原始资料 ↗';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    content.appendChild(link);
    dialog.showModal();
  }
  document.getElementById('read-more').addEventListener('click', function () { openDetails(false); });
  document.getElementById('photo').addEventListener('click', function () { openDetails(true); });
  document.getElementById('close-dialog').addEventListener('click', function () { dialog.close(); });
  document.getElementById('speak').addEventListener('click', function () {
    if (!window.speechSynthesis) {
      live.textContent = '当前环境无法朗读，可查看屏幕上的完整讲解。';
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(explanations[currentStage][Number(depthSelect.value)]);
    utterance.lang = 'zh-CN';
    utterance.rate = Number(depthSelect.value) === 0 ? 0.85 : 0.95;
    window.speechSynthesis.speak(utterance);
    live.textContent = '正在朗读当前环节的讲解。';
  });

  document.getElementById('export').addEventListener('click', function () {
    const lines = ['原油怎样走出地下 · 探索记录', '', '五关已通关 ' + doneSet.size + ' / ' + modelGroups.length, '探究任务完成 ' + discoveries.size + ' / 3', ''];
    Object.keys(questions).forEach(function (key) {
      const index = Number(key);
      const q = questions[index];
      lines.push(stageNames[index], q.title, '我的选择 ' + (answers.has(index) ? q.options[answers.get(index)] : '尚未选择'), '发现状态 ' + (discoveries.has(index) ? '已依据讲解完成判断' : '继续观察'), '资料 ' + sourceUrls[index], '');
    });
    const led = (window.__leadai && window.__leadai.ledger) || [];
    if (led.length) {
      lines.push('五关探索记录 ' + doneSet.size + ' / ' + modelGroups.length, '');
      led.forEach(function (row) {
        lines.push((row.k || '') + ' · ' + (row.t || '') + (row.d ? '（' + row.d + '）' : ''));
      });
      lines.push('');
    }
    lines.push('本记录来自原理示意模型与预置讲解。');
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '石油流程探索记录.txt';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    live.textContent = '已导出本次探索记录，可用于整理课程或科普作品。';
  });

  try {
    initThree();
  } catch (error) {
    const fallback = document.getElementById('fallback');
    fallback.hidden = false;
    fallback.textContent = '三维场景未能加载。请使用支持 WebGL 的浏览器打开，也可通过下方流程节点查看讲解。';
    live.textContent = String(error.message);
  }
  updateTask();
  /* —— 关卡接口：同一个 renderer，换场景/相机 —— */
  /* ---------- 已通关徽标（节点上） ---------- */
  const DONE_KEY = 'kepu.level.done.v1';
  const doneSet = new Set((function () {
    try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); } catch (e) { return []; }
  })());
  function saveDone() {
    try { localStorage.setItem(DONE_KEY, JSON.stringify(Array.from(doneSet))); } catch (e) {}
  }
  let badgeTex = null;
  const badges = {};
  function badgeTexture() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 88;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(8,18,24,0.92)';
    c.fillRect(0, 0, 256, 88);
    c.strokeStyle = '#f0a22e'; c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, 253, 85);
    c.fillStyle = '#f0a22e';
    c.font = '600 38px "Microsoft YaHei UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('✓ 已通关', 128, 46);
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    return t;
  }
  function applyBadge(i) {
    if (badges[i]) { badges[i].visible = doneSet.has(i); return; }
    const g = modelGroups[i];
    if (!g) return;
    if (!badgeTex) badgeTex = badgeTexture();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(4.2, 1.44, 1);
    sp.position.set(4.3, 4.2, 0);
    sp.visible = doneSet.has(i);
    g.add(sp);
    badges[i] = sp;
  }
  function syncStageTabs() {
    document.querySelectorAll('#stages [data-stage]').forEach(function (el) {
      if (doneSet.has(+el.getAttribute('data-stage'))) el.classList.add('done-level');
    });
  }

  modelGroups.forEach(function (g, i) { applyBadge(i); });
  syncStageTabs();
  syncProgress();

  /* ---------- 五关全通 ---------- */
  function showAllDone() {
    let ov = document.getElementById('all-done');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'all-done';
      ov.className = 'all-done';
      ov.innerHTML = [
        '<div class="all-done__card" role="dialog" aria-label="五关全通">',
        '<p class="all-done__eyebrow">五关全通 · 5 / 5</p>',
        '<h3>一滴油，从地下走到了你手里</h3>',
        '<ul class="all-done__list">',
        '<li>地下开采 · 推压力把油从孔隙里挤出来</li>',
        '<li>地面处理 · 把油、气、水分开</li>',
        '<li>储运 · 浮顶把油气空间压没</li>',
        '<li>炼化 · 按沸点分成四种产品</li>',
        '<li>产品去向 · 石油不只是燃料</li>',
        '</ul>',
        '<div class="all-done__row">',
        '<button type="button" id="all-done-again">再走一遍</button>',
        '<button type="button" id="all-done-close">留在总览</button>',
        '</div>',
        '</div>'
      ].join('');
      viewport.appendChild(ov);
      ov.querySelector('#all-done-close').onclick = function () { ov.classList.remove('on'); };
      ov.querySelector('#all-done-again').onclick = function () {
        ov.classList.remove('on');
        if (window.__stage && window.__stage.resetProgress) window.__stage.resetProgress();
      };
    }
    ov.classList.add('on');
  }
  function maybeAllDone() {
    if (doneSet.size >= modelGroups.length) setTimeout(showAllDone, 700);
  }

  window.__stage = {
    THREE: null,
    get renderer() { return renderer; },
    get viewport() { return viewport; },
    get size() { return { w: viewport.clientWidth, h: viewport.clientHeight }; },
    use(s, c) {
      activeScene = s; activeCamera = c;
      if (c && viewport.clientWidth) { c.aspect = viewport.clientWidth / viewport.clientHeight; c.updateProjectionMatrix(); }
      viewport.classList.add('in-level');
      document.dispatchEvent(new CustomEvent('stage-level'));
    },
    back() {
      activeScene = null; activeCamera = null;
      viewport.classList.remove('in-level');
      document.dispatchEvent(new CustomEvent('stage-level'));
    },
    isLevel() { return !!activeScene; },
    get scene() { return activeScene || scene; },
    get baseScene() { return scene; },
    get nodes() { return modelGroups.map(function (g) { return g.position.clone(); }); },
    setOverviewVisible(v) {
      modelGroups.forEach(function (g) { g.visible = v; });
      pipes.forEach(function (p) { if (p.object) p.object.visible = v; });
      particles.forEach(function (p) { p.visible = v; });
    },
    setNodeDone(i, v) { if (v) doneSet.add(i); else doneSet.delete(i); saveDone(); applyBadge(i); syncStageTabs(); syncProgress(); syncTaskPanel(); maybeAllDone(); },
    resetProgress() {
      doneSet.clear(); saveDone();
      modelGroups.forEach(function (g, i) { applyBadge(i); });
      document.querySelectorAll('#stages [data-stage]').forEach(function (el) { el.classList.remove('done-level'); });
      syncProgress();
    syncTaskPanel();
      const ov = document.getElementById('all-done'); if (ov) ov.classList.remove('on');
    },
    isNodeDone(i) { return doneSet.has(i); },
    levelHook(i) { return (window.__levelHooks && window.__levelHooks[i]) || null; },
    refreshTaskPanel() { syncTaskPanel(); },
    get camera() { return activeCamera || camera; },
    onResize(fn) { resizeHooks.push(fn); }
  };
  resizeHooks.forEach(function (fn) { fn(); });

})();
