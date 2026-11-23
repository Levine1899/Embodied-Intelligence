const http = require('http');
const fs = require('fs');
const path = require('path');

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
  const mode = process.argv[2] || 'tour';
  const seconds = Number(process.argv[3] || 95);
  const outDir = process.argv[4] || path.join(__dirname, '..', 'dist', 'capture-' + mode);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.endsWith('.jpg')) fs.unlinkSync(path.join(outDir, f));

  const list = await getJson('http://127.0.0.1:9333/json/list');
  const page = list.find((t) => t.type === 'page' && t.url.includes('sandbox.html'));
  if (!page) throw new Error('sandbox page not found');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Page.screencastFrame') {
      const n = fs.readdirSync(outDir).filter((f) => f.endsWith('.jpg')).length + 1;
      fs.writeFileSync(path.join(outDir, 'frame_' + String(n).padStart(6, '0') + '.jpg'), Buffer.from(msg.params.data, 'base64'));
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
  await send('Page.bringToFront');
  await send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
  await sleep(800);

  const drive = mode === 'tour'
    ? `(function(){ var b=document.querySelector('[data-mode="tour"]'); if(b) b.click(); return 'tour'; })()`
    : `(async function(){
        const sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
        const click = function(el){ if(el) el.click(); };
        await sleep(3000);
        click(document.getElementById('overview'));
        await sleep(5000);
        click(document.querySelector('#stages [data-stage="0"]'));
        await sleep(7000);
        click(document.querySelector('#stages [data-stage="1"]'));
        await sleep(7000);
        click(document.getElementById('device-list-btn'));
        await sleep(2500);
        click(document.getElementById('device-list-close'));
        click(document.querySelector('#stages [data-stage="3"]'));
        await sleep(5000);
        click(document.getElementById('cut'));
        await sleep(6000);
        click(document.querySelector('#stages [data-stage="4"]'));
        await sleep(7000);
        click(document.getElementById('overview'));
        await sleep(3000);
        return 'explore';
      })()`;

  const driveResult = await send('Runtime.evaluate', { expression: drive, awaitPromise: true, returnByValue: true });
  await sleep(seconds * 1000);
  await send('Page.stopScreencast');
  await sleep(500);
  ws.close();
  const frames = fs.readdirSync(outDir).filter((f) => f.endsWith('.jpg')).length;
  console.log(JSON.stringify({ mode, frames, outDir, drive: driveResult.result && driveResult.result.value }));
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
