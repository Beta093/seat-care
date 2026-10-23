import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENES,emptyRehearsal,transition,sceneView,publicState,alertPreview,alertView} from './src/rehearsal.js';
import {createHandler,roleKeys} from '../../api/rehearsal.js';
const key='a'.repeat(64),keys=roleKeys(key);
function harness(){let state=emptyRehearsal(),etag=0,clock=1000;const handler=createHandler({secret:key,now:()=>clock,read:async()=>({state:structuredClone(state),etag}),write:async(next,expected)=>{if(expected!==etag)throw Error('precondition failed');state=next;etag++;}});return {advance(ms=10000){clock+=ms;},get state(){return state;},async call(role,body,method=body?'POST':'GET'){const req={method,headers:{authorization:'Bearer '+(keys[role]||role)},body},res={setHeader(){return this;},status(code){this.code=code;return this;},json(data){this.data=data;}};await handler(req,res);return res;}};}
const command=(scene='right',revision='waiting')=>({action:'scene',scene,region:'right',minutes:10,expectedRevision:revision,requestId:crypto.randomUUID()});
test('five PDF scenes have distinct load maps and recovery is an explicit scene',()=>{
 const maps=new Set(['left','right','front','back'].map(scene=>JSON.stringify(sceneView({...emptyRehearsal(),scene}).values)));assert.equal(maps.size,4);
 const s={...emptyRehearsal(),scene:'sustained',region:'left',minutes:12};assert.match(sceneView(s).body,/왼쪽.*12분/);assert.deepEqual(sceneView(s).values,SCENES.left.values);assert.match(SCENES.front.note,/가설/);
});
test('worker responses never change the scene or complete pressure relief',async()=>{const h=harness();await h.call('control',command());h.advance();const revision=h.state.revision;await h.call('control',{action:'notify',expectedRevision:revision,requestId:crypto.randomUUID()});for(const response of ['adjust','help']){const r=await h.call('worker',{action:'response',response,revision,alertId:h.state.alert.id,requestId:crypto.randomUUID()});assert.equal(r.code,200);assert.equal(h.state.scene,'right');assert.equal(h.state.revision,revision);}assert.equal(h.state.responses.worker.value,'help');assert.equal((await h.call('worker',command('relief',revision))).code,409);});
test('unauthenticated reads fail and invitation keys are only sent to the controller',async()=>{const h=harness();assert.equal((await h.call('invalid')).code,401);assert.ok((await h.call('control')).data.invites.worker);assert.equal((await h.call('worker')).data.invites,undefined);assert.equal((await h.call('admin')).data.invites,undefined);assert.equal((await h.call('control',null,'DELETE')).code,405);});
test('simultaneous viewer receipts survive conditional write retries and stale commands are rejected',async()=>{const h=harness();await h.call('control',command());const revision=h.state.revision;const results=await Promise.all(['worker','admin'].map(role=>h.call(role,{action:'receipt',revision,requestId:crypto.randomUUID()})));assert.ok(results.every(r=>r.code===200));assert.equal(h.state.receipts.worker.revision,revision);assert.equal(h.state.receipts.admin.revision,revision);assert.equal((await h.call('control',command('left'))).code,409);});
test('retrying an acknowledged request does not switch scenes twice; old responses cannot affect the new scene',async()=>{const h=harness(),input=command();await h.call('control',input);const revision=h.state.revision;await h.call('control',input);assert.equal(h.state.revision,revision);await h.call('control',command('relief',revision));assert.deepEqual(h.state.responses,{});assert.equal((await h.call('worker',{action:'response',response:'help',revision,requestId:crypto.randomUUID()})).code,409);});
test('invalid scene, duration, region and role cannot mutate state; expired scenes stop',()=>{const s=emptyRehearsal();for(const patch of [{scene:'constructor'},{minutes:0},{minutes:121},{region:'__proto__'}])assert.throws(()=>transition(s,{...command(),...patch},'control',1,'new'));const next=transition(s,command(),'control',100,'next');assert.equal(publicState(next,next.expiresAt).active,false);assert.equal(transition(next,{action:'finish',expectedRevision:'next'},'control',101,'end').active,false);});

test('scenario begins balanced, increases smoothly, then completes the pressure scene; recovery fades from current load',()=>{const s=transition(emptyRehearsal(),command(),'control',1000,'one');const start=sceneView(s,1000),middle=sceneView(s,6000),end=sceneView(s,9000);assert.deepEqual(start.values,SCENES.basic.values);assert.equal(start.phase,'baseline');assert.equal(middle.phase,'changing');assert.ok(middle.values[1]>start.values[1]&&middle.values[1]<end.values[1]);assert.equal(end.title,SCENES.right.title);assert.equal(end.phase,'complete');assert.throws(()=>transition(s,{action:'response',response:'help',revision:'one'},'worker',3000,'x'));const relief=transition(s,command('relief','one'),'control',9000,'two');assert.deepEqual(sceneView(relief,9000).values,end.values);assert.deepEqual(sceneView(relief,13000).values,SCENES.relief.values);});

