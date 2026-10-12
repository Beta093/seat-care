// Foreground feedback remains usable without Notification or service-worker support.
export class ForegroundNotifications {
 constructor({window,document,navigator,onScreen=()=>{},onSoundError=()=>{}}){
  Object.assign(this,{window,document,navigator,onScreen,onSoundError});this.soundEnabled=false;this.audio=null;
 }
 async enableSystem(){
  if(!this.window.Notification||!this.navigator.serviceWorker)return {granted:false,reason:'unsupported'};
  try{const permission=await this.window.Notification.requestPermission();return {granted:permission==='granted',reason:permission};}
  catch{return {granted:false,reason:'failed'};}
 }
 async toggleSound(){
  if(this.soundEnabled){this.soundEnabled=false;return false;}
  const Audio=this.window.AudioContext||this.window.webkitAudioContext;
  if(!Audio)throw Error('이 브라우저는 알림음을 지원하지 않아요. 화면 알림은 계속 표시돼요.');
  try{this.audio??=new Audio();await this.audio.resume();if(this.audio.state!=='running')throw Error();this.soundEnabled=true;this.beep();return true;}
  catch{this.soundEnabled=false;throw Error('알림음을 켜지 못했어요. 화면 알림은 계속 표시돼요.');}
 }
 beep(){
  if(!this.soundEnabled)return;
  try{
   if(this.audio?.state!=='running')throw Error();
   const oscillator=this.audio.createOscillator(),gain=this.audio.createGain(),start=this.audio.currentTime;
   oscillator.frequency.value=660;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.12,start+.025);gain.gain.linearRampToValueAtTime(0,start+.35);
   oscillator.connect(gain);gain.connect(this.audio.destination);oscillator.start(start);oscillator.stop(start+.36);
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }catch{this.soundEnabled=false;this.onSoundError('알림음이 중단됐어요. 기기 설정에서 다시 켜 주세요. 화면 알림은 유지돼요.');}
 }
 async show(title,body){
  if(this.document.hidden)return {system:'paused'};
  this.onScreen(title,body);this.beep();
  const Notification=this.window.Notification;
  if(!Notification||!this.navigator.serviceWorker)return {system:'unsupported'};
  if(Notification.permission!=='granted')return {system:Notification.permission};
  let timeout;
  try{
   // Do not wait indefinitely for serviceWorker.ready on a failed registration.
   const delivery=(async()=>{
    const registration=await this.navigator.serviceWorker.getRegistration();
    if(!registration?.active)return {system:'unavailable'};
    if(this.document.hidden)return {system:'paused'};
    await registration.showNotification(title,{body,tag:'seat-care-posture',icon:'/icon-192.png',data:{url:'/#status'}});
    return {system:'shown'};
   })();
   return await Promise.race([delivery,new Promise(resolve=>{timeout=setTimeout(()=>resolve({system:'failed'}),2500);})]);
  }catch{return {system:'failed'};}finally{clearTimeout(timeout);}
 }
}
