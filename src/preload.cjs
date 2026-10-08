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
  updateMod: input=>invoke('mod-update',input),
  installCaeserMod: id=>invoke('caeser-mod-install',id),
  setCurseForgeKey: key=>invoke('curseforge-key',key), accountAvatar: id=>invoke('account-avatar',id),
  getSkins: () => invoke('skins-get'), addSkin: input => invoke('skin-add', input),
  removeSkin: id => invoke('skin-remove', id), renameSkin: (id, name) => invoke('skin-rename', { id, name }),
  selectSkin: id => invoke('skin-select', id),
  playerSkinGet: name => invoke('player-skin-get', name),
  pickSkinFile: () => invoke('skin-pick-file'),
  openLogWindow: () => invoke('open-log-window'),
  crashDoctorFix: action => invoke('crash-doctor-fix', action),
  pickWallpaperFile: () => invoke('wallpaper-pick-file'),
  getWallpaper: () => invoke('wallpaper-get'),
  setWallpaper: input => invoke('wallpaper-set', input),
  removeWallpaper: () => invoke('wallpaper-remove'),
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
