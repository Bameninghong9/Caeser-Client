const { app, safeStorage, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Controller } = require('./controller.cjs');
const { createWindow } = require('./window.cjs');
const { createLogWindowManager } = require('./log-window.cjs');
const { register } = require('./ipc.cjs');
const { openLoginWindow } = require('../auth/window.cjs');
app.setName('Caeser Client');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
if (process.env.CAESER_TEST_DATA) app.setPath('userData', process.env.CAESER_TEST_DATA);
let win;
let logManager;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    const controller = new Controller({ directory: app.getPath('userData'), encryption: safeStorage,
      resources: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../resources'), appVersion: app.getVersion(),
      openBrowser: (url, callbacks) => openLoginWindow(win, url, callbacks), emit: (name, data) => {
        if (win && !win.isDestroyed()) win.webContents.send(name, data);
        if (logManager) logManager.handleEmit(name, data);
      } });
    await controller.load();
    logManager = createLogWindowManager(controller);
    win = createWindow(controller, logManager);
    const page = path.join(__dirname, '../../ui/index.html'); register(controller, win, pathToFileURL(page).href, logManager); await win.loadFile(page);
  }).catch(error => { dialog.showErrorBox('Caeser Client', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
