// Update-Button in der Titelleiste: erscheint nur, wenn es eine neue Launcher-Version gibt.
// Nichts passiert ohne Klick (siehe src/app/updater.cjs).
import { $, api, action, toast } from './common.js';
import { t } from './i18n.js';

let status = { status: 'idle' };
let inGame = false;

const fill = (key, values) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, () => String(value ?? '')), t(key));

function render() {
  const button = $('update-button');
  const { status: current, version, percent, portable } = status;
  button.hidden = !['available', 'downloading', 'ready', 'installing'].includes(current);
  if (button.hidden) return;
  const waiting = (current === 'ready' || current === 'available') && inGame && !portable;
  button.disabled = current === 'downloading' || current === 'installing';
  button.classList.toggle('waiting', waiting);
  if (current === 'installing') {
    button.textContent = t('updateInstalling');
    button.title = '';
  } else if (current === 'available') {
    button.textContent = fill('updateAvailable', { version });
    button.title = waiting ? t('updateCloseGame') : fill(portable ? 'updatePortableTitle' : 'updateAvailableTitle', { version });
  } else if (current === 'downloading') {
    button.textContent = fill('updateDownloading', { percent: percent || 0 });
    button.title = '';
  } else {
    button.textContent = t(waiting ? 'updateAfterGame' : 'updateReady');
    button.title = waiting ? t('updateCloseGame') : fill('updateReadyTitle', { version });
  }
}

// Ein Klick: herunterladen, dann schließt sich der Launcher und startet in der neuen Version (portable: Download-Seite).
function onClick() {
  if (inGame && !status.portable) { toast(t('updateCloseGame')); return; }
  if (status.status === 'available') return action(async () => { status = await api.downloadUpdate(); render(); });
  if (status.status === 'ready') return action(() => api.installUpdate());
}

export function initUpdater(initialState) {
  inGame = !!initialState?.running;
  $('update-button').onclick = onClick;
  api.on('update-status', next => { status = next || { status: 'idle' }; render(); });
  api.on('game-spawn', () => { inGame = true; render(); });
  api.on('game-exit', ({ runningCount } = {}) => { inGame = runningCount > 0; render(); });
  document.addEventListener('language-change', render);
  action(async () => { status = await api.updateStatus(); render(); });
}
