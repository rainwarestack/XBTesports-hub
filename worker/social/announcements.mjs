import {query,now} from './core.mjs';
export function announcementPhase(before,after){
 if(after==='Live'&&before!=='Live')return 'live';
 if((!before||before==='Draft')&&!['Draft','Cancelled','Completed'].includes(after))return 'published';
 return null;
}
// Run directly after the tournament mutation in the same D1 batch. A failed
// revision check inserts nothing. Deterministic IDs make retries idempotent.
export function announceTournament(db,t,phase){
 return query(db,"INSERT OR IGNORE INTO notifications(id,user_id,text,link,is_read,created_at) SELECT ? || id,id,?,?,0,? FROM users WHERE changes()>0 AND status='active' AND id<>'access-owner'",
  'tournament:'+t.id+':'+phase+':',`${t.title} ${phase==='live'?'is live.':'has been published.'}`,'/social/tournaments/'+t.slug,now());
}
