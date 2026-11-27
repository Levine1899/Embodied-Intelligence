/**
 * Phase 10｜性能守卫：降级/恢复滞回。
 *
 * 为什么是纯函数状态机：降级阈值和冷却如果散在渲染循环里，就没法单测，
 * 也必然出现"在 30fps 上下反复抖"的问题。这里把判定抽干，渲染循环只喂采样。
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    degradeFps: 30,
    degradeHoldMs: 3000,
    restoreFps: 45,
    restoreHoldMs: 10000,
    cooldownMs: 5000,
    minLevel: 0,
    maxLevel: 2,
  };

  function createPerfGuard(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});
    let level = cfg.maxLevel;
    /* 哨兵必须用 null：0 是合法时间戳，用 0 表示"未开始"会让计时窗每帧被重置。 */
    let belowSince = null, aboveSince = null, lastChangeAt = -Infinity;
    const events = [];

    function emit(type, payload) {
      events.push(Object.assign({ type, at: payload.now, level }, payload));
      if (typeof cfg.onChange === 'function') cfg.onChange(level, type, payload);
    }

    return {
      get level() { return level; },
      get config() { return cfg; },
      get events() { return events.slice(); },
      /** 喂一帧采样：fps 为该帧瞬时 FPS，now 为毫秒时钟。返回当前等级。 */
      tick(fps, now) {
        if (!isFinite(fps) || fps <= 0) return level;
        if (fps < cfg.degradeFps) {
          if (belowSince === null) belowSince = now;
          aboveSince = null;
          if (level > cfg.minLevel && now - belowSince >= cfg.degradeHoldMs) {
            level -= 1; belowSince = null; lastChangeAt = now;
            emit('degrade', { fps, now, heldMs: cfg.degradeHoldMs });
          }
        } else if (fps > cfg.restoreFps) {
          if (aboveSince === null) aboveSince = now;
          belowSince = null;
          const cooled = now - lastChangeAt >= cfg.cooldownMs;
          if (level < cfg.maxLevel && cooled && now - aboveSince >= cfg.restoreHoldMs) {
            level += 1; aboveSince = null; lastChangeAt = now;
            emit('restore', { fps, now, heldMs: cfg.restoreHoldMs });
          }
        } else {
          /* 30–45 之间是不动区：正是防抖的关键，避免阈值附近来回切。 */
          belowSince = null; aboveSince = null;
        }
        return level;
      },
      /** 等级 → DPR 缩放；只调像素比，不动场景结构。
          索引用 maxLevel-level：等级 2 是满质量，必须落在 1.0 上。 */
      dprScale() { return [1, 0.8, 0.65][cfg.maxLevel - level]; },
    };
  }

  /** 在真实渲染循环外挂采样：只读 renderer.info 与帧间隔，不改场景。 */
  function attachPerfGuard(renderer, opts) {
    const guard = createPerfGuard(Object.assign({
      onChange: function (level) {
        const base = Math.min(global.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(Math.max(0.6, base * guard.dprScale()));
      },
    }, opts || {}));
    let last = performance.now();
    function frame(now) {
      const dt = now - last; last = now;
      if (dt > 0 && dt < 1000) guard.tick(1000 / dt, now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    global.__perfGuard = guard;
    return guard;
  }

  /**
   * 自挂载：等 immersion.js 建好 renderer 再接管，不需要改它的代码。
   * 轮询有上限（60s）且间隔 500ms，避免常驻定时器。
   */
  function autoAttach(timeoutMs) {
    const limit = Date.now() + (timeoutMs || 60000);
    let done = false;
    function tick() {
      if (done) return;
      const stage = global.__stage;
      if (stage && stage.renderer) {
        done = true;
        if (global.PetroVisual && global.PetroVisual.applyRendererPolicy) {
          global.__visualPolicy = global.PetroVisual.applyRendererPolicy(stage.renderer, global.THREE);
        }
        attachPerfGuard(stage.renderer);
        return;
      }
      if (Date.now() > limit) return;
      setTimeout(tick, 500);
    }
    tick();
  }

  global.PetroPerf = { DEFAULTS, createPerfGuard, attachPerfGuard, autoAttach };

  /* 之前只导出了 autoAttach 却没有调用 —— 守卫从未挂上、曝光也没生效。
     这里在 DOM 就绪后启动自挂载（renderer 出现后立刻接管）。 */
  /* Node 单测环境没有 document：不隔离会让整个 IIFE 抛错、5 条用例全红。 */
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { autoAttach(); });
    } else {
      autoAttach();
    }
  }
})(window);
