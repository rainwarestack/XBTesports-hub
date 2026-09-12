// Calendar API: public reads, server-verified single-owner administration.
// No development login, shared public password, or client-side security bypass.
const encoder = new TextEncoder();
const keysCache = new Map();
const CATEGORIES = ['Tournament', 'Registration', 'Special Event'];
const STATUSES = ['Scheduled', 'Registration Open', 'Registration Closed', 'Closing Soon', 'Cancelled', 'Postponed', 'Completed'];
function json(body, status = 200, publicRead = false) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...(publicRead ? {'Access-Control-Allow-Origin': '*'} : {})
  }});
}
function failure(message, status) { return Object.assign(new Error(message), { status }); }
function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

// Validate signature, issuer, application audience, lifetime AND the owner email.
// Never trust Cf-Access-Authenticated-User-Email or an unsigned request header.
export async function requireOwner(request, env) {
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || '') || !env.ACCESS_AUD || !env.ADMIN_EMAIL) {
    throw failure('Administrator sign-in has not been connected yet.', 503);
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw failure('Sign in to manage the calendar.', 401);
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('token');
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
        claims.iss !== env.ACCESS_TEAM_DOMAIN || !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD) ||
        !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 30 ||
        (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30)) ||
        typeof claims.email !== 'string' || claims.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) throw new Error('claims');
    let cached = keysCache.get(env.ACCESS_TEAM_DOMAIN);
    if (!cached || cached.until < Date.now() || !cached.keys.some(key => key.kid === header.kid)) {
      const response = await fetch(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, {signal: AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error('certificates');
      const data = await response.json();
      if (!Array.isArray(data.keys)) throw new Error('keys');
      cached = { keys: data.keys, until: Date.now() + 300000 };
      keysCache.set(env.ACCESS_TEAM_DOMAIN, cached);
    }
    const jwk = cached.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) throw new Error('key');
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) throw new Error('signature');
    return claims.email;
  } catch { throw failure('Your sign-in is missing, expired, or not authorized for this calendar.', 401); }
}
function text(value, name, limit, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw failure(`Check ${name}.`, 400);
  return value.trim();
}
function timestamp(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw failure(`${name} must include a valid timezone offset.`, 400);
    const [year,month,day] = value.slice(0,10).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year,month,0)).getUTCDate();
  if(year<1000 || month<1 || month>12 || day<1 || day>daysInMonth || Number(value.slice(11,13))>23 || Number(value.slice(14,16))>59 || (value[16]===':' && Number(value.slice(17,19))>59))throw failure(`${name} is not a valid date and time.`,400);
  return new Date(value).toISOString();
}
function link(value, name) {
  const result = text(value, name, 2048);
  if (!result) return '';
  try { const url = new URL(result); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
  catch { throw failure(`${name} must be an HTTPS link.`, 400); }
  return result;
}
export function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('Invalid event.', 400);
  const start = timestamp(input.start, 'Start'), end = timestamp(input.end, 'End');
  if (end <= start) throw failure('End must be after start.', 400);
  const timezone = text(input.timezone, 'timezone', 100, true);
  try { new Intl.DateTimeFormat('en-US', {timeZone: timezone}).format(); } catch { throw failure('Choose a valid timezone.', 400); }
  if (!CATEGORIES.includes(input.category) || !STATUSES.includes(input.status) || !['public','private'].includes(input.visibility)) throw failure('Check category, status, and visibility.', 400);
  return {
    title:text(input.title,'title',150,true), description:text(input.description,'description',6000),
    start,end,timezone,category:input.category,status:input.status,visibility:input.visibility,
    game:text(input.game,'game',150),format:text(input.format,'format',150),prize:text(input.prize,'prize',250),
    registrationUrl:link(input.registrationUrl,'Registration URL'),tournamentUrl:link(input.tournamentUrl,'Tournament URL'),
    streamUrl:link(input.streamUrl,'Stream URL'),featured:input.featured === true
  };
}
function unpack(row) { return {...JSON.parse(row.data),id:row.id,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at}; }
async function body(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw failure('Use JSON for calendar changes.', 415);
  // Stream limit prevents an unbounded allocation even without Content-Length.
  const reader=request.body?.getReader();if(!reader)throw failure('Missing event.',400);
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>24000){await reader.cancel();throw failure('Event is too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw failure('Invalid JSON.',400);}
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const publicRead = url.pathname === '/api/events' && request.method === 'GET';
    try {
      if (publicRead) {
        if(!env.CALENDAR_DB)throw failure('Calendar storage is not connected.',503);
        const {results}=await env.CALENDAR_DB.prepare("SELECT * FROM calendar_events WHERE visibility = 'public' ORDER BY start").all();
        return json({events:results.map(unpack)},200,true);
      }
      // Only this non-sensitive readiness response is available before login.
      if(url.pathname === '/api/status' && request.method === 'GET') return json({configured:Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && env.CALENDAR_DB)});
      if(url.pathname.startsWith('/api/admin/')) {
        const email=await requireOwner(request,env);
        if(!env.CALENDAR_DB)throw failure('Calendar storage is not connected.',503);
        if(url.pathname === '/api/admin/session' && request.method === 'GET')return json({email});
        if(url.pathname === '/api/admin/events' && request.method === 'GET') {
          const {results}=await env.CALENDAR_DB.prepare('SELECT * FROM calendar_events ORDER BY start').all();
          return json({events:results.map(unpack)});
        }
        // Same-origin JSON requests only; no credentialed CORS or GET mutations.
        if(request.headers.get('Origin') !== url.origin)throw failure('Calendar changes must come from the editor.',403);
        if(url.pathname === '/api/admin/events' && request.method === 'POST') {
          const event=validateEvent(await body(request)),id=crypto.randomUUID(),now=new Date().toISOString();
          await env.CALENDAR_DB.prepare('INSERT INTO calendar_events (id,data,visibility,start,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id,JSON.stringify(event),event.visibility,event.start,now,now).run();
          return json({...event,id,revision:1,createdAt:now,updatedAt:now},201);
        }
        const match=url.pathname.match(/^\/api\/admin\/events\/([a-f0-9-]{36})$/);
        if(match && ['PUT','DELETE'].includes(request.method)) {
          const revision=Number(request.headers.get('If-Match'));
          if(!Number.isSafeInteger(revision)||revision<1)throw failure('Reload this event before saving.',428);
          if(request.method === 'DELETE') {
            const result=await env.CALENDAR_DB.prepare('DELETE FROM calendar_events WHERE id = ? AND revision = ?').bind(match[1],revision).run();
            if(!result.meta.changes)throw failure('This event changed or was deleted elsewhere. Reload the schedule.',409);
            return json({deleted:true});
          }
          const event=validateEvent(await body(request)),now=new Date().toISOString();
          const result=await env.CALENDAR_DB.prepare('UPDATE calendar_events SET data = ?, visibility = ?, start = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(event),event.visibility,event.start,now,match[1],revision).run();
          if(!result.meta.changes)throw failure('This event changed or was deleted elsewhere. Reload the schedule.',409);
          const saved=await env.CALENDAR_DB.prepare('SELECT * FROM calendar_events WHERE id = ?').bind(match[1]).first();
          return json(unpack(saved));
        }
        return json({error:'Not found.'},404);
      }
      if(url.pathname.startsWith('/api/'))return json({error:'Not found.'},404);
      // The editor shell contains no private data. Its API always verifies Access.
      // Protect the entire Worker host (except /api/events and /api/status) in Access.
      if(env.ASSETS && ['GET','HEAD'].includes(request.method)) {
        const response=await env.ASSETS.fetch(request);
        const secured=new Response(response.body,response);
        secured.headers.set('X-Content-Type-Options','nosniff');
        secured.headers.set('Referrer-Policy','same-origin');
        secured.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        return secured;
      }
      return json({error:'Not found.'},404);
    } catch(error) { return json({error:error.status ? error.message : 'Calendar service unavailable. Please retry.'},error.status || 503,publicRead); }
  }
};
