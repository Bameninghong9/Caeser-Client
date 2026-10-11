const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const auth = require('../src/auth/microsoft.cjs');
const sisu = require('../src/auth/sisu.cjs');
const launcher = require('../src/game/launcher.cjs');
const { Controller } = require('../src/app/controller.cjs');

const fakeEncryption = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
const ID_A = 'a'.repeat(32), ID_B = 'b'.repeat(32), ID_NEW = 'c'.repeat(32);
const account = (id, name, n) => ({ id, name, accessToken: `access-token-${n}-geheim`, refreshToken: `refresh-token-${n}-geheim`,
  expiresAt: Date.now() + 3600000, clientId: '00000000402b5328', authFlow: 'sisu', xuid: `xuid-${n}` });

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-bridge-'));
  const original = { refresh: auth.refresh, login: sisu.login };
  const events = [];
  const controller = new Controller({ directory: dir, encryption: fakeEncryption, resources: dir, appVersion: 'test', openBrowser: () => () => {},
    emit: name => events.push(name) });
  await controller.load();
  controller.discordRpc.setActivity = () => {}; controller.discordRpc.setEnabled = () => {};
  controller.bridge.log = { warn: () => {} };
  controller.accounts = [account(ID_A, 'Alpha', 1), account(ID_B, 'Beta', 2)];
  controller.settings.activeAccount = ID_A;
  t.after(async () => {
    Object.assign(auth, { refresh: original.refresh }); Object.assign(sisu, { login: original.login });
    controller.loginController?.abort();
    controller.destroy(); await controller.bridge.stop();
    await new Promise(r => setTimeout(r, 30));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { controller, bridge: controller.bridge, events };
}
// Rohe Anfrage mit frei wählbaren Headern (auch Host und Origin), damit die Schutzmaßnahmen prüfbar sind.
function request(url, { method = 'GET', token, headers = {}, body } = {}) {
  const target = new URL(url);
  const payload = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
  const all = { Host: target.host, ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(payload !== null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: target.hostname, port: target.port, path: target.pathname, method, headers: all, agent: false }, res => {
      let data = ''; res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: data ? JSON.parse(data) : null, raw: data }));
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
async function started(t) {
  const ctx = await setup(t);
  const token = ctx.bridge.register('inst_test', ID_A);
  const url = await ctx.bridge.start();
  return { ...ctx, token, url };
}
const waitFor = async check => { for (let i = 0; i < 200 && !check(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(check()); };

test('Server lauscht nur auf 127.0.0.1 mit zufälligem Port', async t => {
  const { bridge, url } = await started(t);
  assert.equal(bridge.address().address, '127.0.0.1');
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.notEqual(bridge.address().port, 0);
});

test('Ohne oder mit falschem Token: 401', async t => {
  const { url, token } = await started(t);
  const none = await request(`${url}/v1/accounts`);
  assert.equal(none.status, 401); assert.match(none.type, /^application\/json/); assert.equal(typeof none.body.error, 'string');
  assert.equal((await request(`${url}/v1/accounts`, { token: 'f'.repeat(64) })).status, 401);
  assert.equal((await request(`${url}/v1/accounts`, { token: token.slice(0, 63) })).status, 401);
  assert.equal((await request(`${url}/v1/accounts`, { headers: { Authorization: token } })).status, 401);
});

test('Origin-Header oder falscher Host: 403 (auch mit gültigem Token)', async t => {
  const { url, token, bridge } = await started(t);
  assert.equal((await request(`${url}/v1/accounts`, { token, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request(`${url}/v1/accounts`, { token, headers: { Origin: 'null' } })).status, 403);
  assert.equal((await request(`${url}/v1/accounts`, { token, headers: { Host: `localhost:${bridge.port}` } })).status, 403);
  assert.equal((await request(`${url}/v1/accounts`, { token, headers: { Host: `evil.example:${bridge.port}` } })).status, 403);
  assert.equal((await request(`${url}/v1/accounts`, { token, headers: { Host: '127.0.0.1' } })).status, 403);
});

test('GET /v1/accounts liefert Konten ohne Tokens, active gilt für diese Instanz', async t => {
  const { url, token, controller } = await started(t);
  controller.settings.activeAccount = ID_B; // nicht maßgeblich für active
  const res = await request(`${url}/v1/accounts`, { token });
  assert.equal(res.status, 200); assert.match(res.type, /^application\/json/);
  assert.deepEqual(res.body, { accounts: [{ id: ID_A, name: 'Alpha', active: true }, { id: ID_B, name: 'Beta', active: false }],
    login: { running: false, error: null, lastAddedId: null } });
  assert.ok(!/access-token|refresh-token|accessToken|refreshToken/.test(res.raw));
});

test('Unbekannter Pfad 404, falsche Methode 405, falscher Content-Type 415, zu großer Body 413', async t => {
  const { url, token } = await started(t);
  assert.equal((await request(`${url}/v1/unbekannt`, { token })).status, 404);
  assert.equal((await request(`${url}/v1/accounts`, { method: 'POST', token, body: {} })).status, 405);
  assert.equal((await request(`${url}/v1/accounts/switch`, { token })).status, 405);
  assert.equal((await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: { id: ID_B }, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: JSON.stringify({ id: ID_B, pad: 'x'.repeat(5000) }) })).status, 413);
  assert.equal((await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: '{kaputt' })).status, 400);
});

test('switch mit unbekannter ID: 404', async t => {
  const { url, token } = await started(t);
  const res = await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: { id: 'd'.repeat(32) } });
  assert.equal(res.status, 404); assert.equal(typeof res.body.error, 'string');
});

