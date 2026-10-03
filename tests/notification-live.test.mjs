import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=name=>readFileSync(new URL('../public/social/'+name,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
function setup(){const timers=new Map(),events={},documentEvents={},badge={},link={setAttribute(name,value){this[name]=value;}},state={user:{id:'a'},token:'a'},document={hidden:false,addEventListener(name,fn){documentEvents[name]=fn;}};let serial=0,count=0,fail=false;
 const context=vm.createContext({state,document,AbortSignal:{timeout:()=>undefined},api:async()=>{if(fail)throw Error('offline');return {unread:count};},$:selector=>selector==='#notification-badge'?badge:link,setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>{events[name]=fn;}});
 vm.runInContext(source('notifications.js'),context);
 return {context,state,document,badge,link,events,documentEvents,timers,setCount:v=>count=v,setFailure:v=>fail=v,async tick(){assert.equal(timers.size,1);const [id,timer]=[...timers][0];timers.delete(id);assert.equal(timer.ms,3000);await timer.fn();}};
}
test('badge updates repeatedly without navigation and recovers after network failure',async()=>{
 const h=setup();h.context.mountNotifications();await new Promise(r=>setImmediate(r));assert.equal(h.badge.hidden,true);
 h.setCount(2);await h.tick();assert.equal(h.badge.textContent,'2');assert.equal(h.link['aria-label'],'Notifications, 2 unread');
 h.setFailure(true);await h.tick();assert.equal(h.badge.textContent,'2');
 h.setFailure(false);h.setCount(103);await h.tick();assert.equal(h.badge.textContent,'99+');
 h.setCount(0);await h.events['xbt-notifications']();assert.equal(h.badge.hidden,true);
 h.context.mountNotifications();assert.equal(h.timers.size,1);
 h.document.hidden=true;await h.documentEvents.visibilitychange();assert.equal(h.timers.size,0);
 h.document.hidden=false;h.setCount(3);await h.documentEvents.visibilitychange();assert.equal(h.badge.textContent,'3');
 h.state.user=null;h.state.token='';h.events['xbt-session']();assert.equal(h.badge.hidden,true);assert.equal(h.timers.size,0);
});
test('old account responses cannot overwrite the badge after sign-out',async()=>{
 const h=setup();let resolve;h.context.api=()=>new Promise(r=>resolve=r);const pending=h.context.refreshNotifications();h.state.user=null;h.state.token='';await h.context.refreshNotifications();resolve({unread:9});await pending;assert.equal(h.badge.hidden,true);
});
test('open notification list refreshes without reloading the page and stops writing after navigation',async()=>{
 const root={isConnected:true},list={innerHTML:''},button={},cleanups=[];let items=[],tick;
 const context=vm.createContext({api:async()=>({items}),signed:()=>true,title:()=>'',empty:()=>'<p>Empty</p>',esc:String,formatDate:String,$:s=>s==='#notification-items'?list:button,state:{cleanups},poll:fn=>tick=fn,document:{hidden:false,addEventListener(){},removeEventListener(){}},addEventListener(){},removeEventListener(){},AbortSignal:{timeout:()=>undefined}});
 vm.runInContext(source('community.js'),context);await context.notifications(root);assert.match(list.innerHTML,/Empty/);
 items=[{id:'new',text:'New invitation',link:'/social/crews',is_read:0,created_at:'today'}];await tick();assert.match(list.innerHTML,/New invitation/);assert.match(list.innerHTML,/NEW/);
 items=[{...items[0],is_read:1}];await tick();assert.doesNotMatch(list.innerHTML,/>NEW</);
 root.isConnected=false;items=[];await tick();assert.match(list.innerHTML,/New invitation/);cleanups.forEach(fn=>fn());
});
