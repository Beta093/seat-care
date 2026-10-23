import workerDocument from '../mobile-web/index.html';
import adminDocument from '../admin-web/index.html';
import {workerStatusPage} from '../mobile-web/src/worker-status-view.js';
import {monitorPage,historyPage as adminHistoryPage} from '../../packages/shared/src/admin-view.js';
import {SCENES,sceneView,emptyRehearsal,alertView} from '../../packages/shared/src/rehearsal.js';
import {CHANNEL_IDS,CHANNELS} from '../../packages/shared/src/layout.js';
import {pressureField} from '../../packages/shared/src/sensor.js';
import {drawHeatmap,eventList} from '../../packages/shared/src/view.js';

const $=s=>document.querySelector(s),role=new URLSearchParams(location.search).get('view');
const supplied=new URLSearchParams(location.hash.slice(1)).get('key');
let token=supplied||sessionStorage.getItem('seat-rehearsal:'+role)||'';
if(supplied){sessionStorage.setItem('seat-rehearsal:'+role,supplied);history.replaceState(null,'',location.pathname+location.search);}
const source=new DOMParser().parseFromString(role==='worker'?workerDocument:adminDocument,'text/html');
document.title=source.title+' · 시연';
document.body.replaceChildren(...source.body.childNodes);
for(const name of role==='worker'?['worker-base.css','worker.css']:['admin.css']){
 const link=document.createElement('link');link.rel='stylesheet';link.href='/rehearsal/assets/'+name;document.head.append(link);
}
const style=document.createElement('link');style.rel='stylesheet';style.href='/rehearsal/viewer.css';document.head.append(style);
document.body.dataset.rehearsal=role;
const notice=document.createElement('p');notice.id='rehearsal-notice';notice.setAttribute('role','status');$('#main').after(notice);
if(role==='worker')$('.mode-strip span').textContent='시연 모드 · 가상 데이터';
else $('.demo-note>div').innerHTML='<span class="small-dot"></span><strong>인터뷰 시연 중</strong><span id="connection">연결 준비 중</span>';
let state=emptyRehearsal(),online=false,pending=false,polling=false,generation=0,lastSuccess=0,lastReceipt=0,serverOffset=0,timer,route='',eventKey='',dismissed='',shownAlert='';
const popup=document.createElement('dialog');popup.id='rehearsal-alert-dialog';popup.setAttribute('aria-labelledby','popup-title');popup.setAttribute('aria-describedby','popup-body');
popup.innerHTML=`<p class="popup-eyebrow">SEAT CARE · 압력 안내</p><h2 id="popup-title"></h2><p id="popup-body"></p><p id="popup-note"></p><div class="popup-actions">${role==='worker'?'<button class="primary" data-response="adjust">조정해볼게요</button><button data-response="help">도움이 필요해요</button>':'<button class="primary" data-response="acknowledge">안내 확인</button>'}</div><p id="popup-status" role="status"></p><button class="popup-close" data-dismiss-popup>닫기</button><p class="popup-disclaimer">인터뷰 시연 · ${role==='worker'?'응답은 시연 관리자에게 전달돼요.':'확인은 시연 기록에만 반영돼요.'}</p>`;
document.body.append(popup);
popup.addEventListener('cancel',()=>{dismissed=state.alert?.id;});
const now=()=>Date.now()+serverOffset;
const text=(selector,value)=>{const el=$(selector);if(el&&el.textContent!==String(value))el.textContent=value;};
const time=at=>new Date(at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
function events(){
 if(!state.changedAt)return [];
 const result=[{id:state.revision,at:state.changedAt,type:'normal',title:state.active?`${SCENES[state.scene].name} 시연 시작`:'시연 종료',detail:'진행자가 선택한 가상 장면입니다.'}];
 const delivered=alertView(state);if(delivered)result.push({id:state.alert.id,at:state.alert.at,type:'caution',title:delivered.title+' 알림',detail:delivered.body});
 const w=state.responses.worker,a=state.responses.admin;
 if(w)result.push({id:'worker',at:w.at,type:'caution',title:w.value==='help'?'도움이 필요해요':'조정해볼게요',detail:'근로자의 시연 반응 · 실제 지원 요청 아님'});
 if(a)result.push({id:'admin',at:a.at,type:'normal',title:'관리자 안내 확인',detail:'시연 안내 확인 · 압력 개선 여부와 별개'});
 return result.sort((a,b)=>a.at-b.at);
}
function workerHistory(){return `<div class="page-title"><h1>수행 기록</h1><p>현재 시연 장면과 참여자의 반응</p></div><section class="panel"><h2>시연 기록</h2><ol id="events" class="events"></ol><p class="description">현재 장면의 반응만 표시해요. 실제 측정·수행 기록에는 저장하지 않아요.</p></section>`;}
function workerSettings(){return `<div class="page-title"><h1>기기와 알림</h1><p>내 방석의 연결 상태를 확인하세요.</p></div><section class="panel"><div class="section-heading"><h2>시연 방석</h2><span class="tag">가상 데이터</span></div><p id="demo-device-status"></p><p class="description">진행자의 조종실에서 선택한 장면을 표시해요.</p></section><section class="panel"><h2>주의 알림</h2><p>진행자가 알림을 보내면 편중 부위와 안내가 화면에 표시돼요.</p><p class="description">도움 버튼은 시연 관리자에게만 전달돼요.</p></section><section class="panel"><h2>계정과 저장</h2><p>인터뷰 시연</p><p class="description">센서 연결이나 로그인 없이 진행해요. 기존 개인 기준과 측정 기록은 사용하지 않아요.</p></section>`;}
function render(){
 const hash=location.hash.slice(1);route=role==='worker'?(['history','settings'].includes(hash)?hash:'status'):(hash==='history'?'history':'monitor');
 document.body.dataset.route=route;eventKey='';
 if(!token){$('#main').innerHTML='<section class="panel"><h1>시연 화면</h1><p>조종실에서 복사한 전용 링크로 접속해 주세요.</p></section>';return;}
 $('#main').innerHTML=role==='worker'?(route==='history'?workerHistory():route==='settings'?workerSettings():workerStatusPage({mode:'demo',connected:true,status:'READY'})):(route==='history'?adminHistoryPage():monitorPage());
 if(role==='worker'&&route==='status'){
  $('#action-box').insertAdjacentHTML('beforeend','<p id="scene-note"></p><div class="button-row"><button class="primary" data-response="adjust">조정해볼게요</button><button data-response="help">도움이 필요해요</button></div><p id="worker-response" class="description" role="status"></p>');
  $('.recent-row small').textContent='시연 기록';
 }
 if(role==='admin'){
  text('.page-heading>div>p',route==='history'?'현재 장면의 근로자 반응과 관리자 확인을 표시합니다.':'근로자별 압력 상태와 조치를 확인합니다.');
  text('.action-area .eyebrow','인터뷰 시연 안내');text('.legacy-score>span','상대 부하 · 시연');
  text('.readings dl>div:last-child dt','시연 경과');text('.roster-facts>div:first-child>span','확인할 시연 안내');
  text('.delivery-panel .channel-note','근로자 반응과 관리자 확인을 공유합니다. 도움 버튼은 시연용이며 실제 지원 요청이 아닙니다.');
  const exportButton=$('#export-report');if(exportButton)exportButton.textContent='시연 반응 저장';
 }
 document.querySelectorAll(role==='worker'?'[data-route]':'[data-nav]').forEach(a=>{if((a.dataset.route||a.dataset.nav)===route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 paint();
}
function drawWorker(values){const canvas=$('#pressure-map');if(!canvas)return;const key=values?values.map(Math.round).join(','):'empty';if(canvas.dataset.values===key)return;canvas.dataset.values=key;const ctx=canvas.getContext('2d');ctx.fillStyle='#edf1ed';ctx.fillRect(0,0,240,360);if(!values)return;pressureField(values).forEach((row,y)=>row.forEach((v,x)=>{const p=v/3200;ctx.fillStyle=p<.04?'#edf1ed':`hsl(${145-p*140} 45% ${85-p*30}%)`;ctx.fillRect(x*5,y*5,5,5);}));}
function paint(){
 if(!token)return;const view=sceneView(state,now()),active=state.active,complete=view.phase==='complete',notification=alertView(state),alert=!!notification,usable=online&&active;
 const stage=!active?'시연 대기':view.phase==='baseline'?'기본 착석':view.phase==='changing'?(state.scene==='relief'?'압력 감소 중':'압력 변화 중'):view.name;
 const title=active?view.title:'진행자의 시작을 기다리고 있어요',body=active?view.body:'시연 장면이 시작되면 방석 이미지와 안내가 함께 바뀝니다.';
 const guidanceTitle=notification?.title||(active?'현재 안내':title),guidanceBody=notification?.body||(active&&!['basic','relief'].includes(state.scene)?'압력 분포를 확인하고 있어요.':body);
 document.documentElement.dataset.status=!online?'unknown':alert?(state.scene==='sustained'?'warning':'caution'):'normal';
 text('#connection',online?'● 온라인 시연 연결됨':'○ 연결 확인 필요');
 const response=state.responses.worker,responseText=response?(response.value==='help'?'도움이 필요해요':'조정해볼게요'):'아직 반응이 없어요';
 if(role==='worker'){
  text('#care-global-state',online?'인터뷰 시연 · 가상 압력':'연결을 확인해 주세요. 마지막으로 받은 장면을 표시해요.');
  text('#state-label',stage);text('#last-reading',active?'방금 수신 · 가상 데이터':'진행자가 장면을 시작하면 표시돼요');
  text('#action-title',guidanceTitle);text('#action-copy',guidanceBody);$('#action-box')?.classList.toggle('caution',alert);
  text('#scene-note',complete?(view.note||''):'');text('#worker-response',response?`${responseText} · 시연 관리자에게 전달했어요`:responseText);
  text('#today-summary',response?responseText:active?`${view.name} · 현재 장면 진행 중`:'시연 시작 대기');
  text('#demo-device-status',online?'● 조종실 연결됨':'○ 연결 확인 필요');
  drawWorker(active?view.values:null);CHANNEL_IDS.forEach((id,i)=>text('#value-'+id,active?Math.round(view.values[i]):'—'));
  const banner=$('#foreground-alert');if(banner)banner.hidden=true;
  if(alert&&shownAlert!==state.alert.id){shownAlert=state.alert.id;text('#live-message',guidanceTitle+'. '+guidanceBody);}else if(!alert)text('#live-message','');
 }else{
  text('#sync-status',online?'온라인 시연 연결됨':'연결 확인 필요 · 마지막 장면');text('#roster-state',stage);text('#roster-action',response?responseText:'상태 확인 중');
  text('#warning-count',alert&&!state.responses.admin?'1':'0');text('#last-received',lastSuccess?time(lastSuccess):'—');
  text('#pattern-title',title);text('#pattern-reason',active&&complete?(view.note||'진행자가 선택한 가상 압력 분포입니다.'):body);text('#pattern-source','진행자 조종 · 가상');text('.pattern-tag','시연 · 가상');
  text('#score',active?Math.round(Math.max(...view.values)/32):'—');text('#duration',!active?'—':state.scene==='sustained'&&complete?`${state.minutes}분 · 예시`:`${Math.floor(Math.max(0,now()-state.changedAt)/1000)}초`);
  const max=active?CHANNEL_IDS[view.values.indexOf(Math.max(...view.values))]:null;text('#pattern-maximum',max?`${max} ${CHANNELS[max].label}`:'—');
  text('#alert-title',guidanceTitle);text('#alert-description',guidanceBody);text('#action',state.responses.admin?'관리자 확인 완료':alert?'확인 필요':stage);
  const ack=$('#acknowledge');if(ack){ack.hidden=!alert;ack.disabled=pending||!usable||!!state.responses.admin;ack.textContent=state.responses.admin?'확인 완료':'안내 확인';}
  const receipt=state.receipts.worker,received=receipt?.revision===state.revision&&(receipt.alertId??null)===(state.alert?.id??null)&&now()-receipt.at<35000;
  text('#worker-channel',response?responseText:received?(alert?'안내 표시 중':'현재 장면 표시 중'):'표시 확인 대기');text('#admin-channel',!active?'시연 대기':state.responses.admin?'확인 완료':alert?'안내 표시 중':'현재 장면 표시 중');
  const canvas=$('.seat canvas');if(canvas){canvas.hidden=!active;if(active)drawHeatmap(canvas,view.values.map(v=>v/32));canvas.closest('.seat').classList.toggle('no-pattern-input',!active);}
  for(const id of ['right','rear','center'])text('#pattern-'+id,'시연 장면');text('#pattern-baseline','기본 착석 · 가상');text('#pattern-time',lastSuccess?time(lastSuccess):'—');text('#pattern-baseline-note','진행자가 지정한 가상 장면입니다. 실제 개인 기준 비교 결과가 아닙니다.');text('#pattern-layout','채택 도면 v2 · 가상 입력');
  if($('#export-report'))$('#export-report').disabled=!state.changedAt;
 }
 text('#popup-title',notification?.title||'압력 안내');text('#popup-body',notification?.body||'');text('#popup-note',notification?.note||'');
 if(online&&alert&&dismissed!==state.alert.id){if(!popup.open)popup.showModal();}else if(popup.open)popup.close();
 document.querySelectorAll('[data-response]').forEach(b=>b.disabled=pending||!usable||!alert);
 const key=JSON.stringify([state.revision,state.alert?.id,state.responses]);if(key!==eventKey&&$('#events')){eventKey=key;$('#events').innerHTML=eventList(events());}
}
async function request(body){const response=await fetch('/api/rehearsal',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'연결을 확인해 주세요.');if(data.role!==role)throw Error('이 화면에 맞는 전용 링크를 열어 주세요.');return data;}
function accept(data){if(data.state.revision!==state.revision)text('#rehearsal-notice','');state=data.state;serverOffset=data.serverNow-Date.now();lastSuccess=Date.now();online=true;paint();}
function failed(error){online=false;text('#rehearsal-notice',error.message);text('#popup-status',error.message);paint();}
async function refresh(){clearTimeout(timer);if(!token||document.hidden){timer=setTimeout(refresh,2000);return;}if(pending||polling){timer=setTimeout(refresh,1000);return;}polling=true;const current=generation;try{const data=await request();if(current!==generation)return;accept(data);if(state.active&&(Date.now()-lastReceipt>15000||state.receipts[role]?.revision!==state.revision||(state.receipts[role]?.alertId??null)!==(state.alert?.id??null))){lastReceipt=Date.now();await request({action:'receipt',revision:state.revision,alertId:state.alert?.id??null,requestId:crypto.randomUUID()});}}catch(e){if(current===generation)failed(e);}finally{polling=false;timer=setTimeout(refresh,2000);}}
async function respond(response){if(pending||!online)return;pending=true;generation++;paint();text('#popup-status','시연 반응을 전송하고 있어요…');text('#rehearsal-notice','시연 반응을 전송하고 있어요…');try{accept(await request({action:'response',response,revision:state.revision,alertId:state.alert?.id??null,requestId:crypto.randomUUID()}));dismissed=state.alert?.id;text('#popup-status','');text('#rehearsal-notice','시연 반응을 전달했어요.');}catch(e){failed(e);}finally{pending=false;paint();refresh();}}
document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.response)respond(button.dataset.response);if(button.id==='acknowledge')respond('acknowledge');if(['large-text','text-size'].includes(button.id)){const on=document.documentElement.classList.toggle('large-text');button.setAttribute('aria-pressed',on);}if(button.hasAttribute('data-dismiss-popup')){dismissed=state.alert?.id;paint();}if(button.id==='dismiss-alert'){dismissed=state.alert?.id;paint();}if(button.id==='export-report'){const blob=new Blob([JSON.stringify({source:'rehearsal',scene:state.scene,events:events()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='seat-care-rehearsal.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
window.addEventListener('hashchange',()=>{render();$('#main').focus();window.scrollTo(0,0);});
document.addEventListener('visibilitychange',()=>{generation++;if(document.hidden){online=false;paint();}else{lastReceipt=0;refresh();}});window.addEventListener('online',refresh);
setInterval(()=>{if(online&&Date.now()-lastSuccess>12000)online=false;if(!document.hidden)paint();},100);
render();refresh();
