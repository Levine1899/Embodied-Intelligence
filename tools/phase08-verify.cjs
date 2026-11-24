const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = Number(process.env.CDP_PORT || 4344);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8796';
const OUT = path.resolve(__dirname, '..', 'docs', 'phase-reports', 'evidence', 'phase-08');
const WAIT = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
  if (!ok) console.error('FAIL', name, detail || '');
  else console.log('PASS', name);
}
function getJson(url) {
  return new Promise((resolve, reject) => http.get(url, r => { let d=''; r.on('data', c => d+=c); r.on('end', () => resolve(JSON.parse(d))); }).on('error', reject));
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const list = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find(t => t.type === 'page' && /sandbox\.html|write\.html/.test(t.url)) || list.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const send = (method, params) => new Promise((resolve, reject) => { id += 1; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  await new Promise(resolve => { ws.onopen = resolve; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
    return r.result && r.result.value;
  }
  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  }
  async function nav(url) { send('Page.navigate', { url }).catch(function () {}); await WAIT(1800); }

  await nav(`${BASE}/sandbox.html?rev=phase08-verify-${Date.now()}`);
  await WAIT(1000);
  const boot = await ev(`({scene:!!window.SceneContext,actions:!!window.AIActions,leadai:!!window.__leadai,ctx:window.SceneContext&&window.SceneContext.get(),errors:window.__auditErrors||[]})`);
  assert('scene context loads', boot.scene);
  assert('AI action whitelist loads', boot.actions);
  assert('AI panel present', boot.leadai);
  assert('context has sceneId', boot.ctx && boot.ctx.sceneId === 'oil_industry_journey', boot.ctx);
  assert('no boot errors', (boot.errors || []).length === 0, boot.errors);

  const toolbar = await ev(`({voice:window.Voice&&window.Voice.state(),more:!!document.querySelector('#more-btn'),sound:!!document.querySelector('#sound'),audio:document.querySelector('#audio-toggle')&&document.querySelector('#audio-toggle').textContent,stopDisabled:(document.querySelector('#voice-stop')||{}).disabled})`);
  assert('read control has current narration text', toolbar.voice && toolbar.voice.text && toolbar.voice.text.length > 10, toolbar.voice);
  assert('duplicate sound menu removed', toolbar.more === false && toolbar.sound === false && !!toolbar.audio, toolbar);
  assert('stop read starts disabled', toolbar.stopDisabled === true, toolbar.stopDisabled);

  // The three mode cards are merged into one visible tour CTA; legacy hooks stay hidden.
  const merged = await ev(`({modebar:document.querySelector('.modebar'),modebarHidden:document.querySelector('.modebar').hidden,modebarDisplay:getComputedStyle(document.querySelector('.modebar')).display,cta:document.querySelector('#tour-cta'),ctaRect:(function(){var b=document.querySelector('#tour-cta').getBoundingClientRect();return {w:b.width,h:b.height};})(),stagesTop:document.querySelector('.stage-navigation').getBoundingClientRect().top})`);
  assert('three mode cards removed from visible UI', merged.modebarHidden === true && merged.modebarDisplay === 'none' && merged.cta && merged.ctaRect.w > 0, merged);
  assert('single tour CTA replaces mode row', merged.ctaRect.h > 0 && merged.stagesTop > 0, merged);
  await shot('phase08-00-merged-ui.png');

  await ev(`document.querySelector('#tour-cta').click();true`);
  await WAIT(650);
  const tourState = await ev(`({tour:window.__tour&&window.__tour.state,card:(function(){var e=document.querySelector('#tour-card');return e?{hidden:e.hidden,text:e.innerText.slice(0,60)}:null;})()})`);
  assert('single CTA starts guided tour', tourState.tour && tourState.tour.active === true, tourState);
  await ev(`document.querySelector('#tour-exit').click();true`);
  await WAIT(350);
  const tourStopped = await ev(`window.__tour.state`);
  assert('tour exits back to free exploration', tourStopped && tourStopped.active === false, tourStopped);

  // Task is now an optional right-rail utility, not a mode card.
  await ev(`document.querySelector('.rail-btn[data-rail="task"]').click();true`);
  await WAIT(450);
  const taskRail = await ev(`({rail:document.querySelector('.layout').classList.contains('rail-open'),side:getComputedStyle(document.querySelector('.side__body')).display,mission:!!window.__mission})`);
  assert('task rail opens without mode card', taskRail.rail === true && taskRail.side === 'block' && taskRail.mission === true, taskRail);
  await ev(`(window.__mission&&window.__mission.exit&&window.__mission.exit());var c=document.querySelector('#rail-close');if(c)c.click();true`);
  await WAIT(300);

  // First level: annotations/footer removed; V3-style extraction animation is live.
  await ev(`window.__stage.selectStage(0,true);window.__stage.levelHook(0)();true`);
  await WAIT(500);
  const l1 = await ev(`({extraction:window.__l1&&window.__l1.extraction,last:window.__l1&&window.__l1.lastInteraction,hidden:{info:document.querySelector('#l1-info').hidden,act:document.querySelector('#l1-act').hidden,readout:document.querySelector('#l1-readout').hidden,up:document.querySelector('#l1-up').hidden,play:document.querySelector('#l1-play').hidden,foot:document.querySelector('.foot').hidden},slider:(function(){var e=document.querySelector('#l1-press');return e?{hidden:e.hidden,rect:e.getBoundingClientRect().toJSON()}:null})()})`);
  assert('l1 annotations and pause controls removed', l1.hidden.info && l1.hidden.readout && l1.hidden.up && l1.hidden.play && l1.hidden.foot, l1);
  assert('l1 original pressure slider is visible', l1.hidden.act === false && l1.slider && l1.slider.hidden === false && l1.slider.rect.width > 0, l1.slider);
  await ev(`window.__l1.setPressure(60);true`);
  await WAIT(650);
  const l1Started = await ev(`window.__l1.extraction`);
  assert('l1 extraction animation is live', l1Started && l1Started.wellFlow && l1Started.inflows >= 2 && l1Started.pulse && l1Started.started && l1Started.marked, l1Started);
  const flowA = await ev(`Array.from(window.__stage.baseScene.getObjectByName('wellbore_flow_particles').children).map(function(c){return c.position.y})`);
  await WAIT(500);
  const flowB = await ev(`Array.from(window.__stage.baseScene.getObjectByName('wellbore_flow_particles').children).map(function(c){return c.position.y})`);
  assert('l1 extraction particles move upward', flowA.some(function(v,i){return Math.abs(v-flowB[i])>0.001;}), {a:flowA.slice(0,3),b:flowB.slice(0,3)});
  await shot('phase08-00b-l1-extraction.png');
  await ev(`window.__l1.exit();true`);
  await WAIT(500);

  await ev(`window.__stage.selectStage(1,true);window.__stage.levelHook(1)();true`);
  await WAIT(1200);
  let c = await ev(`window.SceneContext.get()`);
  assert('level entry sets l2', c.levelId === 'l2' && c.stageId === 'gather', c);
  assert('level entry selects separator', c.selectedObjectId === 'three_phase_separator', c);
  assert('knowledge ids from registry', Array.isArray(c.knowledgeIds) && c.knowledgeIds.indexOf('kb_gather') >= 0, c.knowledgeIds);
  await shot('phase08-01-context-separator.png');

  // The device card entry must open the rail; otherwise #leadai-q is 0x0.
  await ev(`window.__stage.showDevice('three_phase_separator');document.querySelector('#device-ask').click();true`);
  await WAIT(450);
  const entry = await ev(`({rail:document.querySelector('.layout').classList.contains('rail-open'),display:getComputedStyle(document.querySelector('.side__body')).display,rect:(function(){var e=document.querySelector('#leadai-q');if(!e)return null;var b=e.getBoundingClientRect();return {w:b.width,h:b.height};})(),value:document.querySelector('#leadai-q')&&document.querySelector('#leadai-q').value})`);
  assert('device ask opens AI rail', entry.rail === true && entry.display === 'block', entry);
  assert('device ask focuses visible input', entry.rect && entry.rect.w > 0 && entry.rect.h > 0 && !!entry.value, entry);

  // AI context request: stub successful /api/ask and inspect the exact request.
  await ev(`window.SceneContext.recordInteraction('inspect_separator_structure','half','示意','correct');window.__origFetch=window.fetch;window.fetch=function(url,opts){if(String(url).indexOf('/api/ask')>=0){window.__lastAsk=JSON.parse(opts.body);return Promise.resolve(new Response(JSON.stringify({text:'模型补充示例'}),{status:200,headers:{'Content-Type':'application/json'}}));}return window.__origFetch(url,opts);};true`);
  await ev(`window.__leadai.ask('这个设备的维护周期是多久')`);
  await WAIT(500);
  const ask = await ev(`({payload:window.__lastAsk,log:document.querySelector('#leadai-log').innerText})`);
  assert('AI request keeps question/ctx/tier/mode', ask.payload && ask.payload.question && Array.isArray(ask.payload.ctx) && ask.payload.tier && ask.payload.mode, ask.payload);
  assert('AI context includes selected device', ask.payload && ask.payload.ctx.some(x => x.indexOf('三相分离器') >= 0), ask.payload && ask.payload.ctx);
  assert('AI context includes recent interaction', ask.payload && ask.payload.ctx.some(x => x.indexOf('inspect_separator_structure') >= 0), ask.payload && ask.payload.ctx);
  assert('AI context labels verified local facts', ask.payload && ask.payload.ctx.some(x => x.indexOf('已核验要点') >= 0), ask.payload && ask.payload.ctx);
  await shot('phase08-02-ai-context.png');

  // No-proxy fallback: local KB answers without /api/ask.
  await ev(`window.fetch=function(url,opts){if(String(url).indexOf('/api/ask')>=0)return Promise.reject(new Error('offline'));return window.__origFetch(url,opts);};true`);
  await ev(`window.__leadai.ask('为什么油藏在石头里')`);
  await WAIT(350);
  const fallback = await ev(`document.querySelector('#leadai-log').innerText`);
  assert('no-proxy AI still answers local knowledge', /岩石孔隙|油藏/.test(fallback), fallback.slice(-240));
  await shot('phase08-03-no-proxy-local.png');

  // Action boundaries.
  c = await ev(`window.SceneContext.get()`);
  let legal = await ev(`window.AIActions.execute({actionId:'start_separation'},{expectedRevision:window.SceneContext.revision()})`);
  assert('legal AI action accepted', legal && legal.ok === true, legal);
  assert('legal action changed separation', !!(await ev(`window.__l2.running`)));
  const missing = await ev(`(function(){var before=window.SceneContext.get();var r=window.AIActions.execute({actionId:'select_object',args:{objectId:'not_a_real_device'}},{expectedRevision:window.SceneContext.revision()});return {r:r,after:window.SceneContext.get(),same:before.revision===window.SceneContext.revision()}})()`);
  assert('missing object rejected', missing.r && missing.r.ok === false && missing.r.reason === 'OBJECT_NOT_FOUND', missing.r);
  assert('missing object keeps context', missing.same === true, missing);
  const mismatch = await ev(`(function(){window.SceneContext.setLevel('l3');var before=window.SceneContext.get();var r=window.AIActions.execute({actionId:'start_separation'},{expectedRevision:window.SceneContext.revision()});return {r:r,after:window.SceneContext.get(),same:before.revision===window.SceneContext.revision()}})()`);
  assert('scene mismatch rejected', mismatch.r && mismatch.r.ok === false && mismatch.r.reason === 'SCENE_MISMATCH', mismatch.r);
  assert('scene mismatch keeps current level', mismatch.after.levelId === 'l3' && mismatch.same === true, mismatch.after);
  const switched = await ev(`(function(){window.SceneContext.setLevel('l2');var rev=window.SceneContext.revision();var r=window.AIActions.execute({actionId:'select_object',args:{objectId:'three_phase_separator'}},{expectedRevision:rev,beforeApply:function(){window.SceneContext.setLevel('l3');}});return {r:r,after:window.SceneContext.get()}})()`);
  assert('scene switch during action rejected', switched.r && switched.r.ok === false && switched.r.reason === 'SCENE_CHANGED_DURING_ACTION', switched.r);
  assert('scene switch preserved user target', switched.after.levelId === 'l3' && switched.after.selectedObjectId === 'floating_roof_tank', switched.after);
  const unknown = await ev(`window.AIActions.execute({actionId:'delete_everything'})`);
  assert('unknown action rejected', unknown.ok === false && unknown.reason === 'NOT_ALLOWED', unknown);

  // Model -> action block -> user click, using a stubbed /api/ask response.
  await ev(`window.SceneContext.setLevel('l2');window.SceneContext.selectDevice('three_phase_separator');window.__origFetch=window.fetch;window.fetch=function(url,opts){if(String(url).indexOf('/api/ask')>=0){window.__lastAsk=JSON.parse(opts.body);return Promise.resolve(new Response(JSON.stringify({text:'建议清空当前选择'+String.fromCharCode(10,96,96,96)+'action'+String.fromCharCode(10)+'{"actionId":"clear_selection"}'+String.fromCharCode(10,96,96,96)}),{status:200,headers:{'Content-Type':'application/json'}}));}return window.__origFetch(url,opts);};window.__leadai.ask('请给下一步操作建议',{actionMode:true});true`);
  await WAIT(650);
  const actionUi = await ev(`({payload:window.__lastAsk,buttons:Array.from(document.querySelectorAll('.lm-act')).map(function(b){return b.textContent}),hasAction:!!Array.from(document.querySelectorAll('.lm-act')).find(function(b){return b.textContent.indexOf('执行建议动作')>=0;})})`);
  assert('action mode sends action flag', actionUi.payload && actionUi.payload.action === true, actionUi.payload);
  assert('model action block renders execute button', actionUi.hasAction === true, actionUi);
  await ev(`Array.from(document.querySelectorAll('.lm-act')).find(function(b){return b.textContent.indexOf('执行建议动作')>=0;}).click();true`);
  await WAIT(250);
  const afterAction = await ev(`window.SceneContext.get()`);
  assert('model action executes only after click', afterAction.selectedObjectId === null, afterAction);
  await shot('phase08-02b-action-suggestion.png');

  // Exit clears old device selection.
  await ev(`window.SceneContext.setLevel('l2');window.SceneContext.selectDevice('three_phase_separator');window.SceneContext.exitLevel();true`);
  c = await ev(`window.SceneContext.get()`);
  assert('exit clears level and selection', c.levelId === null && c.selectedObjectId === null, c);

  // Writing handoff is explicit and carries verified facts.
  await ev(`window.SceneContext.setLevel('l3');window.SceneContext.selectDevice('floating_roof_tank');window.SceneContext.recordInteraction('inspect_tank_structure','floating_roof_tank','示意','correct');window.SceneContext.handoff();true`);
  await nav(`${BASE}/write.html?from=scene&rev=phase08-verify`);
  await WAIT(700);
  const write = await ev(`({topic:document.querySelector('#topic').value,facts:document.querySelector('#facts').value,banner:document.querySelector('#scene-handoff')&&document.querySelector('#scene-handoff').innerText,errors:window.__auditErrors||[]})`);
  assert('writing handoff prefills device topic', /外浮顶储罐/.test(write.topic), write);
  assert('writing handoff carries verified facts', /浮盘|油气空间/.test(write.facts), write.facts);
  assert('writing handoff banner visible', /已带入当前场景/.test(write.banner || ''), write.banner);

  // The scene record must reach the Dify request, clearly separated from verified facts.
  await ev(`window.fetch=function(url,opts){if(String(url).indexOf('/api/dify-write')>=0){window.__lastWriteBody=JSON.parse(opts.body);return Promise.resolve(new Response(JSON.stringify({text:'模型稿（测试）'}),{status:200,headers:{'Content-Type':'application/json'}}));}throw new Error('offline');};document.querySelector('#go').click();true`);
  await WAIT(500);
  const writeBody = await ev(`window.__lastWriteBody`);
  assert('writing Dify request includes scene record', !!writeBody && /场景记录/.test(writeBody.facts || '') && /inspect_tank_structure/.test(writeBody.facts || ''), writeBody);
  assert('writing Dify request keeps facts separate', !!writeBody && /不是已核验事实/.test(writeBody.facts || ''), writeBody && writeBody.facts);

  // Direct write without explicit handoff must not inherit.
  await nav(`${BASE}/write.html?rev=phase08-direct`);
  await WAIT(600);
  const direct = await ev(`({banner:!!document.querySelector('#scene-handoff'),topic:document.querySelector('#topic').value})`);
  assert('direct writing does not inherit scene', direct.banner === false, direct);

  // No-proxy write fallback is clearly labeled.
  await ev(`window.fetch=function(){return Promise.reject(new Error('offline'));};document.querySelector('#topic').value='测试主题';document.querySelector('#facts').value='三相分离器按相态和密度差异分离，不是过滤。';document.querySelector('#go').click();true`);
  await WAIT(1200);
  const wf = await ev(`({out:document.querySelector('#out').innerText,meta:document.querySelector('#meta').innerText,note:document.querySelector('#revnote').innerText})`);
  assert('no-proxy write shows editable template', /预置模板/.test(wf.out), wf.out.slice(0,200));
  assert('no-proxy write does not claim model ran', /未连接模型/.test(wf.meta + wf.note), wf);

  const summary = { generatedAt: new Date().toISOString(), passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
  fs.writeFileSync(path.join(OUT, 'phase08-verify.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, out: OUT }));
  ws.close();
  if (summary.failed) process.exitCode = 1;
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
