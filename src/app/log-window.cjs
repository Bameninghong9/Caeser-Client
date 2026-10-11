const electron = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

// Die Logs selbst liegen in controller.logs (LogStore). Dort gilt auch das Limit für beendete
// Instanzen (MAX_FINISHED_INSTANCES = 5); der Manager verwaltet nur Fenster und Auswahl.
function createLogWindowManager(controller, deps = electron) {
  const { BrowserWindow, ipcMain } = deps;
  const store = controller.logs;
  let logWin = null;
  let activeInstanceId = null;

  const sendToWindow = (channel, data) => {
    if (logWin && !logWin.isDestroyed()) {
      logWin.webContents.send(channel, data);
    }
  };

  const getActiveInstance = () => {
    if (activeInstanceId && store.has(activeInstanceId)) return store.get(activeInstanceId);
    const latest = store.latestId();
    return latest ? store.get(latest) : null;
  };

  const getInitPayload = () => {
    const active = getActiveInstance();
    return {
      instances: store.list(),
      activeInstanceId: active ? active.id : null,
      logs: active ? [...active.logs] : [],
      profileName: active ? active.profileName : '',
      running: active ? active.status === 'running' : false,
      language: controller.settings?.language || 'de'
    };
  };

  const open = (opts = {}) => {
    if (opts.instanceId && store.has(opts.instanceId)) {
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

  const isOpen = () => Boolean(logWin && !logWin.isDestroyed());

  const handleEmit = (name, data) => {
    if (name === 'game-spawn') {
      const instId = data?.instanceId;
      const inst = instId && store.get(instId);
      if (!inst) return;
      activeInstanceId = instId;
      sendToWindow('instance-spawn', { instance: store.summary(inst), activeInstanceId });
      if (data?.autoOpenLog !== false && controller.settings?.autoOpenLog !== false) {
        open({ instanceId: instId });
      }
    } else if (name === 'game-log') {
      const instId = data?.instanceId;
      if (!instId) return;
      if (instId === activeInstanceId) {
        sendToWindow('game-log', { instanceId: instId, line: data.line || '' });
      } else {
        sendToWindow('instance-log-count', { instanceId: instId, lineCount: store.get(instId)?.logs.length || 0 });
      }
    } else if (name === 'game-exit') {
      // Instanz bleibt mit Status erhalten; das Fenster wird nie automatisch geschlossen.
      const instId = data?.instanceId;
      if (activeInstanceId && !store.has(activeInstanceId)) activeInstanceId = store.latestId();
      const inst = instId && store.get(instId);
      sendToWindow('instance-exit', {
        instanceId: instId,
        instance: inst ? store.summary(inst) : null,
        instances: store.list(),
        activeInstanceId,
        runningCount: data?.runningCount ?? 0
      });
      if (inst && inst.status === 'crashed' && !isOpen() && controller.settings?.autoOpenLog !== false) {
        open({ instanceId: instId });
      }
    } else if (name === 'settings-update') {
      if (data?.language) {
        sendToWindow('language-change', data.language);
      }
    }
  };

  const fromLogWindow = event => Boolean(logWin && event.senderFrame === logWin.webContents.mainFrame);

  // IPC Handlers for the log window
  ipcMain.handle('log-get-init', (event) => {
    if (!fromLogWindow(event)) {
      return { instances: [], activeInstanceId: null, logs: [], language: 'de' };
    }
    return getInitPayload();
  });

  ipcMain.handle('log-select-instance', (event, instanceId) => {
    if (!fromLogWindow(event)) return null;
    const inst = store.get(instanceId);
    if (!inst) return null;
    activeInstanceId = instanceId;
    return {
      instanceId: inst.id,
      profileName: inst.profileName,
      status: inst.status,
      exitCode: inst.exitCode,
      logs: [...inst.logs]
    };
  });

  ipcMain.handle('log-stop-instance', (event, instanceId) => {
    if (!fromLogWindow(event)) return false;
    return controller.stopGame(instanceId);
  });

  ipcMain.handle('log-clear-instance', (event, instanceId) => {
    if (!fromLogWindow(event)) return false;
    const targetId = instanceId || activeInstanceId;
    if (targetId && store.clear(targetId)) {
      sendToWindow('clear-logs', { instanceId: targetId });
      return true;
    }
    return false;
  });

  ipcMain.handle('log-close-instance', (event, instanceId) => {
    if (!fromLogWindow(event)) return false;
    const inst = store.get(instanceId);
    if (!inst) return false;
    if (inst.status === 'running') controller.stopGame(instanceId);
    store.remove(instanceId);
    if (activeInstanceId === instanceId) activeInstanceId = store.latestId();
    sendToWindow('init-logs', getInitPayload());
    return true;
  });

  ipcMain.handle('log-clear', (event) => {
    if (!fromLogWindow(event)) return;
    const active = getActiveInstance();
    if (active) {
      store.clear(active.id);
      sendToWindow('clear-logs', { instanceId: active.id });
    }
  });

  ipcMain.handle('log-copy', (event, text) => {
    if (!fromLogWindow(event)) return false;
    try {
      deps.clipboard.writeText(String(text ?? ''));
      return true;
    } catch {
      return false;
    }
  });

  // Speichert die Zeilen einer Instanz als .txt. Die UI übergibt nur die ID, Pfad kommt aus dem nativen Dialog.
  ipcMain.handle('log-save-instance', async (event, instanceId) => {
    if (!fromLogWindow(event)) return { ok: false, error: 'Zugriff verweigert.' };
    const inst = store.get(instanceId);
    if (!inst) return { ok: false, error: 'Instanz nicht gefunden.' };
    const stamp = new Date(inst.startTime).toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const result = await deps.dialog.showSaveDialog(logWin, {
      title: 'Log speichern',
      defaultPath: `minecraft-log-${stamp}.txt`,
      filters: [{ name: 'Textdatei', extensions: ['txt'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      await fs.writeFile(result.filePath, inst.logs.join('\r\n'), 'utf8');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Log konnte nicht gespeichert werden: ${error.message}` };
    }
  });

  ipcMain.handle('log-window-action', (event, action) => {
    if (!fromLogWindow(event)) return;
    if (action === 'minimize') logWin.minimize();
    else if (action === 'maximize') logWin.isMaximized() ? logWin.unmaximize() : logWin.maximize();
    else if (action === 'close') logWin.close();
  });

  return {
    open,
    handleEmit,
    get activeInstanceId() { return activeInstanceId; },
    get logs() {
      const act = getActiveInstance();
      return act ? [...act.logs] : [];
    },
    get isOpen() { return isOpen(); }
  };
}

module.exports = { createLogWindowManager };
