import {CHANNEL_IDS} from './layout.js';
import {syncPattern,beginPatternCalibration,cancelPatternCalibration,applyPatternCommand,clearPatternFault} from './pattern-demo.js';
import {profiles,statusFor,accumulatedSample,recoverySample,pressureReduction} from './model.js';
export const STATUS={normal:'안정',caution:'주의',warning:'경고'};
export function createMonitor(now=Date.now()) {
 const s={source:'demo',score:16,values:[...profiles.normal.values],seconds:0,mode:'stable',scenario:'normal',baseline:false,calibration:0,auto:false,autoElapsed:0,autoStep:0,recovery:null,ack:false,updatedAt:now,events:[{id:1,at:now,type:'normal',score:16,title:'모니터링 시작',detail:'시연 기본값 적용'}],nextId:2};return syncPattern(s,now);
}
function record(s,type,title,detail,now,extra={}) {s.events.push({id:s.nextId++,at:now,type,title,detail,score:Math.round(s.score),...extra});if(s.events.length>200)s.events.shift();}
export function command(s,action,now=Date.now()) {
 if(action==='reset')return createMonitor(now);
 if(action==='calibrate'&&s.pattern?.calibration)return s;
 if(applyPatternCommand(s,action,now)){s.updatedAt=now;return s;}
 if(action==='acknowledge'){
 if(statusFor(s.score)==='warning'&&!s.ack){s.ack=true;record(s,'ack','관리자가 안내를 확인했어요','화면 알림 확인 · 압력 해소 여부는 계속 확인',now);}return s;
 }
 if(action==='auto') {if(s.auto){s.auto=false;if(s.mode==='recovering'){s.scenario=statusFor(s.score);s.recovery=null;}s.mode='stable';cancelPatternCalibration(s);s.updatedAt=now;return syncPattern(s,now);}s=createMonitor(now);s.auto=true;s.mode='calibrating';s.patternCalibrationStartedAt=now;beginPatternCalibration(s,now);return syncPattern(s,now);}
 s.auto=false;
 if(action==='calibrate'){s.patternCalibrationStartedAt=now;s.mode='calibrating';s.calibration=0;s.baseline=false;s.seconds=0;s.recovery=null;beginPatternCalibration(s,now);}
 if(action==='cancel-calibration'){if(s.mode==='calibrating')s.mode='stable';cancelPatternCalibration(s);s.baseline=!!s.pattern?.baseline;}
 if(action==='accumulate'&&s.mode!=='accumulating')beginAccumulation(s);
 if(action==='recover'&&s.score>=40&&s.mode!=='recovering')beginRecovery(s);
 if(['normal','caution','warning'].includes(action)){
 clearPatternFault(s);const profile=profiles[action];Object.assign(s,{...profile,values:[...profile.values],mode:'stable',scenario:action,ack:false,recovery:null});
 record(s,action,`${STATUS[action]} 상태 바로 보기`,'시연 상태 예시',now);
 }
 s.updatedAt=now;return syncPattern(s,now);
}
function beginAccumulation(s){s.accumulation={elapsed:0,score:s.score,values:[...s.values],seconds:s.seconds};s.mode='accumulating';s.scenario=statusFor(s.score);s.ack=false;s.recovery=null;}
function beginRecovery(s){s.mode='recovering';s.scenario='recovery';s.recovery={elapsed:0,before:{score:s.score,values:[...s.values]}};s.seconds=0;}
export function tick(s,dt,now=Date.now()) {
 if(s.auto){
 s.autoElapsed+=dt;
 if(s.autoElapsed>=14&&s.autoStep===0){s.autoStep=1;beginAccumulation(s);}
 if(s.autoElapsed>=59&&s.autoStep===1){s.autoStep=2;beginRecovery(s);}
 if(s.autoElapsed>=64)s.auto=false;
 }
 if(s.mode==='calibrating'){
 s.calibration+=dt;

 }else if(s.mode==='accumulating'){
 const before=statusFor(s.score),start=s.accumulation;start.elapsed+=dt;
 const sample=accumulatedSample(start.elapsed),weight=Math.min(1,start.elapsed/40);
 s.score=Math.min(96,start.score+sample.score-profiles.normal.score);s.seconds=start.seconds+start.elapsed;
 s.values=start.values.map((v,i)=>v+(profiles.warning.values[i]-v)*weight);
 const after=statusFor(s.score);s.scenario=after;
 if(before!==after)record(s,after,after==='warning'?'압력 해소 안내 · 관리자 동시 통보':'오른쪽 뒤쪽 압력 집중',after==='warning'?'왼쪽으로 체중을 옮겨주세요':'화면 주의 안내',now);
 }else if(s.mode==='recovering'){
 s.recovery.elapsed+=dt;
 const sample=recoverySample(s.recovery.before,s.recovery.elapsed);s.score=sample.score;s.values=sample.values;s.seconds=0;
 if(sample.complete){s.mode='stable';s.ack=false;const before=s.recovery.before;const reduction=pressureReduction(before.values[CHANNEL_IDS.indexOf('R2')],s.values[CHANNEL_IDS.indexOf('R2')]);record(s,'recovery','체중 이동 후 압력이 줄었어요',`오른쪽 뒤쪽 상대 압력 ${reduction}% 감소 · 누적 시간 초기화`,now,{beforeScore:Math.round(before.score),reduction});}
 }
 s.updatedAt=now;syncPattern(s,now);
 if(s.mode==='calibrating'&&!s.pattern.calibration){
  s.mode='stable';s.baseline=!!s.pattern.baseline;
  if(s.pattern.baseline&&s.pattern.baseline.capturedAt>=s.patternCalibrationStartedAt)record(s,'setup','개인 기준 등록 완료','연속 가상 5채널 분포 기준 · 바른 자세 판정 아님',now);
  else record(s,'setup-failed','기준 등록 중단','유효한 연속 입력을 확보하지 못했습니다.',now);
 }
 return s;
}
export function statusCopy(s){
 const kind=statusFor(s.score),recovered=s.scenario==='recovery'&&s.mode==='stable'&&kind==='normal'&&s.events.at(-1)?.type==='recovery';
 return {kind,label:recovered?'개선 · 안정':STATUS[kind],title:s.mode==='recovering'?'압력이 줄고 있어요':recovered?'압력이 줄었어요':kind==='warning'?'왼쪽으로 체중을 옮겨주세요':kind==='caution'?'압력이 한쪽에 모이고 있어요':'안정적으로 앉아 있어요',description:kind==='normal'?'좌우 압력이 고르게 분포하고 있어요.':'오른쪽 뒤쪽에 압력이 집중되고 있어요.',action:'왼쪽으로 체중을 옮겨 오른쪽 뒤쪽 압력을 덜어주세요.',recovered};
}
export function timeLabel(at){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(at));}
export function durationLabel(seconds){return `${Math.floor(seconds/60)}분 ${String(Math.floor(seconds%60)).padStart(2,'0')}초`;}
