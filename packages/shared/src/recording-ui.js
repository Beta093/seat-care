import {bindPlaybackKeyboard} from './playback-keyboard.js';
import {createRemoteRecorder} from './remote-recording.js';
import {createPlayback,parseRecording,RECORDING_LIMITS} from './recording.js';
import {drawHeatmap} from './view.js';
import {statusFor} from './model.js';
export function mountRecording({host,getLive,canRecord,onModeChange}){
 host.innerHTML=`<details class="recording-tools"><summary>시연 기록 · 파일 재생</summary><p>로컬 서버가 생성한 가상 프레임을 저장합니다. 관리자 탭을 보는 동안에도 계속 기록하며, 수신하지 않은 구간은 만들지 않습니다. 최대 10분·2 MiB입니다. 서버 종료 전 저장하세요. 새 기록은 이전 메모리 기록을 대체합니다.</p><div class="recording-buttons"><button data-record="start">새 기록 시작</button><button data-record="stop" disabled>기록 중지</button><button data-record="save" disabled>기록 파일 저장</button><button data-record="preview" disabled>기록 미리 재생</button><button data-record="load">기록 파일 열기</button></div><input class="recording-file" type="file" accept=".json,application/json" aria-label="가상 시연 기록 파일" hidden><p class="recording-message" role="status"></p><section class="playback" hidden aria-label="저장된 시연 재생"><h2>저장된 시연 재생</h2><p>과거 가상 데이터이며 현재값이 아닙니다. v2 배치 정보가 있는 기록만 지도를 표시합니다. v1은 배치 미기록으로 지도를 숨깁니다. 기준·추정은 재생하지 않으며 관리자 현재 상태에 전달하지 않습니다.</p><p class="playback-layout"></p><p class="playback-state"></p><strong class="playback-score"></strong><p class="playback-pressure"></p><canvas width="120" height="120" aria-label="저장된 5채널 상대 압력"></canvas><div class="recording-buttons"><button data-record="toggle">재생</button><button data-record="exit">재생 종료 · 실시간으로</button></div><label>재생 위치 <input class="playback-seek" type="range" min="0" max="1" step="any" value="0"></label><output class="playback-time"></output><p>재생 영역 키보드: 좌우 화살표 5초 이동 · Home/End 처음/끝 · 재생 중 페이지 어디서나 Esc 종료</p></section></details>`;
 const find=s=>host.querySelector(s),button=name=>find(`[data-record="${name}"]`),recorder=createRemoteRecorder();
 let player=null,stored=null,loading=false,loadId=0,lastCheck=-Infinity,closed=false;
 const message=text=>{find('.recording-message').textContent=text;};
 function controls(){button('start').disabled=loading||recorder.pending||!!player||recorder.active||!canRecord();button('stop').disabled=recorder.pending||!recorder.active;button('save').disabled=loading||recorder.pending||recorder.active||!stored;button('preview').disabled=loading||recorder.pending||recorder.active||!stored||!!player;button('load').disabled=loading||recorder.pending||recorder.active||!!player;}
 function paint(){if(!player)return;const frame=player.tick();const layout=player.layout;find('canvas').hidden=frame.gapMs>1500||!layout;find('.playback-layout').textContent=layout?`기록 배치: ${layout.id} · C1 중앙후방`:'이전 v1 기록 · 배치와 채널 이름 미기록 · 지도 숨김';find('.playback-state').textContent=frame.gapMs>1500?'기록 공백 · 이 구간에 수신한 유효 프레임이 없습니다.':`저장된 상태: ${{normal:'안정',caution:'주의',warning:'경고'}[statusFor(frame.score)]}`;find('.playback-score').textContent=frame.gapMs>1500?'시연 점수 —':`시연 점수 ${Math.round(frame.score)} / 100`;find('.playback-pressure').textContent=frame.gapMs>1500?'공백 구간의 값은 추정하거나 채우지 않습니다.':`저장된 동일 압력 시간 ${Math.floor(frame.seconds)}초`;if(layout)drawHeatmap(find('canvas'),frame.values,layout,layout.channelIds);find('.playback-seek').value=String(player.position);find('.playback-time').textContent=`${(player.position/1000).toFixed(1)} / ${(player.duration/1000).toFixed(1)}초`;const toggleLabel=player.playing?'일시정지':'재생';if(button('toggle').textContent!==toggleLabel)button('toggle').textContent=toggleLabel;}
 function enter(data){player=createPlayback(data);find('.playback').hidden=false;find('.playback-seek').max=String(player.duration);document.body.classList.add('is-replaying');onModeChange(true);message('저장된 시연 재생 · 현재 상태가 아닙니다.');paint();controls();button('toggle').focus();}
 function exit(){if(!player)return;player.pause();player=null;find('.playback').hidden=true;document.body.classList.remove('is-replaying');onModeChange(false);message('재생을 종료했습니다. 실시간 화면의 연결 상태를 확인해 주세요.');controls();if(host.hidden)document.querySelector('#main')?.focus();else button('preview').focus();}
 host.addEventListener('click',async e=>{
  const b=e.target.closest('[data-record]');if(!b||b.disabled)return;
  try{switch(b.dataset.record){
   case 'start':if(!player&&canRecord()){const task=recorder.start();controls();await task;stored=null;message('서버 기록 중 · 탭을 바꿔도 계속 수집합니다. 서버 종료 전 파일로 저장하세요.');}break;
   case 'stop':{const task=recorder.stop();controls();finish(await task);break;}
   case 'preview':if(stored&&!recorder.active)enter(stored);break;
   case 'toggle':if(player){player.playing?player.pause():player.play();paint();button('toggle').focus({preventScroll:true});}break;
   case 'exit':exit();break;
   case 'load':find('input[type=file]').value='';find('input[type=file]').click();break;
   case 'save':{const url=URL.createObjectURL(new Blob([JSON.stringify(stored)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`seat-care-recording-${stored.startedAt}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('다운로드를 요청했습니다. 브라우저에서 저장 결과를 확인해 주세요.');break;}
  }}catch(error){message(error.message);}controls();
 });
 find('input[type=file]').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  const id=++loadId;loading=true;controls();
  try{if(file.size>RECORDING_LIMITS.bytes)throw Error('파일은 2 MiB 이하여야 합니다.');const parsed=parseRecording(await file.text());if(id!==loadId)return;stored=parsed;enter(stored);}
  catch(error){if(id===loadId)message(`파일을 열지 못했습니다: ${error.message}`);}
  finally{if(id===loadId){loading=false;controls();}}
 });
 find('input[type=file]').addEventListener('cancel',()=>message('파일 선택을 취소했습니다. 기존 기록은 유지됩니다.'));
 find('.playback-seek').addEventListener('input',e=>{if(player){player.pause();player.seek(Number(e.target.value));paint();}});
 const unbindKeyboard=bindPlaybackKeyboard({target:document,getPlayer:()=>player,exit,paint});
 function finish(result){stored=result.recording?parseRecording(JSON.stringify(result.recording)):null;message(stored?`${stored.frames.length}개 프레임 · ${(result.durationMs/1000).toFixed(1)}초 기록 완료. 파일로 저장할 수 있습니다.${result.error?` ${result.error}`:""}`:'서버가 두 번째 프레임을 생성하기 전에 중지했습니다. 새 기록을 시작하고 잠시 기다려 주세요.');}
 async function checkRecording(){
  if(closed||!recorder.active||recorder.pending||performance.now()-lastCheck<1000)return;
  lastCheck=performance.now();
  try{const result=await recorder.status();if(closed||!result||recorder.pending)return;
   if(!result.active){finish(await recorder.stop());}
   else message(`서버 기록 중 · ${result.count}개 프레임 · ${(result.durationMs/1000).toFixed(1)}초 수집 · 오류 입력 ${result.skippedFrames??0}개 제외 · 탭을 바꿔도 계속 기록합니다.`);
  }catch(error){if(!closed)message(`기록 상태 확인 지연: ${error.message} 연결 복구 후 기록 중지를 다시 눌러 확인하세요.`);}finally{if(!closed)controls();}
 }
 const timer=setInterval(()=>{paint();void checkRecording();},100);
 controls();return {
  get replaying(){return !!player;},
  capture(){void checkRecording();controls();},
  connectionChanged(){if(recorder.active&&!canRecord())message('화면 수신 대기 · 서버 기록은 계속됩니다. 연결 복구 후 기록 중지로 수집 결과를 확인하세요.');else void checkRecording();controls();},
  close(){closed=true;loadId++;clearInterval(timer);unbindKeyboard();exit();}
 };
}
