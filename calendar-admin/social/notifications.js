import {api,state,$} from './core.js?v=20261003-notifications';

let revision=0;
function display(count){
 const link=$('#notifications-link'),badge=$('#notification-badge');if(!link||!badge)return;
 badge.hidden=count===0;badge.textContent=count>99?'99+':String(count);
 link.setAttribute('aria-label',count?`Notifications, ${count} unread`:'Notifications');
}
export async function refreshNotifications(){
 const current=++revision,token=state.token;
 if(!state.user){display(0);return;}
 try{const data=await api('/notifications/count');if(current===revision&&state.token===token)display(data.unread);}catch{}
}
export function mountNotifications(){
 refreshNotifications();
 setInterval(()=>{if(!document.hidden)refreshNotifications();},15000);
 addEventListener('focus',refreshNotifications);
 addEventListener('xbt-session',()=>{display(0);refreshNotifications();});
 addEventListener('xbt-notifications',refreshNotifications);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshNotifications();});
}
