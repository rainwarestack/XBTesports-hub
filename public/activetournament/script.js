'use strict';
// CONFIGURATION. Public read-only calendar; private event management lives in the editor.
const CONFIG = { baseTimezone: 'America/New_York', maxCellEvents: 2 };
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const $ = id => document.getElementById(id);

// DATE / TIMEZONE UTILITIES. Civil dates use UTC only as a calendar arithmetic
// container. Event instants are always formatted in the selected IANA timezone.
function civilDate(year, month, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}
function dateKey(date) { return date.toISOString().slice(0, 10); }
function parseDay(key) { const [y,m,d] = key.split('-').map(Number); return civilDate(y,m-1,d); }
function addDays(date, count) { return civilDate(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+count); }
function instantDay(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
  const get = name => parts.find(part => part.type === name).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function todayDate() { return parseDay(instantDay(new Date(),calendarState.timezone)); }
function dayLabel(date, options = {weekday:'long',month:'long',day:'numeric',year:'numeric'}) {
  return new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(date);
}
function displayTime(instant) { return new Intl.DateTimeFormat('en-US',{timeZone:calendarState.timezone,hour:'numeric',minute:'2-digit'}).format(new Date(instant)); }
function displayInstant(instant) { return new Intl.DateTimeFormat('en-US',{timeZone:calendarState.timezone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(instant)); }

// STATE. Only timezone preference is saved locally; event data is never editable.
let preference = 'auto';
try { preference = localStorage.getItem('xbt-calendar-timezone') || 'auto'; } catch { /* Local file/private mode can disallow storage. */ }
if (![...$('timezone').options].some(option => option.value === preference)) preference = 'auto';
const calendarState = { currentDate:null,selectedDate:null,view:'month',timezone:preference === 'auto' ? browserTimezone : preference };
calendarState.currentDate = todayDate();
calendarState.selectedDate = dateKey(calendarState.currentDate);

// SAMPLE EVENTS / DOCUMENTED SCHEMA
/**
 * Required: id, title, start, end (ISO 8601 instants with Z or explicit offset),
 * timezone (IANA source zone), category, status, visibility ('public'|'private').
 * Optional: slug, description, game, format, registrationOpen, registrationClose
 * (ISO instants), registrationUrl, tournamentUrl, streamUrl (HTTPS URLs), location,
 * platform, prize, featured, createdAt, updatedAt, recurrence, accent.
 * end is EXCLUSIVE. Multi-day events appear on every local day they overlap.
 * Phase 2: replace loadPublicEvents with an API returning public records only.
 * /admin will require server-side authentication and authorization for every write.
 * Future create/edit/delete/duplicate, drag/reschedule/resize, recurrence expansion,
 * templates, registration windows, categories, visibility and holiday management
 * belong there. CSS-hidden controls are not security. Public clients never receive
 * private records or credentials. Recurrence should expand server-side in source zone.
 */
const sampleEvents = [
  ['registration-opens','Registration Opens','2026-09-08T16:00:00Z','2026-09-08T17:00:00Z','Registration','Registration Open','Open bracket registration window.'],
  ['gunfight','Gunfight Night','2026-09-11T23:00:00Z','2026-09-12T01:00:00Z','Tournament','Scheduled','Pair up for a sample evening of two-player Gunfight matches.'],
  ['ffa','FFA Open','2026-09-12T23:00:00Z','2026-09-13T01:00:00Z','Tournament','Registration Open','A free-for-all practice bracket for the XBT community.'],
  ['ranked','CDL Ranked Night','2026-09-15T23:30:00Z','2026-09-16T02:00:00Z','Tournament','Scheduled','A sample competitive ranked session using a four-player team format.'],
  ['registration-closes','Registration Closes','2026-09-18T22:00:00Z','2026-09-18T22:30:00Z','Registration','Closing Soon','Example deadline for the Black Ops 7 open bracket.'],
  ['open-bracket','Black Ops 7 Open Bracket','2026-09-20T00:00:00Z','2026-09-20T03:00:00Z','Tournament','Registration Open','The featured sample XBT open bracket. This begins September 19 at 8:00 PM in New York.'],
  ['snipers','Snipers Only','2026-09-19T17:00:00Z','2026-09-19T19:00:00Z','Tournament','Scheduled','A precision-focused sample lobby featuring sniper loadouts.'],
  ['ar-smg','AR vs SMG','2026-09-19T20:00:00Z','2026-09-19T22:00:00Z','Special Event','Scheduled','A community exhibition matching assault rifles against submachine guns.'],
  ['warzone','Warzone Grind','2026-09-23T00:00:00Z','2026-09-23T03:00:00Z','Tournament','Scheduled','A sample squad session across the Warzone battleground.'],
  ['championship','Championship Match','2026-09-27T00:00:00Z','2026-09-27T03:00:00Z','Special Event','Scheduled','The final match of this fictional September bracket.']
].map(([id,title,start,end,category,status,description]) => ({id,title,slug:id,start,end,category,status,description,timezone:CONFIG.baseTimezone,game:id === 'warzone' ? 'Call of Duty: Warzone' : 'Call of Duty: Black Ops 7',format:id === 'gunfight' ? '2 vs 2' : id === 'ranked' ? '4 vs 4' : 'Free For All',visibility:'public',featured:id === 'open-bracket',registrationUrl:null,tournamentUrl:null}));
function loadPublicEvents() { return sampleEvents.filter(event => event.visibility === 'public').sort((a,b) => Date.parse(a.start)-Date.parse(b.start)); }
const apiBase = typeof window !== 'undefined' ? (window.XBT_CALENDAR_API || '').replace(/\/$/,'') : '';
let events = apiBase ? [] : loadPublicEvents();
let scheduleState = apiBase ? 'loading' : 'sample';
async function refreshPublicSchedule() {
  if(!apiBase)return;
  try {
    if(!apiBase.startsWith('https://'))throw new Error('Invalid calendar endpoint.');
    const response=await fetch(`${apiBase}/api/events`,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Calendar unavailable.');
    const data=await response.json();
    if(!Array.isArray(data.events))throw new Error('Invalid schedule.');
    events=data.events.filter(event=>event.visibility==='public'&&Number.isFinite(Date.parse(event.start))&&Number.isFinite(Date.parse(event.end))).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    scheduleState='live';
  } catch { events=[];scheduleState='error'; }
  render();
}

// HOLIDAYS. US calendar dates, not midnight instants; never shift with timezone.
// Actual holiday dates, not substitute observed weekdays. Generated for every year.
function holidaysForYear(year) {
  const nth = (month, weekday, occurrence) => {
    const first = civilDate(year,month,1);
    return dateKey(addDays(first,(weekday-first.getUTCDay()+7)%7+(occurrence-1)*7));
  };
  const lastMay = civilDate(year,5,0);
  const holidays = [
    [dateKey(civilDate(year,0,1)),"New Year's Day"],[nth(0,1,3),'Martin Luther King Jr. Day'],
    [dateKey(addDays(lastMay,-(lastMay.getUTCDay()+6)%7)),'Memorial Day'],
    [dateKey(civilDate(year,5,19)),'Juneteenth'],[dateKey(civilDate(year,6,4)),'Independence Day'],
    [nth(8,1,1),'Labor Day'],[nth(10,4,4),'Thanksgiving'],[dateKey(civilDate(year,11,25)),'Christmas']
  ];
  return holidays.map(([date,title]) => ({date,title}));
}
function holidaysOn(key) { return holidaysForYear(Number(key.slice(0,4))).filter(holiday => holiday.date === key); }
function eventsOn(key) { return events.filter(event => instantDay(event.start,calendarState.timezone) <= key && instantDay(Date.parse(event.end)-1,calendarState.timezone) >= key); }
function el(tag,className,text) { const node=document.createElement(tag); if(className) node.className=className; if(text !== undefined) node.textContent=text; return node; }

// EVENT RENDERING. User-provided text goes through textContent, never raw HTML.
function eventButton(event,key) {
  const categoryClass = event.category === 'Registration' ? 'registration' : event.category === 'Special Event' ? 'special' : 'tournament';
  const button = el('button',`xbt-event ${categoryClass}`);
  const continuation = instantDay(event.start,calendarState.timezone) < key;
  const time = continuation ? `CONTINUES · until ${displayTime(event.end)}` : displayTime(event.start);
  button.append(el('span','event-time',time),el('span','event-title',event.title));
  button.setAttribute('aria-label',`${event.title}, ${time}, ${event.category}, ${event.status}`);
  button.addEventListener('click',() => openEvent(event));
  return button;
}
function dayContents(key,limit=Infinity) {
  const content=el('div','day-events');
  for(const holiday of holidaysOn(key)) content.append(el('div','xbt-holiday',`□ ${holiday.title}`));
  const matches=eventsOn(key);
  for(const event of matches.slice(0,limit)) content.append(eventButton(event,key));
  return content;
}

// CALENDAR GENERATION
function monthDays(date) {
  const first=civilDate(date.getUTCFullYear(),date.getUTCMonth(),1);
  const count=civilDate(date.getUTCFullYear(),date.getUTCMonth()+1,0).getUTCDate();
  const start=addDays(first,-first.getUTCDay());
  return Array.from({length:Math.ceil((first.getUTCDay()+count)/7)*7},(_,i)=>addDays(start,i));
}
function renderMonth() {
  const heading=el('div','weekday-row');
  for(const name of ['SUN','MON','TUE','WED','THU','FRI','SAT']) heading.append(el('span','',name));
  const grid=el('div','month-grid');
  const today=dateKey(todayDate());
  for(const date of monthDays(calendarState.currentDate)) {
    const key=dateKey(date), matches=eventsOn(key);
    const cell=el('div',`day-cell${date.getUTCMonth() !== calendarState.currentDate.getUTCMonth() ? ' outside' : ''}${key === today ? ' is-today' : ''}`);
    const button=el('button','date-button',date.getUTCDate());
    button.dataset.date=key;
    button.setAttribute('aria-label',`${dayLabel(date)}${key === today ? ', today' : ''}, ${matches.length} events${holidaysOn(key).map(h=>' ,'+h.title).join('')}`);
    button.setAttribute('aria-pressed',String(calendarState.selectedDate === key));
    if(key === today) button.setAttribute('aria-current','date');
    button.addEventListener('click',()=>selectDate(key));
    cell.append(button,dayContents(key,CONFIG.maxCellEvents));
    if(matches.length>CONFIG.maxCellEvents) {
      const more=el('button','more-button',`+${matches.length-CONFIG.maxCellEvents} MORE`);
      more.setAttribute('aria-label',`View all ${matches.length} events on ${dayLabel(date)}`);
      more.addEventListener('click',()=>{calendarState.currentDate=date;calendarState.selectedDate=key;setView('day');$('calendar').focus();});
      cell.append(more);
    }
    const dots=el('span','mobile-dot',matches.length ? '●'.repeat(Math.min(matches.length,3)) : holidaysOn(key).length ? '□' : '');
    dots.setAttribute('aria-hidden','true');cell.append(dots);grid.append(cell);
  }
  $('calendar').append(heading,grid);
  renderSelectedDay();
}
function renderSelectedDay() {
  const section=$('selected-day');section.replaceChildren();section.hidden=calendarState.view !== 'month';
  if(section.hidden) return;
  const key=calendarState.selectedDate;
  section.append(el('h3','',dayLabel(parseDay(key))),dayContents(key));
  if(!eventsOn(key).length && !holidaysOn(key).length) section.append(el('p','empty-day','No events scheduled.'));
}
function selectDate(key) {
  calendarState.selectedDate=key;
  calendarState.currentDate=parseDay(key);
  render();
  document.querySelector(`[data-date="${key}"]`)?.focus({preventScroll:true});
}
function periodDays() {
  const date=calendarState.currentDate;
  if(calendarState.view === 'month') return monthDays(date);
  if(calendarState.view === 'day') return [date];
  const first=addDays(date,-date.getUTCDay());return Array.from({length:7},(_,i)=>addDays(first,i));
}
function renderAgenda() {
  const agenda=el('div','period-agenda');
  for(const date of periodDays()) {
    const key=dateKey(date),section=el('section',`agenda-day${key === dateKey(todayDate()) ? ' today-agenda' : ''}`);
    section.append(el('h3','',dayLabel(date,{weekday:'long',month:'short',day:'numeric'})));
    const content=dayContents(key);
    if(!content.children.length) content.append(el('p','empty-day','No events scheduled.'));
    section.append(content);agenda.append(section);
  }
  $('calendar').append(agenda);renderSelectedDay();
}
function render() {
  const badge=document.querySelector('.sample-label'),note=document.querySelector('.prototype-note');
  if(badge)badge.textContent=({sample:'SAMPLE SCHEDULE · PHASE 1',loading:'LOADING SCHEDULE',live:'PUBLISHED SCHEDULE',error:'SCHEDULE UNAVAILABLE'})[scheduleState];
  if(note)note.textContent=({sample:'Preview calendar. All tournaments are fictional examples; registration and tournament links are not live.',loading:'Loading the latest tournament schedule…',live:'Tournament times are displayed in your selected timezone.',error:'The schedule could not be loaded. Please refresh to try again. Holidays are still shown.'})[scheduleState];
  $('calendar').replaceChildren();
  const date=calendarState.currentDate;
  let title=dayLabel(date,{month:'long',year:'numeric'});
  if(calendarState.view === 'day') title=dayLabel(date,{month:'short',day:'numeric',year:'numeric'});
  if(calendarState.view === 'week') { const days=periodDays();title=`${dayLabel(days[0],{month:'short',day:'numeric'})} – ${dayLabel(days[6],{month:'short',day:'numeric',year:'numeric'})}`; }
  $('period-title').textContent=title;
  $('timezone-label').textContent=`${preference === 'auto' ? 'AUTO / ' : ''}${calendarState.timezone.replaceAll('_',' ')} · Times shown locally`;
  $('previous').setAttribute('aria-label',`Previous ${calendarState.view}`);$('next').setAttribute('aria-label',`Next ${calendarState.view}`);
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view === calendarState.view)));
  calendarState.view === 'month' ? renderMonth() : renderAgenda();
  const days=periodDays().filter(day=>calendarState.view !== 'month' || day.getUTCMonth() === date.getUTCMonth());
  const ids=new Set(days.flatMap(day=>eventsOn(dateKey(day)).map(event=>event.id)));
  $('period-count').textContent=`${ids.size} ${scheduleState === 'sample' ? 'SAMPLE ' : ''}EVENTS / ${calendarState.view.toUpperCase()}`;
}

