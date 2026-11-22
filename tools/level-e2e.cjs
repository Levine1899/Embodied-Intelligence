const http = require('http');

const CDP_PORT = process.env.CDP_PORT || '9333';

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
  const list = await getJson('http://127.0.0.1:' + CDP_PORT + '/json/list');
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
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  await new Promise((resolve) => { ws.onopen = resolve; });
  await send('Page.bringToFront');
  const script = `(async function(){
    const sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
    const out = [];
    for (let i = 0; i < 5; i++) {
      window.__stage.levelHook(i)();
      await sleep(3200);
      try {
        if (i === 0 || i === 2) {
          const r = document.querySelector('.lvl.on input[type=range]');
          if (r) { r.value = 50; r.dispatchEvent(new Event('input', { bubbles: true })); }
        } else if (i === 1) {
          window.__l2.pickOutlet('oil');
        } else if (i === 3) {
          const c = document.querySelector('.lvl.on .lvl__chip'); if (c) c.click();
        } else {
          window.__l5.toggle(0);
        }
      } catch (e) { out.push({ step: 'op-error-' + i, error: String(e) }); }
      await sleep(700);
      const c1 = window.__sceneContext || {};
      const entered = { level: window.__stage.isLevel(), levelId: c1.levelId || null, interaction: c1.interaction || null };
      try { window['__l' + (i + 1)].exit(); } catch (e) { out.push({ step: 'exit-error-' + i, error: String(e) }); }
      await sleep(4200);
      const c2 = window.__sceneContext || {};
      out.push({ level: i + 1, entered: entered, exited: { level: window.__stage.isLevel(), levelId: c2.levelId || null } });
    }
    return out;
  })()`;
  const res = await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
  console.log('@@DSH_RESULT@@' + JSON.stringify(res.result.value));
  ws.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
