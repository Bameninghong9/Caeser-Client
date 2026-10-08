const { ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const launcher = require('../game/launcher.cjs');
const { instanceKey } = require('../data/profiles.cjs');
const { inside } = require('../shared/net.cjs');
const { avatar } = require('../auth/avatar.cjs');
function register(controller, win, pageURL, logManager) {
  const handle = (name, fn) => ipcMain.handle(name, async (event, value) => {
    if (event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== pageURL) throw new Error('Zugriff verweigert.');
    try { return { ok: true, data: await fn(value) }; }
    catch (error) { return { ok: false, error: error.name === 'AbortError' ? 'Anmeldung abgebrochen.' : error.message }; }
  });
  handle('state', () => controller.state()); handle('versions', () => launcher.manifest(controller.root));
  handle('settings', patch => controller.updateSettings(patch)); handle('profile-save', input => controller.saveProfile(input));
  handle('curseforge-key',key=>controller.setCurseForgeKey(key));
  handle('profile-details',id=>controller.mods.details(id));
  handle('mod-search',input=>controller.mods.search(input));
  handle('mod-install',input=>controller.mods.install(input));
  handle('mod-toggle',input=>controller.mods.toggle(input));
  handle('mod-remove',input=>controller.mods.remove(input));
  handle('mod-check-updates',id=>controller.mods.checkUpdates(id));
  handle('mod-update',input=>controller.mods.update(input));
  handle('caeser-mod-install',id=>controller.installCaeserMod(id));
  handle('account-avatar',async id=>{ const account=controller.accounts.find(a=>a.id === id); return account ? avatar(account) : null; });
  handle('skins-get', () => controller.getSkins());
  handle('skin-add', input => controller.addSkin(input));
  handle('skin-remove', id => controller.removeSkin(id));
  handle('skin-rename', input => controller.renameSkin(input.id, input.name));
  handle('skin-select', id => controller.selectSkin(id));
  handle('player-skin-get', name => controller.fetchPlayerSkin(name));
  handle('skin-pick-file', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Minecraft-Skin auswählen',
      properties: ['openFile'],
      filters: [{ name: 'Minecraft Skins (*.png)', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    const buffer = await fs.readFile(filePath);
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromBuffer(buffer);
    const size = img.getSize();
    if (size.width !== 64 || ![32, 64].includes(size.height)) {
      throw new Error('Minecraft-Skins müssen 64x64 oder 64x32 Pixel groß sein.');
    }
    const baseName = path.basename(filePath, path.extname(filePath));
    const data = img.toDataURL();
    return controller.addSkin({ name: baseName, data });
  });
  handle('profile-select', async id => { await controller.profiles.select(id); return controller.state(); });
  handle('profile-remove', async id => {
    if (controller.busy || controller.game || controller.mods.busy) throw new Error('Bitte zuerst Minecraft und laufende Mod-Downloads beenden.');
    await controller.profiles.remove(id); return controller.state();
  });
  handle('profile-folder', async id => {
    const profile = controller.profiles.data.profiles.find(p => p.id === id); if (!profile) throw new Error('Profil nicht gefunden.');
    const folder = inside(path.join(controller.root, 'instances'), instanceKey(profile));
    await fs.mkdir(folder, { recursive: true }); const error = await shell.openPath(folder); if (error) throw new Error(error);
  });
  handle('pick-java', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Java auswählen', properties: ['openFile'], filters: [{ name: 'Java', extensions: ['exe'] }] });
    if (!result.canceled) { controller.settings.javaPath = result.filePaths[0]; await controller.saveSettings(); }
    return controller.state();
  });
  handle('login', () => controller.login()); handle('cancel-login', () => controller.loginController?.abort());
  handle('remove-account', id => controller.removeAccount(id)); handle('launch', () => controller.launch());
  handle('open-log-window', () => {
    if (logManager) {
      const profile = controller.profiles.selected();
      logManager.open({ profileName: profile?.name || 'Minecraft' });
    }
    return true;
  });
  handle('crash-doctor-fix', action => controller.autoFixCrash(action));
  handle('wallpaper-pick-file', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Hintergrund auswählen (Bild, GIF, Video)',
      properties: ['openFile'],
      filters: [{ name: 'Hintergründe (*.png, *.jpg, *.jpeg, *.webp, *.gif, *.webm, *.mp4)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'mp4'] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const buffer = await fs.readFile(filePath);
    const isVideo = ['mp4', 'webm'].includes(ext);
    const mimeType = isVideo ? (ext === 'mp4' ? 'video/mp4' : 'video/webm') : (ext === 'gif' ? 'image/gif' : (ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg')));
    const data = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const baseName = path.basename(filePath);
    return controller.setWallpaper({
      data,
      type: isVideo ? 'video' : 'image',
      name: baseName
    });
  });
  handle('wallpaper-get', () => controller.getWallpaper());
  handle('wallpaper-set', input => controller.setWallpaper(input));
  handle('wallpaper-remove', () => controller.removeWallpaper());
  handle('open', async target => {
    const links = { azure: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', approval: 'https://help.minecraft.net/hc/en-us/articles/16254801392141' };
    if (target === 'folder') { await fs.mkdir(controller.root, { recursive: true }); const error = await shell.openPath(controller.root); if (error) throw new Error(error); }
    else if (links[target]) await shell.openExternal(links[target]); else throw new Error('Unbekanntes Ziel.');
  });
  handle('window', action => {
    if (action === 'minimize') win.minimize(); if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize(); if (action === 'close') win.close();
  });
}
module.exports = { register };
