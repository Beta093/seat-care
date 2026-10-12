// Escape belongs to the active playback mode, even when focus leaves its inner panel.
export function bindPlaybackKeyboard({target,getPlayer,exit,paint}){
 function keydown(event){
  const player=getPlayer();if(!player||event.defaultPrevented)return;
  if(event.key==='Escape'){event.preventDefault();exit();return;}
  if(!event.target?.closest?.('.playback'))return;
  const positions={ArrowLeft:Math.max(0,player.position-5000),ArrowRight:Math.min(player.duration,player.position+5000),Home:0,End:player.duration};
  if(!Object.hasOwn(positions,event.key))return;
  event.preventDefault();player.pause();player.seek(positions[event.key]);paint();
 }
 target.addEventListener('keydown',keydown);
 return ()=>target.removeEventListener('keydown',keydown);
}
