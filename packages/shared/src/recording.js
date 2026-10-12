import {CHANNEL_IDS,geometryValid,geometrySignature,recordingGeometry,orderedValues} from './layout.js';
export const RECORDING_LIMITS={bytes:2*1024*1024,frames:2401,durationMs:600000};
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
function frameOf(state,t){
 if(!finite(state.score,0,100)||!finite(state.seconds,0,86400)||!Array.isArray(state.values)||state.values.length!==5||!Array.from(state.values).every(v=>finite(v,0,100)))throw Error('시연 숫자 또는 5개 채널 값이 올바르지 않습니다.');
 return {t,score:state.score,seconds:state.seconds,values:[...state.values]};
}
export function validateRecording(data){
 if(!data||data.format!=='seat-care-demo-recording'||![1,2].includes(data.version)||data.source!=='demo')throw Error('지원하는 시연 기록 v1/v2 파일이 아닙니다. 이벤트 보고서는 재생할 수 없습니다.');
 if(!finite(data.startedAt,0,8640000000000000)||!Array.isArray(data.frames)||data.frames.length<2||data.frames.length>RECORDING_LIMITS.frames)throw Error('기록 시각 또는 프레임 수가 올바르지 않습니다.');
 const layout=data.version===2?recordingGeometry(data.layout):null;
 let previous=-1;
 const frames=data.frames.map((frame,i)=>{
  if(!frame||!finite(frame.t,0,RECORDING_LIMITS.durationMs)||(i===0&&frame.t!==0)||frame.t<=previous)throw Error('프레임 시간은 0부터 시작해 순서대로 증가해야 합니다.');
  previous=frame.t;return frameOf(frame,frame.t);
 });
 return {format:data.format,version:data.version,source:'demo',startedAt:data.startedAt,layout,frames};
}
export function parseRecording(text){
 if(new TextEncoder().encode(text).length>RECORDING_LIMITS.bytes)throw Error('파일은 2 MiB 이하여야 합니다.');
 let data;try{data=JSON.parse(text);}catch{throw Error('JSON 파일을 읽을 수 없습니다.');}
 return validateRecording(data);
}
export function createRecorder(clock=()=>performance.now(),wallClock=()=>Date.now()){
 let data=null,active=false,start=0;
 return {
  get active(){return active;},get count(){return data?.frames.length??0;},
  start(state){if(active)return false;if(state.source!=='demo')throw Error('가상 시연만 기록할 수 있습니다.');if(!geometryValid(state.pattern?.layout)||state.pattern?.sample?.layoutId!==state.pattern.layout.id)throw Error('새 배치의 이름별 채널 정보가 필요합니다.');const layout=recordingGeometry({...state.pattern.layout,channelIds:CHANNEL_IDS});const frame=frameOf({...state,values:orderedValues(state.values,state.pattern.sample.channelIds,layout.channelIds)},0);data={format:'seat-care-demo-recording',version:2,source:'demo',layout,startedAt:wallClock(),frames:[frame]};start=clock();active=true;return true;},
  capture(state){if(!active)return false;if(state.source!=='demo'){active=false;throw Error('가상 시연 입력이 아니어서 기록을 중지했습니다.');}const t=Math.round(clock()-start);if(t>RECORDING_LIMITS.durationMs||data.frames.length>=RECORDING_LIMITS.frames){active=false;return false;}if(t<=data.frames.at(-1).t)return true;try{if(!geometryValid(state.pattern?.layout)||geometrySignature(state.pattern.layout)!==geometrySignature(data.layout)||state.pattern?.sample?.layoutId!==data.layout.id)throw Error('배치가 변경되어 기록을 중단했습니다. 이전 기록을 저장하고 새 기록을 시작하세요.');data.frames.push(frameOf({...state,values:orderedValues(state.values,state.pattern.sample.channelIds,data.layout.channelIds)},t));}catch(e){active=false;throw e;}return true;},
  stop(){active=false;},
  snapshot(){return validateRecording(data);}
 };
}
export function createPlayback(recording,clock=()=>performance.now()){
 const data=validateRecording(recording),duration=data.frames.at(-1).t;
 let position=0,playing=false,last=0;
 const clamp=n=>Math.min(duration,Math.max(0,n));
 const api={
  get layout(){return data.layout?structuredClone(data.layout):null;},get playing(){return playing;},get duration(){return duration;},get position(){return position;},
  play(){if(playing)return;if(position>=duration)position=0;last=clock();playing=true;},
  pause(){api.tick();playing=false;},
  seek(ms){if(!finite(ms,0,duration))throw Error('탐색 시각이 범위를 벗어났습니다.');position=clamp(ms);last=clock();},
  tick(){if(playing){const now=clock();position=clamp(position+Math.max(0,now-last));last=now;if(position>=duration)playing=false;}return api.frame();},
  frame(){let lo=0,hi=data.frames.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(data.frames[mid].t<=position)lo=mid;else hi=mid-1;}const frame=data.frames[lo];return {...frame,values:[...frame.values],gapMs:Math.max(0,position-frame.t)};}
 };return api;
}
