// Offline validation only; no participant data is collected or transmitted.
import {layoutValid,inspectPacket,createPatternSession,PATTERN_LABELS} from './pattern.js';
const fail=message=>{throw new Error(message);};
export function validatePatternDataset(data){
 if(data?.format!=='seat-care-pattern-dataset'||data.version!==1||!Array.isArray(data.sessions)||!data.sessions.length||data.sessions.length>100)fail('Invalid dataset header/session count');
 const ids=new Set(),people=new Map(),days=new Map();let frameCount=0;
 for(const s of data.sessions){
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id))fail('Missing or duplicate session id');ids.add(s.id);
  if(!layoutValid(s.layout)||!['development','holdout'].includes(s.partition)||!/^P[0-9]{3,8}$/.test(s.participantKey)||!/^\d{4}-\d{2}-\d{2}$/.test(s.day)||!Number.isFinite(s.calibrationStartAt))fail('Invalid session metadata');
  if(new Date(s.day).toISOString().slice(0,10)!==s.day)fail('Invalid session day');
  for(const [map,key] of [[people,s.participantKey],[days,s.day]]){if(map.has(key)&&map.get(key)!==s.partition)fail('Participant/date leakage across partitions');map.set(key,s.partition);}
  if(!Array.isArray(s.frames)||!s.frames.length||(frameCount+=s.frames.length)>100000)fail('Invalid frame count');
  let previous=-Infinity;
  for(const f of s.frames){
   if(!f||!Number.isFinite(f.receivedAt)||f.receivedAt<0||f.receivedAt<=previous||f.receivedAt<s.calibrationStartAt)fail('Invalid reception timeline');previous=f.receivedAt;
   if(!f.packet||typeof f.packet!=='object'||!Object.hasOwn(f,'qualityIssue')||f.qualityIssue!==inspectPacket(f.packet,s.layout,f.receivedAt))fail('Missing or incorrect input-quality annotation');
   const o=f.observation;
   if(!o||!(o.label===null||Object.hasOwn(PATTERN_LABELS,o.label))||typeof o.episodeId!=='string'||!o.episodeId||!['unknown','reference','pressure-relief','task'].includes(o.movementIntent))fail('Invalid independent observation');
   if(o.origin!==(s.layout.source==='demo'?'scenario':'independent-observation'))fail('Labels must be independent of model output');
   if(f.qualityIssue&&o.label!==null)fail('Invalid input must have an unscored label');
  }
 }
 return {sessionCount:data.sessions.length,frameCount};
}
export function evaluatePatternDataset(data){
 const counts=validatePatternDataset(data),sessions=[];
 for(const s of data.sessions){
  const engine=createPatternSession(s.layout);engine.startCalibration(s.calibrationStartAt);
  let labelled=0,estimated=0,abstained=0;const confusion={};
  for(const f of s.frames){
   const result=engine.consume(f.packet,f.receivedAt).result;
   if(f.observation.label===null)continue;
   labelled++;if(result.status==='estimated')estimated++;else abstained++;
   const key=`${f.observation.label} -> ${result.code??'unknown'}`;confusion[key]=(confusion[key]??0)+1;
  }
  sessions.push({id:s.id,partition:s.partition,source:s.layout.source,labelled,estimated,abstained,confusion});
 }
 return {...counts,clinicalValidation:false,unit:'correlated frames; not independent participants or episodes',sessions};
}
