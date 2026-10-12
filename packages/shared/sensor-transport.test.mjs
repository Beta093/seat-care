import test from 'node:test';import assert from 'node:assert/strict';
import {SensorTransport} from '../../apps/mobile-web/src/sensor-transport.js';
function fakeBluetooth(name='ESP32-P-A1B2C3'){
 const device=new EventTarget(),tx=new EventTarget(),writes=[];let disconnected=false;
 device.name=name;tx.startNotifications=async()=>tx;
 const rx={writeValueWithResponse:async v=>writes.push(new TextDecoder().decode(v))};
 const service={getCharacteristic:async id=>id.includes('0002')?rx:tx};
 device.gatt={connect:async()=>({getPrimaryService:async()=>service}),disconnect:()=>{disconnected=true;device.dispatchEvent(new Event('gattserverdisconnected'));}};
 return {device,tx,writes,get disconnected(){return disconnected;},install(){Object.defineProperty(globalThis,'navigator',{configurable:true,value:{bluetooth:{requestDevice:async()=>device}}});}};
}
test('BLE subscribes, sends calibration query, streams and cleans up on disconnect',async()=>{const f=fakeBluetooth();f.install();const events=[],t=new SensorTransport(e=>events.push(e));await t.connect('A1B2C3');assert.deepEqual(f.writes,['GET_CALIBRATION_STATUS']);const event=new Event('characteristicvaluechanged');f.tx.value=new DataView(new TextEncoder().encode('P:1,2,3,4,5').buffer);f.tx.dispatchEvent(event);assert.equal(events.at(-1).packet,'P:1,2,3,4,5');await t.command('CALIBRATE_ZERO');assert.equal(f.writes.at(-1),'CALIBRATE_ZERO');await assert.rejects(t.command('UNSAFE'));await t.disconnect();assert.ok(f.disconnected);assert.equal(events.at(-1).connected,false);const count=events.length;f.tx.dispatchEvent(event);assert.equal(events.length,count);await assert.rejects(t.command('CALIBRATE_ZERO'));});
test('selected wrong modern device code does not connect',async()=>{const f=fakeBluetooth('ESP32-P-112233');f.install();const t=new SensorTransport(()=>{});await assert.rejects(t.connect('A1B2C3'),/코드/);assert.deepEqual(f.writes,[]);});
