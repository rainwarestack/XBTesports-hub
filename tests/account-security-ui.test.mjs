import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=name=>readFileSync(new URL('../public/social/'+name,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');

test('password sign-in waits for the second factor, then stores the session; forgot password uses email flow',async()=>{
 const nodes=new Map(),storage=new Map(),events=[];let response={requiresTwoFactor:true,challenge:'challenge'},challenge,forgot=false,recovery;
 function node(selector){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',addEventListener(name,fn){this[name]=fn;},querySelector(){return null;},insertAdjacentHTML(){}});return nodes.get(selector);}
 const context=vm.createContext({location:{hostname:'xbtesports.nyc'},document:{querySelector:node},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},installEditorGuard(){},resetEditor(){},setEditorSaving(){},providerButtons(){},FormData:class{constructor(){return [['handle','Player'],['password','test password 123']];}},Blob,ArrayBuffer,Event,window:{dispatchEvent:e=>events.push(e.type)},fetch:async()=>({ok:true,json:async()=>response}),challengePrompt:(data,finish)=>{challenge={data,finish};},forgotPassword:()=>forgot=true,saveSession:data=>{context.result=data;storage.set('xbt-social-session',data.token);},showRecovery:key=>recovery=key});
 node('#dialog').showModal=()=>node('#dialog').open=true;node('#dialog').close=()=>node('#dialog').open=false;
 vm.runInContext(source('core.js'),context);
 context.signIn();node('#auth-recover').onclick();assert.equal(forgot,true);
 await node('#auth-form').submit({preventDefault(){}});assert.equal(storage.size,0);assert.equal(challenge.data.challenge,'challenge');assert.deepEqual(events,[]);
 challenge.finish({token:'verified-session',user:{handle:'Player'}});assert.equal(storage.get('xbt-social-session'),'verified-session');assert.deepEqual(events,['xbt-session']);
 response={ok:true,recovery:'rotated-recovery-key'};context.signIn('recover');await node('#auth-form').submit({preventDefault(){}});assert.equal(storage.has('xbt-social-session'),false);assert.equal(recovery,'rotated-recovery-key');
});

test('email-link tokens leave browser history immediately; reset requires matching passwords and forwards the second factor',async()=>{
 const token='a'.repeat(64),nodes={},state={user:{handle:'Player'},token:'old'},calls=[],events=[];let html='',historyPath,recovery;
 const context=vm.createContext({location:{hash:'#account-reset='+token,pathname:'/social/',search:''},history:{replaceState:(a,b,path)=>historyPath=path},state,sessionStorage:{removeItem(){}},Event,window:{dispatchEvent:e=>events.push(e.type)},$:s=>nodes[s]||(nodes[s]={}),esc:String,field:()=>'',modal:v=>html=v,submit:(node,fn)=>node.submit=fn,api:async(path,options)=>{calls.push({path,body:options.body});return {ok:true,recovery:'new-key'};},toast(){},close(){},signIn(){}});
 vm.runInContext(source('security.js'),context);context.showRecovery=key=>recovery=key;
 const link=context.captureSecurityLink();assert.equal(historyPath,'/social/');assert.equal(link.token,token);context.openSecurityLink(link);assert.match(html,/Reset your password/);
 await assert.rejects(()=>nodes['#reset-password'].submit({password:'one',confirm_password:'two'}),/do not match/);assert.equal(calls.length,0);
 await nodes['#reset-password'].submit({password:'new password 123',confirm_password:'new password 123',code:'123456'});assert.equal(calls[0].path,'/security/reset');assert.equal(calls[0].body.token,token);assert.equal(calls[0].body.code,'123456');assert.equal(state.token,'');assert.equal(state.user,null);assert.equal(recovery,'new-key');assert.deepEqual(events,['xbt-session']);
});
