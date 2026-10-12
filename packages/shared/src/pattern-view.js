import {CHANNELS,geometryValid,geometrySignature} from './layout.js';
import {drawHeatmap} from './view.js';
import {presentPattern,inspectPacket,featuresOf,DEMO_LAYOUT,RULES,PATTERN_REASONS} from './pattern.js';
const names=Object.fromEntries(Object.entries(CHANNELS).map(([id,p])=>[id,`${id} ${p.label}`]));
export const patternReading=`<div class="pattern-reading"><div class="pattern-kicker">압력 패턴 추정 <small id="pattern-source">규칙 기반 · 가상</small></div><h2 id="pattern-title">판단 불가</h2><p id="pattern-reason"></p></div>`;
export const patternDetails=`<section class="panel pattern-details"><h2>추정 근거</h2><p>개인 기준과 비교한 상대값 가중 중심·C1 비중 변화입니다. 자세의 옳고 그름·척추 정렬·피부 안전을 판정하지 않습니다.</p><dl><div><dt>오른쪽 방향 중심 이동</dt><dd id="pattern-right">—</dd></div><div><dt>뒤쪽 방향 중심 이동</dt><dd id="pattern-rear">—</dd></div><div><dt>C1 중앙후방 비중 변화</dt><dd id="pattern-center">—</dd></div><div><dt>비교 기준</dt><dd id="pattern-baseline">미등록</dd></div><div><dt>최근 센서 입력</dt><dd id="pattern-time">—</dd></div></dl><p id="pattern-baseline-note"></p></section><section class="panel pattern-details"><h2>입력과 배치</h2><p id="pattern-layout"></p><p>채택 도면: L1 왼쪽 앞 (12,12), R1 오른쪽 앞 (28,12), L2 왼쪽 뒤 (13,27), R2 오른쪽 뒤 (27,27), C1 중앙후방 (20,34). 외곽 40×40 기준이며 단위는 확인이 필요합니다. 착석자 기준 좌우, 위는 앞/무릎입니다.</p><p>히트맵은 5점 사이를 보간한 그림입니다. 측정하지 않은 곳의 실제 압력을 뜻하지 않습니다.</p><p>중심 이동은 5채널 상대값×채택 좌표의 가중 평균입니다. 물리적 압력 중심으로 검증되지 않았습니다. 좌우 비율은 L1/L2와 R1/R2만, C1 비중은 전체 합으로 계산합니다. 좌표는 채택됐지만 센서 종류·모델·감지면·GPIO·전송 순서·쿠션 위/아래·보정·실물 제작은 미확정입니다.</p></section>`;
export function paintPattern(state,connected,root=document,now=Date.now()){
 const find=s=>root.querySelector(s),text=(s,v)=>{const e=find(s);if(e&&e.textContent!==String(v))e.textContent=v;};
 const view=presentPattern(state,connected,now),p=state.pattern;
 text('#pattern-title',view.label);text('#pattern-reason',view.detail);text('#pattern-source',view.source==='demo'?'규칙 기반 · 가상':'규칙 기반 · 미검증');
 const section=find('.pattern-reading');if(section)section.dataset.result=view.status;
 const inputOkay=connected&&p&&geometryValid(p.layout)&&!inspectPacket(p.sample,p.layout,now)&&p.result?.reason!=='repeated';
 const f=inputOkay?featuresOf(p.sample.values,p.layout,p.sample.channelIds):null;
 const canvas=find('.seat canvas');if(canvas){if(inputOkay)drawHeatmap(canvas,p.sample.values,p.layout,p.sample.channelIds);canvas.hidden=!inputOkay;const seat=canvas.closest('.seat');seat.classList.toggle('no-pattern-input',!inputOkay);seat.setAttribute('aria-label',inputOkay?'5점 상대값 보간 · 실제 정밀 압력지도 아님':'유효한 센서 입력 없음');}
 text('#left',f?`${Math.round((1-f.rightShare)*100)}%`:'—');text('#right',f?`${Math.round(f.rightShare*100)}%`:'—');
 if(find('#pattern-maximum'))text('#pattern-maximum',f?(names[f.maximumChannel]??f.maximumChannel):'확인 불가');
 const validBaseline=!!p?.baseline&&view.reason!=='layout_changed'&&p.baseline.layoutId===p.layout.id&&p.baseline.geometrySignature===geometrySignature(p.layout);
 const delta=view.delta??(f&&validBaseline?{right:f.right-p.baseline.features.right,rear:f.rear-p.baseline.features.rear,center:f.center-p.baseline.features.center}:null);
 for(const k of ['right','rear','center'])text('#pattern-'+k,delta?`${delta[k]>=0?'+':''}${(delta[k]*100).toFixed(1)}${k==='center'?'%p':k==='right'?'% 폭':'% 깊이'}`:'—');
 text('#pattern-baseline',validBaseline?`${p.baseline.sampleCount}개 · ${(p.baseline.durationMs/1000).toFixed(1)}초`:'미등록');
 text('#pattern-baseline-note',validBaseline?'등록 당시 분포와 비교합니다. 기준 자체가 임상적으로 올바른 자세라고 확인된 것은 아닙니다.':'기기에서 비교할 기준 분포를 먼저 등록해 주세요.');
 text('#pattern-time',inputOkay?new Date(p.sample.sampledAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'입력 확인 필요');
 text('#pattern-layout',`${p?.layout?.id??DEMO_LAYOUT.id} · ${p?.source==='sensor'?'설치 설정 확인 필요':'채택 도면 v2 · 가상 입력 · 실물 미검증'}`);
 text('#baseline',p?.calibration?'등록 중':validBaseline?'가상 기준 등록됨':'새 배치 기준 필요');text('#calibrate',validBaseline?'기준 다시 등록':'기준 등록');
 const setup=find('#setup');if(setup){setup.hidden=!p?.calibration;text('#setup-countdown',`${Math.max(0,Math.ceil((RULES.calibrationMs-(p.calibration?.elapsedMs??0))/1000))}초 · 유효 입력 ${p.calibration?.sampleCount??0}개`);}
 const calibration=find('#calibrate');if(calibration)calibration.disabled=!connected||!!p?.calibration;
 const label=find('#calibration-result');if(label)label.textContent=p?.calibrationError?`${PATTERN_REASONS[p.calibrationError]}${validBaseline?' 이전 기준은 유지됩니다.':''}`:p?.calibration?'현재 분포를 유지해 주세요.':validBaseline?'개인 기준을 등록했습니다. 바른 자세의 인증은 아닙니다.':view.detail;
 return view;
}
