// This independently deployed service exposes public event reads only.
// It has no assets, authentication secrets, or mutation route.
export default {
  async fetch(request,env) {
    const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(new URL(request.url).pathname!=='/api/events')return new Response(JSON.stringify({error:'Not found.'}),{status:404,headers});
    if(request.method!=='GET')return new Response(JSON.stringify({error:'Read-only endpoint.'}),{status:405,headers:{...headers,Allow:'GET'}});
    try {
      const {results}=await env.CALENDAR_DB.prepare("SELECT * FROM calendar_events WHERE visibility = 'public' ORDER BY start").all();
      const events=results.map(row=>({...JSON.parse(row.data),id:row.id,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at}));
      return new Response(JSON.stringify({events}),{headers});
    } catch { return new Response(JSON.stringify({error:'Schedule temporarily unavailable.'}),{status:503,headers}); }
  }
};
