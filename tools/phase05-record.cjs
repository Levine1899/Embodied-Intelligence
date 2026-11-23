/* Phase 05 continuous recording via CDP screencast.
 * Chrome on 9229, 1440x900.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = Number(process.env.CDP_PORT || 9229);
const OUT = path.resolve(__dirname, '..', 'dist', 'capture-phase05');
const VIDEO = path.resolve(__dirname, '..', 'docs', 'phase-reports', 'evidence', 'phase-05', 'production-storage-continuity.mp4');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => resolve(JSON.parse(d))); }).on('error', reject);
  });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
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
      return;
    }
    if (msg.method === 'Page.screencastFrame') {
      const n = fs.readdirSync(OUT).filter((f) => f.endsWith('.jpg')).length + 1;
      fs.writeFileSync(path.join(OUT, 'frame_' + String(n).padStart(6, '0') + '.jpg'), Buffer.from(msg.params.data, 'base64'));
      send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }).catch(() => {});
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  await new Promise((resolve) => { ws.onopen = resolve; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8796/sandbox.html?rev=record05-' + Date.now() + '#stage=1' });
  await sleep(1800);
  await send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
  await sleep(500);
  const drive = `(async function(){
    const sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
    const click=function(id){var el=document.getElementById(id);if(el)el.click()};
    await sleep(900);
    window.__stage.selectStage(1,true); window.__stage.levelHook(1)();
    await sleep(4800);
    click('l2-structure');
    await sleep(1000);
    click('l2-play');
    await sleep(2200);
    click('l2-play');
    await sleep(700);
    click('l2-step');
    await sleep(700);
    click('l2-replay');
    await sleep(1000);
    (function(){
      var p = window.__l2.screenPoint('outlet','oil');
      var el = document.getElementById('viewport');
      if (p) {
        el.dispatchEvent(new PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,bubbles:true}));
        el.dispatchEvent(new PointerEvent('pointerup',{clientX:p.x,clientY:p.y,bubbles:true}));
      }
    })();
    await sleep(700);
    (function(){
      var p = window.__l2.screenPoint('tank','oil');
      var el = document.getElementById('viewport');
      if (p) {
        el.dispatchEvent(new PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,bubbles:true}));
        el.dispatchEvent(new PointerEvent('pointerup',{clientX:p.x,clientY:p.y,bubbles:true}));
      }
    })();
    await sleep(1800);
    window.__l2.exit();
    await sleep(2200);
    window.__stage.selectStage(2,true); window.__stage.levelHook(2)();
    await sleep(3400);
    var r=document.querySelector('#l3-level'); if(r){r.value=55;r.dispatchEvent(new Event('input',{bubbles:true}))}
    await sleep(1200);
    click('l3-cut');
    await sleep(900);
    click('l3-pumpstart');
    await sleep(2200);
    click('l3-float');
    await sleep(1400);
    click('l3-pumppause');
    await sleep(900);
    window.__l3.exit();
    await sleep(2200);
    return {level:window.__stage.isLevel(),stage:window.__sceneContext.stageId,zone:window.__sceneContext.zoneId,ctx:window.__sceneContext};
  })()`;
  const r = await send('Runtime.evaluate', { expression: drive, awaitPromise: true, returnByValue: true });
  await sleep(800);
  await send('Page.stopScreencast');
  await sleep(400);
  ws.close();
  const frames = fs.readdirSync(OUT).filter((f) => f.endsWith('.jpg')).length;
  if (!frames) throw new Error('no frames');
  const ffmpeg = process.env.FFMPEG || 'D:\\HikVision\\ffmpeg\\bin\\ffmpeg.exe';
  fs.mkdirSync(path.dirname(VIDEO), { recursive: true });
  execFileSync(ffmpeg, ['-y', '-framerate', '20', '-i', path.join(OUT, 'frame_%06d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', VIDEO], { stdio: 'inherit' });
  console.log(JSON.stringify({ frames, video: VIDEO, bytes: fs.statSync(VIDEO).size, drive: r.result && r.result.value }, null, 2));
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
