import test from 'node:test';
import assert from 'node:assert/strict';
import {ForegroundNotifications} from '../../apps/mobile-web/src/foreground-notifications.js';
function setup({permission,worker,hidden=false}={}){
 const shown=[];let requests=0;
 const window=permission?{Notification:{permission,requestPermission:async()=>{requests++;return permission;}}}:{};
 const document={hidden},navigator=worker?{serviceWorker:worker}:{};
 const alerts=new ForegroundNotifications({window,document,navigator,onScreen:(...args)=>shown.push(args)});
 return {alerts,shown,document,get requests(){return requests;}};
}
test('unsupported and denied system notifications still show foreground feedback without requesting permission',async()=>{
 for(const permission of [undefined,'denied','default']){
  const f=setup({permission,worker:{}});assert.equal((await f.alerts.show('주의','몸을 옮겨 주세요')).system,permission||'unsupported');assert.equal(f.shown.length,1);assert.equal(f.requests,0);
 }
});
test('hidden page neither shows feedback nor sends a system notification; visible page works again',async()=>{
 let delivered=0;const f=setup({hidden:true,permission:'granted',worker:{getRegistration:async()=>({active:true,showNotification:async()=>{delivered++;}})}});
 assert.equal((await f.alerts.show('주의','내용')).system,'paused');assert.equal(f.shown.length,0);assert.equal(delivered,0);
 f.document.hidden=false;assert.equal((await f.alerts.show('주의','내용')).system,'shown');assert.equal(f.shown.length,1);assert.equal(delivered,1);
});
test('service-worker failure or missing active worker does not remove the screen alert',async()=>{
 for(const getRegistration of [async()=>undefined,async()=>({active:false}),async()=>{throw Error('blocked');},async()=>({active:true,showNotification:async()=>{throw Error('denied');}})]){
  const f=setup({permission:'granted',worker:{getRegistration}});assert.ok(['failed','unavailable'].includes((await f.alerts.show('주의','내용')).system));assert.equal(f.shown.length,1);
 }
});
test('hiding during worker lookup cancels system delivery',async()=>{
 let delivered=false;const f=setup({permission:'granted',worker:{getRegistration:async()=>{f.document.hidden=true;return {active:true,showNotification:async()=>{delivered=true;}};}}});
 assert.equal((await f.alerts.show('주의','내용')).system,'paused');assert.equal(delivered,false);
});
test('system permission is optional and is only requested by the explicit enable action',async()=>{
 const unsupported=setup();assert.deepEqual(await unsupported.alerts.enableSystem(),{granted:false,reason:'unsupported'});
 const f=setup({permission:'denied',worker:{}});assert.deepEqual(await f.alerts.enableSystem(),{granted:false,reason:'denied'});assert.equal(f.requests,1);
});