// MODAL FUNCTIONS. Native dialog supplies focus containment and Escape support.
let returnFocus=null;
function openEvent(event) {
  returnFocus=document.activeElement;
  $('modal-category').textContent=`${event.category.toUpperCase()}${scheduleState === 'sample' ? ' / SAMPLE' : ''}`;
  $('modal-title').textContent=event.title;
  const details=el('dl');
  for(const [label,value] of [['START',displayInstant(event.start)],['END',displayInstant(event.end)],['TIMEZONE',calendarState.timezone],['GAME',event.game],['FORMAT',event.format],['STATUS',event.status]]) details.append(el('dt','',label),el('dd','',value));
  const actions=el('div','modal-actions');
    for(const [label,url] of [['REGISTER ↗',event.registrationUrl],['VIEW TOURNAMENT ↗',event.tournamentUrl]]) {
    let safe=false;try{safe=new URL(url).protocol==='https:';}catch{/* Missing links remain disabled. */}
    if(label==='REGISTER ↗'&&['Cancelled','Postponed','Completed','Registration Closed'].includes(event.status))safe=false;
    const action=el(safe?'a':'button','event-action',label);
    if(safe){action.href=url;action.target='_blank';action.rel='noopener noreferrer';}else action.disabled=true;
    actions.append(action);
  }
  $('modal-body').replaceChildren(details,el('p','description',event.description),actions,el('p','modal-note',scheduleState === 'sample' ? 'Fictional sample event. Registration and tournament links will be available when real events are added.' : 'Links are provided by the tournament organizer. Unavailable actions are disabled.'));
  $('event-dialog').showModal();
}
$('close-modal').addEventListener('click',()=>$('event-dialog').close());
$('event-dialog').addEventListener('click',event=>{if(event.target !== $('event-dialog')) return;const r=$('event-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('event-dialog').close();});
$('event-dialog').addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});

// NAVIGATION / VIEW SWITCHING
function navigate(direction) {
  const date=calendarState.currentDate;
  if(calendarState.view === 'month') calendarState.currentDate=civilDate(date.getUTCFullYear(),date.getUTCMonth()+direction,1);
  else calendarState.currentDate=addDays(date,direction*(calendarState.view === 'week' ? 7 : 1));
  calendarState.selectedDate=dateKey(calendarState.currentDate);render();
}
function setView(view) { calendarState.view=view;render(); }
$('previous').addEventListener('click',()=>navigate(-1));$('next').addEventListener('click',()=>navigate(1));
$('today').addEventListener('click',()=>{calendarState.currentDate=todayDate();calendarState.selectedDate=dateKey(calendarState.currentDate);render();});
for(const button of document.querySelectorAll('[data-view]')) button.addEventListener('click',()=>setView(button.dataset.view));
$('timezone').addEventListener('change',event=>{
  const wasToday=calendarState.selectedDate === dateKey(todayDate());
  preference=event.target.value;calendarState.timezone=preference === 'auto' ? browserTimezone : preference;
  try{localStorage.setItem('xbt-calendar-timezone',preference);}catch{/* Optional preference only. */}
  if(wasToday){calendarState.currentDate=todayDate();calendarState.selectedDate=dateKey(calendarState.currentDate);}
  render();
});
$('calendar').addEventListener('keydown',event=>{
  if(!event.target.dataset.date)return;
  const movement={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
  if(movement){event.preventDefault();selectDate(dateKey(addDays(parseDay(event.target.dataset.date),movement)));}
});
// INITIALIZATION
$('timezone').value=preference;render();refreshPublicSchedule();
