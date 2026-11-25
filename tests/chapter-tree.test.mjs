// 章节树数据层测试：标题/顺序/映射的唯一来源
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/immersion-chapters.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const api = sandbox.window.IMMERSION_CHAPTER_TREE;

const EXPECTED = [
  ['地下开采', '原油为什么不自己跑上来？', 'drill', 0],
  ['集输处理', '刚采出来的油为什么不是“纯油”？', 'gather', 1],
  ['储运调配', '跨区域输送靠什么“稳住节奏”？', 'store', 2],
  ['炼化加工', '一锅原油怎么“分身”成多种物料？', 'refine', 3],
  ['终端产品', '石油最终去了哪里？', 'use', 4]
];

test('章节树：一个一级章节 + 五个二级任务，标题与顺序严格符合规范', () => {
  assert.equal(api.chapters.length, 1);
  const chapter = api.chapters[0];
  assert.equal(chapter.title, '原油，怎样走出地下？');
  assert.equal(chapter.children.length, 5);
  // vm 上下文里的数组原型不同，先复制到当前 realm 再比较
  assert.deepEqual(
    Array.from(chapter.children, task => [task.title, task.description, task.stageId, task.stageIndex]),
    EXPECTED
  );
});

test('章节树：任务 ID 稳定且唯一，显示文案不是业务主键', () => {
  const ids = [];
  api.eachTask(task => ids.push(task.id));
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => assert.match(id, /^[a-z][a-z0-9-]{2,}$/));
  // 业务主键是 stageId，不是中文标题
  const stageIds = Array.from(api.chapters[0].children, task => task.stageId);
  assert.deepEqual(stageIds, ['drill', 'gather', 'store', 'refine', 'use']);
  assert.equal(new Set(stageIds).size, stageIds.length);
});

test('章节树：stageId / stageIndex 与页面真实五关一一对应', () => {
  EXPECTED.forEach(([, , stageId, stageIndex]) => {
    assert.equal(api.taskByStageId(stageId)?.stageIndex, stageIndex);
    assert.equal(api.taskByStageIndex(stageIndex)?.stageId, stageId);
  });
  assert.equal(api.resolveTask('refine', 3).title, '炼化加工');
});

test('章节树：未知 stage 不猜测、不错误高亮第一项', () => {
  assert.equal(api.taskByStageId('unknown-stage'), null);
  assert.equal(api.taskByStageIndex(99), null);
  assert.equal(api.taskByStageIndex(null), null);
  assert.equal(api.taskByStageId(undefined), null);
  assert.equal(api.resolveTask('unknown-stage', 99), null);
  // 索引优先于字符串，避免旧 stageId 映射错误
  assert.equal(api.resolveTask('drill', 4).title, '终端产品');
});

test('章节树：每个任务都有可访问的标题与辅助说明', () => {
  api.eachTask(task => {
    assert.ok(task.title.trim().length > 0);
    assert.ok(task.description.trim().length > 0);
    assert.equal(typeof task.stageId, 'string');
    assert.equal(typeof task.stageIndex, 'number');
    // 纯文本配置，不包含 HTML 片段（组件也用 textContent 渲染）
    assert.doesNotMatch(task.title, /[<>]/);
    assert.doesNotMatch(task.description, /[<>]/);
  });
});

test('章节树：数据结构可追加新章节与新任务', () => {
  const chapter = api.chapters[0];
  const copy = {
    id: 'future-chapter',
    title: '未来的新章节',
    children: [{ id: 'future-task', title: '新任务', description: '说明', stageId: 'drill', stageIndex: 0 }]
  };
  // 纯函数接受任意章节数组，组件也按 chapters 参数渲染，新增章节无需改组件
  const found = api._pure.taskByStageId([chapter, copy], 'drill');
  assert.equal(found.id, 'underground-extraction');
  const foundFuture = api._pure.taskByStageIndex([copy], 0);
  assert.equal(foundFuture.id, 'future-task');
});
