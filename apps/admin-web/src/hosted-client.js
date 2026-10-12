import {createMonitor,command,tick} from '../../../packages/shared/src/monitor.js';

// A hosted static demo is intentionally local to this browser. No worker data is fetched.
export function connectMonitor(onSnapshot,onConnection){
 let state=createMonitor(),running=false,last=performance.now();
 const panel=document.createElement('section');panel.className='hosted-controls';panel.setAttribute('aria-label','관리자 화면 시연');
 panel.innerHTML='<strong>실제 근로자 원격 공유 미연결</strong><p>센서 기록은 근로자 휴대폰에만 저장돼요. 아래 시연은 이 브라우저의 가상 데이터이며 다른 휴대폰과 동기화되지 않아요.</p><div><button data-hosted="start">가상 데이터로 화면 보기</button><button data-hosted="normal" disabled>기본 상태 예시</button><button data-hosted="warning" disabled>경고 예시</button><button data-hosted="auto" disabled>자동 흐름 시연</button><button data-hosted="stop" disabled>시연 종료</button></div>';
 document.querySelector('#main').before(panel);
 function publish(){onSnapshot(structuredClone(state));onConnection(running&&!document.hidden);}
 function controls(){panel.querySelectorAll('[data-hosted]').forEach(b=>{b.disabled=b.dataset.hosted==='start'?running:!running;});}
 panel.addEventListener('click',e=>{const action=e.target.closest('[data-hosted]')?.dataset.hosted;if(!action)return;
  if(action==='start'){state=createMonitor();running=true;last=performance.now();}
  else if(action==='stop'){running=false;state=createMonitor();}
  else if(running)state=command(state,action);
  controls();publish();
 });
 const timer=setInterval(()=>{const now=performance.now(),dt=Math.min(1,(now-last)/1000);last=now;if(running&&!document.hidden){tick(state,dt);publish();}},250);
 function visibility(){last=performance.now();onConnection(running&&!document.hidden);}
 document.addEventListener('visibilitychange',visibility);queueMicrotask(()=>onConnection(false));
 return {refresh:publish,async command(action){if(!running||document.hidden||action!=='acknowledge')throw Error('가상 시연에서만 안내를 확인할 수 있어요.');state=command(state,action);publish();},close(){clearInterval(timer);document.removeEventListener('visibilitychange',visibility);panel.remove();}};
}
