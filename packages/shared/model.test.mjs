import test from 'node:test';
import assert from 'node:assert/strict';
import {statusFor,interpolate,profiles,makeEvent} from './src/model.js';
test('boundary scores separate normal, caution and warning',()=>{assert.equal(statusFor(39),'normal');assert.equal(statusFor(40),'caution');assert.equal(statusFor(69),'caution');assert.equal(statusFor(70),'warning');});
test('interpolation preserves a uniform field and stays within sensor bounds',()=>{for(let y=0;y<=1;y+=.1)for(let x=0;x<=1;x+=.1){assert.ok(Math.abs(interpolate([42,42,42,42,42],x,y)-42)<1e-8);const value=interpolate(profiles.warning.values,x,y);assert.ok(value>=24&&value<=90);}});
test('warning hotspot is on the same side as the action text',()=>{assert.ok(interpolate(profiles.warning.values,.7,.72)>interpolate(profiles.warning.values,.3,.72));});
test('improvement percentage comes from relative pressure values',()=>{const event=makeEvent('recovery',90,new Date('2026-10-06T10:00:00Z'));assert.match(event.detail,/61%/);assert.match(event.detail,/타이머 초기화/);assert.equal(event.score,21);});
