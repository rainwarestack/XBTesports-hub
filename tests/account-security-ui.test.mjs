import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=name=>readFileSync(new URL('../public/social/'+name,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');

test('public sign-in offers Discord only, with no password or handle form',async()=>{
 const nodes=new Map();
 function node(selector){
  if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',isConnected:true,querySelector:node});
  return nodes.get(selector);
 }
 const context=vm.createContext({
  location:{hostname:'xbtesports.nyc'},document:{querySelector:node},
  sessionStorage:{getItem:()=>null},installEditorGuard(){},resetEditor(){},
  fetch:async()=>({ok:true,json:async()=>({providers:['Discord','Google']})})
 });
 node('#dialog').showModal=()=>node('#dialog').open=true;
 vm.runInContext(source('core.js')+'\n'+source('oauth.js'),context);
 context.signIn();
 await context.providerButtons(node('#provider-signin'));
 assert.match(node('#dialog-content').innerHTML,/Sign in to XBTesports/);
 assert.doesNotMatch(node('#dialog-content').innerHTML,/<form|<input/);
 const provider=node('#provider-signin');
 assert.match(provider.innerHTML,/Sign in with Discord/);
 assert.match(provider.innerHTML,/Opens Discord in a new window/);
 assert.doesNotMatch(provider.innerHTML,/Google|<form|<input/);
 assert.equal(typeof node('button').onclick,'function');
});

test('email-link tokens leave browser history immediately; reset requires matching passwords and forwards the second factor',async()=>{
 const token='a'.repeat(64),nodes={},state={user:{handle:'Player'},token:'old'},calls=[],events=[];let html='',historyPath,recovery;
 const context=vm.createContext({location:{hash:'#account-reset='+token,pathname:'/social/',search:''},history:{replaceState:(a,b,path)=>historyPath=path},state,sessionStorage:{removeItem(){}},Event,window:{dispatchEvent:e=>events.push(e.type)},$:s=>nodes[s]||(nodes[s]={}),esc:String,field:()=>'',modal:v=>html=v,submit:(node,fn)=>node.submit=fn,api:async(path,options)=>{calls.push({path,body:options.body});return {ok:true,recovery:'new-key'};},toast(){},close(){},signIn(){}});
 vm.runInContext(source('security.js'),context);context.showRecovery=key=>recovery=key;
 const link=context.captureSecurityLink();assert.equal(historyPath,'/social/');assert.equal(link.token,token);context.openSecurityLink(link);assert.match(html,/Reset your password/);
 await assert.rejects(()=>nodes['#reset-password'].submit({password:'one',confirm_password:'two'}),/do not match/);assert.equal(calls.length,0);
 await nodes['#reset-password'].submit({password:'new password 123',confirm_password:'new password 123',code:'123456'});assert.equal(calls[0].path,'/security/reset');assert.equal(calls[0].body.token,token);assert.equal(calls[0].body.code,'123456');assert.equal(state.token,'');assert.equal(state.user,null);assert.equal(recovery,'new-key');assert.deepEqual(events,['xbt-session']);
});
