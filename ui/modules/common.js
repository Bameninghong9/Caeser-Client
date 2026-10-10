export const $ = id => document.getElementById(id);
export const api = window.caeser;
export const model = { state: null, versions: [], catalogueReady: false, running: false, busy: false, detailId: null, details: null };
let toastTimer;
export function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, error ? 9000 : 3500);
}
export async function action(fn) { try { return await fn(); } catch (error) { toast(error.message, true); } }
export function update(state) { model.state = state; document.dispatchEvent(new Event('state-change')); }
export const onState = callback => document.addEventListener('state-change', callback);
import { t, currentLanguage } from './i18n.js';
let currentPage = 'play';
export function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === (page === 'profile' ? 'profiles' : page)));
  updatePageLabel();
  document.querySelector('.content').scrollTop = 0;
}
export function updatePageLabel() {
  const map = { play: t('navPlay'), profiles: t('navProfiles'), profile: t('profile', 'Profil'), skins: t('navSkins'), settings: t('navSettings') };
  $('page-label').textContent = map[currentPage] || currentPage;
}
document.addEventListener('language-change', () => {
  updatePageLabel();
});
export async function getActiveSkinTexture() {
  const state = model.state;
  const activeSkinId = state?.settings?.activeSkinId || 'account';
  if (activeSkinId === 'steve') return null;
  if (activeSkinId !== 'account') {
    const custom = state?.skins?.find(s => s.id === activeSkinId);
    if (custom) return custom.data;
  }
  const account = currentAccount();
  if (account) {
    try {
      const data = await api.accountAvatar(account.id);
      if (data?.skin) return data.skin;
    } catch {}
  }
  return null;
}
export function openDetails(id) { document.dispatchEvent(new CustomEvent('profile-open',{detail:id})); }
export function relativeTime(date) {
  const isEn = currentLanguage === 'en';
  if (!date) return isEn ? 'Never' : 'Noch nie';
  const minutes = Math.max(0, Math.floor((Date.now() - date) / 60000));
  if (minutes < 1) return isEn ? 'Just now' : 'Gerade eben';
  if (minutes < 60) return isEn ? `${minutes}m ago` : `Vor ${minutes} Min.`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return isEn ? `${hours}h ago` : `Vor ${hours} Std.`;
  }
  const days = Math.floor(minutes / 1440);
  return isEn ? `${days}d ago` : `Vor ${days} Tagen`;
}
export function bytesLabel(bytes) {
  const locale = currentLanguage === 'en' ? 'en-US' : 'de-DE';
  return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : bytes < 1073741824 ? `${(bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 1 })} MB` : `${(bytes / 1073741824).toLocaleString(locale, { maximumFractionDigits: 2 })} GB`;
}
export const loaderName = mode => ({ vanilla: 'Vanilla', fabric: 'Fabric', caeser: 'Fabric + Caeser' })[mode];
export const memoryLabel = memoryMb => `${memoryMb} MB · ${(memoryMb / 1024).toLocaleString(currentLanguage === 'en' ? 'en-US' : 'de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`;
export const currentProfile = () => model.state.profiles.find(p => p.id === model.state.activeProfileId);
export const currentAccount = () => model.state?.accounts?.find(a => a.id === model.state?.settings?.activeAccount) || model.state?.accounts?.[0] || null;
export function showAccounts() { if (!$('accounts-dialog').open) $('accounts-dialog').showModal(); }
export async function loadVersions() {
  try {
    const data = await api.versions(); model.versions = data.versions; model.catalogueReady = true;
    $('connection-label').textContent = data.cached ? t('versionsSaved', 'Versionsliste gespeichert') : t('allUpdated', 'Alles aktuell');
  } catch { $('connection-label').textContent = t('noConnection', 'Keine Verbindung'); }
  document.dispatchEvent(new Event('catalogue-change'));
}
