/* 沉浸式讲解 · 章节树数据
 *
 * 设计约束：
 * - 仅两级：一级章节（chapter）→ 二级任务（task）。
 * - task.id 是稳定业务标识；显示文案（title/description）与业务 stageId 分离。
 * - stageId / stageIndex 必须对应 world/registry.js 中真实存在的五关：
 *   drill(0) / gather(1) / store(2) / refine(3) / use(4)。
 * - 新增章节或任务时只改本文件，不改侧栏组件。
 */
(function (global) {
  'use strict';

  var CHAPTERS = [
    {
      id: 'crude-oil-journey',
      title: '原油，怎样走出地下？',
      children: [
        {
          id: 'underground-extraction',
          title: '地下开采',
          description: '原油为什么不自己跑上来？',
          stageId: 'drill',
          stageIndex: 0
        },
        {
          id: 'gathering-processing',
          title: '集输处理',
          description: '刚采出来的油为什么不是“纯油”？',
          stageId: 'gather',
          stageIndex: 1
        },
        {
          id: 'storage-transport',
          title: '储运调配',
          description: '跨区域输送靠什么“稳住节奏”？',
          stageId: 'store',
          stageIndex: 2
        },
        {
          id: 'refining',
          title: '炼化加工',
          description: '一锅原油怎么“分身”成多种物料？',
          stageId: 'refine',
          stageIndex: 3
        },
        {
          id: 'end-products',
          title: '终端产品',
          description: '石油最终去了哪里？',
          stageId: 'use',
          stageIndex: 4
        }
      ]
    }
  ];

  function eachTask(chapters, fn) {
    (chapters || []).forEach(function (chapter) {
      (chapter.children || []).forEach(function (task) {
        fn(task, chapter);
      });
    });
  }

  function taskByStageId(chapters, stageId) {
    if (typeof stageId !== 'string' || !stageId) return null;
    var found = null;
    eachTask(chapters, function (task) {
      if (!found && task.stageId === stageId) found = { task: task };
    });
    return found ? found.task : null;
  }

  function taskByStageIndex(chapters, stageIndex) {
    if (typeof stageIndex !== 'number' || !isFinite(stageIndex)) return null;
    var found = null;
    eachTask(chapters, function (task) {
      if (!found && task.stageIndex === stageIndex) found = { task: task };
    });
    return found ? found.task : null;
  }

  function resolveTask(chapters, stageId, stageIndex) {
    var byIndex = taskByStageIndex(chapters, stageIndex);
    if (byIndex) return byIndex;
    return taskByStageId(chapters, stageId);
  }

  var api = {
    version: 1,
    chapters: CHAPTERS,
    eachTask: function (fn) { eachTask(CHAPTERS, fn); },
    taskByStageId: function (stageId) { return taskByStageId(CHAPTERS, stageId); },
    taskByStageIndex: function (stageIndex) { return taskByStageIndex(CHAPTERS, stageIndex); },
    resolveTask: function (stageId, stageIndex) { return resolveTask(CHAPTERS, stageId, stageIndex); }
  };

  // 纯函数也挂一层，便于 node 测试直接取用
  api._pure = {
    eachTask: eachTask,
    taskByStageId: taskByStageId,
    taskByStageIndex: taskByStageIndex,
    resolveTask: resolveTask
  };

  global.IMMERSION_CHAPTER_TREE = api;
})(typeof window !== 'undefined' ? window : globalThis);
