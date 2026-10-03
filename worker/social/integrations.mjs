import {one,run,body,str,fail,rate} from './core.mjs';
import {requireUser} from './auth.mjs';

const cache=new Map();
let twitchToken;
const enabled=env=>({igdb:!!(env.IGDB_CLIENT_ID&&env.IGDB_CLIENT_SECRET),lastfm:!!env.LASTFM_API_KEY,unsplash:!!env.UNSPLASH_ACCESS_KEY});
async function cached(key,seconds,load){const old=cache.get(key);if(old?.expires>Date.now())return old.data;const data=await load();if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{expires:Date.now()+seconds*1000,data});return data;}
async function json(url,options={}){try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(8000),redirect:'error'});if(!r.ok)throw Error();const d=await r.json();if(d.error)throw Error();return d;}catch{throw fail('This provider is unavailable. Please try again later.',502);}}
const safeURL=(value,host)=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===host&&!u.username&&!u.password?u.href:'';}catch{return '';}};
async function games(env,query){if(!enabled(env).igdb)throw fail('Game search is not connected yet.',503);return cached('games:'+query,3600,async()=>{
 if(!twitchToken||twitchToken.expires<Date.now()||twitchToken.client!==env.IGDB_CLIENT_ID){const d=await json('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:env.IGDB_CLIENT_ID,client_secret:env.IGDB_CLIENT_SECRET,grant_type:'client_credentials'})});twitchToken={value:d.access_token,expires:Date.now()+Math.max(0,d.expires_in-60)*1000,client:env.IGDB_CLIENT_ID};}
 const d=await json('https://api.igdb.com/v4/games',{method:'POST',headers:{'Client-ID':env.IGDB_CLIENT_ID,Authorization:'Bearer '+twitchToken.value,'Content-Type':'text/plain'},body:query});
 return d.map(g=>({id:g.id,name:String(g.name).slice(0,150),cover:/^[A-Za-z0-9_]+$/.test(g.cover?.image_id||'')?'https://images.igdb.com/igdb/image/upload/t_cover_big/'+g.cover.image_id+'.jpg':'',url:safeURL(g.url,'www.igdb.com')}));
 });}
async function photo(env,id){return cached('photo:'+id,3600,async()=>{const d=await json('https://api.unsplash.com/photos/'+encodeURIComponent(id),{headers:{Authorization:'Client-ID '+env.UNSPLASH_ACCESS_KEY}});return normalizePhoto(d);});}
function normalizePhoto(p){return {id:p.id,url:safeURL(p.urls?.regular,'images.unsplash.com'),thumb:safeURL(p.urls?.small,'images.unsplash.com'),name:String(p.user?.name||'Photographer').slice(0,120),profile:safeURL(p.user?.links?.html,'unsplash.com'),download:safeURL(p.links?.download_location,'api.unsplash.com'),alt:String(p.alt_description||'Profile banner').slice(0,200)};}
const defaults=()=>({lastfm:'',clock:false,games:[],shots:[],timezone:'America/New_York'});
export async function profileExtras(db,uid){const r=await one(db,'SELECT * FROM profile_extras WHERE user_id=?',uid);return r?{lastfm:r.lastfm,clock:!!r.clock,games:JSON.parse(r.games),shots:JSON.parse(r.shots),timezone:r.timezone}:defaults();}
export async function integrationsRoute(request,env,path,user){
 const u=new URL(request.url),db=env.SOCIAL_DB,method=request.method;
 if(path==='/integrations'&&method==='GET')return enabled(env);
 if(path==='/profile/extras'){
  requireUser(user,method!=='GET');
  if(method==='GET')return profileExtras(db,user.id);
  if(method!=='PUT')return;
  const b=await body(request),lastfm=str(b.lastfm,'Last.fm username',32);if(lastfm&&!/^[A-Za-z0-9_-]{1,32}$/.test(lastfm))throw fail('Enter a Last.fm username, not a URL.');
  if(typeof b.clock!=='boolean'||!Array.isArray(b.games)||b.games.length>8||b.games.some(id=>!Number.isSafeInteger(id)||id<1))throw fail('Choose up to eight games.');
  const previous=await profileExtras(db,user.id),ids=[...new Set(b.games)];let selected;
  if(ids.every(id=>previous.games.some(g=>g.id===id)))selected=ids.map(id=>previous.games.find(g=>g.id===id));
  else {await rate(db,'igdb:'+user.id,20,60);selected=await games(env,`fields name,cover.image_id,url; where id = (${ids.join(',')}); limit 8;`);if(selected.length!==ids.length)throw fail('Choose games from the search results.');}
  const timezone=str(b.timezone,'timezone',80,true);try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw fail('Choose a valid timezone.');}
  if(!Array.isArray(b.shots)||b.shots.length>6)throw fail('Choose up to six favorite shots.');
  const shots=[];
  for(const item of b.shots){
   const key=str(item?.id,'image',80,true),source=item?.source;
   if(source==='upload'){
    if(!/^[a-f0-9-]{36}$/.test(key)||!await one(db,"SELECT 1 FROM media WHERE id=? AND user_id=? AND kind='image'",key,user.id))throw fail('Upload your own screenshot first.');
    shots.push({id:key,source,url:'/api/social/media/'+key,alt:'Favorite screenshot'});continue;
   }
   if(source!=='unsplash'||!/^[A-Za-z0-9_-]+$/.test(key))throw fail('Choose an image from the search results.');
   let shot=previous.shots.find(s=>s.source==='unsplash'&&s.id===key);
   if(!shot){if(!enabled(env).unsplash)throw fail('Image search is not connected yet.',503);await rate(db,'unsplash:'+user.id,20,60);shot=await photo(env,key);if(!shot.url||!shot.download||!shot.profile)throw fail('Choose another image.');await json(shot.download,{headers:{Authorization:'Client-ID '+env.UNSPLASH_ACCESS_KEY}});shot={...shot,source:'unsplash'};delete shot.download;}
   if(!shots.some(s=>s.source===source&&s.id===key))shots.push(shot);
  }
  await run(db,'INSERT INTO profile_extras(user_id,lastfm,clock,games,shots,timezone) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lastfm=excluded.lastfm,clock=excluded.clock,games=excluded.games,shots=excluded.shots,timezone=excluded.timezone',user.id,lastfm,b.clock?1:0,JSON.stringify(selected),JSON.stringify(shots),timezone);return {ok:true};
 }
 if(path==='/integrations/games'&&method==='GET'){requireUser(user);await rate(db,'igdb:'+user.id,20,60);const q=str(u.searchParams.get('q'),'search',60,true);if(q.length<2)return {items:[]};return {items:await games(env,`search ${JSON.stringify(q)}; fields name,cover.image_id,url; limit 8;`)};}
 if(path==='/integrations/photos'&&method==='GET'){requireUser(user);if(!enabled(env).unsplash)throw fail('Photo search is not connected yet.',503);await rate(db,'unsplash:'+user.id,15,60);const q=str(u.searchParams.get('q'),'search',60,true);return cached('photos:'+q,600,async()=>{const d=await json('https://api.unsplash.com/search/photos?'+new URLSearchParams({query:q,per_page:'8',orientation:'landscape',content_filter:'high'}),{headers:{Authorization:'Client-ID '+env.UNSPLASH_ACCESS_KEY}});return {items:d.results.map(normalizePhoto).map(({download,...p})=>p)};});}
 if(path.startsWith('/profile/extras/')&&method==='GET'){
  const handle=decodeURIComponent(path.slice('/profile/extras/'.length));const p=await one(db,"SELECT id FROM users WHERE handle=? AND status NOT IN ('banned','suspended')",handle);if(!p)throw fail('Player not found.',404);
  const data=await profileExtras(db,p.id);return data;
 }
 if(path.startsWith('/integrations/music/')&&method==='GET'){
  if(!enabled(env).lastfm)throw fail('Music is not connected yet.',503);
  await rate(db,'music-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),60,60);
  const p=await one(db,"SELECT e.lastfm FROM profile_extras e JOIN users u ON u.id=e.user_id WHERE u.handle=? AND u.status NOT IN ('banned','suspended')",decodeURIComponent(path.slice('/integrations/music/'.length)));if(!p?.lastfm)return {tracks:[]};
  return cached('music:'+p.lastfm,60,async()=>{const d=await json('https://ws.audioscrobbler.com/2.0/?'+new URLSearchParams({method:'user.getRecentTracks',user:p.lastfm,api_key:env.LASTFM_API_KEY,format:'json',limit:'3'}));const list=d.recenttracks?.track;return {tracks:(Array.isArray(list)?list:list?[list]:[]).map(t=>({name:String(t.name).slice(0,200),artist:String(t.artist?.['#text']||'').slice(0,200),url:safeURL(t.url,'www.last.fm'),playing:t['@attr']?.nowplaying==='true'}))};});
 }
}
