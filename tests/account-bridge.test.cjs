const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const zlib = require('node:zlib');
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
  const events = [], emitted = [];
  const controller = new Controller({ directory: dir, encryption: fakeEncryption, resources: dir, appVersion: 'test', openBrowser: () => () => {},
    emit: (name, data) => { events.push(name); emitted.push({ name, data }); } });
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
  return { controller, bridge: controller.bridge, events, emitted };
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
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], headers: res.headers, body: data ? JSON.parse(data) : null, raw: data }));
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
  assert.deepEqual(res.body, { id: ID_B, name: 'Beta', accessToken: 'neues-access-token-geheim', xuid: 'xuid-2', clientId: '00000000402b5328', expiresAt: 1234567890000,
    skinSync: { status: 'skipped' } });
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

const SKIN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAT0lEQVR42u3BAQEAAACAkP6v7ggKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA1wEAAAe352X0AAAAASUVORK5CYII=';
// Skin wählen und Mojang-API mocken; addSkin kann dabei schon für das aktive Konto hochladen.
async function withSkin(t, controller, fetchImpl) {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(JSON.stringify({ skins: [{ state: 'ACTIVE', url: 'https://textures.minecraft.net/texture/x' }] }), { status: 200 });
  auth.refresh = async acc => acc;
  const state = await controller.addSkin({ name: 'A', data: SKIN });
  globalThis.fetch = fetchImpl;
  return state.skins[0].id;
}
const skinOk = async () => new Response(JSON.stringify({ skins: [{ state: 'ACTIVE', url: 'https://textures.minecraft.net/texture/y' }] }), { status: 200 });

test('switch lädt den Launcher-Skin auf das neue Konto hoch (skinSync uploaded), ohne refreshToken', async t => {
  const { url, token, controller } = await started(t);
  const posts = [];
  const skinId = await withSkin(t, controller, async (u, o = {}) => { posts.push(String(u)); return skinOk(); });
  const res = await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: { id: ID_B } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.skinSync, { status: 'uploaded', skinId });
  assert.equal(posts.filter(u => u.endsWith('/minecraft/profile/skins')).length, 1);
  assert.equal(controller.settings.skinUploads[ID_B].skinId, skinId);
  assert.equal(res.body.accessToken, 'access-token-2-geheim');
  assert.ok(!res.raw.includes('refresh'));
});

test('switch: fehlgeschlagener Skin-Upload liefert 200 mit skinSync failed, Konto ist gewechselt', async t => {
  const { url, token, controller } = await started(t);
  const skinId = await withSkin(t, controller, async () => new Response(JSON.stringify({ errorMessage: 'kaputt refresh-token-2-geheim' }), { status: 500 }));
  const res = await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: { id: ID_B } });
  assert.equal(res.status, 200);
  assert.equal(res.body.skinSync.status, 'failed'); assert.equal(res.body.skinSync.skinId, skinId);
  assert.match(res.body.skinSync.error, /kaputt/);
  assert.ok(!res.raw.includes('refresh'));
  assert.equal(controller.settings.activeAccount, ID_B);
  assert.equal((await request(`${url}/v1/accounts`, { token })).body.accounts.find(a => a.active).id, ID_B);
});

