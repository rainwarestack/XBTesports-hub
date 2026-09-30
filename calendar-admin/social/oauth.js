import {api,state,modal,$,field,submit,close,toast} from './core.js?v=20260930-terminal2';
export async function providerButtons(root,link=false){
 try{const {providers}=await api('/oauth/providers');if(!root?.isConnected||!providers.includes('Discord'))return;
 root.innerHTML=`<button type="button" class="button outline provider-button">${link?'Link Discord to this account':'Sign in with Discord'}</button><p class="muted">${link?'Keep your current profile and add another way to sign in.':'New here? Choose your XBT handle after Discord verifies your identity.'}</p>`;
 root.querySelector('button').onclick=()=>start(link);
 }catch{/* Password sign-in remains available if provider discovery fails. */}
}
async function start(link){
 const popup=window.open('about:blank','xbt-discord','popup,width=500,height=720');if(!popup){toast('Allow a popup to sign in with Discord.');return;}
 let timer;
 try{
  const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const challenge=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),b=>b.toString(16).padStart(2,'0')).join('');
  const flow=await api('/oauth/begin',{method:'POST',body:{challenge,link}});popup.location.href=flow.url;
  const deadline=Date.now()+600000;
  const finish=data=>{state.token=data.token;state.user=data.user;try{sessionStorage.setItem('xbt-social-session',data.token);}catch{}popup.close();close();window.dispatchEvent(new Event('xbt-session'));toast(data.linked?'Discord linked to your profile.':'Signed in.');};
  async function check(){
   if(Date.now()>deadline){popup.close();toast('Sign-in timed out. Try again.');return;}
   try{const data=await api('/oauth/complete',{method:'POST',body:{state:flow.state,verifier}});
    if(data.pending){if(popup.closed)return;timer=setTimeout(check,3000);return;}
    if(data.needsHandle){popup.close();modal(`<h2>Choose your XBT handle</h2><p>Discord verified your identity. Your handle is how players find you.</p><form id="provider-handle">${field('handle','Handle','','text','required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" autocomplete="username"')}<button type="submit" class="button">CREATE PROFILE</button></form>`);submit($('#provider-handle'),async b=>finish(await api('/oauth/complete',{method:'POST',body:{...b,state:flow.state,verifier}})));return;}
    finish(data);
   }catch(e){popup.close();toast(e.message);}
  }
  timer=setTimeout(check,3000);
 }catch(e){clearTimeout(timer);popup.close();toast(e.message);}
}
