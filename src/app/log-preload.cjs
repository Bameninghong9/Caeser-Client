const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('logApi', {
  getInitialData: () => ipcRenderer.invoke('log-get-init'),
  selectInstance: (instanceId) => ipcRenderer.invoke('log-select-instance', instanceId),
  stopInstance: (instanceId) => ipcRenderer.invoke('log-stop-instance', instanceId),
  clearInstance: (instanceId) => ipcRenderer.invoke('log-clear-instance', instanceId),
  closeInstance: (instanceId) => ipcRenderer.invoke('log-close-instance', instanceId),
  action: (action) => ipcRenderer.invoke('log-window-action', action),
  clear: () => ipcRenderer.invoke('log-clear'),
  copy: (text) => ipcRenderer.invoke('log-copy', String(text ?? '')),
  on: (channel, callback) => {
    const allowed = [
      'init-logs',
      'game-log',
      'instance-spawn',
      'instance-exit',
      'instance-log-count',
      'language-change',
      'clear-logs',
      'game-spawn',
      'game-exit'
    ];
    if (!allowed.includes(channel)) return;
    const listener = (_, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
