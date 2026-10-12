import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPlaybackKeyboard} from './src/playback-keyboard.js';
import {createPlayback} from './src/recording.js';
function setup(){
 let now=0,player=null,exits=0,paints=0;const target=new EventTarget();
 const recording={format:'seat-care-demo-recording',version:1,source:'demo',startedAt:0,frames:[{t:0,score:16,seconds:0,values:[30,31,36,35,28]},{t:120000,score:16,seconds:0,values:[30,31,36,35,28]}]};
 const unbind=bindPlaybackKeyboard({target,getPlayer:()=>player,exit:()=>{player.pause();player=null;exits++;},paint:()=>paints++});
 return {get player(){return player;},get exits(){return exits;},get paints(){return paints;},unbind,enter(){player=createPlayback(recording,()=>now);return player;},advance(ms){now+=ms;player?.tick();},key(key,{inside=false,prevented=false}={}){const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:key});Object.defineProperty(event,'target',{value:{closest:()=>inside?{}:null}});if(prevented)event.preventDefault();target.dispatchEvent(event);return event;}};
}
test('Escape exits after playing when focus has moved to the outer recording container',()=>{const h=setup(),player=h.enter();player.play();h.advance(1200);assert.equal(player.position,1200);const e=h.key('Escape');assert.equal(e.defaultPrevented,true);assert.equal(h.exits,1);assert.equal(h.player,null);h.advance(3000);assert.equal(player.playing,false);assert.equal(player.position,1200);h.unbind();});
test('Escape exits before play, paused, at end, and after a second entry',()=>{const h=setup();for(const mode of ['ready','paused','ended','playing']){const p=h.enter();if(mode==='paused'){p.play();h.advance(500);p.pause();}if(mode==='ended'){p.play();h.advance(120001);}if(mode==='playing')p.play();h.key('Escape',{inside:mode==='ready'});assert.equal(h.player,null);assert.equal(p.playing,false);}assert.equal(h.exits,4);h.unbind();});
test('arrow and Home/End navigation remain scoped to the playback panel',()=>{const h=setup(),p=h.enter();p.seek(10000);const outside=h.key('ArrowRight');assert.equal(outside.defaultPrevented,false);assert.equal(p.position,10000);h.key('ArrowRight',{inside:true});assert.equal(p.position,15000);h.key('Home',{inside:true});assert.equal(p.position,0);h.key('End',{inside:true});assert.equal(p.position,120000);assert.equal(h.paints,3);h.unbind();});
test('inactive mode, handled events, and disposed listeners do not hijack Escape',()=>{const h=setup();assert.equal(h.key('Escape').defaultPrevented,false);h.enter();h.key('Escape',{prevented:true});assert.ok(h.player);h.unbind();assert.equal(h.key('Escape').defaultPrevented,false);assert.ok(h.player);assert.equal(h.exits,0);});
