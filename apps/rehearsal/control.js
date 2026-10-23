import {SCENES,REGIONS,sceneView,emptyRehearsal,alertPreview} from '../../packages/shared/src/rehearsal.js';
import {CHANNEL_IDS,CHANNELS} from '../../packages/shared/src/layout.js';
import {pressureField} from '../../packages/shared/src/sensor.js';

const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search),role=['worker','admin'].includes(params.get('view'))?params.get('view'):'control';
const supplied=new URLSearchParams(location.hash.slice(1)).get('key');
let token=supplied||sessionStorage.getItem('seat-rehearsal:'+role)||'';
if(supplied){sessionStorage.setItem('seat-rehearsal:'+role,supplied);history.replaceState(null,'',location.pathname+location.search);}
let state=emptyRehearsal(),online=false,pending=false,polling=false,generation=0,painted='',lastReceipt=0,lastSuccess=0,pollTimer;
let serverOffset=0,formReady=false;
const links={};
let noticeTimer;
const tell=text=>{clearTimeout(noticeTimer);$('#notice').textContent=text;noticeTimer=setTimeout(()=>{$('#notice').textContent='';},5000);};
const stamp=at=>at?new Date(at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
function map(id){return `<div class="pressure-map"><div class="orientation">앞 · 무릎</div><div class="map-row"><span>왼쪽</span><div class="seat"><canvas id="${id}" width="240" height="360" role="img" aria-label="착석자 기준 시연 압력 지도"></canvas>${CHANNEL_IDS.map(k=>`<span class="point" style="left:${CHANNELS[k].x*100}%;top:${CHANNELS[k].y*100}%">${k}</span>`).join('')}</div><span>오른쪽</span></div><div class="orientation">뒤 · 등받이</div><div class="legend"><span>낮음</span><i></i><span>높음</span></div></div>`;}
function shell(){
 formReady=false;
 document.body.dataset.view=role;
 if(!token){$('#main').innerHTML=`<section class="gate"><p class="eyebrow">SEAT CARE REHEARSAL</p><h1>${role==='control'?'시연 조종실':'인터뷰 시연'}</h1><p>진행자가 공유한 전용 링크를 열어 주세요.</p><form id="access-form"><label for="access-key">${role==='control'?'조종':'초대'} 키</label><input id="access-key" type="password" autocomplete="off" required><button class="primary">접속하기</button></form></section>`;$('#access-form').onsubmit=e=>{e.preventDefault();token=$('#access-key').value.trim();sessionStorage.setItem('seat-rehearsal:'+role,token);shell();refresh();};return;}
 if(role==='control'){
  $('#main').innerHTML=`<div class="heading"><div><p class="eyebrow">INTERVIEW / LIVE CONTROL</p><h1>시연 조종실</h1><p>압력 장면을 바꾸고, 원하는 순간에 알림을 보내요.</p></div><span class="demo-badge">센서 없는 상황극</span></div>
  <section class="invite-grid" aria-label="시연 화면 연결">${['worker','admin'].map(r=>`<article class="invite"><div><span class="eyebrow">${r==='worker'?'WORKER':'ADMIN'}</span><h2>${r==='worker'?'근로자 화면':'관리자 화면'}</h2><p id="receipt-${r}">전용 링크 준비 중</p></div><div class="invite-actions"><a id="open-${r}" target="_blank" rel="noopener noreferrer">화면 열기 ↗</a><button data-copy="${r}">링크 복사</button></div></article>`).join('')}</section>
  <div class="control-grid"><section class="scene-panel"><div class="section-title"><h2>장면 선택</h2><span>현재 압력 → 다음 장면 · 알림은 직접 발송</span></div><div class="scene-grid">${['right','left','back','front','sustained'].map((s,i)=>`<button class="scene-button" data-scene="${s}" aria-pressed="false"><span class="scene-number">0${i+1}</span><strong>${SCENES[s].name}</strong><small>${s==='sustained'?'선택한 부위 · 예시 시간':s==='front'?'인터뷰용 가설':'방석 이미지 + 안내'}</small><span class="scene-arrow">↗</span></button>`).join('')}</div><div class="options"><label>지속·감소 장면의 부위<select id="region">${Object.entries(REGIONS).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>지속시간 · 예시<input id="minutes" type="number" min="1" max="120" value="10"><span class="suffix">분</span></label></div><label class="pace-label">장면 진행 속도<select id="pace"><option value="8000">자연스럽게 · 8초</option><option value="12000">천천히 · 12초</option><option value="4000">빠르게 · 4초</option></select></label><section class="manual-alert" aria-label="화면 알림 발송"><h2>화면 알림</h2><strong id="notify-title"></strong><p id="notify-body"></p><p id="notify-status" role="status"></p><div class="control-actions"><button class="primary" id="notify">알림 보내기</button><button id="clear-alert">알림 내리기</button></div><p class="footnote">선택한 편중 부위와 안내를 두 화면에 보내요. 장면이 바뀌어도 자동 발송하지 않아요.</p></section><div class="control-actions"><button data-scene="basic">기본 화면</button><button class="primary" data-scene="relief">압력 감소 장면</button><button class="quiet" id="finish">시연 종료</button></div><p class="footnote">다른 장면을 누르면 현재 압력에서 자연스럽게 이어져요. 반응을 들은 뒤 ‘압력 감소 장면’으로 넘어가세요.</p></section>
  <aside class="preview-panel"><div class="section-title"><h2>현재 전송 장면</h2><span id="scene-time">—</span></div><span id="active-name" class="active-name">시작 대기</span>${map('control-map')}<p id="scene-stage" class="scene-stage"></p><h3 id="preview-title"></h3><p id="preview-body"></p><div class="response-box"><span>근로자 반응</span><strong id="worker-response">아직 반응이 없어요</strong></div><p id="admin-response" class="footnote"></p></aside></div><p class="bottom-note">이 페이지의 명령은 전용 시연 화면에만 적용돼요. 모든 압력·시간은 예시이며 실측 기록에 저장하지 않아요.</p>`;
 }
 painted='';paint();
}
function put(id,text){const el=$(id);if(el&&el.textContent!==text)el.textContent=text;}
function draw(canvas,values){if(!canvas)return;const ctx=canvas.getContext('2d');ctx.fillStyle='#edf1ed';ctx.fillRect(0,0,240,360);if(!values)return;pressureField(values).forEach((row,y)=>row.forEach((v,x)=>{const p=v/3200;ctx.fillStyle=p<.04?'#edf1ed':`hsl(${145-p*140} 55% ${88-p*34}%)`;ctx.fillRect(x*5,y*5,5,5);}));}
function paint(){
 if(!token||!$('#active-name'))return;
 const scene=sceneView(state,Date.now()+serverOffset),signature=JSON.stringify([state.revision,state.alert?.id,state.active,scene.phase,scene.phase==='complete'?1:Math.floor(scene.progress*100)]);
 document.body.dataset.tone=state.active?scene.tone:'calm';document.body.classList.toggle('offline',!online);
 if(signature!==painted){
  painted=signature;document.querySelectorAll('canvas').forEach(c=>draw(c,state.active?scene.values:null));
  put('#active-name',state.active?(scene.phase==='baseline'?'기본 착석':scene.phase==='changing'?'압력 변화 중':scene.name):'시연 대기');put('#scene-stage',!state.active?'':scene.phase==='baseline'?'① 기본 착석으로 시작해요':scene.phase==='changing'?`② ${state.scene==='relief'?'압력 감소':'압력 변화'} 중 · ${Math.round(scene.progress*100)}%`:'③ '+(state.scene==='basic'?'기본 장면':state.scene==='relief'?'압력 감소 장면':state.alert?'알림 발송됨':'장면 유지 · 알림 대기'));put('#preview-title',state.active?scene.title:'진행자의 시작을 기다리고 있어요');
  put('#preview-body',state.active?scene.body:'시연 장면이 시작되면 방석 이미지와 안내가 함께 바뀝니다.');
  put('#scene-note',state.active?(scene.note||(state.scene==='sustained'?`${state.minutes}분은 가상 지속시간 예시예요.`:'')):'');
  put('#scene-time',state.changedAt?`전환 ${stamp(state.changedAt)}`:'');
  document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(state.active&&b.dataset.scene===state.scene)));
 }
 const preview=alertPreview(state);
 put('#notify-title',preview?.title||'편중 장면을 먼저 선택하세요');put('#notify-body',preview?.body||'오른쪽·왼쪽·앞쪽·뒤쪽·같은 부위 지속 장면에서 보낼 수 있어요.');
 put('#notify-status',state.alert?`발송 ${stamp(state.alert.at)} · 두 화면의 표시 확인을 기다려 주세요`:'아직 알림을 보내지 않았어요');
 put('#notify',state.alert?'알림 다시 보내기':'알림 보내기');
 $('#notify').disabled=pending||!online||!preview;$('#clear-alert').disabled=pending||!online||!state.alert;
 const response=state.responses.worker;
 const copy=response?.value==='help'?'도움이 필요해요':response?.value==='adjust'?'조정해볼게요':'아직 반응이 없어요';
 put('#worker-response',role==='worker'&&response?`${copy} · 시연 관리자 화면에 전달했어요. 실제 지원 요청은 아니에요.`:copy);
 put('#admin-response',state.responses.admin?'관리자가 시연 안내를 확인했어요.':'');
 document.querySelectorAll('[data-scene],#finish').forEach(b=>b.disabled=pending||!online);
 document.querySelectorAll('[data-response]').forEach(b=>{b.disabled=pending||!online||!state.active||scene.phase!=='complete'||(role==='worker'&&['basic','relief'].includes(state.scene));});
 if(role==='control')for(const r of ['worker','admin']){
  const receipt=state.receipts[r],fresh=receipt&&receipt.revision===state.revision&&(receipt.alertId??null)===(state.alert?.id??null)&&Date.now()-receipt.at<35000;
  put('#receipt-'+r,!state.active?'링크를 열고 첫 장면을 선택하세요':fresh?`${state.alert?'알림':'현재 장면'} 표시 확인 · ${stamp(receipt.at)}`:state.alert?'알림 표시 확인 대기':'현재 장면 표시 확인 대기');
  $('#receipt-'+r).classList.toggle('confirmed',!!fresh);
 }
}
async function request(body){
 const response=await fetch('/api/rehearsal',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'시연 서버에 연결하지 못했어요.');return data;
}
function accept(data){
 if(data.role!==role)throw Error('이 화면에 맞는 초대 링크를 사용해 주세요.');
 if(Number.isFinite(data.serverNow))serverOffset=data.serverNow-Date.now();state=data.state;online=true;lastSuccess=Date.now();put('#connection','● 온라인 시연 연결됨');
 if(role==='control'&&!formReady){$('#region').value=state.region;$('#minutes').value=state.minutes;formReady=true;}
 if(data.invites)for(const r of ['worker','admin']){links[r]=`${location.origin}/rehearsal/?view=${r}#key=${data.invites[r]}`;const a=$('#open-'+r);if(a)a.href=links[r];}
 paint();
}
function failed(e){online=false;put('#connection','○ 연결 확인 필요 · 마지막 장면');tell(e.message);paint();}
async function refresh(){
 clearTimeout(pollTimer);if(!token||document.hidden){pollTimer=setTimeout(refresh,2000);return;}if(pending||polling){pollTimer=setTimeout(refresh,1000);return;}
 polling=true;const started=generation;
 try{const data=await request();if(started!==generation)return;accept(data);
  if(role!=='control'&&state.active&&(lastReceipt===0||Date.now()-lastReceipt>15000||state.receipts[role]?.revision!==state.revision)){
   lastReceipt=Date.now();await request({action:'receipt',revision:state.revision,requestId:crypto.randomUUID()});
  }
 }catch(e){if(started===generation)failed(e);}finally{polling=false;pollTimer=setTimeout(refresh,2000);}
}
async function send(body){
 if(pending||!online)return;pending=true;generation++;paint();
 tell(body.action==='scene'?'장면을 전송하고 있어요…':body.action==='notify'?'알림을 전송하고 있어요…':body.action==='clear-alert'?'알림을 내리고 있어요…':'시연 반응을 전송하고 있어요…');
 try{const data=await request({...body,requestId:crypto.randomUUID()});accept(data);tell(body.action==='scene'?'장면을 전송했어요. 두 화면의 표시 확인을 기다려 주세요.':body.action==='finish'?'시연을 종료했어요.':body.action==='notify'?'편중 부위를 포함한 알림을 보냈어요.':body.action==='clear-alert'?'두 화면의 알림을 내렸어요.':'시연 반응을 전달했어요.');}
 catch(e){failed(e);}finally{pending=false;paint();refresh();}
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('button');if(!button)return;
 if(button.dataset.scene){const region=Object.hasOwn(REGIONS,button.dataset.scene)?button.dataset.scene:$('#region').value,minutes=Number($('#minutes').value);if(!Number.isInteger(minutes)||minutes<1||minutes>120){tell('예시 시간은 1~120분 사이의 정수로 입력해 주세요.');return;}$('#region').value=region;await send({action:'scene',scene:button.dataset.scene,region,minutes,durationMs:Number($('#pace').value),expectedRevision:state.revision});}
 if(['notify','clear-alert'].includes(button.id))await send({action:button.id,expectedRevision:state.revision,expectedAlertId:state.alert?.id??null});
 if(button.id==='finish')await send({action:'finish',expectedRevision:state.revision});
 if(button.dataset.response)await send({action:'response',response:button.dataset.response,revision:state.revision});
 if(button.dataset.copy){try{if(!links[button.dataset.copy])throw Error();await navigator.clipboard.writeText(links[button.dataset.copy]);tell('전용 시연 링크를 복사했어요.');}catch{tell('복사하지 못했어요. 화면 열기 링크의 주소를 복사해 주세요.');}}
 if(button.id==='large-text'){const active=document.body.classList.toggle('large-text');button.setAttribute('aria-pressed',String(active));}
});
document.addEventListener('visibilitychange',()=>{generation++;if(!document.hidden){lastReceipt=0;refresh();}else{online=false;paint();}});
window.addEventListener('online',refresh);
setInterval(()=>{if(online&&Date.now()-lastSuccess>12000){online=false;put('#connection','○ 연결 확인 필요 · 마지막 장면');paint();}},1000);
setInterval(()=>{if(state.active&&state.motion)paint();},100);
shell();refresh();
