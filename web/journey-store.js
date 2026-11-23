/* 用户旅程记录：只写本机 localStorage，不上传。
 * sceneId / stageId / zoneId / objectId / knowledgeId / 完成的任务。
 */
(function (global) {
  'use strict';
  var KEY = 'kepu.journey.v1';
  var MAX = 80;

  function blank() {
    return {
      version: 1,
      sceneId: 'oil_industry_journey',
      startedAt: new Date().toISOString(),
      updatedAt: null,
      zones: [],
      stages: [],
      objects: [],
      knowledge: [],
      missions: {},
      tours: []
    };
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.version === 1) {
        ['zones', 'stages', 'objects', 'knowledge', 'tours'].forEach(function (k) {
          if (!Array.isArray(raw[k])) raw[k] = [];
        });
        if (!raw.missions || typeof raw.missions !== 'object') raw.missions = {};
        return raw;
      }
    } catch (err) {}
    return blank();
  }

  function save(data) {
    data.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) {}
    document.dispatchEvent(new CustomEvent('journey-change', { detail: data }));
    return data;
  }

  function pushUnique(list, value, max) {
    if (value == null || value === '') return;
    if (list.indexOf(value) >= 0) return;
    list.push(value);
    while (list.length > (max || MAX)) list.shift();
  }

  function recordContext(ctx) {
    if (!ctx) return load();
    var data = load();
    pushUnique(data.zones, ctx.zoneId, 24);
    pushUnique(data.stages, ctx.stageId, 16);
    pushUnique(data.objects, ctx.selectedObjectId, 48);
    (ctx.knowledgeIds || []).forEach(function (k) { pushUnique(data.knowledge, k, 32); });
    return save(data);
  }

  function recordMission(mission) {
    if (!mission || !mission.id) return load();
    var data = load();
    data.missions[mission.id] = {
      id: mission.id,
      title: mission.title,
      status: mission.status,
      step: mission.step,
      steps: (mission.steps || []).map(function (s) { return { id: s.id, title: s.title, done: !!s.done }; }),
      knowledge: (mission.knowledge || []).slice(),
      hintsUsed: mission.hintsUsed || 0,
      errors: (mission.errors || []).slice(-6),
      finishedAt: mission.status === 'complete' ? new Date().toISOString() : null
    };
    return save(data);
  }

  function recordTour(summary) {
    if (!summary) return load();
    var data = load();
    data.tours.push({
      id: summary.id || 'tour',
      status: summary.status || 'stopped',
      completedSteps: summary.completedSteps || 0,
      totalSteps: summary.totalSteps || 0,
      objects: (summary.objects || []).slice(),
      knowledge: (summary.knowledge || []).slice(),
      at: new Date().toISOString()
    });
    while (data.tours.length > 8) data.tours.shift();
    return save(data);
  }

  function summary() {
    var data = load();
    return {
      zones: data.zones.slice(),
      stages: data.stages.slice(),
      objects: data.objects.slice(),
      knowledge: data.knowledge.slice(),
      missions: data.missions,
      tours: data.tours.slice(),
      startedAt: data.startedAt,
      updatedAt: data.updatedAt
    };
  }

  function reset() {
    var data = blank();
    try { localStorage.removeItem(KEY); } catch (err) {}
    document.dispatchEvent(new CustomEvent('journey-change', { detail: data }));
    return data;
  }

  document.addEventListener('scene-context', function (event) { recordContext(event.detail); });
  if (global.__sceneContext) recordContext(global.__sceneContext);

  global.JourneyStore = {
    KEY: KEY,
    load: load,
    save: save,
    recordContext: recordContext,
    recordMission: recordMission,
    recordTour: recordTour,
    summary: summary,
    reset: reset
  };
})(window);
