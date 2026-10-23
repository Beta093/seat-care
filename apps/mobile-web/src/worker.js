import {mapMarkup,workerStatusPage} from './worker-status-view.js';
import {createWorkerCare} from './worker-care.js';
import {readRecords,writeRecords} from './worker-storage.js';
import {SensorTransport,native,bridge} from './sensor-transport.js';
import {enableNotifications,notify,webNotifications,clearScreenAlert} from './worker-notifications.js';
import {authConfigured,observeAccount,login,logout} from './worker-auth.js';
import {BLE,STATES,GUIDANCE,deviceCode,parsePacket,assess,AlertTracker,pressureField} from '../../../packages/shared/src/sensor.js';
import {CHANNEL_IDS,CHANNELS} from '../../../packages/shared/src/layout.js';
import {dateKey,addSample,pruneHistory,summary,loadHistory} from '../../../packages/shared/src/sensor-history.js';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let route='status',account=null,accountReady=false,guest=false,mode='sensor',records={},selectedDate=dateKey(Date.now()),replayIndex=0,replayTimer=null,replaySpeed=1,replayFrames=[];
let connected=false,device='',status='disconnected',warnings=[],degraded=false,values=null,lastAt=0,alertText='',error='',notificationMessage='',calibrationTimer=null,demoTimer=null,scanner=null,scanGeneration=0,recordingError='',commandPending=false;
const tracker=new AlertTracker();
const care=createWorkerCare({onAlert:(text,id)=>{alertText=text;deliverAlert('Seat Care · 압력 완화 안내',text,id);},onClear:()=>{alertText='';clearScreenAlert();},onChange:()=>render()});
let careSignature='';
function acceptCareSample(){if(native||!fresh())return;care.sample(values,lastAt);const v=care.view(),signature=JSON.stringify([v.quality,!!v.baseline,!!v.capture,v.relief?.state,v.bias]);if(signature!==careSignature){careSignature=signature;render();}}
let lastPaint=0,lastSave=0,lastNativeHistory=0;
const transport=new SensorTransport(receive);
const storageKey=()=>`seat-care-sensor-v1:${account?.uid||'local'}:${mode}`;
async function save(){if(native&&mode==='sensor')return;const key=storageKey(),snapshot=structuredClone(pruneHistory(records));try{await writeRecords(key,snapshot);recordingError='';}catch{recordingError='저장 공간이 부족하거나 저장이 차단됐어요. 기록을 내보내 주세요.';}}
async function loadRecords(){if(native&&mode==='sensor'){await nativeHistory();return;}const key=storageKey();try{const loaded=await readRecords(key);if(key===storageKey())records=pruneHistory(loaded);}catch{records={};recordingError='기록 저장소를 열지 못했어요. 이 창을 닫으면 기록이 사라질 수 있어요.';}}

