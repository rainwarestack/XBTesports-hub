import {finishSignIn,reauthenticate} from './security.mjs';
import {body,fail,hash,secret,one,run,query,id,now,rate,str} from './core.mjs';
import {handle,session,requireUser} from './auth.mjs';
const providers={discord:{name:'Discord',prefix:'DISCORD',authorize:'https://discord.com/oauth2/authorize',token:'https://discord.com/api/oauth2/token',identity:'https://discord.com/api/v10/users/@me',scope:'identify'},google:{name:'Google',prefix:'GOOGLE',authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',identity:'https://openidconnect.googleapis.com/v1/userinfo',scope:'openid profile'}};
const configured=(env,key)=>!!(providers[key]&&env[providers[key].prefix+'_CLIENT_ID']&&env[providers[key].prefix+'_CLIENT_SECRET']&&env.OAUTH_BASE_URL);
const redirect=(env,key='discord')=>env.OAUTH_BASE_URL+'/api/social/oauth/'+(key==='google'?'google/':'')+'callback';
const cookie='__Host-xbt-oauth';
// The provider callback is bound to a secure popup cookie. Completing the flow
// also requires a separate browser-only verifier; no session travels in a URL.
export async function oauthRoute(request,env,path,user){
 if(!path.startsWith('/oauth/'))return;
 const db=env.SOCIAL_DB,u=new URL(request.url);
 if(path==='/oauth/providers'&&request.method==='GET')return {providers:Object.keys(providers).filter(key=>configured(env,key)).map(key=>providers[key].name)};
 if(path==='/oauth/begin'&&request.method==='POST'){
  await rate(db,'oauth:'+await hash(request.headers.get('CF-Connecting-IP')||'local'),12,900);
  const b=await body(request),provider=String(b.provider||'discord').toLowerCase();if(!configured(env,provider))throw fail('Provider sign-in is not configured yet.',503);if(!/^[a-f0-9]{64}$/.test(b.challenge||''))throw fail('Invalid sign-in request.');
  if(b.link){requireUser(user,true);await reauthenticate(request,env,user,b);}
  const state=secret();await run(db,'DELETE FROM oauth_flows WHERE expires_at<?',Date.now());
  await run(db,'INSERT INTO oauth_flows(state_hash,verifier_hash,user_id,expires_at,provider,provider_verifier) VALUES(?,?,?,?,?,?)',await hash(state),b.challenge,b.link?user.id:null,Date.now()+600000,provider,secret());
  return {state,url:env.OAUTH_BASE_URL+'/api/social/oauth/start?state='+state};
 }
 const state=str(u.searchParams.get('state'),'state',64);
 if(path==='/oauth/start'&&request.method==='GET'){
  const flow=state?await one(db,'SELECT * FROM oauth_flows WHERE state_hash=? AND expires_at>? AND subject IS NULL',await hash(state),Date.now()):null;if(!flow)throw fail('Sign-in expired. Start again.');
  const provider=providers[flow.provider];if(!configured(env,flow.provider))throw fail('Provider unavailable.',503);const authorize=new URL(provider.authorize);authorize.search=new URLSearchParams({client_id:env[provider.prefix+'_CLIENT_ID'],response_type:'code',scope:provider.scope,redirect_uri:redirect(env,flow.provider),state,prompt:flow.provider==='google'?'select_account':'consent'});if(flow.provider==='google'){authorize.searchParams.set('code_challenge',Buffer.from(await hash(flow.provider_verifier),'hex').toString('base64url'));authorize.searchParams.set('code_challenge_method','S256');}
  return new Response(null,{status:302,headers:{Location:authorize.href,'Set-Cookie':`${cookie}=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`}});
 }
 if(['/oauth/callback','/oauth/google/callback'].includes(path)&&request.method==='GET'){
  const saved=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='))?.slice(cookie.length+1);
  if(!state||saved!==state)throw fail('Sign-in validation failed. Close this window and try again.',403);
  const flow=await one(db,'SELECT * FROM oauth_flows WHERE state_hash=? AND expires_at>? AND subject IS NULL',await hash(state),Date.now());
  if(!flow||!u.searchParams.get('code'))throw fail('Sign-in cancelled or expired. Close this window and try again.');
  const key=path==='/oauth/google/callback'?'google':'discord',provider=providers[key];if(flow.provider!==key||!configured(env,key))throw fail('Provider mismatch. Start sign-in again.',403);
  const tokenResponse=await fetch(provider.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env[provider.prefix+'_CLIENT_ID'],client_secret:env[provider.prefix+'_CLIENT_SECRET'],grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:redirect(env,key),...(key==='google'?{code_verifier:flow.provider_verifier}:{})}),signal:AbortSignal.timeout(10000)});
  if(!tokenResponse.ok)throw fail('The provider could not verify this sign-in. Please retry.',502);
  const token=await tokenResponse.json();
  const identityResponse=await fetch(provider.identity,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});
  if(!identityResponse.ok)throw fail('Provider identity could not be verified.',502);
  const identity=await identityResponse.json(),subject=key==='google'?identity.sub:identity.id;if(typeof subject!=='string'||!/^[A-Za-z0-9_-]{5,255}$/.test(subject))throw fail('Invalid provider identity.',502);
  await run(db,'UPDATE oauth_flows SET subject=? WHERE state_hash=? AND subject IS NULL',subject,await hash(state));
  return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Sign-in verified</title><body><h1>Identity verified</h1><p>Return to XBTesports Social to finish signing in. You can close this window.</p></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','Set-Cookie':`${cookie}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`}});
 }
 if(path==='/oauth/complete'&&request.method==='POST'){
  const b=await body(request);if(!/^[a-f0-9]{64}$/.test(b.verifier||'')||!/^[a-f0-9]{64}$/.test(b.state||''))throw fail('Invalid sign-in request.');
  const stateHash=await hash(b.state),verifierHash=await hash(b.verifier),flow=await one(db,'SELECT * FROM oauth_flows WHERE state_hash=? AND verifier_hash=? AND expires_at>?',stateHash,verifierHash,Date.now());
  if(!flow)throw fail('Sign-in expired. Start again.',401);if(!flow.subject)return {pending:true};
  const existing=await one(db,"SELECT u.* FROM oauth_identities o JOIN users u ON u.id=o.user_id WHERE o.provider=? AND o.subject=?",flow.provider,flow.subject);
  if(flow.user_id){requireUser(user,true);if(user.id!==flow.user_id)throw fail('Sign in to the original account before linking.',403);if(existing&&existing.id!==user.id)throw fail('This provider account is already linked to another player.',409);}
  if(existing&&['banned','suspended'].includes(existing.status))throw fail('This account is suspended.',403);
  if(!existing&&!flow.user_id&&!b.handle)return {needsHandle:true};
  let selectedHandle;if(!existing&&!flow.user_id){selectedHandle=handle(b.handle);if(await one(db,'SELECT 1 FROM users WHERE handle=?',selectedHandle))throw fail('That handle is already taken. Sign in with its password to link the provider, or choose another handle.',409);}
  // Atomic consumption prevents replay, including simultaneous completion calls.
  const consumed=await one(db,'DELETE FROM oauth_flows WHERE state_hash=? AND verifier_hash=? AND expires_at>? RETURNING state_hash',stateHash,verifierHash,Date.now());if(!consumed)throw fail('Sign-in already completed. Start again.',409);
  const uid=existing?.id||flow.user_id||id();
  if(!existing){try{const statements=[];if(!flow.user_id)statements.push(query(db,'INSERT INTO users(id,handle,password_hash,salt,recovery_hash,created_at) VALUES(?,?,?,?,?,?)',uid,selectedHandle,'oauth-only',secret(),await hash(secret()),now()),query(db,'INSERT INTO profiles(user_id,display_name) VALUES(?,?)',uid,selectedHandle));statements.push(query(db,"INSERT INTO oauth_identities(provider,subject,user_id) VALUES(?,?,?)",flow.provider,flow.subject,uid));await db.batch(statements);}catch(e){if(String(e).includes('UNIQUE'))throw fail('This account or handle was just linked. Start sign-in again.',409);throw e;}}
  return {...await (flow.user_id?session(db,existing||{id:uid}):finishSignIn(env,existing||{id:uid})),linked:!!flow.user_id};
 }
 throw fail('Not found.',404);
}
