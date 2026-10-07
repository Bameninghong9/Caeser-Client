import { $, api, model, update, onState, action, toast, currentAccount, navigate } from './common.js';
import { icon } from './icons.js';
import { head } from './images.js';
import { extractFaceFromSkin } from './skin-renderer.js';
let loginBusy = false;
const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>`;

export async function updateHeaderAvatar() {
  const avatarEl = $('header-avatar');
  if (!avatarEl) return;
  const state = model.state;
  const activeSkinId = state?.settings?.activeSkinId || 'account';
  const curAcc = currentAccount();

  if (activeSkinId === 'steve') {
    head(avatarEl, null);
    return;
  }

  if (activeSkinId === 'account') {
    head(avatarEl, curAcc);
    return;
  }

  const custom = state?.skins?.find(s => s.id === activeSkinId);
  if (custom?.data) {
    try {
      const faceData = await extractFaceFromSkin(custom.data);
      if (faceData) {
        avatarEl.replaceChildren();
        const img = document.createElement('img');
        img.src = faceData;
        img.alt = custom.name;
        avatarEl.append(img);
        return;
      }
    } catch {}
  }

  head(avatarEl, curAcc);
}

function renderAccounts() {
  const curAcc = currentAccount();
  $('account-name').textContent = curAcc?.name || 'Anmelden';
  updateHeaderAvatar();
  if ($('player-avatar')) head($('player-avatar'), curAcc);
  if ($('player-name')) $('player-name').textContent = curAcc?.name || 'Willkommen bei Caeser.';
  $('account-subtitle').textContent = curAcc ? 'Microsoft · Verbunden' : 'Microsoft-Konto';
  const list = $('accounts-list'); list.replaceChildren();
  const menu = $('account-options'); menu.replaceChildren();
  if (!model.state.accounts.length) menu.innerHTML = '<p class="account-menu-empty">Verbinde dein Microsoft-Konto, um loszuspielen.</p>';

  const activeId = model.state.settings.activeAccount;
  const sortedAccounts = [...model.state.accounts].sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    return 0;
  });

  for (const acc of model.state.accounts) {
    const row = document.createElement('div'); row.className = 'account-row';
    row.innerHTML = `<span class="skin-head"></span><span><strong></strong><small>Sitzung gespeichert</small></span><div class="buttons"><button class="secondary select-account"></button><button class="icon-button remove-account" aria-label="Konto lokal entfernen" title="Konto entfernen">${trashIcon}</button></div>`;
    head(row.querySelector('.skin-head'), acc);
    row.querySelector('strong').textContent = acc.name;
    const selected = acc.id === activeId;
    row.querySelector('.select-account').textContent = selected ? '✓ Aktiv' : 'Auswählen';
    row.querySelector('.select-account').disabled = selected;
    row.querySelector('.select-account').onclick = () => action(async () => update(await api.settings({ activeAccount: acc.id })));
    row.querySelector('.remove-account').onclick = () => action(async () => { update(await api.removeAccount(acc.id)); toast('Konto von diesem Launcher abgemeldet.'); });
    list.append(row);
  }

  for (const acc of sortedAccounts) {
    const selected = acc.id === activeId;
    const item = document.createElement('div'); item.className = 'account-option' + (selected ? ' active' : '');
    item.innerHTML = `<button class="choose-account" type="button"><span class="skin-head"></span><span></span></button><button class="remove-menu-account" aria-label="Konto lokal entfernen" title="Konto entfernen">${trashIcon}</button>`;
    head(item.querySelector('.skin-head'), acc);
    item.querySelector('.choose-account>span:last-child').textContent = acc.name;
    item.querySelector('.choose-account').onclick = () => action(async () => {
      update(await api.settings({ activeAccount: acc.id }));
      try { $('account-menu').hidePopover(); } catch {}
    });
    item.querySelector('.remove-menu-account').onclick = () => action(async () => {
      update(await api.removeAccount(acc.id));
      toast('Konto lokal entfernt.');
    });
    menu.append(item);
  }
}
export function initAccounts() {
  onState(renderAccounts);
  $('add-account').onclick=()=>{$('account-menu').hidePopover();$('accounts-dialog').showModal();};
  $('login-button').onclick = async () => {
    if (loginBusy) return; loginBusy = true; $('login-button').disabled = true; $('login-pending').hidden = false; $('login-error').hidden = true;
    try { update(await api.login()); toast('Angemeldet. Deine Sitzung wurde gespeichert.'); $('accounts-dialog').close(); }
    catch (error) { if (error.message !== 'Anmeldung abgebrochen.') { $('login-error').textContent = error.message; $('login-error').hidden = false; } }
    finally { loginBusy = false; $('login-button').disabled = false; $('login-pending').hidden = true; }
  };
  $('cancel-login').onclick = () => action(() => api.cancelLogin());
  $('accounts-dialog').addEventListener('close', () => { if (loginBusy) action(() => api.cancelLogin()); });
}
