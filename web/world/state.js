/* Phase 03 · logical device state (single source of truth)
 * Overview and detail meshes bind to the same objectId and read/write this store.
 */
(function () {
  'use strict';

  var listeners = [];
  var devices = Object.create(null);
  var selectedId = null;
  var cameraMode = 'free';
  var overviewVisible = true;

  function create(id) {
    return {
      objectId: id,
      selection: 'default',
      structure: 'external',
      animation: 'idle',
      level: 0,
      visible: true,
      representations: {}
    };
  }

  function ensure(id) {
    if (!id) return null;
    if (!devices[id]) devices[id] = create(id);
    return devices[id];
  }

  function bind(id, representation, object3d) {
    var d = ensure(id);
    if (!d || !object3d) return d;
    if (!d.representations[representation]) d.representations[representation] = [];
    d.representations[representation].push(object3d);
    object3d.userData.logicalObjectId = id;
    object3d.userData.representation = representation;
    return d;
  }

  function apply(d) {
    Object.keys(d.representations).forEach(function (rep) {
      d.representations[rep].forEach(function (obj) {
        if (!obj) return;
        obj.visible = d.visible && overviewVisible !== false ? true : d.visible;
        obj.userData.logicalState = {
          selection: d.selection,
          structure: d.structure,
          animation: d.animation,
          level: d.level
        };
      });
    });
  }

  function set(id, patch, source) {
    var d = ensure(id);
    if (!d) return null;
    Object.keys(patch || {}).forEach(function (key) {
      if (['selection', 'structure', 'animation', 'level', 'visible'].indexOf(key) >= 0) d[key] = patch[key];
    });
    apply(d);
    emit({ type: 'device', objectId: id, state: snapshotDevice(d), source: source || 'api' });
    return d;
  }

  function select(id) {
    if (selectedId && selectedId !== id) set(selectedId, { selection: 'default' }, 'selection');
    selectedId = id || null;
    if (selectedId) set(selectedId, { selection: 'selected' }, 'selection');
    emit({ type: 'selection', objectId: selectedId });
    return selectedId ? snapshotDevice(ensure(selectedId)) : null;
  }

  function snapshotDevice(d) {
    return {
      objectId: d.objectId, selection: d.selection, structure: d.structure,
      animation: d.animation, level: d.level, visible: d.visible,
      representations: Object.keys(d.representations)
    };
  }

  function snapshot() {
    var out = {};
    Object.keys(devices).forEach(function (id) { out[id] = snapshotDevice(devices[id]); });
    return { sceneId: window.PETRO_REGISTRY ? window.PETRO_REGISTRY.sceneId : 'petro-chain-v3',
      selectedObjectId: selectedId, cameraMode: cameraMode, overviewVisible: overviewVisible, devices: out };
  }

  function reset() {
    Object.keys(devices).forEach(function (id) {
      devices[id].selection = 'default';
      devices[id].structure = 'external';
      devices[id].animation = 'idle';
      devices[id].level = 0;
      apply(devices[id]);
    });
    selectedId = null;
    cameraMode = 'free';
    emit({ type: 'reset' });
  }

  function setCameraMode(mode) {
    cameraMode = mode;
    emit({ type: 'camera', mode: cameraMode });
  }

  function setOverviewVisible(v) {
    overviewVisible = !!v;
    emit({ type: 'overview', visible: overviewVisible });
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }

  function emit(event) {
    listeners.forEach(function (fn) { try { fn(event); } catch (e) { /* UI listener must not break scene */ } });
  }

  window.PETRO_DEVICE_STATE = {
    version: '1.0.0',
    ensure: ensure,
    bind: bind,
    get: function (id) { return devices[id] ? snapshotDevice(devices[id]) : null; },
    set: set,
    select: select,
    snapshot: snapshot,
    reset: reset,
    subscribe: subscribe,
    setCameraMode: setCameraMode,
    setOverviewVisible: setOverviewVisible,
    get selectedObjectId() { return selectedId; }
  };
})();
