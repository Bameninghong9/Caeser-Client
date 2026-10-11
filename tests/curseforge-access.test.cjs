const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Controller } = require('../src/app/controller.cjs');
const { CurseForge } = require('../src/mods/providers.cjs');
const { curseforgeAccess } = require('../src/mods/curseforge-config.cjs');

const fakeEncryption = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
const TEST_KEY = 'projekt-testschluessel-123';

async function setup(t, access, before) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-cf-access-'));
  if (before) await before(dir);
  const controller = new Controller({ directory: dir, encryption: fakeEncryption, resources: dir, appVersion: 'test', emit: () => {}, openBrowser: () => {}, curseforgeAccess: () => access });
  await controller.load();
  const profile = await controller.profiles.save({ name: 'Fabric', version: '1.21.6', mode: 'fabric', memoryMb: 2048 });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: new URL(url), options });
    if (String(url).includes('modrinth')) return Response.json({ total_hits: 1, hits: [{ project_id: 'abc', title: 'Sodium', description: '', author: 'x', icon_url: '', downloads: 1 }] });
    return Response.json({ data: [], pagination: { totalCount: 0 } });
  });
  t.after(async () => { controller.destroy(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, controller, profile, calls };
}

test('Reihenfolge der Zugangsquellen: Proxy, Build-Schlüssel, Entwicklervariable, nichts', () => {
  const env = { CAESER_CURSEFORGE_KEY: 'dev-key' };
  assert.deepEqual(curseforgeAccess({ buildConfig: { curseforge: { proxy: 'https://cf.example.org/', key: 'k' } }, isPackaged: true, env }), { mode: 'proxy', baseUrl: 'https://cf.example.org' });
  assert.deepEqual(curseforgeAccess({ buildConfig: { curseforge: { proxy: '', key: 'k' } }, isPackaged: true, env }), { mode: 'key', baseUrl: 'https://api.curseforge.com', key: 'k' });
  assert.deepEqual(curseforgeAccess({ buildConfig: {}, isPackaged: false, env }), { mode: 'key', baseUrl: 'https://api.curseforge.com', key: 'dev-key' });
  assert.equal(curseforgeAccess({ buildConfig: {}, isPackaged: true, env }), null, 'gepackt wird die Umgebungsvariable ignoriert');
  assert.equal(curseforgeAccess({ buildConfig: { curseforge: { proxy: 'http://unsicher.example' } }, isPackaged: true, env: {} }), null, 'kein http-Proxy');
  assert.equal(curseforgeAccess({ buildConfig: {}, isPackaged: false, env: {} }), null);
});

test('Proxy-Modus: Anfrage an die Proxy-URL ohne x-api-key', async t => {
  const { controller, profile, calls } = await setup(t, { mode: 'proxy', baseUrl: 'https://cf-proxy.example.org' });
  assert.equal(controller.state().curseforgeAvailable, true);
  await controller.mods.search({ profileId: profile.id, source: 'curseforge', query: 'jei' });
  assert.equal(calls[0].url.origin, 'https://cf-proxy.example.org');
  assert.equal(calls[0].url.pathname, '/v1/mods/search');
  assert.equal(calls[0].options.headers['x-api-key'], undefined);
});

test('Schlüssel-Modus: Anfrage an api.curseforge.com mit Header', async t => {
  const { controller, profile, calls } = await setup(t, { mode: 'key', baseUrl: 'https://api.curseforge.com', key: TEST_KEY });
  await controller.mods.search({ profileId: profile.id, source: 'curseforge', query: 'jei' });
  assert.equal(calls[0].url.origin, 'https://api.curseforge.com');
  assert.equal(calls[0].options.headers['x-api-key'], TEST_KEY);
  assert.ok(!JSON.stringify(controller.state()).includes(TEST_KEY), 'state() enthält nie den Schlüssel');
});

test('Ohne Konfiguration: verständlicher Fehler, Modrinth funktioniert', async t => {
  const { controller, profile, calls } = await setup(t, null);
  assert.equal(controller.state().curseforgeAvailable, false);
  await assert.rejects(controller.mods.search({ profileId: profile.id, source: 'curseforge', query: 'jei' }), /in dieser Version nicht verfügbar/);
  assert.equal(calls.length, 0);
  assert.equal((await controller.mods.search({ profileId: profile.id, source: 'modrinth', query: 'sodium' })).hits[0].title, 'Sodium');
});

test('Abgelehnter Zugang oder Rate-Limit: Meldung ohne Verweis auf Einstellungen', async t => {
  for (const status of [401, 403, 429]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'x' }, { status }));
    const cf = new CurseForge({ mode: 'proxy', baseUrl: 'https://cf-proxy.example.org' });
    await assert.rejects(cf.search({ version: '1.21.6', mode: 'fabric' }, ''), err => /gerade nicht erreichbar/.test(err.message) && !/Einstellungen/.test(err.message));
    t.mock.restoreAll();
  }
});

test('Migration: alter curseforgeKey in integrations.bin wird entfernt', async t => {
  const { dir, controller } = await setup(t, null, async d => {
    await fs.writeFile(path.join(d, 'integrations.bin'), fakeEncryption.encryptString(JSON.stringify({ curseforgeKey: 'alter-nutzerschluessel' })));
  });
  await assert.rejects(fs.access(path.join(dir, 'integrations.bin')), 'leere Datei wird gelöscht');
  assert.equal(controller.notice, undefined, 'kein Hinweis an den Nutzer');
  assert.equal(typeof controller.setCurseForgeKey, 'undefined');
  assert.ok(!JSON.stringify(controller.state()).includes('alter-nutzerschluessel'));
});

test('Migration: unlesbare integrations.bin wird still entfernt', async t => {
  const { dir, controller } = await setup(t, null, async d => { await fs.writeFile(path.join(d, 'integrations.bin'), 'kaputt'); });
  await assert.rejects(fs.access(path.join(dir, 'integrations.bin')));
  assert.equal(controller.notice, undefined);
});
