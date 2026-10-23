import {pressureField} from '../../../packages/shared/src/sensor.js';
import {CHANNEL_IDS,CHANNELS} from '../../../packages/shared/src/layout.js';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={session_started:'측정 연결',baseline_registered:'개인 기준 등록',baseline_failed:'기준 등록 중단',alert_created:'압력 완화 안내',alert_acknowledged:'사용자 안내 확인',relief_armed:'완화 확인 준비',relief_completed:'완화 조건 충족',relief_interrupted:'완화 확인 중단',data_lost:'관측 공백',help_requested:'도움 요청',sharing_started:'관리자 공유 시작',sharing_stopped:'관리자 공유 중지'};
const time=at=>new Date(at).toLocaleString('ko-KR',{hour12:false});
let token=new URLSearchParams(location.hash.slice(1)).get('key')||sessionStorage.getItem('seat-sensor-admin')||'',state=null,timer,busy=false,online=false,offset=0,generation=0,lastSuccess=0;
if(location.hash)history.replaceState(null,'',location.pathname);
$('.seat').insertAdjacentHTML('beforeend',CHANNEL_IDS.map(id=>`<span class="point" style="left:${CHANNELS[id].x*100}%;top:${CHANNELS[id].y*100}%">${id}</span>`).join(''));
function draw(values){const canvas=$('#map'),ctx=canvas.getContext('2d');ctx.fillStyle='#edf1ed';ctx.fillRect(0,0,240,300);if(values)pressureField(values,60,48).forEach((row,y)=>row.forEach((value,x)=>{const p=value/3200;ctx.fillStyle=p<.04?'#edf1ed':`hsl(${145-p*140} 45% ${85-p*30}%)`;ctx.fillRect(x*5,y*5,5,5);}));}
function paint(){
 $('#join').hidden=!!state;$('#dashboard').hidden=!state;$('#disconnect').hidden=!token;
 $('#connection').textContent=online?'공유 서버 연결됨':state?'연결 확인 필요':'공유 초대 연결 대기';
 if(!state)return;
 const s=state.snapshot,age=s?Date.now()+offset-s.at:Infinity,fresh=online&&s?.connected&&s.quality!=='unavailable'&&age>=-300000&&age<15000;
 $('#state-title').textContent=!s?'사용자 앱 연결 대기':!fresh?'측정 중단 · 최근값 확인 필요':s.quality==='unloaded'?'좌면 부하 없음':!s.baseline?'개인 기준 미등록':s.bias.length?'압력 완화 확인 필요':'개인 기준 범위';
 $('#device').textContent=s?.device||'연결된 방석 없음';
 $('#guidance').textContent=!fresh?'현재 상태를 판단할 수 없어요. 사용자 앱과 방석 연결을 확인해 주세요.':s.quality==='unloaded'?'좌면 부하가 감지되지 않아요. 원인은 확인할 수 없어요.':s.bias.length?`${s.bias.map(id=>CHANNELS[id].label).join(', ')} 부하 증가가 지속되고 있어요.`:s.baseline?'개인 착석 기준과 비교 중이에요.':'사용자 앱에서 개인 기준을 등록해 주세요.';
 $('#freshness').textContent=s?`마지막 측정: ${time(s.at)}`:'아직 수신된 센서 데이터가 없어요.';
 $('#last-reading').textContent=fresh?'최근 유효 수신값 · 상대 부하':'현재값 표시 중지';
 $('#readings').innerHTML=CHANNEL_IDS.map((id,i)=>`<div><dt>${id}</dt><dd>${fresh&&s.values?Math.round(s.values[i]):'—'}</dd></div>`).join('');draw(fresh?s.values:null);
 $('#completed').textContent=state.events.filter(e=>e.type==='relief_completed').length+'회';
 $('#help-count').textContent=state.events.filter(e=>e.type==='help_requested'&&!state.acknowledgements[e.id]).length+'건';
 // Do not recreate the focused acknowledgement button on every freshness tick.
 const signature=JSON.stringify([state.events,state.acknowledgements,busy,online]);
 if($('#events').dataset.signature===signature)return;$('#events').dataset.signature=signature;
 $('#events').innerHTML=state.events.length?[...state.events].reverse().map(e=>`<li><div><time>${time(e.at)}</time><strong>${esc(labels[e.type]||e.type)}</strong><p>${esc(e.detail)}</p></div>${['help_requested','alert_created'].includes(e.type)?state.acknowledgements[e.id]?`<span class="tag">관리자 확인 ${time(state.acknowledgements[e.id].at)}</span>`:`<button data-ack="${esc(e.id)}" ${busy||!online?'disabled':''}>안내 확인</button>`:''}</li>`).join(''):'<li>아직 공유된 기록이 없어요.</li>';
}
async function request(body){const res=await fetch('/api/telemetry',{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});const data=await res.json();if(!res.ok)throw Error(data.error||'공유 서버에 연결하지 못했어요.');if(data.role!=='admin')throw Error('관리자용 초대 링크를 사용해 주세요.');return data;}
function failed(error){online=false;$('#error').textContent=error.message;$('#error').hidden=false;paint();}
async function refresh(body){clearTimeout(timer);if(!token||document.hidden||busy)return;busy=true;const current=generation;paint();try{const data=await request(body);if(current!==generation)return;state=data.state;offset=data.serverNow-Date.now();lastSuccess=Date.now();online=true;sessionStorage.setItem('seat-sensor-admin',token);$('#error').hidden=true;}catch(e){if(current===generation)failed(e);}finally{busy=false;paint();if(token)timer=setTimeout(refresh,5000);}}
$('#join-form').addEventListener('submit',e=>{e.preventDefault();try{const url=new URL($('#invite').value.trim());if(url.origin!==location.origin)throw Error('현재 관리자 사이트에서 발급한 초대를 입력해 주세요.');const key=new URLSearchParams(url.hash.slice(1)).get('key');if(!key)throw Error('초대 링크를 확인해 주세요.');token=key;generation++;state=null;$('#invite').value='';refresh();}catch(e){failed(e);}});
$('#events').addEventListener('click',e=>{const button=e.target.closest('[data-ack]');if(button)refresh({action:'acknowledge',eventId:button.dataset.ack});});
$('#disconnect').onclick=()=>{generation++;token='';state=null;online=false;sessionStorage.removeItem('seat-sensor-admin');clearTimeout(timer);paint();};
$('#text-size').onclick=()=>document.documentElement.classList.toggle('large-text');$('#refresh').onclick=()=>refresh();
setInterval(()=>{if(Date.now()-lastSuccess>15000)online=false;if(!document.hidden)paint();},1000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){online=false;clearTimeout(timer);paint();}else refresh();});
paint();refresh();
