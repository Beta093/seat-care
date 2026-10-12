import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseRecording,createPlayback} from './src/recording.js';
import {mountRecording} from './src/recording-ui.js';
const fixture=name=>readFile(new URL('../../docs/fixtures/'+name,import.meta.url),'utf8');
function ui(t){
 const original=globalThis.document,nodes=new Map(),downloads=[];
 class Element{
  constructor(selector){this.selector=selector;this.listeners=new Map();this.dataset={};this.hidden=false;this.disabled=false;this.textContent='';this.value='';if(selector.startsWith('[data-record='))this.dataset.record=selector.match(/"([^"]+)"/)[1];}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(x=>x!==fn));}
  async emit(type,extra={}){for(const fn of this.listeners.get(type)??[])await fn({target:this,...extra});}
  closest(selector){return selector==='[data-record]'&&this.dataset.record?this:null;}
  focus(){document.activeElement=this;}
  click(){} remove(){}
  getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{this.drawCount=(this.drawCount??0)+1;}};}
 }
 const find=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element(selector));return nodes.get(selector);};
 const host=new Element('host');host.querySelector=find;const doc=new Element('document');doc.body={classList:{add(){},remove(){}},append(){}};doc.querySelector=find;doc.createElement=()=>new Element('a');globalThis.document=doc;
 let mounted;t.after(()=>{mounted?.close();if(original===undefined)delete globalThis.document;else globalThis.document=original;});
 t.mock.method(globalThis,'setInterval',()=>1);t.mock.method(globalThis,'clearInterval',()=>{});t.mock.method(globalThis,'setTimeout',()=>1);
 t.mock.method(URL,'createObjectURL',blob=>{downloads.push(blob);return 'blob:fixture-test';});t.mock.method(URL,'revokeObjectURL',()=>{});
 mounted=mountRecording({host,getLive:()=>null,canRecord:()=>false,onModeChange:()=>{}});
 return {find,mounted,async load(raw){const input=find('input[type=file]');input.files=[{size:new TextEncoder().encode(raw).length,text:async()=>raw}];await input.emit('change');},async click(name){await host.emit('click',{target:find(`[data-record="${name}"]`)});},async seek(ms){const input=find('.playback-seek');input.value=String(ms);await input.emit('input');},async saved(){await this.click('save');assert.ok(downloads.length);return downloads.at(-1).text();}};
}
test('original legacy writer fixture preserves all numeric frames and has no geometry',async()=>{
 const raw=await fixture('legacy-v1-demo.json'),input=JSON.parse(raw),parsed=parseRecording(raw),manifest=JSON.parse(await fixture('provenance.json'));
 assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.files['legacy-v1-demo.json']);assert.equal(input.version,1);assert.equal(Object.hasOwn(input,'layout'),false);assert.equal(parsed.layout,null);assert.deepEqual(parsed.frames,input.frames);assert.equal(parsed.frames.length,61);
 const player=createPlayback(parsed);for(const frame of input.frames){player.seek(frame.t);const actual=player.frame();assert.deepEqual({t:actual.t,score:actual.score,seconds:actual.seconds,values:actual.values},frame);}
});
test('actual file-load and save handlers hide the v1 canvas without losing any frame numbers',async t=>{
 const raw=await fixture('legacy-v1-demo.json'),app=ui(t);await app.load(raw);assert.equal(app.mounted.replaying,true);assert.equal(app.find('canvas').hidden,true);assert.equal(app.find('canvas').drawCount,undefined);assert.match(app.find('.playback-layout').textContent,/v1.*지도 숨김/);
 for(const [at,score]of [[0,16],[4500,52],[9000,78],[13500,16]]){await app.seek(at);assert.match(app.find('.playback-score').textContent,new RegExp(`점수 ${score} /`));assert.equal(app.find('canvas').hidden,true);}
 const saved=JSON.parse(await app.saved());assert.deepEqual(saved.frames,JSON.parse(raw).frames);assert.equal(saved.version,1);assert.equal(saved.layout,null);
});
test('v2 file handlers draw the declared geometry and round-trip saved data exactly',async t=>{
 const raw=await fixture('adopted-v2-demo.json'),expected=parseRecording(raw),app=ui(t);await app.load(raw);assert.equal(app.find('canvas').hidden,false);assert.ok(app.find('canvas').drawCount>0);assert.match(app.find('.playback-layout').textContent,/v2.*C1 중앙후방/);
 const saved=await app.saved();assert.deepEqual(parseRecording(saved),expected);await app.click('exit');assert.equal(app.mounted.replaying,false);await app.load(saved);assert.equal(app.mounted.replaying,true);assert.equal(app.find('canvas').hidden,false);await app.seek(9000);assert.equal(createPlayback(parseRecording(saved)).layout.points.C1.y,.85);
});
test('incompatible files are rejected by the file handler and cannot replace a previous valid recording',async t=>{
 const valid=await fixture('adopted-v2-demo.json'),app=ui(t);await app.load(valid);await app.click('exit');
 for(const name of ['invalid-v2-layout-id.json','invalid-v2-c1-position.json']){await app.load(await fixture(name));assert.equal(app.mounted.replaying,false);assert.match(app.find('.recording-message').textContent,/파일을 열지 못했습니다.*배치/);assert.deepEqual(parseRecording(await app.saved()),parseRecording(valid));}
});
