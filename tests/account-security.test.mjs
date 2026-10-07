import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {socialAPI} from '../worker/social/api.mjs';
import {oauthRoute} from '../worker/social/oauth.mjs';
import {base32,totp,matchingStep,seal,unseal} from '../worker/social/totp.mjs';
import {hash} from '../worker/social/core.mjs';
import {session} from '../worker/social/auth.mjs';

function database(){const sqlite=new DatabaseSync(':memory:');const dir=new URL('../worker/social/migrations/',import.meta.url);for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(file,dir),'utf8'));return {sqlite,prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
function fixture(){const db=database(),env={SOCIAL_DB:db,ACCOUNT_SECURITY_KEY:'a'.repeat(64)},tasks=[];let ip=0;const call=async(path,body,token)=>{const response=await socialAPI(new Request('https://social.example/api/social'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'test-'+(++ip),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);return {status:response.status,...await response.json()};};return {db,env,call,tasks,clearLimits(){db.sqlite.exec('DELETE FROM rate_limits');}};}
const pass='A unique test password 2026';

test('TOTP matches RFC 6238 SHA1 vectors, limits drift, and binds encrypted secrets to their owner',async()=>{
 const key=base32(Buffer.from('12345678901234567890'));
 for(const [seconds,code] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totp(key,Math.floor(seconds/30),8),code);
 assert.equal(matchingStep(key,totp(key,100),-1,3000000),100);
 assert.equal(matchingStep(key,totp(key,100),100,3000000),null);
 assert.equal(matchingStep(key,totp(key,97),-1,3000000),null);
 const env={ACCOUNT_SECURITY_KEY:'1'.repeat(64)},encrypted=await seal(env,'alice',key);assert.ok(!encrypted.includes(key));assert.equal(await unseal(env,'alice',encrypted),key);
 await assert.rejects(()=>unseal(env,'bob',encrypted));await assert.rejects(()=>unseal({ACCOUNT_SECURITY_KEY:'2'.repeat(64)},'alice',encrypted));
});

test('2FA enrollment, password/OAuth challenge, one-use backups, expiry, account privacy, and revocation',async()=>{
 const f=fixture(),{db,env,call}=f;
 try{
  const signup=await call('/signup',{handle:'SecurePlayer',password:pass});let token=signup.token;const uid=signup.user.id;
  assert.equal((await call('/security/status')).status,401);
  const setup=await call('/security/setup',{},token);assert.equal(setup.status,200);assert.equal((await call('/security/status',undefined,token)).twoFactor,false);
  assert.equal((await call('/security/enable',{code:'bad'},token)).status,401);
  const enabled=await call('/security/enable',{code:totp(setup.secret,Math.floor(Date.now()/30000))},token);assert.equal(enabled.status,200);assert.equal(enabled.codes.length,8);token=enabled.token;
  assert.equal((await call('/session',undefined,signup.token)).user,null);
  assert.equal((await call('/security/status',undefined,token)).twoFactor,true);
  assert.ok(!JSON.stringify(enabled.user).includes('secret'));assert.equal('auth_version' in enabled.user,false);
  assert.notEqual(db.sqlite.prepare('SELECT totp_secret FROM account_security').get().totp_secret,setup.secret);
  const login=await call('/login',{handle:'SecurePlayer',password:pass});assert.equal(login.requiresTwoFactor,true);assert.equal(login.token,undefined);
  assert.equal((await call('/security/challenge',{challenge:login.challenge,code:'wrong'})).status,401);
  const signed=await call('/security/challenge',{challenge:login.challenge,code:enabled.codes[0]});assert.equal(signed.status,200);assert.ok(signed.token);
  assert.equal((await call('/security/challenge',{challenge:login.challenge,code:enabled.codes[1]})).status,401);
  const replay=await call('/login',{handle:'SecurePlayer',password:pass});assert.equal((await call('/security/challenge',{challenge:replay.challenge,code:enabled.codes[0]})).status,401);
  db.sqlite.prepare('UPDATE auth_challenges SET expires_at=0').run();assert.equal((await call('/security/challenge',{challenge:replay.challenge,code:enabled.codes[1]})).status,401);
  db.sqlite.prepare("INSERT INTO oauth_identities(provider,subject,user_id) VALUES('discord','123456789',?)").run(uid);
  const oauthState='b'.repeat(64),verifier='c'.repeat(64);db.sqlite.prepare("INSERT INTO oauth_flows(state_hash,verifier_hash,subject,expires_at,provider) VALUES(?,?,?,?,?)").run(await hash(oauthState),await hash(verifier),'123456789',Date.now()+60000,'discord');
  const oauth=await oauthRoute(new Request('https://social.example/api/social/oauth/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:oauthState,verifier})}),env,'/oauth/complete',null);assert.equal(oauth.requiresTwoFactor,true);assert.equal(oauth.token,undefined);
  f.clearLimits();
  assert.equal((await call('/recover',{handle:'SecurePlayer',recovery:signup.recovery,password:'Replacement test password 2026'})).status,401);
  const recovered=await call('/recover',{handle:'SecurePlayer',recovery:signup.recovery,password:'Replacement test password 2026',code:enabled.codes[1]});assert.equal(recovered.status,200);
  assert.equal((await call('/session',undefined,token)).user,null);assert.equal((await call('/security/challenge',{challenge:oauth.challenge,code:enabled.codes[2]})).status,401);
  assert.equal((await call('/login',{handle:'SecurePlayer',password:'Replacement test password 2026'})).requiresTwoFactor,true);
  assert.ok(db.sqlite.prepare('SELECT totp_secret FROM account_security').get().totp_secret);
  await assert.rejects(()=>session(db,{id:uid,auth_version:0}),e=>e.status===401);
 }finally{db.sqlite.close();}
});

test('email verification is private and account-bound; reset links are hashed, expiring, one-use, and preserve MFA',async()=>{
 const f=fixture(),{db,env,call}=f,emails=[];env.RESEND_API_KEY='test-mail-key';env.AUTH_EMAIL_FROM='XBT <security@example.test>';const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');emails.push(JSON.parse(options.body));return Response.json({id:'mail-'+emails.length});};
 const link=()=>emails.at(-1).text.match(/#account-(?:verify|reset)=([a-f0-9]{64})/)[1];
 try{
  const a=await call('/signup',{handle:'EmailPlayer',password:pass}),b=await call('/signup',{handle:'OtherPlayer',password:pass});let token=a.token;
  assert.equal((await call('/security/email',{email:'player@example.test'},token)).status,200);let verify=link();
  assert.equal((await call('/security/verify-email',{token:verify})).status,401);
  assert.equal((await call('/security/verify-email',{token:verify},b.token)).status,403);
  assert.equal((await call('/security/status',undefined,token)).email,'');
  assert.equal((await call('/security/verify-email',{token:verify},token)).status,200);assert.equal((await call('/security/verify-email',{token:verify},token)).status,401);
  assert.equal((await call('/security/status',undefined,token)).email,'player@example.test');
  const profile=await call('/players/EmailPlayer');assert.ok(!JSON.stringify(profile).includes('player@example.test'));
  const known=await call('/security/forgot',{email:'player@example.test'}),reset=link(),count=emails.length;assert.deepEqual(await call('/security/forgot',{email:'unknown@example.test'}),known);assert.equal(emails.length,count);
  assert.ok(!JSON.stringify(db.sqlite.prepare('SELECT * FROM account_email_tokens').all()).includes(reset));
  db.sqlite.prepare('UPDATE account_email_tokens SET expires_at=0').run();assert.equal((await call('/security/reset',{token:reset,password:pass})).status,401);
  f.clearLimits();const setup=await call('/security/setup',{},token),enabled=await call('/security/enable',{code:totp(setup.secret,Math.floor(Date.now()/30000))},token);token=enabled.token;
  await call('/security/forgot',{email:'player@example.test'});const valid=link();
  assert.equal((await call('/security/reset',{token:valid,password:'My replacement password 2026'})).status,401);
  const changed=await call('/security/reset',{token:valid,password:'My replacement password 2026',code:enabled.codes[0]});assert.equal(changed.status,200);assert.ok(changed.recovery);assert.equal(changed.token,undefined);
  assert.equal((await call('/security/reset',{token:valid,password:pass,code:enabled.codes[1]})).status,401);
  assert.equal((await call('/session',undefined,token)).user,null);assert.ok(db.sqlite.prepare('SELECT totp_secret FROM account_security WHERE user_id=?').get(a.user.id).totp_secret);
  assert.equal((await call('/login',{handle:'EmailPlayer',password:'My replacement password 2026'})).requiresTwoFactor,true);
 }finally{globalThis.fetch=original;db.sqlite.close();}
});

test('old sessions cannot enroll or replace recovery; MFA attempts are rate limited; disabling revokes sessions',async()=>{
 const f=fixture(),{db,call}=f;
 try{
  const a=await call('/signup',{handle:'ReauthPlayer',password:pass});let token=a.token;
  db.sqlite.prepare('UPDATE sessions SET expires_at=?').run(Date.now()+86000000);
  assert.equal((await call('/security/setup',{},token)).status,401);
  assert.equal((await call('/security/setup',{current_password:'not the real password'},token)).status,401);
  const setup=await call('/security/setup',{current_password:pass},token);assert.equal(setup.status,200);
  const enabled=await call('/security/enable',{current_password:pass,code:totp(setup.secret,Math.floor(Date.now()/30000))},token);assert.equal(enabled.status,200);token=enabled.token;
  const login=await call('/login',{handle:'ReauthPlayer',password:pass});for(let n=0;n<10;n++)assert.equal((await call('/security/challenge',{challenge:login.challenge,code:'bad'})).status,401);
  assert.equal((await call('/security/challenge',{challenge:login.challenge,code:enabled.codes[0]})).status,429);f.clearLimits();
  const disabled=await call('/security/disable',{code:enabled.codes[0]},token);assert.equal(disabled.status,200);assert.equal((await call('/session',undefined,token)).user,null);
  assert.equal((await call('/security/status',undefined,disabled.token)).twoFactor,false);assert.ok((await call('/login',{handle:'ReauthPlayer',password:pass})).token);
 }finally{db.sqlite.close();}
});