function fresh(){return (native||!document.hidden)&&connected&&status==='READY'&&!degraded&&Date.now()-lastAt>=0&&Date.now()-lastAt<2000&&values!==null;}
function current(){if(!fresh())return {lean:'unavailable'};if(native)return assess(values);const v=care.view();return {lean:v.quality==='unloaded'?'away':v.quality!=='seated'||!v.baseline?'unavailable':v.bias.length?'biased':'center'};}
function message(text){error=text;render();}
function setStatus(next,list=[]){if(!['ZERO_CALIBRATING','BALANCE_CALIBRATING','CALIBRATING'].includes(next))clearTimeout(calibrationTimer);status=next;warnings=list;tracker.reset();if(!native&&next!=='READY')care.interrupt('기기 보정이 변경되어 개인 기준을 다시 등록해야 해요.',Date.now(),true);alertText='';clearScreenAlert();if(next==='ZERO_CALIBRATING')degraded=false;render();}
function receive(event){
 if(mode!=='sensor')return;
 if(event.type==='connection'){
  connected=!!event.connected;device=event.device||device;if(!native){if(connected)care.reconnect(device,Date.now());else care.interrupt('연결이 끊겨 개인 기준을 다시 등록해야 해요.',Date.now(),true);}status=connected?'checking':'disconnected';values=null;lastAt=0;tracker.reset();alertText='';clearScreenAlert();if(event.status)status=event.status;if(event.values){values=event.values;lastAt=event.at||0;}degraded=!!event.degraded;
  if(event.message&&!event.connected)error=event.message;clearTimeout(calibrationTimer);if(connected&&status==='checking')calibrationTimer=setTimeout(()=>{if(status==='checking'){status='ZERO_REQUIRED';message('보정 상태 응답이 없어요. 방석 연결과 펌웨어를 확인해 주세요.');}},6000);render();return;
 }
 if(event.type==='error'){message(event.message||'기기 상태를 확인해 주세요.');return;}
 if(event.type==='alert'){alertText=event.message;$('#live-message').textContent=alertText;paint();return;}
 if(event.type!=='packet')return;const packet=parsePacket(event.packet);if(!packet){if(String(event.packet).startsWith('P:')){lastAt=0;values=null;care.interrupt('센서 패킷을 읽지 못했어요.',Date.now());}return;}
 if(packet.type==='status'){setStatus(packet.status,packet.warnings);return;}
 values=packet.values;lastAt=event.at||Date.now();acceptCareSample();
 if(!native&&!care.view().activeAlert&&alertText){alertText='';clearScreenAlert();}
 if(Date.now()-lastPaint>100){lastPaint=Date.now();paint();}
}
async function deliverAlert(title,body,alertId){
 const result=await notify(title,body);
 if(!result)return;if(alertId)care.delivery(alertId,result);
 notificationMessage=result.system==='shown'?'화면과 시스템에 알림을 표시했어요.':result.system==='paused'?'화면을 보는 동안 알림을 표시해요.':result.system==='failed'?'시스템 알림을 보내지 못했어요. 화면 알림을 확인해 주세요.':'화면에 알림을 표시했어요. 시스템 알림은 사용하지 않고 있어요.';
 put('#notification-status',notificationMessage);
}
function pill(text){return `<span class="tag">${esc(text)}</span>`;}
function statusPage(){return workerStatusPage({mode,connected,status,native,calibration:connected&&status!=='READY'?calibrationPanel():'',carePanel:!native&&connected&&status==='READY'?care.panel():''});}
function calibrationPanel(){
 const waiting=['checking','ZERO_CALIBRATING','BALANCE_CALIBRATING','CALIBRATING'].includes(status),balance=status.startsWith('BALANCE')||status==='CALIBRATION_FAILED',warning=status.includes('WARNING')||status.includes('FAILED');
 return `<section class="panel calibration"><h2>${waiting?'측정 중이에요':balance?'2. 평소의 편안한 상태로 앉아 주세요':'1. 방석을 비워 주세요'}</h2><p>${waiting?'약 5초 동안 자세와 하중을 유지해 주세요.':balance?'방석과 지지대를 평소처럼 사용해 주세요. 기기 보정 후 웹에서 개인 기준을 별도로 등록해요.':'방석 위의 사람과 물건을 치우고 5초 동안 측정해요.'}</p>${warning?`<p class="notice">확인할 센서: ${warnings.map(i=>`${CHANNEL_IDS[i-1]} · ${CHANNELS[CHANNEL_IDS[i-1]].label}`).join(', ')||'센서 반응 확인 필요'}. 계속 진행하면 자동 자세 알림을 보류해요.</p>`:''}<button class="primary wide" data-calibrate="${balance?'CALIBRATE_BALANCE':'CALIBRATE_ZERO'}" ${waiting||commandPending?'disabled':''}>${warning?'다시 측정':balance?'앉은 자세 측정':'빈 방석 측정'}</button>${warning?`<button data-calibrate="${balance?'CONTINUE_BALANCE_CALIBRATION':'CONTINUE_ZERO_CALIBRATION'}">값만 확인하며 계속</button>`:''}</section>`;
}
function settingsPage(){return `<div class="page-title"><h1>기기와 알림</h1><p>내 방석을 연결하고 측정을 시작하세요.</p></div><section class="panel"><div class="section-heading"><h2>${esc(device||'내 방석')}</h2>${pill(connected?'연결됨':'미연결')}</div><p>${native?'설치 앱 · 휴대폰에서 감지와 알림 처리':'웹 · 이 화면을 열어둔 동안 측정과 알림'}</p>${!native?'<p class="notice">이 웹 화면을 켜둔 상태에서 사용해 주세요. 다른 탭으로 이동하거나 화면을 잠그면 판단과 알림을 쉬어요.</p>':''}${!native&&!navigator.bluetooth?'<p class="notice">이 브라우저는 방석 Bluetooth 직접 연결을 지원하지 않아요. Android Chrome 등 지원 브라우저에서 연결해 주세요. iPhone Safari에서는 현재 시연 화면과 알림만 확인할 수 있어요.</p>':''}${mode==='sensor'&&!connected?`<label class="field-label" for="device-code">기기 코드</label><input id="device-code" autocomplete="off" placeholder="예: A1B2C3 또는 ESP32:A1B2C3" maxlength="20"><div class="button-row"><button id="scan-code">QR · 바코드 스캔</button><button class="primary" id="connect" ${!native&&!navigator.bluetooth?'disabled':''}>방석 연결</button></div><p class="description">${native?'기기 코드로 주변 방석을 찾아요.':'코드를 입력한 뒤 브라우저의 기기 선택 창에서 같은 방석을 선택해 주세요. 코드는 생략할 수 있어요.'}</p>`:''}${connected?'<button id="disconnect">연결 해제</button><button id="recalibrate">처음부터 다시 보정</button>':''}</section>${connected&&status!=='READY'?calibrationPanel():''}${!native&&connected&&status==='READY'?care.panel():''}<section class="panel"><h2>주의 알림</h2><p>개인 기준 대비 부하 증가가 이어지거나, 유효 착석 관측 중 압력 완화가 오래 확인되지 않으면 알려드려요.</p>${!native?`<p>화면 알림은 권한 없이 표시돼요. 기록이나 설정을 보는 중에도 위쪽에 알려드려요.</p><button class="primary wide" id="test-notification">화면 알림 테스트</button><button id="toggle-sound" aria-pressed="${webNotifications.soundEnabled}">${webNotifications.soundEnabled?'알림음 끄기':'알림음 켜기'}</button><button id="enable-notifications">시스템 알림도 허용</button>`:'<button class="primary wide" id="enable-notifications">휴대폰 알림 허용</button><button id="test-notification">테스트 알림</button>'}<p id="notification-status" role="status">${esc(notificationMessage)}</p><p class="description">${native?'화면이 꺼지거나 다른 앱을 사용하는 동안에도 감지하도록 구성돼 있어요. 강제 종료·권한 해제·Bluetooth 끄기 후에는 다시 앱을 열고 연결해 주세요.':'기본은 웹 화면 안 알림이에요. 시스템 알림은 브라우저와 권한에 따라 제공되며, 지원하지 않아도 화면 알림은 동작해요. 알림음은 이 창에서 직접 켠 뒤 사용할 수 있어요.'}</p></section>${!native?care.settingsPanel():''}<section class="panel"><h2>압력 화면 테스트</h2><p>실제 기록과 분리된 가상 데이터로 화면을 확인해요.</p><button id="toggle-demo">${mode==='demo'?'실제 센서 모드로 돌아가기':'센서 없이 시연 시작'}</button>${mode==='demo'?`<div class="demo-buttons">${Object.keys(demos).map(k=>`<button data-demo="${k}">${({center:'기준 분포',asymmetric:'비대칭 기준 예시',relief:'L1 부하 감소',missing:'수신 끊김',unstable:'불안정한 입력'})[k]||STATES[k]||k}</button>`).join('')}</div>`:''}</section><section class="panel"><h2>계정과 저장</h2><p>${esc(account?.email||'이 기기에만 기록 저장')}</p><p class="description">기록은 기기 내부에 저장됩니다. 다른 휴대폰이나 관리자에게 자동 공유되지 않아요.</p>${account?'<button id="logout">로그아웃</button>':authConfigured&&!native?'<button id="login-page">계정으로 로그인</button>':'<p class="description">계정 로그인은 서비스 설정 후 사용할 수 있어요.</p>'}<a class="quiet-link" href="/admin/">관리자 연결 상태 ›</a></section><p class="disclaimer">센서값은 상대 부하입니다. 압력 지도와 자세 점수는 신체 안전을 확정하지 않습니다.</p>`;}
function time(seconds){return seconds<60?`${seconds}초`:`${Math.floor(seconds/3600)?Math.floor(seconds/3600)+'시간 ':''}${Math.floor(seconds%3600/60)}분`;}
function historyPage(){const record=records[selectedDate],frames=record?.frames||[];return `<div class="page-title"><h1>수행 기록</h1><p>${mode==='demo'?'시연 기록 · 가상 데이터':'이 기기에서 관측한 기록'}</p></div><label class="field-label" for="history-date">날짜 선택</label><input id="history-date" type="date" value="${selectedDate}" max="${dateKey(Date.now())}">${care.historyPanel(selectedDate)}<section class="panel"><h2>압력 타임랩스</h2><p>5초 간격으로 저장한 압력 분포 · ${frames.length}개</p><button id="open-replay" ${frames.length?'':'disabled'}>기록 재생</button><p class="description">이전 방향 분류·유지율 기록은 내보내기에 보존돼요. 과거 기록을 새 개인 기준으로 다시 판정하지 않아요.</p></section><button id="export-history">기록 JSON 내보내기</button><p class="disclaimer">최근 90일 요약·최대 20,000개 이벤트, 상세 압력은 최근 7일 보관. 날짜가 바뀌어도 원본 이벤트의 시작·종료 시각을 유지해요. 수행 횟수는 완료 시각의 날짜로 집계해요.</p>`;}

