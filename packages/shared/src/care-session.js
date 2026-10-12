import {CHANNEL_IDS,LAYOUT_ID} from './layout.js';
export const CARE_VERSION='care-rules-v1';
// Engineering examples only. These values have not been clinically validated.
export const CARE_DEFAULTS=Object.freeze({baselineMs:10000,biasHoldMs:10000,reliefHoldMs:20000,reminderMs:1800000,realertMs:60000,biasEnter:.30,biasExit:.20,reliefDrop:.30,noiseGraceMs:500,maxGapMs:1500,enabled:true,guidance:'comfortable'});
export const CARE_DEMO=Object.freeze({...CARE_DEFAULTS,biasHoldMs:3000,reliefHoldMs:5000,reminderMs:60000});
export function careSettings(input={},demo=false){
 const defaults=demo?CARE_DEMO:CARE_DEFAULTS,s={...defaults};
 const ranges={baselineMs:[5000,30000],biasHoldMs:[3000,300000],reliefHoldMs:[3000,120000],reminderMs:[30000,7200000],realertMs:[10000,1800000],biasEnter:[.15,1],biasExit:[.05,.9],reliefDrop:[.15,.7],noiseGraceMs:[0,1000],maxGapMs:[500,2000]};
 for(const [key,[min,max]] of Object.entries(ranges))if(Number.isFinite(input[key])&&input[key]>=min&&input[key]<=max)s[key]=input[key];
 if(s.biasExit>=s.biasEnter)s.biasExit=s.biasEnter*.65;
 if(typeof input.enabled==='boolean')s.enabled=input.enabled;
 if(['comfortable','supported'].includes(input.guidance))s.guidance=input.guidance;
 return s;
}
const id=()=>globalThis.crypto.randomUUID();
const valid=values=>Array.isArray(values)&&values.length===5&&values.every(v=>Number.isFinite(v)&&v>=0&&v<65535);
const sum=v=>v.reduce((a,b)=>a+b,0);
export class CareSession {
 constructor({source='sensor',device='',settings={},onEvent=()=>{},onObserve=()=>{}}={}){
  this.source=source;this.device=device;this.onEvent=onEvent;this.onObserve=onObserve;this.sessionId=id();this.settings=careSettings(settings,source==='demo');this.settingsVersion=id();
  this.baseline=null;this.capture=null;this.last=null;this.values=null;this.quality='unavailable';this.reason='기준을 등록해 주세요.';this.bias={};this.candidates={};this.relief=null;this.completed={};this.noReliefMs=0;this.lastAlert=-Infinity;this.activeAlert=null;this.snoozeUntil=0;this.lostAt=null;this.unloadedAt=null;this.unloadedLogged=false;this.layoutConfirmed=source==='demo';
  this.emit('session_started',Date.now(),{settings:{...this.settings}});
 }
 emit(type,at,extra={}){const event={id:id(),type,at,sessionId:this.sessionId,source:this.source,device:this.device,baselineId:this.baseline?.id??null,settingsVersion:this.settingsVersion,rulesVersion:CARE_VERSION,layoutId:LAYOUT_ID,...extra};this.onEvent(event);return event;}
 configure(input,at){
  const next=careSettings({...this.settings,...input},this.source==='demo');
  if(Object.keys(next).some(key=>!['enabled','guidance','realertMs'].includes(key)&&next[key]!==this.settings[key]))this.interrupt('판단 기준 변경으로 수행 확인을 다시 시작해 주세요.',at);
  this.settings=next;this.settingsVersion=id();this.lastAlert=-Infinity;this.activeAlert=null;this.emit('settings_changed',at,{settings:{...this.settings}});
 }
 startBaseline(at){
  if(!this.layoutConfirmed)throw Error('실물의 센서 순서와 위치를 먼저 확인해 주세요.');
  if(this.quality!=='seated'||this.last===null||at-this.last>this.settings.maxGapMs)throw Error('연결·보정과 최근 착석 데이터를 확인해 주세요.');
  this.stopRelief('기준 재등록',at);this.baseline=null;this.capture={requestedAt:at,frames:[],elapsedMs:0};this.bias={};this.candidates={};this.completed={};this.noReliefMs=0;this.activeAlert=null;this.reason='평소의 편안한 착석 상태를 유지해 주세요.';
 }
 stopRelief(reason,at){if(this.relief&&this.relief.state!=='completed')this.emit('relief_interrupted',at,{region:this.relief.region,startAt:this.relief.startedAt??this.relief.armedAt,observedMs:this.relief.heldMs,reason});this.relief=null;}
 interrupt(reason,at,invalidate=false){
  if(this.capture){this.capture=null;this.reason='기준 등록 중 수신이 중단됐어요. 다시 등록해 주세요.';this.emit('baseline_failed',at,{reason});}else this.reason=reason;
  this.stopRelief(reason,at);this.bias={};this.candidates={};this.activeAlert=null;this.unloadedAt=null;this.unloadedLogged=false;
  if(this.last!==null&&this.lostAt===null){this.lostAt=this.last;this.emit('data_lost',at,{startAt:this.last,reason});}
  this.last=null;this.values=null;this.quality='unavailable';
  if(invalidate){this.baseline=null;this.completed={};this.noReliefMs=0;this.layoutConfirmed=this.source==='demo';}
 }
 tick(at){if(this.last!==null&&(at-this.last>=this.settings.maxGapMs||at<this.last))this.interrupt('새 센서값이 없어 수행 확인을 중단했어요.',at);}
 acknowledge(at){if(this.activeAlert)this.emit('alert_acknowledged',at,{alertId:this.activeAlert.id});this.activeAlert=null;}
 snooze(at,durationMs=300000){this.snoozeUntil=at+durationMs;this.emit('alert_snoozed',at,{until:this.snoozeUntil,alertId:this.activeAlert?.id??null});this.activeAlert=null;}
 resume(at){this.snoozeUntil=0;if(!this.settings.enabled)this.configure({enabled:true},at);this.emit('alerts_resumed',at);}
 beginRelief(region,at){
  const index=CHANNEL_IDS.indexOf(region);
  if(index<0||!this.baseline||this.quality!=='seated'||this.last===null||at-this.last>this.settings.maxGapMs)throw Error('개인 기준 등록과 유효한 착석 데이터가 필요해요.');
  if(this.relief&&this.relief.state!=='completed')throw Error('현재 수행 확인을 먼저 취소해 주세요.');
  if(this.completed[region])throw Error('같은 부하 감소 구간은 이미 기록했어요. 부하가 돌아온 뒤 새로 확인할 수 있어요.');
  if(this.values[index]<20)throw Error('이 부위는 비교할 부하가 부족해요. 다른 부위를 선택해 주세요.');
  this.relief={region,index,reference:[...this.values],armedAt:at,startedAt:null,heldMs:0,state:'waiting',badAt:null,previousGood:false};
  this.emit('relief_armed',at,{region,referenceValues:[...this.values],targetMs:this.settings.reliefHoldMs});
 }
 sample(values,at){
  if(!Number.isFinite(at))return;
  if(!valid(values)){this.interrupt('센서값이 누락되거나 범위를 벗어났어요.',at);return;}
  if(this.last!==null&&at<=this.last){this.interrupt('중복 또는 역전된 수신 시각이에요.',at);return;}
  const previous=this.last;
  if(previous!==null&&at-previous>this.settings.maxGapMs)this.interrupt('센서 수신 사이에 공백이 있어요.',at);
  const dt=this.last===null?0:at-this.last,previousQuality=this.quality;
  if(this.lostAt!==null){this.emit('data_resumed',at,{startAt:this.lostAt,unobservedMs:Math.max(0,at-this.lostAt)});this.lostAt=null;}
  this.last=at;this.values=[...values];
  if(sum(values)<125){
   this.quality='unloaded';this.reason='좌면 부하가 감지되지 않아요. 원인은 확인할 수 없어요.';
   if(this.capture){this.capture=null;this.emit('baseline_failed',at,{reason:'기준 등록 중 부하 해제'});}
   this.stopRelief('좌면 부하 해제 · 원인 미확인',at);this.bias={};this.candidates={};this.activeAlert=null;this.noReliefMs=0;this.unloadedAt??=at;
   if(!this.unloadedLogged&&at-this.unloadedAt>=1000){this.emit('seat_unloaded',at,{startAt:this.unloadedAt,reason:'원인 미확인'});this.unloadedLogged=true;}
   if(previousQuality==='unloaded'&&dt)this.onObserve({from:at-dt,to:at,kind:'unloaded'});
   return;
  }
  if(values.some(v=>v===0)){this.interrupt('영값 채널이 있어 접촉 상태를 확인해야 해요.',at);return;}
  this.unloadedAt=null;this.unloadedLogged=false;this.quality='seated';
  if(previousQuality==='seated'&&dt)this.onObserve({from:at-dt,to:at,kind:this.baseline?'seated':'unregistered'});
  if(this.capture){
   const capture=this.capture;capture.frames.push({at,values:[...values]});capture.elapsedMs=at-capture.frames[0].at;
   if(values.some(v=>v<20)){this.capture=null;this.reason='비교할 센서 반응이 부족해요. 위치를 확인하고 다시 등록해 주세요.';this.emit('baseline_failed',at,{reason:this.reason});return;}
   if(capture.elapsedMs>=this.settings.baselineMs){
    const means=CHANNEL_IDS.map((_,i)=>capture.frames.reduce((s,f)=>s+f.values[i],0)/capture.frames.length);
    const unstable=capture.frames.length<10||means.some((mean,i)=>{const channel=capture.frames.map(f=>f.values[i]);return (Math.max(...channel)-Math.min(...channel))/Math.max(20,mean)>.20;});
    this.capture=null;
    if(unstable){this.reason='측정 중 압력 변화가 컸어요. 편안한 상태에서 다시 등록해 주세요.';this.emit('baseline_failed',at,{reason:this.reason});return;}
    this.baseline={id:id(),values:means,at,startAt:capture.frames[0].at,durationMs:capture.elapsedMs,samples:capture.frames.length,layoutId:LAYOUT_ID,settingsVersion:this.settingsVersion,device:this.device,source:this.source};
    this.emit('baseline_registered',at,{baseline:structuredClone(this.baseline)});this.noReliefMs=0;this.reason='개인 착석 기준이 등록됐어요.';
   }
   return;
  }
  if(!this.baseline){if(!this.reason||this.reason.startsWith('좌면'))this.reason='개인 착석 기준을 등록해 주세요.';return;}
  this.noReliefMs+=previousQuality==='seated'?dt:0;
  for(let i=0;i<5;i++){
   const key=CHANNEL_IDS[i],delta=values[i]/Math.max(20,this.baseline.values[i])-1;
   if(this.completed[key]&&values[i]>=this.completed[key]*.9)delete this.completed[key];
   if(delta>=this.settings.biasEnter){this.candidates[key]??=at;if(at-this.candidates[key]>=this.settings.biasHoldMs)this.bias[key]=true;}
   else if(delta<=this.settings.biasExit){delete this.bias[key];delete this.candidates[key];}
   else if(!this.bias[key])delete this.candidates[key];
  }
  const r=this.relief;
  if(r&&r.state!=='completed'){
   const ratio=values[r.index]/r.reference[r.index],good=ratio<=1-this.settings.reliefDrop;
   if(good&&r.badAt!==null&&at-r.badAt>this.settings.noiseGraceMs){this.emit('relief_interrupted',at,{region:r.region,startAt:r.startedAt,observedMs:r.heldMs,reason:'부하 증가가 허용시간을 초과함'});r.startedAt=null;r.heldMs=0;r.previousGood=false;r.badAt=null;}
   if(good){
    if(r.startedAt===null){r.startedAt=at;r.state='holding';this.emit('relief_started',at,{region:r.region,startAt:at,referenceValues:r.reference,targetMs:this.settings.reliefHoldMs});}
    if(r.previousGood)r.heldMs+=dt;r.previousGood=true;r.badAt=null;r.state='holding';
    if(r.heldMs>=this.settings.reliefHoldMs){
     r.state='completed';this.completed[r.region]=r.reference[r.index];this.noReliefMs=0;this.activeAlert=null;
     this.emit('relief_completed',at,{region:r.region,startAt:r.startedAt,observedMs:r.heldMs,targetMs:this.settings.reliefHoldMs,referenceValues:r.reference,finalValues:[...values],reduction:1-ratio,otherIncreased:CHANNEL_IDS.filter((_,i)=>i!==r.index&&values[i]>this.baseline.values[i]*(1+this.settings.biasEnter))});
    }
   }else if(r.startedAt!==null){
    r.previousGood=false;r.badAt??=at;r.state='checking';
    if(at-r.badAt>=this.settings.noiseGraceMs){this.emit('relief_interrupted',at,{region:r.region,startAt:r.startedAt,observedMs:r.heldMs,reason:'부하가 다시 증가함'});r.startedAt=null;r.heldMs=0;r.badAt=null;r.state='waiting';}
   }
  }
  const reasons=[...Object.keys(this.bias)];if(this.noReliefMs>=this.settings.reminderMs)reasons.push('overdue');
  if(!reasons.length)this.activeAlert=null;
  if(reasons.length&&this.settings.enabled&&at>=this.snoozeUntil&&at-this.lastAlert>=this.settings.realertMs){
   this.lastAlert=at;this.activeAlert=this.emit('alert_created',at,{reasons,observedSinceReliefMs:this.noReliefMs});
  }
 }
 snapshot(){return {baseline:this.baseline,capture:this.capture?{elapsedMs:this.capture.elapsedMs}:null,quality:this.quality,reason:this.reason,bias:Object.keys(this.bias),relief:this.relief,activeAlert:this.activeAlert,noReliefMs:this.noReliefMs,settings:this.settings,snoozeUntil:this.snoozeUntil,layoutConfirmed:this.layoutConfirmed};}
}
