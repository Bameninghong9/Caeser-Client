const { ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const launcher = require('../game/launcher.cjs');
const { instanceKey } = require('../data/profiles.cjs');
const { inside } = require('../shared/net.cjs');
const { avatar } = require('../auth/avatar.cjs');
const { createCapesHandlers } = require('./capes-ipc.cjs');
function register(controller, win, pageURL, logManager) {
  const handle = (name, fn) => ipcMain.handle(name, async (event, value) => {
    if (event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== pageURL) throw new Error('Zugriff verweigert.');
    try { return { ok: true, data: await fn(value) }; }
    catch (error) { return { ok: false, error: error.name === 'AbortError' ? 'Anmeldung abgebrochen.' : error.message }; }
  });
  handle('state', () => controller.state()); handle('versions', () => launcher.manifest(controller.root));
  handle('settings', patch => controller.updateSettings(patch)); handle('profile-save', input => controller.saveProfile(input));
  handle('profile-details',id=>controller.mods.details(id));
  handle('mod-search',input=>controller.mods.search(input));
  handle('mod-install',input=>controller.mods.install(input));
  handle('mod-toggle',input=>controller.mods.toggle(input));
  handle('mod-remove',input=>controller.mods.remove(input));
  handle('mod-check-updates',id=>controller.mods.checkUpdates(id));
  handle('mod-update',input=>controller.mods.update(input));
  handle('mod-update-all',id=>controller.mods.updateAll({ profileId: id }));
  handle('caeser-mod-install',id=>controller.installCaeserMod(id));
  handle('account-avatar',async id=>{ const account=controller.accounts.find(a=>a.id === id); return account ? avatar(account) : null; });
  handle('skins-get', () => controller.getSkins());
  handle('skin-add', input => controller.addSkin(input));
  handle('skin-remove', id => controller.removeSkin(id));
  handle('skin-rename', input => controller.renameSkin(input.id, input.name, input.variant));
  handle('skin-select', input => {
    if (input && typeof input === 'object') return controller.selectSkin(input.id, input.variant);
    return controller.selectSkin(input);
  });
  handle('skin-upload-account', input => {
    if (input && typeof input === 'object') return controller.uploadSkinToAccount(input.id, input.variant);
    return controller.uploadSkinToAccount(input);
  });
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
    const baseName = path.basename(filePath, path.extname(filePath));
    // Größe, Format und Pixelmaße prüft addSkin über validateSkinDataUrl.
    const data = nativeImage.createFromBuffer(buffer).toDataURL();
    return controller.addSkin({ name: baseName, data });
  });
  // Capes: Eingaben werden in capes-ipc.cjs geprüft, Backend- und Mojang-Aufrufe laufen über controller.caeserApi
  for (const [name, fn] of Object.entries(createCapesHandlers({ controller, dialog, window: win }))) handle(name, fn);
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
  // Log teilen: nur Instanz-ID bzw. mclo.gs-ID, niemals Inhalt oder URL aus der UI
  handle('log-share', id => controller.shareLog(id, { window: win }));
  handle('log-share-open', id => controller.openSharedLog(id));
  handle('wallpaper-pick-file', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Hintergrund auswählen (Bild, GIF, Video)',
      properties: ['openFile'],
      filters: [{ name: 'Hintergründe (*.png, *.jpg, *.jpeg, *.webp, *.gif, *.webm, *.mp4)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'mp4'] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    return controller.importWallpaper(filePath, path.basename(filePath));
  });
  handle('wallpaper-get', () => controller.getWallpaper());
  handle('wallpaper-set', input => controller.setWallpaper(input));
  handle('wallpaper-remove', () => controller.removeWallpaper());
  handle('screenshots-get', () => controller.getScreenshots());
  handle('screenshot-get-full', id => controller.getScreenshotFull(id));
  handle('screenshot-copy', id => controller.copyScreenshot(id));
  handle('screenshot-open', id => controller.openScreenshot(id));
  handle('screenshot-delete', id => controller.deleteScreenshot(id));
  handle('screenshots-delete-all', () => controller.deleteAllScreenshots());
  handle('screenshot-rename', input => controller.renameScreenshot(input?.id, input?.newName));
  handle('screenshots-open-folder', () => controller.openScreenshotsFolder());
  handle('open', async target => {
    const links = { approval: 'https://help.minecraft.net/hc/en-us/articles/16254801392141' };
    if (target === 'folder') { await fs.mkdir(controller.root, { recursive: true }); const error = await shell.openPath(controller.root); if (error) throw new Error(error); }
    else if (links[target]) await shell.openExternal(links[target]); else throw new Error('Unbekanntes Ziel.');
  });
  handle('window', action => {
    if (action === 'minimize') win.minimize(); if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize(); if (action === 'close') win.close();
  });
}
module.exports = { register };
