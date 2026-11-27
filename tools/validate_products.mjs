#!/usr/bin/env node
/**
 * L5 产品去向数据校验（Phase 8）。
 *
 * 除了 JSON-Schema，还固化了几条**业务规则**——它们对应本阶段明令禁止的退化：
 *   1. 不得把道路场景当成沥青材料本身（asphalt 必须是 material + 沥青块节点）
 *   2. 不得把塑料瓶当成树脂原料（plastics 必须是 manufacturedItem + 瓶节点）
 *   3. 不得删除多原料来源说明（多来源产品必须保留 ≥2 种原料）
 *   4. 不得宣称某产品只能由石油生产（文本负面断言）
 *
 * 分类判定不读任何 `oil` 布尔，而是从 typicalFeedstocks 推导，
 * 因此"改布尔就能改答案"这条路被封死了。
 *
 * 用法：node tools/validate_products.mjs [--strict]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'web/data/products.json');
const SCHEMA = resolve(ROOT, 'schemas/products.schema.json');

/* 明令禁止的说法：出现即判失败 */
const FORBIDDEN_PHRASES = [
  '只能由石油',
  '仅来自石油',
  '只能来自石油',
  '唯一来源是石油',
  '全部由石油',
];

/* 多原料产品：必须保留 ≥2 种原料（这是"不表达唯一来源"的硬约束） */
const MULTI_FEEDSTOCK_REQUIRED = ['plastics', 'synthetic_fiber', 'synthetic_rubber'];

export async function loadProducts() {
  return JSON.parse(await readFile(DATA, 'utf8'));
}

export async function validateProducts() {
  const data = await loadProducts();
  const schema = JSON.parse(await readFile(SCHEMA, 'utf8'));

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const problems = [];
  if (!validate(data)) {
    for (const e of validate.errors || []) {
      problems.push(`SCHEMA ${e.instancePath || '/'} ${e.message}`);
    }
  }

  const items = Array.isArray(data.items) ? data.items : [];

  /* 唯一性 */
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.productId)) problems.push(`productId 重复：${it.productId}`);
    seen.add(it.productId);
  }

  /* 分类推导：只认 typicalFeedstocks，不认任何 oil 布尔 */
  const derived = items.map((it) => ({
    productId: it.productId,
    isPetroleumRoute: Array.isArray(it.typicalFeedstocks) && it.typicalFeedstocks.includes('petroleum'),
    representationType: it.representationType,
    feedstocks: it.typicalFeedstocks || [],
  }));

  /* 规则 1：沥青 = 材料样本，不是道路场景 */
  const asphalt = items.find((i) => i.productId === 'asphalt');
  if (!asphalt) problems.push('缺少 asphalt 条目');
  else {
    if (asphalt.representationType !== 'material') {
      problems.push(`asphalt.representationType 必须是 material，实际 ${asphalt.representationType}`);
    }
    if (/road|scene|street/i.test(asphalt.modelNodeUid || '')) {
      problems.push(`asphalt 的模型不能指向道路场景节点：${asphalt.modelNodeUid}`);
    }
  }

  /* 规则 2：塑料 = 制品，不能拿瓶当树脂原料 */
  const plastics = items.find((i) => i.productId === 'plastics');
  if (!plastics) problems.push('缺少 plastics 条目');
  else {
    if (plastics.representationType !== 'manufacturedItem') {
      problems.push(`plastics.representationType 必须是 manufacturedItem，实际 ${plastics.representationType}`);
    }
    if (/resin|pellet|granule/i.test(plastics.modelNodeUid || '')) {
      problems.push(`plastics 的模型节点是树脂原料而非制品：${plastics.modelNodeUid}`);
    }
  }

  /* 规则 3：多原料产品必须 ≥2 种原料 */
  for (const id of MULTI_FEEDSTOCK_REQUIRED) {
    const it = items.find((i) => i.productId === id);
    if (!it) {
      problems.push(`缺少多原料条目：${id}`);
      continue;
    }
    const fs2 = new Set(it.typicalFeedstocks || []);
    if (fs2.size < 2) problems.push(`${id} 必须保留 ≥2 种典型原料（当前 ${[...fs2].join('/') || '空'}）`);
    if (!fs2.has('petroleum')) problems.push(`${id} 应当保留 petroleum 作为可行原料之一`);
  }

  /* 规则 4：不得出现绝对化表述 */
  for (const it of items) {
    const text = `${it.petroleumRouteDescription || ''} ${it.teachingNote || ''}`;
    for (const bad of FORBIDDEN_PHRASES) {
      if (text.includes(bad)) problems.push(`${it.productId} 含绝对化表述「${bad}」`);
    }
  }

  /* 模型绑定必须齐全（缺资产可以，但不能缺绑定字段——那是接口契约） */
  for (const it of items) {
    if (!it.modelAssetId) problems.push(`${it.productId} 缺 modelAssetId`);
    if (!it.modelNodeUid) problems.push(`${it.productId} 缺 modelNodeUid`);
  }

  return {
    ok: problems.length === 0,
    problems,
    count: items.length,
    items: derived,
    targets: derived.filter((d) => d.isPetroleumRoute).map((d) => d.productId),
    nonTargets: derived.filter((d) => !d.isPetroleumRoute).map((d) => d.productId),
  };
}

if (process.argv[1] && process.argv[1].endsWith('validate_products.mjs')) {
  validateProducts().then((r) => {
    const rel = relative(ROOT, DATA).replace(/\\/g, '/');
    if (!r.ok) {
      console.error(`✗ ${rel}`);
      r.problems.slice(0, 20).forEach((p) => console.error('  - ' + p));
      process.exit(1);
    }
    console.log(`✓ ${rel}  ${r.count} 项`);
    console.log(`  石油路线目标（${r.targets.length}）：${r.targets.join('、')}`);
    console.log(`  非石油路线（${r.nonTargets.length}）：${r.nonTargets.join('、')}`);
  });
}
