import {CHANNEL_IDS,orderedValues} from './layout.js';
// Synthetic input adapter only. There is intentionally no hardware ingest endpoint.
import {createPatternSession,DEMO_LAYOUT} from './pattern.js';
const sessions=new WeakMap();
export const PATTERN_DEMO_ACTIONS=['pattern-reference','pattern-left','pattern-right','pattern-front','pattern-rear','pattern-center-rear','pattern-right-rear','pattern-zero','pattern-missing','pattern-stale','pattern-fault','pattern-invalid','pattern-repeat','pattern-saturated'];
function runtime(state){if(!sessions.has(state))sessions.set(state,{engine:createPatternSession(),sequence:0,fault:null});return sessions.get(state);}
export function syncPattern(state,now){
 const r=runtime(state);if(r.lastSampleAt===now){state.pattern=r.engine.snapshot(now);return state;}r.lastSampleAt=now;const packet={source:'demo',layoutId:DEMO_LAYOUT.id,streamId:'demo-seat-01',channelIds:[...DEMO_LAYOUT.channelIds],values:[...state.values],sampledAt:now,sequence:r.sequence++,sensorStatus:'ok'};
 if(r.fault==='zero')packet.values=[0,0,0,0,0];
 if(r.fault==='missing')packet.values.pop();
 if(r.fault==='stale')packet.sampledAt=now-5000;
 if(r.fault==='fault')packet.sensorStatus='fault';
 if(r.fault==='invalid')packet.values[packet.channelIds.indexOf('L2')]=null;
 if(r.fault==='repeat')packet.sequence=0;
 if(r.fault==='saturated')packet.values[packet.channelIds.indexOf('L2')]=100;
 state.pattern=r.engine.consume(packet,now);
 return state;
}
export function beginPatternCalibration(state,now){runtime(state).engine.startCalibration(now);}
export function cancelPatternCalibration(state){runtime(state).engine.cancelCalibration();}
export function applyPatternCommand(state,action,now){
 if(!PATTERN_DEMO_ACTIONS.includes(action))return false;
 const r=runtime(state);r.fault=null;state.auto=false;state.mode=state.pattern?.calibration?'calibrating':'stable';
 const preset={'right-rear':{L1:12,R1:22,L2:28,R2:85,C1:38},left:{L1:62,R1:22,L2:65,R2:24,C1:32},right:{L1:22,R1:62,L2:24,R2:65,C1:32},front:{L1:62,R1:65,L2:22,R2:24,C1:32},rear:{L1:22,R1:24,L2:62,R2:65,C1:32},'center-rear':{L1:22,R1:23,L2:24,R2:25,C1:72}};
 const name=action.slice(8);
 if(name==='reference')state.values=[...(state.pattern?.baseline?.layoutId===DEMO_LAYOUT.id?orderedValues(state.pattern.baseline.values,state.pattern.baseline.channelIds):[30,31,36,35,28])];
 else if(preset[name])state.values=CHANNEL_IDS.map(id=>preset[name][id]);
 else r.fault=name;
 syncPattern(state,now);return true;
}
export function clearPatternFault(state){runtime(state).fault=null;}
