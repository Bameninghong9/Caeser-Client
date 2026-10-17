// Launcher-Updates nur auf Wunsch: im Hintergrund wird lediglich geprüft, ob es eine neue Version gibt.
// Ein Klick auf den Update-Button in der Titelleiste lädt das Update, schließt den Launcher und startet die neue Version.
// Die Releases liegen in einem eigenen, öffentlichen Repo, damit das Code-Repo privat sein darf.
const RELEASES_URL = 'https://github.com/Bameninghong9/Caeser-Client-Releases/releases/latest';
const FIRST_CHECK_DELAY = 5000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

// status: 'idle' (nichts zu tun) | 'available' | 'downloading' | 'ready' (geladen, wartet auf Spielende) | 'installing'
function createUpdater({ autoUpdater, enabled, portable = false, controller, emit = () => {}, openExternal, log = console,
  firstCheckDelay = FIRST_CHECK_DELAY, checkInterval = CHECK_INTERVAL } = {}) {
  let state = { status: 'idle', version: null, percent: 0, portable };
  let timers = [];
  const set = patch => { state = { ...state, ...patch }; emit('update-status', state); };

  if (enabled) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('update-available', info => {
      if (state.status === 'idle') set({ status: 'available', version: info?.version || null, percent: 0 });
    });
    autoUpdater.on('download-progress', progress => {
      if (state.status === 'downloading') set({ percent: Math.max(0, Math.min(100, Math.round(progress?.percent || 0))) });
    });
    autoUpdater.on('update-downloaded', info => set({ status: 'ready', version: info?.version || state.version, percent: 100 }));
  }

  // Fehler beim reinen Prüfen (z. B. offline) bleiben still; der Button erscheint dann einfach nicht.
  async function check() {
    if (!enabled || state.status !== 'idle') return state;
    try { await autoUpdater.checkForUpdates(); }
    catch (error) { log.warn?.(`Update-Prüfung fehlgeschlagen: ${error?.message || error}`); }
    return state;
  }
  function start() {
    if (!enabled) return;
    timers.push(setTimeout(check, firstCheckDelay), setInterval(check, checkInterval));
    timers.forEach(timer => timer.unref?.());
  }
  function stop() { timers.forEach(timer => { clearTimeout(timer); clearInterval(timer); }); timers = []; }

  async function download() {
    if (state.status !== 'available') throw new Error('Es ist kein Update verfügbar.');
    // Die portable Version kann sich nicht selbst ersetzen: Download-Seite öffnen.
    if (portable) { await openExternal(RELEASES_URL); return state; }
    if (blocked()) throw new Error('Bitte beende zuerst Minecraft und laufende Downloads.');
    set({ status: 'downloading', percent: 0 });
    try { await autoUpdater.downloadUpdate(); }
    catch (error) {
      set({ status: 'available', percent: 0 });
      throw new Error(`Das Update konnte nicht heruntergeladen werden: ${error?.message || error}`);
    }
    // Ein Klick genügt: direkt installieren und neu starten. Wurde inzwischen Minecraft gestartet,
    // bleibt das Update bereit ('ready') und wird über den Button nachgeholt.
    if (state.status === 'ready' && !blocked()) install();
    return state;
  }
  function blocked() { return !!(controller.game || controller.busy || controller.mods?.busy); }
  function install() {
    if (state.status !== 'ready') throw new Error('Das Update ist noch nicht heruntergeladen.');
    if (blocked()) throw new Error('Bitte beende zuerst Minecraft und laufende Downloads.');
    set({ status: 'installing' });
    stop();
    // still installieren (bisheriger Installationsordner) und danach neu starten
    autoUpdater.quitAndInstall(true, true);
    return state;
  }
  return { status: () => state, check, start, stop, download, install };
}
module.exports = { createUpdater, RELEASES_URL };
