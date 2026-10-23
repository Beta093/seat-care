import {get,put} from '@vercel/blob';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {emptyTelemetry,mergeTelemetry,telemetryView} from '../packages/shared/src/telemetry.js';
export const config={maxDuration:20};
const sign=(payload,secret)=>createHmac('sha256',secret).update(payload).digest('base64url');
export function issueToken(secret,room,role,expiresAt){
 const payload=Buffer.from(JSON.stringify({v:1,room,role,exp:expiresAt})).toString('base64url');
 return payload+'.'+sign(payload,secret);
}
export function verifyToken(token,secret,now){
 if(typeof token!=='string'||token.length>1024)return null;
 const [payload,signature,...rest]=token.split('.');
 if(!payload||!signature||rest.length)return null;
 const expected=sign(payload,secret);
 if(Buffer.byteLength(signature)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
 try{const data=JSON.parse(Buffer.from(payload,'base64url'));return data.v===1&&/^[a-zA-Z0-9_-]{16,80}$/.test(data.room)&&['worker','admin'].includes(data.role)&&Number.isSafeInteger(data.exp)&&data.exp>now?data:null;}catch{return null;}
}
export function createTelemetryHandler({read,write,secret,now=()=>Date.now()}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>res.status(status).json({...data,serverNow:now()});
  if(!secret||secret.length<32)return reply(503,{error:'센서 공유 서버 설정이 필요해요.'});
  const auth=verifyToken((req.headers.authorization||'').replace(/^Bearer /,''),secret,now());
  if(!auth)return reply(401,{error:'유효한 공유 초대가 필요해요. 만료 여부를 확인해 주세요.'});
  if(!['GET','POST'].includes(req.method))return reply(405,{error:'지원하지 않는 요청이에요.'});
  try{
   if(req.method==='GET'){const {state}=await read(auth.room);return reply(200,{role:auth.role,room:auth.room,state:telemetryView(state,now())});}
   let input=req.body;
   if(typeof input==='string'){if(Buffer.byteLength(input)>64000)return reply(413,{error:'전송 크기를 줄여 주세요.'});try{input=JSON.parse(input);}catch{return reply(400,{error:'JSON 형식이 잘못됐어요.'});}}
   if(!input||Buffer.byteLength(JSON.stringify(input))>64000)return reply(400,{error:'요청 형식을 확인해 주세요.'});
   if(auth.role==='admin'&&input.action!=='acknowledge')return reply(403,{error:'관리자는 센서 데이터를 변경할 수 없어요.'});
   if(auth.role==='worker'&&input.action!=='upload')return reply(403,{error:'사용자는 관리자 확인을 변경할 수 없어요.'});
   for(let attempt=0;attempt<5;attempt++){
    const stored=await read(auth.room);let next;
    try{
     if(auth.role==='worker')next=mergeTelemetry(stored.state,input,now());
     else{
      const event=stored.state.events.find(e=>e.id===input.eventId&&['help_requested','alert_created'].includes(e.type));
      if(!event)throw Error('확인할 알림을 찾을 수 없어요.');
      next={...stored.state,acknowledgements:{...stored.state.acknowledgements,[event.id]:stored.state.acknowledgements[event.id]||{at:now()}},updatedAt:now()};
     }
    }catch(e){return reply(400,{error:e.message});}
    try{await write(auth.room,next,stored.etag);return reply(200,{role:auth.role,room:auth.room,state:telemetryView(next,now()),acceptedIds:auth.role==='worker'?input.events.map(e=>e.id):[]});}
    catch(e){if(!/precondition|already exists|already_exists/i.test(e.message+' '+e.code))throw e;}
   }
   return reply(409,{error:'다른 갱신을 반영 중이에요. 다시 시도해 주세요.'});
  }catch{return reply(503,{error:'공유 서버 연결에 실패했어요. 기록은 기기에 보관돼요.'});}
 };
}
const path=room=>`seat-care-sensor/${process.env.VERCEL_ENV==='preview'?'preview':'production'}/${room}.json`;
async function read(room){const result=await get(path(room),{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});return result?{state:await new Response(result.stream).json(),etag:result.blob.etag}:{state:emptyTelemetry(),etag:null};}
async function write(room,state,etag){await put(path(room),JSON.stringify(state),{access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0,...(etag?{ifMatch:etag}:{allowOverwrite:false})});}
export default function handler(req,res){return createTelemetryHandler({read,write,secret:process.env.SENSOR_SHARE_SECRET})(req,res);}
