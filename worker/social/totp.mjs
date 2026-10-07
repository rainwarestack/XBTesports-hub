import {createHmac,timingSafeEqual} from 'node:crypto';
import {fail} from './core.mjs';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decode(value){let bits=0,buffer=0;const out=[];for(const c of value){const v=alphabet.indexOf(c);if(v<0)throw Error('Invalid base32');buffer=(buffer<<5)|v;bits+=5;if(bits>=8){out.push((buffer>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,step,digits=6){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const digest=createHmac('sha1',decode(secret)).update(counter).digest(),offset=digest[19]&15;return ((digest.readUInt32BE(offset)&0x7fffffff)%10**digits).toString().padStart(digits,'0');}
export function matchingStep(secret,code,last=-1,time=Date.now()){if(!/^\d{6}$/.test(code))return null;const step=Math.floor(time/30000);for(const candidate of [step,step-1,step+1])if(candidate>last&&timingSafeEqual(Buffer.from(totp(secret,candidate)),Buffer.from(code)))return candidate;return null;}
export const totpConfigured=env=>/^[a-f0-9]{64}$/i.test(env.ACCOUNT_SECURITY_KEY||'');
async function key(env){if(!totpConfigured(env))throw fail('Two-factor setup is not available yet.',503);return crypto.subtle.importKey('raw',Buffer.from(env.ACCOUNT_SECURITY_KEY,'hex'),'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(env,userId,value){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(userId)},await key(env),new TextEncoder().encode(value));return Buffer.from(iv).toString('base64url')+'.'+Buffer.from(encrypted).toString('base64url');}
export async function unseal(env,userId,value){const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(iv,'base64url'),additionalData:new TextEncoder().encode(userId)},await key(env),Buffer.from(data,'base64url')));}
