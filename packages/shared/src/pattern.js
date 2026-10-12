import {GEOMETRY,CHANNEL_IDS,geometryValid,geometrySignature,namedChannelsValid,namedValues,orderedValues} from './layout.js';
// Explainable prototype rules. Thresholds are engineering defaults, NOT clinical limits.
export const PATTERN_VERSION='pressure-pattern-rules-v2';
export const RULES=Object.freeze({staleMs:1500,futureMs:200,maxGapMs:500,windowMs:1000,minFrames:8,holdMs:400,calibrationMs:10000,minCalibrationFrames:40,minTotal:10,similar:0.025,shift:0.05,centerShift:0.12,maxShareDelta:0.08,stability:0.015,calibrationSpread:0.035,minLoadRatio:0.65,maxLoadRatio:1.5});
export const DEMO_LAYOUT=Object.freeze({...GEOMETRY,source:'demo',placement:'simulation',confirmed:false,zeroCalibrated:false,loadCalibrated:false,rangeMax:100});
const clone=x=>structuredClone(x),finite=x=>typeof x==='number'&&Number.isFinite(x);
export const PATTERN_LABELS={similar:'개인 기준과 유사',left:'왼쪽으로 중심 이동',right:'오른쪽으로 중심 이동',front:'앞쪽으로 중심 이동',rear:'뒤쪽으로 중심 이동','left-front':'왼쪽·앞쪽 증가','left-rear':'왼쪽·뒤쪽 증가','right-front':'오른쪽·앞쪽 증가','right-rear':'오른쪽·뒤쪽 증가','center-rear-up':'중앙후방 비중 증가','center-rear-down':'중앙후방 비중 감소'};
export const PATTERN_REASONS={layout_changed:'배치가 변경되었습니다. 새 배치에서 기준을 다시 등록해 주세요.',uncalibrated:'채택 배치에서 비교 기준을 새로 등록해 주세요.',calibrating:'기준 분포를 수집하고 있습니다.',layout:'센서 배치·설치·보정 설정이 확정되지 않았습니다.',source:'입력 출처 또는 센서 구성이 기준과 다릅니다.',missing:'5개 채널과 시각·순번이 모두 필요합니다.',invalid:'센서 값의 형식 또는 범위를 확인해 주세요.',fault:'센서 오류가 보고됐습니다.',no_load:'접촉 하중이 부족합니다. 착석 여부는 판단할 수 없습니다.',zero:'영값 채널이 있습니다. 비접촉과 고장을 구분할 수 없습니다.',saturated:'측정 범위 상한에 도달한 채널이 있습니다.',stale:'새 센서 값이 도착하지 않았습니다.',future:'센서 시각이 현재 시각보다 앞섭니다.',repeated:'중복되거나 역전된 시각·순번입니다.',warming:'새로운 연속 입력을 확인하고 있습니다.',moving:'분포가 변하고 있어 추정을 보류합니다.',load_change:'전체 하중이 기준과 달라 직접 비교할 수 없습니다.',boundary:'규칙 경계 또는 방향이 모호해 추정을 보류합니다.',calibration_unstable:'기준 수집 중 분포가 변했습니다. 다시 등록해 주세요.',calibration_interrupted:'기준 수집 중 입력이 끊기거나 손상됐습니다.',disconnected:'연결이 끊겨 현재 패턴을 판단할 수 없습니다.'};
export function layoutValid(layout){
 if(!geometryValid(layout)||!['demo','sensor'].includes(layout.source)||layout.rangeMax!==100)return false;
 return layout.source==='demo'?layout.placement==='simulation':layout.confirmed===true&&layout.zeroCalibrated===true&&layout.loadCalibrated===true&&['above-cushion','below-cushion'].includes(layout.placement);
}
export function inspectPacket(packet,layout,now){
 if(!layoutValid(layout))return 'layout';
 if(!packet||!Array.isArray(packet.values)||packet.values.length!==5||!finite(packet.sampledAt)||packet.sampledAt<0||!Number.isSafeInteger(packet.sequence)||packet.sequence<0||typeof packet.streamId!=='string'||!packet.streamId||!Array.isArray(packet.channelIds))return 'missing';
 if(packet.layoutId!==layout.id)return 'layout_changed';
 if(packet.source!==layout.source||!namedChannelsValid(packet.channelIds))return 'source';
 if(packet.sensorStatus!=='ok')return 'fault';
 if(!finite(now)||packet.sampledAt>now+RULES.futureMs)return 'future';
 if(now-packet.sampledAt>RULES.staleMs)return 'stale';
 if(Array.from(packet.values).some(v=>!finite(v)||v<0||v>layout.rangeMax))return 'invalid';
 if(packet.values.reduce((a,b)=>a+b,0)<RULES.minTotal)return 'no_load';
 if(Array.from(packet.values).some(v=>v===0))return 'zero';
 if(Array.from(packet.values).some(v=>v===layout.rangeMax))return 'saturated';
 return null;
}
export function featuresOf(values,layout=DEMO_LAYOUT,channelIds=layout.channelIds){
 const v=namedValues(values,channelIds),total=CHANNEL_IDS.reduce((sum,id)=>sum+v[id],0),outer=v.L1+v.R1+v.L2+v.R2;
 return {total,right:CHANNEL_IDS.reduce((sum,id)=>sum+v[id]*layout.points[id].x,0)/total,rear:CHANNEL_IDS.reduce((sum,id)=>sum+v[id]*layout.points[id].y,0)/total,center:v.C1/total,rightShare:(v.R1+v.R2)/outer,rearShare:(v.L2+v.R2+v.C1)/total,shares:CHANNEL_IDS.map(id=>v[id]/total),maximumChannel:CHANNEL_IDS.reduce((best,id)=>v[id]>v[best]?id:best,CHANNEL_IDS[0])};
}
const spread=(frames,key)=>Math.max(...frames.map(f=>f.features[key]))-Math.min(...frames.map(f=>f.features[key]));
export function comparePattern(features,baseline){
 const d={right:features.right-baseline.right,rear:features.rear-baseline.rear,center:features.center-baseline.center};
 const load=features.total/baseline.total;
 if(load<RULES.minLoadRatio||load>RULES.maxLoadRatio)return {code:null,reason:'load_change',delta:d,loadRatio:load};
 const central=Math.abs(d.center)>=RULES.centerShift-1e-9;
 if(central){const consistent=Math.abs(d.right)<=RULES.similar+1e-9&&Math.abs(d.rear)>=RULES.similar&&Math.sign(d.rear)===Math.sign(d.center);return {code:consistent?(d.center>0?'center-rear-up':'center-rear-down'):null,reason:consistent?undefined:'boundary',delta:d,loadRatio:load};}
 const maxShare=Math.max(...features.shares.map((v,i)=>Math.abs(v-baseline.shares[i])));
 if(Math.abs(d.right)<=RULES.similar+1e-9&&Math.abs(d.rear)<=RULES.similar+1e-9&&Math.abs(d.center)<=0.06+1e-9&&maxShare<=RULES.maxShareDelta+1e-9)return {code:'similar',delta:d,loadRatio:load};
 const lateral=Math.abs(d.right)>=RULES.shift-1e-9?(d.right>0?'right':'left'):null;
 const longitudinal=Math.abs(d.rear)>=RULES.shift-1e-9?(d.rear>0?'rear':'front'):null;
 // A subthreshold change in another axis is ambiguous; don't manufacture a confident direction.
 if((!lateral&&Math.abs(d.right)>RULES.similar+1e-9)||(!longitudinal&&Math.abs(d.rear)>RULES.similar+1e-9))return {code:null,reason:'boundary',delta:d,loadRatio:load};
 if(Math.abs(d.center)>0.06+1e-9)return {code:null,reason:'boundary',delta:d,loadRatio:load};
 const code=[lateral,longitudinal].filter(Boolean).join('-');
 return {code:code||null,reason:code?undefined:'boundary',delta:d,loadRatio:load};
}
export function createPatternSession(initialLayout=DEMO_LAYOUT){
 let layout=clone(initialLayout),baseline=null,calibration=null,window=[],lastPacket=null,lastSeen=null,stream=null,candidate=null,candidateAt=0,baselineSerial=0,calibrationError=null;
 let result={status:'unknown',code:null,reason:'uncalibrated',label:'판단 불가'};
 const unknown=reason=>{candidate=null;result={status:'unknown',code:null,reason,label:'판단 불가'};};
 const reject=reason=>{window=[];if(calibration){calibrationError='calibration_interrupted';calibration=null;unknown(calibrationError);}else unknown(reason);};
 function snapshot(now){
  const view=clone(result);
  if(lastPacket&&finite(lastPacket.sampledAt)&&now-lastPacket.sampledAt>RULES.staleMs)Object.assign(view,{status:'unknown',code:null,reason:'stale',label:'판단 불가'});
  return {version:PATTERN_VERSION,source:layout.source,layout:clone(layout),baseline:baseline?clone(baseline):null,calibrationError,calibration:calibration?{active:true,elapsedMs:Math.max(0,(lastPacket?.sampledAt??calibration.startedAt)-calibration.startedAt),sampleCount:calibration.frames.length}:null,sample:lastPacket?clone(lastPacket):null,result:view};
 }
 const api={
  configure(next){calibrationError=null;layout=clone(next);baseline=null;calibration=null;window=[];lastPacket=null;lastSeen=null;stream=null;unknown('uncalibrated');},
  startCalibration(now){if(calibration)return false;calibrationError=null;calibration={startedAt:now,frames:[]};window=[];unknown('calibrating');return true;},
  cancelCalibration(){if(!calibration)return false;calibration=null;window=[];unknown(baseline?'warming':'uncalibrated');return true;},
  consume(packet,now){
   const issue=inspectPacket(packet,layout,now);
   if(issue){if(issue==='layout_changed'||issue==='layout')baseline=null;lastPacket=packet?clone(packet):null;reject(issue);return snapshot(now);}
   if(stream!==null&&stream!==packet.streamId){baseline=null;calibration=null;window=[];lastSeen=null;unknown('uncalibrated');}
   stream=packet.streamId;
   if(lastSeen&&(packet.sequence<=lastSeen.sequence||packet.sampledAt<=lastSeen.sampledAt)){lastPacket=clone(packet);reject('repeated');return snapshot(now);}
   const gap=lastSeen&&packet.sampledAt-lastSeen.sampledAt>RULES.maxGapMs;
   lastSeen={sequence:packet.sequence,sampledAt:packet.sampledAt};lastPacket=clone(packet);
   if(gap){if(calibration&&calibration.frames.length){calibrationError='calibration_interrupted';calibration=null;window=[];unknown(calibrationError);return snapshot(now);}window=[];candidate=null;}
   const valuesByLayout=orderedValues(packet.values,packet.channelIds,layout.channelIds);
   const features=featuresOf(valuesByLayout,layout),frame={at:packet.sampledAt,values:valuesByLayout,features};
   if(calibration){
    calibration.frames.push(frame);
    if(calibration.frames.length>2001){calibrationError='calibration_interrupted';calibration=null;unknown(calibrationError);return snapshot(now);}
    const frames=calibration.frames,span=frame.at-frames[0].at;
    if(span>=RULES.calibrationMs){
     if(frames.length<RULES.minCalibrationFrames){calibrationError='calibration_interrupted';calibration=null;unknown(calibrationError);return snapshot(now);}
     const totalMean=frames.reduce((n,f)=>n+f.features.total,0)/frames.length;
     const totalSpread=spread(frames,'total')/totalMean;
     const channelSpread=Math.max(...packet.values.map((_,i)=>{const vals=frames.map(f=>f.values[i]);return (Math.max(...vals)-Math.min(...vals))/(vals.reduce((a,b)=>a+b,0)/vals.length);}));
     if(['right','rear','center'].some(k=>spread(frames,k)>RULES.calibrationSpread)||totalSpread>0.15||channelSpread>0.2){calibrationError='calibration_unstable';calibration=null;unknown(calibrationError);return snapshot(now);}
     const values=packet.values.map((_,i)=>frames.reduce((n,f)=>n+f.values[i],0)/frames.length);
     baseline={id:`baseline-${++baselineSerial}-${frame.at}`,version:PATTERN_VERSION,source:layout.source,layoutId:layout.id,streamId:stream,geometrySignature:geometrySignature(layout),channelIds:[...layout.channelIds],capturedAt:frame.at,sampleCount:frames.length,durationMs:span,values,features:featuresOf(values,layout)};
     calibration=null;window=[];unknown('warming');
    }else unknown('calibrating');
    return snapshot(now);
   }
   if(!baseline){unknown(calibrationError??'uncalibrated');return snapshot(now);}
   if(window.length>=2001){reject('invalid');return snapshot(now);}
   window.push(frame);window=window.filter(f=>frame.at-f.at<=RULES.windowMs+RULES.maxGapMs);
   if(window.length<RULES.minFrames||frame.at-window[0].at<RULES.windowMs){unknown('warming');return snapshot(now);}
   if(['right','rear','center'].some(k=>spread(window,k)>RULES.stability)||spread(window,'total')/baseline.features.total>0.15){unknown('moving');return snapshot(now);}
   const comparison=comparePattern(features,baseline.features);
   if(!comparison.code){unknown(comparison.reason);result={...result,delta:comparison.delta};return snapshot(now);}
   if(candidate!==comparison.code){candidate=comparison.code;candidateAt=frame.at;result={status:'unknown',code:null,reason:'warming',label:'판단 불가'};return snapshot(now);}
   if(frame.at-candidateAt<RULES.holdMs)return snapshot(now);
   result={status:'estimated',code:comparison.code,label:PATTERN_LABELS[comparison.code],delta:comparison.delta,loadRatio:comparison.loadRatio,features,observedAt:frame.at};
   return snapshot(now);
  },snapshot
 };
 return api;
}
export function presentPattern(state,connected,now=Date.now()){
 const p=state?.pattern;
 let reason=!connected?'disconnected':!p?'uncalibrated':p.version!==PATTERN_VERSION||!geometryValid(p.layout)?'layout_changed':inspectPacket(p.sample,p.layout,now);
 if(!reason&&p.baseline&&(p.baseline.version!==PATTERN_VERSION||p.baseline.layoutId!==p.layout.id||p.baseline.geometrySignature!==geometrySignature(p.layout)))reason='layout_changed';
 if(!reason&&p.result?.status==='estimated'&&(!p.baseline||p.baseline.source!==p.source||p.baseline.streamId!==p.sample.streamId))reason='uncalibrated';
 if(reason)return {status:'unknown',code:null,label:'판단 불가',reason,detail:PATTERN_REASONS[reason],source:p?.source??'demo'};
 const r=p.result??{status:'unknown',code:null,label:'판단 불가',reason:'uncalibrated'};
 return {...r,detail:r.status==='estimated'?(r.code==='similar'?'등록한 분포와 비슷합니다. 바른 자세 판정은 아닙니다.':'개인 기준 대비 변화입니다. 의도적인 체중 이동일 수 있습니다.'):(PATTERN_REASONS[r.reason]??'입력을 확인해 주세요.'),source:p.source};
}
