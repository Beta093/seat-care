export function connectMonitor(onSnapshot,onConnection,options={}){
 const request=options.fetch??((...args)=>globalThis.fetch(...args));
 const schedule=options.setInterval??((...args)=>globalThis.setInterval(...args));
 const unschedule=options.clearInterval??(id=>globalThis.clearInterval(id));
 const doc=options.document??globalThis.document,win=options.window??globalThis.window;
 const clock=options.now??(()=>performance.now());
 let active=true,poll=null,commandPending=false,generation=0,lastReceived=null;
 const hidden=()=>doc?.visibilityState==='hidden';
 function cancelPoll(){if(poll){poll.controller.abort();poll=null;}generation++;}
 async function refresh({force=false}={}){
  if(!active||commandPending||hidden())return;
  if(lastReceived!==null&&clock()-lastReceived>1500)onConnection(false);
  if(force)cancelPoll();else if(poll)return;
  const job={controller:new AbortController(),generation};poll=job;
  const timeout=setTimeout(()=>job.controller.abort(),2500);
  try{
   const r=await request('/api/state',{cache:'no-store',signal:job.controller.signal});
   if(!r.ok)throw Error('상태 조회 실패');const data=await r.json();
   if(active&&poll===job&&job.generation===generation){lastReceived=clock();onSnapshot(data);onConnection(true);}
  }catch(error){if(active&&poll===job&&job.generation===generation)onConnection(false);}
  finally{clearTimeout(timeout);if(poll===job)poll=null;}
 }
 function resume(){if(!active||hidden())return;onConnection(false);void refresh({force:true});}
 function visibility(){if(hidden()){cancelPoll();onConnection(false);}else resume();}
 const bindings=[[doc,'visibilitychange',visibility],...[ 'focus','pageshow','online','hashchange'].map(name=>[win,name,resume])];
 for(const [target,name,handler]of bindings)target?.addEventListener(name,handler);
 void refresh();const timer=schedule(()=>void refresh(),250);
 return {
  refresh,
  async command(action){
   if(!active)throw Error('연결이 종료됐어요.');
   if(commandPending)throw Error('이전 요청을 처리하고 있어요.');
   commandPending=true;cancelPoll();
   try{
    const r=await request('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action}),signal:AbortSignal.timeout(3000)});
    if(!r.ok)throw Error('시연 서버에 연결할 수 없어요.');
    const data=await r.json();
    if(active){lastReceived=clock();onSnapshot(data);onConnection(true);}
   }catch(error){if(active)onConnection(false);throw error;}
   finally{commandPending=false;}
  },
  close(){active=false;cancelPoll();unschedule(timer);for(const [target,name,handler]of bindings)target?.removeEventListener(name,handler);}
 };
}
