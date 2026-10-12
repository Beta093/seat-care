// Mutates and resets ONLY the project's local demo state; never run during a presentation.
import assert from 'node:assert/strict';
const mobile='http://127.0.0.1:4174',admin='http://127.0.0.1:4173';
const read=async base=>(await (await fetch(base+'/api/state')).json());
const cmd=async action=>{const r=await fetch(mobile+'/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});assert.equal(r.status,200);return r.json();};
const until=async predicate=>{const deadline=Date.now()+15000;while(Date.now()<deadline){const s=await read(admin);if(predicate(s))return s;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out waiting for shared inference');};
try{
 for(const base of [mobile,admin])for(const path of ['/','/src/app.js','/shared/pattern.js','/shared/pattern-view.js'])assert.equal((await fetch(base+path)).status,200);
 assert.equal((await cmd('reset')).pattern.result.status,'unknown');await cmd('calibrate');
 let s=await until(s=>s.pattern.result.code==='similar');assert.ok(s.pattern.baseline.durationMs>=10000);const score=s.score;
 await cmd('pattern-right');s=await until(s=>s.pattern.result.code==='right');assert.equal(s.score,score);assert.equal((await read(mobile)).pattern.baseline.id,s.pattern.baseline.id);
 for(const [action,reason]of [['pattern-stale','stale'],['pattern-zero','no_load'],['pattern-missing','missing'],['pattern-fault','fault'],['pattern-repeat','repeated']]){await cmd(action);await until(s=>s.pattern.result.status==='unknown'&&s.pattern.result.reason===reason);}
 await cmd('pattern-reference');await until(s=>s.pattern.result.code==='similar');
 assert.equal((await fetch(admin+'/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pattern-right'})})).status,400);
 console.log('PASS: calibration, independent pattern/score, shared admin state, bad-input abstention, recovery, restricted admin commands.');
}finally{await cmd('reset');}