test('switch: hängender Skin-Upload liefert nach dem Timeout pending, ein späterer Fehler wird als Hinweis gemeldet', async t => {
  const { url, token, controller, bridge, events } = await started(t);
  bridge.skinSyncTimeout = 50;
  let fail;
  const skinId = await withSkin(t, controller, () => new Promise((resolve, reject) => { fail = reject; }));
  const res = await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: { id: ID_B } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.skinSync, { status: 'pending', skinId });
  assert.equal(controller.settings.activeAccount, ID_B);
  assert.ok(!res.raw.includes('refresh'));
  fail(new TypeError('fetch failed'));
  await waitFor(() => events.includes('notice'));
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

// --- „Skin speichern“: POST /v1/skins/import ---
function pngChunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
// Gültiges PNG: seed füllt die Pixel (verschiedene Bilddaten), extra hängt einen tEXt-Chunk an (große, aber gültige Datei).
function png({ width = 64, height = 64, seed = 1, extra = 0 } = {}) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const row = Buffer.alloc(width * 4 + 1, seed); row[0] = 0; // Filtertyp 0
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(Buffer.concat(Array(height).fill(row))))];
  if (extra) chunks.push(pngChunk('tEXt', Buffer.concat([Buffer.from('Comment\0', 'latin1'), Buffer.alloc(extra, 0x78)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks, pngChunk('IEND', Buffer.alloc(0))]);
}
const skinPng = options => `data:image/png;base64,${png(options).toString('base64')}`;
const importSkin = (url, token, body, options = {}) => request(`${url}/v1/skins/import`, { method: 'POST', token, body, ...options });

test('skins/import: 201 speichert den Skin, ohne ihn zu aktivieren oder zu Mojang hochzuladen', async t => {
  const { url, token, controller, emitted } = await started(t);
  const calls = [], originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async u => { calls.push(String(u)); return new Response('{}'); };
  auth.refresh = async acc => { calls.push(`refresh:${acc.id}`); return acc; };
  controller.settings.activeSkinId = 'steve';
  const res = await importSkin(url, token, { name: 'Notch', data: skinPng({ seed: 1 }), variant: 'slim' });
  assert.equal(res.status, 201); assert.match(res.type, /^application\/json/);
  const { id } = res.body.skin;
  assert.match(id, /^skin-/);
  assert.deepEqual(res.body, { skin: { id, name: 'Notch', variant: 'slim' }, duplicate: false });
  assert.deepEqual(controller.skins.map(s => ({ id: s.id, name: s.name, variant: s.variant, data: s.data })), [{ id, name: 'Notch', variant: 'slim', data: skinPng({ seed: 1 }) }]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(controller.store.directory, 'skins.json'), 'utf8')).map(s => s.id), [id]);
  assert.deepEqual(emitted.filter(e => e.name === 'skins-changed').map(e => e.data), [{ id, name: 'Notch', player: 'Notch' }]);
  // Ohne Variante erkennt der Launcher sie selbst (in Node ohne nativeImage: classic); der Name wird getrimmt.
  const auto = await importSkin(url, token, { name: '  jeb_ ', data: skinPng({ seed: 2 }) });
  assert.equal(auto.status, 201);
  assert.deepEqual([auto.body.skin.name, auto.body.skin.variant], ['jeb_', 'classic']);
  assert.equal(controller.settings.activeSkinId, 'steve', 'aktiver Skin bleibt');
  assert.equal(controller.settings.skinUploads, undefined);
  assert.deepEqual(calls, [], 'kein Mojang-Upload, keine Token-Erneuerung');
});

test('skins/import: gleiche Bilddaten liefern 200 duplicate ohne neuen Eintrag', async t => {
  const { url, token, controller, events } = await started(t);
  const first = await importSkin(url, token, { name: 'Notch', data: skinPng({ seed: 1 }), variant: 'slim' });
  assert.equal(first.status, 201);
  await controller.renameSkin(first.body.skin.id, 'Lieblingsskin');
  const again = await importSkin(url, token, { name: 'Dinnerbone', data: skinPng({ seed: 1 }), variant: 'classic' });
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, { skin: { id: first.body.skin.id, name: 'Lieblingsskin', variant: 'slim' }, duplicate: true });
  assert.equal(controller.skins.length, 1);
  assert.equal(events.filter(e => e === 'skins-changed').length, 1, 'ohne Änderung kein Ereignis');
  // Auch ein in der UI hinzugefügter Skin mit denselben Bilddaten zählt als vorhanden.
  await controller.addSkin({ name: 'Eigener', data: skinPng({ seed: 7 }) });
  const fromUi = await importSkin(url, token, { name: 'Notch', data: skinPng({ seed: 7 }) });
  assert.equal(fromUi.status, 200);
  assert.deepEqual([fromUi.body.skin.name, fromUi.body.duplicate], ['Eigener', true]);
  assert.equal(controller.skins.length, 2);
});

test('skins/import: vergebener Name mit anderem Bild wird zu „Name (2)“, „Name (3)“ …', async t => {
  const { url, token, controller } = await started(t);
  const names = [];
  for (const [name, seed] of [['Notch', 1], ['Notch', 2], ['notch', 3], ['A'.repeat(32), 4], ['A'.repeat(32), 5]]) {
    const res = await importSkin(url, token, { name, data: skinPng({ seed }) });
    assert.equal(res.status, 201); names.push(res.body.skin.name);
  }
  assert.deepEqual(names, ['Notch', 'Notch (2)', 'notch (3)', 'A'.repeat(32), `${'A'.repeat(28)} (2)`]);
  assert.deepEqual(controller.skins.map(s => s.name), names);
});

