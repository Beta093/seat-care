export function createRemoteRecorder({fetch:request=(...args)=>globalThis.fetch(...args),makeId=()=>crypto.randomUUID()}={}){
 let session=null,pending=false,statusPending=false,generation=0,uncertainId=null;
 async function call(action,id){
  const response=await request('/api/recording',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id}),signal:AbortSignal.timeout(3000)});
  const data=await response.json();if(!response.ok)throw Error(data.error??'서버 기록 요청에 실패했습니다. 같은 버튼으로 다시 시도해 주세요.');
  if(data.id!==id||typeof data.active!=='boolean'||!Number.isInteger(data.count)||data.count<1||!Number.isFinite(data.durationMs))throw Error('서버 기록 응답이 올바르지 않습니다.');
  return data;
 }
 return {
  get active(){return !!session?.active;},get pending(){return pending;},get session(){return session;},
  async start(){
   if(pending)throw Error('기록 요청을 처리 중입니다.');if(session?.active)return session;
   pending=true;generation++;const id=uncertainId??makeId();uncertainId=id;
   try{session=await call('start',id);uncertainId=null;return session;}finally{pending=false;}
  },
  async status(){
   if(!session||pending||statusPending)return null;const id=session.id,started=generation;statusPending=true;
   try{const data=await call('status',id);if(started===generation){session=data;return session;}return null;}finally{statusPending=false;}
  },
  async stop(){
   if(pending)throw Error('기록 요청을 처리 중입니다.');if(!session)throw Error('시작한 서버 기록이 없습니다.');
   pending=true;generation++;
   try{session=await call('stop',session.id);return session;}finally{pending=false;}
  }
 };
}
