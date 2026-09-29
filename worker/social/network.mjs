import {one,rows,run,body,str,fail,now,notify,page} from './core.mjs';
import {requireUser} from './auth.mjs';
const fields='u.id,u.handle,p.display_name,p.bio,p.avatar,p.country,p.color,p.font,p.font_url,p.games,p.platform';
const presence="CASE WHEN cp.seen_at>? AND p.presence<>'offline' THEN p.presence ELSE 'offline' END presence";
const joins='FROM users u JOIN profiles p ON p.user_id=u.id LEFT JOIN chat_presence cp ON cp.user_id=u.id';
export const literal=value=>'%'+value.replace(/[\\%_]/g,'\\$&')+'%';
export async function networkRoute(request,env,path,user){
 const db=env.SOCIAL_DB,method=request.method,u=new URL(request.url),cutoff=Date.now()-90000,uid=user?.id||'';
 if(path==='/presence'){
  if(method==='POST'){requireUser(user);if(user.id!=='access-owner')await run(db,'INSERT INTO chat_presence VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=excluded.seen_at',uid,Date.now());}
  if(method==='GET'||method==='POST'){const items=await rows(db,`SELECT ${fields},p.presence ${joins} WHERE cp.seen_at>? AND p.presence<>'offline' AND u.status IN ('active','muted') ORDER BY lower(u.handle)='rainsoranked' DESC,u.handle LIMIT 100`,cutoff);const count=await one(db,`SELECT count(*) n ${joins} WHERE cp.seen_at>? AND p.presence<>'offline' AND u.status IN ('active','muted')`,cutoff);return {items,count:count.n};}
 }
 if(path==='/players'&&method==='GET'){
  const q=literal(str(u.searchParams.get('q'),'search',80).replace(/^@/,'')),game=literal(str(u.searchParams.get('game'),'game',80)),platform=literal(str(u.searchParams.get('platform'),'platform',60)),country=str(u.searchParams.get('country'),'country',2);
  return {items:await rows(db,`SELECT ${fields},${presence},f.status friendship,f.sender_id friend_sender ${joins} LEFT JOIN friends f ON (f.sender_id=? AND f.recipient_id=u.id) OR (f.recipient_id=? AND f.sender_id=u.id) WHERE u.status NOT IN ('banned','suspended') AND u.id<>'access-owner' AND (u.handle LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\') AND p.games LIKE ? ESCAPE '\\' AND p.platform LIKE ? ESCAPE '\\' AND (?='' OR p.country=?) ORDER BY lower(u.handle)='rainsoranked' DESC,cp.seen_at DESC,u.handle LIMIT 30 OFFSET ?`,cutoff,uid,uid,q,q,game,platform,country,country,page(u))};
 }
 if(path==='/chat'&&method==='GET'){
  const after=Math.max(0,Number(u.searchParams.get('after'))||0),filter="m.channel='global' AND m.removed=0 AND u.status NOT IN ('banned','suspended') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND target_id=m.user_id) OR(user_id=m.user_id AND target_id=?)) AND NOT EXISTS(SELECT 1 FROM mutes WHERE user_id=? AND target_id=m.user_id)",join='FROM messages m JOIN users u ON u.id=m.user_id JOIN profiles p ON p.user_id=u.id';
  const items=(await rows(db,`SELECT m.*,m.rowid cursor,u.handle,p.display_name,p.avatar,p.color,p.font,p.font_url,p.country ${join} WHERE ${filter} ORDER BY m.rowid DESC LIMIT 50`,uid,uid,uid)).reverse();
  const unread=await one(db,`SELECT count(*) n ${join} WHERE ${filter} AND m.rowid>?`,uid,uid,uid,after);
  return {items,cursor:items.at(-1)?.cursor||after,unread:unread.n};
 }
 if(path==='/conversations'&&method==='GET'){
  requireUser(user);return {items:await rows(db,`SELECT m.content,m.created_at,u.handle,p.display_name,p.avatar,p.color,p.font,p.font_url,p.country FROM messages m JOIN users u ON u.id=CASE WHEN m.user_id=? THEN m.recipient_id ELSE m.user_id END JOIN profiles p ON p.user_id=u.id WHERE m.recipient_id IS NOT NULL AND (m.user_id=? OR m.recipient_id=?) AND m.removed=0 AND u.status NOT IN ('banned','suspended') AND NOT EXISTS(SELECT 1 FROM messages newer WHERE newer.channel=m.channel AND newer.removed=0 AND newer.rowid>m.rowid) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (user_id=? AND target_id=u.id) OR(user_id=u.id AND target_id=?)) ORDER BY m.rowid DESC LIMIT 50`,uid,uid,uid,uid,uid)};
 }
 if(path==='/my-crews'&&method==='GET'){requireUser(user);return {items:await rows(db,"SELECT g.id,g.name FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=? AND gm.status='accepted' AND gm.role IN ('owner','moderator') ORDER BY g.name",uid)};}
 if(path==='/friends'){
  requireUser(user,method==='POST');
  if(method==='GET')return {items:await rows(db,`SELECT ${fields},f.status friendship,f.sender_id friend_sender ${joins} JOIN friends f ON u.id=CASE WHEN f.sender_id=? THEN f.recipient_id ELSE f.sender_id END WHERE f.sender_id=? OR f.recipient_id=? ORDER BY f.created_at DESC LIMIT 100`,uid,uid,uid)};
  if(method==='POST'){
   const b=await body(request),target=await one(db,"SELECT id FROM users WHERE handle=? AND status NOT IN ('banned','suspended')",str(b.handle,'handle',24,true));if(!target||target.id===uid)throw fail('Choose another player.');
   if(await one(db,'SELECT 1 FROM blocks WHERE(user_id=? AND target_id=?) OR(user_id=? AND target_id=?)',uid,target.id,target.id,uid))throw fail('This player is unavailable.',403);
   const key=[uid,target.id].sort().join(':'),f=await one(db,'SELECT * FROM friends WHERE pair_key=?',key);
   if(b.action==='request'){if(f)return {status:f.status};await run(db,"INSERT INTO friends VALUES(?,?,?,'pending',?)",key,uid,target.id,now());await notify(db,target.id,`@${user.handle} sent you a friend request`,'/social/players');}
   else if(b.action==='accept'){if(!f||f.recipient_id!==uid||f.status!=='pending')throw fail('Only the recipient can accept a pending request.',403);await run(db,"UPDATE friends SET status='accepted' WHERE pair_key=?",key);await notify(db,f.sender_id,`@${user.handle} accepted your friend request`,'/social/players');}
   else if(['decline','cancel','remove'].includes(b.action)){if(!f)throw fail('Request not found.',404);if(b.action==='decline'&&f.recipient_id!==uid||b.action==='cancel'&&f.sender_id!==uid)throw fail('This request cannot be changed.',403);await run(db,'DELETE FROM friends WHERE pair_key=?',key);}
   else throw fail('Choose a friend action.');return {ok:true};
  }
 }
 return undefined;
}
