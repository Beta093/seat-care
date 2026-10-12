import test from 'node:test';
import assert from 'node:assert/strict';
import {connectMonitor} from './src/client.js';
const response=data=>({ok:true,json:async()=>data});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const timerOptions={setInterval:()=>1,clearInterval:()=>{}};
test('a delayed state fetch cannot overwrite a newer command result',async()=>{
 const poll=deferred(),snapshots=[];
 const client=connectMonitor(s=>snapshots.push(s),()=>{},{...timerOptions,fetch:async(url)=>url==='/api/state'?poll.promise:response({score:78})});
 await client.command('warning');poll.resolve(response({score:16}));await flush();
 assert.deepEqual(snapshots,[{score:78}]);client.close();
});
test('command errors report disconnected and suppress concurrent commands',async()=>{
 const post=deferred(),connections=[];let posts=0;
 const client=connectMonitor(()=>{},ok=>connections.push(ok),{...timerOptions,fetch:async(url)=>{if(url==='/api/state')return response({score:16});posts++;return post.promise;}});
 await flush();const first=client.command('warning');
 await assert.rejects(client.command('reset'),/이전 요청/);assert.equal(posts,1);
 post.reject(Error('offline'));await assert.rejects(first,/offline/);
 assert.equal(connections.at(-1),false);client.close();
});
test('closed monitor does not publish late callbacks',async()=>{
 const pending=deferred(),seen=[];
 const client=connectMonitor(s=>seen.push(s),s=>seen.push(s),{...timerOptions,fetch:()=>pending.promise});
 client.close();pending.resolve(response({score:16}));await flush();assert.deepEqual(seen,[]);
 await assert.rejects(client.command('normal'),/종료/);
});
test('polling can reconnect after a failed request',async()=>{
 let fail=true;const states=[],connections=[];
 const client=connectMonitor(s=>states.push(s),s=>connections.push(s),{...timerOptions,fetch:async()=>{if(fail)throw Error('offline');return response({score:52});}});
 await flush();fail=false;await client.refresh();
 assert.deepEqual(connections,[false,true]);assert.deepEqual(states,[{score:52}]);client.close();
});
test('visibility resume supersedes a suspended fetch and ignores its late response',async()=>{
 const doc=new EventTarget(),win=new EventTarget();doc.visibilityState='visible';const slow=deferred(),seen=[];let requests=0,aborted=false;
 const client=connectMonitor(s=>seen.push(s),()=>{},{...timerOptions,document:doc,window:win,fetch:async(url,options)=>{requests++;if(requests===1){options.signal.addEventListener('abort',()=>{aborted=true;});return slow.promise;}return response({score:52});}});
 doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));assert.equal(aborted,true);
 doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(requests,2);assert.deepEqual(seen,[{score:52}]);
 slow.resolve(response({score:16}));await flush();assert.deepEqual(seen,[{score:52}]);client.close();
});
test('focus, page restore and route changes fetch immediately without waiting for the timer',async()=>{
 const doc=new EventTarget(),win=new EventTarget();doc.visibilityState='visible';let requests=0;const connections=[];
 const client=connectMonitor(()=>{},s=>connections.push(s),{...timerOptions,document:doc,window:win,fetch:async()=>{requests++;return response({score:16});}});await flush();
 for(const event of ['focus','pageshow','hashchange','online']){const previous=requests;win.dispatchEvent(new Event(event));await flush();assert.equal(requests,previous+1);assert.deepEqual(connections.slice(-2),[false,true]);}
 client.close();const before=requests;win.dispatchEvent(new Event('focus'));await flush();assert.equal(requests,before);
});
test('unchanged values are published on each successful scheduled fetch',async()=>{
 let interval;const seen=[];let stamp=0;const client=connectMonitor(s=>seen.push(s),()=>{},{setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{},fetch:async()=>response({score:16,updatedAt:stamp++})});
 await flush();for(let i=0;i<5;i++){interval();await flush();}assert.equal(seen.length,6);assert.equal(new Set(seen.map(s=>s.updatedAt)).size,6);client.close();
});
test('an old in-flight response cannot unblock or replace a newer resumed request',async()=>{
 const one=deferred(),two=deferred();let calls=0;const seen=[];const client=connectMonitor(s=>seen.push(s),()=>{},{...timerOptions,fetch:()=>++calls===1?one.promise:two.promise});
 const resume=client.refresh({force:true});one.resolve(response({score:16}));await flush();await client.refresh();assert.equal(calls,2);two.resolve(response({score:78}));await resume;assert.deepEqual(seen,[{score:78}]);client.close();
});
