const { app, safeStorage, dialog, protocol, clipboard, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Controller } = require('./controller.cjs');
const { createWindow } = require('./window.cjs');
const { createLogWindowManager } = require('./log-window.cjs');
const { register } = require('./ipc.cjs');
const { openLoginWindow } = require('../auth/window.cjs');
const { WALLPAPER_SCHEME } = require('./wallpaper.cjs');
app.setName('Caeser Client');
// Eigenes, eng begrenztes Schema nur für die aktuelle Hintergrunddatei (stream: true für Videos).
protocol.registerSchemesAsPrivileged([{ scheme: WALLPAPER_SCHEME, privileges: { standard: true, secure: true, stream: true } }]);
// Ensure Chromium and Windows aggressively throttle background rendering when other apps/games are running
app.commandLine.appendSwitch('disable-renderer-backgrounding', 'false');
if (process.env.CAESER_TEST_DATA) app.setPath('userData', process.env.CAESER_TEST_DATA);
const SHARE_TEXT = {
  de: { title: 'Log teilen', message: 'Log öffentlich auf mclo.gs hochladen?', detail: 'Das Log wird öffentlich auf mclo.gs hochgeladen. Jeder mit dem Link kann es lesen. Tokens, Benutzername, IP- und E-Mail-Adressen werden vorher entfernt.', upload: 'Hochladen', cancel: 'Abbrechen', remember: 'Nicht erneut fragen' },
  en: { title: 'Share log', message: 'Upload the log publicly to mclo.gs?', detail: 'The log will be uploaded publicly to mclo.gs. Anyone with the link can read it. Tokens, user name, IP and email addresses are removed beforehand.', upload: 'Upload', cancel: 'Cancel', remember: 'Do not ask again' }
};
// Nativer Einwilligungsdialog vor dem ersten Upload pro Sitzung
async function confirmShare(parent, language) {
  const text = SHARE_TEXT[language === 'en' ? 'en' : 'de'];
  const options = { type: 'question', title: text.title, message: text.message, detail: text.detail, buttons: [text.upload, text.cancel], defaultId: 0, cancelId: 1, noLink: true, checkboxLabel: text.remember };
  const result = parent && !parent.isDestroyed() ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  return { ok: result.response === 0, remember: result.checkboxChecked };
}
let win;
let logManager;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    const controller = new Controller({ directory: app.getPath('userData'), encryption: safeStorage,
      resources: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../resources'), appVersion: app.getVersion(),
      openBrowser: (url, callbacks) => openLoginWindow(win, url, callbacks), confirmShare,
      writeClipboard: text => clipboard.writeText(text), openExternal: url => shell.openExternal(url), emit: (name, data) => {
        if (win && !win.isDestroyed()) win.webContents.send(name, data);
        if (logManager) logManager.handleEmit(name, data);
      } });
    await controller.load();
    app.once('will-quit', () => { controller.bridge.stop().catch(() => {}); }); // Account-Brücke beim Beenden schließen
    protocol.handle(WALLPAPER_SCHEME, request => controller.serveWallpaper(request));
    logManager = createLogWindowManager(controller);
    win = createWindow(controller, logManager);
    const page = path.join(__dirname, '../../ui/index.html'); register(controller, win, pathToFileURL(page).href, logManager); await win.loadFile(page);
  }).catch(error => { dialog.showErrorBox('Caeser Client', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
