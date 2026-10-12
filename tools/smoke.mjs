// Run against this project's freshly started, local demo servers only.
import assert from 'node:assert/strict';
const mobile='http://127.0.0.1:4174',admin='http://127.0.0.1:4173';
const cmd=async(base,action)=>{const r=await fetch(base+'/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});assert.equal(r.status,200);return r.json();};
for(const base of [mobile,admin]){assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/shared/monitor.js')).status,200);}
try {
 await cmd(mobile,'reset');await cmd(mobile,'warning');
 let s=await (await fetch(admin+'/api/state')).json();assert.equal(s.score,78);
 await cmd(admin,'acknowledge');s=await (await fetch(mobile+'/api/state')).json();assert.equal(s.ack,true);
 await cmd(mobile,'recover');await new Promise(resolve=>setTimeout(resolve,4500));
 s=await (await fetch(admin+'/api/state')).json();assert.equal(s.score,21);assert.equal(s.events.at(-1).type,'recovery');
 await cmd(mobile,'caution');await cmd(mobile,'accumulate');await new Promise(resolve=>setTimeout(resolve,350));
 s=await (await fetch(admin+'/api/state')).json();assert.ok(s.score>=52);
 assert.equal((await fetch(admin+'/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset'})})).status,400);
 console.log('PASS: both pages/modules served; shared warning, acknowledgement, completed recovery, monotonic accumulation, admin command restriction.');
} finally {await cmd(mobile,'reset');}
