import {api,state,$} from './core.js?v=20261006-editor-guard';

let revision=0,timer=null,mounted=false,inFlight=false,queued=false;
function display(count){
 const link=$('#notifications-link'),badge=$('#notification-badge');if(!link||!badge)return;
 badge.hidden=count===0;badge.textContent=count>99?'99+':String(count);
 link.setAttribute('aria-label',count?`Notifications, ${count} unread`:'Notifications');
}
function schedule(){clearTimeout(timer);if(mounted&&!document.hidden&&state.user)timer=setTimeout(refreshNotifications,3000);}
export async function refreshNotifications(){
 clearTimeout(timer);const current=++revision,token=state.token;
 if(!state.user){display(0);return;}
 if(document.hidden)return;
 if(inFlight){queued=true;return;}
 inFlight=true;
 try{const data=await api('/notifications/count',{signal:AbortSignal.timeout(8000)});if(current===revision&&state.token===token)display(data.unread);}catch{}finally{
  inFlight=false;
  if(queued){queued=false;refreshNotifications();}else schedule();
 }
}
export function mountNotifications(){
 if(mounted)return;mounted=true;
 addEventListener('focus',refreshNotifications);
 addEventListener('online',refreshNotifications);
 addEventListener('xbt-session',()=>{display(0);refreshNotifications();});
 addEventListener('xbt-notifications',refreshNotifications);
 document.addEventListener('visibilitychange',refreshNotifications);
 refreshNotifications();
}
