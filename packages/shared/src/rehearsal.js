// Scripted interview scenes. Never fed into sensor logic, care history, or reports.
export const REGIONS={right:'오른쪽',left:'왼쪽',back:'시트 뒤쪽',front:'시트 앞쪽'};
const values={right:[350,2800,400,2700,600],left:[2800,350,2700,400,600],back:[350,350,2500,2500,2900],front:[2800,2800,350,350,400]};
export const SCENES={
 basic:{name:'기본 화면',title:'압력이 고르게 분포하고 있어요',body:'편안한 상태로 시연을 시작해요.',values:[650,650,650,650,550],tone:'calm'},
 right:{name:'오른쪽 편중',title:'오른쪽에 압력이 집중되고 있어요',body:'움직일 수 있다면, 편안한 범위에서 왼쪽으로 체중을 조금 옮겨보세요.',values:values.right,tone:'caution'},
 left:{name:'왼쪽 편중',title:'왼쪽에 압력이 집중되고 있어요',body:'움직일 수 있다면, 편안한 범위에서 오른쪽으로 체중을 조금 옮겨보세요.',values:values.left,tone:'caution'},
 back:{name:'뒤쪽 편중',title:'시트 뒤쪽에 압력이 집중되고 있어요',body:'현재 앉은 위치를 확인하고, 평소 가능한 방법으로 해당 부위의 압력을 덜어보세요.',values:values.back,tone:'caution'},
 front:{name:'앞쪽 편중',title:'시트 앞쪽에 압력이 집중되고 있어요',body:'현재 앉은 위치를 확인하고, 평소 가능한 방법으로 해당 부위의 압력을 덜어보세요.',values:values.front,tone:'caution',note:'앞쪽 감지는 실측 확인 전인 인터뷰용 가설이에요.'},
 sustained:{name:'같은 부위 지속',title:'같은 부위에 압력이 계속 가해지고 있어요',tone:'warning'},
 relief:{name:'압력 감소',title:'해당 부위의 압력이 줄었어요',body:'화면에서 압력 변화를 확인해 주세요.',values:[450,450,450,450,400],tone:'relief'}
};
export function sceneView(state,now=Date.now()){
 const scene=SCENES[state.scene]||SCENES.basic;
 const region=REGIONS[state.region]||REGIONS.right;
 const result={...scene,values:scene.values||values[state.region]||values.right,
  body:state.scene==='sustained'?`${region}의 압력이 ${state.minutes}분 동안 유지되고 있어요. 가능한 자세 조정이나 도움을 통해 압력을 덜어보세요.`:state.scene==='relief'?`${region}의 압력이 줄었어요. 진행자가 전환한 개선 예시예요.`:scene.body};
 if(!state.active||!state.motion)return {...result,phase:'complete',progress:1};
 const elapsed=Math.max(0,now-state.changedAt),{holdMs,rampMs,from}=state.motion;
 const progress=Math.max(0,Math.min(1,(elapsed-holdMs)/rampMs));
 if(progress>=1)return {...result,phase:'complete',progress:1};
 const weight=progress*progress*(3-2*progress);
 const current=from.map((v,i)=>v+(result.values[i]-v)*weight);
 const reducing=state.scene==='relief',balancing=state.scene==='basic';
 return {...result,values:current,phase:elapsed<holdMs?'baseline':'changing',progress,tone:reducing?'relief':'calm',
  title:elapsed<holdMs?SCENES.basic.title:balancing?'압력이 서서히 고르게 분포하고 있어요':reducing?'해당 부위의 압력이 줄어들고 있어요':`${region}으로 압력이 서서히 모이고 있어요`,
  body:elapsed<holdMs?'편안하게 앉은 기본 장면에서 시작해요.':reducing||balancing?'압력 분포가 천천히 바뀌는 모습을 확인해 주세요.':'압력 분포의 변화를 확인하고 있어요.'};
}
export function alertPreview(state){
 if(!state.active||['basic','relief'].includes(state.scene))return null;
 const view=sceneView({...state,motion:null});
 const region=REGIONS[state.scene]||REGIONS[state.region];
 return {...view,title:state.scene==='sustained'?`${region} 편중 지속 · ${state.minutes}분`:view.name,
  body:view.title+'\n'+view.body};
}
export function alertView(state){return state.alert?alertPreview(state):null;}
export function emptyRehearsal(){return {version:1,active:false,scene:'basic',region:'right',minutes:10,revision:'waiting',changedAt:0,expiresAt:0,alert:null,responses:{},receipts:{}};}
export function publicState(value,now=Date.now()){
 if(!value||value.version!==1)return emptyRehearsal();
 return value.active&&value.expiresAt<=now?{...value,active:false}:value;
}
export function transition(state,input,role,now,id){
 if(input.action==='scene'||input.action==='finish'){
  if(role!=='control')throw Error('조종 화면에서만 장면을 바꿀 수 있어요.');
  if(input.action==='scene'&&(!Object.hasOwn(SCENES,input.scene)||!Object.hasOwn(REGIONS,input.region)||!Number.isInteger(input.minutes)||input.minutes<1||input.minutes>120||![4000,8000,12000].includes(input.durationMs??8000)))throw Error('장면과 예시 시간을 확인해 주세요.');
  if(input.expectedRevision!==state.revision)throw Error('다른 조종 화면에서 장면이 바뀌었어요. 최신 화면에서 다시 눌러 주세요.');
  const reducing=input.scene==='relief',balancing=input.scene==='basic';
  // Capture the interpolated distribution, including when a transition is interrupted.
  const current=state.active?sceneView(state,now):null;
  const initial=!current||(state.scene==='basic'&&current.phase==='complete');
  const holdMs=initial&&!reducing&&!balancing?2000:0;
  const motion=input.action==='scene'&&(!balancing||state.active)?{
   holdMs,rampMs:reducing||balancing?4000:(input.durationMs??8000)-holdMs,
   from:current?[...current.values]:[...SCENES.basic.values]
  }:null;
  return {...state,active:input.action==='scene',scene:input.scene||state.scene,region:input.region||state.region,minutes:input.minutes||state.minutes,motion,revision:id,changedAt:now,expiresAt:now+8*3600000,alert:null,responses:{},receipts:{}};
 }
 if(['notify','clear-alert'].includes(input.action)){
  if(role!=='control')throw Error('조종실에서만 알림을 보낼 수 있어요.');
  if(!alertPreview(state))throw Error('먼저 편중 장면을 선택해 주세요.');
  if(input.expectedRevision!==state.revision||(input.expectedAlertId??null)!==(state.alert?.id??null))throw Error('장면이나 알림이 바뀌었어요. 최신 화면에서 다시 눌러 주세요.');
  return {...state,alert:input.action==='notify'?{id,at:now}:null,responses:{},receipts:{}};
 }
 if(!['worker','admin'].includes(role)||!state.active||input.revision!==state.revision)throw Error('장면이 바뀌었어요. 새 장면에서 다시 눌러 주세요.');
 if((input.alertId??null)!==(state.alert?.id??null))throw Error('알림이 바뀌었어요. 새 알림에서 다시 눌러 주세요.');
 if(input.action==='receipt')return {...state,receipts:{...state.receipts,[role]:{revision:state.revision,alertId:state.alert?.id??null,at:now}}};
 if(!alertView(state))throw Error('진행자가 알림을 보내면 반응해 주세요.');
 const allowed=role==='worker'?['adjust','help']:['acknowledge'];
 if(input.action!=='response'||!allowed.includes(input.response))throw Error('지원하지 않는 시연 반응이에요.');
 return {...state,responses:{...state.responses,[role]:{value:input.response,at:now}}};
}
