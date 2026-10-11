const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

// Lädt die Worker-Vorlage (ES-Modul) über eine temporäre .mjs-Kopie und simuliert Cache und Upstream.
async function loadWorker(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-worker-'));
  const file = path.join(dir, 'worker.mjs');
  await fs.copyFile(path.join(__dirname, '..', 'proxy', 'curseforge-worker.js'), file);
  const store = new Map(), upstream = [];
  globalThis.caches = { default: { match: async req => store.get(req.url)?.clone(), put: async (req, res) => { store.set(req.url, res); } } };
  t.mock.method(globalThis, 'fetch', async (url, options) => { upstream.push({ url, headers: options.headers }); return Response.json({ data: [] }); });
  t.after(async () => { delete globalThis.caches; await fs.rm(dir, { recursive: true, force: true }); });
  const worker = (await import(pathToFileURL(file).href)).default;
  const ctx = { waitUntil: p => p };
  const call = (pathAndQuery, init = {}) => worker.fetch(new Request(`https://proxy.example${pathAndQuery}`, init), { CURSEFORGE_API_KEY: 'worker-secret' }, ctx);
  return { call, upstream };
}

test('Proxy leitet nur erlaubte Routen weiter und hängt den Schlüssel an', async t => {
  const { call, upstream } = await loadWorker(t);
  const ok = await call('/v1/mods/search?gameId=432&classId=6&gameVersion=1.21.6&modLoaderType=4&searchFilter=jei&index=0&pageSize=20&sortField=6&sortOrder=desc');
  assert.equal(ok.status, 200);
  assert.equal(upstream[0].url.startsWith('https://api.curseforge.com/v1/mods/search?'), true);
  assert.equal(upstream[0].headers['x-api-key'], 'worker-secret');
  for (const p of ['/v1/mods/238222', '/v1/mods/238222/files?gameVersion=1.21.6&pageSize=50&index=0', '/v1/mods/238222/files/4711']) assert.equal((await call(p)).status, 200, p);
  // zweite gleiche Anfrage kommt aus dem Cache
  await call('/v1/mods/238222'); assert.equal(upstream.length, 4);
});

test('Proxy lehnt fremde Routen, Methoden und Parameter ab', async t => {
  const { call, upstream } = await loadWorker(t);
  assert.equal((await call('/v1/games')).status, 404);
  assert.equal((await call('/v1/fingerprints', { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await call('/v1/mods/search?gameId=1&classId=6')).status, 400, 'nur Minecraft');
  assert.equal((await call('/v1/mods/search?gameId=432&classId=999')).status, 400);
  assert.equal((await call('/v1/mods/search?gameId=432&classId=6&pageSize=500')).status, 400);
  assert.equal((await call('/v1/mods/1?evil=1')).status, 400);
  assert.equal((await call('/v1/mods/abc')).status, 404);
  assert.equal(upstream.length, 0);
});
