import { api } from './common.js';
const heads = new Map();
export function head(container, account) {
  container.replaceChildren();
  const base = document.createElement('img'); base.alt = account ? `Kopf von ${account.name}` : 'Standard-Spielerkopf'; base.src='assets/default-head.svg'; container.append(base);
  if (!account) return;
  if (!heads.has(account.id)) heads.set(account.id,api.accountAvatar(account.id).catch(()=>null));
  heads.get(account.id).then(data=>{
    if (!data || !container.contains(base)) return;
    base.src=data.base;
    const overlay=document.createElement('img'); overlay.src=data.overlay; overlay.alt='';overlay.className='skin-overlay';container.append(overlay);
  });
}
export function modIcon(img, url) {
  const fallback='assets/loaders/fabric.svg';
  let valid=false; try { const parsed=new URL(url); valid=parsed.protocol==='https:' && ['cdn.modrinth.com','media.forgecdn.net','mediafilez.forgecdn.net'].includes(parsed.hostname); } catch {}
  img.referrerPolicy='no-referrer'; img.alt=''; img.src=valid ? url : fallback; img.loading='lazy';
  img.onerror=()=>{img.onerror=null;img.src=fallback;};
}