test('skins/import: ungültiger Name, ungültiges Bild oder ungültige Variante liefern 400', async t => {
  const { url, bridge, controller, events } = await started(t);
  let n = 0; // eigenes Token pro Anfrage, damit die Drosselung nicht greift
  const cases = [
    [{ data: skinPng() }, /Spielername/],
    [{ name: '', data: skinPng() }, /Spielername/],
    [{ name: '   ', data: skinPng() }, /Spielername/],
    [{ name: 'x'.repeat(33), data: skinPng() }, /Spielername/],
    [{ name: 42, data: skinPng() }, /Spielername/],
    [{ name: 'Böse\u0007', data: skinPng() }, /Spielername/],
    [{ name: 'Notch', data: skinPng(), variant: 'wide' }, /Variante/],
    [{ name: 'Notch' }, /PNG/],
    [{ name: 'Notch', data: skinPng({ width: 128, height: 128 }) }, /64x64 oder 64x32/],
    [{ name: 'Notch', data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }, /PNG/],
    [{ name: 'Notch', data: 'data:image/png;base64,<script>' }, /Ungültiges Bild/],
    [{ name: 'Notch', data: skinPng({ extra: 300 * 1024 }) }, /256 KB/],
    ['[]', /Ungültige Anfrage/],
    ['{kaputt', /Ungültige Anfrage/]
  ];
  for (const [body, message] of cases) {
    const res = await importSkin(url, bridge.register(`inst_400_${n++}`, ID_A), body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.deepEqual(Object.keys(res.body), ['error']); assert.match(res.body.error, message);
  }
  assert.equal(controller.skins.length, 0);
  assert.ok(!events.includes('skins-changed'));
});

test('skins/import: Schutz wie bei den anderen Routen (401, 403, 405, 415)', async t => {
  const { url, token, bridge, controller } = await started(t);
  const body = { name: 'Notch', data: skinPng() };
  assert.equal((await importSkin(url, undefined, body)).status, 401);
  assert.equal((await importSkin(url, 'f'.repeat(64), body)).status, 401);
  assert.equal((await importSkin(url, token.slice(0, 63), body)).status, 401);
  assert.equal((await importSkin(url, token, body, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await importSkin(url, token, body, { headers: { Origin: 'null' } })).status, 403);
  assert.equal((await importSkin(url, token, body, { headers: { Host: `localhost:${bridge.port}` } })).status, 403);
  const get = await request(`${url}/v1/skins/import`, { token });
  assert.equal(get.status, 405); assert.equal(get.headers.allow, 'POST');
  assert.equal((await importSkin(url, token, body, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal(controller.skins.length, 0);
});

test('skins/import: bis 512 KB erlaubt, darüber 413; die anderen Routen behalten 4 KB', async t => {
  const { url, token, controller } = await started(t);
  const big = await importSkin(url, token, { name: 'Groß', data: skinPng({ extra: 200 * 1024 }) });
  assert.equal(big.status, 201, 'mehr als 4 KB sind beim Import erlaubt');
  const tooBig = await importSkin(url, token, { name: 'Riesig', data: skinPng({ extra: 400 * 1024 }) });
  assert.equal(tooBig.status, 413); assert.deepEqual(tooBig.body, { error: 'Anfrage zu groß.' });
  assert.equal(controller.skins.length, 1);
  assert.equal((await request(`${url}/v1/accounts/switch`, { method: 'POST', token, body: JSON.stringify({ id: ID_B, pad: 'x'.repeat(5000) }) })).status, 413);
});

test('skins/import: volle Bibliothek liefert 409 mit der bekannten Meldung, Duplikate weiter 200', async t => {
  const { url, token, controller, events } = await started(t);
  controller.skins = Array.from({ length: 100 }, (_, i) => ({ id: `skin-${i}`, name: `S${i}`, data: i === 0 ? skinPng({ seed: 9 }) : '' }));
  const full = await importSkin(url, token, { name: 'Notch', data: skinPng({ seed: 1 }) });
  assert.equal(full.status, 409);
  assert.deepEqual(full.body, { error: 'Maximal 100 eigene Skins möglich. Bitte zuerst einen Skin entfernen.' });
  const duplicate = await importSkin(url, token, { name: 'Notch', data: skinPng({ seed: 9 }) });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(duplicate.body, { skin: { id: 'skin-0', name: 'S0', variant: 'classic' }, duplicate: true });
  assert.equal(controller.skins.length, 100);
  assert.ok(!events.includes('skins-changed'));
});

test('skins/import: höchstens 10 Anfragen pro Minute und Token, danach 429 mit Retry-After', async t => {
  const { url, token, bridge, controller } = await started(t);
  for (let i = 0; i < 10; i++) {
    const res = await importSkin(url, token, { name: 'Notch', data: skinPng({ seed: i % 3 }) });
    assert.ok([200, 201].includes(res.status), `Anfrage ${i + 1}: ${res.status}`);
  }
  // Auch mit großem Body kommt die 429 sicher an (Antwort erst nach dem Lesen).
  const limited = await importSkin(url, token, { name: 'Notch', data: skinPng({ seed: 5, extra: 200 * 1024 }) });
  assert.equal(limited.status, 429); assert.equal(typeof limited.body.error, 'string');
  const retry = Number(limited.headers['retry-after']);
  assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= 60, `Retry-After ${retry}`);
  assert.equal(controller.skins.length, 3);
  // Eine andere Instanz (eigenes Token) ist nicht betroffen.
  assert.equal((await importSkin(url, bridge.register('inst_other', ID_B), { name: 'Notch', data: skinPng({ seed: 5 }) })).status, 201);
  // Nach Ablauf des Fensters geht es weiter.
  const entry = bridge.tokens.get(token);
  entry.imports = entry.imports.map(time => time - 60000);
  assert.equal((await importSkin(url, token, { name: 'Notch', data: skinPng({ seed: 6 }) })).status, 201);
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
