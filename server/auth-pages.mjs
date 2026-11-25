// 受保护页面清单：唯一来源 server/protected-pages.json。
// 任何 HTML 都必须显式归入 protected 或 public；未登记的 HTML 运行时按受保护处理（fail closed）。

import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { SERVER_DIR } from './auth-config.mjs';

export const PAGES_FILE = path.join(SERVER_DIR, 'protected-pages.json');

export class PagePolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PagePolicyError';
    this.code = 'page_policy_invalid';
  }
}

function normalizePagePath(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/')) throw new PagePolicyError('页面路径必须以 / 开头：' + raw);
  if (raw.includes('\\')) throw new PagePolicyError('页面路径不能含反斜杠：' + raw);
  if (raw.includes('..') || raw.includes('//')) throw new PagePolicyError('页面路径不能含 . / 或连续斜杠：' + raw);
  if (!raw.endsWith('.html')) throw new PagePolicyError('页面路径必须以 .html 结尾：' + raw);
  return raw.toLowerCase();
}

export function emptyPagePolicy() {
  return {
    schemaVersion: 1,
    entryPage: '/index.html',
    loginPage: '/login.html',
    protectedPages: new Set(),
    publicPages: new Set()
  };
}

/** 读取并严格校验页面策略。任何结构问题都拒绝启动，不做猜测。 */
export async function loadPagePolicy(filePath = PAGES_FILE) {
  let text;
  try {
    text = await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    throw new PagePolicyError('无法读取受保护页面清单：' + (error.code || error.message));
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new PagePolicyError('protected-pages.json 不是合法 JSON');
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new PagePolicyError('protected-pages.json 顶层必须是对象');
  if (doc.schemaVersion !== 1) throw new PagePolicyError('protected-pages.json schemaVersion 只支持 1');
  if (!Array.isArray(doc.protected) || !Array.isArray(doc.public)) {
    throw new PagePolicyError('protected-pages.json 必须包含 protected 与 public 两个数组');
  }
  const protectedPages = new Set();
  for (const entry of doc.protected) {
    const page = normalizePagePath(entry);
    if (protectedPages.has(page)) throw new PagePolicyError('protected 中出现重复页面：' + page);
    protectedPages.add(page);
  }
  const publicPages = new Set();
  for (const entry of doc.public) {
    const page = normalizePagePath(entry);
    if (publicPages.has(page)) throw new PagePolicyError('public 中出现重复页面：' + page);
    if (protectedPages.has(page)) throw new PagePolicyError('页面同时出现在 protected 与 public：' + page);
    publicPages.add(page);
  }
  const loginPage = normalizePagePath(doc.loginPage || '/login.html');
  if (!publicPages.has(loginPage)) throw new PagePolicyError('loginPage 必须出现在 public 列表中：' + loginPage);
  const entryPage = normalizePagePath(doc.entryPage || '/index.html');
  if (!protectedPages.has(entryPage)) throw new PagePolicyError('entryPage 必须出现在 protected 列表中：' + entryPage);
  if (!protectedPages.size) throw new PagePolicyError('protected 不能为空');
  return { schemaVersion: 1, entryPage, loginPage, protectedPages, publicPages };
}

/** 把 "/" 映射到入口页，其余原样（小写）。 */
export function normalizeRequestPage(pathname, policy) {
  const clean = String(pathname || '/').split('?')[0].split('#')[0];
  if (clean === '/' || clean === '') return policy ? policy.entryPage : '/index.html';
  return clean.toLowerCase();
}

/** 该路径是否受保护；未登记的 HTML 一律按受保护处理。 */
export function isProtectedPage(pagePath, policy) {
  const page = normalizeRequestPage(pagePath, policy);
  if (policy.publicPages.has(page)) return false;
  if (policy.protectedPages.has(page)) return true;
  if (page.endsWith('.html')) return true; // 未登记 = 默认受保护
  return false;
}

export function isPublicPage(pagePath, policy) {
  const page = normalizeRequestPage(pagePath, policy);
  return policy.publicPages.has(page);
}

/** 从 URL pathname 推断对应的 web/ 相对路径（POSIX，小写）。 */
export function relativePageFromPathname(pathname) {
  const clean = String(pathname || '/').split('?')[0].split('#')[0];
  if (clean === '/' || clean === '') return '/index.html';
  return clean.toLowerCase();
}
