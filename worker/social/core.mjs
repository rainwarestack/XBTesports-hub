export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const now=()=>new Date().toISOString();
export const id=()=>crypto.randomUUID();
export const query=(db,sql,...args)=>db.prepare(sql).bind(...args);
export const one=(db,sql,...args)=>query(db,sql,...args).first();
export const rows=async(db,sql,...args)=>(await query(db,sql,...args).all()).results;
export const run=(db,sql,...args)=>query(db,sql,...args).run();
export function str(value,name,max=1000,required=false){if(value==null)value='';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw fail(`Check ${name}.`);return value.trim();}
export function num(value,name,min=0,max=100000){const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw fail(`Check ${name}.`);return n;}
export function choice(value,choices,name){if(!choices.includes(value))throw fail(`Choose a valid ${name}.`);return value;}
export async function read(request,limit=65536){const r=request.body?.getReader();if(!r)throw fail('Missing request.');let size=0;const parts=[];while(true){const x=await r.read();if(x.done)break;size+=x.value.length;if(size>limit){await r.cancel();throw fail('Upload is too large.',413);}parts.push(x.value);}const data=new Uint8Array(size);let o=0;for(const p of parts){data.set(p,o);o+=p.length;}return data;}
export async function body(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('JSON required.',415);try{return JSON.parse(new TextDecoder().decode(await read(request)));}catch(e){if(e.status)throw e;throw fail('Invalid JSON.');}}
export const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export function url(value){const s=str(value,'link',2048);if(!s)return '';try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password)throw Error();return u.href;}catch{throw fail('Links must start with https://.');}}
export async function rate(db,key,max=30,seconds=60){const t=Math.floor(Date.now()/1000);const result=await one(db,'INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count',key,t+seconds,t,t);if(result.count>max)throw fail('Please wait before trying again.',429);}
export async function notify(db,user,text,link){if(user)await run(db,'INSERT INTO notifications VALUES(?,?,?,?,0,?)',id(),user,text,link,now());}
export async function notifyMany(db,recipients,text,link){const data=[...new Set(recipients.filter(Boolean))].map(user=>({id:id(),user,text,link,created:now()}));if(data.length)await run(db,"INSERT INTO notifications SELECT json_extract(value,'$.id'),json_extract(value,'$.user'),json_extract(value,'$.text'),json_extract(value,'$.link'),0,json_extract(value,'$.created') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM users WHERE id=json_extract(value,'$.user'))",JSON.stringify(data));}
export function page(url){return Math.min(Math.max(Number(url.searchParams.get('page'))||0,0),10000)*30;}
export function publicProfile(row){if(!row)return null;const {password_hash,salt,recovery_hash,auth_version,...safe}=row;return safe;}
