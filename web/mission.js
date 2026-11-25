/* 阶段 07：任务探索状态机（M-YJ-001）。
 * 说明：这是前端教学状态机，不是工程仿真；任务结果来自用户在当前场景里的真实操作。
 */
(function (global) {
  'use strict';

  var KEY = 'kepu.mission.v1';
  var HINT_MS = 25000;
  var STEP_DEFS = [
    {
      id: 'M1', stage: 0, level: 'l1', title: '把油带到井口',
      short: '地下 · 储层→井筒',
      role: '你是能源探索见习员，接手教学批次 YJ-001。',
      clue: '先点击储层，观察油滴从孔隙汇入井筒并向上抽取：油不是“油湖”，而是在岩石孔隙里。',
      goal: '在 01 地下开采里完成：① 点击储层；② 把压力差滑块拖到 50% 以上，观察流体沿井筒上升。',
      hints: [
        '看左侧按钮和剖面：储层是带油气水图例的透镜体。',
        '先点储层，再拖动左侧压力差滑块到 50% 以上；油滴会汇入井筒并上升。',
        '储层和井筒都在 01 地下开采这一关；动画出现后即表示抽取链路已建立。'
      ],
      knowledge: 'kb_formation',
      knowledgeLabel: '储层与井筒：油在孔隙中，井筒连接地下与地面。'
    },
    {
      id: 'M2', stage: 1, level: 'l2', title: '把混合物分开',
      short: '地面处理 · 三相分离',
      role: '井口产出物不是纯油，而是油、气、水的混合物。',
      clue: '气比油轻，水比油重；每个出口只能去它该去的地方。',
      goal: '剖开分离器，启动分离，为气、油、水三路都选对去向。',
      hints: [
        '先点“剖开”，再启动分离；三个出口都要分配。',
        '气 → 回收/处理，油 → 储运，水 → 水处理；不要把气送进油罐。',
        '错误去向会回流并解释原因，改选即可，不扣进度。'
      ],
      knowledge: 'kb_gather',
      knowledgeLabel: '三相分离：按相态和密度分开，不是过滤。'
    },
    {
      id: 'M3', stage: 2, level: 'l3', title: '选择怎么存、怎么送',
      short: '储运 · 罐型与泵送',
      role: '分离后的油相需要暂时储存，再送去炼化。',
      clue: '外浮顶罐的浮盘贴着液面；固定顶罐的油气空间更大。',
      goal: '在 03 储运里把液位调到 70% 以上，观察固定顶与外浮顶的油气空间差异。',
      hints: [
        '拖液位滑块，观察浮盘与油气空间。',
        '液位超过 70% 即完成本段；两种罐型都可完成。',
        '打开“演示与结构”里的“启动泵送”，可继续观察转输路径（可选）。'
      ],
      knowledge: 'kb_store',
      knowledgeLabel: '储运：浮顶减少油气空间，但不等于零损耗。'
    },
    {
      id: 'M4', stage: 3, level: 'l4', title: '打开蒸馏塔',
      short: '炼化 · 全剖与馏分',
      role: '常压蒸馏按沸点范围把原油切成馏分。',
      clue: '柴油是较重的中下部侧线馏分；全剖才看得到塔板和侧线。',
      goal: '在 04 炼化里切到“全剖”，再选择“柴油馏分”。',
      hints: [
        '先点“全剖”，让塔板/侧线露出来。',
        '在下方的馏分按钮里找“柴油馏分”，不要选塔顶油气。',
        '馏分不是成品油；它还要加氢、调和等后续加工。'
      ],
      knowledge: 'kb_refine',
      knowledgeLabel: '炼化：按沸点切馏分；馏分 ≠ 成品油。'
    },
    {
      id: 'M5', stage: 4, level: 'l5', title: '选择一个终端去向',
      short: '产品 · 从分子到应用',
      role: '这批碳氢分子最终会进入燃料、材料或路面。',
      clue: '点产品台上的物品，看看哪些来自石油路线；塑料也可能来自天然气、煤基或生物基。',
      goal: '在 05 产品去向里至少选择一个石油路线产品。',
      hints: [
        '点产品台上的物品，选中的物品会高亮并写入计数。',
        '汽油、柴油、航空煤油、塑料、沥青都在典型石油路线里。',
        '选一个你感兴趣的即可；任务不要求把六个都选完。'
      ],
      knowledge: 'kb_use',
      knowledgeLabel: '产品去向：燃料、材料、路面来自不同馏分和加工路线。'
    }
  ];

  var state = null;
  var ui = null;
  var brief = null;
  var done = null;
  var hintTimer = 0;
  var autoTimer = 0;
  var busy = false;
  var uiHidden = false;

  function now() { return new Date().toISOString(); }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function $(sel) { return document.querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function blank() {
    return {
      version: 1,
      id: 'M-YJ-001',
      title: '追踪批次 YJ-001',
      status: 'idle',
      step: 0,
      steps: STEP_DEFS.map(function (s) { return { id: s.id, done: false, visited: false }; }),
      flags: {},
      knowledge: [],
      hintsUsed: 0,
      hintLevel: 0,
      errors: [],
      lastHint: '',
      startedAt: null,
      finishedAt: null
    };
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.version === 1 && raw.id === 'M-YJ-001') {
        if (!Array.isArray(raw.steps) || raw.steps.length !== STEP_DEFS.length) raw.steps = blank().steps;
        if (!raw.flags || typeof raw.flags !== 'object') raw.flags = {};
        if (!Array.isArray(raw.knowledge)) raw.knowledge = [];
        if (!Array.isArray(raw.errors)) raw.errors = [];
        if (typeof raw.lastHint !== 'string') raw.lastHint = '';
        return raw;
      }
    } catch (err) {}
    return blank();
  }

  function save() {
    if (!state) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) {}
    if (global.JourneyStore) global.JourneyStore.recordMission(state);
    render();
  }

  function current() { return STEP_DEFS[state ? state.step : 0]; }
  function currentState() { return state && state.steps[state.step]; }

  function stepDone(i) { return !!(state && state.steps[i] && state.steps[i].done); }
  function allDone() { return state && state.steps.every(function (s) { return s.done; }); }

  function addKnowledge(id) {
    if (!id || state.knowledge.indexOf(id) >= 0) return;
    state.knowledge.push(id);
  }

  function makeUi() {
    if (ui) return;
    ui = document.createElement('section');
    ui.id = 'mission-card';
    ui.className = 'mission-card';
    ui.hidden = true;
    ui.setAttribute('aria-label', '任务探索面板');
    ui.innerHTML = [
      '<div class="mission-head"><span class="mission-kicker">M-YJ-001 · 任务探索</span><button type="button" class="mission-close" id="mission-close" aria-label="退出任务">退出</button></div>',
      '<div class="mission-title-row"><h2 id="mission-title">追踪批次 YJ-001</h2><span class="mission-badge" id="mission-badge">进行中</span></div>',
      '<ol class="mission-steps" id="mission-steps"></ol>',
      '<div class="mission-now"><span class="mission-label">本段目标</span><p id="mission-goal"></p><div class="mission-clue" id="mission-clue"></div></div>',
      '<div class="mission-feedback" id="mission-feedback" hidden></div>',
      '<div class="mission-actions">',
      '<button type="button" class="mission-btn mission-btn--primary" id="mission-enter">进入本环节</button>',
      '<button type="button" class="mission-btn" id="mission-hint">提示</button>',
      '<button type="button" class="mission-btn" id="mission-pause">暂停</button>',
      '<button type="button" class="mission-btn mission-btn--ghost" id="mission-reset">重置</button>',
      '</div>'
    ].join('');
    var side = document.querySelector('.side');
    if (side) side.insertBefore(ui, side.firstChild); else document.body.appendChild(ui);

    brief = document.createElement('div');
    brief.id = 'mission-brief';
    brief.className = 'mission-modal';
    brief.hidden = true;
    brief.innerHTML = [
      '<div class="mission-modal__box" role="dialog" aria-modal="true" aria-labelledby="mission-brief-title">',
      '<span class="mission-kicker">能源探索档案 · 任务</span>',
      '<h2 id="mission-brief-title">追踪批次 YJ-001</h2>',
      '<p class="mission-role">你是能源探索见习员。批次 YJ-001 是一枚<b>教学追踪标记</b>，不是一滴真实原油；它沿产业链外侧前进。</p>',
      '<p class="mission-role">目标：从储层出发，经过井口、分离、储运、炼化，最后选择一个产品应用。每一段都要你亲手操作，不能只点“开始任务”。</p>',
      '<ol class="mission-brief__steps">' + STEP_DEFS.map(function (s, i) { return '<li><b>0' + (i + 1) + '</b><span>' + esc(s.short) + '</span></li>'; }).join('') + '</ol>',
      '<div class="mission-modal__actions"><button type="button" class="mission-btn mission-btn--primary" id="mission-begin">接受任务，进入第一段</button><button type="button" class="mission-btn mission-btn--ghost" id="mission-brief-close">稍后再说</button></div>',
      '</div>'
    ].join('');
    document.body.appendChild(brief);

    done = document.createElement('div');
    done.id = 'mission-done';
    done.className = 'mission-modal';
    done.hidden = true;
    done.innerHTML = [
      '<div class="mission-modal__box mission-modal__box--wide" role="dialog" aria-modal="true" aria-labelledby="mission-done-title">',
      '<span class="mission-kicker">任务完成 · 探索档案</span>',
      '<h2 id="mission-done-title">批次 YJ-001 已到达终端应用</h2>',
      '<p class="mission-role" id="mission-done-summary"></p>',
      '<div class="mission-done__grid" id="mission-done-grid"></div>',
      '<p class="mission-boundary">这是教学状态机的结果，不是工程仿真；馏分、路线和“批次”都是示意。</p>',
      '<div class="mission-modal__actions"><button type="button" class="mission-btn mission-btn--primary" id="mission-again">再走一次</button><button type="button" class="mission-btn" id="mission-free">自由探索</button><button type="button" class="mission-btn mission-btn--ghost" id="mission-archive">查看探索档案</button></div>',
      '</div>'
    ].join('');
    document.body.appendChild(done);

    ui.querySelector('#mission-close').onclick = function () { exit(); };
    ui.querySelector('#mission-enter').onclick = function () { enterStep(); };
    ui.querySelector('#mission-hint').onclick = function () { hint(); };
    ui.querySelector('#mission-pause').onclick = function () { togglePause(); };
    ui.querySelector('#mission-reset').onclick = function () {
      if (global.confirm('重置本任务？已完成的五关进度不会删除，但任务进度、提示和错误记录会清空。')) reset();
    };
    brief.querySelector('#mission-begin').onclick = function () {
      brief.hidden = true;
      if (!state.startedAt) state.startedAt = now();
      state.status = 'active';
      save();
      enterStep();
    };
    brief.querySelector('#mission-brief-close').onclick = function () { brief.hidden = true; exit(); };
    done.querySelector('#mission-again').onclick = function () { reset(); start(); };
    done.querySelector('#mission-free').onclick = function () { done.hidden = true; exit(); };
    done.querySelector('#mission-archive').onclick = function () {
      done.hidden = true;
      document.dispatchEvent(new CustomEvent('journey-open-archive'));
    };
  }

  function render() {
    if (!ui || !state) return;
    var step = current();
    var st = currentState();
    ui.hidden = uiHidden || state.status === 'idle' || state.status === 'complete' || brief && !brief.hidden;
    var badge = ui.querySelector('#mission-badge');
    badge.textContent = state.status === 'paused' ? '已暂停' : state.status === 'active' ? '进行中' : state.status === 'complete' ? '已完成' : '未开始';
    badge.dataset.status = state.status;
    ui.querySelector('#mission-title').textContent = step ? step.title : state.title;
    var list = ui.querySelector('#mission-steps');
    list.innerHTML = state.steps.map(function (s, i) {
      var d = STEP_DEFS[i];
      var cls = s.done ? 'is-done' : i === state.step ? 'is-current' : '';
      return '<li class="' + cls + '"><span>' + (s.done ? '✓' : '0' + (i + 1)) + '</span><b>' + esc(d.short) + '</b></li>';
    }).join('');
    if (step) {
      ui.querySelector('#mission-goal').textContent = step.goal;
      ui.querySelector('#mission-clue').textContent = '线索：' + step.clue;
      global.__narrationText = step.title + '。' + step.goal + '。线索：' + step.clue;
      if (global.Voice && !document.body.classList.contains('journey-tour')) global.Voice.setNarration({ id: 'mission-' + state.step, title: step.title, body: step.goal + '。线索：' + step.clue, source: 'mission', sceneId: 'oil_industry_journey' });
    }
    var fb = ui.querySelector('#mission-feedback');
    if (state.status === 'paused') {
      fb.hidden = false;
      fb.className = 'mission-feedback is-note';
      fb.textContent = '任务已暂停。点“继续”回来；五关设备状态和已完成的段落都保留。';
    } else if (st && st.done) {
      fb.hidden = false;
      fb.className = 'mission-feedback is-ok';
      fb.textContent = '本段完成：' + (step ? step.knowledgeLabel : '') + ' 点“进入本环节”继续下一段。';
    } else if (state.lastHint) {
      fb.hidden = false;
      fb.className = 'mission-feedback is-note';
      fb.textContent = state.lastHint;
    } else if (state.errors.length) {
      fb.hidden = false;
      fb.className = 'mission-feedback is-error';
      fb.textContent = state.errors[state.errors.length - 1].message;
    } else {
      fb.hidden = true;
    }
    var enter = ui.querySelector('#mission-enter');
    enter.textContent = state.status === 'paused' ? '继续任务' : st && st.done ? '进入下一段' : step && st && st.visited ? '回到本环节' : '进入本环节';
    enter.disabled = state.status === 'complete' || busy;
    ui.querySelector('#mission-pause').textContent = state.status === 'paused' ? '继续' : '暂停';
    ui.querySelector('#mission-pause').disabled = busy;
    ui.querySelector('#mission-hint').disabled = state.status === 'complete' || busy;
    ui.querySelector('#mission-reset').disabled = busy;
  }

  async function leaveLevel() {
    if (!global.__stage || !global.__stage.isLevel()) return;
    var ctx = global.__sceneContext || {};
    var m = ctx.levelId && /^l(\d)$/.exec(ctx.levelId);
    var api = m ? global['__l' + m[1]] : null;
    try { if (api && typeof api.exit === 'function') api.exit(); } catch (err) {}
    await wait(2000);
    if (global.__stage.isLevel()) global.__stage.back();
  }

  async function enterStage(index) {
    if (!global.__stage || !global.__stage.selectStage) return;
    if (global.__stage.isLevel()) await leaveLevel();
    global.__stage.selectStage(index, true);
    await wait(500);
    var hook = global.__stage.levelHook(index);
    if (hook) hook();
    await wait(1400);
  }

  async function enterStep() {
    if (busy || !state) return;
    if (state.status === 'complete') return;
    uiHidden = false;
    if (state.status === 'paused') {
      state.status = 'active';
      save();
    }
    if (state.status !== 'active') state.status = 'active';
    var step = current();
    if (!step) return;
    if (step.id === 'M5' && global.__l5) state.flags.pickedCount = (global.__l5.picked || []).length;
    busy = true;
    if (global.Voice) global.Voice.stop();
    render();
    var st = currentState();
    st.visited = true;
    if (!state.startedAt) state.startedAt = now();
    save();
    await enterStage(step.stage);
    busy = false;
    save();
    armAutoHint();
  }

  function addError(message) {
    state.lastHint = '';
    state.errors.push({ at: now(), message: message });
    while (state.errors.length > 8) state.errors.shift();
    state.hintLevel = Math.max(state.hintLevel, 1);
    if (global.Ambient) global.Ambient.blip();
    save();
  }

  function completeStep() {
    var step = current();
    var st = currentState();
    if (!step || !st || st.done) return;
    st.done = true;
    state.lastHint = '';
    /* 过渡后不把上一段的红色错误留在下一段；保留到 errorHistory 供复盘。 */
    if (state.errors && state.errors.length) {
      state.errorHistory = (state.errorHistory || []).concat(state.errors);
      state.errors = [];
    }
    addKnowledge(step.knowledge);
    if (global.JourneyStore) global.JourneyStore.recordMission(state);
    if (state.step < STEP_DEFS.length - 1) {
      state.step += 1;
      state.hintLevel = 0;
      clearTimeout(autoTimer);
    } else {
      state.status = 'complete';
      state.finishedAt = now();
      clearTimeout(autoTimer);
      showDone();
    }
    save();
  }

  function checkStep(action, value, result) {
    if (!state || state.status !== 'active') return;
    var step = current();
    var st = currentState();
    if (!step || !st || st.done) return;
    if (step.id === 'M1') {
      if (action === 'inspect_reservoir') state.flags.reservoir = true;
      if (action === 'trace_up_wellbore') state.flags.up = true;
      if (state.flags.reservoir && state.flags.up) completeStep();
    } else if (step.id === 'M2') {
      if (action === 'start_separation') state.flags.started = true;
      if (action === 'assign_outlet_target' && result === 'error') {
        addError('去向不对：气不能进常压油罐，油不能进水处理。看出口标签，改选即可。');
      }
      var solved = global.__l2 && global.__l2.solved;
      if (solved && solved.gas && solved.oil && solved.water && state.flags.started) completeStep();
    } else if (step.id === 'M3') {
      if (action === 'change_liquid_level') state.flags.level = Number(value) || 0;
      if (action === 'start_pump') state.flags.pump = true;
      /* 任务条件是液位达到 70%；泵送演示保留为可选延伸，不阻塞任务。 */
      if ((state.flags.level || 0) >= 70) completeStep();
    } else if (step.id === 'M4') {
      if (action === 'inspect_tower_structure' && value === 'full') state.flags.full = true;
      if (action === 'select_fraction') state.flags.fraction = value;
      if (state.flags.full && state.flags.fraction === 'diesel') completeStep();
    } else if (step.id === 'M5') {
      if (action === 'select_product') {
        var picked = (global.__l5 && global.__l5.picked) || [];
        var before = Number(state.flags.pickedCount) || 0;
        state.flags.pickedCount = picked.length;
        /* 必须是新增选择，取消选中/无变化不能完成任务。 */
        if (picked.length > before) {
          state.flags.product = value;
          state.flags.products = picked.length;
          completeStep();
        } else {
          state.lastHint = 'M5 需要新增一个产品选择；取消选中不算完成任务。';
          save();
        }
      }
    }
    save();
  }

  function armAutoHint() {
    clearTimeout(autoTimer);
    if (!state || state.status !== 'active') return;
    autoTimer = setTimeout(function () {
      if (!state || state.status !== 'active') return;
      if (!stepDone(state.step)) hint(true);
    }, HINT_MS);
  }

  function hint(silent) {
    if (!state) return;
    state.hintLevel = Math.min(3, (state.hintLevel || 0) + 1);
    state.hintsUsed = (state.hintsUsed || 0) + 1;
    var step = current();
    var text = step ? step.hints[Math.min(step.hints.length - 1, state.hintLevel - 1)] : '';
    state.lastHint = '提示 ' + state.hintLevel + '：' + text;
    if (!silent && global.Ambient) global.Ambient.blip();
    save();
  }

  function togglePause() {
    if (!state || busy) return;
    if (state.status === 'active') {
      state.status = 'paused';
      clearTimeout(autoTimer);
    } else if (state.status === 'paused') {
      state.status = 'active';
      armAutoHint();
      if (currentState() && currentState().visited) {
        // 关卡还在时直接继续；已退出则重新进入本段。
        var step = current();
        if (!global.__stage || !global.__stage.isLevel()) enterStep();
      }
    }
    save();
  }

  async function exit() {
    if (!state) return;
    clearTimeout(autoTimer);
    if (state.status === 'active') state.status = 'paused';
    if (global.__stage && global.__stage.isLevel()) await leaveLevel();
    if (global.__stage && global.__stage.setMode) global.__stage.setMode('free');
    uiHidden = true;
    if (ui) ui.hidden = true;
    if (brief) brief.hidden = true;
    if (done) done.hidden = true;
    save();
    document.dispatchEvent(new CustomEvent('mission-exit'));
  }

  async function reset() {
    clearTimeout(autoTimer);
    if (global.__stage && global.__stage.isLevel()) await leaveLevel();
    state = blank();
    try { localStorage.removeItem(KEY); } catch (err) {}
    save();
    if (global.__stage && global.__stage.setMode) global.__stage.setMode('free');
    uiHidden = true;
    if (ui) ui.hidden = true;
    if (brief) brief.hidden = true;
    if (done) done.hidden = true;
    document.dispatchEvent(new CustomEvent('mission-reset'));
  }

  function start() {
    makeUi();
    if (!state) state = load();
    if (state.status === 'complete') {
      showDone();
      return;
    }
    uiHidden = false;
    if (global.__stage && global.__stage.setMode) global.__stage.setMode('task');
    if (state.status === 'idle' && !state.startedAt) {
      brief.hidden = false;
      ui.hidden = true;
    } else {
      state.status = state.status === 'active' ? 'paused' : (state.status === 'paused' ? 'paused' : 'active');
      ui.hidden = false;
      render();
      // 让用户点“继续任务/进入本环节”，不自动跳关。
    }
    save();
  }

  function showDone() {
    makeUi();
    done.hidden = false;
    var totalHints = state.hintsUsed || 0;
    done.querySelector('#mission-done-summary').textContent = '你完成了五段交接：地下 → 井口 → 三相分离 → 储运 → 炼化 → 产品应用。任务结果由真实操作和场景状态判定，不是答题积分。';
    var grid = done.querySelector('#mission-done-grid');
    grid.innerHTML = STEP_DEFS.map(function (s, i) {
      return '<div class="mission-done__item"><span>0' + (i + 1) + '</span><b>' + esc(s.title) + '</b><small>' + esc(s.knowledgeLabel) + '</small></div>';
    }).join('') + '<div class="mission-done__item"><span>提示</span><b>用过 ' + totalHints + ' 次</b><small>提示不扣分；复盘时保留记录。</small></div>';
    if (global.JourneyStore) global.JourneyStore.recordMission(state);
  }

  /* 储运关的液位/泵送由关卡的实际状态决定，而不是只信赖某一次事件的值。
     这样拖液位、启动泵送、切换设备都会用同一份真实状态判定，避免“拖到 100%
     不完成、点一下设备才完成”的事件顺序问题。 */
  function syncStorageState() {
    var step = current();
    if (!state || !step || step.id !== 'M3' || !global.__l3) return;
    state.flags.level = Math.round((Number(global.__l3.level) || 0) * 100);
    state.flags.pump = !!global.__l3.pumpRunning;
  }

  function observe(event) {
    if (!state) return;
    var ctx = event.detail;
    if (!ctx || !ctx.interaction) return;
    syncStorageState();
    var it = ctx.interaction;
    checkStep(it.actionId || it.action, it.value, it.result);
  }

  document.addEventListener('scene-context', observe);
  document.addEventListener('journey-open-archive', function () { if (ui) ui.hidden = true; });

  /* 储运滑块在部分事件链下只触发关卡内部状态，没有稳定的 scene-context
     顺序；用轻量轮询兜底，确保液位和泵送都达标时立即完成 M3。 */
  var storageWatch = setInterval(function () {
    if (!state || state.status !== 'active') return;
    var step = current();
    if (!step || step.id !== 'M3') return;
    syncStorageState();
    if ((state.flags.level || 0) >= 70) completeStep();
  }, 250);
  global.addEventListener('pagehide', function () { clearInterval(storageWatch); });

  global.__mission = {
    id: 'M-YJ-001',
    start: start,
    pause: function () { if (state && state.status === 'active') togglePause(); },
    resume: function () { if (state && state.status === 'paused') togglePause(); },
    exit: exit,
    reset: reset,
    hint: function () { hint(false); },
    enter: function () { enterStep(); },
    get state() { return state ? JSON.parse(JSON.stringify(state)) : null; },
    get definitions() { return STEP_DEFS.map(function (s) { return { id: s.id, stage: s.stage, goal: s.goal, hints: s.hints, knowledge: s.knowledge }; }); },
    get summary() {
      return state ? {
        id: state.id, status: state.status, step: state.step,
        done: state.steps.filter(function (s) { return s.done; }).length,
        total: state.steps.length, knowledge: state.knowledge.slice(), hintsUsed: state.hintsUsed
      } : null;
    }
  };
})(window);
