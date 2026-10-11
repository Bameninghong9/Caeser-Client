const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const auth = require('../src/auth/microsoft.cjs');
const launcher = require('../src/game/launcher.cjs');
const { Controller } = require('../src/app/controller.cjs');

const SKIN_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAT0lEQVR42u3BAQEAAACAkP6v7ggKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA1wEAAAe352X0AAAAASUVORK5CYII=';
const fakeEncryption = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-skin-upload-'));
  const original = { refresh: auth.refresh, prepare: launcher.prepare, start: launcher.start, fetch: globalThis.fetch };
  const uploads = [], notices = [];
  auth.refresh = async account => account;
  launcher.prepare = async () => ({ instance: dir });
  launcher.start = () => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 1;
    setImmediate(() => { child.emit('spawn'); setImmediate(() => child.emit('close', 0)); });
    return child;
  };
  globalThis.fetch = async (url, options = {}) => {
    uploads.push({ url: String(url), method: options.method });
    return new Response(JSON.stringify({ skins: [{ state: 'ACTIVE', url: 'https://textures.minecraft.net/texture/x' }] }), { status: 200 });
  };
  const controller = new Controller({ directory: dir, encryption: fakeEncryption, resources: dir, appVersion: 'test', openBrowser: () => {},
    emit: (name, data) => { if (name === 'notice') notices.push(data); } });
  await controller.load();
  controller.discordRpc.setActivity = () => {}; controller.discordRpc.setEnabled = () => {};
  controller.accounts = [{ id: 'acc-1', name: 'Spieler', accessToken: 'token', refreshToken: 'refresh' }];
  controller.settings.activeAccount = 'acc-1';
  t.after(async () => {
    Object.assign(auth, { refresh: original.refresh }); Object.assign(launcher, { prepare: original.prepare, start: original.start });
    globalThis.fetch = original.fetch; controller.destroy();
    await new Promise(r => setTimeout(r, 50));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const launch = async () => { await controller.launch(); await new Promise(r => setTimeout(r, 20)); };
  return { controller, uploads, notices, launch };
}
const skinPosts = uploads => uploads.filter(u => u.method === 'POST' && u.url.endsWith('/minecraft/profile/skins'));

test('Zwei Starts ohne Skinwechsel laden den Skin nur einmal hoch', async t => {
  const { controller, uploads, launch } = await setup(t);
  await controller.addSkin({ name: 'A', data: SKIN_A });
  await launch(); await launch();
  assert.equal(skinPosts(uploads).length, 1);
  assert.equal(controller.settings.skinUploads['acc-1'].skinId, controller.settings.activeSkinId);
});

test('Skinwechsel führt beim nächsten Start zu genau einem Upload', async t => {
  const { controller, uploads, launch } = await setup(t);
  const first = await controller.addSkin({ name: 'A', data: SKIN_A });
  await launch();
  await controller.addSkin({ name: 'B', data: SKIN_A });
  await launch(); await launch();
  assert.equal(skinPosts(uploads).length, 2);
  // Zurück zum ersten Skin: wieder ein Upload
  await controller.updateSettings({ activeSkinId: first.skins[0].id });
  await launch();
  assert.equal(skinPosts(uploads).length, 3);
});

test('Bewusster Upload aktualisiert den Stand, der nächste Start lädt nicht erneut hoch', async t => {
  const { controller, uploads, launch } = await setup(t);
  const state = await controller.addSkin({ name: 'A', data: SKIN_A });
  assert.equal((await controller.uploadSkinToAccount(state.skins[0].id)).ok, true);
  await launch();
  assert.equal(skinPosts(uploads).length, 1);
});

test('Ein fehlgeschlagener Upload blockiert den Start nicht und wird als Hinweis gemeldet', async t => {
  const { controller, notices, launch } = await setup(t);
  await controller.addSkin({ name: 'A', data: SKIN_A });
  globalThis.fetch = async () => new Response(JSON.stringify({ errorMessage: 'kaputt' }), { status: 500 });
  await launch();
  assert.equal(notices.length, 1);
  assert.match(notices[0], /Skin konnte nicht.*kaputt/);
  assert.equal(controller.settings.skinUploads?.['acc-1'], undefined);
});

test('Mit dem Konto-Skin wird beim Start nichts hochgeladen', async t => {
  const { controller, uploads, launch } = await setup(t);
  controller.settings.activeSkinId = 'account';
  await launch();
  assert.equal(uploads.length, 0);
});
