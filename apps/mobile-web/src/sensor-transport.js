import {Capacitor,registerPlugin} from '@capacitor/core';
import {BLE,COMMANDS,deviceCode} from '../../../packages/shared/src/sensor.js';
export const native=Capacitor.isNativePlatform();
export const bridge=native?registerPlugin('SeatSensor'):null;
export class SensorTransport {
 constructor(onEvent){this.onEvent=onEvent;this.generation=0;}
 async init(){if(native){this.subscription=await bridge.addListener('sensor',e=>this.onEvent(e));this.onEvent(await bridge.getState());}}
 async connect(code){if(this.connecting)throw Error('연결 중이에요. 잠시 기다려 주세요.');this.connecting=true;try{return await this.open(code);}finally{this.connecting=false;}}
 async open(code){
  if(native)return bridge.connect({code:code||''});
  if(!navigator.bluetooth)throw Error('이 브라우저는 방석 Bluetooth 직접 연결을 지원하지 않아요. 실제 연결은 Android Chrome 등 지원 브라우저를 사용해 주세요. iPhone Safari에서는 시연만 가능해요.');
  const generation=++this.generation;
  const device=await navigator.bluetooth.requestDevice({filters:[{services:[BLE.service]}],optionalServices:[BLE.service]});
  const found=deviceCode(device.name);if(code&&found!==code)throw Error('선택한 방석의 코드가 입력한 코드와 달라요.');
  this.device=device;this.onEvent({type:'connection',connected:false,message:'방석에 연결 중'});
  this.disconnectHandler=()=>{this.rx=null;this.onEvent({type:'connection',connected:false,message:'연결이 끊겼어요. 다시 연결해 주세요.'});};device.addEventListener('gattserverdisconnected',this.disconnectHandler);
  try{
   const server=await device.gatt.connect();const service=await server.getPrimaryService(BLE.service);this.rx=await service.getCharacteristic(BLE.rx);this.tx=await service.getCharacteristic(BLE.tx);
   if(generation!==this.generation){device.gatt.disconnect();return;}
   this.handler=e=>this.onEvent({type:'packet',packet:new TextDecoder().decode(e.target.value),at:Date.now()});this.tx.addEventListener('characteristicvaluechanged',this.handler);await this.tx.startNotifications();
   this.onEvent({type:'connection',connected:true,device:device.name||'ESP32',message:'보정 상태 확인 중'});await this.command('GET_CALIBRATION_STATUS');
  }catch(error){await this.disconnect();throw error;}
 }
 async command(command){if(!COMMANDS.includes(command))throw Error('지원하지 않는 명령이에요.');if(native)return bridge.command({command});if(!this.rx)throw Error('방석을 먼저 연결해 주세요.');await this.rx.writeValueWithResponse(new TextEncoder().encode(command));}
 async disconnect(){if(native)return bridge.disconnect();++this.generation;this.tx?.removeEventListener('characteristicvaluechanged',this.handler);this.device?.removeEventListener('gattserverdisconnected',this.disconnectHandler);this.device?.gatt.disconnect();this.rx=null;this.onEvent({type:'connection',connected:false,message:'연결 해제됨'});}
}
