/* 阶段 07：沉浸导览状态机 + 探索档案 + 合成音频控制。
 * 导览步骤不是定时幻灯片：每一步由明确的“继续”动作推进；
 * 镜头/设备变化由当前关卡的真实 API 驱动，用户拖动/滚轮会立即暂停。
 */
(function (global) {
  'use strict';

  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var card = document.getElementById('tour-card');
  var stepEl = document.getElementById('tour-step');
  var titleEl = document.getElementById('tour-title');
  var textEl = document.getElementById('tour-text');
  var pauseBtn = document.getElementById('tour-pause');
  var nextBtn = document.getElementById('tour-next');
  var exitBtn = document.getElementById('tour-exit');
  var modeHint = document.getElementById('mode-hint');
  var legacyTour = global.__tour;
  var tour = { active: false, index: -1, playing: false, ready: false, busy: false, completed: 0, status: 'idle', token: 0 };
  var archiveEl = null;
  var archiveReturnFocus = null;
  var audioSlider = null;
  var audioBtn = null;

  function stage() { return global.__stage || null; }
  function ctx() { return global.__sceneContext || {}; }
  function apiFor(levelId) {
    var m = /^l(\d)$/.exec(levelId || '');
    return m ? global['__l' + m[1]] : null;
  }

  async function leaveLevel() {
    var st = stage();
    if (!st || !st.isLevel()) return;
    var api = apiFor(ctx().levelId);
    try { if (api && typeof api.exit === 'function') api.exit(); } catch (err) {}
    await wait(2000);
    if (st.isLevel()) st.back();
  }

  async function enterStage(index) {
    var st = stage();
    if (!st) return;
    var currentLevel = ctx().levelId;
    var currentStage = ctx().stage;
    if (st.isLevel() && currentLevel && currentStage === index) return;
    if (st.isLevel()) await leaveLevel();
    st.selectStage(index, true);
    await wait(500);
    var hook = st.levelHook(index);
    if (hook) hook();
    await wait(1400);
  }

  async function enterLevelAnd(index, fn) {
    await enterStage(index);
    if (typeof fn === 'function') {
      try { fn(); } catch (err) { /* 导览不能因为单个演示 API 失败而卡死 */ }
    }
    await wait(500);
  }

  var TOUR_STEPS = [
    {
      stepId: 'tour_overview', stage: null, objectId: null,
      title: '产业链全景', short: '全景',
      narration: '这是一条按产业链组织的概念沙盘，不是某一座真实油田，也不是一桶原油的固定加工路线。先看整条路线，再逐站进入。',
      sceneState: '总览全景；五区低亮',
      animation: '低亮路线流向',
      knowledge: ['kb_formation'],
      shotId: 'shot_overview', moveType: 'dolly', direction: 'in',
      completion: '用户点“继续”',
      next: 'tour_underground', exit: '退出到自由探索',
      objectIds: [],
      async enter(token) {
        await leaveLevel();
        if (stage()) stage().focusOverview();
        if (global.__stage && global.__stage.setMode) global.__stage.setMode('tour');
      }
    },
    {
      stepId: 'tour_underground', stage: 0, objectId: 'reservoir',
      title: '地下穿越', short: '地下',
      narration: '油藏不是“油湖”，油赋存在岩石孔隙里。剖面把地表、盖层、储层和井筒放在同一张图上。',
      sceneState: '进入地下剖面；储层高亮；油气水图例出现',
      animation: '储层高亮 / 流体静止',
      knowledge: ['kb_formation'],
      shotId: 'shot_descend', moveType: 'crane', direction: 'down',
      completion: '用户点“继续”',
      next: 'tour_reservoir', exit: '退出到自由探索',
      objectIds: ['underground_geology', 'reservoir'],
      async enter() {
        await enterLevelAnd(0, function () {
          if (global.__l1 && global.__l1.selectReservoir) global.__l1.selectReservoir();
        });
      }
    },
    {
      stepId: 'tour_reservoir', stage: 0, objectId: 'wellbore',
      title: '储层和井筒', short: '井筒',
      narration: '井筒从地面贯穿到储层。套管、水泥环、油管和射孔段各司其职；这里的剖面是地质教学示意。',
      sceneState: '井筒部件高亮；沿井筒上行',
      animation: '井筒轨迹上行 / 镜头抬升',
      knowledge: ['kb_drill'],
      shotId: 'shot_lift', moveType: 'crane', direction: 'up',
      completion: '用户点“继续”',
      next: 'tour_wellhead', exit: '退出到自由探索',
      objectIds: ['wellbore', 'wellhead'],
      async enter() {
        await enterLevelAnd(0, function () {
          if (global.__l1) {
            if (global.__l1.selectPart) global.__l1.selectPart('casing');
            if (global.__l1.traceUp) global.__l1.traceUp();
          }
        });
      }
    },
    {
      stepId: 'tour_wellhead', stage: 0, objectId: 'wellhead',
      title: '井口生产', short: '井口',
      narration: '井口采油树把地下产出的混合物接到地面管线。抽油机、阀组和集输管线是连续流程的接口。',
      sceneState: '井口/采油树成为焦点；地面管线可见',
      animation: '抽油机与井口状态示意',
      knowledge: ['kb_drill'],
      shotId: 'shot_lift', moveType: 'follow', direction: 'up',
      completion: '用户点“继续”',
      next: 'tour_separator', exit: '退出到自由探索',
      objectIds: ['wellhead', 'pumpjack'],
      async enter() {
        await enterLevelAnd(0, function () {
          if (global.__l1 && global.__l1.selectWellhead) global.__l1.selectWellhead(); else if (global.__l1 && global.__l1.selectPart) global.__l1.selectPart('casing');
        });
      }
    },
    {
      stepId: 'tour_separator', stage: 1, objectId: 'three_phase_separator',
      title: '三相分离', short: '分离',
      narration: '井口产出物是油、气、水的混合物。三相分离器按相态和密度把它们分开，再分别送去储存或处理。',
      sceneState: '分离器半剖打开；内部相层与三路出口出现',
      animation: '三相流线启动',
      knowledge: ['kb_gather'],
      shotId: 'shot_separate', moveType: 'dolly', direction: 'in',
      completion: '用户点“继续”',
      next: 'tour_storage', exit: '退出到自由探索',
      objectIds: ['three_phase_separator'],
      async enter() {
        await enterLevelAnd(1, function () {
          if (global.__l2) {
            if (global.__l2.applyStructure) global.__l2.applyStructure(true, false);
            if (global.__l2.startSeparation) global.__l2.startSeparation();
          }
        });
      }
    },
    {
      stepId: 'tour_storage', stage: 2, objectId: 'floating_roof_tank',
      title: '储运', short: '储运',
      narration: '外浮顶罐的浮盘贴着液面，能减少油气空间；但它不等于零损耗，密封、附件和维护状态仍然重要。',
      sceneState: '罐区近景；浮顶罐液位升高；泵送路径启动',
      animation: '浮盘随液位 / 泵送粒子',
      knowledge: ['kb_store'],
      shotId: 'shot_store', moveType: 'crane', direction: 'up',
      completion: '用户点“继续”',
      next: 'tour_refining', exit: '退出到自由探索',
      objectIds: ['fixed_roof_tank', 'floating_roof_tank', 'transfer_pump'],
      async enter() {
        await enterLevelAnd(2, function () {
          if (global.__l3) {
            global.__l3.selectTank('floating_roof_tank');
            if (global.__l3.setLevel) global.__l3.setLevel(72);
            if (global.__l3.startPump) global.__l3.startPump();
          }
        });
      }
    },
    {
      stepId: 'tour_refining', stage: 3, objectId: 'atmospheric_tower',
      title: '炼化塔剖切', short: '炼化',
      narration: '常压蒸馏按沸点范围把原油切成馏分。先看全剖：塔板、降液管和侧线让汽液接触与分离可见。',
      sceneState: '常压塔全剖；塔板、侧线、汽液接触出现',
      animation: '汽相上行 / 液相下行',
      knowledge: ['kb_refine'],
      shotId: 'shot_refine', moveType: 'crane', direction: 'up',
      completion: '用户点“继续”',
      next: 'tour_fractions', exit: '退出到自由探索',
      objectIds: ['atmospheric_tower', 'vacuum_tower', 'heater'],
      async enter() {
        await enterLevelAnd(3, function () {
          if (global.__l4) {
            if (global.__l4.setLevel) global.__l4.setLevel(2, false);
            if (global.__l4.startFlow) global.__l4.startFlow();
          }
        });
      }
    },
    {
      stepId: 'tour_fractions', stage: 3, objectId: 'atmospheric_tower',
      title: '馏分去向', short: '馏分',
      narration: '柴油是较重的中下部侧线馏分。馏分不是成品油，还要经过加氢、调和等后续加工；路线是典型示意。',
      sceneState: '柴油侧线高亮；后续加工路线出现',
      animation: '馏分侧线路径',
      knowledge: ['kb_refine', 'kb_use'],
      shotId: 'shot_refine', moveType: 'dolly', direction: 'in',
      completion: '用户点“继续”',
      next: 'tour_products', exit: '退出到自由探索',
      objectIds: ['atmospheric_tower'],
      async enter() {
        await enterLevelAnd(3, function () {
          if (global.__l4 && global.__l4.selectFraction) global.__l4.selectFraction('diesel');
        });
      }
    },
    {
      stepId: 'tour_products', stage: 4, objectId: 'plastic_bottle',
      title: '产品应用', short: '产品',
      narration: '燃料、材料、路面来自不同馏分和加工路线。塑料不一定来自石油，也可能来自天然气、煤基或生物基。',
      sceneState: '产品台近景；至少一个石油路线产品被选中',
      animation: '产品高亮 / 应用节点出现',
      knowledge: ['kb_use'],
      shotId: 'shot_city', moveType: 'dolly', direction: 'in',
      completion: '用户点“继续”',
      next: 'tour_summary', exit: '退出到自由探索',
      objectIds: ['fuel_dispenser', 'plastic_bottle', 'asphalt_slab'],
      async enter() {
        await enterLevelAnd(4, function () {
          if (global.__l5 && global.__l5.select) global.__l5.select(0); else if (global.__l5 && global.__l5.toggle) global.__l5.toggle(0);
        });
      }
    },
    {
      stepId: 'tour_summary', stage: null, objectId: null,
      title: '回到全景', short: '回顾',
      narration: '五个环节连成一条产业链。你刚刚走过的设备、知识点和选择已写入本机探索档案；可以再走一次，也可以自由探索。',
      sceneState: '总览；探索档案打开',
      animation: '路线低亮',
      knowledge: ['kb_formation', 'kb_drill', 'kb_gather', 'kb_store', 'kb_refine', 'kb_use'],
      shotId: 'shot_return', moveType: 'crane', direction: 'out',
      completion: '导览结束',
      next: '结束',
      exit: '退出到自由探索',
      objectIds: [],
      async enter() {
        await leaveLevel();
        if (stage()) stage().focusOverview();
        if (stage() && stage().setMode) stage().setMode('tour');
        tour.status = 'completed';
        tour.completed = TOUR_STEPS.length;
        recordTour('completed');
        await wait(500);
        openArchive(true);
      }
    }
  ];

  function paint() {
    if (!card) return;
    card.hidden = !tour.active;
    if (!tour.active) return;
    var s = TOUR_STEPS[tour.index];
    if (!s) return;
    stepEl.textContent = String(tour.index + 1).padStart(2, '0') + ' / ' + String(TOUR_STEPS.length).padStart(2, '0');
    titleEl.textContent = s.title;
    textEl.textContent = s.narration;
    global.__narrationText = s.title + '。' + s.narration;
    var extra = document.getElementById('tour-context');
    if (!extra) {
      extra = document.createElement('p');
      extra.id = 'tour-context';
      extra.className = 'tour-context';
      card.insertBefore(extra, card.querySelector('.tour-actions'));
    }
    extra.textContent = s.sceneState + ' · ' + s.completion;
    var progress = document.getElementById('tour-progress');
    if (!progress) {
      progress = document.createElement('div');
      progress.id = 'tour-progress';
      progress.className = 'tour-progress';
      card.insertBefore(progress, card.querySelector('.tour-actions'));
    }
    progress.innerHTML = TOUR_STEPS.map(function (_, i) {
      return '<i class="' + (i < tour.index ? 'done' : i === tour.index ? 'now' : '') + '"></i>';
    }).join('');
    if (pauseBtn) pauseBtn.textContent = tour.playing ? '暂停' : '继续';
    if (nextBtn) {
      nextBtn.textContent = tour.busy ? '准备中…' : (tour.index === TOUR_STEPS.length - 1 ? '结束导览' : (tour.index === 0 ? '开始 →' : '继续 →'));
      nextBtn.disabled = tour.busy;
    }
    if (exitBtn) exitBtn.textContent = '退出';
    card.dataset.stepId = s.stepId;
    document.body.classList.toggle('journey-busy', !!tour.busy);
    if (modeHint) modeHint.textContent = tour.playing ? '导览中 · 拖动/滚轮会暂停并交还镜头' : '导览已暂停 · 继续或退出';
    if (global.Ambient && s.stage != null) global.Ambient.setStage(s.stage);
  }

  async function showStep(index) {
    if (!tour.active) return;
    if (index < 0 || index >= TOUR_STEPS.length) return;
    var token = ++tour.token;
    tour.index = index;
    tour.ready = false;
    tour.busy = true;
    tour.playing = true;
    paint();
    var s = TOUR_STEPS[index];
    try { await s.enter(token); } catch (err) { /* 下一站仍可继续，避免卡在过场 */ }
    if (token !== tour.token) return;
    tour.busy = false;
    tour.ready = true;
    tour.playing = true;
    document.body.classList.remove('journey-paused');
    paint();
  }

  async function startTour() {
    if (global.__mission && global.__mission.state && global.__mission.state.status !== 'idle') {
      try { await global.__mission.exit(); } catch (err) {}
    }
    if (legacyTour && legacyTour.stop) { try { legacyTour.stop(); } catch (err) {} }
    await leaveLevel();
    tour.active = true;
    tour.status = 'active';
    tour.completed = 0;
    tour.index = 0;
    tour.playing = true;
    document.body.classList.add('journey-tour');
    document.body.classList.remove('journey-paused');
    if (stage() && stage().setMode) stage().setMode('tour');
    if (card) card.hidden = false;
    await showStep(0);
  }

  async function stopTour(record) {
    if (!tour.active) return;
    if (global.Voice) global.Voice.stop();
    tour.active = false;
    tour.playing = false;
    tour.token += 1;
    if (tour.status !== 'completed') tour.status = 'stopped';
    document.body.classList.remove('journey-tour', 'journey-paused');
    if (card) card.hidden = true;
    await leaveLevel();
    if (stage() && stage().setMode) stage().setMode('free');
    if (record !== false) recordTour(tour.status === 'completed' ? 'completed' : 'stopped');
  }

  function pauseTour() {
    if (!tour.active || !tour.playing) return;
    tour.playing = false;
    document.body.classList.add('journey-paused');
    pauseScene();
    paint();
  }

  function resumeTour() {
    if (!tour.active) return;
    tour.playing = true;
    document.body.classList.remove('journey-paused');
    resumeScene();
    if (global.Ambient && TOUR_STEPS[tour.index] && TOUR_STEPS[tour.index].stage != null) global.Ambient.setStage(TOUR_STEPS[tour.index].stage);
    paint();
  }

  let tourSceneRunState = null;

  function pauseScene() {
    var c = ctx();
    tourSceneRunState = {
      levelId: c.levelId || null,
      l2Running: !!(global.__l2 && global.__l2.running),
      l2Paused: !!(global.__l2 && global.__l2.paused),
      l3Running: !!(global.__l3 && global.__l3.pumpRunning),
      l3Paused: !!(global.__l3 && global.__l3.pumpPaused),
      l4FlowOn: !!(global.__l4 && global.__l4.flowOn),
      l4FlowPaused: !!(global.__l4 && global.__l4.flowPaused)
    };
    try {
      if (c.levelId === 'l2' && global.__l2 && global.__l2.pauseSeparation) global.__l2.pauseSeparation();
      if (c.levelId === 'l3' && global.__l3 && global.__l3.pausePump) global.__l3.pausePump();
      if (c.levelId === 'l4') {
        var b = document.getElementById('l4-flow');
        if (b && b.getAttribute('aria-pressed') === 'true') b.click();
      }
    } catch (err) {}
  }

  function resumeScene() {
    var c = ctx(), was = tourSceneRunState;
    tourSceneRunState = null;
    if (!was || was.levelId !== (c.levelId || null)) return;
    try {
      if (c.levelId === 'l2' && was.l2Running && !was.l2Paused && global.__l2 && global.__l2.startSeparation) global.__l2.startSeparation();
      if (c.levelId === 'l3' && was.l3Running && !was.l3Paused && global.__l3 && global.__l3.startPump) global.__l3.startPump();
      if (c.levelId === 'l4' && was.l4FlowOn && !was.l4FlowPaused && global.__l4) {
        if (!global.__l4.flowOn && global.__l4.startFlow) global.__l4.startFlow();
        else if (global.__l4.flowPaused) {
          var b = document.getElementById('l4-flow');
          if (b) b.click();
        }
      }
    } catch (err) {}
  }

  async function nextStep() {
    if (!tour.active || tour.busy) return;
    if (tour.index >= TOUR_STEPS.length - 1) {
      await stopTour(true);
      return;
    }
    await showStep(tour.index + 1);
  }

  function recordTour(status) {
    if (!global.JourneyStore) return;
    global.JourneyStore.recordTour({
      id: 'tour_main',
      status: status,
      completedSteps: status === 'completed' ? TOUR_STEPS.length : Math.max(0, tour.index),
      totalSteps: TOUR_STEPS.length,
      objects: TOUR_STEPS.slice(0, Math.max(0, tour.index + 1)).flatMap(function (s) { return s.objectIds || []; }),
      knowledge: TOUR_STEPS.slice(0, Math.max(0, tour.index + 1)).flatMap(function (s) { return s.knowledge || []; })
    });
  }

  /* ---------- 探索档案 ---------- */
  function ensureArchive() {
    if (archiveEl) return archiveEl;
    archiveEl = document.createElement('div');
    archiveEl.id = 'journey-archive';
    archiveEl.className = 'journey-modal';
    archiveEl.hidden = true;
    archiveEl.innerHTML = [
      '<div class="journey-modal__box" role="dialog" aria-modal="true" aria-labelledby="archive-title">',
      '<div class="archive-head"><span class="mission-kicker">能源探索档案 · 本机</span><button type="button" class="archive-x" id="archive-close" aria-label="关闭档案">关闭</button></div>',
      '<h2 id="archive-title">我走过什么、理解了什么</h2>',
      '<p class="archive-note" id="archive-note">只在本机保存；不上传个人行为记录。</p>',
      '<div class="archive-cols" id="archive-cols"></div>',
      '<p class="archive-boundary">说明：产业链是教学示意，不是真实油田地图、工程仿真或固定物流路线；“批次”是教学追踪标记。</p>',
      '<div class="archive-actions"><button type="button" class="mission-btn mission-btn--primary" id="archive-resume">继续探索</button><button type="button" class="mission-btn mission-btn--ghost" id="archive-clear">清空本机记录</button></div>',
      '</div>'
    ].join('');
    document.body.appendChild(archiveEl);
    archiveEl.querySelector('#archive-close').onclick = closeArchive;
    archiveEl.querySelector('#archive-resume').onclick = closeArchive;
    archiveEl.querySelector('#archive-clear').onclick = function () {
      if (!global.confirm('清空本机探索档案？这不会删除五关进度，但会清空已访问设备、知识点和任务记录。')) return;
      if (global.JourneyStore) global.JourneyStore.reset();
      renderArchive();
    };
    return archiveEl;
  }

  function openArchive(fromTour) {
    ensureArchive();
    archiveReturnFocus = document.activeElement;
    renderArchive(fromTour);
    archiveEl.hidden = false;
    var close = archiveEl.querySelector('#archive-close');
    if (close) close.focus();
  }

  function closeArchive() {
    if (!archiveEl) return;
    archiveEl.hidden = true;
    if (archiveReturnFocus && archiveReturnFocus.focus) archiveReturnFocus.focus();
  }

  function renderArchive(fromTour) {
    if (!archiveEl) return;
    var s = global.JourneyStore ? global.JourneyStore.summary() : { zones: [], stages: [], objects: [], knowledge: [], missions: {}, tours: [] };
    archiveEl.querySelector('#archive-title').textContent = fromTour ? '本轮导览结束 · 探索档案' : '我走过什么、理解了什么';
    archiveEl.querySelector('#archive-note').textContent = fromTour
      ? '你已经走完 10 站；下面是本次会话记录。只在本机保存，不上传。'
      : '只在本机保存；不上传个人行为记录。';
    var missions = s.missions && Object.keys(s.missions).map(function (k) { return s.missions[k]; }) || [];
    var doneMissions = missions.filter(function (m) { return m.status === 'complete'; });
    var cols = archiveEl.querySelector('#archive-cols');
    cols.innerHTML = [
      '<div class="archive-col"><h3>足迹</h3><p>区域 ' + s.zones.length + ' · 环节 ' + s.stages.length + ' · 设备 ' + s.objects.length + '</p><p class="archive-tags">' + (s.zones.length ? s.zones.map(escape).join(' · ') : '还没有记录') + '</p></div>',
      '<div class="archive-col"><h3>知识</h3><p>' + (s.knowledge.length ? s.knowledge.map(escape).join(' · ') : '还没有知识点记录') + '</p></div>',
      '<div class="archive-col"><h3>任务</h3><p>' + (missions.length ? missions.map(function (m) { return escape(m.title) + '：' + (m.status === 'complete' ? '已完成' : '进行中/暂停') + '（' + (m.steps || []).filter(function (x) { return x.done; }).length + '/5）'; }).join('<br>') : '还没有开始任务') + '</p></div>',
      '<div class="archive-col"><h3>导览</h3><p>' + (s.tours.length ? '已完成 ' + s.tours.filter(function (t) { return t.status === 'completed'; }).length + ' 次 · 最近 ' + escape(s.tours[s.tours.length - 1].status) + '（' + (s.tours[s.tours.length - 1].completedSteps || 0) + '/' + (s.tours[s.tours.length - 1].totalSteps || 10) + ' 站）' : '还没有导览记录') + '</p></div>'
    ].join('');
  }

  function escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; });
  }

  document.addEventListener('journey-open-archive', function () { openArchive(false); });

  /* ---------- 声音：默认静音，用户开启；无资产时合成环境音 ---------- */
  function ensureAudioUi() {
    var tools = document.querySelector('.scene-head .tools');
    if (!tools || document.getElementById('audio-toggle')) return;
    var wrap = document.createElement('span');
    wrap.className = 'audio-control';
    wrap.innerHTML = '<button type="button" id="audio-toggle" aria-pressed="false" title="合成环境音，非现场录音">声音关</button><input id="audio-volume" type="range" min="0" max="100" value="28" aria-label="音量">';
    var more = tools.querySelector('.more');
    tools.insertBefore(wrap, more || null);
    audioBtn = wrap.querySelector('#audio-toggle');
    audioSlider = wrap.querySelector('#audio-volume');
    audioBtn.addEventListener('click', function () {
      if (!global.Ambient) { audioBtn.textContent = '声音不可用'; return; }
      var st = global.Ambient.state();
      if (st.on) {
        global.Ambient.setMuted(true);
      } else {
        var r = global.Ambient.toggle();
        if (!r.supported) { audioBtn.textContent = '声音不可用'; return; }
        global.Ambient.setVolume(Number(audioSlider.value) / 100 * 0.16);
      }
      syncAudioUi();
    });
    audioSlider.addEventListener('input', function () {
      if (global.Ambient) global.Ambient.setVolume(Number(audioSlider.value) / 100 * 0.16);
      syncAudioUi();
    });
    document.getElementById('sound') && document.getElementById('sound').addEventListener('click', function () {
      setTimeout(syncAudioUi, 0);
    });
    syncAudioUi();
  }

  function syncAudioUi() {
    if (!audioBtn || !global.Ambient) return;
    var st = global.Ambient.state();
    audioBtn.setAttribute('aria-pressed', String(!!st.on));
    audioBtn.textContent = st.on ? '声音开' : '声音关';
    audioBtn.title = '合成环境音，非现场录音；默认关闭';
  }

  function ensureArchiveButton() {
    var tools = document.querySelector('.scene-head .tools');
    if (!tools || document.getElementById('journey-archive-open')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'journey-archive-open';
    b.textContent = '档案';
    b.title = '查看本机探索记录，不包含上传';
    tools.appendChild(b);
    b.onclick = function () { openArchive(false); };
  }

  /* ---------- 接管旧版导览按钮 ---------- */
  function rebindTourButtons() {
    ['tour-pause', 'tour-next', 'tour-exit'].forEach(function (id) {
      var old = document.getElementById(id);
      if (!old) return;
      var fresh = old.cloneNode(true);
      old.parentNode.replaceChild(fresh, old);
      if (id === 'tour-pause') pauseBtn = fresh;
      if (id === 'tour-next') nextBtn = fresh;
      if (id === 'tour-exit') exitBtn = fresh;
    });
    if (pauseBtn) pauseBtn.onclick = function () { if (tour.busy) return; if (tour.playing) pauseTour(); else resumeTour(); };
    if (nextBtn) nextBtn.onclick = function () { nextStep(); };
    if (exitBtn) exitBtn.onclick = function () { stopTour(true); };
  }

  /* ---------- 模式切换：接管旧 modebar，避免旧固定定时器导览 ---------- */
  document.addEventListener('click', function (event) {
    var btn = event.target.closest && event.target.closest('.modebar [data-mode], #tour-cta');
    if (!btn) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var next = btn.id === 'tour-cta' ? 'tour' : btn.getAttribute('data-mode');
    if (next === 'tour') { if (!tour.active) startTour(); return; }
    if (next === 'task') {
      if (tour.active) stopTour(false);
      if (global.__mission) { global.__mission.start(); }
      if (stage() && stage().setMode) stage().setMode('task');
      return;
    }
    if (tour.active) stopTour(false);
    if (global.__mission) global.__mission.exit();
    if (stage() && stage().setMode) stage().setMode('free');
  }, true);

  /* 用户手动镜头输入立即暂停；不抢回 */
  ['pointerdown', 'wheel', 'touchstart'].forEach(function (type) {
    var vp = document.getElementById('viewport');
    if (vp) vp.addEventListener(type, function () { if (tour.active && tour.playing) pauseTour(); }, { passive: true });
  });

  document.addEventListener('keydown', function (event) {
    if (!tour.active) return;
    if (event.key === 'Escape') { stopTour(true); return; }
    if (event.key === 'ArrowRight' && !event.target.closest('input,textarea,select')) { event.preventDefault(); nextStep(); }
    if (event.key === ' ' && !event.target.closest('button,input,textarea,select')) { event.preventDefault(); if (tour.playing) pauseTour(); else resumeTour(); }
  });

  rebindTourButtons();
  ensureAudioUi();
  ensureArchiveButton();
  if (card) card.hidden = true;

  global.__tour = {
    start: startTour,
    stop: function () { stopTour(true); },
    next: function () { nextStep(); },
    pause: pauseTour,
    resume: resumeTour,
    openArchive: function () { openArchive(false); },
    get steps() { return TOUR_STEPS.map(function (s) { return { stepId: s.stepId, stage: s.stage, objectId: s.objectId, title: s.title, completion: s.completion, shotId: s.shotId }; }); },
    get state() { return { active: tour.active, index: tour.index, stepId: TOUR_STEPS[tour.index] ? TOUR_STEPS[tour.index].stepId : null, playing: tour.playing, busy: tour.busy, status: tour.status, total: TOUR_STEPS.length }; }
  };
})(window);
