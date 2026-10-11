const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, payload) => {
  const result = await ipcRenderer.invoke(channel, payload);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};
contextBridge.exposeInMainWorld('caeser', {
  state: () => invoke('state'), versions: () => invoke('versions'),
  saveProfile: input => invoke('profile-save', input), selectProfile: id => invoke('profile-select', id),
  removeProfile: id => invoke('profile-remove', id), profileFolder: id => invoke('profile-folder', id),
  profileDetails: id=>invoke('profile-details',id), searchMods: input=>invoke('mod-search',input),
  installMod: input=>invoke('mod-install',input), toggleMod: input=>invoke('mod-toggle',input),
  removeMod: input=>invoke('mod-remove',input), checkModUpdates: id=>invoke('mod-check-updates',id),
  updateMod: input=>invoke('mod-update',input), updateAllMods: id=>invoke('mod-update-all',id),
  installCaeserMod: id=>invoke('caeser-mod-install',id),
  accountAvatar: id=>invoke('account-avatar',id),
  getSkins: () => invoke('skins-get'), addSkin: input => invoke('skin-add', input),
  removeSkin: id => invoke('skin-remove', id), renameSkin: (id, name, variant) => invoke('skin-rename', typeof id === 'object' ? id : { id, name, variant }),
  selectSkin: (id, variant) => invoke('skin-select', typeof id === 'object' ? id : { id, variant }),
  uploadSkinToAccount: (id, variant) => invoke('skin-upload-account', typeof id === 'object' ? id : { id, variant }),
  playerSkinGet: name => invoke('player-skin-get', name),
  pickSkinFile: () => invoke('skin-pick-file'),
  openLogWindow: () => invoke('open-log-window'),
  crashDoctorFix: action => invoke('crash-doctor-fix', action),
  shareLog: instanceId => invoke('log-share', instanceId),
  openSharedLog: id => invoke('log-share-open', id),
  pickWallpaperFile: () => invoke('wallpaper-pick-file'),
  getWallpaper: () => invoke('wallpaper-get'),
  setWallpaper: input => invoke('wallpaper-set', input),
  removeWallpaper: () => invoke('wallpaper-remove'),
  getScreenshots: () => invoke('screenshots-get'),
  getScreenshotFull: id => invoke('screenshot-get-full', id),
  copyScreenshot: id => invoke('screenshot-copy', id),
  openScreenshot: id => invoke('screenshot-open', id),
  deleteScreenshot: id => invoke('screenshot-delete', id),
  deleteAllScreenshots: () => invoke('screenshots-delete-all'),
  renameScreenshot: (id, newName) => invoke('screenshot-rename', { id, newName }),
  openScreenshotsFolder: () => invoke('screenshots-open-folder'),
  settings: patch => invoke('settings', patch),
  updateSettings: patch => invoke('settings', patch),
  pickJava: () => invoke('pick-java'),
  login: () => invoke('login'), cancelLogin: () => invoke('cancel-login'),
  removeAccount: id => invoke('remove-account', id), open: target => invoke('open', target),
  launch: () => invoke('launch'), window: action => invoke('window', action),
  on: (channel, callback) => {
    if (!['auth-finished','progress','game-log','game-exit','game-spawn','notice','mod-progress'].includes(channel)) return;
    const listener = (_, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
