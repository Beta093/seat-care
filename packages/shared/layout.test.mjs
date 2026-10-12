import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANNEL_IDS,CHANNELS,GEOMETRY,geometryValid} from './src/layout.js';
import {interpolate} from './src/model.js';
import {DEMO_LAYOUT,featuresOf,createPatternSession,presentPattern} from './src/pattern.js';
import {createMonitor,command} from './src/monitor.js';
import {createRecorder,createPlayback,parseRecording} from './src/recording.js';
import {heatmapMarkup} from './src/view.js';
const base=[30,31,36,35,28];
const packet=(at,seq,values=base,channelIds=CHANNEL_IDS)=>({source:'demo',layoutId:GEOMETRY.id,streamId:'mapped',channelIds:[...channelIds],values:[...values],sampledAt:at,sequence:seq,sensorStatus:'ok'});
test('drawing centers and named map markers match all five adopted coordinates',()=>{
 const points=[[.30,.30],[.70,.30],[.325,.675],[.675,.675],[.50,.85]];
 assert.deepEqual(CHANNEL_IDS.map(id=>[CHANNELS[id].x,CHANNELS[id].y]),points);
 for(const [i,id]of CHANNEL_IDS.entries()){const [x,y]=points[i],v=[10,20,30,40,90];assert.ok(Math.abs(interpolate(v,x,y)-v[i])<1e-5);assert.ok(heatmapMarkup.includes(`title="${id} · ${CHANNELS[id].label}"`));assert.ok(heatmapMarkup.includes(`left:${x*100}%;top:${y*100}%`));}
 assert.equal(GEOMETRY.unit,null);assert.equal(GEOMETRY.hardwareVerified,false);
});
test('C1 increases posterior weighted center and never behaves as a geometric-center sensor',()=>{
 const b=featuresOf(base),f=featuresOf([30,31,36,35,80]);assert.ok(f.rear>b.rear);assert.ok(Math.abs(f.right-b.right)<.001);assert.equal(f.maximumChannel,'C1');
 const total=base.reduce((a,b)=>a+b,0);assert.equal(b.rear,(30*.3+31*.3+36*.675+35*.675+28*.85)/total);
});
test('calibration can receive changing packet order without changing named measurements',()=>{
 const engine=createPatternSession();engine.startCalibration(0);let s;for(let i=0;i<125;i++){const swap=i%2;s=engine.consume(packet(i*100,i,swap?[31,30,35,36,28]:base,swap?['R1','L1','R2','L2','C1']:CHANNEL_IDS),i*100);}
 assert.equal(s.result.code,'similar');assert.deepEqual(s.baseline.values,base);assert.equal(s.baseline.layoutId,GEOMETRY.id);
 const old={...s.baseline,layoutId:'demo-five-v1'};assert.equal(presentPattern({pattern:{...s,baseline:old}},true,12400).reason,'layout_changed');
 const tampered=structuredClone(s);tampered.layout.points.C1.y=.5;assert.equal(presentPattern({pattern:tampered},true,12400).reason,'layout_changed');
 const bad=engine.consume({...packet(12500,125),layoutId:'demo-five-v1'},12500);assert.equal(bad.baseline,null);assert.equal(bad.result.reason,'layout_changed');
});
function recording(){let now=0;const r=createRecorder(()=>now,()=>0),s=createMonitor(0);r.start(s);now=300;r.capture(command(s,'normal',300));r.stop();return r.snapshot();}
test('new recordings carry v2 geometry, reject altered coordinates and stop on layout changes',()=>{
 const data=recording();assert.equal(data.version,2);assert.equal(data.layout.id,GEOMETRY.id);assert.deepEqual(createPlayback(data).layout,data.layout);
 for(const change of [d=>d.layout.id='demo-five-v1',d=>d.layout.points.C1.y=.5,d=>d.layout.channelIds[0]='GPIO1']){const d=structuredClone(data);change(d);assert.throws(()=>parseRecording(JSON.stringify(d)));}
 let now=0;const r=createRecorder(()=>now),s=createMonitor(0);r.start(s);now=300;r.capture(s);now=600;s.pattern.layout.id='old';assert.throws(()=>r.capture(s),/배치/);assert.equal(r.active,false);assert.equal(r.snapshot().frames.length,2);
});
test('v1 files retain numeric playback but never acquire the new geometry',()=>{
 const data=recording();data.version=1;delete data.layout;const parsed=parseRecording(JSON.stringify(data));assert.equal(parsed.layout,null);const p=createPlayback(parsed);assert.equal(p.layout,null);assert.deepEqual(p.frame().values,data.frames[0].values);
});
test('geometry validation rejects missing IDs, duplicated IDs and substituted sensor positions',()=>{
 for(const layout of [{...GEOMETRY,channelIds:['L1','R1','L2','R2','R2']},{...GEOMETRY,points:{...GEOMETRY.points,C1:{x:.5,y:.5}}},{...GEOMETRY,id:'legacy'}])assert.equal(geometryValid(layout),false);
});
