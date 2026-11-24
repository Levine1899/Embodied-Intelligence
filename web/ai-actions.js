/* Phase 08 · AI action whitelist
 * 模型只能建议动作；动作必须由用户点击，并在这里做场景、关卡、对象、参数和版本校验。
 * 校验失败时不得修改三维或上下文；不把任意对象/方法暴露给模型。
 */
(function (global) {
  'use strict';

  function ctx() { return global.SceneContext ? global.SceneContext.get() : (global.__sceneContext || {}); }
  function level() { return ctx().levelId || null; }
  function registry() { return global.PETRO_REGISTRY || null; }
  function device(id) { return registry() && id ? registry().getDevice(id) : null; }
  function ok(data) { return Object.assign({ ok: true }, data || {}); }
  function fail(reason, message, extra) { return Object.assign({ ok: false, reason: reason, message: message }, extra || {}); }

  var SPECS = {
    select_object: {
      label: '选中当前环节的设备',
      stages: ['drill', 'gather', 'store', 'refine', 'use'],
      async: false,
      validate: function (args, c) {
        if (!args || typeof args.objectId !== 'string') return fail('BAD_ARGS', '缺少 objectId');
        var d = device(args.objectId);
        if (!d) return fail('OBJECT_NOT_FOUND', '该对象在当前场景不存在');
        if (d.stageId !== c.stageId) return fail('SCENE_MISMATCH', '该对象不属于当前环节');
        return ok({ device: d });
      },
      run: function (args) {
        if (!global.__stage || typeof global.__stage.setContextObject !== 'function') return fail('UNAVAILABLE', '三维场景尚未准备好');
        global.__stage.setContextObject(args.objectId);
        return ok({ objectId: args.objectId });
      }
    },
    clear_selection: {
      label: '取消当前设备选择',
      stages: ['drill', 'gather', 'store', 'refine', 'use'],
      async: false,
      validate: function () { return ok(); },
      run: function () {
        if (global.SceneContext) global.SceneContext.clearSelection();
        return ok();
      }
    },
    start_separation: {
      label: '启动三相分离演示',
      stages: ['gather'], levels: ['l2'], async: false,
      validate: function (args, c) {
        if (c.levelId !== 'l2' || c.stageId !== 'gather') return fail('SCENE_MISMATCH', '该动作只能在三相分离关卡执行');
        if (!global.__l2 || typeof global.__l2.startSeparation !== 'function') return fail('UNAVAILABLE', '三相分离关卡尚未准备好');
        return ok();
      },
      run: function () { global.__l2.startSeparation(); return ok(); }
    },
    pause_separation: {
      label: '暂停三相分离演示',
      stages: ['gather'], levels: ['l2'], async: false,
      validate: function (args, c) {
        if (c.levelId !== 'l2' || c.stageId !== 'gather') return fail('SCENE_MISMATCH', '该动作只能在三相分离关卡执行');
        if (!global.__l2 || typeof global.__l2.pauseSeparation !== 'function') return fail('UNAVAILABLE', '三相分离关卡尚未准备好');
        return ok();
      },
      run: function () { global.__l2.pauseSeparation(); return ok(); }
    },
    start_pump: {
      label: '启动转输泵',
      stages: ['store'], levels: ['l3'], async: false,
      validate: function (args, c) {
        if (c.levelId !== 'l3' || c.stageId !== 'store') return fail('SCENE_MISMATCH', '该动作只能在储运关卡执行');
        if (!global.__l3 || typeof global.__l3.startPump !== 'function') return fail('UNAVAILABLE', '储运关卡尚未准备好');
        return ok();
      },
      run: function () { global.__l3.startPump(); return ok(); }
    },
    set_liquid_level: {
      label: '设置教学液位（示意值）',
      stages: ['store'], levels: ['l3'], async: false,
      validate: function (args, c) {
        if (c.levelId !== 'l3' || c.stageId !== 'store') return fail('SCENE_MISMATCH', '该动作只能在储运关卡执行');
        var n = Number(args && args.percent);
        if (!Number.isFinite(n) || n < 0 || n > 100) return fail('BAD_ARGS', '液位必须在 0–100 之间');
        if (!global.__l3 || typeof global.__l3.setLevel !== 'function') return fail('UNAVAILABLE', '储运关卡尚未准备好');
        return ok({ percent: n });
      },
      run: function (args) { global.__l3.setLevel(args.percent); return ok({ percent: Number(args.percent) }); }
    },
    select_fraction: {
      label: '选择炼化馏分',
      stages: ['refine'], levels: ['l4'], async: false,
      validate: function (args, c) {
        if (c.levelId !== 'l4' || c.stageId !== 'refine') return fail('SCENE_MISMATCH', '该动作只能在炼化关卡执行');
        var allowed = ['naphtha', 'kerosene', 'diesel', 'residue', 'topgas'];
        if (!args || allowed.indexOf(args.fraction) < 0) return fail('BAD_ARGS', '馏分不在白名单内');
        if (!global.__l4 || typeof global.__l4.selectFraction !== 'function') return fail('UNAVAILABLE', '炼化关卡尚未准备好');
        return ok();
      },
      run: function (args) { global.__l4.selectFraction(args.fraction); return ok({ fraction: args.fraction }); }
    },
    select_product: {
      label: '选择产品去向',
      stages: ['use'], levels: ['l5'], async: false,
      validate: function (args, c) {
        if (c.levelId !== 'l5' || c.stageId !== 'use') return fail('SCENE_MISMATCH', '该动作只能在产品去向关卡执行');
        var n = Number(args && args.index);
        if (!Number.isInteger(n) || n < 0 || n > 5) return fail('BAD_ARGS', '产品索引不在白名单内');
        if (!global.__l5 || typeof global.__l5.select !== 'function') return fail('UNAVAILABLE', '产品去向关卡尚未准备好');
        return ok();
      },
      run: function (args) { global.__l5.select(Number(args.index)); return ok({ index: Number(args.index) }); }
    }
  };

  function catalog() {
    return Object.keys(SPECS).map(function (id) {
      return { actionId: id, label: SPECS[id].label, stages: (SPECS[id].stages || []).slice(), levels: (SPECS[id].levels || []).slice() };
    });
  }

  function available() {
    var c = ctx();
    return catalog().filter(function (s) {
      return (!s.stages.length || s.stages.indexOf(c.stageId) >= 0) && (!s.levels.length || s.levels.indexOf(c.levelId) >= 0);
    });
  }

  function execute(descriptor, options) {
    options = options || {};
    if (!descriptor || typeof descriptor !== 'object' || typeof descriptor.actionId !== 'string') {
      return fail('BAD_ARGS', '动作描述无效');
    }
    var id = descriptor.actionId;
    var spec = SPECS[id];
    if (!spec) return fail('NOT_ALLOWED', '该动作不在白名单内');
    var before = ctx();
    var rev = global.SceneContext ? global.SceneContext.revision() : null;
    if (options.expectedRevision != null && rev !== options.expectedRevision) {
      return fail('STALE_CONTEXT', '场景已变化，请重新查看建议');
    }
    if (options.expectedSceneId && before.sceneId !== options.expectedSceneId) {
      return fail('SCENE_MISMATCH', '当前场景与建议场景不一致');
    }
    var check = spec.validate(descriptor.args || {}, before);
    if (!check.ok) return check;

    /* 测试注入点：模拟用户在执行前切换场景；此时不进入任何变更。 */
    if (typeof options.beforeApply === 'function') {
      try { options.beforeApply(before); } catch (e) {}
      if (global.SceneContext && global.SceneContext.revision() !== rev) {
        return fail('SCENE_CHANGED_DURING_ACTION', '动作执行前场景已切换，未执行以避免状态不一致');
      }
    }
    var revisionNow = global.SceneContext ? global.SceneContext.revision() : null;
    if (revisionNow !== rev) return fail('SCENE_CHANGED_DURING_ACTION', '场景已切换，动作未执行');

    try {
      var result = spec.run(descriptor.args || {}, before);
      if (!result || !result.ok) return result || fail('UNAVAILABLE', '动作执行失败');
      return ok({ actionId: id, result: result });
    } catch (e) {
      /* 同步动作在抛错前未完成；保留用户当前状态，并给出可诊断内部码。 */
      return fail('ACTION_FAILED', '该场景动作当前不可用', { diagnostic: String(e && e.message || e).slice(0, 160) });
    }
  }

  function parse(text) {
    if (typeof text !== 'string') return null;
    var m = /```(?:action|json)\s*([\s\S]*?)```/i.exec(text);
    if (!m) return null;
    try {
      var obj = JSON.parse(m[1].trim());
      return obj && typeof obj.actionId === 'string' ? obj : null;
    } catch (e) { return null; }
  }

  global.AIActions = {
    version: 1,
    catalog: catalog,
    available: available,
    execute: execute,
    parse: parse,
    reasonText: function (reason) {
      return {
        NOT_ALLOWED: '该动作不在允许范围内',
        OBJECT_NOT_FOUND: '对象不存在',
        SCENE_MISMATCH: '当前场景不允许这个动作',
        STALE_CONTEXT: '场景已变化，请重新查看',
        SCENE_CHANGED_DURING_ACTION: '动作执行前场景已切换，已取消',
        ACTION_FAILED: '该场景动作当前不可用',
        UNAVAILABLE: '动作暂时不可用',
        BAD_ARGS: '动作参数不完整'
      }[reason] || '动作当前不可用';
    }
  };
})(window);
