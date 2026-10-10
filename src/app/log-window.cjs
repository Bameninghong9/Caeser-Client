const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

function createLogWindowManager(controller) {
  let logWin = null;
  const instances = new Map();
  let activeInstanceId = null;

  const sendToWindow = (channel, data) => {
    if (logWin && !logWin.isDestroyed()) {
      logWin.webContents.send(channel, data);
    }
  };

  const getActiveInstance = () => {
    if (activeInstanceId && instances.has(activeInstanceId)) {
      return instances.get(activeInstanceId);
    }
    const arr = Array.from(instances.values());
    return arr.length ? arr[arr.length - 1] : null;
  };

  const getInitPayload = () => {
    const instList = Array.from(instances.values()).map(i => ({
      id: i.id,
      profileId: i.profileId,
      profileName: i.profileName,
      profileIcon: i.profileIcon,
      profileVersion: i.profileVersion,
      profileMode: i.profileMode,
      accountName: i.accountName,
      startTime: i.startTime,
      endTime: i.endTime,
      status: i.status,
      exitCode: i.exitCode,
      lineCount: i.logs ? i.logs.length : 0
    }));
    const active = getActiveInstance();
    return {
      instances: instList,
      activeInstanceId: active ? active.id : null,
      logs: active && active.logs ? active.logs : [],
      profileName: active ? active.profileName : '',
      running: active ? active.status === 'running' : false,
      language: controller.settings?.language || 'de'
    };
  };

  const open = (opts = {}) => {
    if (opts.instanceId && instances.has(opts.instanceId)) {
      activeInstanceId = opts.instanceId;
    }
    if (logWin && !logWin.isDestroyed()) {
      if (logWin.isMinimized()) logWin.restore();
      logWin.show();
      logWin.focus();
      sendToWindow('init-logs', getInitPayload());
      return logWin;
    }

    logWin = new BrowserWindow({
      width: 960,
      height: 600,
      minWidth: 640,
      minHeight: 400,
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
      sendToWindow('init-logs', getInitPayload());
    });

    logWin.on('closed', () => {
      logWin = null;
    });

    const page = path.join(__dirname, '../../ui/log-window.html');
    logWin.loadFile(page);
    return logWin;
  };

  const handleEmit = (name, data) => {
    if (name === 'game-spawn') {
      const instId = data?.instanceId || ('inst_' + Date.now());
      const instData = {
        id: instId,
        profileId: data?.instance?.profileId || '',
        profileName: data?.profileName || data?.instance?.profileName || 'Minecraft',
        profileIcon: data?.instance?.profileIcon || null,
        profileVersion: data?.instance?.profileVersion || '',
        profileMode: data?.instance?.profileMode || 'vanilla',
        accountName: data?.instance?.accountName || 'Player',
        startTime: data?.instance?.startTime || Date.now(),
        endTime: null,
        status: 'running',
        exitCode: null,
        logs: []
      };
      instances.set(instId, instData);
      activeInstanceId = instId;

      sendToWindow('instance-spawn', {
        instance: {
          id: instData.id,
          profileId: instData.profileId,
          profileName: instData.profileName,
          profileIcon: instData.profileIcon,
          profileVersion: instData.profileVersion,
          profileMode: instData.profileMode,
          accountName: instData.accountName,
          startTime: instData.startTime,
          status: 'running',
          lineCount: 0
        },
        activeInstanceId
      });

      if (data?.autoOpenLog !== false && controller.settings?.autoOpenLog !== false) {
        open({ instanceId: instId });
      }
    } else if (name === 'game-log') {
      let instId = activeInstanceId;
      let lineText = '';
      if (typeof data === 'string') {
        lineText = data;
      } else if (data && typeof data === 'object') {
        lineText = data.line || '';
        if (data.instanceId) instId = data.instanceId;
      }

      if (!instId) {
        instId = 'default_inst';
        if (!instances.has(instId)) {
          instances.set(instId, {
            id: instId,
            profileName: data?.profileName || 'Minecraft',
            accountName: 'Player',
            startTime: Date.now(),
            status: 'running',
            logs: []
          });
          activeInstanceId = instId;
        }
      }

      const inst = instances.get(instId);
      if (inst) {
        inst.logs.push(lineText);
        if (inst.logs.length > 3000) inst.logs.shift();
      }

      if (instId === activeInstanceId) {
        sendToWindow('game-log', { instanceId: instId, line: lineText });
      } else {
        sendToWindow('instance-log-count', { instanceId: instId, lineCount: inst ? inst.logs.length : 0 });
      }
    } else if (name === 'game-exit') {
      const instId = data?.instanceId || activeInstanceId;
      if (instId && instances.has(instId)) {
        instances.delete(instId);
      }

      const runningCount = data?.runningCount ?? 0;
      if (runningCount <= 0 || instances.size === 0) {
        instances.clear();
        activeInstanceId = null;
        if (logWin && !logWin.isDestroyed()) {
          logWin.close();
        }
      } else {
        if (activeInstanceId === instId) {
          const remaining = Array.from(instances.keys());
          activeInstanceId = remaining.length ? remaining[remaining.length - 1] : null;
        }
        sendToWindow('init-logs', getInitPayload());
      }
    } else if (name === 'settings-update') {
      if (data?.language) {
        sendToWindow('language-change', data.language);
      }
    }
  };

  // IPC Handlers for the log window
  ipcMain.handle('log-get-init', (event) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) {
      return { instances: [], activeInstanceId: null, logs: [], language: 'de' };
    }
    return getInitPayload();
  });

  ipcMain.handle('log-select-instance', (event, instanceId) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) return null;
    if (instances.has(instanceId)) {
      activeInstanceId = instanceId;
      const inst = instances.get(instanceId);
      return {
        instanceId: inst.id,
        profileName: inst.profileName,
        status: inst.status,
        exitCode: inst.exitCode,
        logs: inst.logs
      };
    }
    return null;
  });

  ipcMain.handle('log-stop-instance', (event, instanceId) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) return false;
    return controller.stopGame(instanceId);
  });

  ipcMain.handle('log-clear-instance', (event, instanceId) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) return false;
    const targetId = instanceId || activeInstanceId;
    if (targetId && instances.has(targetId)) {
      instances.get(targetId).logs = [];
      sendToWindow('clear-logs', { instanceId: targetId });
      return true;
    }
    return false;
  });

  ipcMain.handle('log-close-instance', (event, instanceId) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) return false;
    if (instances.has(instanceId)) {
      const inst = instances.get(instanceId);
      if (inst.status === 'running') {
        controller.stopGame(instanceId);
      }
      instances.delete(instanceId);
      if (activeInstanceId === instanceId) {
        const remaining = Array.from(instances.keys());
        activeInstanceId = remaining.length ? remaining[remaining.length - 1] : null;
      }
      sendToWindow('init-logs', getInitPayload());
      return true;
    }
    return false;
  });

  ipcMain.handle('log-clear', (event) => {
    if (!logWin || event.senderFrame !== logWin.webContents.mainFrame) return;
    const active = getActiveInstance();
    if (active) {
      active.logs = [];
      sendToWindow('clear-logs', { instanceId: active.id });
    }
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

  return {
    open,
    handleEmit,
    get logs() {
      const act = getActiveInstance();
      return act ? act.logs : [];
    },
    get isOpen() { return Boolean(logWin && !logWin.isDestroyed()); }
  };
}

module.exports = { createLogWindowManager };
