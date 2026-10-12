import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitor,command,tick} from './src/monitor.js';
import {createPatternSession,DEMO_LAYOUT,presentPattern} from './src/pattern.js';
import {paintPattern} from './src/pattern-view.js';
import {CHANNEL_IDS} from './src/layout.js';
function textRoot(){const nodes=new Map(['#pattern-title','#pattern-reason','#pattern-source','#pattern-right','#pattern-rear','#pattern-center','#pattern-baseline','#pattern-baseline-note'].map(id=>[id,{textContent:''}]));return {querySelector:selector=>nodes.get(selector)??null,text:selector=>nodes.get(selector)?.textContent};}
const packet=(at,seq,values=[30,31,36,35,28])=>({source:'demo',layoutId:DEMO_LAYOUT.id,streamId:'boundary-test',channelIds:[...CHANNEL_IDS],values,sampledAt:at,sequence:seq,sensorStatus:'ok'});
test('a valid ambiguous distribution replaces previous direction in both presentation contexts',()=>{
 let now=0,s=createMonitor(now);s=command(s,'calibrate',now);
 const advance=count=>{for(let i=0;i<count;i++){now+=100;tick(s,.1,now);}};advance(125);s=command(s,'pattern-right',++now);advance(25);assert.equal(s.pattern.result.code,'right');
 s=command(s,'caution',++now);advance(25);assert.equal(s.score,52);assert.equal(s.pattern.result.reason,'boundary');assert.equal(s.pattern.result.code,null);
 for(const context of ['mobile','admin']){const root=textRoot(),view=paintPattern(s,true,root,now);assert.equal(view.status,'unknown',context);assert.equal(root.text('#pattern-title'),'판단 불가');assert.match(root.text('#pattern-reason'),/모호/);assert.match(root.text('#pattern-right'),/% 폭/);}
 s=command(s,'pattern-reference',++now);advance(25);assert.equal(s.pattern.result.code,'similar');
});
test('legacy geometry cannot calibrate, and changing to the adopted layout requires a full fresh window',()=>{
 const engine=createPatternSession({...DEMO_LAYOUT,id:'demo-five-v1'});engine.startCalibration(0);let s;
 for(let i=0;i<125;i++)s=engine.consume({...packet(i*100,i),layoutId:'demo-five-v1'},i*100);
 assert.equal(s.baseline,null);assert.equal(s.result.status,'unknown');engine.configure(DEMO_LAYOUT);assert.equal(engine.snapshot(12500).baseline,null);engine.startCalibration(12500);
 for(let i=0;i<100;i++)s=engine.consume(packet(12500+i*100,i),12500+i*100);assert.equal(s.baseline,null);
 s=engine.consume(packet(22500,100),22500);assert.ok(s.baseline);assert.equal(s.baseline.durationMs,10000);assert.equal(s.baseline.layoutId,DEMO_LAYOUT.id);
});
test('old baseline rules or coordinate signature are not displayed as a valid registered baseline',()=>{
 const engine=createPatternSession();engine.startCalibration(0);let s;for(let i=0;i<125;i++)s=engine.consume(packet(i*100,i),i*100);
 for(const patch of [{version:'pressure-pattern-rules-v1'},{geometrySignature:'old-center-at-0.5'},{layoutId:'demo-five-v1'}]){const state={pattern:{...s,baseline:{...s.baseline,...patch}}},root=textRoot();assert.equal(presentPattern(state,true,12400).reason,'layout_changed');paintPattern(state,true,root,12400);assert.equal(root.text('#pattern-baseline'),'미등록');assert.equal(root.text('#pattern-right'),'—');}
});
