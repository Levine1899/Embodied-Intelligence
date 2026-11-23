/* Phase 04 browser verification + evidence screenshots.
 * Usage: node tools/phase04-verify.cjs
 * Requires Chrome started with --remote-debugging-port=9229 and local server :8796.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.CDP_PORT || 9229);
const URL = process.env.PAGE_URL || 'http://127.0.0.1:8796/sandbox.html?rev=phase04';
const OUT = path.resolve(__dirname, '..', 'docs', 'phase-reports', 'evidence', 'phase-04');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let data = '';
      r.on('data', (c) => { data += c; });
      r.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const list = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page' && t.url.includes('sandbox.html')) || list.find((t) => t.type === 'page');
  if (!page) throw new Error('page target not found');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const evalPage = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const p = path.join(OUT, name);
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    console.log('saved', p, fs.statSync(p).size);
  };
  const waitAsset = async () => {
    const ok = await evalPage(`(async()=>{for(let i=0;i<60;i++){if(window.__l1&&window.__l1.assetLoaded)return true;await new Promise(r=>setTimeout(r,100));}return false})()`);
    if (!ok) throw new Error('underground asset did not load');
  };
  const wait = (ms) => sleep(ms);

  await new Promise((resolve) => { ws.onopen = resolve; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await wait(1800);
  const overviewCheck = await evalPage(`({devices:window.PETRO_REGISTRY.devices.length,overviewWellbore:!!window.__stage.baseScene.getObjectByName('wellbore_overview'),newIds:['underground_geology','reservoir','wellbore'].map(function(id){return [id,!!window.PETRO_REGISTRY.getDevice(id)]})})`);
  const entered = await evalPage(`(function(){var b=document.getElementById('enter-level');if(!b)return {ok:false,reason:'no entry button'};b.click();return {ok:true,text:b.textContent}})()`);
  await wait(900);
  await waitAsset();
  await wait(1200);
  await shot('phase04-01-entry.png');

  const resetCheck = await evalPage(`(function(){var p=document.querySelector('#l1-press');p.value=70;p.dispatchEvent(new Event('input',{bubbles:true}));window.__l1.selectReservoir();document.getElementById('l1-reset').click();return {pressure:window.__l1.pressure,selected:window.__l1.selected,ctx:window.__sceneContext.object,zone:window.__sceneContext.zoneId,slider:p.value}})()`);
  await wait(500);
  const initial = await evalPage(`({level:window.__stage.isLevel(),assetLoaded:window.__l1.assetLoaded,assetFailed:window.__l1.assetFailed,layers:window.__l1.layers,parts:window.__l1.parts,clipped:window.__l1.clipped,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),errors:(window.__auditErrors||[]).map(e=>e.message||String(e))})`);

  await evalPage(`(function(){var b=document.querySelector('#l1-layers [data-layer="caprock"]');b.click();return b.getAttribute('aria-pressed')})()`);
  await wait(500);
  await shot('phase04-02-strata-toggle.png');
  const chipOff = await evalPage(`(function(){var b=document.querySelector('#l1-layers [data-layer="caprock"]');return {pressed:b.getAttribute('aria-pressed'),state:window.__l1.layerState}})()`);
  await evalPage(`(function(){var b=document.querySelector('#l1-layers [data-layer="caprock"]');b.click();return b.getAttribute('aria-pressed')})()`);

  await evalPage(`window.__l1.selectLayer('overburden')`);
  await wait(450);
  await shot('phase04-03-strata-info.png');
  const layerInfo = await evalPage(`({selected:window.__l1.selected,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),info:document.querySelector('#l1-info').innerText})`);

  await evalPage(`window.__l1.selectReservoir()`);
  await wait(550);
  await shot('phase04-04-reservoir.png');
  const reservoirInfo = await evalPage(`({selected:window.__l1.selected,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),legend:document.querySelector('#l1-legend').className,info:document.querySelector('#l1-info').innerText})`);

  await evalPage(`window.__l1.enterPore()`);
  await wait(1100);
  await shot('phase04-05-pore.png');
  const poreInfo = await evalPage(`({pore:window.__l1.poreMode,selected:window.__l1.selected,legend:document.querySelector('#l1-legend').className,ctx:JSON.parse(JSON.stringify(window.__sceneContext))})`);
  await evalPage(`window.__l1.exitPore()`);
  await wait(600);

  await evalPage(`window.__l1.focusWellbore('perforation')`);
  await wait(700);
  await shot('phase04-06-wellbore.png');
  const wellboreInfo = await evalPage(`({selected:window.__l1.selected,view:window.__l1.viewMode,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),info:document.querySelector('#l1-info').innerText})`);

  await evalPage(`(function(){var p=document.querySelector('#l1-press');p.value=75;p.dispatchEvent(new Event('input',{bubbles:true}));return {value:window.__l1.pressure,note:document.querySelector('#l1-note').textContent}})()`);
  await wait(650);
  await shot('phase04-07-pressure.png');
  const pressureInfo = await evalPage(`({pressure:window.__l1.pressure,note:document.querySelector('#l1-note').textContent,history:window.__sceneContext.history.length})`);

  await evalPage(`window.__l1.traceUp()`);
  await wait(2200);
  await shot('phase04-08-surface.png');
  const surfaceInfo = await evalPage(`({view:window.__l1.viewMode,selected:window.__l1.selected,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),readout:document.querySelector('#l1-readout').innerText})`);

  await evalPage(`window.__l1.exit()`);
  await wait(1200);
  await shot('phase04-09-back-overview.png');
  const exitInfo = await evalPage(`({level:window.__stage.isLevel(),ctx:JSON.parse(JSON.stringify(window.__sceneContext)),errors:(window.__auditErrors||[]).map(e=>e.message||String(e))})`);
  await evalPage(`document.getElementById('enter-level').click()`);
  await wait(900);
  await waitAsset();
  await wait(700);
  const reentry = await evalPage(`({level:window.__stage.isLevel(),pressure:window.__l1.pressure,view:window.__l1.viewMode,slider:document.querySelector('#l1-press').value,done:document.querySelector('.lvl').classList.contains('done')})`);
  await evalPage(`window.__l1.exit()`);
  await wait(1000);

  const result = {
    date: '2026-11-23',
    page: URL,
    viewport: '1440x900',
    overviewCheck,
    entered,
    resetCheck,
    initial,
    chipOff,
    layerInfo,
    reservoirInfo,
    poreInfo,
    wellboreInfo,
    pressureInfo,
    surfaceInfo,
    exitInfo,
    reentry,
    screenshots: [
      'phase04-01-entry.png', 'phase04-02-strata-toggle.png', 'phase04-03-strata-info.png',
      'phase04-04-reservoir.png', 'phase04-05-pore.png', 'phase04-06-wellbore.png',
      'phase04-07-pressure.png', 'phase04-08-surface.png', 'phase04-09-back-overview.png'
    ]
  };
  fs.writeFileSync(path.join(OUT, 'phase04-verify.json'), JSON.stringify(result, null, 2));
  console.log('RESULT', JSON.stringify(result, null, 2));
  ws.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
