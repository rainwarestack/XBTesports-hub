let dirty=false,saving=0,installed=false;
export function resetEditor(){dirty=false;}
export function setEditorSaving(value){saving=Math.max(0,saving+(value?1:-1));}
export function requestEditorClose(){
 const dialog=document.querySelector('#dialog');
 if(saving)return;
 if(dirty&&!window.confirm('Discard unsaved changes? Your changes will not be saved.'))return;
 dialog.close();
}
export function installEditorGuard(){
 if(installed)return;installed=true;
 const dialog=document.querySelector('#dialog');
 dialog.addEventListener('input',()=>{dirty=true;});
 dialog.addEventListener('change',()=>{dirty=true;});
 dialog.addEventListener('click',e=>{
  if(e.target.closest('[data-color],[data-add],[data-remove-game],[data-remove-shot],#add-screenshot'))dirty=true;
 });
 dialog.addEventListener('cancel',e=>{e.preventDefault();requestEditorClose();});
 dialog.addEventListener('close',resetEditor);
 document.querySelector('.dialog-close').onclick=requestEditorClose;
 // Backdrop clicks intentionally do nothing: only explicit close controls dismiss editors.
}
