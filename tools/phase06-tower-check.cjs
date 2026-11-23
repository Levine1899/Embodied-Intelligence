/* Phase 06 standalone tower compatibility/state check. */
const http=require('http'),fs=require('fs'),path=require('path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT=path.resolve(__dirname,'..','docs','phase-reports','evidence','phase-06');
function get(u){return new Promise((res,rej)=>http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej))}
(async()=>{
 const list=await get('http://127.0.0.1:9229/json/list'); const p=list.find(t=>t.type==='page');
 if(!p) throw new Error('no page'); const ws=new WebSocket(p.webSocketDebuggerUrl); let id=0,mp=new Map();
 ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.id&&mp.has(m.id)){let q=mp.get(m.id);mp.delete(m.id);m.error?q.reject(m.error):q.resolve(m.result)}};
 const send=(method,params)=>new Promise((res,rej)=>{id++;mp.set(id,{resolve:res,reject:rej});ws.send(JSON.stringify({id,method,params:params||{}}))});
 await new Promise(r=>ws.onopen=r); await send('Page.enable'); await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:8796/tower.html?rev=phase06state'}); await sleep(1800);
 const before=await send('Runtime.evaluate',{expression:"({tower:window.__towerState,store:window.PETRO_DEVICE_STATE&&window.PETRO_DEVICE_STATE.get('atmospheric_tower'),ctx:window.__sceneContext})",returnByValue:true});
 await send('Runtime.evaluate',{expression:"document.querySelector('#levels [data-level=\"2\"]').click();document.querySelector('#flow-toggle').click()",returnByValue:true}); await sleep(700);
 const after=await send('Runtime.evaluate',{expression:"({tower:window.__towerState,store:window.PETRO_DEVICE_STATE&&window.PETRO_DEVICE_STATE.get('atmospheric_tower'),ctx:window.__sceneContext,flow:document.querySelector('#flow-toggle').textContent,full:document.querySelector('#levels [data-level=\"2\"]').getAttribute('aria-pressed')})",returnByValue:true});
 const shot=await send('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(path.join(OUT,'tower-state-flow.png'),Buffer.from(shot.data,'base64'));
 fs.writeFileSync(path.join(OUT,'tower-state-flow.json'),JSON.stringify({before:before.result.value,after:after.result.value,screenshot:'tower-state-flow.png'},null,2));
 console.log(JSON.stringify({before:before.result.value,after:after.result.value},null,2)); ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
