const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Controller } = require('../src/app/controller.cjs');
const { CurseForge } = require('../src/mods/providers.cjs');

const fakeEncryption = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-cf-key-'));
  const env = process.env.CAESER_CURSEFORGE_KEY; delete process.env.CAESER_CURSEFORGE_KEY;
  const controller = new Controller({ directory: dir, encryption: fakeEncryption, resources: dir, appVersion: 'test', emit: () => {}, openBrowser: () => {} });
  await controller.load();
  const profile = await controller.profiles.save({ name: 'Fabric', version: '1.21.6', mode: 'fabric', memoryMb: 2048 });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: new URL(url), options });
    if (String(url).includes('modrinth')) return Response.json({ total_hits: 1, hits: [{ project_id: 'abc', title: 'Sodium', description: '', author: 'x', icon_url: '', downloads: 1 }] });
    return Response.json({ data: [], pagination: { totalCount: 0 } });
  });
  t.after(async () => {
    if (env === undefined) delete process.env.CAESER_CURSEFORGE_KEY; else process.env.CAESER_CURSEFORGE_KEY = env;
    controller.destroy(); await fs.rm(dir, { recursive: true, force: true });
  });
  return { controller, profile, calls };
}

test('Ohne Schlüssel ist CurseForge nicht eingerichtet, Modrinth funktioniert', async t => {
  const { controller, profile, calls } = await setup(t);
  assert.equal(controller.state().curseforgeConfigured, false);
  assert.equal(new CurseForge().key, '', 'kein eingebauter Standardschlüssel');
  await assert.rejects(controller.mods.search({ profileId: profile.id, source: 'curseforge', query: 'jei' }), /benötigt einen API-Schlüssel/);
  assert.equal(calls.length, 0, 'ohne Schlüssel keine Anfrage an CurseForge');
  const result = await controller.mods.search({ profileId: profile.id, source: 'modrinth', query: 'sodium' });
  assert.equal(result.hits[0].title, 'Sodium');
});

test('Mit gespeichertem Schlüssel oder Umgebungsvariable wird CurseForge genutzt', async t => {
  const { controller, profile, calls } = await setup(t);
  process.env.CAESER_CURSEFORGE_KEY = 'env-key';
  assert.equal(controller.state().curseforgeConfigured, true);
  delete process.env.CAESER_CURSEFORGE_KEY;
  await controller.setCurseForgeKey('eigener-schluessel');
  assert.equal(controller.state().curseforgeConfigured, true);
  await controller.mods.search({ profileId: profile.id, source: 'curseforge', query: 'jei' });
  assert.equal(calls.at(-1).options.headers['x-api-key'], 'eigener-schluessel');
  await controller.setCurseForgeKey('');
  assert.equal(controller.state().curseforgeConfigured, false);
});