function replayPage(){if(!replayFrames.length)replayFrames=structuredClone(records[selectedDate]?.frames||[]);const frames=replayFrames;if(!frames.length)return '<p>이 날짜에 재생할 기록이 없어요.</p><a href="#history">기록으로 돌아가기</a>';replayIndex=Math.min(replayIndex,frames.length-1);return `<a href="#history" class="quiet-link">← 기록으로</a><div class="page-title"><h1>압력 타임랩스</h1><p>${selectedDate} · 과거 기록, 현재 상태가 아닙니다</p></div><section class="overview"><strong id="replay-time"></strong>${mapMarkup('replay-map')}<p id="replay-state"></p><input aria-label="재생 위치" id="replay-position" type="range" min="0" max="${frames.length-1}" value="${replayIndex}"><div class="button-row"><button id="play-replay">${replayTimer?'일시정지':'재생'}</button><select id="replay-speed" aria-label="재생 속도">${[1,4,16].map(n=>`<option value="${n}" ${n===replaySpeed?'selected':''}>${n}배</option>`).join('')}</select></div><p class="description">실제 저장 시각 간격으로 재생합니다. 기록이 없는 구간은 안내 후 건너뛰어요.</p></section>`;}
function loginPage(){return `<div class="page-title"><h1>Seat Care</h1><p>내 방석의 압력과 자세 변화를 확인해요.</p></div><section class="panel"><h2>계정으로 시작</h2><button class="primary wide" data-login="google">Google로 계속하기</button><button class="wide" data-login="apple">Apple로 계속하기</button><button id="guest">이 기기에서 계정 없이 사용</button><p class="description">로그인해도 센서 기록은 이 기기에 저장됩니다.</p></section>`;}
function render(){
 const desired=location.hash.slice(1);route=['settings','history','replay'].includes(desired)?desired:'status';document.body.dataset.route=route;
 const gate=authConfigured&&accountReady&&!account&&!guest;
 $('#main').innerHTML=(gate?loginPage():({status:statusPage,settings:settingsPage,history:historyPage,replay:replayPage}[route])())+(error?`<p class="error-notice" role="alert">${esc(error)}</p>`:'')+(care.storageError?`<p class="error-notice" role="alert">${esc(care.storageError)}</p>`:'')+(recordingError?`<p class="error-notice" role="alert">${esc(recordingError)}</p>`:'');
 document.querySelectorAll('[data-route]').forEach(a=>{if(a.dataset.route===(route==='replay'?'history':route))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 $('.mode-strip span').textContent=mode==='demo'?'시연 모드 · 가상 데이터':native?'설치 앱 · 센서 직접 연결':'웹 · 화면을 켜두세요';paint();if(route==='replay')paintReplay();
}
function draw(canvas,v){if(!canvas)return;const ctx=canvas.getContext('2d');ctx.fillStyle='#e7efe6';ctx.fillRect(0,0,240,360);if(!v)return;const field=pressureField(v);field.forEach((row,y)=>row.forEach((value,x)=>{const p=value/3200;ctx.fillStyle=p<.04?'#e7efe6':`hsl(${145-p*140} 45% ${85-p*30}%)`;ctx.fillRect(x*5,y*5,5,5);}));}
function put(id,value){const node=$(id);if(node)node.textContent=value;}
function paint(){const a=current(),valid=fresh(),v=care.view();put('#connection',connected?(valid?'● 수신 중':status==='READY'?'측정 확인 필요':'보정 필요'):'○ 미연결');const label=!native?(v.quality==='unloaded'?'좌면 부하 해제':!valid||v.quality==='unavailable'?'측정 확인 필요':v.capture?'개인 기준 등록 중':!v.baseline?'개인 기준 등록 필요':v.bias.length?v.bias.map(k=>CHANNELS[k].label).join('·')+' 부하 증가':'개인 기준 관측 중'):STATES[a.lean];put('#state-label',label);put('#last-reading',valid?'방금 수신 · '+(mode==='demo'?'가상 데이터':'보정된 상대 부하'):degraded?'센서 경고 · 자동 알림 보류':'방석 연결과 보정을 확인해 주세요');put('#action-title',alertText?'압력 완화 안내':v.relief?.state==='completed'?'선택 부위 기록 완료':'현재 안내');put('#action-copy',alertText||(!native?(!care.ready?'기록을 불러오는 중이에요.':!v.baseline?'방석 보정 후 편안한 개인 착석 기준을 등록해 주세요.':v.quality==='unloaded'?'자리 비움·들어 올림 등의 원인은 압력만으로 구분할 수 없어요.':'가능한 범위에서 압력을 덜어주는 행동을 확인해 보세요.'):GUIDANCE[a.lean]));$('#action-box')?.classList.toggle('caution',!!alertText);draw($('#pressure-map'),valid?values:null);CHANNEL_IDS.forEach((k,i)=>put('#value-'+k,valid?Math.round(values[i]):'—'));const today=care.summary(dateKey(Date.now()));put('#today-summary',`완화 조건 충족 ${today.completed}회 · 유효 착석 ${time(Math.floor(today.seated/1000))}`);care.paint();}

function paintReplay(){const frame=replayFrames[replayIndex];if(!frame)return;put('#replay-time',new Date(frame.at).toLocaleTimeString('ko-KR'));put('#replay-state',frame.values?(frame.careLabel||'이전 상대 부하 기록 · 개인 기준 판정 없음'):'이 구간은 미측정입니다');draw($('#replay-map'),frame.values);if($('#replay-position'))$('#replay-position').value=replayIndex;}
function stopReplay(){clearTimeout(replayTimer);replayTimer=null;}
function nextReplay(){const frames=replayFrames;if(replayIndex>=frames.length-1){stopReplay();put('#play-replay','재생');return;}const gap=frames[replayIndex+1].at-frames[replayIndex].at;if(gap>10000)put('#replay-state','기록 공백 · 다음 측정으로 이동합니다');replayTimer=setTimeout(()=>{replayIndex++;paintReplay();nextReplay();},Math.min(10000,Math.max(1,gap))/replaySpeed);}
async function calibrate(command){
 if(commandPending)return;error='';commandPending=true;const continuation=command.startsWith('CONTINUE');if(continuation)degraded=true;
 const next=command==='CALIBRATE_ZERO'?'ZERO_CALIBRATING':command==='CALIBRATE_BALANCE'?'BALANCE_CALIBRATING':command==='CONTINUE_ZERO_CALIBRATION'?'BALANCE_REQUIRED':'READY';setStatus(next);
 try{
  if(mode==='demo'){if(command==='CALIBRATE_ZERO'||command==='CALIBRATE_BALANCE')calibrationTimer=setTimeout(()=>setStatus(command==='CALIBRATE_ZERO'?'BALANCE_REQUIRED':'READY'),5000);}
  else {await transport.command(command);if(!continuation&&status===next)calibrationTimer=setTimeout(()=>{status=command==='CALIBRATE_ZERO'?'ZERO_REQUIRED':'BALANCE_REQUIRED';message('보정 응답이 없어요. 방석 연결을 확인하고 다시 시도해 주세요.');},9000);}
 }catch(e){status=command==='CALIBRATE_ZERO'?'ZERO_REQUIRED':'BALANCE_REQUIRED';error=e.message;}finally{commandPending=false;render();}
}
const demos={asymmetric:[900,350,750,300,400],relief:[250,500,500,500,500],missing:null,unstable:[500,500,500,500,500],center:[500,500,500,500,500],left:[1100,400,1100,400,500],right:[400,1100,400,1100,500],front:[1100,1100,350,350,350],back:[350,350,1000,1000,1000],away:[5,5,5,5,5]};let demoLean='center';
async function changeMode(){clearScreenAlert();replayFrames=[];await save();await care.persist();await stopScanner();stopReplay();clearInterval(demoTimer);clearTimeout(calibrationTimer);if(mode==='sensor')await transport.disconnect();mode=mode==='demo'?'sensor':'demo';values=null;lastAt=0;degraded=false;tracker.reset();alertText='';error='';records={};demoLean='center';await loadRecords();await care.load(account?.uid,mode);connected=mode==='demo';device=mode==='demo'?'시연 방석':'';status=mode==='demo'?'ZERO_REQUIRED':'disconnected';if(mode==='demo'){care.reconnect(device,Date.now());demoTimer=setInterval(()=>{if(document.hidden||demoLean==='missing')return;values=demoLean==='unstable'?[Date.now()%1000<500?300:900,500,500,500,500]:demos[demoLean];lastAt=Date.now();acceptCareSample();if(!care.view().activeAlert&&alertText){alertText='';clearScreenAlert();}paint();},100);}render();}

async function stopScanner(){scanGeneration++;scanner?.stop();scanner=null;const video=$('#scanner-video');video?.srcObject?.getTracks().forEach(t=>t.stop());$('#scanner-dialog')?.remove();}
async function scan(){const generation=++scanGeneration;const {BrowserMultiFormatReader}=await import('@zxing/browser');const dialog=document.createElement('dialog');dialog.id='scanner-dialog';dialog.innerHTML='<h2>방석 코드를 비춰 주세요</h2><video id="scanner-video" autoplay muted playsinline></video><button id="close-scanner">닫기</button>';document.body.append(dialog);dialog.showModal();dialog.addEventListener('cancel',()=>stopScanner());$('#close-scanner').onclick=stopScanner;try{const controls=await new BrowserMultiFormatReader().decodeFromVideoDevice(undefined,$('#scanner-video'),(result,_error,control)=>{if(!result)return;const code=deviceCode(result.getText());if(!code)return;control.stop();stopScanner();if($('#device-code'))$('#device-code').value=code;});if(generation!==scanGeneration)controls.stop();else scanner=controls;}catch(e){await stopScanner();throw Error('카메라를 열지 못했어요. 권한을 확인하거나 코드를 직접 입력해 주세요.');}}
async function nativeHistory(){if(!native||mode!=='sensor')return;try{const result=await bridge.getHistory();records=result.records||{};}catch{recordingError='기기 기록을 불러오지 못했어요.';}}
$('#main').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
 if(b.dataset.care){care.handle(b.dataset.care,Date.now());return;}
 if(b.dataset.login){await login(b.dataset.login);return;}
 if(b.dataset.calibrate){await calibrate(b.dataset.calibrate);return;}
 if(b.dataset.demo){demoLean=b.dataset.demo;return;}
 switch(b.id){
 case 'guest':guest=true;render();break;
 case 'login-page':guest=false;render();break;
 case 'logout':save();await transport.disconnect();await logout();break;
 case 'connect':{const input=$('#device-code').value.trim(),code=deviceCode(input);if(input&&!code)throw Error('기기 코드는 6자리 숫자·A~F 조합이에요.');if(native&&!code)throw Error('방석의 기기 코드를 입력하거나 스캔해 주세요.');b.disabled=true;error='';await transport.connect(code);break;}
 case 'disconnect':if(mode==='demo'){clearInterval(demoTimer);care.interrupt('연결 해제',Date.now(),true);connected=false;status='disconnected';render();}else await transport.disconnect();break;
 case 'recalibrate':tracker.reset();alertText='';setStatus('ZERO_REQUIRED');break;
 case 'enable-notifications':{const r=await enableNotifications();notificationMessage=r.granted?'시스템 알림이 허용됐어요. 테스트 버튼으로 표시를 확인해 주세요.':r.reason==='unsupported'?'이 브라우저는 시스템 알림을 지원하지 않아요. 화면 알림을 사용해 주세요.':'시스템 알림이 허용되지 않았어요. 화면 알림은 계속 사용할 수 있어요.';render();break;}
 case 'toggle-sound':await webNotifications.toggleSound();notificationMessage=webNotifications.soundEnabled?'알림음을 켰어요. 휴대폰 볼륨과 무음 설정도 확인해 주세요.':'알림음을 껐어요. 화면 알림은 유지돼요.';render();break;
 case 'test-notification':if(native){await bridge.testNotification();notificationMessage='테스트 알림을 요청했어요.';}else await deliverAlert('Seat Care · 테스트','화면 알림이 이렇게 표시됩니다. 실제 자세 경고가 아니에요.');render();break;
 case 'toggle-demo':await changeMode();break;
 case 'scan-code':await scan();break;
 case 'open-replay':replayIndex=0;replayFrames=structuredClone(records[selectedDate]?.frames||[]);location.hash='replay';break;
 case 'play-replay':if(replayTimer)stopReplay();else{const frames=replayFrames;if(replayIndex>=frames.length-1)replayIndex=0;nextReplay();}put('#play-replay',replayTimer?'일시정지':'재생');break;
 case 'export-history':{const blob=new Blob([JSON.stringify({format:'seat-care-sensor-history',version:2,source:mode,exportedAt:new Date().toISOString(),records,care:care.history})],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`seat-care-${mode}-${dateKey(Date.now())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
 }
 }catch(e){message(e.message||'요청을 완료하지 못했어요.');}finally{if(b.isConnected)b.disabled=false;}});
$('#main').addEventListener('change',e=>{if(e.target.id==='care-layout'&&care.session)care.session.layoutConfirmed=e.target.checked;if(e.target.id==='history-date'){selectedDate=e.target.value;render();}if(e.target.id==='replay-speed'){replaySpeed=Number(e.target.value);if(replayTimer){stopReplay();nextReplay();}}});
$('#main').addEventListener('input',e=>{if(e.target.id==='replay-position'){stopReplay();replayIndex=Number(e.target.value);paintReplay();put('#play-replay','재생');}});
$('#dismiss-alert').onclick=()=>{care.acknowledge(Date.now());clearScreenAlert();};
$('#large-text').onclick=()=>{const on=document.documentElement.classList.toggle('large-text');$('#large-text').setAttribute('aria-pressed',on);};
window.addEventListener('hashchange',()=>{stopReplay();stopScanner();render();$('#main').focus();window.scrollTo(0,0);});
window.addEventListener('pagehide',()=>{care.interrupt('웹 화면을 떠나 관측을 중단했어요.',Date.now());save();care.persist();stopScanner();});
document.addEventListener('visibilitychange',()=>{lastAt=0;tracker.reset();alertText='';clearScreenAlert();if(document.hidden){care.interrupt('화면이 숨겨져 수행 확인을 중단했어요.',Date.now());save();care.persist();stopScanner();stopReplay();}else{nativeHistory().then(render);if(native)bridge.getState().then(receive).catch(()=>{});}});
setInterval(async()=>{if(!native&&document.hidden)return;care.tick(Date.now());if(native&&mode==='sensor'){if(Date.now()-lastNativeHistory>5000){lastNativeHistory=Date.now();await nativeHistory();}}else{addSample(records,{at:Date.now(),values:fresh()?values:null,source:mode,device,careLabel:!native?(care.view().quality==='unloaded'?'좌면 부하 해제':care.view().quality!=='seated'?'관측 중단':!care.view().baseline?'개인 기준 미등록':care.view().bias.length?care.view().bias.map(k=>CHANNELS[k].label).join('·')+' 부하 증가':'개인 기준 관측 중'):null,baselineId:care.view().baseline?.id??null});if(Date.now()-lastSave>5000){lastSave=Date.now();save();care.persist();}}if(!fresh()){tracker.reset();if(alertText)clearScreenAlert();alertText='';}paint();},1000);
observeAccount(async user=>{if(accountReady&&account?.uid!==user?.uid){save();await transport.disconnect();values=null;lastAt=0;}account=user;accountReady=true;replayFrames=[];records={};await loadRecords();await care.load(account?.uid,mode);render();});
transport.init().catch(e=>message(e.message));
if(!native&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
render();
