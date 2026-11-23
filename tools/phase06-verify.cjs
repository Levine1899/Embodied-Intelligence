/* Phase 06 verification: refining unit three states + process + fractions. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.CDP_PORT || 9229);
const OUT = path.resolve(__dirname, '..', 'docs', 'phase-reports', 'evidence', 'phase-06');
const URL = 'http://127.0.0.1:8796/sandbox.html?rev=phase06v-' + Date.now() + '#stage=3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => resolve(JSON.parse(d))); }).on('error', reject);
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
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    id += 1; pending.set(id, { resolve, reject });
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
  await new Promise((resolve) => { ws.onopen = resolve; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1800);
  await evalPage(`window.__stage.selectStage(3,true); window.__stage.levelHook(3)()`);
  await sleep(900);
  const loaded = await evalPage(`(async()=>{for(let i=0;i<90;i++){if(window.__l4&&window.__l4.loaded)return true;await new Promise(r=>setTimeout(r,100));}return false})()`);
  if (!loaded) throw new Error('tower asset did not load');
  await sleep(2200);
  await shot('phase06-01-refining-external.png');
  const external = await evalPage(`({loaded:window.__l4.loaded,level:window.__l4.level,groups:window.__l4.groups,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),state:window.PETRO_DEVICE_STATE.get('atmospheric_tower')})`);

  const detailIsolation = await evalPage(`(function(){
    var st=window.PETRO_DEVICE_STATE;
    var before=window.__l4.detailGroups;
    st.set('vacuum_tower',{visible:false},'phase06-test');
    var hidden=window.__l4.detailGroups;
    st.set('vacuum_tower',{visible:true},'phase06-test');
    var restored=window.__l4.detailGroups;
    return {
      bindings:window.__l4.detailBindings,
      reps:{atm:st.get('atmospheric_tower').representations,vac:st.get('vacuum_tower').representations,heater:st.get('heater').representations},
      before:before, hidden:hidden, restored:restored,
      isolated:before.atmospheric_tower.uuid!==before.vacuum_tower.uuid && before.vacuum_tower.uuid!==before.heater.uuid,
      vacuumHiddenWorks:hidden.vacuum_tower.visible===false && hidden.atmospheric_tower.visible===true && hidden.heater.visible===true,
      restoredOk:restored.vacuum_tower.visible===true
    };
  })()`);

  const guide = await evalPage(`({demo:!!document.querySelector('.lvl.on .lvl__demo'), levelId:document.querySelector('.lvl.on').dataset.levelId, title:document.querySelector('.lvl.on .lvl__bar b').textContent})`);

  // P1 regression: empty external actions must become observable, not silent no-ops.
  const trayFromExternal = await evalPage(`(function(){document.querySelector('#l4-tray').click();return {level:window.__l4.level,ctx:JSON.parse(JSON.stringify(window.__sceneContext))};})()`);
  await evalPage(`document.querySelector('#l4-reset').click()`);
  const replayFromExternal = await evalPage(`(function(){document.querySelector('#l4-replay').click();return {level:window.__l4.level,flow:window.__l4.flowOn,ctx:JSON.parse(JSON.stringify(window.__sceneContext))};})()`);
  await evalPage(`document.querySelector('#l4-reset').click()`);
  const hotspot = await evalPage(`(function(){var p=window.__l4.hotspotPoint('vacuum');var c=window.__stage.renderer.domElement;c.dispatchEvent(new MouseEvent('click',{clientX:p.x,clientY:p.y,bubbles:true}));return {count:window.__l4.groups.hotspots,point:p,ctx:JSON.parse(JSON.stringify(window.__sceneContext))};})()`);

  await evalPage(`document.querySelector('[data-level="1"]').click()`);
  await sleep(1100);
  await shot('phase06-02-refining-half.png');
  const half = await evalPage(`({level:window.__l4.level,groups:window.__l4.groups,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),state:window.PETRO_DEVICE_STATE.get('atmospheric_tower')})`);

  await evalPage(`document.querySelector('[data-level="2"]').click(); document.querySelector('#l4-flow').click(); document.querySelector('#l4-feed-atm').click(); document.querySelector('#l4-tray').click()`);
  const fractions = await evalPage(`(function(){var keys=['topgas','naphtha','kerosene','diesel','residue'];var out=[];keys.forEach(function(k){var b=document.querySelector('[data-fraction="'+k+'"]');if(b)b.click();out.push({key:k,selected:window.__l4.selectedFraction,note:document.querySelector('#l4-note').textContent});});return out;})()`);
  await sleep(700);
  await shot('phase06-06-residue-bottom.png');
  const residue = await evalPage(`({selected:window.__l4.selectedFraction,target:window.__l4.fractionTarget('residue'),info:window.__l4.fractionInfo('residue'),note:document.querySelector('#l4-note').textContent,hint:document.querySelector('#l4-hint').textContent,ctx:JSON.parse(JSON.stringify(window.__sceneContext))})`);
  await evalPage(`document.querySelector('[data-fraction="diesel"]').click()`);
  await sleep(1200);
  await shot('phase06-03-refining-full.png');
  const full = await evalPage(`({level:window.__l4.level,flow:window.__l4.flowOn,paused:window.__l4.flowPaused,fraction:window.__l4.selectedFraction,note:document.querySelector('#l4-note').textContent,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),state:window.PETRO_DEVICE_STATE.get('atmospheric_tower')})`);

  await evalPage(`document.querySelector('#l4-flow').click()`);
  await sleep(400);
  const paused = await evalPage(`({flow:window.__l4.flowOn,paused:window.__l4.flowPaused,button:document.querySelector('#l4-flow').textContent})`);
  await evalPage(`document.querySelector('#l4-replay').click()`);
  await sleep(500);
  const replay = await evalPage(`({flow:window.__l4.flowOn,paused:window.__l4.flowPaused})`);
  await evalPage(`document.querySelector('#l4-reset').click()`);
  await sleep(900);
  await shot('phase06-04-refining-restored.png');
  const reset = await evalPage(`({level:window.__l4.level,flow:window.__l4.flowOn,fraction:window.__l4.selectedFraction,state:window.PETRO_DEVICE_STATE.get('atmospheric_tower')})`);

  await evalPage(`window.__l4.exit(); window.__l4.exit()`);
  await sleep(1900);
  await shot('phase06-05-back-overview.png');
  const exit = await evalPage(`({level:window.__stage.isLevel(),isolated:window.__l4.isolated,groupVisible:window.__levelGroups&&window.__levelGroups[3]?window.__levelGroups[3].visible:null,ctx:JSON.parse(JSON.stringify(window.__sceneContext)),errors:(window.__auditErrors||[]).map(e=>e.message||String(e))})`);
  await evalPage(`window.__l4.enter()`);
  await sleep(1100);
  const reentry = await evalPage(`({level:window.__stage.isLevel(),level4:window.__l4.level,isolated:window.__l4.isolated,groupVisible:window.__levelGroups&&window.__levelGroups[3]?window.__levelGroups[3].visible:null,bindings:window.__l4.detailBindings,errors:(window.__auditErrors||[]).map(e=>e.message||String(e))})`);
  await evalPage(`window.__l4.exit()`);
  await sleep(1900);
  const exit2 = await evalPage(`({level:window.__stage.isLevel(),isolated:window.__l4.isolated,errors:(window.__auditErrors||[]).map(e=>e.message||String(e))})`);

  // 异步加载竞态：进入后立刻退出，待加载完成，再进入时应补齐三个 detail 绑定。
  const raceUrl = URL.split('#')[0] + '&race=' + Date.now() + '#stage=3';
  await send('Page.navigate', { url: raceUrl });
  await sleep(350);
  const race = await evalPage(`(async()=>{
    for(var i=0;i<30 && !window.__l4;i++) await new Promise(r=>setTimeout(r,100));
    if(!window.__l4) return {error:'l4 not ready'};
    window.__l4.enter(); window.__l4.exit();
    for(var j=0;j<90 && !window.__l4.loaded;j++) await new Promise(r=>setTimeout(r,100));
    await new Promise(r=>setTimeout(r,300));
    window.__l4.enter();
    await new Promise(r=>setTimeout(r,700));
    return {loaded:window.__l4.loaded,bindings:window.__l4.detailBindings,groups:window.__l4.detailGroups,level:window.__stage.isLevel()};
  })()`);

  const result = {
    date: '2026-11-23', page: URL, viewport: '1440x900',
    external, detailIsolation, guide, trayFromExternal, replayFromExternal, hotspot, half, full, fractions, residue, paused, replay, reset, exit, reentry, exit2, race,
    screenshots: [
      'phase06-01-refining-external.png', 'phase06-02-refining-half.png',
      'phase06-03-refining-full.png', 'phase06-06-residue-bottom.png', 'phase06-04-refining-restored.png',
      'phase06-05-back-overview.png'
    ]
  };
  fs.writeFileSync(path.join(OUT, 'phase06-verify.json'), JSON.stringify(result, null, 2));
  console.log('RESULT', JSON.stringify(result, null, 2));
  ws.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