test('switch erneuert das Konto, gibt kein refreshToken zurück und setzt settings.activeAccount', async t => {
  const { url, token, controller, events } = await started(t);
  const refreshed = [];
  auth.refresh = async acc => { refreshed.push(acc.id); return { ...acc, accessToken: 'neues-access-token-geheim', refreshToken: 'neues-refresh-token-geheim', expiresAt: 1234567890000 }; };
  const res = await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: { id: ID_B } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: ID_B, name: 'Beta', accessToken: 'neues-access-token-geheim', xuid: 'xuid-2', clientId: '00000000402b5328', expiresAt: 1234567890000 });
  assert.ok(!res.raw.includes('refresh'));
  assert.deepEqual(refreshed, [ID_B]);
  assert.equal(controller.settings.activeAccount, ID_B);
  assert.equal(JSON.parse(await fs.readFile(path.join(controller.store.directory, 'settings.json'), 'utf8')).activeAccount, ID_B);
  assert.equal(controller.accounts.find(a => a.id === ID_B).accessToken, 'neues-access-token-geheim');
  assert.ok(events.includes('accounts-changed'));
  const list = await request(`${url}/v1/accounts`, { token });
  assert.deepEqual(list.body.accounts.map(a => a.active), [false, true]);
  // Drosselung: höchstens ein Wechsel pro Sekunde und Instanz
  assert.equal((await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: { id: ID_A } })).status, 429);
});

test('switch: fehlgeschlagene Erneuerung liefert 502 ohne Tokens', async t => {
  const { url, token, controller } = await started(t);
  auth.refresh = async acc => { throw new Error(`Fehler mit ${acc.refreshToken}`); };
  const res = await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: { id: ID_B } });
  assert.equal(res.status, 502);
  assert.ok(!res.raw.includes('refresh-token-2-geheim'));
  assert.equal(controller.settings.activeAccount, ID_A);
});

test('login: 202, zweites login während eines läuft 409, Abbruch liefert verständliche Meldung', async t => {
  const { url, token, controller } = await started(t);
  const opened = [];
  sisu.login = (openBrowser, signal) => new Promise((resolve, reject) => {
    openBrowser('https://login.live.com/x', { cancel() {}, fail() {} });
    signal.addEventListener('abort', () => reject(new DOMException('Anmeldung abgebrochen.', 'AbortError')), { once: true });
  });
  controller.openBrowser = (u, callbacks) => { opened.push(callbacks); return () => {}; };
  const first = await request(`${url}/v1/accounts/login`, { method: 'POST', token, body: {} });
  assert.equal(first.status, 202); assert.deepEqual(first.body, { started: true });
  assert.equal(opened.length, 1); assert.equal(opened[0].foreground, true, 'Microsoft-Fenster ohne Parent im Vordergrund');
  assert.equal((await request(`${url}/v1/accounts/login`, { method: 'POST', token, body: {} })).status, 409);
  await assert.rejects(controller.login(), /läuft bereits/); // Anmeldung aus der UI parallel bleibt abgewiesen
  assert.equal((await request(`${url}/v1/accounts`, { token })).body.login.running, true);
  controller.loginController.abort();
  await waitFor(() => !controller.bridge.loginRunning);
  assert.deepEqual((await request(`${url}/v1/accounts`, { token })).body.login, { running: false, error: 'Anmeldung abgebrochen.', lastAddedId: null });
});

