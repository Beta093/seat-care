import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createHandler} from '../api/rehearsal.js';
import {emptyRehearsal} from '../packages/shared/src/rehearsal.js';
const secret=process.env.REHEARSAL_PREVIEW_TOKEN||randomBytes(32).toString('hex');
let state=emptyRehearsal(),version=0;
const handler=createHandler({secret,read:async()=>({state:structuredClone(state),etag:String(version)}),write:async(next,etag)=>{if(etag!==String(version))throw Error('precondition failed');state=structuredClone(next);version++;}});
const root=resolve('dist'),mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.status=code=>{res.statusCode=code;return res;};res.json=data=>res.setHeader('Content-Type','application/json').end(JSON.stringify(data));
 if(url.pathname==='/api/rehearsal'){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048){res.status(413).json({error:'too large'});return;}}
  req.body=body;await handler(req,res);return;
 }
 try{const path=decodeURIComponent(url.pathname),relative=path.endsWith('/')?path+'index.html':path;const file=resolve(root,relative.slice(1));if(!file.startsWith(root+sep)||!mime[extname(file)])throw Error();res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',mime[extname(file)]);res.end(await readFile(file));}catch{res.status(404).end('Not found');}
});
server.listen(Number(process.env.PORT||4186),'127.0.0.1',()=>console.log(`Rehearsal preview (memory only): http://127.0.0.1:${server.address().port}/rehearsal/#key=${secret}`));
