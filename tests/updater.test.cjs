const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdater, RELEASES_URL } = require('../src/app/updater.cjs');

function setup({ enabled = true, portable = false, controller = { game: null, busy: false, mods: { busy: false } } } = {}) {
  const auto = new EventEmitter();
  const calls = { check: 0, download: 0, install: [], opened: [] };
  auto.checkForUpdates = async () => { calls.check++; };
  auto.downloadUpdate = async () => { calls.download++; };
  auto.quitAndInstall = (...args) => calls.install.push(args);
  const events = [];
  const updater = createUpdater({ autoUpdater: auto, enabled, portable, controller, emit: (name, data) => events.push({ name, data }),
    openExternal: async url => calls.opened.push(url), log: { warn() {} } });
  return { auto, calls, events, updater, controller };
}

test('Lädt und installiert nichts automatisch', async () => {
  const { auto, calls, events, updater } = setup();
  assert.equal(auto.autoDownload, false);
  assert.equal(auto.autoInstallOnAppQuit, false);
  await updater.check();
  auto.emit('update-available', { version: '0.3.31' });
  assert.equal(calls.download, 0);
  assert.deepEqual(updater.status(), { status: 'available', version: '0.3.31', percent: 0, portable: false });
  assert.deepEqual(events.at(-1), { name: 'update-status', data: updater.status() });
});

test('Ohne Update bleibt der Status idle; Fehler beim Prüfen bleiben still', async () => {
  const { auto, updater } = setup();
  auto.checkForUpdates = async () => { throw new Error('offline'); };
  assert.equal((await updater.check()).status, 'idle');
});

// Wie electron-updater: update-downloaded kommt, bevor downloadUpdate() fertig ist.
const downloads = (auto, calls, version = '0.3.31') => async () => {
  calls.download++; auto.emit('download-progress', { percent: 41.6 }); auto.emit('update-downloaded', { version });
};

test('Ein Klick: herunterladen, Fortschritt melden, dann sofort installieren und neu starten', async () => {
  const { auto, calls, updater, events } = setup();
  auto.emit('update-available', { version: '0.3.31' });
  auto.downloadUpdate = downloads(auto, calls);
  await updater.download();
  assert.equal(calls.download, 1);
  assert.ok(events.some(e => e.data.status === 'downloading' && e.data.percent === 42));
  assert.deepEqual(calls.install, [[true, true]]);
  assert.equal(updater.status().status, 'installing');
});

test('Wird Minecraft während des Downloads gestartet, bleibt das Update bereit statt das Spiel zu schließen', async () => {
  const { auto, calls, updater, controller } = setup();
  auto.emit('update-available', { version: '0.3.31' });
  auto.downloadUpdate = async () => { controller.game = {}; await downloads(auto, calls)(); };
  await updater.download();
  assert.equal(calls.install.length, 0);
  assert.equal(updater.status().status, 'ready');
  controller.game = null;
  updater.install();
  assert.deepEqual(calls.install, [[true, true]]);
});

test('Klick bei laufendem Minecraft lädt nichts herunter', async () => {
  const { auto, calls, updater, controller } = setup();
  auto.emit('update-available', { version: '0.3.31' });
  controller.game = {};
  await assert.rejects(updater.download(), /Minecraft/);
  assert.equal(calls.download, 0);
  assert.equal(updater.status().status, 'available');
});

test('Download-Fehler: zurück auf available, Fehlermeldung für die UI', async () => {
  const { auto, updater } = setup();
  auto.emit('update-available', { version: '0.3.31' });
  auto.downloadUpdate = async () => { throw new Error('Netzwerk weg'); };
  await assert.rejects(updater.download(), /Netzwerk weg/);
  assert.equal(updater.status().status, 'available');
});

test('Portable: Klick öffnet nur die Download-Seite', async () => {
  const { auto, calls, updater } = setup({ portable: true });
  auto.emit('update-available', { version: '0.3.31' });
  await updater.download();
  assert.deepEqual(calls.opened, [RELEASES_URL]);
  assert.equal(calls.download, 0);
  assert.equal(updater.status().status, 'available');
});

test('Beim Start wird sofort geprüft, nicht erst nach einer Wartezeit', () => {
  const { calls, updater } = setup();
  updater.start();
  assert.equal(calls.check, 1);
  updater.stop();
});

test('Minecraft beendet: Prüfung erst, wenn keine Instanz mehr läuft', async () => {
  const { calls, updater } = setup();
  await updater.onGameExit({ runningCount: 1 });
  assert.equal(calls.check, 0);
  await updater.onGameExit({ runningCount: 0 });
  assert.equal(calls.check, 1);
  await updater.onGameExit({});
  assert.equal(calls.check, 2);
});

test('Minecraft beendet, Update schon bekannt: keine erneute Prüfung', async () => {
  const { auto, calls, updater } = setup();
  auto.emit('update-available', { version: '0.3.31' });
  await updater.onGameExit({ runningCount: 0 });
  assert.equal(calls.check, 0);
  assert.equal(updater.status().status, 'available');
});

test('Nicht installiert (npm start): keine Prüfung, Button bleibt verborgen', async () => {
  const { calls, updater } = setup({ enabled: false });
  updater.start();
  await updater.check();
  assert.equal(calls.check, 0);
  assert.equal(updater.status().status, 'idle');
  updater.stop();
});
