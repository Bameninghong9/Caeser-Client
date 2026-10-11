const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { LogStore, MAX_FINISHED_INSTANCES } = require('../src/game/log-store.cjs');
const { createLogWindowManager } = require('../src/app/log-window.cjs');

// Minimaler Ersatz für die Electron-Teile, die der Log-Manager nutzt
function fakeElectron() {
  const handlers = new Map(), windows = [];
  class BrowserWindow extends EventEmitter {
    constructor() {
      super(); this.sent = []; this.destroyed = false; windows.push(this);
      this.webContents = { mainFrame: {}, send: (channel, data) => this.sent.push({ channel, data }), setWindowOpenHandler() {}, on() {} };
    }
    loadFile() {} show() {} focus() {} restore() {} isMinimized() { return false; }
    isDestroyed() { return this.destroyed; }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  return { handlers, windows, deps: { BrowserWindow, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, clipboard: { writeText() {} }, dialog: {} } };
}
function setup(settings = {}) {
  const fake = fakeElectron();
  const controller = { logs: new LogStore(), settings: { autoOpenLog: true, language: 'de', ...settings }, stopGame: () => true };
  const manager = createLogWindowManager(controller, fake.deps);
  const spawn = (id, meta = {}) => { controller.logs.add({ id, profileName: 'Test', ...meta }); manager.handleEmit('game-spawn', { instanceId: id, autoOpenLog: controller.settings.autoOpenLog }); };
  const log = (id, line) => { controller.logs.push(id, line); manager.handleEmit('game-log', { instanceId: id, line }); };
  const exit = (id, status, exitCode) => { controller.logs.finish(id, { status, exitCode }); manager.handleEmit('game-exit', { instanceId: id, status, exitCode, runningCount: 0 }); };
  return { ...fake, controller, manager, spawn, log, exit };
}

test('LogStore markiert beendete Instanzen und behält höchstens 5 davon', () => {
  const store = new LogStore();
  store.add({ id: 'laufend' });
  for (let i = 0; i < 8; i++) { store.add({ id: `i${i}` }); store.push(`i${i}`, 'zeile'); store.finish(`i${i}`, { status: i % 2 ? 'crashed' : 'stopped', exitCode: i, endTime: 1000 + i }); }
  const list = store.list();
  assert.equal(list.filter(i => i.status !== 'running').length, MAX_FINISHED_INSTANCES);
  assert.ok(store.has('laufend'), 'laufende Instanzen werden nie entfernt');
  assert.deepEqual(list.filter(i => i.status !== 'running').map(i => i.id), ['i3', 'i4', 'i5', 'i6', 'i7']);
  assert.equal(store.get('i7').status, 'crashed'); assert.equal(store.get('i7').exitCode, 7); assert.equal(store.get('i7').endTime, 1007);
  assert.equal(list.find(i => i.id === 'i7').logs, undefined, 'Zusammenfassung ohne Logzeilen');
});

test('LogStore begrenzt Zeilen pro Instanz', () => {
  const store = new LogStore({ maxLines: 3 });
  store.add({ id: 'a' }); for (const l of ['1', '2', '3', '4', '5']) store.push('a', l);
  assert.deepEqual(store.lines('a'), ['3', '4', '5']);
});

test('Absturz des einzigen Spiels: Fenster bleibt offen und zeigt Status', () => {
  const { windows, spawn, log, exit, manager } = setup();
  spawn('a'); log('a', '[main/ERROR]: kaputt');
  assert.equal(windows.length, 1);
  exit('a', 'crashed', 1);
  assert.equal(windows[0].destroyed, false, 'Fenster wird nicht geschlossen');
  const msg = windows[0].sent.filter(m => m.channel === 'instance-exit').pop().data;
  assert.equal(msg.instance.status, 'crashed'); assert.equal(msg.instance.exitCode, 1); assert.ok(msg.instance.endTime);
  assert.equal(msg.instance.lineCount, 1);
  assert.equal(manager.activeInstanceId, 'a', 'Auswahl bleibt auf der beendeten Instanz');
  assert.deepEqual(manager.logs, ['[main/ERROR]: kaputt']);
});

test('Absturz öffnet ein geschlossenes Log-Fenster, normales Beenden nicht', () => {
  const { windows, spawn, exit } = setup({ autoOpenLog: true });
  spawn('a'); windows[0].close();
  exit('a', 'stopped', 0);
  assert.equal(windows.length, 1, 'normales Beenden öffnet nichts');
  spawn('b'); windows[1].close();
  exit('b', 'crashed', -1);
  assert.equal(windows.length, 3);
  assert.equal(windows[2].destroyed, false);
});

test('Ohne autoOpenLog öffnet auch ein Absturz kein Fenster', () => {
  const { windows, spawn, exit } = setup({ autoOpenLog: false });
  spawn('a'); exit('a', 'crashed', 1);
  assert.equal(windows.length, 0);
});

test('Neue Starts legen neue Instanzen an, alte bleiben bis zum Limit auswählbar', async () => {
  const { handlers, windows, spawn, exit, controller } = setup();
  for (let i = 0; i < 7; i++) { spawn(`s${i}`); exit(`s${i}`, 'stopped', 0); }
  const event = { senderFrame: windows[0].webContents.mainFrame };
  const init = await handlers.get('log-get-init')(event);
  assert.equal(init.instances.length, 5);
  assert.ok(await handlers.get('log-select-instance')(event, 's3'));
  assert.equal(await handlers.get('log-select-instance')(event, 's0'), null, 'älteste wurde aufgeräumt');
  assert.equal(await handlers.get('log-close-instance')(event, 's3'), true);
  assert.equal(controller.logs.has('s3'), false);
  assert.equal(await handlers.get('log-get-init')({ senderFrame: {} }).instances.length, 0, 'fremde Absender bekommen nichts');
});

test('controller.instances wächst bei 20 Starts nicht', async t => {
  const auth = require('../src/auth/microsoft.cjs'), launcher = require('../src/game/launcher.cjs');
  const { Controller } = require('../src/app/controller.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-logs-'));
  const original = { refresh: auth.refresh, prepare: launcher.prepare, start: launcher.start };
  auth.refresh = async a => a; launcher.prepare = async () => ({ instance: dir });
  let n = 0;
  launcher.start = () => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 1;
    const crash = n++ % 2;
    setImmediate(() => { child.emit('spawn'); child.stdout.emit('data', Buffer.from('[main/INFO]: läuft\n')); setImmediate(() => child.emit('close', crash ? 1 : 0)); });
    return child;
  };
  const exits = [];
  const encryption = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  const controller = new Controller({ directory: dir, encryption, resources: dir, appVersion: 'test', openBrowser: () => {}, emit: (name, data) => { if (name === 'game-exit') exits.push(data); } });
  t.after(async () => { Object.assign(auth, { refresh: original.refresh }); Object.assign(launcher, { prepare: original.prepare, start: original.start }); controller.destroy(); await fs.rm(dir, { recursive: true, force: true }); });
  await controller.load();
  controller.discordRpc.setActivity = () => {};
  controller.accounts = [{ id: 'acc', name: 'P', accessToken: 'zugriffs-token-123', refreshToken: 'refresh-token-456' }]; controller.settings.activeAccount = 'acc';
  for (let i = 0; i < 20; i++) { await controller.launch(); while (exits.length <= i) await new Promise(r => setTimeout(r, 5)); }
  assert.equal(controller.instances.size, 0);
  assert.equal(controller.logs.list().length, MAX_FINISHED_INSTANCES);
  const last = exits.at(-1);
  assert.equal(last.status, 'crashed'); assert.equal(last.exitCode, 1); assert.ok(last.endTime);
  assert.deepEqual(controller.logs.lines(last.instanceId), ['[main/INFO]: läuft']);
});
