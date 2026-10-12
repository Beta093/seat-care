// Run only against this project's local demo; resets state. No browser polls during capture.
import assert from 'node:assert/strict';
import {parseRecording} from '../packages/shared/src/recording.js';
const mobile='http://127.0.0.1:4174',admin='http://127.0.0.1:4173',id=crypto.randomUUID();
const post=async(base,path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
const cmd=action=>post(mobile,'/api/command',{action});
const rec=action=>post(mobile,'/api/recording',{action,id});
try{
 await cmd('reset');const start=await rec('start');assert.equal(start.count,1);assert.equal((await rec('start')).id,id);
 assert.equal((await fetch(admin+'/api/recording',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',id:crypto.randomUUID()})})).status,403);
 console.log('Recording started; now leaving both state endpoints unpolled for 60 seconds.');
 await new Promise(resolve=>setTimeout(resolve,60000));
 const result=await rec('stop'),recording=parseRecording(JSON.stringify(result.recording));
 assert.ok(result.count>=150,`too few frames: ${result.count}`);assert.ok(result.durationMs>=59000);
 assert.deepEqual(recording.frames[0].values,recording.frames.at(-1).values);
 assert.deepEqual((await rec('stop')).recording,result.recording);
 console.log(`PASS: ${result.count} unchanged-value frames over ${result.durationMs}ms without browser/state polls; idempotent start/stop, JSON round trip, admin restriction.`);
}finally{await rec('stop').catch(()=>{});await cmd('reset');}
