// Civil input <-> universal instants using IANA timezone rules, including DST.
export function localValue(instant, timezone) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const value=name=>parts.find(p=>p.type===name).value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}
export function instantChoices(value, timezone) {
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw new Error('Enter a complete date and time.');
  const wall=Date.parse(`${value}:00Z`);
  if(!Number.isFinite(wall))throw new Error('Enter a valid date and time.');
  const offsets=new Set();
  // Sample Intl's actual zone rules on both sides of a possible DST transition.
  for(let hours=-36;hours<=36;hours+=6){const probe=wall+hours*3600000;offsets.add(Date.parse(`${localValue(probe,timezone)}:00Z`)-probe);}
  return [...offsets].map(offset=>wall-offset).filter(candidate=>localValue(candidate,timezone)===value).sort((a,b)=>a-b).map(ms=>new Date(ms).toISOString());
}
export function toInstant(value, timezone, occurrence='first') {
  const choices=instantChoices(value,timezone);
  if(!choices.length)throw new Error('This local time does not exist because the clocks move forward. Choose another time.');
  return occurrence==='second' ? choices[choices.length-1] : choices[0];
}
