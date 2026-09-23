import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
// One authored social surface serves GitHub Pages, the public Worker, and the
// existing Access-protected owner editor. No secrets are copied into assets.
const shell=await readFile('public/social/index.html','utf8');
for(const route of ['tournaments','players','groups','clips','forums','messages','notifications','profile','discover','admin','admin/moderation','legacy','guidelines']){
 await mkdir('public/social/'+route,{recursive:true});await writeFile('public/social/'+route+'/index.html',shell);
}
for(const route of ['admin/brackets','admin/moderation']){await mkdir('public/'+route,{recursive:true});await writeFile('public/'+route+'/index.html',shell);}
await writeFile('public/404.html',shell);
await cp('public/social','calendar-admin/social',{recursive:true});
await cp('public/social','site/social',{recursive:true});
await writeFile('site/404.html',shell);
