const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { writeBuildConfig } = require('../scripts/write-build-config.cjs');

const SECRET = 'geheimer-projektschluessel-xyz';

async function run(t, env) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-build-config-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const outFile = path.join(dir, 'generated', 'build-config.cjs');
  const output = [];
  const config = writeBuildConfig({ env, outFile, log: m => output.push(m), warn: m => output.push(m) });
  return { config, outFile, output: output.join('\n') };
}

test('Schreibt Proxy und Schlüssel in die Build-Konfiguration, ohne den Schlüssel auszugeben', async t => {
  const { outFile, output } = await run(t, { CAESER_CURSEFORGE_PROXY: 'https://cf.example.org/', CAESER_CURSEFORGE_KEY: SECRET });
  delete require.cache[outFile];
  assert.deepEqual(require(outFile), { curseforge: { proxy: 'https://cf.example.org', key: SECRET } });
  assert.ok(!output.includes(SECRET), 'Schlüssel erscheint nicht auf der Konsole');
  assert.match(output, /Schlüssel gesetzt: ja/);
});

test('Ohne Variablen: leere Konfiguration und deutliche Warnung', async t => {
  const { outFile, output } = await run(t, {});
  delete require.cache[outFile];
  assert.deepEqual(require(outFile), { curseforge: { proxy: '', key: '' } });
  assert.match(output, /Build ohne CurseForge/);
});

test('Lehnt unsichere oder ungültige Werte ab', async t => {
  await assert.rejects(run(t, { CAESER_CURSEFORGE_PROXY: 'http://cf.example.org' }), /https:\/\//);
  await assert.rejects(run(t, { CAESER_CURSEFORGE_PROXY: 'kein url' }), /keine gültige URL/);
  await assert.rejects(run(t, { CAESER_CURSEFORGE_PROXY: 'https://user:pw@cf.example.org' }), /Zugangsdaten/);
  await assert.rejects(run(t, { CAESER_CURSEFORGE_KEY: 'a\nb' }), err => /ungültig/.test(err.message) && !err.message.includes('a\nb'));
  await assert.rejects(run(t, { CAESER_CURSEFORGE_KEY: 'x'.repeat(1025) }), /ungültig/);
});
