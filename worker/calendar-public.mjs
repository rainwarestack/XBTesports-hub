import {publicSchedule} from './public-schedule.mjs';
// This independently deployed service exposes public event reads only.
// It has no assets, authentication secrets, or mutation route.
export default {
  async fetch(request,env) {
    const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(new URL(request.url).pathname!=='/api/events')return new Response(JSON.stringify({error:'Not found.'}),{status:404,headers});
    if(request.method!=='GET')return new Response(JSON.stringify({error:'Read-only endpoint.'}),{status:405,headers:{...headers,Allow:'GET'}});
    try {
      const events=await publicSchedule(env);
      return new Response(JSON.stringify({events}),{headers});
    } catch { return new Response(JSON.stringify({error:'Schedule temporarily unavailable.'}),{status:503,headers}); }
  }
};
