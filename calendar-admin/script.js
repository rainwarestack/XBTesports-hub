import {localValue,instantChoices,toInstant} from './date-time.mjs';
const $=id=>document.getElementById(id);
const form=$('event-form');
const field=name=>form.elements.namedItem(name);
let records=[],selected=null,authorized=false,dirty=false,busy=false,loginReady=false;
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function controls(){ form.querySelector("fieldset").disabled=busy; document.getElementById("new-event").disabled=busy; document.getElementById("discard").disabled=busy; $('save').disabled=!authorized||busy;$('delete').hidden=!selected;$('delete').disabled=!authorized||busy;$('refresh').disabled=busy; }
async function api(path,options={}) {
  const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
  if(response.redirected || !(response.headers.get('content-type')||'').includes('application/json'))throw new Error('Sign in again to connect the calendar.');
  const data=await response.json();
  if(!response.ok){if(response.status===401){authorized=false;controls();$('sign-in').hidden=!loginReady;}throw new Error(data.error||'Unable to connect.');}
  return data;
}
function timePreview() {
  try {
    const zone=field('timezone').value;
    for(const [dateName,occurrenceName] of [['localStart','startOccurrence'],['localEnd','endOccurrence']]) {
      const choices=instantChoices(field(dateName).value,zone);
      field(occurrenceName).hidden=choices.length<2;
      if(choices.length<2)field(occurrenceName).value='first';
    }
    const start=toInstant(field('localStart').value,zone,field('startOccurrence').value);
    const end=toInstant(field('localEnd').value,zone,field('endOccurrence').value);
    if(end<=start)throw new Error('End must be after start.');
    const format=new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
    $('time-preview').textContent=`${format.format(new Date(start))} → ${format.format(new Date(end))}`;
    return {start,end};
  }catch(error){$('time-preview').textContent=error.message;return null;}
}
function renderList() {
  const query=$('search').value.toLowerCase(),visibility=$('filter').value;
  const visible=records.filter(event=>(visibility==='all'||event.visibility===visibility)&&`${event.title} ${event.game}`.toLowerCase().includes(query));
  $('event-count').textContent=authorized ? records.length : '—';$('event-list').replaceChildren();
  for(const event of visible){const button=document.createElement('button');button.type='button';button.className='event-row';button.setAttribute('aria-pressed',String(selected?.id===event.id));const title=document.createElement('strong');title.textContent=event.title;const meta=document.createElement('small');meta.textContent=`${event.visibility==='public'?'PUBLISHED':'DRAFT'} · ${new Intl.DateTimeFormat('en-US',{timeZone:event.timezone,month:'short',day:'numeric',year:'numeric'}).format(new Date(event.start))}`;button.append(title,meta);button.onclick=()=>{if(!busy&&canLeave())openEvent(event);};$('event-list').append(button);}
  if(!visible.length){const text=document.createElement('p');text.className='empty';text.textContent=authorized ? records.length ? 'No events match your search.' : 'No saved events yet. Create your first tournament.' : 'Sign in to load your saved schedule.';$('event-list').append(text);}
}
function canLeave(){return !dirty||confirm('Discard your unsaved event changes?');}
function openEvent(event=null) {
  selected=event;form.reset();
  if(event){
    for(const [key,value] of Object.entries(event)){const input=field(key);if(input){if(input.type==='checkbox')input.checked=Boolean(value);else input.value=value??'';}}
    // Preserve valid IANA zones that were not in the original menu.
    if(!field('timezone').value){const option=new Option(event.timezone,event.timezone);field('timezone').add(option);field('timezone').value=event.timezone;}
    field('localStart').value=localValue(event.start,event.timezone);field('localEnd').value=localValue(event.end,event.timezone);
    for(const [local,instant,occurrence] of [['localStart',event.start,'startOccurrence'],['localEnd',event.end,'endOccurrence']]){
      const choices=instantChoices(field(local).value,event.timezone);field(occurrence).value=choices.length>1&&Date.parse(choices[1])===Date.parse(instant)?'second':'first';
    }
  } else {
    const day=localValue(new Date(),'America/New_York').slice(0,10);
    field('localStart').value=`${day}T19:00`;field('localEnd').value=`${day}T21:00`;
  }
  $('editor-title').textContent=event?'Edit event':'New event';$('record-state').textContent=event?(event.visibility==='public'?'PUBLISHED':'DRAFT'):'UNSAVED DRAFT';dirty=false;timePreview();controls();renderList();
}
async function refresh(){const data=await api('/api/admin/events');records=data.events;renderList();}
async function connect(){
  busy=true;controls();
  try{const readiness=await api("/api/status");loginReady=readiness.configured;if(!loginReady)throw new Error("Secure sign-in setup is pending. You can explore the form, but events cannot be saved yet.");const session=await api('/api/admin/session');authorized=true;$('session-title').textContent='Calendar connected';$('session-detail').textContent=`Signed in as ${session.email}`;$('sign-in').hidden=true;$('sign-out').hidden=false;$('save-hint').textContent='Drafts are private. Published events appear on the public calendar.';await refresh();}
  catch(error){authorized=false;$('session-title').textContent='Editor preview · not connected';$('session-detail').textContent=error.message;$('sign-in').hidden=!loginReady;$('save-hint').textContent='You can explore this form. Changes cannot be saved until secure sign-in is connected.';}
  finally{busy=false;controls();}
}
form.addEventListener('input',()=>{dirty=true;timePreview();});form.addEventListener('change',()=>{dirty=true;timePreview();});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!authorized||busy)return;
  const times=timePreview();if(!times){message('Check the event dates and times.',true);return;}
  const data=Object.fromEntries(new FormData(form));Object.assign(data,times,{featured:field('featured').checked});
  busy=true;controls();message('Saving event…');
  try{const saved=await api(selected?`/api/admin/events/${selected.id}`:'/api/admin/events',{method:selected?'PUT':'POST',headers:selected?{'If-Match':String(selected.revision)}:{},body:JSON.stringify(data)});dirty=false;selected=saved;
    // Keep the successful save even if refreshing the list encounters a network error.
    records=records.filter(record=>record.id!==saved.id);records.push(saved);records.sort((a,b)=>a.start.localeCompare(b.start));openEvent(saved);message(saved.visibility==='public'?'Saved and published to the calendar.':'Draft saved. Only you can see this event.');
  }catch(error){message(error.message,true);}finally{busy=false;controls();}
});
$('delete').onclick=async()=>{if(!selected||!authorized||busy||!confirm(`Delete “${selected.title}”? This removes it from the calendar permanently.`))return;busy=true;controls();try{await api(`/api/admin/events/${selected.id}`,{method:'DELETE',headers:{'If-Match':String(selected.revision)}});records=records.filter(event=>event.id!==selected.id);openEvent();message('Event deleted.');}catch(error){message(error.message,true);}finally{busy=false;controls();}};
$('new-event').onclick=()=>{if(canLeave()){openEvent();field('title').focus();}};
$('discard').onclick=()=>{if(canLeave())openEvent(selected);};
$('refresh').onclick=async()=>{if(!canLeave())return;try{await connect();if(authorized)openEvent(records.find(event=>event.id===selected?.id)||null);}catch(error){message(error.message,true);}};
$('search').oninput=renderList;$('filter').onchange=renderList;
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
openEvent();connect();
