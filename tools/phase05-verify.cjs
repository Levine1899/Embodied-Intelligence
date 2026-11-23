/* Phase 05 verification: real CDP, 1440x900, separator + storage. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.CDP_PORT || 9229);
const OUT = path.resolve(__dirname, '..', 'docs', 'phase-reports', 'evidence', 'phase-05');
const URL = 'http://127.0.0.1:8796/sandbox.html?rev=phase05v-' + Date.now() + '#stage=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let data = '';
      r.on('data', (c) => { data += c; });
      r.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

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
  const wait = (ms) => sleep(ms);
  const waitL2 = async () => {
    const ok = await evalPage(`(async()=>{for(let i=0;i<80;i++){if(window.__l2&&window.__l2.assetLoaded)return true;await new Promise(r=>setTimeout(r,100));}return false})()`);
    if (!ok) throw new Error('separator asset did not load');
  };

  await new Promise((resolve) => { ws.onopen = resolve; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await wait(1800);
  const overview = await evalPage(`({devices:window.PETRO_REGISTRY.devices.length,pump:!!window.PETRO_REGISTRY.getDevice('transfer_pump'),stage:window.__sceneContext.stageId})`);
  await evalPage(`window.__stage.selectStage(1,true); window.__stage.levelHook(1)()`);
  await wait(1000);
  await waitL2();
  await wait(2600);
  await shot('phase05-01-separator-external.png');
  const external = await evalPage(`({level:window.__stage.isLevel(),asset:window.__l2.assetLoaded,failed:window.__l2.assetFailed,struct:window.__l2.structMode,ctx:JSON.parse(JSON.stringify(window.__sceneContext))})`);

  await evalPage(`document.querySelector('#l2-structure').click()`);
  await wait(900);
  await evalPage(`document.querySelector('#l2-play').click()`);
  await wait(2400);
  await shot('phase05-02-separator-internal.png');
  const internal = await evalPage(`({struct:window.__l2.structMode,running:window.__l2.running,phaseT:window.__l2.phaseT,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),state:window.PETRO_DEVICE_STATE.get('three_phase_separator')})`);

  const click3d = async (kind, key) => evalPage(`(function(){var p=window.__l2.screenPoint('${kind}','${key}'); if(!p)return null; var el=document.getElementById('viewport'); el.dispatchEvent(new PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,bubbles:true})); el.dispatchEvent(new PointerEvent('pointerup',{clientX:p.x,clientY:p.y,bubbles:true})); return p;})()`);
  await click3d('outlet', 'oil');
  await wait(600);
  await click3d('tank', 'gas');
  await wait(1100);
  await shot('phase05-03a-wrong-target.png');
  const wrong = await evalPage(`({ctx:JSON.parse(JSON.stringify(window.__sceneContext)),note:document.querySelector('#l2-note').textContent})`);
  await click3d('outlet', 'oil');
  await wait(500);
  await click3d('tank', 'oil');
  await wait(1400);
  await shot('phase05-03-outlet-choice.png');
  const outlet = await evalPage(`({last:window.__l2.lastInteraction,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),note:document.querySelector('#l2-note').textContent})`);

  await evalPage(`window.__l2.exit()`);
  await wait(1800);
  await shot('phase05-04-back-overview.png');
  const back = await evalPage(`({level:window.__stage.isLevel(),ctx:JSON.parse(JSON.stringify(window.__sceneContext))})`);

  await evalPage(`window.__stage.selectStage(2,true); window.__stage.levelHook(2)()`);
  await wait(2200);
  await wait(900);
  await shot('phase05-05-storage-external.png');
  await evalPage(`(function(){var r=document.querySelector('#l3-level');r.value=55;r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#l3-cut').click();document.querySelector('#l3-pumpstart').click();})()`);
  await wait(400);
  await wait(1300);
  await shot('phase05-06-storage-cut.png');
  const storage = await evalPage(`({level:window.__stage.isLevel(),levelValue:window.__l3.level,cut:window.__l3.cutMode,pumpRunning:window.__l3.pumpRunning,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),state:window.PETRO_DEVICE_STATE.get('fixed_roof_tank')})`);

  await evalPage(`document.querySelector('#l3-float').click()`);
  await wait(900);
  await shot('phase05-07-floating-tank.png');
  const floating = await evalPage(`({last:window.__l3.lastInteraction,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),state:window.PETRO_DEVICE_STATE.get('floating_roof_tank')})`);

  await evalPage(`window.__l3.exit()`);
  await wait(1800);
  await shot('phase05-08-storage-overview.png');
  const exit = await evalPage(`({level:window.__stage.isLevel(),ctx:JSON.parse(JSON.stringify(window.__sceneContext)),errors:(window.__auditErrors||[]).map(e=>e.message||String(e))})`);

  const result = {
    date: '2026-11-23', page: URL, viewport: '1440x900',
    overview, external, internal, outlet, back, storage, floating, exit,
    screenshots: [
      'phase05-01-separator-external.png', 'phase05-02-separator-internal.png',
      'phase05-03-outlet-choice.png', 'phase05-04-back-overview.png',
      'phase05-05-storage-external.png', 'phase05-06-storage-cut.png',
      'phase05-07-floating-tank.png', 'phase05-08-storage-overview.png'
    ]
  };
  fs.writeFileSync(path.join(OUT, 'phase05-verify.json'), JSON.stringify(result, null, 2));
  console.log('RESULT', JSON.stringify(result, null, 2));
  ws.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
