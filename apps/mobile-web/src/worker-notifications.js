import {native,bridge} from './sensor-transport.js';
import {ForegroundNotifications} from './foreground-notifications.js';
export const webNotifications=new ForegroundNotifications({window,document,navigator,
 onScreen:(title,body)=>{
  const banner=document.querySelector('#foreground-alert');
  document.querySelector('#foreground-alert-title').textContent=title;
  document.querySelector('#foreground-alert-body').textContent=body;
  banner.hidden=false;
 },
 onSoundError:message=>{const node=document.querySelector('#notification-status');if(node)node.textContent=message;const button=document.querySelector('#toggle-sound');if(button){button.textContent='알림음 켜기';button.setAttribute('aria-pressed','false');}}
});
export function clearScreenAlert(){document.querySelector('#foreground-alert').hidden=true;}
export async function enableNotifications(){return native?bridge.enableNotifications():webNotifications.enableSystem();}
export async function notify(title,body){if(native)return;return webNotifications.show(title,body);}
