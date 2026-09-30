import {api,state,modal,$,field,submit,close,toast} from './core.js?v=20260930-v2';
export async function providerButtons(root,link=false){
 try{const {providers}=await api('/oauth/providers');if(!root?.isConnected)return;const available=providers.filter(p=>['Google','Discord'].includes(p));if(!available.length)return;
 root.innerHTML=available.map(provider=>`<button type="button" data-provider="${provider}" class="button outline provider-button">${link?'Link '+provider+' to this account':'Sign in with '+provider}</button>`).join('')+`<p class="muted">${link?'Keep your current profile and add another way to sign in.':'New here? Choose your XBT handle after your identity is verified.'}</p>`;
 root.querySelectorAll('button').forEach(button=>button.onclick=()=>start(link,button.dataset.provider));
 }catch{/* Password sign-in remains available if provider discovery fails. */}
}
async function start(link,provider){
 const popup=window.open('about:blank','xbt-provider','popup,width=500,height=720');if(!popup){toast('Allow a popup to sign in with your provider.');return;}
 let timer;
 try{
  const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const challenge=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),b=>b.toString(16).padStart(2,'0')).join('');
  const flow=await api('/oauth/begin',{method:'POST',body:{challenge,link,provider:provider.toLowerCase()}});popup.location.href=flow.url;
  const deadline=Date.now()+600000;
  const finish=data=>{state.token=data.token;state.user=data.user;try{sessionStorage.setItem('xbt-social-session',data.token);}catch{}popup.close();close();window.dispatchEvent(new Event('xbt-session'));toast(data.linked?provider+' linked to your profile.':'Signed in.');};
  async function check(){
   if(Date.now()>deadline){popup.close();toast('Sign-in timed out. Try again.');return;}
   try{const data=await api('/oauth/complete',{method:'POST',body:{state:flow.state,verifier}});
    if(data.pending){if(popup.closed)return;timer=setTimeout(check,3000);return;}
    if(data.needsHandle){popup.close();modal(`<h2>Choose your XBT handle</h2><p>Your provider verified your identity. Your handle is how players find you.</p><form id="provider-handle">${field('handle','Handle','','text','required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" autocomplete="username"')}<button type="submit" class="button">CREATE PROFILE</button></form>`);submit($('#provider-handle'),async b=>finish(await api('/oauth/complete',{method:'POST',body:{...b,state:flow.state,verifier}})));return;}
    finish(data);
   }catch(e){popup.close();toast(e.message);}
  }
  timer=setTimeout(check,3000);
 }catch(e){clearTimeout(timer);popup.close();toast(e.message);}
}
