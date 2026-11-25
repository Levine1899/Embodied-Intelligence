/* 沉浸式讲解 · 左侧章节树组件
 *
 * 职责边界：
 * - 只渲染目录、维护折叠状态、发出“用户选择了某任务”的意图；
 * - 不接触 Three.js / camera / renderer / 模型，不复制关卡切换逻辑；
 * - 任务切换通过 onSelectTask 交给页面 adapter（当前页面 = 点击已有的 [data-stage] 按钮）。
 *
 * 用法：
 *   const tree = createImmersionChapterTree({
 *     root, chapters, getCurrentStageIndex, getCurrentStageId,
 *     onSelectTask(task) {}, storageKey: 'kepu.chapterTree.v1'
 *   });
 *   tree.setCurrentStage(stageId, stageIndex);
 *   tree.setCollapsed(true); tree.destroy();
 */
(function (global) {
  'use strict';

  var DRAWER_MEDIA = '(max-width: 1199px)';
  var COLLAPSE_MS = 220;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string' && text) node.textContent = text;
    return node;
  }

  function readStore(key) {
    try {
      var raw = global.localStorage && global.localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) { return null; }
  }

  function writeStore(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 隐私模式等场景忽略 */ }
  }

  function createImmersionChapterTree(options) {
    if (!options || !options.root) throw new Error('createImmersionChapterTree: 缺少 root');
    var root = options.root;
    var chapters = Array.isArray(options.chapters) ? options.chapters : [];
    var storageKey = options.storageKey || 'kepu.chapterTree.v1';
    var getCurrentStageIndex = typeof options.getCurrentStageIndex === 'function' ? options.getCurrentStageIndex : function () { return null; };
    var getCurrentStageId = typeof options.getCurrentStageId === 'function' ? options.getCurrentStageId : function () { return null; };
    var onSelectTask = typeof options.onSelectTask === 'function' ? options.onSelectTask : function () {};

    var saved = readStore(storageKey) || {};
    var state = {
      collapsed: !!saved.collapsed,
      expanded: {},
      currentTaskId: null,
      drawerOpen: false,
      destroyed: false
    };
    (Array.isArray(saved.expanded) ? saved.expanded : []).forEach(function (id) { state.expanded[id] = true; });
    chapters.forEach(function (chapter) {
      if (!(chapter.id in state.expanded)) state.expanded[chapter.id] = true; // 默认展开
    });

    var media = global.matchMedia ? global.matchMedia(DRAWER_MEDIA) : null;
    var isDrawer = function () { return !!(media && media.matches); };
    var abort = new AbortController();
    var observer = null;
    var resizeTimer = 0;
    var taskButtons = Object.create(null);
    var chapterToggles = Object.create(null);
    var collapseButtons = [];
    var scroller = null;
    var railButton = null;
    var trigger = null;
    var backdrop = null;

    root.classList.add('ct');
    root.setAttribute('role', 'navigation');
    root.setAttribute('aria-label', '章节导航');
    root.innerHTML = '';

    /* ---------- 结构 ---------- */
    var panel = el('section', 'ct__panel');
    var head = el('header', 'ct__head');
    var heading = el('div', 'ct__heading');
    heading.appendChild(el('span', 'ct__kicker', 'EXPLORATION MAP'));
    heading.appendChild(el('h2', 'ct__title', '章节导航'));
    head.appendChild(heading);

    var collapseToggle = el('button', 'ct__collapse');
    collapseToggle.type = 'button';
    collapseToggle.setAttribute('aria-controls', 'ct-body');
    collapseToggle.appendChild(el('span', 'ct__collapse-icon', '‹'));
    head.appendChild(collapseToggle);
    collapseButtons.push(collapseToggle);

    scroller = el('div', 'ct__scroller');
    scroller.id = 'ct-body';
    var chapterList = el('div', 'ct__chapters');

    chapters.forEach(function (chapter) {
      var section = el('section', 'ct__chapter');
      section.dataset.chapter = chapter.id;

      var toggle = el('button', 'ct__chapter-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-controls', 'ct-children-' + chapter.id);
      toggle.appendChild(el('span', 'ct__chapter-chevron'));
      toggle.appendChild(el('span', 'ct__chapter-icon'));
      toggle.appendChild(el('span', 'ct__chapter-title', chapter.title));
      section.appendChild(toggle);
      chapterToggles[chapter.id] = toggle;

      var list = el('ol', 'ct__tasks');
      list.id = 'ct-children-' + chapter.id;
      (chapter.children || []).forEach(function (task, index) {
        var item = el('li', 'ct__task');
        var button = el('button', 'ct__task-btn');
        button.type = 'button';
        button.dataset.taskId = task.id;
        button.dataset.stageIndex = String(task.stageIndex);
        button.dataset.stageId = task.stageId;
        button.appendChild(el('span', 'ct__node'));
        button.appendChild(el('span', 'ct__task-num', String(index + 1).padStart(2, '0')));
        var main = el('span', 'ct__task-main');
        main.appendChild(el('span', 'ct__task-title', task.title));
        if (task.description) main.appendChild(el('span', 'ct__task-desc', task.description));
        button.appendChild(main);
        item.appendChild(button);
        list.appendChild(item);
        taskButtons[task.id] = button;
      });
      section.appendChild(list);
      chapterList.appendChild(section);

      toggle.addEventListener('click', function (event) {
        event.stopPropagation();
        setChapterExpanded(chapter.id, !isChapterExpanded(chapter.id));
      }, { signal: abort.signal });
    });

    scroller.appendChild(chapterList);
    scroller.appendChild(el('p', 'ct__note', '章节内容持续扩展'));
    panel.appendChild(head);
    panel.appendChild(scroller);

    var foot = el('footer', 'ct__foot', '目录可收起 · 选择任务切换讲解场景');
    panel.appendChild(foot);
    root.appendChild(panel);

    /* 收起后的窄条 */
    railButton = el('button', 'ct__rail');
    railButton.type = 'button';
    railButton.setAttribute('aria-expanded', 'false');
    railButton.appendChild(el('span', 'ct__rail-icon'));
    railButton.appendChild(el('span', 'ct__rail-label', '章节导航'));
    root.appendChild(railButton);

    /* 移动端抽屉触发按钮与遮罩（挂在 body，避免被 grid 裁剪） */
    trigger = el('button', 'ct__trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'ct-drawer-panel');
    trigger.appendChild(el('span', 'ct__trigger-icon'));
    trigger.appendChild(el('span', 'ct__trigger-label', '目录'));
    document.body.appendChild(trigger);

    backdrop = el('div', 'ct__backdrop');
    backdrop.hidden = true;
    document.body.appendChild(backdrop);

    /* ---------- 交互 ---------- */

    function isChapterExpanded(id) { return !!state.expanded[id]; }

    function setChapterExpanded(id, expanded) {
      if (!(id in chapterToggles)) return;
      state.expanded[id] = !!expanded;
      chapterToggles[id].setAttribute('aria-expanded', expanded ? 'true' : 'false');
      var section = chapterToggles[id].parentElement;
      if (section) section.dataset.expanded = expanded ? 'true' : 'false';
      persist();
    }

    function setCollapsed(collapsed, { silent = false } = {}) {
      state.collapsed = !!collapsed;
      root.dataset.collapsed = state.collapsed ? 'true' : 'false';
      document.body.classList.toggle('ct-collapsed', state.collapsed && !isDrawer());
      var label = state.collapsed ? '展开章节导航' : '收起章节导航';
      collapseButtons.forEach(function (button) {
        button.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
        button.setAttribute('aria-label', label);
        button.title = label;
      });
      if (!silent) {
        persist();
        scheduleResize();
      }
    }

    function applyMode() {
      var drawer = isDrawer();
      document.body.classList.toggle('ct-inline', !drawer);
      document.body.classList.toggle('ct-drawer', drawer);
      root.dataset.mode = drawer ? 'drawer' : 'inline';
      if (!drawer) closeDrawer({ restoreFocus: false });
      trigger.hidden = !drawer;
      if (drawer) {
        document.body.classList.remove('ct-collapsed');
      } else {
        document.body.classList.toggle('ct-collapsed', state.collapsed);
      }
    }

    function openDrawer() {
      if (!isDrawer() || state.drawerOpen) return;
      state.drawerOpen = true;
      root.dataset.open = 'true';
      document.body.classList.add('ct-drawer-open');
      trigger.setAttribute('aria-expanded', 'true');
      backdrop.hidden = false;
      document.body.style.overflow = 'hidden';
      collapseButtons.forEach(function (button) {
        button.setAttribute('aria-label', '关闭章节导航');
        button.title = '关闭章节导航';
      });
      // 抽屉打开时把焦点放到关闭按钮，避免直接给任务项加一圈醒目的焦点框
      collapseToggle.focus({ preventScroll: true });
    }

    function closeDrawer({ restoreFocus = true } = {}) {
      if (!state.drawerOpen) {
        if (restoreFocus && isDrawer()) trigger.focus({ preventScroll: true });
        return;
      }
      state.drawerOpen = false;
      delete root.dataset.open;
      document.body.classList.remove('ct-drawer-open');
      trigger.setAttribute('aria-expanded', 'false');
      backdrop.hidden = true;
      document.body.style.overflow = '';
      setCollapsed(state.collapsed, { silent: true });
      if (restoreFocus && isDrawer()) trigger.focus({ preventScroll: true });
    }

    function onCollapseToggle() {
      if (isDrawer()) {
        closeDrawer();
        return;
      }
      setCollapsed(!state.collapsed);
    }
    collapseToggle.addEventListener('click', function (event) {
      event.stopPropagation();
      onCollapseToggle();
    }, { signal: abort.signal });

    railButton.addEventListener('click', function (event) {
      event.stopPropagation();
      setCollapsed(false);
    }, { signal: abort.signal });

    trigger.addEventListener('click', function (event) {
      event.stopPropagation();
      if (state.drawerOpen) closeDrawer();
      else openDrawer();
    }, { signal: abort.signal });

    backdrop.addEventListener('click', function () { closeDrawer(); }, { signal: abort.signal });

    function onKeydown(event) {
      if (!state.drawerOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab') return;
      var focusables = Array.prototype.filter.call(
        panel.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
        function (node) { return node.offsetParent !== null; }
      );
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeydown, { signal: abort.signal });

    /* 任务选择：只发出意图，由页面 adapter 调现有导航 */
    chapterList.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('.ct__task-btn') : null;
      if (!button || !root.contains(button)) return;
      event.stopPropagation();
      var task = findTask(button.dataset.taskId);
      if (!task) return;
      setCurrentTask(task, { scroll: false });
      onSelectTask(task);
      // 某些导航是异步的（关卡退出/进入），稍后再从应用状态校正一次
      global.setTimeout(syncFromApp, 60);
    }, { signal: abort.signal });

    /* 当前任务同步：监听现有 stage 按钮的 aria-current 变化 */
    var stages = document.getElementById('stages');
    if (stages && global.MutationObserver) {
      observer = new MutationObserver(function () { syncFromApp(); });
      observer.observe(stages, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    }

    function findTask(taskId) {
      for (var i = 0; i < chapters.length; i += 1) {
        var children = chapters[i].children || [];
        for (var j = 0; j < children.length; j += 1) {
          if (children[j].id === taskId) return children[j];
        }
      }
      return null;
    }

    function resolveTask(stageId, stageIndex) {
      var byIndex = null;
      var byId = null;
      chapters.forEach(function (chapter) {
        (chapter.children || []).forEach(function (task) {
          if (!byIndex && task.stageIndex === stageIndex) byIndex = task;
          if (!byId && stageId && task.stageId === stageId) byId = task;
        });
      });
      return byIndex || byId || null;
    }

    function setCurrentTask(task, { scroll = true } = {}) {
      state.currentTaskId = task ? task.id : null;
      Object.keys(taskButtons).forEach(function (id) {
        var button = taskButtons[id];
        if (task && id === task.id) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      if (task && scroll) scrollTaskIntoView(taskButtons[task.id]);
    }

    function scrollTaskIntoView(button) {
      if (!button || !scroller) return;
      var top = button.offsetTop;
      var bottom = top + button.offsetHeight;
      var viewTop = scroller.scrollTop;
      var viewBottom = viewTop + scroller.clientHeight;
      if (top < viewTop + 8) scroller.scrollTop = Math.max(0, top - 8);
      else if (bottom > viewBottom - 8) scroller.scrollTop = bottom - scroller.clientHeight + 8;
    }

    function syncFromApp() {
      if (state.destroyed) return;
      var index = null;
      try { index = getCurrentStageIndex(); } catch (e) { index = null; }
      if (index === undefined) index = null;
      if (index !== null && typeof index !== 'number') index = Number(index);
      if (index !== null && !isFinite(index)) index = null;

      var stageId = null;
      try { stageId = getCurrentStageId(); } catch (e) { stageId = null; }
      if (typeof stageId !== 'string' || !stageId) stageId = null;

      var task = resolveTask(stageId, index);
      setCurrentTask(task);
      if (!task && (stageId || index !== null)) {
        // 未知映射：保持无选中，仅记录非敏感调试信息
        if (global.console && console.debug) {
          console.debug('[chapter-tree] 当前 stage 未映射到章节树', { stageId: stageId, stageIndex: index });
        }
      }
    }

    function persist() {
      writeStore(storageKey, {
        collapsed: state.collapsed,
        expanded: Object.keys(state.expanded).filter(function (id) { return state.expanded[id]; })
      });
    }

    function scheduleResize() {
      if (state.destroyed) return;
      if (resizeTimer) global.clearTimeout(resizeTimer);
      var fire = function () { global.dispatchEvent(new Event('resize')); };
      fire();
      resizeTimer = global.setTimeout(function () {
        resizeTimer = 0;
        fire();
      }, COLLAPSE_MS + 80);
    }

    function onMediaChange() { applyMode(); }

    /* 面板内事件不向画布/页面全局监听冒泡 */
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'wheel', 'touchstart', 'touchmove', 'touchend']
      .forEach(function (type) {
        var passive = type === 'wheel' || type === 'touchstart' || type === 'touchmove' || type === 'touchend';
        root.addEventListener(type, function (event) { event.stopPropagation(); }, { passive: passive, signal: abort.signal });
      });

    if (media) {
      if (media.addEventListener) media.addEventListener('change', onMediaChange);
      else if (media.addListener) media.addListener(onMediaChange);
    }
    global.addEventListener('hashchange', syncFromApp, { signal: abort.signal });

    /* ---------- 初始渲染 ---------- */
    chapters.forEach(function (chapter) {
      setChapterExpanded(chapter.id, isChapterExpanded(chapter.id));
    });
    setCollapsed(state.collapsed, { silent: true });
    applyMode();
    document.body.classList.add('ct-ready');
    root.dataset.ready = 'true';
    syncFromApp();
    // 首屏布局从两列变三列后让三维渲染器按新宽度重算一次（延后到渲染器初始化之后）
    global.setTimeout(scheduleResize, 180);

    return {
      root: root,
      setCurrentStage: function (stageId, stageIndex) {
        setCurrentTask(resolveTask(stageId, stageIndex));
      },
      refresh: syncFromApp,
      setCollapsed: function (collapsed) { setCollapsed(collapsed); },
      isCollapsed: function () { return state.collapsed; },
      setChapterExpanded: setChapterExpanded,
      openDrawer: openDrawer,
      closeDrawer: closeDrawer,
      getState: function () {
        return {
          collapsed: state.collapsed,
          drawerOpen: state.drawerOpen,
          currentTaskId: state.currentTaskId,
          expanded: Object.assign({}, state.expanded)
        };
      },
      destroy: function () {
        if (state.destroyed) return;
        state.destroyed = true;
        abort.abort();
        if (observer) observer.disconnect();
        if (resizeTimer) global.clearTimeout(resizeTimer);
        if (media) {
          if (media.removeEventListener) media.removeEventListener('change', onMediaChange);
          else if (media.removeListener) media.removeListener(onMediaChange);
        }
        document.body.classList.remove('ct-ready', 'ct-inline', 'ct-drawer', 'ct-collapsed', 'ct-drawer-open');
        document.body.style.overflow = '';
        if (trigger && trigger.parentNode) trigger.parentNode.removeChild(trigger);
        if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        root.innerHTML = '';
        root.classList.remove('ct');
      }
    };
  }

  global.createImmersionChapterTree = createImmersionChapterTree;
})(typeof window !== 'undefined' ? window : globalThis);
