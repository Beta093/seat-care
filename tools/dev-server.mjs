import http from 'node:http';
import {createRecordingService} from '../packages/shared/src/recording-service.js';
import {PATTERN_DEMO_ACTIONS} from '../packages/shared/src/pattern-demo.js';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createMonitor,command,tick} from '../packages/shared/src/monitor.js';
const root=resolve(import.meta.dirname,'..');
const mode=process.argv[2]||'--both';
let state=createMonitor(),last=performance.now();
const recordings=createRecordingService();
const timer=setInterval(()=>{const now=performance.now();tick(state,Math.min(1,(now-last)/1000));last=now;recordings.capture(state);},100);timer.unref();
const valid=new Set(['reset','acknowledge','auto','calibrate','cancel-calibration','accumulate','recover','normal','caution','warning',...PATTERN_DEMO_ACTIONS]);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
function start(app,port){
 const appRoot=resolve(root,'apps',app),sharedRoot=resolve(root,'packages/shared/src');
 const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/state'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(state));return;}
 if(['/api/command','/api/recording'].includes(url.pathname)&&req.method==='POST'){
 const origin=req.headers.origin;
 if(origin&&!['http://127.0.0.1:4173','http://127.0.0.1:4174','http://localhost:4173','http://localhost:4174'].includes(origin)){res.writeHead(403).end();return;}
 let data='';for await(const chunk of req){data+=chunk;if(data.length>2048){res.writeHead(413).end();return;}}
 let body;try{body=JSON.parse(data);}catch{res.writeHead(400).end();return;}
 if(url.pathname==='/api/recording'){
 if(app!=='mobile-web'){res.writeHead(403).end();return;}
 try{let result;if(body.action==='start')result=recordings.start(state,body.id);else if(body.action==='stop')result=recordings.stop(body.id);else if(body.action==='status')result=recordings.status(body.id);else throw Error('지원하지 않는 기록 요청입니다.');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(result));}
 catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}return;
 }
 if(!valid.has(body.action)||(app==='admin-web'&&body.action!=='acknowledge')){res.writeHead(400).end();return;}
 state=command(state,body.action);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(state));return;
 }
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 const path=decodeURIComponent(url.pathname),shared=path.startsWith('/shared/');
 const base=shared?sharedRoot:appRoot;
 const relative=shared?path.slice(8):(path==='/'?(app==='mobile-web'?'demo.html':'index.html'):path.slice(1));
 const file=resolve(base,relative);
 if(!file.startsWith(base+sep)||!mime[extname(file)]){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(await readFile(file));
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Not found');}
 });
 server.listen(port,'127.0.0.1',()=>console.log(`${app}: http://127.0.0.1:${server.address().port}`));
 server.on('error',e=>{console.error(`${app}: ${e.message}`);process.exitCode=1;});
 return server;
}
const servers=[];
if(mode!=='--mobile')servers.push(start('admin-web',mode==='--verify'?0:4173));
if(mode!=='--admin')servers.push(start('mobile-web',mode==='--verify'?0:4174));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);servers.forEach(s=>s.close());});
