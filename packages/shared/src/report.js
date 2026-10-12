import {geometryValid,CHANNEL_IDS,namedValues} from './layout.js';
// Local demo evidence only: never present these values as measurements or clinical outcomes.
export function sessionReport(state,exportedAt=Date.now()) {
 return {
  format:'seat-care-demo-report',version:1,source:'demo',sensorConnected:false,
  exportedAt:new Date(exportedAt).toISOString(),
  scope:'시연 서버 메모리의 최근 최대 200개 이벤트. 실제 센서 측정·임상 효과·전체 원시 데이터 아님.',
  snapshot:{layoutId:state.pattern?.layout?.id??null,channelIds:geometryValid(state.pattern?.layout)?[...CHANNEL_IDS]:null,relativeValuesByChannel:geometryValid(state.pattern?.layout)?namedValues(state.values,CHANNEL_IDS):null,at:state.updatedAt,score:Math.round(state.score),relativeValues:[...state.values],samePressureSeconds:state.seconds,baselineRegistered:state.pattern?!!state.pattern.baseline:state.baseline},
  pressurePattern:state.pattern?structuredClone(state.pattern):null,
  summary:{eventCount:state.events.length,warningCount:state.events.filter(e=>e.type==='warning').length,recoveryCount:state.events.filter(e=>e.type==='recovery').length,acknowledgementCount:state.events.filter(e=>e.type==='ack').length},
  events:state.events.map(e=>({...e})),
  limitations:['압력 패턴은 미검증 규칙 기반 추정이며 개인 기준 유사성이 바른 자세나 피부 안전을 뜻하지 않습니다.','점수·시간은 시연 설정이며 의학적 안전 기준이 아닙니다.','상대 압력 감소율은 센서 정확도 또는 욕창 예방 효과를 증명하지 않습니다.','이 파일은 이벤트 보고서입니다. 원시 센서 replay 파일이 아닙니다.']
 };
}
export function downloadReport(state){
 const report=sessionReport(state);
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=`seat-care-demo-${report.exportedAt.replace(/[:.]/g,'-')}.json`;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function connectionCopy(connected,received,state){
 if(connected)return '시연 서버 연결됨 · 실제 센서 미연결';
 return received?`연결 끊김 · 마지막 수신 ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(state.updatedAt))} · 현재 상태 확인 불가`:'시연 서버 연결 대기 · 현재 상태 확인 불가';
}
