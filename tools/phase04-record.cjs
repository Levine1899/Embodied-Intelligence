/* Record the phase-04 real-time interaction sequence via CDP screencast.
 * Chrome must be running with --remote-debugging-port=9229.
 * Usage: node tools/phase04-record.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = Number(process.env.CDP_PORT || 9229);
const OUT = path.resolve(__dirname, '..', 'dist', 'capture-phase04');
const VIDEO = path.resolve(__dirname, '..', 'docs', 'phase-reports', 'evidence', 'phase-04', 'underground-continuity.mp4');

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
  await send('Page.navigate', { url: 'http://127.0.0.1:8796/sandbox.html?rev=record04#stage=0' });
  await sleep(1800);
  await send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
  await sleep(500);
  const drive = `(async function(){
    const sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
    const click=function(el){if(el)el.click()};
    await sleep(900);
    click(document.getElementById('enter-level'));
    await sleep(5000);
    click(document.querySelector('#l1-layers [data-layer="caprock"]'));
    await sleep(900);
    click(document.querySelector('#l1-layers [data-layer="caprock"]'));
    await sleep(700);
    // click the reservoir layer via its projected screen point (real raycaster path)
    var G=window.__stage.baseScene.children.filter(function(c){return c.name==='underground-experience'})[0];
    var m=null; G.traverse(function(n){if(n.isMesh&&n.name==='geo_reservoir_layer')m=n});
    if(m && window.__l1.camera){
      var box=new window.THREE.Box3().setFromObject(m);
      var c=box.getCenter(new window.THREE.Vector3());
      var v=c.clone().project(window.__l1.camera);
      var canvas=window.__stage.renderer.domElement;
      var r=canvas.getBoundingClientRect();
      var x=r.left+(v.x+1)/2*r.width, y=r.top+(-v.y+1)/2*r.height;
      canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,bubbles:true}));
      canvas.dispatchEvent(new PointerEvent('pointerup',{clientX:x,clientY:y,bubbles:true}));
    }
    await sleep(1800);
    click(document.getElementById('l1-pore'));
    await sleep(2600);
    click(document.getElementById('l1-pore'));
    await sleep(900);
    var p=document.getElementById('l1-press'); if(p){p.value=70;p.dispatchEvent(new Event('input',{bubbles:true}))}
    await sleep(1500);
    click(document.getElementById('l1-up'));
    await sleep(3800);
    return {level:window.__stage.isLevel(),asset:window.__l1.assetLoaded,selected:window.__l1.selected,view:window.__l1.viewMode};
  })()`;
  const r = await send('Runtime.evaluate', { expression: drive, awaitPromise: true, returnByValue: true });
  await sleep(800);
  await send('Page.stopScreencast');
  await sleep(400);
  ws.close();
  const frames = fs.readdirSync(OUT).filter((f) => f.endsWith('.jpg')).length;
  if (!frames) throw new Error('no screencast frames');
  const ffmpeg = process.env.FFMPEG || 'D:\\HikVision\\ffmpeg\\bin\\ffmpeg.exe';
  fs.mkdirSync(path.dirname(VIDEO), { recursive: true });
  execFileSync(ffmpeg, ['-y', '-framerate', '20', '-i', path.join(OUT, 'frame_%06d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', VIDEO], { stdio: 'inherit' });
  console.log(JSON.stringify({ frames, video: VIDEO, bytes: fs.statSync(VIDEO).size, drive: r.result && r.result.value }, null, 2));
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
