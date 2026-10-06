// Read only: project published tournaments into the same public calendar schema.
export async function publicSchedule(env){
 const {results}=await env.CALENDAR_DB.prepare("SELECT * FROM calendar_events WHERE visibility = 'public' ORDER BY start").all();
 const events=results.map(row=>({...JSON.parse(row.data),id:row.id,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at}));
 if(env.SOCIAL_DB){
  const {results:tournaments}=await env.SOCIAL_DB.prepare("SELECT id,slug,title,game,format,status,data,revision,created_at,updated_at FROM tournaments WHERE status <> 'Draft'").all();
  for(const row of tournaments){const t=JSON.parse(row.data),start=Date.parse(t.start);if(!Number.isFinite(start))continue;
   const link='https://xbtesports.nyc/social/tournaments/'+encodeURIComponent(row.slug);
   events.push({id:'social-'+row.id,title:row.title,description:(t.description||'')+(!t.end?'\nCalendar end time is estimated (two hours after start).':''),start:new Date(start).toISOString(),end:t.end||new Date(start+7200000).toISOString(),timezone:t.timezone||'America/New_York',category:'Tournament',status:row.status,visibility:'public',game:row.game,format:row.format,prize:'',registrationUrl:row.status==='Registration Open'?link:'',tournamentUrl:link,streamUrl:t.stream||'',featured:row.status==='Live',revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at});
  }
 }
 return events.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}
