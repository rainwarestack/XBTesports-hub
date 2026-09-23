import {actor,authRoute} from './auth.mjs';
import {tournamentRoute} from './tournaments.mjs';
import {communityRoute} from './community.mjs';
import {mediaRoute} from './media.mjs';
import {fail,rate,hash} from './core.mjs';
export async function socialAPI(request,env,admin=null){const u=new URL(request.url),origin=request.headers.get('Origin'),allowed=new Set((env.ALLOWED_ORIGINS||'https://xbtesports.nyc,https://www.xbtesports.nyc').split(','));allowed.add(u.origin);const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};if(origin&&allowed.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Content-Type, Authorization';headers['Access-Control-Allow-Methods']='GET, POST, PUT, DELETE, OPTIONS';}
 try{if(origin&&!allowed.has(origin))throw fail('This origin is not allowed.',403);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(!env.SOCIAL_DB)throw fail('Community storage is not connected.',503);const path=u.pathname.slice('/api/social'.length)||'/';if(path==='/health')return Response.json({ready:true,uploads:!!env.MEDIA},{headers});const user=admin||await actor(request,env.SOCIAL_DB);if(!['GET','HEAD'].includes(request.method))await rate(env.SOCIAL_DB,'write:'+(user?.id||await hash(request.headers.get('CF-Connecting-IP')||'local')),40,60);
 for(const route of [authRoute,tournamentRoute,communityRoute,mediaRoute]){const data=await route(request,env,path,user);if(data!==undefined){if(data instanceof Response){for(const [k,v] of Object.entries(headers))if(k!=='Content-Type')data.headers.set(k,v);return data;}return Response.json(data,{headers});}}
 throw fail('Not found.',404);
 }catch(e){if(!e.status)console.error('Social API error',e.message);return Response.json({error:e.status?e.message:'The service is unavailable. Please try again.'},{status:e.status||503,headers});}}
