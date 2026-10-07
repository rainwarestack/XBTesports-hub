import {body,fail,hash,secret,one,run,query,rate,str,notify} from './core.mjs';
import {requireUser,password,equal,session} from './auth.mjs';
import {base32,matchingStep,seal,unseal,totpConfigured} from './totp.mjs';

const genericReset={ok:true,message:'If that address is verified on an account, a password-reset link will arrive shortly. Check your spam folder too.'};
export const mailConfigured=env=>!!(env.RESEND_API_KEY&&env.AUTH_EMAIL_FROM);
const active=row=>{if(!row||['banned','suspended'].includes(row.status))throw fail('Sign-in is unavailable for this account.',403);return row;};
const codeValue=b=>str(b.code,'authentication code',64).replace(/[\s-]/g,'').toUpperCase();
function emailAddress(value){const email=str(value,'email address',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Enter a valid email address.');return email;}
async function limit(request,db,label,userId){await rate(db,label+':ip:'+await hash(request.headers.get('CF-Connecting-IP')||'local'),20,900);if(userId)await rate(db,label+':user:'+userId,10,900);}
async function securityRow(db,uid){return one(db,'SELECT * FROM account_security WHERE user_id=?',uid);}
export async function secondFactor(env,uid,code){
 const db=env.SOCIAL_DB,row=await securityRow(db,uid);if(!row?.totp_secret)return;
 await rate(db,'mfa-attempt:'+uid,10,300);
 const value=String(code||'').replace(/[\s-]/g,'').toUpperCase();let accepted;
 if(/^\d{6}$/.test(value)){
  const step=matchingStep(await unseal(env,uid,row.totp_secret),value,row.last_step);
  if(step!==null)accepted=await one(db,'UPDATE account_security SET last_step=? WHERE user_id=? AND totp_secret=? AND last_step<? RETURNING user_id',step,uid,row.totp_secret,step);
 }else if(/^[A-F0-9]{24}$/.test(value)){
  const codes=JSON.parse(row.backup_hashes),digest=await hash(value),index=codes.indexOf(digest);
  if(index>=0)accepted=await one(db,'UPDATE account_security SET backup_hashes=json_remove(backup_hashes,?) WHERE user_id=? AND totp_secret=? AND backup_hashes=? RETURNING user_id','$['+index+']',uid,row.totp_secret,row.backup_hashes);
 }
 if(!accepted)throw fail('Enter a current authenticator code or an unused backup code. If you just used a code, wait for the next one.',401);
}
export async function finishSignIn(env,user){
 const db=env.SOCIAL_DB,row=active(await one(db,'SELECT * FROM users WHERE id=?',user.id));
 if(user.auth_version!==undefined&&user.auth_version!==row.auth_version)throw fail('Account security changed. Sign in again.',401);
 if(!(await securityRow(db,row.id))?.totp_secret)return session(db,row);
 const challenge=secret();await run(db,'DELETE FROM auth_challenges WHERE expires_at<?',Date.now());
 await run(db,'INSERT INTO auth_challenges VALUES(?,?,?,?)',await hash(challenge),row.id,row.auth_version,Date.now()+300000);
 return {requiresTwoFactor:true,challenge};
}
// An existing session alone cannot change account recovery or factors. Require
// the password, or a fresh sign-in (including OAuth), plus the existing factor.
export async function reauthenticate(request,env,user,b){
 requireUser(user);if(user.id==='access-owner')throw fail('Use your player account to manage account security.',403);
 const db=env.SOCIAL_DB,row=active(await one(db,'SELECT * FROM users WHERE id=?',user.id));
 await limit(request,db,'reauth',row.id);
 if(b.current_password){if(row.password_hash==='oauth-only'||!equal(password(b.current_password,row.salt,!row.password_hash.startsWith('scrypt-v1$')),row.password_hash))throw fail('Current password is incorrect.',401);}
 else {const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||!await one(db,'SELECT 1 FROM sessions s LEFT JOIN session_auth_versions v ON v.token_hash=s.token_hash WHERE s.token_hash=? AND s.user_id=? AND COALESCE(v.auth_version,0)=? AND s.expires_at>?',await hash(token),row.id,row.auth_version,Date.now()+86100000))throw fail('Enter your current password, or sign out and sign in again before changing security settings.',401);}
 await secondFactor(env,row.id,codeValue(b));return row;
}
async function backupCodes(){const codes=Array.from({length:8},()=>secret().slice(0,24).toUpperCase());return {codes:codes.map(c=>c.match(/.{6}/g).join('-')),hashes:JSON.stringify(await Promise.all(codes.map(hash)))};}
function revoke(db,uid){return [query(db,'DELETE FROM sessions WHERE user_id=?',uid),query(db,'DELETE FROM auth_challenges WHERE user_id=?',uid),query(db,'DELETE FROM account_email_tokens WHERE user_id=?',uid),query(db,'DELETE FROM oauth_flows WHERE user_id=?',uid),query(db,'UPDATE account_security SET pending_secret=NULL,pending_until=NULL WHERE user_id=?',uid)];}
async function sendMail(env,to,subject,text,tokenHash){const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'account-'+tokenHash},body:JSON.stringify({from:env.AUTH_EMAIL_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw fail('Email could not be sent. Please try again later.',503);}
async function emailToken(env,row,email,purpose){
 const db=env.SOCIAL_DB,token=secret(),tokenHash=await hash(token),expires=Date.now()+(purpose==='reset'?900000:1800000);
 await run(db,'DELETE FROM account_email_tokens WHERE expires_at<?',Date.now());
 await db.batch([query(db,'DELETE FROM account_email_tokens WHERE user_id=? AND purpose=?',row.id,purpose),query(db,'INSERT INTO account_email_tokens VALUES(?,?,?,?,?,?)',tokenHash,row.id,purpose,email,row.auth_version,expires)]);
 // Fixed first-party destination; never construct recovery URLs from Host/Origin.
 const link='https://xbtesports.nyc/social/#account-'+purpose+'='+token;
 try{await sendMail(env,email,purpose==='reset'?'Reset your XBTesports Social password':'Verify your XBTesports Social recovery email',`Hello @${row.handle},\n\n${purpose==='reset'?'Reset your password using':'Verify your recovery email using'} this link:\n${link}\n\nThis link expires in ${purpose==='reset'?'15':'30'} minutes and can be used once. ${purpose==='reset'?'Two-factor authentication stays enabled.':''}\n\nIf you did not request this, ignore this email.`,tokenHash);}catch(e){await run(db,'DELETE FROM account_email_tokens WHERE token_hash=?',tokenHash);throw e;}
}
export async function securityRoute(request,env,path,user){
 if(!path.startsWith('/security/'))return;
 const db=env.SOCIAL_DB;
 if(path==='/security/status'&&request.method==='GET'){
  requireUser(user);const row=await securityRow(db,user.id),account=await one(db,'SELECT password_hash FROM users WHERE id=?',user.id);
  return {twoFactor:!!row?.totp_secret,twoFactorAvailable:totpConfigured(env),emailAvailable:mailConfigured(env),email:row?.email||'',backupCodesRemaining:row?JSON.parse(row.backup_hashes).length:0,hasPassword:account?.password_hash!=='oauth-only'};
 }
 if(request.method!=='POST')throw fail('Not found.',404);
 const b=await body(request);
 if(path==='/security/challenge'){
  await limit(request,db,'challenge');const tokenHash=await hash(str(b.challenge,'challenge',64,true)),challenge=await one(db,'SELECT * FROM auth_challenges WHERE token_hash=? AND expires_at>?',tokenHash,Date.now());
  if(!challenge)throw fail('Sign-in expired. Start again.',401);
  const row=active(await one(db,'SELECT * FROM users WHERE id=? AND auth_version=?',challenge.user_id,challenge.auth_version));
  await secondFactor(env,row.id,codeValue(b));
  if(!await one(db,'DELETE FROM auth_challenges WHERE token_hash=? AND expires_at>? RETURNING token_hash',tokenHash,Date.now()))throw fail('Sign-in expired. Start again.',401);
  return session(db,row);
 }
 if(path==='/security/forgot'){
  if(!mailConfigured(env))throw fail('Email recovery is not available yet. Use your recovery key or linked sign-in provider.',503);
  const email=emailAddress(b.email);await limit(request,db,'forgot');await rate(db,'forgot-email:'+await hash(email),3,900);
  const task=(async()=>{const row=await one(db,"SELECT u.* FROM users u JOIN account_security s ON s.user_id=u.id WHERE s.email=? AND u.status NOT IN ('banned','suspended')",email);if(row)await emailToken(env,row,email,'reset');})();
  if(env.waitUntil)env.waitUntil(task.catch(()=>console.error('Account recovery email delivery failed.')));else await task;
  return genericReset;
 }
 if(path==='/security/verify-email'||path==='/security/reset'){
  await limit(request,db,'email-token');const purpose=path.endsWith('/reset')?'reset':'verify',tokenHash=await hash(str(b.token,'email link',64,true));
  const token=await one(db,'SELECT * FROM account_email_tokens WHERE token_hash=? AND purpose=? AND expires_at>?',tokenHash,purpose,Date.now());
  if(!token)throw fail('This link expired or was already used. Request a new email.',401);
  const row=active(await one(db,'SELECT * FROM users WHERE id=? AND auth_version=?',token.user_id,token.auth_version));
  if(purpose==='verify'){
   requireUser(user);if(user.id!==row.id)throw fail('Sign in to the account that requested this email first.',403);
   try{const result=await db.batch([
    query(db,'UPDATE account_security SET email=? WHERE user_id=? AND EXISTS(SELECT 1 FROM account_email_tokens WHERE token_hash=? AND expires_at>?) AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=?)',token.email,row.id,tokenHash,Date.now(),row.id,token.auth_version),
    query(db,"DELETE FROM account_email_tokens WHERE user_id=? AND changes()>0",row.id)
   ]);if(!result[0].meta.changes)throw fail('Link expired. Request a new email.',401);}catch(e){if(String(e).includes('UNIQUE'))throw fail('This email cannot be linked. Use a different address.',409);throw e;}
   await notify(db,row.id,'Your recovery email was verified.','/social/profile');return {ok:true};
  }
  const salt=secret(),digest=password(b.password,salt),recovery=secret();
  await secondFactor(env,row.id,codeValue(b));
  const result=await db.batch([
   query(db,'UPDATE users SET password_hash=?,salt=?,recovery_hash=?,auth_version=auth_version+1 WHERE id=? AND auth_version=? AND EXISTS(SELECT 1 FROM account_email_tokens WHERE token_hash=? AND expires_at>?) AND EXISTS(SELECT 1 FROM account_security WHERE user_id=? AND email=?)',digest,salt,await hash(recovery),row.id,token.auth_version,tokenHash,Date.now(),row.id,token.email),
   ...revoke(db,row.id),query(db,'UPDATE account_security SET pending_secret=NULL,pending_until=NULL WHERE user_id=?',row.id)
  ]);if(!result[0].meta.changes)throw fail('Account changed or link expired. Request a new email.',401);
  await notify(db,row.id,'Your password was reset. All previous sessions were signed out.','/social/profile');return {ok:true,recovery};
 }
 if(!['/security/setup','/security/enable','/security/disable','/security/backup-codes','/security/email','/security/password','/security/recovery-key'].includes(path))throw fail('Not found.',404);
 const row=await reauthenticate(request,env,user,b),uid=row.id;
 await run(db,'INSERT OR IGNORE INTO account_security(user_id) VALUES(?)',uid);
 const security=await securityRow(db,uid);
 if(path==='/security/setup'){
  if(security.totp_secret)throw fail('Two-factor authentication is already enabled.');
  const setupKey=base32(crypto.getRandomValues(new Uint8Array(20))),encrypted=await seal(env,uid,setupKey);
  await run(db,'UPDATE account_security SET pending_secret=?,pending_until=? WHERE user_id=? AND totp_secret IS NULL',encrypted,Date.now()+600000,uid);
  return {secret:setupKey,uri:'otpauth://totp/'+encodeURIComponent('XBTesports Social:'+row.handle)+'?secret='+setupKey+'&issuer=XBTesports%20Social&algorithm=SHA1&digits=6&period=30'};
 }
 if(path==='/security/enable'){
  if(security.totp_secret||!security.pending_secret||security.pending_until<Date.now())throw fail('Start two-factor setup again.');
  await rate(db,'mfa-setup:'+uid,10,300);
  const step=matchingStep(await unseal(env,uid,security.pending_secret),codeValue(b));if(step===null)throw fail('Enter the current six-digit code from your authenticator.',401);
  const backup=await backupCodes();
  const result=await db.batch([
   query(db,'UPDATE account_security SET totp_secret=pending_secret,pending_secret=NULL,pending_until=NULL,last_step=?,backup_hashes=? WHERE user_id=? AND totp_secret IS NULL AND pending_secret=? AND pending_until>? AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=?)',step,backup.hashes,uid,security.pending_secret,Date.now(),uid,row.auth_version),
   query(db,'UPDATE users SET auth_version=auth_version+1 WHERE id=? AND changes()>0',uid),...revoke(db,uid)
  ]);if(!result[0].meta.changes)throw fail('Setup expired. Start again.',409);
  await notify(db,uid,'Two-factor authentication is now enabled.','/social/profile');return {...await session(db,{id:uid,auth_version:row.auth_version+1}),codes:backup.codes};
 }
 if(path==='/security/disable'){
  if(!security.totp_secret)throw fail('Two-factor authentication is already off.');
  const result=await db.batch([query(db,"UPDATE account_security SET totp_secret=NULL,backup_hashes='[]',last_step=-1,pending_secret=NULL,pending_until=NULL WHERE user_id=? AND totp_secret=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=?)",uid,security.totp_secret,uid,row.auth_version),query(db,'UPDATE users SET auth_version=auth_version+1 WHERE id=? AND changes()>0',uid),...revoke(db,uid)]);if(!result[0].meta.changes)throw fail('Account security changed. Sign in again.',401);
  await notify(db,uid,'Two-factor authentication was turned off.','/social/profile');return {...await session(db,{id:uid,auth_version:row.auth_version+1}),ok:true};
 }
 if(path==='/security/backup-codes'){
  if(!security.totp_secret)throw fail('Enable two-factor authentication first.');const backup=await backupCodes();const result=await run(db,'UPDATE account_security SET backup_hashes=? WHERE user_id=? AND totp_secret=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=?)',backup.hashes,uid,security.totp_secret,uid,row.auth_version);if(!result.meta.changes)throw fail('Account security changed. Sign in again.',401);return {codes:backup.codes};
 }
 if(path==='/security/email'){
  if(!mailConfigured(env))throw fail('Email recovery is not configured yet.',503);
  const email=emailAddress(b.email);await rate(db,'verify-email:'+uid,3,1800);await emailToken(env,row,email,'verify');return {ok:true};
 }
 const recovery=secret(),salt=secret();
 const statement=path==='/security/password'?query(db,'UPDATE users SET password_hash=?,salt=?,recovery_hash=?,auth_version=auth_version+1 WHERE id=? AND auth_version=?',password(b.password,salt),salt,await hash(recovery),uid,row.auth_version):query(db,'UPDATE users SET recovery_hash=?,auth_version=auth_version+1 WHERE id=? AND auth_version=?',await hash(recovery),uid,row.auth_version);
 const result=await db.batch([statement,...revoke(db,uid)]);if(!result[0].meta.changes)throw fail('Account changed. Sign in again.',401);
 await notify(db,uid,path==='/security/password'?'Your password was changed.':'Your recovery key was replaced.','/social/profile');return {...await session(db,{id:uid,auth_version:row.auth_version+1}),recovery};
}
