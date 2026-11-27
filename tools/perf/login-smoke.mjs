#!/usr/bin/env node
/**
 * 生产登录冒烟：真实浏览器走一遍「打开 → 填账号 → 登录 → 落地页」。
 *
 * 账号密码通过环境变量传入（KEPU_USER / KEPU_PASS），**不写进文件、不打印**。
 * 用途：验证 APP_ORIGINS 白名单、cookie 作用域、auth_request 三者串起来能正常工作。
 *
 * 用法：KEPU_USER=xxx KEPU_PASS=yyy node tools/perf/login-smoke.mjs https://host:port [--shot out.png]
 */
import { chromium } from 'playwright-core';
import { resolveChromePath } from '../e2e/harness.mjs';

const url = process.argv[2] || 'https://120.26.198.46:8023/';
const shotIdx = process.argv.indexOf('--shot');
const shot = shotIdx > 0 ? process.argv[shotIdx + 1] : null;
const user = process.env.KEPU_USER;
const pass = process.env.KEPU_PASS;
if (!user || !pass) {
  console.error('缺少 KEPU_USER / KEPU_PASS 环境变量');
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: resolveChromePath(),
  headless: false,
  args: ['--no-first-run', '--ignore-certificate-errors'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, locale: 'zh-CN' });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e).slice(0, 200)));

const out = { url };
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(800);
  out.loginPage = page.url();

  const userInput = page.locator('input[type=text], input[name=username], input#username').first();
  const passInput = page.locator('input[type=password]').first();
  await userInput.fill(user);
  await passInput.fill(pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null),
    page.getByRole('button', { name: /登录系统|登录/ }).first().click(),
  ]);
  await page.waitForTimeout(2500);

  out.finalUrl = page.url();
  out.title = await page.title();
  out.stillOnLogin = /login\.html/.test(page.url());
  out.alertText = await page.locator('.error, .alert, .toast, [role=alert]').allInnerTexts().then((a) => a.join(' | ').slice(0, 200)).catch(() => '');
  /* 可选：登录后再访问一个需要登录的页面，确认 3D 场景真的能起来 */
  const thenIdx = process.argv.indexOf('--then');
  if (thenIdx > 0) {
    const thenUrl = new URL(process.argv[thenIdx + 1], url).href;
    await page.goto(thenUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    out.thenUrl = page.url();
    out.thenStage = await page.evaluate(() => ({
      stage: !!window.__stage,
      threeRevision: window.THREE ? window.THREE.REVISION : null,
      l1: !!window.__l1,
      calls: window.__stage && window.__stage.renderer ? window.__stage.renderer.info.render.calls : null,
    }));
    if (shot) await page.screenshot({ path: shot.replace(/.png$/, '-sandbox.png') });
  }
  out.hasStage = await page.evaluate(() => !!window.__stage);
  out.bodySample = (await page.evaluate(() => document.body.innerText || '')).slice(0, 100).replace(/\s+/g, ' ');
  if (shot) await page.screenshot({ path: shot });
} catch (e) {
  out.error = String((e && e.message) || e).slice(0, 300);
} finally {
  await browser.close().catch(() => {});
}

out.pageErrors = pageErrors.slice(0, 5);
out.ok = !out.error && !out.stillOnLogin && out.pageErrors.length === 0;
console.log('@@LOGIN@@ ' + JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
