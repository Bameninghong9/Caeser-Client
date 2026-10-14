const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { CaeserApi, MAX_CACHE_FILES } = require('../src/backend/caeser-api.cjs');
const { createCapesHandlers } = require('../src/app/capes-ipc.cjs');
const { encodePng, decodePng, inspectUpload, pngSize } = require('../src/backend/cape-image.cjs');
const { caeserApiUrl, DEFAULT_CAESER_API_URL } = require('../src/backend/caeser-config.cjs');

const BASE = 'https://caeser.example.org';
const ACCESS = 'mc-access-token-geheim';
const REFRESH = 'ms-refresh-token-geheim';
const SESSION = 'caeser-session-token-geheim';
const ACCOUNT = { id: '0123456789abcdef0123456789abcdef', name: 'Spieler', accessToken: ACCESS, refreshToken: REFRESH, expiresAt: Date.now() + 3600000 };
const CAPE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9';

function bitmap(width, height, rgba = [40, 120, 200, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const capePng = encodePng(bitmap(64, 32));

// Kleines Fake-Backend: zählt Anmeldungen und kann Tokens für ungültig erklären.
function backend({ expireFirstToken = false } = {}) {
  const calls = [];
  let logins = 0, tokens = [];
  const fetch = async (url, options = {}) => {
    const target = new URL(url), method = options.method || 'GET', auth = options.headers?.Authorization || '';
    calls.push({ url: String(url), method, auth, body: options.body });
    if (target.origin === BASE) {
      if (target.pathname === '/v1/auth/challenge') return json({ challengeId: `ch-${logins + 1}`, serverId: `srv-${logins + 1}` });
      if (target.pathname === '/v1/auth/verify') { logins++; const token = `${SESSION}-${logins}`; tokens.push(token); return json({ token, uuid: ACCOUNT.id, name: 'Spieler', expiresAt: Date.now() + 3600000, isAdmin: false }); }
      const token = auth.replace('Bearer ', '');
      if (target.pathname.endsWith('.png')) return new Response(capePng, { status: 200, headers: { 'Content-Type': 'image/png' } });
      if (!tokens.includes(token) || (expireFirstToken && token === `${SESSION}-1`)) return json({ error: 'Sitzung abgelaufen.', code: 'UNAUTHORIZED' }, 401);
      if (target.pathname === '/v1/me') return json({ uuid: ACCOUNT.id, name: 'Spieler', jetons: 250, capeId: CAPE_ID, token, sessionToken: token });
      if (target.pathname === '/v1/capes/config') return json({ uploadPrice: 100, maxPending: 3, maxTotal: 10 });
      if (target.pathname === '/v1/capes' && method === 'GET') return json({ items: [{ id: CAPE_ID, name: 'Stern', ownerName: 'Anna', uses: 7, createdAt: 1, token }, { id: '../../evil', name: 'x' }], nextCursor: 'abc' });
      if (target.pathname === '/v1/capes' && method === 'POST') return json({ cape: { id: CAPE_ID, name: target.searchParams.get('name'), ownerName: 'Spieler', uses: 0, status: 'pending' }, jetons: 150 }, 201);
      if (target.pathname === '/v1/capes/mine' || target.pathname === '/v1/capes/favorites') return json({ items: [] });
      if (target.pathname === '/v1/me/cape') return json({ capeId: JSON.parse(options.body).capeId });
      return json({ ok: true });
    }
    if (String(url) === 'https://sessionserver.mojang.com/session/minecraft/join') return new Response(null, { status: 204 });
    if (String(url).startsWith('https://api.minecraftservices.com/minecraft/profile')) return json({ id: ACCOUNT.id, capes: [{ id: '11111111-2222-3333-4444-555555555555', state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/abcdef0123456789abcdef', alias: 'Migrator' }, { id: '66666666-2222-3333-4444-555555555555', state: 'INACTIVE', url: 'https://evil.example.com/texture/abcdef0123456789abcdee', alias: 'Böse' }] });
    if (target.hostname === 'textures.minecraft.net') return new Response(capePng, { status: 200 });
    throw new Error(`Unerwarteter Aufruf: ${url}`);
  };
  return { fetch, calls, get logins() { return logins; } };
}

async function setup(t, options) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-capes-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const server = backend(options);
  const accounts = [ACCOUNT];
  const api = new CaeserApi({ directory: dir, baseUrl: BASE, fetch: server.fetch, account: async (id = ACCOUNT.id) => { const a = accounts.find(x => x.id === id); if (!a) throw new Error('Kein Minecraft-Konto angemeldet.'); return a; } });
  const dialog = { open: [], save: [], showOpenDialog: async () => dialog.open.shift() || { canceled: true, filePaths: [] }, showSaveDialog: async () => dialog.save.shift() || { canceled: true } };
  const controller = { caeserApi: api, resources: path.join(__dirname, '..', 'resources'), accounts, settings: { activeAccount: ACCOUNT.id } };
  const handlers = createCapesHandlers({ controller, dialog, window: null });
  return { dir, api, server, dialog, handlers };
}

test('CAESER_API_URL: Standard ist der Produktivserver, ungültige Werte fallen darauf zurück', () => {
  assert.equal(DEFAULT_CAESER_API_URL, 'https://caeser-backend.caeser-backend.workers.dev');
  assert.equal(caeserApiUrl({ buildConfig: {} }), DEFAULT_CAESER_API_URL);
  assert.equal(caeserApiUrl({ buildConfig: { caeser: { apiUrl: 'https://api.example.org/' } } }), 'https://api.example.org');
  assert.equal(caeserApiUrl({ buildConfig: { caeser: { apiUrl: 'http://api.example.org' } } }), DEFAULT_CAESER_API_URL);
  assert.equal(caeserApiUrl({ buildConfig: { caeser: { apiUrl: 'https://u:p@api.example.org' } } }), DEFAULT_CAESER_API_URL);
});

test('Anmeldung: Challenge, Mojang-Join und Verify, danach Aufrufe mit Session-Token', async t => {
  const { api, server } = await setup(t);
  const me = await api.me();
  assert.deepEqual(me, { uuid: ACCOUNT.id, name: 'Spieler', jetons: 250, capeId: CAPE_ID });
  const [challenge, join, verify, call] = server.calls;
  assert.equal(challenge.url, `${BASE}/v1/auth/challenge`); assert.deepEqual(JSON.parse(challenge.body), { name: 'Spieler' });
  assert.equal(join.url, 'https://sessionserver.mojang.com/session/minecraft/join');
  assert.deepEqual(JSON.parse(join.body), { accessToken: ACCESS, selectedProfile: ACCOUNT.id, serverId: 'srv-1' });
  assert.equal(verify.url, `${BASE}/v1/auth/verify`); assert.deepEqual(JSON.parse(verify.body), { challengeId: 'ch-1' });
  assert.equal(call.auth, `Bearer ${SESSION}-1`);
  // Das Minecraft-Token geht nur an Mojang, nie ans Caeser-Backend
  assert.ok(server.calls.filter(c => c.url.startsWith(BASE)).every(c => !String(c.body || '').includes(ACCESS) && !c.auth.includes(ACCESS)));
  await api.config();
  assert.equal(server.logins, 1, 'Token wird wiederverwendet');
});

test('401 führt zu genau einer Neuanmeldung', async t => {
  const { api, server } = await setup(t, { expireFirstToken: true });
  await api.me();
  assert.equal(server.logins, 2);
  assert.equal(server.calls.filter(c => c.url.endsWith('/v1/me')).length, 2);
  const always401 = backend();
  const failing = new CaeserApi({ directory: os.tmpdir(), baseUrl: BASE, account: async () => ACCOUNT, fetch: async (url, options) => new URL(url).pathname.startsWith('/v1/auth') || String(url).includes('mojang') ? always401.fetch(url, options) : json({ error: 'Nicht angemeldet.' }, 401) });
  await assert.rejects(failing.me(), /Nicht angemeldet/);
  assert.equal(always401.logins, 2, 'nach dem zweiten 401 keine weitere Anmeldung');
});

test('Netzwerkfehler und Backend-Fehler werden verständlich weitergegeben', async t => {
  const offline = new CaeserApi({ directory: os.tmpdir(), baseUrl: BASE, account: async () => ACCOUNT, fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(offline.me(), { message: 'Caeser-Server nicht erreichbar.' });
  const { api } = await setup(t);
  api.fetchImpl = async (url, options) => new URL(url).pathname === '/v1/capes' && options.method === 'POST' ? json({ error: 'Nicht genug Jetons.', code: 'NOT_ENOUGH_JETONS', missing: 40 }, 402) : backend().fetch(url, options);
  await assert.rejects(api.upload('Test', capePng), err => err.message === 'Nicht genug Jetons.' && err.code === 'NOT_ENOUGH_JETONS' && err.missing === 40);
});

test('Kein Token taucht in einer IPC-Antwort auf', async t => {
  const { handlers, dialog, dir } = await setup(t);
  const file = path.join(dir, 'cape.png'); await fs.writeFile(file, capePng);
  dialog.open.push({ canceled: false, filePaths: [file] });
  const responses = [
    await handlers['capes-config'](), await handlers['capes-list']({ sort: 'new', q: 'Anna' }), await handlers['capes-mine'](),
    await handlers['capes-favorites'](), await handlers['capes-favorite']({ id: CAPE_ID, favorite: true }), await handlers['capes-select']({ id: CAPE_ID }),
    await handlers['capes-select']({ id: null }), await handlers['capes-report']({ id: CAPE_ID, reason: 'Unpassend' }), await handlers['capes-image']({ id: CAPE_ID }),
    await handlers['vanilla-capes'](), await handlers['vanilla-cape-select']({ id: null }), await handlers['capes-upload-pick'](),
    await handlers['capes-upload-confirm']({ name: 'Mein Cape', accepted: true })
  ];
  const text = JSON.stringify(responses);
  for (const secret of [SESSION, ACCESS, REFRESH, 'Bearer']) assert.ok(!text.includes(secret), `${secret} darf nicht in IPC-Antworten stehen`);
  assert.ok(!text.includes(dir), 'keine Dateipfade');
  const list = responses[1];
  assert.deepEqual(list.items.map(c => c.id), [CAPE_ID], 'ungültige IDs aus dem Backend werden verworfen');
  assert.equal(responses.at(-1).jetons, 150);
});

test('IPC lehnt ungültige IDs und Parameter ab', async t => {
  const { handlers, server } = await setup(t);
  const bad = [
    ['capes-favorite', { id: '../etc', favorite: true }], ['capes-favorite', { id: CAPE_ID, favorite: 'ja' }], ['capes-favorite', null],
    ['capes-select', { id: 'a/b' }], ['capes-select', 'x'], ['capes-select', {}], ['capes-report', { id: CAPE_ID, reason: 'x' }], ['capes-report', { id: '..', reason: 'Unpassend' }],
    ['capes-image', { id: 'C:\\Windows\\win.ini' }], ['capes-image', { url: 'https://evil.example.com/x.png' }], ['capes-image', { vanilla: 'https://evil.example.com/x' }],
    ['capes-list', { sort: 'drop table' }], ['capes-list', { q: 'x'.repeat(65) }], ['capes-list', { cursor: 'a b' }], ['capes-list', { q: 'a\nb' }],
    ['vanilla-cape-select', { id: '../../x' }],
    ['capes-upload-confirm', { name: 'Test', accepted: false }], ['capes-upload-confirm', { name: '', accepted: true }], ['capes-upload-confirm', { name: 'x'.repeat(33), accepted: true }],
    ['capes-upload-crop', { offsetX: 0.5 }]
  ];
  for (const [name, input] of bad) await assert.rejects(Promise.resolve().then(() => handlers[name](input)), Error, `${name} ${JSON.stringify(input)}`);
  assert.equal(server.calls.length, 0, 'abgelehnte Anfragen erreichen kein Netzwerk');
});

test('capes-image lädt nur vom Backend-Host bzw. von textures.minecraft.net', async t => {
  const { api, handlers, server, dir } = await setup(t);
  const url = await handlers['capes-image']({ id: CAPE_ID });
  assert.match(url, /^data:image\/png;base64,/);
  assert.equal(server.calls.at(-1).url, `${BASE}/v1/capes/${CAPE_ID}.png`);
  await fs.access(path.join(dir, 'cape-cache', `${CAPE_ID}.png`));
  const count = server.calls.length;
  await handlers['capes-image']({ id: CAPE_ID });
  assert.equal(server.calls.length, count, 'zweiter Abruf aus dem Cache');
  await handlers['vanilla-capes']();
  assert.match(await handlers['capes-image']({ vanilla: '11111111-2222-3333-4444-555555555555' }), /^data:image\/png;base64,/);
  assert.equal(server.calls.at(-1).url, 'https://textures.minecraft.net/texture/abcdef0123456789abcdef', 'http wird auf https gehoben');
  const before = server.calls.length;
  await assert.rejects(handlers['capes-image']({ vanilla: '66666666-2222-3333-4444-555555555555' }), /nicht gefunden/);
  assert.equal(server.calls.length, before, 'fremder Host wird nicht abgerufen');
  for (const evil of ['https://evil.example.com/a.png', 'https://caeser.example.org.evil.com/a.png', 'file:///C:/Windows/win.ini', 'https://user:pw@caeser.example.org/a.png']) {
    await assert.rejects(api.loadImage(evil), /nicht erlaubt/);
  }
});

test('Cape-Cache ist auf 200 Dateien begrenzt, die ältesten werden gelöscht', async t => {
  const { api, dir } = await setup(t);
  const cache = path.join(dir, 'cape-cache'); await fs.mkdir(cache, { recursive: true });
  for (let i = 0; i < MAX_CACHE_FILES + 5; i++) {
    const file = path.join(cache, `cape${String(i).padStart(4, '0')}.png`);
    await fs.writeFile(file, capePng); const time = new Date(Date.now() - (1000 - i) * 1000); await fs.utimes(file, time, time);
  }
  await api.pruneCache();
  const names = (await fs.readdir(cache)).sort();
  assert.equal(names.length, MAX_CACHE_FILES);
  assert.equal(names[0], 'cape0005.png');
});

test('Upload-Prüfung: falsches Format wird abgelehnt', () => {
  assert.throws(() => inspectUpload(Buffer.from('GIF89a' + 'x'.repeat(40))), /PNG/);
  assert.throws(() => inspectUpload(Buffer.from('\xff\xd8\xff\xe0' + 'x'.repeat(40), 'latin1')), /PNG/);
  assert.throws(() => inspectUpload(Buffer.alloc(0)), /leer/);
  assert.throws(() => inspectUpload(Buffer.alloc(5 * 1024 * 1024 + 1)), /5 MB/);
  const broken = Buffer.from(capePng); broken.fill(0, 40, 60);
  assert.throws(() => inspectUpload(broken), /beschädigt|gelesen/);
});

test('Upload-Prüfung: Cape-Layout direkt, Hochformat-Bild wird zu einem 512×256-Cape', async t => {
  for (const [w, h] of [[64, 32], [512, 256], [1024, 512]]) assert.equal(inspectUpload(encodePng(bitmap(w, h))).kind, 'cape');
  assert.equal(inspectUpload(encodePng(bitmap(96, 48))).kind, 'photo', '2:1, aber keine erlaubte Größe');
  const { handlers, dialog, dir, server } = await setup(t);
  const photo = bitmap(300, 500, [200, 50, 50, 255]);
  for (let y = 0; y < 250; y++) for (let x = 0; x < 300; x++) photo.data.set([20, 200, 20, 255], (y * 300 + x) * 4);
  const file = path.join(dir, 'foto.png'); await fs.writeFile(file, encodePng(photo));
  dialog.open.push({ canceled: false, filePaths: [file] });
  const picked = await handlers['capes-upload-pick']();
  assert.equal(picked.kind, 'photo'); assert.equal(picked.name, 'foto');
  assert.match(picked.photo, /^data:image\/png;base64,/);
  assert.ok(Math.abs(picked.frame.width - 1) < 1e-9 && Math.abs(picked.frame.height - 480 / 500) < 1e-9);
  const top = await handlers['capes-upload-crop']({ offsetX: 0.5, offsetY: 0 });
  const cape = decodePng(Buffer.from(top.cape.split(',')[1], 'base64'));
  assert.deepEqual([cape.width, cape.height], [512, 256]);
  const px = (x, y) => [...cape.data.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4)];
  assert.deepEqual(px(48, 12), [20, 200, 20, 255], 'Vorderseite oben = oberer Bildteil');
  assert.deepEqual(px(48, 130), [200, 50, 50, 255], 'Vorderseite unten = unterer Bildteil');
  assert.ok(px(136, 12)[1] < 200 && px(136, 12)[1] > 80, 'Rückseite ist abgedunkelt');
  assert.equal(px(0, 60)[3], 255, 'Rand ist gefüllt');
  await handlers['capes-upload-confirm']({ name: 'Foto-Cape', accepted: true, offsetY: 0 });
  const post = server.calls.find(c => c.method === 'POST' && c.url.startsWith(`${BASE}/v1/capes?`));
  assert.equal(new URL(post.url).searchParams.get('name'), 'Foto-Cape');
  assert.deepEqual(pngSize(post.body), { width: 512, height: 256 });
  await assert.rejects(handlers['capes-upload-confirm']({ name: 'Nochmal', accepted: true }), /zuerst ein Bild/);
});
