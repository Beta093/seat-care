// Local server capture of actual generated demo snapshots. No backfill/interpolation.
import {createRecorder} from './recording.js';
import {inspectPacket,PATTERN_REASONS} from './pattern.js';
export function createRecordingService({clock=()=>performance.now(),wallClock=()=>Date.now(),makeId=()=>crypto.randomUUID()}={}){
 const sessions=new Map();
 const issueOf=state=>state.pattern?(inspectPacket(state.pattern.sample,state.pattern.layout,wallClock())||(state.pattern.result?.reason==='repeated'?'repeated':null)):null;
 const sampleOf=state=>state.pattern?{...state,values:[...state.pattern.sample.values]}:state;
 function prune(){for(const [id,s]of sessions)if(clock()-s.createdAt>1200000)sessions.delete(id);}
 function describe(s,includeData=false){let recording=null;if(includeData&&s.recorder.count>=2)recording=s.recorder.snapshot();return {id:s.id,active:s.recorder.active,count:s.recorder.count,durationMs:s.durationMs,error:s.error,inputIssue:s.inputIssue,skippedFrames:s.skippedFrames,recording};}
 return {
  start(state,id=makeId()){
   prune();if(typeof id!=='string'||!/^[-a-zA-Z0-9]{16,64}$/.test(id))throw Error('기록 식별자가 올바르지 않습니다.');
   if(sessions.has(id))return describe(sessions.get(id));
   if(sessions.size>=16||[...sessions.values()].filter(s=>s.recorder.active).length>=4)throw Error('진행 중이거나 보관 중인 기록이 많습니다. 활성 기록을 중지하거나 20분 보관 만료 후 다시 시작해 주세요.');
   const issue=issueOf(state);if(issue)throw Error(PATTERN_REASONS[issue]);
   const recorder=createRecorder(clock,wallClock);recorder.start(sampleOf(state));
   const now=clock(),s={id,recorder,createdAt:now,lastCapture:now,durationMs:0,error:null,inputIssue:null,skippedFrames:0,lastSampleAt:state.pattern?.sample?.sampledAt??state.updatedAt};sessions.set(id,s);return describe(s);
  },
  capture(state){prune();for(const s of sessions.values()){
   if(!s.recorder.active||clock()-s.lastCapture<250)continue;
   s.lastCapture=clock();
   s.inputIssue=issueOf(state);const sampledAt=state.pattern?.sample?.sampledAt??state.updatedAt;if(!s.inputIssue&&sampledAt<=s.lastSampleAt)s.inputIssue='repeated';if(s.inputIssue){s.skippedFrames++;if(clock()-s.createdAt>=600000)s.recorder.stop();continue;}
   const before=s.recorder.count;
   try{s.recorder.capture(sampleOf(state));}catch(e){s.error=e.message;}
   if(s.recorder.count>before){s.lastSampleAt=sampledAt;s.lastCapture=clock();s.durationMs=Math.round(clock()-s.createdAt);}
  }},
  status(id){prune();const s=sessions.get(id);if(!s)throw Error('서버 기록을 찾을 수 없습니다. 서버 재시작 또는 보관 시간이 지났는지 확인해 주세요.');return describe(s);},
  stop(id){prune();const s=sessions.get(id);if(!s)throw Error('서버 기록을 찾을 수 없습니다.');s.recorder.stop();return describe(s,true);}
 };
}
