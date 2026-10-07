const { BrowserWindow, dialog } = require('electron');
const path = require('node:path');
function createWindow(controller) {
  const win = new BrowserWindow({ width: 1180, height: 800, minWidth: 940, minHeight: 690, frame: false, show: false,
    backgroundColor: '#101014', icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: { preload: path.join(__dirname, '../preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: true, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', event => event.preventDefault());
  win.once('ready-to-show', () => { win.show(); if (controller.notice) win.webContents.send('notice', controller.notice); });
  if (controller.emit) {
    const origEmit = controller.emit;
    controller.emit = (name, data) => {
      if (name === 'game-spawn') {
        if (!win.isDestroyed() && !win.isMinimized()) win.minimize();
      } else if (name === 'game-exit') {
        if (!win.isDestroyed() && win.isMinimized()) { win.restore(); win.focus(); }
      }
      origEmit(name, data);
    };
  }
  win.on('close', event => {
    if (controller.busy || controller.game || controller.mods.busy) {
      event.preventDefault(); dialog.showMessageBox(win, { type: 'info', title: 'Caeser Client', message: controller.busy || controller.mods.busy ? 'Ein Download läuft. Bitte warte, bis der Vorgang abgeschlossen ist.' : 'Bitte beende Minecraft, bevor du den Launcher schließt.', buttons: ['Verstanden'] });
    } else controller.loginController?.abort();
  }); return win;
}
module.exports = { createWindow };
