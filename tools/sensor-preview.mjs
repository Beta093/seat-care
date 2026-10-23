import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createTelemetryHandler,issueToken} from '../api/telemetry.js';
import {emptyTelemetry} from '../packages/shared/src/telemetry.js';
const secret=randomBytes(32).toString('hex'),room=randomUUID(),port=Number(process.env.PORT||4188),rooms=new Map();
const handler=createTelemetryHandler({secret,
 read:async id=>{const value=rooms.get(id);return value?structuredClone(value):{state:emptyTelemetry(),etag:null};},
 write:async(id,state,etag)=>{if((rooms.get(id)?.etag??null)!==etag)throw Error('precondition');rooms.set(id,{state:structuredClone(state),etag:randomUUID()});}
});
const root=resolve('dist'),mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(url.pathname==='/api/telemetry'){
  let size=0,body='';for await(const chunk of req){size+=chunk.length;if(size>64000){res.status(413).json({error:'too large'});return;}body+=chunk;}
  req.body=body;await handler(req,res);return;
 }
 try{const path=decodeURIComponent(url.pathname),relative=path.endsWith('/')?path+'index.html':path;const file=resolve(root,relative.slice(1));if(!file.startsWith(root+sep)||!mime[extname(file)])throw Error();res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',mime[extname(file)]);res.end(await readFile(file));}catch{res.status(404).end('Not found');}
});
const expiry=Date.now()+86400000,base=`http://127.0.0.1:${port}`;
await writeFile('.env.sensor-preview.local',JSON.stringify({room,workerInvite:`${base}/sensor/#key=${issueToken(secret,room,'worker',expiry)}`,adminInvite:`${base}/sensor/#key=${issueToken(secret,room,'admin',expiry)}`},null,2),{mode:0o600});
server.listen(port,'127.0.0.1',()=>console.log(`Sensor preview: ${base}/sensor/ · 초대 링크는 .env.sensor-preview.local · 메모리 저장, 종료 시 삭제`));
