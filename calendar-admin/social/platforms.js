import {esc} from './core.js?v=20261007-account-security';
export function platformMarkup(platform){
 if(!platform||platform==='Not specified')return '';
 const logo=platform.startsWith('Xbox')?'xbox':platform.startsWith('PlayStation')?'playstation':platform.startsWith('Nintendo')?'nintendoswitch':platform==='Steam Deck'?'steam':platform==='Android'?'android':platform==='iOS'?'apple':null;
 const icon=logo?`<img src="/social/assets/platforms/${logo}.svg" alt="" width="18" height="18">`:platform==='PC'?'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-5 0h10"/></svg>':'';
 return `<span class="platform-label">${icon}${esc(platform)}</span>`;
}
