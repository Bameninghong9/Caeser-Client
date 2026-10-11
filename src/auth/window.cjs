const { BrowserWindow } = require('electron');
const { randomUUID } = require('node:crypto');

function allowedNavigation(value, redirectUri) {
  try {
    const url = new URL(value), redirect = new URL(redirectUri);
    if (url.origin === redirect.origin && url.pathname === redirect.pathname) return true;
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['microsoftonline.com', 'live.com', 'microsoft.com', 'xbox.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

// Remote Microsoft content has no preload, Node access or launcher IPC.
// foreground: Anmeldung aus dem Spiel heraus. Das Hauptfenster ist dann minimiert und ein Kindfenster bliebe
// unter Windows unsichtbar, daher ohne parent öffnen und kurz in den Vordergrund holen.
function openLoginWindow(parent, url, { cancel, fail, onNavigate, foreground = false, redirectUri = new URL(url).searchParams.get('redirect_uri') }) {
  const win = new BrowserWindow({ ...(foreground ? {} : { parent }), width: 540, height: 740, minWidth: 480, minHeight: 620,
    title: 'Microsoft-Anmeldung – Caeser Client', show: false, autoHideMenuBar: true, backgroundColor: '#ffffff',
    webPreferences: { partition: `microsoft-login-${randomUUID()}`, sandbox: true, contextIsolation: true,
      nodeIntegration: false, webSecurity: true, devTools: false, spellcheck: false } });
  win.removeMenu();
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.session.on('will-download', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const navigation = (event, target) => {
    if (onNavigate?.(target)) { event.preventDefault(); return; }
    if (!allowedNavigation(target, redirectUri)) {
      event.preventDefault(); fail(new Error('Diese Weiterleitung wird im Anmeldefenster nicht unterstützt.'));
    }
  };
  win.webContents.on('will-navigate', navigation);
  win.webContents.on('will-redirect', navigation);
  win.on('page-title-updated', event => event.preventDefault());
  let closing = false;
  win.once('closed', () => { if (!closing) cancel(); });
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.show(); win.focus();
    if (foreground) { win.setAlwaysOnTop(true); setTimeout(() => { if (!win.isDestroyed()) win.setAlwaysOnTop(false); }, 1500); }
  });
  win.loadURL(url).catch(() => {
    if (!closing && !win.isDestroyed()) fail(new Error('Microsoft konnte nicht geladen werden. Prüfe deine Internetverbindung und versuche es erneut.'));
  });
  // Bei foreground bleibt das Hauptfenster minimiert (kein focus auf den Launcher).
  return () => { closing = true; if (!win.isDestroyed()) win.destroy(); if (!foreground && parent && !parent.isDestroyed()) parent.focus(); };
}
module.exports = { openLoginWindow, allowedNavigation };