test('right-to-left transition lowers right pressure and raises left pressure without resetting',()=>{
 const right=transition(emptyRehearsal(),command(),'control',1000,'right');
 const left=transition(right,{...command('left','right'),region:'left'},'control',9000,'left');
 assert.equal(left.motion.holdMs,0);
 assert.deepEqual(sceneView(left,9000).values,SCENES.right.values);
 let previous=sceneView(left,9000).values;
 for(let at=10000;at<=17000;at+=1000){const view=sceneView(left,at);for(const i of [0,2])assert.ok(view.values[i]>previous[i]);for(const i of [1,3])assert.ok(view.values[i]<previous[i]);if(at<17000){assert.equal(view.phase,'changing');assert.notEqual(view.title,SCENES.left.title);}previous=view.values;}
 assert.deepEqual(previous,SCENES.left.values);assert.equal(sceneView(left,17000).title,SCENES.left.title);
});
test('interrupting any in-progress scene starts exactly at its current interpolated distribution',()=>{
 let state=transition(emptyRehearsal(),command(),'control',1000,'one');
 for(const [index,scene] of ['left','back','front','sustained','relief','basic'].entries()){
  const at=4000+index*1000,before=sceneView(state,at).values;
  const next=transition(state,{...command(scene,state.revision),region:'left'},'control',at,'switch-'+index);
  assert.deepEqual(sceneView(next,at).values,before);assert.equal(next.motion.holdMs,0);assert.equal(sceneView(next,at).phase,'changing');state=next;
 }
 assert.deepEqual(sceneView(state,state.changedAt+4000).values,SCENES.basic.values);
});
test('reselecting a completed scene holds its pressure while restarting after finish begins balanced',()=>{
 const first=transition(emptyRehearsal(),command(),'control',1000,'one');
 const again=transition(first,command('right','one'),'control',9000,'two');
 assert.deepEqual(sceneView(again,12000).values,SCENES.right.values);
 const ended=transition(again,{action:'finish',expectedRevision:'two'},'control',13000,'end');
 const restarted=transition(ended,command('left','end'),'control',14000,'restart');
 assert.deepEqual(sceneView(restarted,14000).values,SCENES.basic.values);assert.equal(sceneView(restarted,14000).phase,'baseline');
});

test('alerts are manual, controller-only, and do not restart pressure motion even when sent mid-transition',async()=>{
 const h=harness();await h.call('control',command());h.advance(3000);const before=structuredClone(h.state);
 assert.equal(alertView(h.state),null);assert.equal((await h.call('worker',{action:'response',response:'help',revision:before.revision,requestId:crypto.randomUUID()})).code,409);
 const input={action:'notify',expectedRevision:before.revision,requestId:crypto.randomUUID()};
 assert.equal((await h.call('worker',input)).code,409);assert.equal((await h.call('control',input)).code,200);
 assert.deepEqual(h.state.motion,before.motion);assert.equal(h.state.changedAt,before.changedAt);assert.equal(h.state.revision,before.revision);assert.equal(alertView(h.state).title,'오른쪽 편중');
 const id=h.state.alert.id;await h.call('control',input);assert.equal(h.state.alert.id,id);
 assert.equal((await h.call('worker',{action:'response',response:'help',revision:before.revision,alertId:id,requestId:crypto.randomUUID()})).code,200);
});
test('resending, clearing and changing scenes invalidate old popup responses and delivery receipts',async()=>{
 const h=harness();await h.call('control',command());const revision=h.state.revision;
 const notify=()=>h.call('control',{action:'notify',expectedRevision:revision,expectedAlertId:h.state.alert?.id??null,requestId:crypto.randomUUID()});
 await notify();const old=h.state.alert.id;await notify();assert.notEqual(h.state.alert.id,old);
 for(const action of ['response','receipt'])assert.equal((await h.call('worker',{action,response:'help',revision,alertId:old,requestId:crypto.randomUUID()})).code,409);
 const id=h.state.alert.id;
 const receipts=await Promise.all(['worker','admin'].map(role=>h.call(role,{action:'receipt',revision,alertId:id,requestId:crypto.randomUUID()})));
 assert.ok(receipts.every(r=>r.code===200));assert.equal(h.state.receipts.worker.alertId,id);assert.equal(h.state.receipts.admin.alertId,id);
 await h.call('control',{action:'clear-alert',expectedRevision:revision,expectedAlertId:id,requestId:crypto.randomUUID()});assert.equal(alertView(h.state),null);assert.deepEqual(h.state.responses,{});
 await notify();await h.call('control',command('left',revision));assert.equal(alertView(h.state),null);
});
test('every popup explicitly identifies its pressure direction, including sustained duration',()=>{
 for(const [scene,direction] of [['right','오른쪽'],['left','왼쪽'],['front','앞쪽'],['back','뒤쪽']]){
  const state={...emptyRehearsal(),active:true,scene,region:'right'};assert.match(alertPreview(state).title,new RegExp(direction+' 편중'));assert.match(alertPreview(state).body,new RegExp(direction));assert.equal(alertView(state),null);
 }
 const state={...emptyRehearsal(),active:true,scene:'sustained',region:'back',minutes:12,alert:{id:'x'}};assert.match(alertView(state).title,/뒤쪽.*12분/);
 for(const scene of ['basic','relief'])assert.equal(alertPreview({...state,scene}),null);
 assert.equal(alertView({...state,active:false}),null);
});
