const http = require('http');

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
  const list = await getJson('http://127.0.0.1:9333/json/list');
  const page = list.find((t) => t.type === 'page' && t.url.includes('sandbox.html'));
  if (!page) throw new Error('page not found');
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
  const measure = `new Promise(function(resolve){
    var frames=0, start=performance.now(), last=start, gaps=[], long=0, maxGap=0;
    function step(t){
      frames++;
      var gap=t-last; last=t;
      if(gap>0){ gaps.push(gap); if(gap>33) long++; if(gap>maxGap) maxGap=gap; }
      if(t-start<4000){ requestAnimationFrame(step); return; }
      gaps.sort(function(a,b){return a-b;});
      var p95=gaps[Math.floor(gaps.length*0.95)]||0;
      resolve({fps: Math.round(frames/((t-start)/1000)*10)/10, frames: frames,
        p50: Math.round(gaps[Math.floor(gaps.length*0.5)]*10)/10, p95: Math.round(p95*10)/10,
        longFrames: long, maxGap: Math.round(maxGap*10)/10, stats: window.__stage ? window.__stage.stats() : null, renderer: (function(){try{var c=document.querySelector('canvas');var gl=c.getContext('webgl2')||c.getContext('webgl');var ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'n/a';}catch(e){return 'err';}})(),
        dpr: window.devicePixelRatio});
    }
    requestAnimationFrame(step);
  })`;
  const out = await send('Runtime.evaluate', { expression: measure, awaitPromise: true, returnByValue: true });
  console.log('@@DSH_RESULT@@' + JSON.stringify(out.result.value));
  ws.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
