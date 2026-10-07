const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('logApi', {
  getInitialData: () => ipcRenderer.invoke('log-get-init'),
  action: action => ipcRenderer.invoke('log-window-action', action),
  clear: () => ipcRenderer.invoke('log-clear'),
  copy: text => ipcRenderer.invoke('log-copy', String(text)),
  on: (channel, callback) => {
    if (!['init-logs', 'game-log', 'game-spawn', 'game-exit', 'clear-logs'].includes(channel)) return;
    const listener = (_, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
