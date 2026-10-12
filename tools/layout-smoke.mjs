// Isolated ephemeral localhost servers. Never resets the user's 4173/4174 state.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {GEOMETRY,CHANNEL_IDS} from '../packages/shared/src/layout.js';
import {parseRecording,createPlayback} from '../packages/shared/src/recording.js';
const server=spawn(process.execPath,[new URL('./dev-server.mjs',import.meta.url).pathname,'--verify'],{stdio:['ignore','pipe','pipe']});
let output='',errors='';server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>errors+=chunk);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const deadline=Date.now()+5000;while(!output.includes('mobile-web:')||!output.includes('admin-web:')){if(server.exitCode!==null||Date.now()>deadline)throw Error(errors||'Startup timeout');await wait(50);}
 const mobile=output.match(/mobile-web: (http:\/\/127.0.0.1:\d+)/)[1],admin=output.match(/admin-web: (http:\/\/127.0.0.1:\d+)/)[1];
 const post=async(path,body)=>{const r=await fetch(mobile+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
 const read=async base=>(await(await fetch(base+'/api/state')).json());
 const cmd=action=>post('/api/command',{action});
 const until=async code=>{const end=Date.now()+15000;while(Date.now()<end){const s=await read(admin);if(typeof code==='function'?code(s):s.pattern.result.code===code)return s;await wait(150);}throw Error('Pattern timeout: '+code);};
 let s=await read(mobile);assert.equal(s.pattern.layout.id,GEOMETRY.id);assert.deepEqual(s.pattern.sample.channelIds,CHANNEL_IDS);assert.equal(s.pattern.baseline,null);
 for(const base of [mobile,admin])for(const route of ['/','/shared/layout.js','/shared/view.js','/shared/recording.js'])assert.equal((await fetch(base+route)).status,200);
 await cmd('calibrate');s=await until('similar');assert.equal(s.pattern.baseline.layoutId,GEOMETRY.id);assert.ok(s.pattern.baseline.geometrySignature);
 const id=crypto.randomUUID();await post('/api/recording',{action:'start',id});
 for(const [action,code]of [['left','left'],['right','right'],['front','front'],['rear','rear'],['right-rear','right-rear'],['center-rear','center-rear-up']]){await cmd('pattern-'+action);s=await until(code);assert.equal((await read(mobile)).pattern.result.code,code);}
 assert.equal(s.pattern.result.features.maximumChannel,'C1');
 await cmd('caution');s=await until(s=>s.pattern.result.reason==='boundary');assert.equal(s.pattern.result.status,'unknown');assert.equal(s.score,52);const ambiguousMobile=await read(mobile);assert.equal(ambiguousMobile.pattern.result.reason,'boundary');assert.equal(ambiguousMobile.pattern.result.code,null);
 await cmd('pattern-missing');await wait(900);s=await read(admin);assert.equal(s.pattern.result.status,'unknown');
 const recorded=await post('/api/recording',{action:'stop',id});assert.ok(recorded.skippedFrames>0);const data=parseRecording(JSON.stringify(recorded.recording));assert.equal(data.version,2);assert.equal(data.layout.points.C1.y,.85);assert.deepEqual(data.layout.channelIds,CHANNEL_IDS);
 const old={...data,version:1};delete old.layout;assert.equal(createPlayback(old).layout,null);
 const bad=structuredClone(data);bad.layout.points.C1.y=.5;assert.throws(()=>parseRecording(JSON.stringify(bad)));
 await cmd('pattern-reference');await until('similar');
 console.log(`PASS: isolated servers; adopted geometry; recalibration; six patterns shared; C1 posterior; ambiguous distribution abstention on both APIs; invalid-input abstention; v2 recording ${data.frames.length} frames; v1 map suppression; coordinate mismatch rejected.`);
}finally{if(server.exitCode===null){server.kill('SIGTERM');await once(server,'exit');}}
