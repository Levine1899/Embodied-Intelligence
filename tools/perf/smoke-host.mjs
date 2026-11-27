#!/usr/bin/env node
/**
 * 部署冒烟：对任意已上线地址做一次真实浏览器检查。
 *
 * 用途：发布后在用户设备之外，先确认"页面能开、脚本能跑、没有 4xx/5xx、没有 JS 报错"。
 * 不登录（生产账号不该被测试脚本使用），所以只覆盖未登录路径：/ → 302 → /login.html。
 *
 * 用法：node tools/perf/smoke-host.mjs https://120.26.198.46:8023 [--shot out.png]
 */
import { chromium } from 'playwright-core';
import { resolveChromePath } from '../e2e/harness.mjs';

const url = process.argv[2];
if (!url) {
  console.error('用法: node tools/perf/smoke-host.mjs <https://host:port> [--shot out.png]');
  process.exit(2);
}
const shotIdx = process.argv.indexOf('--shot');
const shot = shotIdx > 0 ? process.argv[shotIdx + 1] : null;

const browser = await chromium.launch({
  executablePath: resolveChromePath(),
  headless: false,
  args: ['--no-first-run', '--no-default-browser-check', '--ignore-certificate-errors'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const page = await ctx.newPage();
const pageErrors = [];
const badResponses = [];
page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e).slice(0, 200)));
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) badResponses.push(r.status() + ' ' + r.url()); });
page.on('requestfailed', (r) => badResponses.push('FAILED ' + r.url()));

const out = { url, startedAt: new Date().toISOString() };
try {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  out.rootStatus = res ? res.status() : null;
  await page.waitForTimeout(1800);
  out.finalUrl = page.url();
  out.title = await page.title();
  out.loginInputs = await page.locator('input[type=password]').count();
  out.bodyTextSample = (await page.evaluate(() => document.body.innerText || '')).slice(0, 120).replace(/\s+/g, ' ');
  if (shot) await page.screenshot({ path: shot });
} catch (e) {
  out.error = String((e && e.message) || e).slice(0, 300);
} finally {
  await browser.close().catch(() => {});
}

out.pageErrors = pageErrors.slice(0, 8);
out.badResponses = badResponses.slice(0, 8);
out.ok = !out.error && !!out.rootStatus && out.rootStatus < 500 && pageErrors.length === 0 && badResponses.length === 0;
console.log('@@SMOKE@@ ' + JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
