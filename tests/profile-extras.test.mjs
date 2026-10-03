import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {integrationsRoute} from '../worker/social/integrations.mjs';
import {mediaRoute} from '../worker/social/media.mjs';

function database(){const sql=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../worker/social/migrations/',import.meta.url)).sort())sql.exec(readFileSync(new URL('../worker/social/migrations/'+f,import.meta.url),'utf8'));return {sql,prepare(text){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(text).get(...args)||null;},async run(){return sql.prepare(text).run(...args);}};}};}
test('profile extras validate ownership, providers, timezone and public visibility',async()=>{
 const db=database(),user={id:'owner',handle:'owner',status:'active'},other={id:'other',handle:'other',status:'active'},env={SOCIAL_DB:db};
 for(const u of [user,other])db.sql.prepare('INSERT INTO users(id,handle,password_hash,salt,recovery_hash,created_at) VALUES(?,?,?,?,?,?)').run(u.id,u.handle,'','','','2026-10-02');
 const call=(path,method='GET',value,actor=user)=>integrationsRoute(new Request('https://social.example/api/social'+path,{method,headers:{'Content-Type':'application/json'},...(value?{body:JSON.stringify(value)}:{})}),env,path.split('?')[0],actor);
 const value={lastfm:'listener',clock:true,timezone:'Asia/Tokyo',games:[],shots:[]};
 try{
  assert.deepEqual(await call('/integrations'),{igdb:false,lastfm:false,unsplash:false});
  await assert.rejects(()=>call('/profile/extras','PUT',value,null),e=>e.status===401);
  await call('/profile/extras','PUT',value);
  assert.equal((await call('/profile/extras/owner','GET',null,null)).timezone,'Asia/Tokyo');
  assert.equal((await call('/profile/extras','GET',null,other)).clock,false);
  await assert.rejects(()=>call('/profile/extras','PUT',{...value,timezone:'Made/Up'}),e=>e.status===400);
  await assert.rejects(()=>call('/profile/extras','PUT',{...value,games:['1); drop table users;']}),e=>e.status===400);
  await assert.rejects(()=>call('/profile/extras','PUT',{...value,lastfm:'https://example.com'}),e=>e.status===400);
  const image='11111111-1111-4111-8111-111111111111';
  await assert.rejects(()=>call('/profile/extras','PUT',{...value,shots:[{source:'upload',id:image}]}),e=>e.status===400);
  db.sql.prepare('INSERT INTO media(id,user_id,kind,mime,data,created_at) VALUES(?,?,?,?,?,?)').run(image,other.id,'image','image/png',new Uint8Array(0),'2026-10-02');
  await assert.rejects(()=>call('/profile/extras','PUT',{...value,shots:[{source:'upload',id:image}]}),e=>e.status===400);
  db.sql.prepare('UPDATE media SET user_id=? WHERE id=?').run(user.id,image);
  await call('/profile/extras','PUT',{...value,shots:[{source:'upload',id:image}]});
  assert.equal((await call('/profile/extras/owner')).shots[0].url,'/api/social/media/'+image);
  const mediaEnv={...env,MEDIA:{get:async()=>({body:new Uint8Array([137,80,78,71])})}};
  const imageRequest=new Request('https://social.example/api/social/media/'+image);
  assert.equal((await mediaRoute(imageRequest,mediaEnv,'/media/'+image,null)).status,200);
  await call('/profile/extras','PUT',{...value,lastfm:'',clock:false});assert.equal((await call('/profile/extras/owner')).shots.length,0);
  await assert.rejects(()=>mediaRoute(imageRequest,mediaEnv,'/media/'+image,null),e=>e.status===404);
  db.sql.prepare("UPDATE users SET status='banned' WHERE id=?").run(user.id);await assert.rejects(()=>call('/profile/extras/owner'),e=>e.status===404);
 }finally{db.sql.close();}
});
test('provider results are normalized, cached and stored without client-controlled URLs',async()=>{
 const db=database(),user={id:'person',handle:'person',status:'active'},env={SOCIAL_DB:db,IGDB_CLIENT_ID:'test-client',IGDB_CLIENT_SECRET:'test-secret',LASTFM_API_KEY:'test-key',UNSPLASH_ACCESS_KEY:'test-access'};
 db.sql.prepare('INSERT INTO users(id,handle,password_hash,salt,recovery_hash,created_at) VALUES(?,?,?,?,?,?)').run(user.id,user.handle,'','','','2026-10-02');
 const realFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([String(url),options]);const host=new URL(url).hostname;let d;
  if(host==='id.twitch.tv')d={access_token:'token',expires_in:3600};
  else if(host==='api.igdb.com')d=[{id:42,name:'Favorite game',cover:{image_id:'co123'},url:'https://www.igdb.com/games/favorite'}];
  else if(host==='ws.audioscrobbler.com')d={recenttracks:{track:[{name:'Track',artist:{'#text':'Artist'},url:'javascript:bad','@attr':{nowplaying:'true'}}]}};
  else if(String(url).includes('/download'))d={url:'https://images.unsplash.com/photo-test'};
  else d={id:'photo-one',urls:{regular:'https://images.unsplash.com/photo-one',small:'https://images.unsplash.com/photo-one?w=200'},user:{name:'Photographer',links:{html:'https://unsplash.com/@photographer'}},links:{download_location:'https://api.unsplash.com/photos/photo-one/download'}};
  return Response.json(d);
 };
 const call=(path,method='GET',value)=>integrationsRoute(new Request('https://social.example/api/social'+path,{method,headers:{'Content-Type':'application/json'},...(value?{body:JSON.stringify(value)}:{})}),env,path.split('?')[0],user);
 try{
  const value={lastfm:'listener2',clock:true,timezone:'America/New_York',games:[42],shots:[{id:'photo-one',source:'unsplash',url:'https://evil.example/image'}]};
  await call('/profile/extras','PUT',value);const stored=await call('/profile/extras/person');
  assert.equal(stored.games[0].cover,'https://images.igdb.com/igdb/image/upload/t_cover_big/co123.jpg');assert.equal(stored.shots[0].url,'https://images.unsplash.com/photo-one');assert.equal(stored.shots[0].download,undefined);
  assert.equal(calls.filter(([url])=>url.includes('/download')).length,1);
  await call('/profile/extras','PUT',value);assert.equal(calls.filter(([url])=>url.includes('/download')).length,1);
  const music=await call('/integrations/music/person');assert.equal(music.tracks[0].playing,true);assert.equal(music.tracks[0].url,'');await call('/integrations/music/person');assert.equal(calls.filter(([url])=>url.includes('audioscrobbler')).length,1);
  delete env.IGDB_CLIENT_SECRET;delete env.UNSPLASH_ACCESS_KEY;await call('/profile/extras','PUT',{...value,games:[],shots:[]});assert.equal((await call('/profile/extras/person')).games.length,0);
 }finally{globalThis.fetch=realFetch;db.sql.close();}
});
