/* Phase 07 real-browser recordings. Usage: node tools/phase07-record.cjs tour|mission */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODE = process.argv[2] === 'mission' ? 'mission' : 'tour';
const PORT = Number(process.env.CDP_PORT || 4344);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8796';
const ROOT = path.resolve(__dirname, '..');
const EVID = path.join(ROOT, 'docs', 'phase-reports', 'evidence', 'phase-07');
const OUT = path.join(ROOT, 'dist', 'capture-phase07-' + MODE);
const VIDEO = path.join(EVID, MODE === 'tour' ? 'full-tour-continuity.mp4' : 'free-plus-mission.mp4');
const FFMPEG = process.env.FFMPEG || 'D:\\HikVision\\ffmpeg\\bin\\ffmpeg.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => resolve(JSON.parse(d))); }).on('error', reject);
  });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(EVID, { recursive: true });
  const list = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page' && /sandbox\.html/.test(t.url)) || list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  let frames = 0;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Page.screencastFrame') {
      frames += 1;
      fs.writeFileSync(path.join(OUT, 'frame_' + String(frames).padStart(6, '0') + '.jpg'), Buffer.from(msg.params.data, 'base64'));
      send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }).catch(() => {});
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    id += 1; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  await new Promise((resolve) => { ws.onopen = resolve; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result && r.result.value;
  }
  async function click(sel) {
    return ev(`(()=>{var el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;el.click();return true})()`);
  }
  async function pointer(sel) {
    const r = await ev(`(()=>{var el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;var b=el.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,vis:getComputedStyle(el).display!=='none'&&b.width>0&&b.height>0}})()`);
    if (!r || !r.vis) return false;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return true;
  }

  await send('Page.navigate', { url: `${BASE}/sandbox.html?rev=record07-${MODE}-${Date.now()}` });
  await sleep(2800);
  await ev(`localStorage.removeItem('kepu.mission.v1');localStorage.removeItem('kepu.journey.v1');location.reload();true`);
  await sleep(3600);
  await send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1440, maxHeight: 900, everyNthFrame: 3 });
  await sleep(500);

  if (MODE === 'tour') {
    await click('.modebar [data-mode="tour"]');
    await sleep(2400);
    for (let i = 0; i < 9; i += 1) {
      await pointer('#tour-next');
      await sleep(i === 8 ? 6500 : 4900);
    }
    await sleep(2600);
  } else {
    await click('.modebar [data-mode="task"]');
    await sleep(1500);
    await pointer('#mission-begin');
    await sleep(4700);

    await ev(`window.__l1.selectReservoir()`);
    await ev(`document.querySelector('#l1-extract').click()`);
    await sleep(900);

    await pointer('#mission-enter');
    await sleep(4700);
    await ev(`window.__l2.applyStructure(true,false);window.__l2.startSeparation();`);
    await sleep(700);
    // Deliberate wrong destination, then recover.
    await ev(`window.__l2.pickOutlet('gas');window.__l2.assignTank('oil');`);
    await sleep(1800);
    await pointer('#mission-hint');
    await sleep(1200);
    for (const key of ['gas', 'oil', 'water']) {
      await pointer(`[data-outlet="${key}"]`);
      await sleep(240);
      await pointer(`[data-target="${key}"]`);
      await sleep(2400);
    }
    await sleep(700);

    await pointer('#mission-enter');
    await sleep(4700);
    await ev(`window.__l3.selectTank('floating_roof_tank');window.__l3.setLevel(75);`);
    await pointer('#l3-pumpstart');
    await sleep(2100);

    await pointer('#mission-enter');
    await sleep(4700);
    await pointer('[data-level="2"]');
    await pointer('[data-fraction="diesel"]');
    await sleep(2100);

    await pointer('#mission-enter');
    await sleep(4700);
    const product = await ev(`(()=>{var p=window.__l5.picked||[];for(var i=0;i<6;i++){if(p.indexOf(i)<0)return i}return 0})()`);
    await ev(`window.__l5.select(${product})`);
    await sleep(2400);
    await sleep(2200);

    await click('#mission-free');
    await sleep(2200);
    // Free exploration: orbit the overview with real mouse events.
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 460, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i += 1) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720 + i * 9, y: 460, button: 'left', buttons: 1 });
      await sleep(40);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 828, y: 460, button: 'left', clickCount: 1 });
    await sleep(2500);
  }

  await send('Page.stopScreencast');
  await sleep(350);
  ws.close();
  if (!frames) throw new Error('no frames');
  execFileSync(FFMPEG, ['-y', '-framerate', '20', '-i', path.join(OUT, 'frame_%06d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', VIDEO], { stdio: 'inherit' });
  const info = { mode: MODE, frames, seconds: +(frames / 20).toFixed(2), video: VIDEO, bytes: fs.statSync(VIDEO).size };
  fs.writeFileSync(path.join(EVID, `record-${MODE}.json`), JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info, null, 2));
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
