import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitor,command,tick,statusCopy} from './src/monitor.js';
import {statusFor} from './src/model.js';
test('held pressure continuously accumulates and emits one event per threshold',()=>{const s=createMonitor(0);command(s,'accumulate',0);let last=s.score;for(let i=1;i<=450;i++){tick(s,.1,i*100);assert.ok(s.score>=last);last=s.score;}assert.equal(statusFor(s.score),'warning');assert.equal(s.events.filter(e=>e.type==='caution').length,1);assert.equal(s.events.filter(e=>e.type==='warning').length,1);assert.ok(s.seconds>44);});
test('recovery resets duration, decreases score and records effect only after completion',()=>{const s=command(createMonitor(0),'warning',0);command(s,'recover',0);tick(s,2,2000);assert.ok(s.score<78&&s.score>21);assert.equal(s.seconds,0);assert.equal(s.events.filter(e=>e.type==='recovery').length,0);tick(s,2,4000);assert.equal(s.score,21);const e=s.events.at(-1);assert.equal(e.type,'recovery');assert.equal(e.beforeScore,78);assert.equal(e.reduction,61);assert.equal(statusCopy(s).recovered,true);});
test('manager acknowledgement is idempotent and does not clear pressure warning',()=>{const s=command(createMonitor(0),'warning',0);command(s,'acknowledge',100);command(s,'acknowledge',200);assert.equal(s.events.filter(e=>e.type==='ack').length,1);assert.equal(s.ack,true);assert.equal(statusFor(s.score),'warning');});
test('calibration needs ten seconds and can be cancelled',()=>{let s=createMonitor(0);command(s,'calibrate',0);tick(s,9,9000);assert.equal(s.baseline,false);command(s,'cancel-calibration',9000);tick(s,2,11000);assert.equal(s.baseline,false);command(s,'calibrate',12000);for(let i=1;i<=102;i++)tick(s,.1,12000+i*100);assert.equal(s.baseline,true);assert.equal(s.events.at(-1).type,'setup');});
test('full presentation cycle contains setup, normal, caution, warning and recovery',()=>{let s=command(createMonitor(0),'auto',0);for(let i=1;i<=650;i++)tick(s,.1,i*100);assert.equal(s.auto,false);assert.equal(s.baseline,true);assert.equal(s.mode,'stable');assert.equal(s.score,21);assert.deepEqual(s.events.map(e=>e.type),['normal','setup','caution','warning','recovery']);});
test('repeated pressure after recovery creates a new caution event',()=>{let s=command(createMonitor(0),'warning',0);command(s,'recover',0);tick(s,4,4000);command(s,'accumulate',5000);tick(s,21,26000);assert.equal(s.events.at(-1).type,'caution');assert.ok(s.seconds>=20);});
test('starting accumulation preserves every preset and recovered sample',()=>{
 for(const action of ['normal','caution','warning','recovered']){
  const s=command(createMonitor(0),action==='recovered'?'warning':action,0);
  if(action==='recovered'){command(s,'recover',0);tick(s,4,4000);}
  const before={score:s.score,values:[...s.values],seconds:s.seconds};
  command(s,'accumulate',5000);tick(s,.1,5100);
  assert.ok(s.score>=before.score,`${action} must not lose risk on accumulation`);
  assert.ok(s.score-before.score<1);
  assert.ok(s.values.every((v,i)=>Math.abs(v-before.values[i])<1));
  assert.ok(s.seconds>=before.seconds);
  assert.equal(statusCopy(s).recovered,false);
 }
});
test('stopping auto during recovery never declares incomplete recovery stable',()=>{
 let s=command(createMonitor(0),'auto',0);
 for(let i=1;i<=600;i++)tick(s,.1,i*100);
 assert.equal(s.mode,'recovering');assert.ok(s.score>=70);
 s=command(s,'auto',60000);
 assert.equal(s.auto,false);assert.equal(statusCopy(s).recovered,false);
 assert.equal(statusCopy(s).label,'경고');
 assert.equal(s.events.filter(e=>e.type==='recovery').length,0);
 command(s,'recover',61000);tick(s,4,65000);
 assert.equal(statusCopy(s).recovered,true);
 assert.equal(s.events.filter(e=>e.type==='recovery').length,1);
});
test('repeated accumulate commands do not restart ongoing accumulation',()=>{
 const s=createMonitor(0);command(s,'accumulate',0);tick(s,25,25000);
 const before=s.score;command(s,'accumulate',25000);tick(s,1,26000);
 assert.ok(s.score>before);assert.equal(s.seconds,26);
 assert.equal(s.events.filter(e=>e.type==='caution').length,1);
});
