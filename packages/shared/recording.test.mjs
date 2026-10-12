import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitor,command} from './src/monitor.js';
import {createRecorder,createPlayback,parseRecording,validateRecording,RECORDING_LIMITS} from './src/recording.js';
function fixture(){let now=0;const recorder=createRecorder(()=>now,()=>1000);const state=createMonitor(0);recorder.start(state);now=250;recorder.capture(command(state,'warning',250));now=500;recorder.capture(command(state,'normal',500));recorder.stop();return recorder.snapshot();}
test('recording starts at zero and cannot fabricate past samples or restart on double click',()=>{
 let now=100;const s=createMonitor(0),r=createRecorder(()=>now,()=>1000);
 assert.throws(()=>r.snapshot());assert.equal(r.start(s),true);now=200;
 assert.equal(r.start(s),false);r.capture(s);assert.equal(r.count,2);r.stop();
 const data=r.snapshot();assert.deepEqual(data.frames.map(f=>f.t),[0,100]);assert.equal(data.source,'demo');
 s.values[0]=99;assert.notEqual(data.frames[0].values[0],99);
});
test('old snapshots, malformed JSON, wrong version, source and oversized files are rejected',()=>{
 assert.throws(()=>parseRecording('{'));assert.throws(()=>parseRecording(JSON.stringify({format:'seat-care-demo-report',version:1})));
 for(const patch of [{version:3},{source:'sensor'},{startedAt:null},{frames:[]}])assert.throws(()=>validateRecording({...fixture(),...patch}));
 assert.throws(()=>parseRecording(' '.repeat(RECORDING_LIMITS.bytes+1)),/2 MiB/);
});
test('all frames require finite bounded numbers, five channels and ordered time',()=>{
 for(const patch of [{t:0},{t:-1},{t:600001},{score:NaN},{score:101},{seconds:-1},{seconds:null},{values:[1,2,3,4]},{values:[1,2,3,4,Infinity]},{values:[1,2,3,4,'5']}]){
  const data=fixture();data.frames[1]={...data.frames[1],...patch};assert.throws(()=>validateRecording(data));
 }
 const data=fixture();data.frames[0].t=1;assert.throws(()=>validateRecording(data));
});
test('recording stops at time and frame limits without appending invalid samples',()=>{
 let now=0;const s=createMonitor(),r=createRecorder(()=>now);r.start(s);now=1;r.capture(s);now=600001;r.capture(s);assert.equal(r.active,false);assert.equal(r.snapshot().frames.length,2);
 now=0;r.start(s);for(now=1;now<=2401;now++)r.capture(s);assert.equal(r.active,false);assert.equal(r.snapshot().frames.length,2401);
});
test('non-demo or invalid input stops capture without accepting the invalid frame',()=>{
 let now=0;const s=createMonitor(),r=createRecorder(()=>now);assert.throws(()=>r.start({...s,source:'sensor'}));r.start(s);now=250;r.capture(s);now=500;
 assert.throws(()=>r.capture({...s,values:[1]}));assert.equal(r.active,false);assert.equal(r.snapshot().frames.length,2);
});
test('pause, resume, duplicate play, seek and end use recorded frames only',()=>{
 let now=0;const p=createPlayback(fixture(),()=>now);p.play();now=100;p.play();now=300;p.tick();assert.equal(p.position,300);assert.equal(p.frame().score,78);
 p.pause();now=5000;p.tick();assert.equal(p.position,300);p.seek(0);assert.equal(p.frame().score,16);
 p.play();now=5500;p.tick();assert.equal(p.playing,false);assert.equal(p.position,500);assert.equal(p.frame().score,16);
 assert.throws(()=>p.seek(-1));assert.throws(()=>p.seek(Infinity));p.play();assert.equal(p.position,0);
});
test('import round trip clones only the playback schema and cannot inject event markup',()=>{
 const data=fixture();data.events=[{title:'<script>bad</script>'}];data.frames[0].title='<img onerror=bad>';
 const parsed=parseRecording(JSON.stringify(data));assert.equal(parsed.events,undefined);assert.equal(parsed.frames[0].title,undefined);
 const p=createPlayback(parsed);p.frame().values[0]=99;assert.notEqual(p.frame().values[0],99);
});
test('stopped recording cannot capture further updates and one-frame recordings cannot replay',()=>{
 let now=0;const r=createRecorder(()=>now);r.start(createMonitor());r.stop();now=300;assert.equal(r.capture(createMonitor()),false);assert.throws(()=>r.snapshot());
});
