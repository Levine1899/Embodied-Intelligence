/* Phase 07 real-browser verification: tour state machine + mission state machine.
 * Usage: node tools/phase07-verify.cjs
 * CDP_PORT defaults to 4344 (ego Chrome dynamic port). Local server default :8796.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.CDP_PORT || 4344);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8796';
const OUT = path.resolve(__dirname, '..', 'docs', 'phase-reports', 'evidence', 'phase-07');
const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
  if (!ok) console.error('FAIL', name, detail || '');
  else console.log('PASS', name);
}
function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => resolve(JSON.parse(d))); }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const list = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page' && /sandbox\.html/.test(t.url)) || list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    id += 1; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  await new Promise((resolve) => { ws.onopen = resolve; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
    return r.result && r.result.value;
  }
  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  }
  async function click(sel) {
    return ev(`(()=>{var el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;el.click();return true})()`);
  }
  async function pointer(sel) {
    const r = await ev(`(()=>{var el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;var b=el.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,h:b.height,vis:getComputedStyle(el).display!=='none'&&b.width>0&&b.height>0}})()`);
    if (!r || !r.vis) return false;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return true;
  }

  await send('Page.navigate', { url: `${BASE}/sandbox.html?rev=phase07-verify-${Date.now()}` });
  await WAIT(3200);
  await ev(`localStorage.removeItem('kepu.mission.v1');localStorage.removeItem('kepu.journey.v1');location.reload();true`);
  await WAIT(3800);

  const boot = await ev(`({tour:!!window.__tour,mission:!!window.__mission,steps:window.__tour&&window.__tour.steps.length,mdefs:window.__mission&&window.__mission.definitions.length,audio:!!document.querySelector('#audio-toggle'),archiveBtn:!!document.querySelector('#journey-archive-open'),errors:window.__auditErrors||[]})`);
  assert('tour API present', boot.tour);
  assert('mission API present', boot.mission);
  assert('tour has 10 steps', boot.steps === 10, boot.steps);
  assert('mission has 5 steps', boot.mdefs === 5, boot.mdefs);
  assert('audio control present', boot.audio);
  assert('archive entry present', boot.archiveBtn);
  assert('no boot errors', Array.isArray(boot.errors) && boot.errors.length === 0, boot.errors);
  await shot('phase07-01-overview.png');

  // ---------- Tour ----------
  await click('.modebar [data-mode="tour"]');
  await WAIT(1400);
  let t = await ev(`window.__tour.state`);
  assert('tour starts at step 0', t.active && t.index === 0 && t.stepId === 'tour_overview', t);
  await shot('phase07-02-tour-overview.png');

  const expected = [
    [1, 'tour_underground', 'l1'],
    [2, 'tour_reservoir', 'l1'],
    [3, 'tour_wellhead', 'l1'],
    [4, 'tour_separator', 'l2'],
    [5, 'tour_storage', 'l3'],
    [6, 'tour_refining', 'l4'],
    [7, 'tour_fractions', 'l4'],
    [8, 'tour_products', 'l5'],
    [9, 'tour_summary', null]
  ];
  for (const [index, stepId, level] of expected) {
    const clicked = await click('#tour-next');
    assert(`tour next to ${index} clicked`, clicked);
    await WAIT(index === 9 ? 6200 : 4800);
    t = await ev(`({state:window.__tour.state,levelId:window.__sceneContext.levelId,level:window.__stage.isLevel(),l1:window.__l1?{res:window.__l1.selected,pressure:window.__l1.pressure}:null,l2:window.__l2?{struct:window.__l2.structMode,running:window.__l2.running}:null,l3:window.__l3?{level:window.__l3.level,pump:window.__l3.pumpRunning}:null,l4:window.__l4?{level:window.__l4.level,flow:window.__l4.flowOn,fraction:window.__l4.selectedFraction}:null,l5:window.__l5?{picked:window.__l5.picked}:null,archive:!!document.querySelector('#journey-archive')&&!document.querySelector('#journey-archive').hidden})`);
    assert(`tour ${index} ${stepId}`, t.state.active && t.state.index === index && t.state.stepId === stepId, t.state);
    if (level) assert(`tour ${index} in ${level}`, t.level && t.levelId === level, { level: t.level, levelId: t.levelId });
    if (index === 1) { assert('tour underground reservoir dynamic', !!(t.l1 && t.l1.res), t.l1); await shot('phase07-03-tour-underground.png'); }
    if (index === 2) { assert('tour wellhead dynamic', !!(t.l1 && t.l1.res === 'wellhead'), t.l1); }
    if (index === 4) {
      assert('tour separator dynamic', !!(t.l2 && t.l2.struct && t.l2.running), t.l2);
      await click('#tour-pause'); await WAIT(450);
      const p = await ev(`({running:window.__l2.running,cls:document.body.classList.contains('journey-paused'),act:getComputedStyle(document.querySelector('#l2-act')).display})`);
      assert('tour l2 pause stops separation and shows controls', p.running === false && p.cls && p.act !== 'none', p);
      await click('#tour-pause'); await WAIT(700);
      const r = await ev(`({running:window.__l2.running,playing:window.__tour.state.playing})`);
      assert('tour l2 resume restarts separation', r.running === true && r.playing === true, r);
      await shot('phase07-04-tour-separator.png');
    }
    if (index === 5) {
      assert('tour storage dynamic', !!(t.l3 && t.l3.pump && t.l3.level >= 0.7), t.l3);
      await click('#tour-pause'); await WAIT(450);
      const p = await ev(`({running:window.__l3.pumpRunning,cls:document.body.classList.contains('journey-paused')})`);
      assert('tour l3 pause stops pump', p.running === false && p.cls, p);
      await click('#tour-pause'); await WAIT(700);
      const r = await ev(`({running:window.__l3.pumpRunning,playing:window.__tour.state.playing})`);
      assert('tour l3 resume restarts pump', r.running === true && r.playing === true, r);
      await shot('phase07-05-tour-storage.png');
    }
    if (index === 6) {
      assert('tour refining dynamic', !!(t.l4 && t.l4.level === 2 && t.l4.flow), t.l4);
      await click('#tour-pause'); await WAIT(450);
      const p = await ev(`({flow:window.__l4.flowOn,paused:window.__l4.flowPaused,cls:document.body.classList.contains('journey-paused')})`);
      assert('tour l4 pause stops flow', p.flow === true && p.paused === true && p.cls, p);
      await click('#tour-pause'); await WAIT(700);
      const r = await ev(`({flow:window.__l4.flowOn,paused:window.__l4.flowPaused,playing:window.__tour.state.playing})`);
      assert('tour l4 resume restarts flow', r.flow === true && r.paused === false && r.playing === true, r);
      await shot('phase07-06-tour-refining.png');
    }
    if (index === 8) { assert('tour products selected', !!(t.l5 && t.l5.picked && t.l5.picked.length >= 1), t.l5); await shot('phase07-07-tour-products.png'); }
    if (index === 9) {
      assert('tour summary archive open', !!t.archive);
      await shot('phase07-08-tour-archive.png');
    }
  }
  await click('#archive-close');
  await WAIT(300);

  // pause + exit
  await ev(`window.__tour.start()`);
  await WAIT(1200);
  await click('#tour-next');
  await WAIT(4200);
  await click('#tour-pause');
  await WAIT(300);
  const paused = await ev(`({state:window.__tour.state,level:window.__stage.isLevel()})`);
  assert('tour pause keeps level and stops playing', paused.level && paused.state.playing === false, paused);
  await click('#tour-pause');
  await WAIT(200);
  const resumed = await ev(`window.__tour.state`);
  assert('tour resume', resumed.playing === true, resumed);
  await click('#tour-exit');
  await WAIT(2500);
  const exited = await ev(`({state:window.__tour.state,level:window.__stage.isLevel(),mode:window.__stage.getMode(),cardHidden:document.querySelector('#tour-card').hidden})`);
  assert('tour exit clears level and card', !exited.level && exited.cardHidden && exited.mode === 'free', exited);

  // ---------- Mission ----------
  await click('.modebar [data-mode="task"]');
  await WAIT(500);
  const brief = await ev(`({hidden:document.querySelector('#mission-brief').hidden,state:window.__mission.state.status})`);
  assert('mission brief opens', brief.hidden === false && brief.state === 'idle', brief);
  await shot('phase07-09-mission-brief.png');
  await click('#mission-begin');
  await WAIT(5000);
  let m = await ev(`({state:window.__mission.state,level:window.__sceneContext.levelId,cardHidden:document.querySelector('#mission-card').hidden})`);
  assert('mission M1 level active', m.level === 'l1' && m.state.status === 'active', m);
  await shot('phase07-10-mission-active.png');
  await ev(`window.__l1.selectReservoir()`);
  await WAIT(3200);
  m = await ev(`window.__mission.state`);
  assert('mission M1 complete by real operations', m.steps[0].done && m.step === 1, m);
  await click('#mission-enter');
  await WAIT(4800);
  m = await ev(`({state:window.__mission.state,level:window.__sceneContext.levelId})`);
  assert('mission M2 level active', m.level === 'l2' && m.state.step === 1, m);

  // deliberate failure + hint
  await ev(`window.__l2.applyStructure(true,false);window.__l2.startSeparation();`);
  await WAIT(700);
  const started2 = await ev(`window.__l2.running`);
  assert('mission M2 separation started', started2 === true, started2);
  await ev(`window.__l2.pickOutlet('gas');window.__l2.assignTank('oil');`);
  await WAIT(500);
  await WAIT(1500);
  m = await ev(`({state:window.__mission.state,feedback:document.querySelector('#mission-feedback').textContent,cls:document.querySelector('#mission-feedback').className})`);
  assert('mission records wrong destination error', m.state.errors.length >= 1 && /is-error/.test(m.cls), m);
  await shot('phase07-11-mission-error.png');
  await click('#mission-hint');
  await WAIT(300);
  m = await ev(`({hint:window.__mission.state.lastHint,feedback:document.querySelector('#mission-feedback').textContent,cls:document.querySelector('#mission-feedback').className})`);
  assert('mission hint visible', !!m.hint && /is-note/.test(m.cls), m);
  await shot('phase07-12-mission-hint.png');

  // pause/resume
  await click('#mission-pause');
  await WAIT(300);
  m = await ev(`({status:window.__mission.state.status,text:document.querySelector('#mission-enter').textContent})`);
  assert('mission pause', m.status === 'paused' && /继续/.test(m.text), m);
  await click('#mission-pause');
  await WAIT(400);
  m = await ev(`window.__mission.state.status`);
  assert('mission resume', m === 'active', m);

  // complete three outlets with correct targets, pointer-level
  for (const key of ['gas', 'oil', 'water']) {
    await pointer(`[data-outlet="${key}"]`);
    await WAIT(250);
    await pointer(`[data-target="${key}"]`);
    await WAIT(2300);
  }
  m = await ev(`({state:window.__mission.state,solved:window.__l2.solved})`);
  assert('mission M2 complete after three correct outlets', m.state.steps[1].done && m.state.step === 2, m);
  assert('mission clears stale error after M2', (m.state.errors || []).length === 0 && (m.state.errorHistory || []).length >= 1, m.state);
  await click('#mission-enter');
  await WAIT(4800);
  m = await ev(`({state:window.__mission.state,level:window.__sceneContext.levelId})`);
  assert('mission M3 level active', m.level === 'l3' && m.state.step === 2, m);

  await ev(`window.__l3.selectTank('floating_roof_tank');window.__l3.setLevel(75);`);
  await WAIT(500);
  await ev(`window.__l3.setLevel(0);`);
  await WAIT(500);
  await pointer('#l3-pumpstart');
  await WAIT(900);
  m = await ev(`({state:window.__mission.state,level:window.__l3.level})`);
  assert('mission M3 does not complete after level drops', m.state.steps[2].done === false && m.level < 70, m);
  await ev(`window.__l3.setLevel(75);`);
  await WAIT(900);
  m = await ev(`window.__mission.state`);
  assert('mission M3 completes at current level >=70', m.steps[2].done && m.step === 3, m);
  await click('#mission-enter');
  await WAIT(4800);
  m = await ev(`({state:window.__mission.state,level:window.__sceneContext.levelId})`);
  assert('mission M4 level active', m.level === 'l4' && m.state.step === 3, m);

  await pointer('[data-level="2"]');
  await pointer('[data-fraction="diesel"]');
  await WAIT(1200);
  m = await ev(`window.__mission.state`);
  assert('mission M4 complete', m.steps[3].done && m.step === 4, m);
  await click('#mission-enter');
  await WAIT(4800);
  m = await ev(`({state:window.__mission.state,level:window.__sceneContext.levelId})`);
  assert('mission M5 level active', m.level === 'l5' && m.state.step === 4, m);
  const picked0 = await ev(`window.__l5.picked||[]`);
  if (picked0.length) {
    await ev(`window.__l5.toggle(${picked0[0]})`);
    await WAIT(700);
    m = await ev(`window.__mission.state`);
    assert('mission M5 deselect does not complete', m.steps[4].done === false, m);
  }
  const productIndex = await ev(`(()=>{var p=window.__l5.picked||[];for(var i=0;i<6;i++){if(p.indexOf(i)<0)return i}return 0})()`);
  await ev(`window.__l5.select(${productIndex})`);
  await WAIT(1100);
  m = await ev(`({state:window.__mission.state,done:!document.querySelector('#mission-done').hidden})`);
  assert('mission complete by product selection', m.state.status === 'complete' && m.done, m);
  await shot('phase07-13-mission-done.png');
  await click('#mission-archive');
  await WAIT(500);
  const arch = await ev(`({open:!document.querySelector('#journey-archive').hidden,title:document.querySelector('#archive-title').textContent})`);
  assert('mission archive opens', arch.open && !!arch.title, arch);
  await shot('phase07-14-mission-archive.png');
  await click('#archive-close');
  await WAIT(300);
  await ev(`window.__mission.exit()`);
  await WAIT(2400);

  // reset mission
  await click('.modebar [data-mode="task"]');
  await WAIT(400);
  await ev(`window.confirm=()=>true;document.querySelector('#mission-reset').click();`);
  await WAIT(2300);
  m = await ev(`({state:window.__mission.state,card:document.querySelector('#mission-card').hidden,level:window.__stage.isLevel(),mode:window.__stage.getMode()})`);
  assert('mission reset', m.state.status === 'idle' && !m.level && m.mode === 'free', m);

  // audio
  await click('#audio-toggle');
  await WAIT(400);
  const audioOn = await ev(`window.Ambient.state()`);
  assert('audio opt-in works', audioOn.on === true, audioOn);
  await click('#audio-toggle');
  await WAIT(300);
  const audioOff = await ev(`window.Ambient.state()`);
  assert('audio mute works', audioOff.on === false, audioOff);

  const voice = await ev(`({supported:!!(window.Voice&&window.Voice.supported),api:!!window.Voice,play:!!document.querySelector('#voice-play'),stop:!!document.querySelector('#voice-stop'),text:(document.querySelector('#tour-card')?.hidden?false:true)})`);
  assert('optional narration controls present', voice.api && voice.play && voice.stop, voice);
  if (voice.supported) {
    await ev(`window.Voice.setText('石油产业链数字沙盘，测试朗读。')`);
    await click('#voice-play'); await WAIT(250);
    const v1 = await ev(`window.Voice.state()`);
    const v2 = await ev(`(()=>{document.querySelector('#voice-stop').click();return window.Voice.state()})()`);
    assert('narration play/pause/stop API', v1.playing === true && v2.playing === false, { v1, v2 });
  }

  // archive/review record
  await click('#journey-archive-open');
  await WAIT(400);
  const record = await ev(`({open:!document.querySelector('#journey-archive').hidden,cols:document.querySelector('#archive-cols').textContent})`);
  assert('journey record accessible', record.open && record.cols.length > 0, record);
  await shot('phase07-15-journey-archive.png');

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const report = { generatedAt: new Date().toISOString(), base: BASE, passed, failed, results };
  fs.writeFileSync(path.join(OUT, 'phase07-verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed, failed, screenshots: fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length }, null, 2));
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
