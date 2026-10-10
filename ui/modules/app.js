import { $, api, model, update, action, navigate, showAccounts, loadVersions, toast } from './common.js';
import { renderIcons } from './icons.js';
import { initProfiles } from './profiles.js';
import { initAccounts } from './accounts.js';
import { initSettings } from './settings.js';
import { initPlay } from './play.js';
import { initDetails } from './details.js';
import { initSkins } from './skins.js';
import { applyLanguage } from './i18n.js';
import { initAtmosphereAnimation } from './atmosphere-animation.js';
renderIcons(); initProfiles(); initAccounts(); initSettings(); initPlay(); initDetails(); initSkins(); initAtmosphereAnimation();
window.__update = update;
window.refreshState = async () => update(await api.state());
document.querySelectorAll('[data-page],[data-go]').forEach(button => button.onclick = () => navigate(button.dataset.page || button.dataset.go));
document.querySelectorAll('[data-window]').forEach(button => button.onclick = () => action(() => api.window(button.dataset.window)));
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
api.on('notice', message => toast(message, true));
action(async () => {
  const state = await api.state(); model.running = state.running; model.busy = state.busy; update(state);
  applyLanguage(state.settings.language || 'de');
  $('build-version').textContent = state.appVersion;
  if ($('about-version')) $('about-version').textContent = state.appVersion;
  await loadVersions();
});