test('login: erfolgreiche Anmeldung setzt lastAddedId und meldet accounts-changed', async t => {
  const { url, token, controller, events } = await started(t);
  let finish;
  sisu.login = () => new Promise(resolve => { finish = resolve; });
  const res = await request(`${url}/v1/accounts/login`, { method: 'POST', token, body: {} });
  assert.equal(res.status, 202);
  finish(account(ID_NEW, 'Neu', 3));
  await waitFor(() => !controller.bridge.loginRunning);
  const list = await request(`${url}/v1/accounts`, { token });
  assert.deepEqual(list.body.login, { running: false, error: null, lastAddedId: ID_NEW });
  assert.ok(list.body.accounts.some(a => a.id === ID_NEW && a.active === false));
  assert.ok(!list.raw.includes('access-token-3'));
  assert.ok(events.includes('accounts-changed'));
});

test('Nach Instanz-Ende ist das Token ungültig; ohne Instanz stoppt der Server', async t => {
  const { bridge, url, token } = await started(t);
  const other = bridge.register('inst_other', ID_B);
  bridge.unregister(token);
  assert.equal((await request(`${url}/v1/accounts`, { token })).status, 401);
  assert.equal((await request(`${url}/v1/accounts`, { token: other })).status, 200);
  bridge.unregister(other);
  await waitFor(() => !bridge.server && !bridge.closing);
  await assert.rejects(request(`${url}/v1/accounts`, { token: other }));
});

test('launch übergibt URL und Token per env, schwärzt Tokens aller Konten und räumt beim Beenden auf', async t => {
  const { controller, bridge } = await setup(t);
  const original = { prepare: launcher.prepare, start: launcher.start };
  t.after(() => Object.assign(launcher, original));
  const dir = path.dirname(controller.root);
  let child, env;
  launcher.prepare = async () => ({ instance: dir });
  launcher.start = (prepared, acc, memory, extraEnv) => {
    env = extraEnv;
    child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 1;
    setImmediate(() => child.emit('spawn'));
    return child;
  };
  const { instanceId } = await controller.launch();
  assert.match(env.CAESER_BRIDGE_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(env.CAESER_BRIDGE_TOKEN, /^[0-9a-f]{64}$/);
  const res = await request(`${env.CAESER_BRIDGE_URL}/v1/accounts`, { token: env.CAESER_BRIDGE_TOKEN });
  assert.equal(res.status, 200); assert.equal(res.body.accounts.find(a => a.active).id, ID_A);
  child.stdout.emit('data', Buffer.from(`[main/INFO]: a access-token-2-geheim b refresh-token-1-geheim c ${env.CAESER_BRIDGE_TOKEN}\n`));
  assert.deepEqual(controller.logs.lines(instanceId), ['[main/INFO]: a [TOKEN] b [TOKEN] c [TOKEN]']);
  child.emit('close', 0);
  await waitFor(() => !bridge.server && !bridge.closing && bridge.tokens.size === 0);
});

test('launcher.start: ohne extraEnv wie bisher, mit extraEnv nur im env und nicht in den Argumenten', t => {
  const calls = [];
  t.mock.method(childProcess, 'spawn', (cmd, args, options) => { calls.push({ cmd, args, options }); return {}; });
  const file = require.resolve('../src/game/launcher.cjs');
  const cached = require.cache[file]; delete require.cache[file];
  t.after(() => { require.cache[file] = cached; });
  const fresh = require(file);
  const prepared = { java: 'java.exe', metadata: { id: '1.21.11', type: 'release', assetIndex: { id: '27' }, arguments: { jvm: ['-cp', '${classpath}'], game: ['--accessToken', '${auth_access_token}'] } },
    natives: 'natives', instance: 'C:\\Game Folder', classpath: ['a.jar'], assetRoot: 'assets', virtualRoot: 'virtual', libraryRoot: 'libraries', extraArguments: { jvm: [], game: [] }, mainClass: 'Main' };
  const acc = { name: 'P', id: ID_A, accessToken: 'secret-token', clientId: 'app' };
  fresh.start(prepared, acc, 2048);
  fresh.start(prepared, acc, 2048, { CAESER_BRIDGE_URL: 'http://127.0.0.1:1234', CAESER_BRIDGE_TOKEN: 'e'.repeat(64) });
  const expected = fresh.launchArguments(prepared, acc, 2048);
  assert.deepEqual(calls[0].args, expected);
  assert.deepEqual(calls[0].options, { cwd: 'C:\\Game Folder', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal('env' in calls[0].options, false);
  assert.deepEqual(calls[1].args, expected);
  assert.ok(!calls[1].args.some(a => a.includes('127.0.0.1') || a.includes('e'.repeat(64)) || a.includes('CAESER_BRIDGE')));
  assert.equal(calls[1].options.env.CAESER_BRIDGE_URL, 'http://127.0.0.1:1234');
  assert.equal(calls[1].options.env.CAESER_BRIDGE_TOKEN, 'e'.repeat(64));
  assert.equal(calls[1].options.env.PATH ?? calls[1].options.env.Path, process.env.PATH ?? process.env.Path);
});
