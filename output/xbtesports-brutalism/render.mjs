import sharp from '../../node_modules/sharp/lib/index.js';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const out=new URL('./',import.meta.url);
const teal='#00CDA5', white='#F4F7F2';
function svg(t){
 let s=[];
 const line=(d,c=teal,w=1,op=1)=>s.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" opacity="${op}"/>`);
 s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><clipPath id="topo"><rect x="28" y="318" width="554" height="178"/></clipPath><clipPath id="arrows"><rect x="28" y="48" width="904" height="22"/></clipPath></defs><rect width="960" height="540" fill="#050606"/>`);
 // Travelling chevrons, each cycle returns to the same geometry.
 s.push('<g clip-path="url(#arrows)">');
 for(let i=-1;i<30;i++){let x=28+i*34+t*34; s.push(`<path d="M${x} 48h12l11 11-11 11h-12l11-11Z" fill="${teal}"/>`);} s.push('</g>');
 line('M28 92H932',white,1,.35);
 s.push(`<text x="29" y="118" fill="${white}" font-family="monospace" font-size="11" letter-spacing="3">XBT / COMPETITIVE COMMUNITY</text><text x="930" y="118" text-anchor="end" fill="${teal}" font-family="monospace" font-size="11" letter-spacing="2">PLAY. CONNECT. COMPETE.</text>`);
 // Strong static brand, exact case, with offset outline echo.
 const title=(y,outline=false)=>`<g transform="translate(42 ${y}) skewX(-12) scale(1.22 1)"><text x="0" y="0" font-family="Arial Black" font-weight="900" font-size="115" letter-spacing="-7" ${outline?`fill="none" stroke="${teal}" stroke-width=".65" opacity=".42"`:`fill="${white}"`}><tspan ${outline?'':`fill="${teal}"`}>XBT</tspan><tspan>esports</tspan></text><text x="690" y="-65" font-family="Arial" font-size="24" ${outline?'opacity="0"':`fill="${white}"`}>™</text></g>`;
 s.push(title(212,true),title(302,true),title(261));
 // Dark mask preserves a clean breathing gap below the headline.
 s.push('<rect x="0" y="307" width="960" height="11" fill="#050606"/>');
 line('M28 318H582V496H28Z',teal,1,.65);
 s.push('<g clip-path="url(#topo)">');
 for(let j=0;j<29;j++){
  let pts=[];
  for(let i=0;i<=100;i++){
   let a=i/100*Math.PI*2;
   let wobble=1+.10*Math.sin(3*a+t*2*Math.PI)+.055*Math.cos(5*a-t*2*Math.PI);
   let rx=(22+j*12)*wobble, ry=(10+j*6.9)*wobble;
   pts.push(`${i?'L':'M'}${(304+rx*Math.cos(a)).toFixed(2)} ${(411+ry*Math.sin(a)).toFixed(2)}`);
  }
  line(pts.join(' ')+'Z',j%5===0?white:teal,j%5===0?1.2:.8,j%5===0?.65:.75);
 }
 s.push('</g>');
 // Globe grid, cycling meridians.
 line('M602 318H932V496H602Z',white,1,.35);
 const cx=769,cy=407,rx=137,ry=66;
 s.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${teal}" stroke-width="1.8"/>`);
 for(let k=-2;k<=2;k++){let a=k*Math.PI/7;let yy=cy+ry*Math.sin(a),r=rx*Math.cos(a);line(`M${cx-r} ${yy} Q${cx} ${yy+12*Math.cos(a)} ${cx+r} ${yy}`,teal,1.1,.85);}
 for(let k=0;k<10;k++){let a=k*2*Math.PI/10+t*2*Math.PI/10;let pts=[];for(let j=0;j<=60;j++){let b=-Math.PI/2+j*Math.PI/60;pts.push(`${j?'L':'M'}${(cx+rx*Math.cos(b)*Math.sin(a)).toFixed(2)} ${(cy+ry*Math.sin(b)).toFixed(2)}`);}line(pts.join(' '),teal,1,.8);}
 s.push(`<rect x="614" y="327" width="99" height="18" fill="#050606"/><text x="617" y="340" fill="${white}" font-family="monospace" font-size="10" letter-spacing="2">GLOBAL / XBT</text>`);
 // Technical index and white crosshair accents.
 for(const [x,y] of [[28,318],[582,496],[932,318]]) line(`M${x-5} ${y}h10M${x} ${y-5}v10`,white,1.7);
 for(let i=0;i<15;i++){let x=31+i*13;line(`M${x} 517l8-8`,white,1.4,.85);}
 s.push(`<text x="931" y="519" text-anchor="end" fill="${white}" font-family="monospace" font-size="10" letter-spacing="3">ONLINE ELIMINATION BRACKETS</text></svg>`);
 return s.join('');
}
await fs.writeFile(new URL('xbtesports-brutalism.svg',out),svg(0));
for(let i=0;i<48;i++) await sharp(Buffer.from(svg(i/48))).png().toFile(fileURLToPath(new URL(`frames/${String(i).padStart(3,'0')}.png`,out)));
await sharp(Buffer.from(svg(0))).png().toFile(fileURLToPath(new URL('xbtesports-brutalism-still.png',out)));
console.log('Rendered 48 frames at 960 × 540.');


