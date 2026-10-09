const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

function createLogWindowManager(controller) {
  let logWin = null;
  const logs = [];
  let isRunning = false;
  let activeProfile = '';

  const sendToWindow = (channel, data) => {
    if (logWin && !logWin.isDestroyed()) {
      logWin.webContents.send(channel, data);
    }
  };

  const open = (opts = {}) => {
    if (opts.profileName) activeProfile = opts.profileName;
    if (logWin && !logWin.isDestroyed()) {
      if (logWin.isMinimized()) logWin.restore();
      logWin.show();
      logWin.focus();
      sendToWindow('init-logs', { logs, profileName: activeProfile, running: isRunning });
      return logWin;
    }

    logWin = new BrowserWindow({
      width: 880,
      height: 580,
      minWidth: 540,
      minHeight: 360,
      frame: false,
      show: false,
      backgroundColor: '#0d0b13',
      icon: path.join(__dirname, '../../resources/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'log-preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: true,
        spellcheck: false
      }
    });

    logWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    logWin.webContents.on('will-navigate', event => event.preventDefault());

    logWin.once('ready-to-show', () => {
      logWin.show();
      sendToWindow('init-logs', { logs, profileName: activeProfile, running: isRunning });
    });

    logWin.on('closed', () => {
      logWin = null;
    });

    const page = path.join(__dirname, '../../ui/log-window.html');
    logWin.loadFile(page);
    return logWin;
  };

  const handleEmit = (name, data) => {
    if (name === 'game-log') {
      logs.push(data);
      if (logs.length > 2500) logs.shift();
      sendToWindow('game-log', data);
    } else if (name === 'game-spawn') {
      isRunning = true;
      if (data?.profileName) activeProfile = data.profileName;
      sendToWindow('game-spawn', { profileName: activeProfile });
      if (data?.autoOpenLog !== false && controller.settings.autoOpenLog !== false) {
        open({ profileName: activeProfile });
      }
    } else if (name === 'game-exit') {
      isRunning = false;
      sendToWindow('game-exit', data);
    }
  };

  // IPC Handlers for the log window
  ipcMain.handle('log-get-init', (event) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) {
      return { logs: [], profileName: '', running: false };
    }
    return { logs, profileName: activeProfile, running: isRunning };
  });

  ipcMain.handle('log-copy', (event, text) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) return false;
    try {
      const { clipboard } = require('electron');
      clipboard.writeText(String(text ?? ''));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('log-window-action', (event, action) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) return;
    if (action === 'minimize') logWin.minimize();
    else if (action === 'maximize') logWin.isMaximized() ? logWin.unmaximize() : logWin.maximize();
    else if (action === 'close') logWin.close();
  });

  ipcMain.handle('log-clear', (event) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) return;
    logs.length = 0;
    sendToWindow('clear-logs');
  });

  return {
    open,
    handleEmit,
    get logs() { return logs; },
    get isOpen() { return Boolean(logWin && !logWin.isDestroyed()); }
  };
}

module.exports = { createLogWindowManager };
