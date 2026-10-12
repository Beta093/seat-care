import {GEOMETRY,CHANNEL_IDS} from './layout.js';
const sample=(score,named,seconds)=>({score,values:CHANNEL_IDS.map(id=>named[id]),seconds});
export const profiles = {
 normal: sample(16,{L1:30,R1:31,L2:36,R2:35,C1:28},0),
 caution: sample(52,{L1:27,R1:38,L2:30,R2:67,C1:36},20),
 warning: sample(78,{L1:24,R1:42,L2:28,R2:90,C1:40},40),
 recovery: sample(21,{L1:32,R1:33,L2:34,R2:35,C1:29},0)
};
export function statusFor(score) {return score >= 70 ? 'warning' : score >= 40 ? 'caution' : 'normal';}
export function pressureReduction(before, after) {return before > 0 ? Math.round((before-after)/before*100) : 0;}
export function interpolate(values, x, y,layout=GEOMETRY,channelIds=CHANNEL_IDS) {
 const points=channelIds.map(id=>[layout.points[id].x,layout.points[id].y]);
 let sum=0, weight=0;
 points.forEach(([px,py],i)=>{const d=(x-px)**2+(y-py)**2;if(d<.00001){sum=values[i]*1e10;weight=1e10;return;}const w=1/(d*d+.00001);sum+=values[i]*w;weight+=w;});
 return sum/weight;
}
export function makeEvent(scenario, before, now = new Date()) {
 const base={id:now.getTime(),time:now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false}),type:scenario};
 if(scenario==='recovery') return {...base,title:'압력이 줄었어요',detail:`오른쪽 뒤쪽 상대 압력 ${pressureReduction(before,profiles.recovery.values[CHANNEL_IDS.indexOf('R2')])}% 감소 · 동일 압력 타이머 초기화`,score:21};
 if(scenario==='warning') return {...base,title:'압력 해소 안내',detail:'오른쪽 뒤쪽 압력 집중 · 관리자 화면에도 표시',score:78};
 if(scenario==='caution') return {...base,title:'압력 집중이 이어지고 있어요',detail:'오른쪽 뒤쪽 · 화면 안내',score:52};
 return {...base,title:'안정적으로 앉아 있어요',detail:'좌우 압력이 고르게 분포',score:16};
}

// Display simulation only. These are not clinical thresholds or a sensor algorithm.
export function accumulatedSample(seconds) {
 const t=Math.max(0, seconds);
 const score=t<=20?16+t*1.2:Math.min(96,40+(t-20)*1.9);
 const weight=Math.min(1,t/40);
 return {score,seconds:t,values:profiles.normal.values.map((v,i)=>v+(profiles.warning.values[i]-v)*weight)};
}
export function recoverySample(before,elapsed) {
 const progress=Math.min(1,Math.max(0,elapsed/4));
 const eased=progress*progress*(3-2*progress);
 return {score:before.score+(21-before.score)*eased,values:before.values.map((v,i)=>v+(profiles.recovery.values[i]-v)*eased),seconds:0,complete:progress===1};
}
export function warningIntervals(events) {
 const times=events.filter(e=>e.type==='caution'&&Number.isFinite(e.at)).map(e=>e.at);
 return times.slice(1).map((t,i)=>Math.round((t-times[i])/60000));
}
export const exampleDay=[
 {id:'ex1',time:'09:00',at:0,type:'normal',title:'기준 등록 후 정상 착석',detail:'좌우 압력 균형 · 알림 없음',score:16},
 {id:'ex2',time:'09:18',at:18*60000,type:'caution',title:'오른쪽 뒤쪽 압력 집중',detail:'동일 압력 18분 · 압력 해소 안내',score:52},
 {id:'ex3',time:'09:20',at:20*60000,type:'recovery',title:'체중 이동 후 압력 22% 감소',detail:'오른쪽 뒤쪽 상대 압력 64 → 50 · 타이머 초기화',score:21,beforeScore:78,reduction:22},
 {id:'ex4',time:'09:42',at:42*60000,type:'caution',title:'오른쪽 뒤쪽 압력 집중 재발',detail:'이전 주의 안내로부터 24분 · 압력 해소 안내',score:50}
];
