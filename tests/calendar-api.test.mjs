import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{validateEvent} from '../worker/calendar-api.mjs';
import {instantChoices,toInstant,localValue} from '../calendar-admin/date-time.mjs';

const base={title:'Championship',description:'Final match',start:'2026-09-20T00:00:00Z',end:'2026-09-20T03:00:00Z',timezone:'America/New_York',category:'Tournament',status:'Scheduled',visibility:'private'};
const origin='https://calendar.example';
const team='https://xbt-test.cloudflareaccess.com';
const owner='smithrock87@gmail.com';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'calendar-test',alg:'RS256'};
const b64=value=>Buffer.from(value).toString('base64url');
async function token(overrides={}){
  const now=Math.floor(Date.now()/1000);
  const payload={iss:team,aud:['calendar-aud'],email:owner,iat:now,exp:now+600,...overrides};
  const input=`${b64(JSON.stringify({alg:'RS256',kid:jwk.kid}))}.${b64(JSON.stringify(payload))}`;
  return `${input}.${b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input)))}`;
}
function database(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../worker/calendar-migrations/0001_events.sql',import.meta.url),'utf8'));
  // D1 adapter backed by real SQLite, exercising SQL rather than mocking records.
  return {close:()=>sqlite.close(),prepare(sql){let args=[];const statement=sqlite.prepare(sql);return {bind(...values){args=values;return this;},async all(){return {results:statement.all(...args)};},async first(){return statement.get(...args)||null;},async run(){return {meta:{changes:statement.run(...args).changes}};}};}};
}
const db=database();const env={ADMIN_EMAIL:owner,ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:'calendar-aud',CALENDAR_DB:db};
const realFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(String(url),`${team}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});};
const valid=await token();
function request(path,method='GET',data,auth=valid,extra={}){
  return new Request(origin+path,{method,headers:{'Origin':origin,'Content-Type':'application/json',...(auth?{'Cf-Access-Jwt-Assertion':auth}:{}),...extra},...(data===undefined?{}:{body:JSON.stringify(data)})});
}
let record;
await test('calendar owner and persistence integration',async t=>{
  await t.test('anonymous readers see no drafts and require no login',async()=>{const response=await worker.fetch(request('/api/events','GET',undefined,null),env);assert.equal(response.status,200);assert.deepEqual((await response.json()).events,[]);assert.equal(response.headers.get('access-control-allow-origin'),'*');});
  await t.test('missing Access configuration fails closed',async()=>{assert.equal((await worker.fetch(request('/api/admin/events','POST',base),{...env,ACCESS_AUD:''})).status,503);});
  await t.test('anonymous, forged email header, and malformed token cannot write',async()=>{for(const auth of [null,'invalid.token.value'])assert.equal((await worker.fetch(request('/api/admin/events','POST',base,auth,{'Cf-Access-Authenticated-User-Email':owner}),env)).status,401);});
  await t.test('wrong email, audience, issuer, expired and future tokens rejected',async()=>{for(const claims of [{email:'other@example.com'},{aud:['other']},{iss:'https://attacker.example'},{exp:0},{iat:Date.now()/1000+3600}])assert.equal((await worker.fetch(request('/api/admin/events','GET',undefined,await token(claims)),env)).status,401);});
  await t.test('tampered signed token rejected',async()=>{const [head,payload,sig]=valid.split('.');const altered=b64(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url')),email:owner.toUpperCase()}));assert.equal((await worker.fetch(request('/api/admin/events','GET',undefined,`${head}.${altered}.${sig}`),env)).status,401);});
  await t.test('signed HttpOnly Access cookies work but forged cookies fail',async()=>{assert.equal((await worker.fetch(request('/api/admin/session','GET',undefined,null,{Cookie:`CF_Authorization=${valid}`}),env)).status,200);assert.equal((await worker.fetch(request('/api/admin/session','GET',undefined,null,{Cookie:'CF_Authorization=forged'}),env)).status,401);});
  await t.test('cross-origin mutations rejected',async()=>{assert.equal((await worker.fetch(request('/api/admin/events','POST',base,valid,{Origin:'https://attacker.example'}),env)).status,403);});
  await t.test('owner creates a persistent private draft',async()=>{const response=await worker.fetch(request('/api/admin/events','POST',base),env);assert.equal(response.status,201);record=await response.json();assert.equal(record.revision,1);assert.equal((await (await worker.fetch(request('/api/admin/events'),env)).json()).events.length,1);assert.equal((await (await worker.fetch(request('/api/events'),env)).json()).events.length,0);});
  await t.test('publishing makes the stored event readable without login',async()=>{const response=await worker.fetch(request(`/api/admin/events/${record.id}`,'PUT',{...base,visibility:'public'},valid,{'If-Match':'1'}),env);assert.equal(response.status,200);record=await response.json();assert.equal(record.revision,2);const publicEvents=(await (await worker.fetch(request('/api/events','GET',undefined,null),env)).json()).events;assert.equal(publicEvents[0].title,base.title);});
  await t.test('stale edits and missing versions cannot overwrite a newer save',async()=>{for(const [revision,status] of [['1',409],['',428]])assert.equal((await worker.fetch(request(`/api/admin/events/${record.id}`,'PUT',base,valid,{'If-Match':revision}),env)).status,status);});
  await t.test('unpublishing removes event from public responses',async()=>{assert.equal((await worker.fetch(request(`/api/admin/events/${record.id}`,'PUT',base,valid,{'If-Match':'2'}),env)).status,200);assert.equal((await (await worker.fetch(request('/api/events'),env)).json()).events.length,0);});
  await t.test('delete enforces revisions and removes the stored event',async()=>{assert.equal((await worker.fetch(request(`/api/admin/events/${record.id}`,'DELETE',undefined,valid,{'If-Match':'2'}),env)).status,409);assert.equal((await worker.fetch(request(`/api/admin/events/${record.id}`,'DELETE',undefined,valid,{'If-Match':'3'}),env)).status,200);assert.equal((await (await worker.fetch(request('/api/admin/events'),env)).json()).events.length,0);});
});
await test('event input validation',()=>{
  for(const changes of [{start:'2026-02-30T19:00:00Z'},{title:''},{title:'x'.repeat(151)},{end:base.start},{timezone:'invalid/zone'},{start:'2026-09-20T00:00'},{visibility:'secret'},{registrationUrl:'javascript:alert(1)'},{tournamentUrl:'http://example.com'},{streamUrl:'https://user:password@example.com'}])assert.throws(()=>validateEvent({...base,...changes}));
  assert.equal(validateEvent({...base,registrationUrl:'https://example.com/join'}).registrationUrl,'https://example.com/join');
});
await test('DST and international editor input',()=>{
  assert.equal(toInstant('2026-09-19T20:00','America/New_York'),'2026-09-20T00:00:00.000Z');
  assert.equal(toInstant('2026-01-19T20:00','America/New_York'),'2026-01-20T01:00:00.000Z');
  assert.equal(instantChoices('2026-03-08T02:30','America/New_York').length,0);
  assert.throws(()=>toInstant('2026-03-08T02:30','America/New_York'));
  assert.equal(instantChoices('2026-11-01T01:30','America/New_York').length,2);
  assert.equal(toInstant('2026-11-01T01:30','America/New_York','first'),'2026-11-01T05:30:00.000Z');
  assert.equal(toInstant('2026-11-01T01:30','America/New_York','second'),'2026-11-01T06:30:00.000Z');
  assert.equal(localValue(base.start,'Asia/Tokyo'),'2026-09-20T09:00');
});
globalThis.fetch=realFetch;db.close();
