/* Phase 08 · scene context store
 * 单一短期上下文来源，供三维沙盘、AI 问答、写作 handoff 使用。
 * 只保存在当前页面内存 + 显式 sessionStorage handoff；不写 localStorage，不上传。
 */
(function (global) {
  'use strict';

  var SCENE_ID = 'oil_industry_journey';
  var VERSION = 1;
  var HANDOFF_KEY = 'kepu.scene.handoff.v1';
  var MAX_HISTORY = 12;
  var MAX_LEDGER = 60;
  var HANDOFF_TTL = 10 * 60 * 1000;

  var LEVEL_DEVICE = { l1: 'underground_geology', l2: 'three_phase_separator', l3: 'floating_roof_tank', l4: 'atmospheric_tower', l5: 'fuel_dispenser' };

  var LEVELS = {
    l1: { stageId: 'drill', stageIndex: 0, zoneId: 'subsurface', label: '地下开采' },
    l2: { stageId: 'gather', stageIndex: 1, zoneId: 'gathering', label: '地面处理' },
    l3: { stageId: 'store', stageIndex: 2, zoneId: 'storage', label: '储运' },
    l4: { stageId: 'refine', stageIndex: 3, zoneId: 'refining', label: '炼化' },
    l5: { stageId: 'use', stageIndex: 4, zoneId: 'city', label: '产品去向' }
  };

  /* 人工审核过的本地知识要点。只作为“已核验底稿”，不冒充模型输出。 */
  var KNOWLEDGE_FACTS = {
    kb_formation: [
      '原油是多种碳氢化合物的混合物，不是单一物质。',
      '石油通常存在于储层岩石的孔隙中，不是地下“油湖”。',
      '圈闭需要储层、盖层和遮挡同时成立，油气才能聚集。'
    ],
    kb_drill: [
      '井筒连接地下储层与地面；套管用于支撑井壁并隔离不同地层。',
      '岩心是地下岩石的实物样品；测井是间接推断。'
    ],
    kb_gather: [
      '井口产出物通常包含油、气、水，需要先进行分离处理。',
      '三相分离器按相态和密度差异分离，不是过滤。'
    ],
    kb_store: [
      '外浮顶罐的浮盘随液位升降，可减少油气空间。',
      '浮顶能降低蒸发损耗，但不是零损耗，密封和维护仍会影响实际损耗。'
    ],
    kb_refine: [
      '常压蒸馏按沸点范围把原油分成不同馏分。',
      '馏分不是成品油，后续还需要裂化、重整、加氢或调和。',
      '减压蒸馏降低压力，使重油在较低温度下继续分馏，减少高温裂解。'
    ],
    kb_use: [
      '石油可用于生产燃料、润滑油、沥青和部分合成材料。',
      '塑料不一定都来自石油，也可能来自天然气、煤基或生物基原料。'
    ]
  };

  function nowIso() { return new Date().toISOString(); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function makeId() {
    try {
      if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (e) {}
    var b = new Uint8Array(16);
    try {
      if (typeof crypto !== 'undefined' && crypto && crypto.getRandomValues) crypto.getRandomValues(b);
      else for (var i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
    } catch (e2) {
      for (var j = 0; j < 16; j += 1) b[j] = Math.floor(Math.random() * 256);
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20);
  }
  function unique(list) {
    var out = [];
    (list || []).forEach(function (x) { if (x != null && x !== '' && out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  function registry() { return global.PETRO_REGISTRY || null; }
  function deviceOf(objectId) {
    var reg = registry();
    return reg && objectId ? reg.getDevice(objectId) : null;
  }
  function stageOf(levelId) { return LEVELS[levelId] || null; }
  function stageLabel(stageId) {
    if (!stageId || stageId === 'overview') return '全景';
    for (var k in LEVELS) {
      if (Object.prototype.hasOwnProperty.call(LEVELS, k) && LEVELS[k].stageId === stageId) return LEVELS[k].label;
    }
    return stageId || '全景';
  }
  function levelForStage(stageId) {
    for (var k in LEVELS) {
      if (Object.prototype.hasOwnProperty.call(LEVELS, k) && LEVELS[k].stageId === stageId) return k;
    }
    return null;
  }
  function knownKnowledge(ids) { return unique(ids).filter(function (id) { return !!KNOWLEDGE_FACTS[id]; }); }
  function verifiedFacts(ids) {
    var out = [];
    knownKnowledge(ids).forEach(function (id) {
      (KNOWLEDGE_FACTS[id] || []).forEach(function (f) { if (out.indexOf(f) < 0) out.push(f); });
    });
    return out;
  }

  function blank() {
    return {
      version: VERSION,
      sceneId: SCENE_ID,
      registrySceneId: registry() ? registry().sceneId : null,
      sessionId: makeId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      revision: 0,
      stageId: 'overview',
      stageIndex: null,
      levelId: null,
      zoneId: null,
      selectedObjectId: null,
      object: null,
      deviceName: null,
      knowledgeIds: [],
      experienceMode: 'free',
      interaction: null,
      history: [],
      ledger: [],
      source: 'init'
    };
  }

  var state = blank();
  var listeners = [];

  function sanitize(next) {
    var ctx = Object.assign(blank(), state, next || {});
    ctx.version = VERSION;
    ctx.sceneId = SCENE_ID;
    ctx.registrySceneId = registry() ? registry().sceneId : (ctx.registrySceneId || null);
    ctx.updatedAt = nowIso();
    ctx.revision = (Number(state.revision) || 0) + 1;
    ctx.history = (Array.isArray(ctx.history) ? ctx.history : []).slice(-MAX_HISTORY);
    ctx.ledger = (Array.isArray(ctx.ledger) ? ctx.ledger : []).slice(-MAX_LEDGER);
    ctx.knowledgeIds = unique(ctx.knowledgeIds).slice(0, 16);
    ctx.selectedObjectId = ctx.selectedObjectId || null;
    ctx.object = ctx.selectedObjectId;
    ctx.levelId = ctx.levelId || null;
    ctx.stageIndex = ctx.stageIndex == null ? null : Number(ctx.stageIndex);
    ctx.interaction = ctx.interaction && typeof ctx.interaction === 'object' ? {
      action: ctx.interaction.action || null,
      actionId: ctx.interaction.actionId || ctx.interaction.action || null,
      value: ctx.interaction.value == null ? null : ctx.interaction.value,
      unit: ctx.interaction.unit || '示意',
      result: Object.prototype.hasOwnProperty.call(ctx.interaction, 'result') ? ctx.interaction.result : null,
      at: ctx.interaction.at || nowIso()
    } : null;
    return ctx;
  }

  function emit(source) {
    state = sanitize(state);
    state.source = source || state.source;
    global.__sceneContext = clone(state);
    try { document.dispatchEvent(new CustomEvent('scene-context', { detail: clone(state) })); } catch (e) {}
    listeners.slice().forEach(function (fn) { try { fn(clone(state)); } catch (e) {} });
    return clone(state);
  }

  function get() { return clone(state); }
  function snapshot() { return clone(state); }
  function revision() { return state.revision; }

  function update(patch, source) {
    if (!patch || typeof patch !== 'object') return get();
    var next = Object.assign({}, state, patch);
    state = next;
    return emit(source || 'update');
  }

  function setStage(stageId, opts) {
    opts = opts || {};
    var levelId = opts.levelId === undefined ? (state.levelId || null) : opts.levelId;
    var info = stageOf(levelId);
    if (info && info.stageId === stageId) opts.zoneId = opts.zoneId || info.zoneId;
    return update({
      stageId: stageId || 'overview',
      stageIndex: opts.stageIndex == null ? (info ? info.stageIndex : state.stageIndex) : opts.stageIndex,
      levelId: levelId,
      zoneId: opts.zoneId || state.zoneId,
      experienceMode: opts.experienceMode || state.experienceMode
    }, source || 'stage');
  }

  function setLevel(levelId, opts) {
    opts = opts || {};
    var info = stageOf(levelId);
    if (!info) return { ok: false, reason: 'LEVEL_NOT_FOUND' };
    if (!state.sceneId) return { ok: false, reason: 'SCENE_NOT_READY' };
    var selected = opts.keepSelection ? state.selectedObjectId : (LEVEL_DEVICE[levelId] || null);
    var device = selected ? deviceOf(selected) : null;
    if (device && device.stageId !== info.stageId) selected = null;
    var r = update({
      stageId: info.stageId,
      stageIndex: info.stageIndex,
      levelId: levelId,
      zoneId: opts.zoneId || info.zoneId,
      selectedObjectId: selected,
      object: selected,
      deviceName: selected && device ? device.displayName : null,
      knowledgeIds: selected && device ? device.knowledgeIds : ['kb_' + info.stageId],
      experienceMode: opts.experienceMode || state.experienceMode,
      interaction: null
    }, 'level');
    return { ok: true, context: r };
  }

  function selectDevice(objectId) {
    if (!objectId) return clearSelection();
    var device = deviceOf(objectId);
    if (!device && registry()) return { ok: false, reason: 'OBJECT_NOT_FOUND' };
    var info = LEVELS['l' + ((device ? device.levelIndex : 0) + 1)] || null;
    var levelId = state.levelId;
    if (levelId && stageOf(levelId) && device && stageOf(levelId).stageId !== device.stageId) levelId = null;
    var r = update({
      stageId: device ? device.stageId : state.stageId,
      stageIndex: device ? device.stageIndex : state.stageIndex,
      levelId: levelId,
      zoneId: device ? device.zoneId : state.zoneId,
      selectedObjectId: objectId,
      object: objectId,
      deviceName: device ? device.displayName : null,
      knowledgeIds: device ? device.knowledgeIds : state.knowledgeIds,
      interaction: state.interaction
    }, 'select');
    return { ok: true, context: r, device: device, level: info };
  }

  function clearSelection() {
    return update({
      selectedObjectId: null, object: null, deviceName: null, interaction: null
    }, 'clear-selection');
  }

  function setMode(mode) {
    return update({ experienceMode: mode || 'free', mode: mode || 'free' }, 'mode');
  }

  function enterChapter(chapterId, knowledgeIds) {
    return update({
      stageId: chapterId || state.stageId,
      knowledgeIds: knowledgeIds && knowledgeIds.length ? knowledgeIds : state.knowledgeIds,
      chapterId: chapterId || null
    }, 'chapter');
  }

  function recordInteraction(action, value, unit, result) {
    if (!action) return get();
    var at = nowIso();
    var record = {
      action: String(action),
      actionId: String(action),
      value: value == null ? null : value,
      unit: unit || '示意',
      result: result == null ? null : result,
      at: at
    };
    var history = state.history.slice(-MAX_HISTORY + 1).concat([{
      action: record.action, actionId: record.actionId, value: record.value,
      unit: record.unit, result: record.result,
      stageId: state.stageId, levelId: state.levelId, zoneId: state.zoneId, at: at
    }]);
    var ledger = state.ledger.slice(-MAX_LEDGER + 1).concat([{
      type: record.result === 'correct' ? '操作' : '操作',
      action: record.action, value: record.value, unit: record.unit,
      result: record.result, stageId: state.stageId, levelId: state.levelId,
      objectId: state.selectedObjectId, at: at
    }]);
    return update({ interaction: record, history: history, ledger: ledger }, 'interaction');
  }

  function exitLevel() {
    var info = stageOf(state.levelId);
    return update({
      levelId: null,
      selectedObjectId: null,
      object: null,
      deviceName: null,
      interaction: null,
      knowledgeIds: info ? ['kb_' + info.stageId] : state.knowledgeIds
    }, 'exit-level');
  }

  function clear() {
    state = blank();
    return emit('clear');
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function handoff() {
    var data = buildForWriting();
    data.createdAt = nowIso();
    data.sessionId = state.sessionId;
    try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(data)); } catch (e) {}
    return data;
  }

  function readHandoff(opts) {
    opts = opts || {};
    try {
      var raw = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) || 'null');
      if (!raw || !raw.createdAt || Date.now() - Date.parse(raw.createdAt) > HANDOFF_TTL) return null;
      if (raw.sceneId !== SCENE_ID) return null;
      if (opts.consume) sessionStorage.removeItem(HANDOFF_KEY);
      return raw;
    } catch (e) { return null; }
  }

  function clearHandoff() {
    try { sessionStorage.removeItem(HANDOFF_KEY); } catch (e) {}
  }

  function buildForAI() {
    var lines = [];
    var ctx = state;
    lines.push('场景：' + (ctx.sceneId === SCENE_ID ? '石油产业链数字沙盘' : ctx.sceneId));
    lines.push('环节：' + stageLabel(ctx.stageId));
    if (ctx.levelId) lines.push('关卡：' + ctx.levelId);
    if (ctx.selectedObjectId) {
      lines.push('当前设备：' + (ctx.deviceName || ctx.selectedObjectId) + '（objectId=' + ctx.selectedObjectId + '）');
    } else {
      lines.push('当前设备：未选中');
    }
    if (ctx.zoneId) lines.push('区域：' + ctx.zoneId);
    if (ctx.knowledgeIds && ctx.knowledgeIds.length) {
      lines.push('关联知识点：' + ctx.knowledgeIds.join('、') + '（本地人工审核）');
      var facts = verifiedFacts(ctx.knowledgeIds);
      if (facts.length) lines.push('已核验要点：' + facts.slice(0, 4).join('；'));
    }
    if (ctx.interaction) {
      lines.push('刚才的操作：' + ctx.interaction.action + '=' + (ctx.interaction.value == null ? '' : ctx.interaction.value) +
        '（' + (ctx.interaction.unit || '示意') + '，结果：' + (ctx.interaction.result || '未记录') + '）');
    }
    if (ctx.history && ctx.history.length) {
      var sameLevel = ctx.history.filter(function (h) { return h.levelId === ctx.levelId; });
      var recent = (sameLevel.length ? sameLevel : ctx.history).slice(-4).map(function (h) {
        return h.action + '=' + (h.value == null ? '' : h.value) + (h.result ? '(' + h.result + ')' : '');
      });
      lines.push('最近操作：' + recent.join('；'));
    }
    lines.push('体验模式：' + (ctx.experienceMode || 'free') + '；设备数值均为教学示意，不是真实生产数据。');
    return lines;
  }

  function buildForWriting() {
    var device = state.selectedObjectId ? deviceOf(state.selectedObjectId) : null;
    var facts = verifiedFacts(state.knowledgeIds);
    var topic = device ? (device.displayName + '：它在这一环节做什么') : (stageLabel(state.stageId) + '的科普写作');
    var lines = buildForAI().filter(function (line) { return line.indexOf('已核验要点') !== 0; });
    return {
      version: VERSION,
      sceneId: SCENE_ID,
      sessionId: state.sessionId,
      stageId: state.stageId,
      levelId: state.levelId,
      zoneId: state.zoneId,
      objectId: state.selectedObjectId,
      objectName: device ? device.displayName : null,
      knowledgeIds: state.knowledgeIds.slice(),
      experienceMode: state.experienceMode,
      interaction: state.interaction ? clone(state.interaction) : null,
      facts: facts,
      contextLines: lines,
      topic: topic,
      createdAt: nowIso()
    };
  }

  function init() {
    state = sanitize(state);
    global.__sceneContext = clone(state);
    try { document.dispatchEvent(new CustomEvent('scene-context', { detail: clone(state) })); } catch (e) {}
  }

  global.SceneContext = {
    VERSION: VERSION,
    SCENE_ID: SCENE_ID,
    LEVELS: clone(LEVELS),
    KNOWLEDGE_FACTS: clone(KNOWLEDGE_FACTS),
    init: init,
    get: get,
    snapshot: snapshot,
    revision: revision,
    update: update,
    setStage: setStage,
    setLevel: setLevel,
    selectDevice: selectDevice,
    clearSelection: clearSelection,
    setMode: setMode,
    enterChapter: enterChapter,
    recordInteraction: recordInteraction,
    exitLevel: exitLevel,
    clear: clear,
    subscribe: subscribe,
    handoff: handoff,
    readHandoff: readHandoff,
    clearHandoff: clearHandoff,
    buildForAI: buildForAI,
    buildForWriting: buildForWriting,
    verifiedFacts: verifiedFacts,
    stageLabel: stageLabel,
    levelForStage: levelForStage
  };
  init();
})(window);
