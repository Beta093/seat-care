import {get,put} from '@vercel/blob';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {emptyRehearsal,publicState,transition} from '../packages/shared/src/rehearsal.js';
const pathname=`seat-care-rehearsal/${process.env.VERCEL_ENV==='preview'?'preview':'current'}.json`;
export const config={maxDuration:20};
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function roleKeys(secret){return {control:secret,...Object.fromEntries(['worker','admin'].map(role=>[role,createHmac('sha256',secret).update('seat-care-rehearsal:'+role).digest('hex')]))};}
export function createHandler({read,write,secret,now=()=>Date.now(),uuid=randomUUID}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>res.status(status).json({...data,serverNow:now()});
  if(!secret||secret.length<32)return reply(503,{error:'시연 서버 설정이 준비되지 않았어요.'});
  const keys=roleKeys(secret),token=(req.headers.authorization||'').replace(/^Bearer /,''),role=Object.keys(keys).find(r=>equal(token,keys[r]));
  if(!role)return reply(401,{error:'전용 초대 링크로 접속해 주세요.'});
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return reply(405,{error:'지원하지 않는 요청이에요.'});}
  try{
   if(req.method==='GET'){
    const {state}=await read();
    return reply(200,{state:publicState(state,now()),role,...(role==='control'?{invites:{worker:keys.worker,admin:keys.admin}}:{})});
   }
   let input=req.body;
   if(typeof input==='string'){if(input.length>2048)return reply(413,{error:'요청이 너무 커요.'});try{input=JSON.parse(input);}catch{return reply(400,{error:'요청 형식이 잘못됐어요.'});}}
   if(!input||typeof input!=='object'||JSON.stringify(input).length>2048)return reply(400,{error:'요청 형식이 잘못됐어요.'});
   if(!/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId||''))return reply(400,{error:'요청 식별자가 필요해요.'});
   for(let attempt=0;attempt<5;attempt++){
    const stored=await read(),state=publicState(stored.state,now());
    if(state.requests?.includes(input.requestId))return reply(200,{state,role});
    let next;
    try{next=transition(state,input,role,now(),uuid());}catch(e){return reply(409,{error:e.message});}
    next.requests=[...(state.requests||[]).slice(-39),input.requestId];
    try{await write(next,stored.etag);return reply(200,{state:next,role});}
    catch(e){if(!/precondition|already exists|already_exists/i.test(e.message+' '+e.code))throw e;}
   }
   return reply(409,{error:'다른 화면의 반응을 반영 중이에요. 잠시 후 다시 눌러 주세요.'});
  }catch{return reply(503,{error:'시연 서버 연결이 지연돼요. 잠시 후 다시 시도해 주세요.'});}
 };
}
async function read(){
 // Compressed responses carry a weak ETag, which cannot satisfy a conditional write.
 const result=await get(pathname,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});
 if(!result)return {state:emptyRehearsal(),etag:null};
 return {state:await new Response(result.stream).json(),etag:result.blob.etag};
}
async function write(state,etag){
 await put(pathname,JSON.stringify(state),{access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0,...(etag?{ifMatch:etag}:{allowOverwrite:false})});
}
export default async function handler(req,res){return createHandler({read,write,secret:process.env.REHEARSAL_CONTROL_TOKEN})(req,res);}
