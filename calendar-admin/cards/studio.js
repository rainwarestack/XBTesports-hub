import {fields,palettes,example,normalize,dateLabel,safeURL,caption,contrast} from './model.js';
const form=document.querySelector('#editor'),canvas=document.querySelector('#card'),ctx=canvas.getContext('2d'),status=document.querySelector('#status'),storageKey='xbt-event-card-v1';
for(const [key,label,max,type,wide] of fields){const row=document.createElement('label');row.textContent=label;if(wide)row.className=wide;const input=document.createElement(type==='textarea'?'textarea':'input');input.name=key;if(type!=='textarea')input.type=type;else input.rows=3;input.maxLength=max;row.append(input);document.querySelector('#fields').append(row);}
function values(){return normalize(Object.fromEntries(new FormData(form)));}
function load(data){const d=normalize(data);for(const [key,value] of Object.entries(d))if(form.elements[key])form.elements[key].value=value;const name=Object.keys(palettes).find(k=>palettes[k].join() === [d.background,d.ink,d.accent].join());document.querySelector('#palette').value=name||'custom';render();}
function lines(text,width){const result=[];let line='';for(const word of String(text).split(/\s+/)){if(ctx.measureText((line?line+' ':'')+word).width<=width){line+=(line?' ':'')+word;continue;}if(line)result.push(line);line='';for(const char of word){if(ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}}if(line)result.push(line);return result;}
function textBox(text,x,y,width,height,size=26,bold=false,color=current.ink,mono=false){ctx.fillStyle=color;let rows,fontSize=size;do{ctx.font=`${bold?800:400} ${fontSize}px ${mono?'monospace':'Arial, Helvetica, sans-serif'}`;rows=lines(text,width);if(rows.length*fontSize*1.17<=height)break;fontSize--;}while(fontSize>10);rows.forEach((row,i)=>ctx.fillText(row,x,y+i*fontSize*1.17));}
let current=normalize(example);
function line(x,y,w,color=current.ink){ctx.fillStyle=color;ctx.fillRect(x,y,w,2);}
function render(){current=values();const d=current,H=d.size==='square'?1080:1350;canvas.height=H;ctx.textBaseline='top';ctx.fillStyle=d.background;ctx.fillRect(0,0,1080,H);
 // Quiet registration marks and editorial numbering keep the layout tactical.
 ctx.strokeStyle=d.ink;ctx.lineWidth=2;for(const [x,y] of [[24,24],[1056,24],[24,H-24],[1056,H-24]]){ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y-10);ctx.lineTo(x,y+10);ctx.stroke();}
 textBox(d.brand||'YOUR COMMUNITY',60,52,760,30,22,true);textBox('INVITATION / 001',800,56,220,24,15,false,d.ink,true);line(60,94,960);
 ctx.fillStyle=d.accent;ctx.fillRect(60,110,8,24);textBox('OPEN CALL / COMMUNITY COMPETITION',83,113,900,22,15,false,d.ink,true);
 textBox('“'+(d.title||'YOUR EVENT').toUpperCase()+'”',56,153,968,H*.16-18,88,true);
 textBox(d.game||'GAME TO BE ANNOUNCED',60,H*.30,960,42,29,true);
 line(60,H*.345,960,d.accent);
 textBox(dateLabel(d.date)+(d.time?' / '+d.time:'')+(d.timezone?' '+d.timezone:''),60,H*.362,960,52,36,true);
 textBox(d.location||'LOCATION TO BE ANNOUNCED',60,H*.424,960,38,23,false,d.ink,true);
 const items=[['01 / FORMAT',d.format],['02 / PLATFORM',d.platform],['03 / ENTRY',d.entry],['04 / REWARDS',d.prize],['05 / CHECK-IN',d.checkin],['06 / PLAYERS',d.capacity],['07 / REGISTRATION CLOSES',d.deadline],['08 / HOST / CONTACT',d.host]];
 items.forEach(([label,value],i)=>{const x=60+(i%2)*500,y=H*.48+Math.floor(i/2)*H*.072;line(x,y,460);textBox(label,x,y+10,460,20,13,false,d.ink,true);textBox(value||'TBA',x,y+33,460,H*.072-37,25,true);});
 textBox('FIELD NOTES',60,H*.79,960,22,13,false,d.ink,true);textBox(d.notes||'Full rules and registration details are available from the host.',60,H*.814,960,H*.063,22);
 line(60,H*.89,960);textBox(d.cta||'YOU ARE INVITED.',60,H*.91,830,45,32,true);textBox('↗',955,H*.904,65,60,55,true,d.accent);
 const url=safeURL(d.url);textBox(url?url.replace(/^https?:\/\//,''):'REGISTRATION LINK IN POST',60,H*.958,890,32,18,false,d.ink,true);
 for(let n=0;n<12;n++){ctx.fillStyle=d.accent;ctx.fillRect(976+n*4,H*.963, n%3===0?2:1,16);}
 document.querySelector('#dimensions').textContent=`1080 × ${H}`;
 const ratio=contrast(d.background,d.ink),accentRatio=contrast(d.background,d.accent);document.querySelector('#contrast').textContent=ratio<4.5?'Low text contrast — choose a lighter text or darker background for readability.':accentRatio<3?'Text contrast looks good. The accent is subtle against this background.':'Text contrast looks good.';
 try{localStorage.setItem(storageKey,JSON.stringify(d));}catch{document.querySelector('#saved').textContent='Browser storage is unavailable. Download your card before leaving.';}
}
form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',e=>{if(['background','ink','accent'].includes(e.target.name))document.querySelector('#palette').value='custom';render();});form.addEventListener('change',render);
document.querySelector('#palette').addEventListener('change',e=>{const colors=palettes[e.target.value];if(colors){['background','ink','accent'].forEach((key,i)=>form.elements[key].value=colors[i]);render();}});
document.querySelector('#clear').onclick=()=>{if(confirm('Clear the event details? Your colors and image format will stay.')){const d=values();for(const [key] of fields)d[key]='';load(d);}};
document.querySelector('#sample').onclick=()=>{if(confirm('Replace this draft with example details?'))load(example);};
document.querySelector('#download').onclick=async e=>{if(!form.reportValidity())return;const button=e.currentTarget;button.disabled=true;status.textContent='Preparing PNG…';try{render();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not export the image.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(current.title||'event-card').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,65)+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='PNG ready. Attach it to your Discord post.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
document.querySelector('#caption').onclick=async()=>{if(!form.reportValidity())return;const content=caption(values());try{await navigator.clipboard.writeText(content);status.textContent='Caption copied. Paste it beneath your image in Discord.';}catch{const fallback=document.querySelector('#copy-fallback');fallback.hidden=false;fallback.value=content;fallback.focus();fallback.select();status.textContent='Select and copy the caption below.';}};
let initial=example;try{const stored=localStorage.getItem(storageKey);if(stored){const parsed=JSON.parse(stored);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))initial=parsed;}}catch{}load(initial);

