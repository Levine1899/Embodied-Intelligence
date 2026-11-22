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
        if (h) { markLevel(i); h(); }
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
  let playing = true;
  let scene;
  let camera;
  let renderer;
  const resizeHooks = [];
  let activeScene = null;   // 关卡场景（null = 总览）
  let activeCamera = null;  // 关卡相机
  let modelGroups = [];
  let pipes = [];
  const unitState = { half: [], full: [], cut: false, loaded: false, group: null };
  let atmTowerGroup = null;
  let vacTowerGroup = null;
  let autoOrbit = true;
  let pumpAnim = null;
  let contextLostAt = 0;
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
    azimuth: 0.30,
    elevation: 0.50,
    radius: 44,
    targetX: 2,
    targetY: 3.0,
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
        object.material.emissive.set(index === currentStage ? 0x2a2418 : 0x000000);
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

  // 环节机位预设：随流程逐级下降（高度 2.6 → 0.9，仰角同步压低）
  const CAM_PRESETS = [
    { targetY: -0.5, radius: 17, elevation: 0.42, azimuth: -0.05 },
    { targetY: 2.2, radius: 13, elevation: 0.30, azimuth: 0.10, dx: 0.2, dz: 0 },
    { targetY: 2.2, radius: 14, elevation: 0.30, azimuth: 0.16, dx: 0, dz: -0.4 },
    { targetY: 2.6, radius: 18, elevation: 0.32, azimuth: 0.16, dx: -1.6, dz: 1.4 },
    { targetY: 1.9, radius: 11, elevation: 0.24, azimuth: 0.30 }
  ];
  // 环节 → 章节（第 1 章「形成与勘探」没有 3D 环节）
  const STAGE_CHAPTER = [
    { id: "drill", n: 2, t: "地下开采" },
    { id: "gather", n: 3, t: "集输处理" },
    { id: "store", n: 4, t: "储运调配" },
    { id: "refine", n: 5, t: "炼化加工" },
    { id: "use", n: 6, t: "终端应用" }
  ];

  function syncChapterLink(index) {
    const el = document.getElementById("chapter-link");
    const m = STAGE_CHAPTER[index];
    if (!el || !m) return;
    el.href = "chapter.html?id=" + m.id;
    el.textContent = "读本章知识 · 第 " + m.n + " 章 " + m.t + " →";
  }

  function selectStage(index, focus, objectId, anchor) {
    currentStage = index;
    updateTask();
    syncChapterLink(index);
    syncSceneContext(index, objectId || null, null);
    if (objectId) showDeviceCard(objectId, index, anchor); else hideDeviceCard();
    if (focus && modelGroups[index]) {
      const p = modelGroups[index].position;
      const preset = CAM_PRESETS[index] || CAM_PRESETS[0];
      moveCamera(Object.assign({ targetX: p.x + (preset.dx || 0), targetZ: p.z + (preset.dz || 0) }, preset));
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
    if (autoOrbit && !activeScene && !dragging) orbit.azimuth += 0.0016;
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

  /* ---------- 连续产业链数字沙盘 ---------- */
  const REGIONS = [
    { id: 'drill', x: -26, z: 0, w: 13, d: 12, name: '地下开采' },
    { id: 'gather', x: -11, z: 0, w: 11, d: 12, name: '地面处理' },
    { id: 'store', x: 4, z: 0, w: 12, d: 12, name: '储运' },
    { id: 'refine', x: 19, z: 0, w: 14, d: 14, name: '炼化' },
    { id: 'use', x: 33, z: 0, w: 12, d: 12, name: '产品去向' }
  ];

  function groundLabel(text, width, color) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 512, 128);
    c.fillStyle = color || '#9a948a';
    c.font = '600 46px "PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 66);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    return plane;
  }

  function railLine(group, width, depth, y, surface) {
    box(group, width, 0.05, 0.05, surface, 0, y, -depth / 2);
    box(group, width, 0.05, 0.05, surface, 0, y, depth / 2);
    box(group, 0.05, 0.05, depth, surface, -width / 2, y, 0);
    box(group, 0.05, 0.05, depth, surface, width / 2, y, 0);
  }

  function platform(group, w, d, x, z, top, surface) {
    box(group, w, 0.22, d, surface, x, top - 0.11, z);
    railLine(group, w, d, top - 0.02, surface);
  }

  function stairRun(group, x, z, height, surface) {
    const steps = Math.max(6, Math.round(height / 0.16));
    for (let i = 0; i < steps; i += 1) {
      box(group, 0.9, 0.07, 0.26, surface, x, (i + 0.5) * height / steps, z + i * 0.24);
    }
    rod(group, [x - 0.46, 0, z], [x - 0.46, height, z + steps * 0.24], 0.03, surface);
  }

  function wheel(group, x, y, z, surface, radius) {
    const w = mesh(group, new THREE.TorusGeometry(radius || 0.22, 0.035, 8, 20), surface, x, y, z);
    w.rotation.y = Math.PI / 2;
    return w;
  }

  function nozzle(group, x, y, z, surface, r, len, vertical) {
    const n = mesh(group, new THREE.CylinderGeometry(r, r, len, 14), surface, x, y, z);
    if (!vertical) n.rotation.z = Math.PI / 2;
    return n;
  }

  function mergeStaticMeshes(root) {
    const buckets = new Map();
    root.updateWorldMatrix(true, true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const removals = [];

    function walk(node) {
      if (node !== root && node.userData && node.userData.skipMerge) return;
      if (node.isMesh && !(node.userData && (node.userData.objectId || node.userData.heroAsset))) {
        const geom = node.geometry;
        if (geom && geom.attributes && geom.attributes.position) {
          const mat = Array.isArray(node.material) ? node.material[0] : node.material;
          if (mat) {
            const key = (mat.name || '') + '|' + (mat.color ? mat.color.getHexString() : '') + '|' +
              mat.metalness + '|' + mat.roughness + '|' + mat.transparent + '|' + mat.opacity + '|' + (mat.emissive ? mat.emissive.getHexString() : '') + '|' + (mat.map ? mat.map.uuid : '');
            if (!buckets.has(key)) buckets.set(key, { mat: mat, position: [], normal: [], index: [], offset: 0 });
            const bucket = buckets.get(key);
            const rel = new THREE.Matrix4().copy(rootInv).multiply(node.matrixWorld);
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(rel);
            const pos = geom.attributes.position;
            const nrm = geom.attributes.normal;
            const v = new THREE.Vector3();
            const n = new THREE.Vector3();
            for (let i = 0; i < pos.count; i += 1) {
              v.fromBufferAttribute(pos, i).applyMatrix4(rel);
              bucket.position.push(v.x, v.y, v.z);
              if (nrm) {
                n.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();
                bucket.normal.push(n.x, n.y, n.z);
              }
            }
            const idx = geom.index;
            if (idx) {
              for (let i = 0; i < idx.count; i += 1) bucket.index.push(bucket.offset + idx.getX(i));
            } else {
              for (let i = 0; i < pos.count; i += 1) bucket.index.push(bucket.offset + i);
            }
            bucket.offset += pos.count;
            removals.push(node);
          }
        }
      }
      node.children.slice().forEach(walk);
    }
    walk(root);

    removals.forEach(function (node) {
      if (node.parent) node.parent.remove(node);
      if (node.geometry) node.geometry.dispose();
    });

    buckets.forEach(function (bucket) {
      if (!bucket.position.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
      if (bucket.normal.length === bucket.position.length) {
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normal, 3));
      }
      geo.setIndex(bucket.index);
      if (!bucket.normal.length) geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, bucket.mat);
      mesh.name = 'merged_' + (bucket.mat.name || 'material');
      mesh.userData.mergedStatic = true;
      root.add(mesh);
    });
  }

  function buildModels() {
    const steel = material(0x9b968a, true);
    const lightSteel = material(0xcfc8ba, true);
    const darkSteel = material(0x3a3830, true);
    const amber = material(0xd8a24a, true);
    const teal = material(0x8fb6ad, true);
    const concrete = material(0x2a2822, false);
    const padMat = material(0x1e1e18, false);
    const roadMat = material(0x22221b, false);
    const rock = [0x4a4235, 0x5a5342, 0x3f3b30, 0x625840, 0x6b5a3a, 0x33312a];
    const wallMat = material(rock[5], false);
    const sceneRoot = new THREE.Group();
    sceneRoot.name = 'industry-sandbox';
    scene.add(sceneRoot);

    /* 地形：一整块连续基底（x -36..42 / z -17..17），不再是五块漂浮底座 */
    box(sceneRoot, 78, 0.6, 34, concrete, 3, -0.32, 0);
    /* 边缘压条与等高线，给地平线一个可读的收边 */
    box(sceneRoot, 78.6, 0.12, 0.5, darkSteel, 3, 0.02, 17);
    box(sceneRoot, 78.6, 0.12, 0.5, darkSteel, 3, 0.02, -17);
    box(sceneRoot, 0.5, 0.12, 34.4, darkSteel, -36, 0.02, 0);
    box(sceneRoot, 0.5, 0.12, 34.4, darkSteel, 42, 0.02, 0);
    for (let i = 0; i < 3; i += 1) {
      box(sceneRoot, 78, 0.04, 0.08, roadMat, 3, 0.005, -13 + i * 1.1);
      box(sceneRoot, 78, 0.04, 0.08, roadMat, 3, 0.005, 13 - i * 1.1);
    }

    /* 五个区域的可读分区：嵌在地形里的浅台 + 地面标签 */
    REGIONS.forEach(function (region) {
      const plate = box(sceneRoot, region.w, 0.16, region.d, padMat, region.x, 0.06, region.z);
      plate.userData.region = region.id;
      railLine(sceneRoot, region.w - 0.4, region.d - 0.4, 0.15, darkSteel);
      const label = groundLabel(region.name, Math.min(8, region.w - 2));
      label.position.set(region.x, 0.17, region.z + region.d / 2 - 1.4);
      sceneRoot.add(label);
    });

    /* 区域之间的工艺脊线：管路 + 支架 + 地面路径（产业链的连接，而不是厂区道路） */
    for (let i = 0; i < REGIONS.length - 1; i += 1) {
      const a = REGIONS[i], b = REGIONS[i + 1];
      const x0 = a.x + a.w / 2, x1 = b.x - b.w / 2;
      const mid = (x0 + x1) / 2;
      box(sceneRoot, x1 - x0, 0.05, 1.6, roadMat, mid, 0.08, 0);
      for (let x = x0 + 1; x < x1 - 0.6; x += 2.2) {
        box(sceneRoot, 0.9, 0.02, 0.1, amber, x, 0.12, 0);
      }
      const rackY = 2.35;
      for (let x = x0 + 0.8; x <= x1; x += 3) {
        rod(sceneRoot, [x, 0.2, 2.4], [x, rackY, 2.4], 0.07, darkSteel);
        rod(sceneRoot, [x, 0.2, 3.1], [x, rackY - 0.5, 3.1], 0.07, darkSteel);
      }
      rod(sceneRoot, [x0, rackY, 2.4], [x1, rackY, 2.4], 0.11, amber);
      rod(sceneRoot, [x0, rackY - 0.35, 2.75], [x1, rackY - 0.35, 2.75], 0.09, steel);
    }

    /* 五个区域的 group（关卡仍然按 group.position 取锚点） */
    REGIONS.forEach(function (region, index) {
      const group = new THREE.Group();
      group.position.set(region.x, 0.14, region.z);
      group.userData.stage = index;
      sceneRoot.add(group);
      modelGroups.push(group);
    });

    /* ---------- 01 地下开采：开采台阶 + 地质剖面 + 井口/抽油机 ---------- */
    const drill = modelGroups[0];
    const pit = new THREE.Group();
    pit.position.set(-2.2, 0, -1.2);
    drill.add(pit);
    /* 剖面台阶：后壁高、前缘低，镜头可以从南侧看进地层 */
    box(pit, 10.4, 1.1, 0.35, wallMat, 0, 0.5, -4.4);
    box(pit, 0.35, 0.7, 8.8, wallMat, -5.2, 0.3, 0);
    box(pit, 0.35, 0.7, 8.8, wallMat, 5.2, 0.3, 0);
    box(pit, 10.4, 0.18, 0.3, wallMat, 0, 0.04, 4.4);
    for (let i = 0; i < 6; i += 1) {
      const layer = box(pit, 9.8, 0.78, 8.4, material(rock[i], false), 0, -4.0 + i * 0.8, 0);
      layer.userData.layer = i;
    }
    /* 储层里的油气：用暖色颗粒表达“孔隙里的油”，仅教学示意 */
    const oilDots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.075, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xd8a24a }),
      90
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 90; i += 1) {
      dummy.position.set((Math.random() - 0.5) * 8.6, -1.55 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 7.4);
      dummy.updateMatrix();
      oilDots.setMatrixAt(i, dummy.matrix);
    }
    pit.add(oilDots);
    const pitLight = new THREE.PointLight(0xffd9a0, 18, 16, 2);
    pitLight.position.set(-1.0, 4.2, 2.6);
    drill.add(pitLight);
    const stratumLabel = groundLabel('地质剖面 · 教学示意', 6.4, '#b6b0a2');
    stratumLabel.position.set(0, 0.2, 4.9);
    pit.add(stratumLabel);

    cylinder(drill, 0.16, 7.4, teal, -0.6, 1.4, -2.2);
    /* 井口：采油树 + 阀组 */
    const wellhead = new THREE.Group();
    wellhead.userData.objectId = 'wellhead';
    wellhead.userData.skipMerge = true;
    wellhead.position.set(-0.6, 1.4, -2.2);
    drill.add(wellhead);
    box(wellhead, 0.9, 0.35, 0.9, darkSteel, 0, 0.1, 0);
    cylinder(wellhead, 0.34, 0.5, steel, 0, 0.55, 0);
    cylinder(wellhead, 0.42, 0.12, steel, 0, 0.86, 0);
    wheel(wellhead, 0.52, 0.62, 0, amber, 0.2);
    rod(wellhead, [-0.45, 0.62, 0], [0.45, 0.62, 0], 0.09, amber);
    rod(wellhead, [0, 0.62, -0.45], [0, 0.62, 0.45], 0.09, amber);
    loadHeroAsset(wellhead, 'wellhead', 'wellhead', 0.5);
    /* 抽油机：支架 + 游梁 + 驴头 */
    const pump = new THREE.Group();
    pump.userData.objectId = 'pumpjack';
    pump.userData.skipMerge = true;
    pump.position.set(-4.6, 0.16, 3.2);
    drill.add(pump);
    box(pump, 1.6, 0.25, 1.1, concrete, 0, 0.12, 0);
    rod(pump, [-1.4, 0.2, 0], [-1.4, 2.5, 0], 0.09, steel);
    rod(pump, [1.2, 0.2, 0], [-1.4, 2.5, 0], 0.08, steel);
    const beam = box(pump, 3.4, 0.22, 0.3, steel, 0, 2.6, 0);
    beam.rotation.z = 0.12;
    mesh(pump, new THREE.CylinderGeometry(0.55, 0.55, 0.22, 20, 1, false, 0, Math.PI), steel, 2.0, 2.95, 0).rotation.z = Math.PI / 2;
    box(pump, 0.7, 0.6, 0.9, darkSteel, -1.9, 2.0, 0);
    loadAnimatedPumpjack(pump);

    /* ---------- 02 地面处理：三相分离器 + 泵撬 + 缓冲罐 ---------- */
    const gather = modelGroups[1];
    const sep = new THREE.Group();
    sep.userData.skipMerge = true;
    sep.position.set(0.2, 0, 0);
    gather.add(sep);
    const shell = mesh(sep, new THREE.CylinderGeometry(1.05, 1.05, 4.2, 32), lightSteel, 0, 1.9, 0);
    shell.userData.objectId = 'three_phase_separator';
    shell.rotation.z = Math.PI / 2;
    [-2.1, 2.1].forEach(function (x) {
      mesh(sep, new THREE.SphereGeometry(1.05, 24, 16), lightSteel, x, 1.9, 0).scale.set(0.55, 1, 1);
    });
    [-1.35, 1.35].forEach(function (x) {
      box(sep, 0.42, 1.15, 1.5, darkSteel, x, 0.6, 0);
      box(sep, 1.3, 0.14, 1.7, concrete, x, 0.1, 0);
    });
    nozzle(sep, 0, 3.0, 0, steel, 0.16, 0.7, true);
    nozzle(sep, 0, 0.85, 0, steel, 0.16, 0.7, true);
    nozzle(sep, -2.6, 1.5, 0, amber, 0.2, 0.9, false);
    cylinder(sep, 0.1, 0.5, teal, 1.6, 2.95, 0.5);
    wheel(sep, -0.4, 1.4, 1.1, amber, 0.16);
    loadHeroAsset(sep, 'separator', 'three_phase_separator', 0.88);
    /* 泵撬 */
    const pumpSkid = new THREE.Group();
    pumpSkid.position.set(3.2, 0, 2.0);
    gather.add(pumpSkid);
    box(pumpSkid, 2.4, 0.2, 1.4, concrete, 0, 0.1, 0);
    cylinder(pumpSkid, 0.42, 0.7, steel, -0.6, 0.55, 0);
    box(pumpSkid, 0.9, 0.7, 0.8, darkSteel, 0.7, 0.55, 0);
    rod(pumpSkid, [-1.3, 0.5, 0], [-1.3, 1.7, 0], 0.09, teal);
    rod(pumpSkid, [-1.3, 1.7, 0], [-0.6, 1.7, 0], 0.09, teal);

    /* ---------- 03 储运：固定顶罐 + 外浮顶罐 + 泵与管架 ---------- */
    const store = modelGroups[2];
    function fixedRoofTank(x, z) {
      const g = new THREE.Group();
      g.userData.skipMerge = true;
      g.position.set(x, 0, z);
      store.add(g);
      cylinder(g, 2.3, 3.4, steel, 0, 1.7, 0).userData.objectId = 'fixed_roof_tank';
      mesh(g, new THREE.ConeGeometry(2.42, 0.7, 40), lightSteel, 0, 3.75, 0);
      cylinder(g, 0.12, 0.5, darkSteel, 0, 4.3, 0);
      ring(g, 2.36, 0.3, darkSteel, 0, 0);
      ring(g, 2.36, 3.2, darkSteel, 0, 0);
      for (let i = 0; i < 10; i += 1) {
        const a = i / 10 * Math.PI * 2;
        rod(g, [Math.cos(a) * 2.34, 0.25, Math.sin(a) * 2.34], [Math.cos(a) * 2.34, 3.2, Math.sin(a) * 2.34], 0.025, amber);
      }
      stairRun(g, 2.5, -0.6, 3.2, darkSteel);
      return g;
    }
    function floatingRoofTank(x, z) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      store.add(g);
      const floatShell = mesh(g, new THREE.CylinderGeometry(2.3, 2.3, 3.6, 36, 1, true), steel, 0, 1.8, 0);
      floatShell.material.side = THREE.DoubleSide;
      floatShell.userData.objectId = 'floating_roof_tank';
      ring(g, 2.34, 0.25, darkSteel, 0, 0);
      ring(g, 2.34, 3.45, amber, 0, 0);
      /* 浮盘与密封圈：真正贴着液面 */
      cylinder(g, 2.24, 0.16, lightSteel, 0, 2.6, 0);
      ring(g, 2.3, 2.66, amber, 0, 0);
      for (let i = 0; i < 8; i += 1) {
        const a = i / 8 * Math.PI * 2;
        rod(g, [Math.cos(a) * 2.0, 0.2, Math.sin(a) * 2.0], [Math.cos(a) * 2.0, 3.4, Math.sin(a) * 2.0], 0.03, darkSteel);
      }
      stairRun(g, 2.55, -0.4, 3.4, darkSteel);
      loadHeroAsset(g, 'floating_roof_tank', 'floating_roof_tank', 0.46);
      return g;
    }
    fixedRoofTank(-2.4, -1.6);
    floatingRoofTank(2.4, -1.6);
    /* 防火堤 */
    box(store, 10.4, 0.35, 0.25, concrete, 0, 0.2, 3.4);
    box(store, 10.4, 0.35, 0.25, concrete, 0, 0.2, -5.4);
    box(store, 0.25, 0.35, 8.8, concrete, -5.2, 0.2, -1.0);
    box(store, 0.25, 0.35, 8.8, concrete, 5.2, 0.2, -1.0);
    const storePump = new THREE.Group();
    storePump.position.set(-3.6, 0, 2.6);
    store.add(storePump);
    box(storePump, 1.5, 0.2, 1.0, concrete, 0, 0.1, 0);
    cylinder(storePump, 0.36, 0.6, steel, 0, 0.5, 0);
    box(storePump, 0.7, 0.55, 0.7, darkSteel, 0.9, 0.48, 0);
    rod(storePump, [-0.8, 0.5, 0], [-2.6, 0.5, 0], 0.08, teal);

    /* ---------- 04 炼化：常压塔 + 减压塔 + 加热炉 + 管廊 ---------- */
    const refine = modelGroups[3];
    function distillationTower(x, z, height, radius, name) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.userData.skipMerge = true;
      refine.add(g);
      cylinder(g, radius, height, lightSteel, 0, height / 2 + 0.2, 0).userData.objectId = name === '常压塔' ? 'atmospheric_tower' : 'vacuum_tower';
      mesh(g, new THREE.SphereGeometry(radius, 26, 16), steel, 0, height + 0.2, 0).scale.y = 0.5;
      for (let y = 1.2; y < height; y += 2.1) {
        ring(g, radius + 0.12, y, darkSteel, 0, 0);
        const rail = mesh(g, new THREE.TorusGeometry(radius + 0.42, 0.02, 6, 36), darkSteel, 0, y + 0.42, 0);
        rail.rotation.x = Math.PI / 2;
        for (let a = 0; a < 6; a += 1) {
          rod(g, [Math.cos(a * Math.PI / 3) * (radius + 0.42), y, Math.sin(a * Math.PI / 3) * (radius + 0.42)], [Math.cos(a * Math.PI / 3) * (radius + 0.42), y + 0.42, Math.sin(a * Math.PI / 3) * (radius + 0.42)], 0.015, darkSteel);
        }
      }
      stairRun(g, radius + 0.55, -0.8, height - 1.5, darkSteel);
      for (let i = 0; i < 3; i += 1) {
        nozzle(g, radius + 0.3, 2.4 + i * (height - 4) / 3, 0.4, amber, 0.11, 0.9, false);
      }
      return g;
    }
    atmTowerGroup = distillationTower(-2.4, -0.6, 11.5, 1.45, '常压塔');
    vacTowerGroup = distillationTower(1.8, -1.4, 7.6, 1.7, '减压塔');
    loadRefineryUnit(refine);
    /* 加热炉 + 烟囱 */
    const heater = new THREE.Group();
    heater.userData.objectId = 'heater';
    heater.userData.skipMerge = true;
    heater.position.set(-4.6, 0, 3.6);
    refine.add(heater);
    box(heater, 3.4, 2.6, 2.6, steel, 0, 1.3, 0);
    cylinder(heater, 0.42, 4.6, darkSteel, 1.2, 4.8, 0);
    box(heater, 0.9, 0.8, 0.12, amber, 0, 1.2, 1.34);
    rod(heater, [-1.7, 2.0, 0], [-2.6, 2.0, 0], 0.12, amber);
    loadHeroAsset(heater, 'heater', 'heater', 0.8);
    /* 管廊 */
    for (let x = -3.8; x <= 4; x += 2.6) {
      rod(refine, [x, 0.2, 3.0], [x, 3.4, 3.0], 0.07, darkSteel);
    }
    rod(refine, [-4.2, 3.2, 2.8], [4.4, 3.2, 2.8], 0.12, amber);
    rod(refine, [-4.2, 2.8, 3.2], [4.4, 2.8, 3.2], 0.1, steel);

    /* ---------- 05 产品去向：可识别的产品色板 ---------- */
    const products = modelGroups[4];
    /* 加油机 */
    const dispenser = new THREE.Group();
    dispenser.userData.objectId = 'fuel_dispenser';
    dispenser.position.set(-3.4, 0, 2.2);
    products.add(dispenser);
    box(dispenser, 1.1, 2.0, 0.7, lightSteel, 0, 1.0, 0);
    box(dispenser, 1.2, 0.35, 0.8, amber, 0, 2.2, 0);
    box(dispenser, 0.5, 0.3, 0.02, darkSteel, 0, 1.55, 0.36);
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.55, 1.2, 0.1), new THREE.Vector3(0.95, 0.9, 0.3), new THREE.Vector3(0.85, 0.35, 0.35)
    ]);
    mesh(dispenser, new THREE.TubeGeometry(hose, 20, 0.035, 6, false), material(0x2a2822, false), 0, 0, 0);
    /* 塑料瓶（Lathe） */
    const bottlePts = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      bottlePts.push(new THREE.Vector2(0.05 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.25)), t * 1.5));
    }
    bottlePts.push(new THREE.Vector2(0.12, 1.62));
    const bottle = mesh(products, new THREE.LatheGeometry(bottlePts, 26), material(0x9fd3c6, false), -1.2, 0.15, 2.4);
    bottle.userData.objectId = 'plastic_bottle';
    bottle.material.transparent = true;
    bottle.material.opacity = 0.72;
    /* 纤维卷 */
    const spool = new THREE.Group();
    spool.position.set(0.9, 0, 2.6);
    products.add(spool);
    cylinder(spool, 0.75, 0.9, lightSteel, 0, 0.55, 0).userData.objectId = 'fiber_spool';
    [0.25, 0.55, 0.85].forEach(function (y) {
      mesh(spool, new THREE.TorusGeometry(0.78, 0.09, 8, 26), material(0xc9b48a, false), 0, y, 0).rotation.x = Math.PI / 2;
    });
    /* 润滑油桶 */
    cylinder(products, 0.55, 1.1, material(0xb38a4a, true), 2.8, 0.7, 2.3).userData.objectId = 'lubricant_can';
    ring(products, 0.57, 1.2, darkSteel, 2.8, 2.3);
    /* 沥青路面样块 */
    box(products, 2.6, 0.35, 1.5, material(0x2a2822, false), 0.4, 0.32, -2.6).userData.objectId = 'asphalt_slab';
    box(products, 2.2, 0.02, 0.12, material(0xcfc8ba, false), 0.4, 0.51, -2.6);
    /* 产品标签 */
    const productLabel = groundLabel('燃料 · 材料 · 日常用品', 7.2, '#b6b0a2');
    productLabel.position.set(0, 0.2, -4.3);
    products.add(productLabel);

    /* ---------- 区域标签（HTML，可点击） ---------- */
    const labelY = [3.2, 4.2, 5.2, 9.6, 3.4];
    modelGroups.forEach(function (group, index) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'object-label';
      button.textContent = REGIONS[index].name;
      button.setAttribute('aria-label', '查看' + stageNames[index]);
      button.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
      button.addEventListener('click', function () { selectStage(index, true); });
      viewport.appendChild(button);
      labels.push({
        element: button,
        anchor: new THREE.Vector3(group.position.x, labelY[index], group.position.z + 4.6)
      });
    });

    /* ---------- 工艺流程：区域之间的物料连接（不再是悬空光管） ---------- */
    const pipeGroup = new THREE.Group();
    sceneRoot.add(pipeGroup);
    const anchors = modelGroups.map(function (group, index) {
      return group.position.clone().add(new THREE.Vector3(-REGIONS[index].w / 2 + 0.6, 1.9, 0));
    });
    for (let i = 0; i < anchors.length - 1; i += 1) {
      const a = anchors[i].clone();
      const b = anchors[i + 1].clone();
      b.x = modelGroups[i + 1].position.x - REGIONS[i + 1].w / 2 + 0.6;
      const curve = new THREE.CatmullRomCurve3([
        a,
        a.clone().lerp(b, 0.3).setY(1.5),
        a.clone().lerp(b, 0.7).setY(1.5),
        b
      ]);
      const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.1, 8, false), amber.clone());
      pipeGroup.add(pipe);
      pipes.push({ curve: curve, object: pipe });
      const particle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9fd3c6 }));
      particle.position.copy(curve.getPoint(0.3));
      sceneRoot.add(particle);
      particles.push(particle);
    }
    mergeStaticMeshes(pipeGroup);
    const mergedPipe = pipeGroup.children.filter(function (child) { return child.isMesh; })[0] || null;
    if (mergedPipe) pipes.forEach(function (item) { item.object = mergedPipe; });
    pipeGroup.userData.skipMerge = true;
    particles.forEach(function (particle) { particle.userData.skipMerge = true; });

    /* ---------- 远景：低对比的工业轮廓，给场景纵深，不与主设备争焦点 ---------- */
    for (let i = 0; i < 7; i += 1) {
      const w = 3 + (i % 3) * 2.4;
      const h = 2.4 + (i % 4) * 1.7;
      const d = 2.4 + (i % 2) * 2;
      box(sceneRoot, w, h * 0.55, d, material(0x14140f, false), -30 + i * 11, h * 0.27 - 0.2, -23 - (i % 3) * 2.5);
    }
    box(sceneRoot, 78, 0.8, 1.2, material(0x14140f, false), 3, 0.2, -24);
    modelGroups.forEach(function (group) { mergeStaticMeshes(group); group.userData.skipMerge = true; });
    mergeStaticMeshes(sceneRoot);
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
    updateDeviceCard();
  }

  function updateDeviceCard() {
    if (!deviceCardEl || deviceCardEl.hidden) return;
    if (activeScene) { deviceCardEl.hidden = true; return; }
    if (!deviceAnchor) return;
    const point = deviceAnchor.clone().project(camera);
    if (point.z > 1) { deviceCardEl.hidden = true; return; }
    const w = viewport.clientWidth, h = viewport.clientHeight;
    const cw = deviceCardEl.offsetWidth || 280;
    const ch = deviceCardEl.offsetHeight || 160;
    let x = (point.x + 1) * w / 2;
    let y = (1 - point.y) * h / 2;
    x = Math.max(cw / 2 + 8, Math.min(w - cw / 2 - 8, x));
    y = Math.max(ch + 30, Math.min(h - 18, y));
    deviceCardEl.style.left = '';
    deviceCardEl.style.top = '';
  }

  function render(timestamp) {
    requestAnimationFrame(render);
    if (document.hidden || !renderer) return;
    if (contextLostAt && performance.now() - contextLostAt > 1200) {
      const drawn = renderer.info && renderer.info.render && renderer.info.render.calls > 0;
      if (drawn) {
        contextLostAt = 0;
        const fb = document.getElementById('fallback');
        if (fb) fb.hidden = true;
      }
    }
    const delta = Math.min(50, timestamp - lastFrame);
    lastFrame = timestamp;
    if (playing && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) phase = (phase + delta / 2800) % 1;
    updateCamera(timestamp);
    particles.forEach(function (particle, index) {
      particle.position.copy(pipes[index].curve.getPoint((phase + index * 0.19) % 1));
      particle.visible = playing;
    });
    if (pumpAnim) {
      const at = timestamp * 0.001;
      pumpAnim.beam.rotation.z = Math.sin(at * 1.6) * 0.05;
      pumpAnim.crank.rotation.z = at * 0.9;
    }
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
    scene.background = new THREE.Color(0x0b0f11);
    scene.fog = new THREE.FogExp2(0x0b0f11, 0.004);
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    viewport.prepend(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', function (event) {
      event.preventDefault();
      contextLostAt = performance.now();
      const fb = document.getElementById('fallback');
      if (fb) {
        fb.hidden = false;
        fb.textContent = '三维上下文丢失，正在尝试恢复；下方流程节点与讲解仍可使用。';
      }
    });
    renderer.domElement.addEventListener('webglcontextrestored', function () {
      const fb = document.getElementById('fallback');
      if (fb) fb.hidden = true;
      resize();
    });
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '井筒、处理设施、储罐、炼化单元和产品的三维模型');
    scene.add(new THREE.HemisphereLight(0xf2ead9, 0x29301e, 2.0));
    const key = new THREE.DirectionalLight(0xfff3df, 3.5);
    key.position.set(-12, 30, 18);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb6ad, 2.8);
    rim.position.set(10, 15, -22);
    scene.add(rim);
    const warm = new THREE.DirectionalLight(0xffc887, 1.5);
    warm.position.set(-22, 10, -5);
    scene.add(warm);

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
          const hitPoint = hits[0].point.clone();
          let object = hits[0].object;
          let objectId = null;
          let probe = object;
          while (probe) {
            if (probe.userData && probe.userData.objectId) { objectId = probe.userData.objectId; break; }
            probe = probe.parent;
          }
          while (object && object.userData.stage === undefined) object = object.parent;
          if (object) {
            const idx = object.userData.stage;
            if (objectId) {
              selectStage(idx, true, objectId, hitPoint);
              return;
            }
            const hook = window.__stage && window.__stage.levelHook && window.__stage.levelHook(idx);
            if (hook) { markLevel(idx); hook(); return; }
            selectStage(idx, true, null, hitPoint);
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
    moveCamera({ targetX: 4, targetY: 2.8, targetZ: 0, radius: 54, azimuth: 0.28, elevation: 0.54 });
  });
  document.getElementById('focus').addEventListener('click', function () { selectStage(currentStage, true); });
  document.getElementById('next').addEventListener('click', function () {
    selectStage((currentStage + 1) % stageNames.length, true);
  });
  const playBtn = document.getElementById('play');
  if (playBtn) {
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.textContent = playing ? '暂停流向' : '播放流向';
  }
  const spinDefault = document.getElementById('spin');
  if (spinDefault) spinDefault.setAttribute('aria-pressed', String(autoOrbit));

  const layoutEl = document.querySelector('.layout');
  function applyModeLayout(modeName) {
    if (!layoutEl) return;
    layoutEl.classList.toggle('rail-open', modeName === 'task');
    layoutEl.classList.toggle('side-hidden', modeName === 'tour');
  }
  function setRail(open, section) {
    if (!layoutEl) return;
    layoutEl.classList.toggle('rail-open', open);
    if (open && section === 'source') {
      const src = document.querySelector('.source');
      if (src) src.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
  document.querySelectorAll('[data-rail]').forEach(function (btn) {
    btn.addEventListener('click', function () { setRail(true, btn.getAttribute('data-rail')); });
  });
  const railClose = document.getElementById('rail-close');
  if (railClose) railClose.addEventListener('click', function () { setRail(false); });

  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', function () {
      const open = moreMenu.hidden;
      moreMenu.hidden = !open;
      moreBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (event) {
      if (moreMenu.hidden) return;
      if (moreBtn.contains(event.target) || moreMenu.contains(event.target)) return;
      moreMenu.hidden = true;
      moreBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !moreMenu.hidden) {
        moreMenu.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.focus();
      }
    });
  }

  const aboutOpen = document.getElementById('about-open');
  const aboutDlg = document.getElementById('about');
  if (aboutOpen && aboutDlg) {
    aboutOpen.addEventListener('click', function () { aboutDlg.showModal(); });
    const aboutClose = document.getElementById('about-close');
    if (aboutClose) aboutClose.addEventListener('click', function () { aboutDlg.close(); });
    aboutDlg.addEventListener('click', function (event) {
      if (event.target === aboutDlg) aboutDlg.close();
    });
  }

  const soundBtn = document.getElementById('sound');
  if (soundBtn) soundBtn.addEventListener('click', function () {
    if (!window.Ambient) { soundBtn.textContent = '声音不可用'; return; }
    const result = window.Ambient.toggle();
    if (!result.supported) { soundBtn.textContent = '声音不可用'; return; }
    soundBtn.setAttribute('aria-pressed', String(result.on));
    soundBtn.textContent = result.on ? '声音开' : '声音';
  });
  const cutBtn = document.getElementById('cut');
  if (cutBtn) cutBtn.addEventListener('click', function () { applyUnitCut(!unitState.cut); });
  const spinBtn = document.getElementById('spin');
  if (spinBtn) spinBtn.addEventListener('click', function () { setAutoOrbit(!autoOrbit); });
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
    if (history.length) {
      lines.push('操作轨迹（示意）：');
      history.forEach(function (row) {
        lines.push('  ' + row.time + ' · ' + row.action + ' = ' + row.value + (row.unit ? '（' + row.unit + '）' : '') + ' · ' + (row.stageId || ''));
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
  /* ---------- 设备级知识卡（点击三维设备时使用） ---------- */
  const DEVICE_INFO = {
    three_phase_separator: { name: '三相分离器', stage: 1, ask: '三相分离器怎么把油、气、水分开？', text: '按密度与相态把井口产出物分成气、油、水三路，再分别送去处理或储存。' },
    pumpjack: { name: '抽油机', stage: 0, ask: '抽油机是怎么把油从井里抽上来的？', text: '把地面动力转成上下往复运动，通过抽油杆带动井下泵，把油举升到地面。' },
    wellhead: { name: '井口采油树', stage: 0, ask: '采油树上的阀门是做什么的？', text: '井口阀组控制油流开关与压力，把地下产出的流体安全导入集输管线。' },
    fixed_roof_tank: { name: '固定顶储罐', stage: 2, ask: '固定顶储罐和浮顶罐有什么区别？', text: '罐顶固定，液位下降时罐内油气空间变大；需要呼吸阀与油气处理。' },
    floating_roof_tank: { name: '外浮顶储罐', stage: 2, ask: '外浮顶罐为什么能减少油气损耗？', text: '浮盘随液位升降、紧贴油面，油气空间小；但损耗仍受密封、附件与操作影响。' },
    atmospheric_tower: { name: '常压蒸馏塔', stage: 3, ask: '常压塔为什么不同高度能抽出不同馏分？', text: '塔板让上升油气与下降回流液反复接触，按沸点范围在不同高度分出馏分。' },
    vacuum_tower: { name: '减压蒸馏塔', stage: 3, ask: '减压塔为什么要降低压力？', text: '降低压力可降低沸点，让重油在较低温度继续分离，避免高温裂解。' },
    heater: { name: '加热炉', stage: 3, ask: '加热炉为什么不能把原油加热到更高温度？', text: '把热量经炉管传给原油，使其部分汽化；温度过高会导致裂解，改变产品结构。' },
    fuel_dispenser: { name: '加油机', stage: 4, ask: '汽油从炼厂到加油机要经过哪些环节？', text: '炼厂产出的燃料经调和、储运与配送，最终到达加油站。' },
    plastic_bottle: { name: '塑料瓶', stage: 4, ask: '塑料一定来自石油吗？', text: '塑料可由石油路线生产，也可能来自天然气、煤基或生物基原料，不能一概而论。' },
    fiber_spool: { name: '合成纤维', stage: 4, ask: '衣服里的合成纤维和石油有什么关系？', text: '部分合成纤维以石化单体为原料；具体路线取决于纤维品种与工厂配置。' },
    lubricant_can: { name: '润滑油', stage: 4, ask: '润滑油是怎么从原油里得到的？', text: '由适合的馏分经精制、调配与添加剂处理得到，用于减少摩擦与磨损。' },
    asphalt_slab: { name: '沥青路面', stage: 4, ask: '沥青是炼厂的哪个部分来的？', text: '沥青主要来自减压渣油等重质组分，经处理满足道路或建筑用途。' }
  };

  function buildDeviceList() {
    const body = document.getElementById('device-list-body');
    if (!body) return;
    body.textContent = '';
    [0, 1, 2, 3, 4].forEach(function (stage) {
      const ids = Object.keys(DEVICE_INFO).filter(function (id) { return DEVICE_INFO[id].stage === stage; });
      if (!ids.length) return;
      const group = document.createElement('div');
      group.className = 'device-list__group';
      group.textContent = '第 ' + (stage + 1) + ' 环节 · ' + stageNames[stage];
      body.appendChild(group);
      ids.forEach(function (id) {
        const info = DEVICE_INFO[id];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'device-item';
        btn.textContent = info.name;
        btn.setAttribute('aria-label', '查看设备：' + info.name + '，' + stageNames[stage]);
        btn.addEventListener('click', function () {
          selectStage(info.stage, true, id);
          const list = document.getElementById('device-list');
          if (list) list.hidden = true;
        });
        body.appendChild(btn);
      });
    });
  }

  function setDeviceList(open) {
    const list = document.getElementById('device-list');
    const btn = document.getElementById('device-list-btn');
    if (!list) return;
    list.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) {
      const first = list.querySelector('.device-item');
      if (first) first.focus();
    } else if (btn) {
      btn.focus();
    }
  }

  buildDeviceList();
  const listBtn = document.getElementById('device-list-btn');
  if (listBtn) listBtn.addEventListener('click', function () { setDeviceList(true); });
  const listClose = document.getElementById('device-list-close');
  if (listClose) listClose.addEventListener('click', function () { setDeviceList(false); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      const list = document.getElementById('device-list');
      if (list && !list.hidden) setDeviceList(false);
    }
  });
  let deviceCardEl = null;
  let deviceAnchor = null;
  const history = [];
  function showDeviceCard(objectId, index, anchor) {
    if (window.Ambient) window.Ambient.blip();
    const info = DEVICE_INFO[objectId];
    if (!info) return;
    if (!deviceCardEl) deviceCardEl = document.getElementById('device-card');
    if (!deviceCardEl) return;
    if (deviceCardEl.parentNode !== viewport) viewport.appendChild(deviceCardEl);
    deviceAnchor = anchor && anchor.clone ? anchor.clone() : new THREE.Vector3(REGIONS[index].x, 3.4, REGIONS[index].z);
    deviceAnchor.y += 0.9;
    deviceCardEl.hidden = false;
    document.getElementById('device-stage').textContent = '第 ' + (index + 1) + ' 环节 · ' + stageNames[index];
    document.getElementById('device-name').textContent = info.name;
    document.getElementById('device-text').textContent = info.text;
    const chapter = document.getElementById('device-chapter');
    chapter.href = 'chapter.html?id=' + STAGE_IDS[index];
    const askBtn = document.getElementById('device-ask');
    askBtn.onclick = function () {
      const input = document.getElementById('leadai-q');
      if (!input) return;
      input.value = info.ask;
      input.focus();
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const close = document.getElementById('device-close');
    close.onclick = function () {
      deviceCardEl.hidden = true;
      if (window.__sceneContext) {
        window.__sceneContext.selectedObjectId = null;
        document.dispatchEvent(new CustomEvent('scene-context', { detail: window.__sceneContext }));
      }
    };
  }
  function hideDeviceCard() {
    if (deviceCardEl) deviceCardEl.hidden = true;
    deviceAnchor = null;
  }

  /* ---------- 场景上下文：AI / 写作 / 测试共用 ---------- */
  const SCENE_ID = 'oil_industry_journey';
  const STAGE_IDS = ['drill', 'gather', 'store', 'refine', 'use'];
  let mode = 'free';
  function syncSceneContext(index, objectId, action) {
    var ctx = {
      sceneId: SCENE_ID,
      stageId: index == null ? 'overview' : STAGE_IDS[index],
      levelId: null,
      selectedObjectId: objectId || null,
      knowledgeIds: index == null ? [] : ['kb_' + STAGE_IDS[index]],
      experienceMode: mode,
      interaction: action || null
    };
    window.__sceneContext = ctx;
    document.dispatchEvent(new CustomEvent('scene-context', { detail: ctx }));
    var box = document.getElementById('leadai-ctx');
    if (box && index != null) box.textContent = '上下文 · ' + stageNames[index];
  }

  function markLevel(index) {
    if (!window.__sceneContext) syncSceneContext(index, null, null);
    const ctx = window.__sceneContext;
    ctx.levelId = 'l' + (index + 1);
    ctx.interaction = null;
    window.__sceneContext = ctx;
    document.dispatchEvent(new CustomEvent('scene-context', { detail: ctx }));
  }
  function loadAnimatedPumpjack(container) {
    if (!window.ObjLite) return;
    window.ObjLite.load('assets/hero/pumpjack/pumpjack.obj', 'assets/hero/pumpjack/pumpjack.mtl').then(function (root) {
      const statics = [];
      const beam = [];
      const crank = [];
      root.children.slice().forEach(function (node) {
        const name = node.name || '';
        if (name.indexOf('beam') >= 0) beam.push(node);
        else if (name.indexOf('crank') >= 0) crank.push(node);
        else statics.push(node);
      });
      const g = new THREE.Group();
      statics.forEach(function (node) {
        node.userData.objectId = 'pumpjack';
        node.userData.heroAsset = 'pumpjack';
        g.add(node);
      });
      const beamPivot = new THREE.Group();
      beamPivot.position.set(-0.2, 3.6, 0);
      beam.forEach(function (node) {
        node.position.set(0.2, -3.6, 0);
        node.userData.objectId = 'pumpjack';
        beamPivot.add(node);
      });
      g.add(beamPivot);
      const crankPivot = new THREE.Group();
      crankPivot.position.set(-2.35, 2.0, 0);
      crank.forEach(function (node) {
        node.position.set(2.35, -2.0, 0);
        node.userData.objectId = 'pumpjack';
        crankPivot.add(node);
      });
      g.add(crankPivot);
      g.scale.setScalar(0.55);
      container.children.slice().forEach(function (child) {
        container.remove(child);
        child.traverse(function (node) {
          if (node.geometry) node.geometry.dispose();
          if (node.material) node.material.dispose();
        });
      });
      container.add(g);
      pumpAnim = { beam: beamPivot, crank: crankPivot };
    }).catch(function () {});
  }

  function loadRefineryUnit(refine) {
    if (!window.ObjLite) return;
    window.ObjLite.load('assets/tower/tower.obj', 'assets/tower/tower.mtl').then(function (unit) {
      const drop = /^(Ground|Heater|Heater_Chimney|Pump_|Condenser|Box_|Ladder|Railing_|Post_|Manway_|Nozzle_|Flange_)/;
      unit.traverse(function (node) {
        if (!node.isMesh) return;
        if (drop.test(node.name)) { node.visible = false; return; }
        if (/ShellHalf$|DomeHalf$/.test(node.name)) {
          node.visible = false;
          unitState.half.push(node);
          node.userData.noMerge = true;
        } else if (/Shell$|Dome$/.test(node.name)) {
          unitState.full.push(node);
          node.userData.noMerge = true;
        }
        if (/^Tower_Atmospheric_/.test(node.name)) node.userData.objectId = 'atmospheric_tower';
        if (/^Tower_Vacuum_/.test(node.name)) node.userData.objectId = 'vacuum_tower';
      });
      unit.scale.setScalar(0.46);
      unit.position.set(-2.4, 0.2, -0.6);
      unit.userData.skipMerge = true;
      refine.add(unit);
      if (atmTowerGroup) atmTowerGroup.visible = false;
      if (vacTowerGroup) vacTowerGroup.visible = false;
      const feedPts = [
        new THREE.Vector3(-6.4, 1.9, 0),
        new THREE.Vector3(-5.2, 1.9, -0.25),
        new THREE.Vector3(-5.2, 4.1, -0.45),
        new THREE.Vector3(-5.62, 6.18, -0.6)
      ];
      const feedCurve = new THREE.CatmullRomCurve3(feedPts);
      const feedMat = new THREE.MeshStandardMaterial({ color: 0xd8a24a, metalness: 0.6, roughness: 0.38, emissive: 0x2a1c08 });
      const feedPipe = new THREE.Mesh(new THREE.TubeGeometry(feedCurve, 40, 0.12, 8, false), feedMat);
      feedPipe.userData.skipMerge = true;
      refine.add(feedPipe);
      unitState.group = unit;
      unitState.loaded = true;
    }).catch(function () {});
  }

  function applyUnitCut(cut) {
    unitState.cut = !!cut;
    unitState.half.forEach(function (node) { node.visible = unitState.cut; });
    unitState.full.forEach(function (node) { node.visible = !unitState.cut; });
    const btn = document.getElementById('cut');
    if (btn) btn.setAttribute('aria-pressed', String(unitState.cut));
  }

  function setAutoOrbit(on) {
    autoOrbit = !!on;
    const btn = document.getElementById('spin');
    if (btn) btn.setAttribute('aria-pressed', String(autoOrbit));
  }

  function loadHeroAsset(container, assetId, objectId, scale) {
    if (!window.ObjLite || !container) return;
    var base = 'assets/hero/' + assetId + '/' + assetId;
    window.ObjLite.load(base + '.obj', base + '.mtl').then(function (hero) {
      hero.scale.setScalar(scale);
      hero.position.y = 0;
      hero.traverse(function (node) {
        if (!node.isMesh) return;
        node.userData.objectId = objectId;
        node.userData.heroAsset = assetId;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      container.children.slice().forEach(function (child) {
        container.remove(child);
        child.traverse(function (node) {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            if (Array.isArray(node.material)) node.material.forEach(function (m) { m.dispose(); });
            else node.material.dispose();
          }
        });
      });
      container.add(hero);
      container.userData.heroLoaded = true;
      container.userData.heroParseMs = hero.userData.parseMs;
    }).catch(function () {
      /* 保留程序化模型作为回退 */
    });
  }

  function setInteraction(action, value, unit) {
    const fallback = {
      sceneId: SCENE_ID,
      stageId: STAGE_IDS[currentStage],
      levelId: null,
      selectedObjectId: null,
      knowledgeIds: ['kb_' + STAGE_IDS[currentStage]],
      experienceMode: mode || 'task'
    };
    const ctx = window.__sceneContext || fallback;
    ctx.interaction = { action: action, value: value, unit: unit || '示意' };
    ctx.experienceMode = mode || ctx.experienceMode;
    history.push({
      action: action, value: value, unit: unit || '示意',
      stageId: ctx.stageId, levelId: ctx.levelId || null,
      time: new Date().toTimeString().slice(0, 8)
    });
    if (history.length > 12) history.shift();
    ctx.history = history.slice(-8);
    window.__sceneContext = ctx;
    document.dispatchEvent(new CustomEvent('scene-context', { detail: ctx }));
  }

  /* ---------- 三种体验模式 + 沉浸导览 ---------- */
  const TOUR_STEPS = [
    { stage: null, ms: 9000, title: '石油产业链数字展馆', text: '从地下油藏到炼化装置，再到你手里的材料。这是一条按产业链组织的概念沙盘，不是某一座真实厂区。' },
    { stage: 0, ms: 16000, title: '第一站 · 地下', text: '油藏在岩石孔隙里，不在“油湖”。井筒把储层和地面连起来；剖面是地质教学示意，不是真实油藏模型。' },
    { stage: 1, ms: 14000, title: '第二站 · 地面处理', text: '井口产出物是油、气、水的混合物。三相分离器按密度与相态把它们分开，再分别送去储存或处理。' },
    { stage: 2, ms: 13000, title: '第三站 · 储运', text: '固定顶罐与外浮顶罐的结构差异。浮顶能减少油气空间，但实际损耗仍受边缘密封、附件和维护状态影响。' },
    { stage: 3, ms: 16000, title: '第四站 · 炼化', text: '常压蒸馏按沸点范围把原油切成馏分。馏分不是成品油，后续还要裂化、重整、加氢与调和。' },
    { stage: 4, ms: 13000, title: '第五站 · 产品去向', text: '燃料、润滑油、沥青和部分塑料来自石油路线；塑料也可能来自天然气、煤基或生物基原料。' },
    { stage: null, ms: 9000, title: '回到全景', text: '五个环节连成一条产业链。点击设备、切换关卡，或者直接向 AI 提问。' }
  ];
  let tourIndex = -1;
  let tourPlaying = false;
  let tourTimer = 0;
  const tourCard = document.getElementById('tour-card');
  const tourStepEl = document.getElementById('tour-step');
  const tourTitle = document.getElementById('tour-title');
  const tourText = document.getElementById('tour-text');
  const tourPauseBtn = document.getElementById('tour-pause');
  const tourNextBtn = document.getElementById('tour-next');
  const tourExitBtn = document.getElementById('tour-exit');
  const modeHint = document.getElementById('mode-hint');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function paintModes() {
    document.querySelectorAll('.modebar [data-mode]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-mode') === mode));
    });
    if (modeHint) {
      modeHint.textContent = mode === 'tour'
        ? '导览进行中 · 拖动或滚轮可暂停并接管镜头'
        : mode === 'task' ? '从右侧进入关卡，完成动手任务' : '拖动旋转 · 滚轮缩放 · 点击设备查看';
    }
    if (tourPauseBtn) tourPauseBtn.textContent = tourPlaying ? '暂停' : '继续导览';
  }

  function clearTourTimer() {
    if (tourTimer) { clearTimeout(tourTimer); tourTimer = 0; }
  }

  function showTourStep(index) {
    const step = TOUR_STEPS[index];
    if (!step) { stopTour(); return; }
    tourIndex = index;
    if (step.stage == null) {
      moveCamera({ targetX: 4, targetY: 2.8, targetZ: 0, radius: 54, azimuth: 0.28, elevation: 0.54 });
      syncSceneContext(null);
    } else {
      selectStage(step.stage, true);
    }
    if (tourCard) {
      tourCard.hidden = false;
      tourStepEl.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(TOUR_STEPS.length).padStart(2, '0');
      tourTitle.textContent = step.title;
      tourText.textContent = step.text;
    }
    clearTourTimer();
    if (tourPlaying && index < TOUR_STEPS.length - 1) {
      tourTimer = setTimeout(function () { showTourStep(index + 1); }, step.ms);
    } else if (tourPlaying) {
      tourTimer = setTimeout(function () { stopTour(); }, step.ms);
    }
  }

  function startTour() {
    mode = 'tour';
    tourPlaying = !reduceMotion;
    tourIndex = 0;
    if (typeof applyModeLayout === 'function') applyModeLayout('tour');
    paintModes();
    showTourStep(0);
  }

  function pauseTour() {
    tourPlaying = false;
    clearTourTimer();
    paintModes();
  }

  function stopTour() {
    clearTourTimer();
    tourPlaying = false;
    tourIndex = -1;
    if (tourCard) tourCard.hidden = true;
    mode = 'free';
    paintModes();
    if (typeof applyModeLayout === 'function') applyModeLayout('free');
  }

  document.querySelectorAll('.modebar [data-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const next = btn.getAttribute('data-mode');
      if (next === 'tour') { startTour(); return; }
      if (tourCard && !tourCard.hidden) stopTour();
      mode = next;
      paintModes();
      applyModeLayout(next);
      if (next === 'task' && window.__stage && window.__stage.levelHook) {
        live.textContent = '任务关卡：从右栏进入当前环节，完成动手任务。';
      }
    });
  });
  if (tourPauseBtn) tourPauseBtn.addEventListener('click', function () {
    if (tourPlaying) { pauseTour(); return; }
    tourPlaying = true;
    paintModes();
    showTourStep(tourIndex < 0 ? 0 : tourIndex);
  });
  if (tourNextBtn) tourNextBtn.addEventListener('click', function () {
    if (tourIndex >= TOUR_STEPS.length - 1) { stopTour(); return; }
    showTourStep(tourIndex + 1);
  });
  if (tourExitBtn) tourExitBtn.addEventListener('click', function () { stopTour(); });
  /* 用户任何明确镜头输入都暂停自动导览，而不是锁住控制器 */
  ['pointerdown', 'wheel', 'touchstart'].forEach(function (type) {
    viewport.addEventListener(type, function () {
      if (mode === 'tour' && tourPlaying) pauseTour();
    }, { passive: true });
  });
  window.__tour = {
    start: startTour,
    stop: stopTour,
    next: function () { if (tourIndex < TOUR_STEPS.length - 1) showTourStep(tourIndex + 1); },
    pause: pauseTour,
    get state() { return { index: tourIndex, playing: tourPlaying, mode: mode, total: TOUR_STEPS.length }; }
  };

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
      if (window.__sceneContext) {
        window.__sceneContext.levelId = null;
        window.__sceneContext.interaction = null;
        document.dispatchEvent(new CustomEvent('scene-context', { detail: window.__sceneContext }));
      }
      document.dispatchEvent(new CustomEvent('stage-level'));
    },
    isLevel() { return !!activeScene; },
    setInteraction(action, value, unit) { setInteraction(action, value, unit); },
    showDevice(objectId) { const info = DEVICE_INFO[objectId]; if (info) selectStage(info.stage, true, objectId); },
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
    levelHook(i) { const h = (window.__levelHooks && window.__levelHooks[i]) || null; if (h) markLevel(i); return h; },
    refreshTaskPanel() { syncTaskPanel(); },
    get camera() { return activeCamera || camera; },
    setCut(on) { applyUnitCut(on); },
    get pump() { return pumpAnim; },
    get towerGroups() { return [atmTowerGroup, vacTowerGroup]; },
    setAutoOrbit(on) { setAutoOrbit(on); },
    stats() {
      const info = renderer.info.render;
      return { calls: info.calls, triangles: info.triangles,
               geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    },
    onResize(fn) { resizeHooks.push(fn); }
  };
  // 深链：#stage=N 直接定位到某环节；并同步右栏「读本章知识」
  window.__stage.selectStage = selectStage;
  function stageFromHash() {
    const m = /#stage=(\d+)/.exec(location.hash);
    if (!m) return;
    const idx = Number(m[1]);
    if (idx >= 0 && idx < stageNames.length) selectStage(idx, true);
  }
  stageFromHash();
  window.addEventListener("hashchange", stageFromHash);
  syncChapterLink(currentStage);
  resizeHooks.forEach(function (fn) { fn(); });

})();
