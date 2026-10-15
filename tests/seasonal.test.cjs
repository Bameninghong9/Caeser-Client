const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { Controller } = require('../src/app/controller.cjs');
const load = () => import(pathToFileURL(path.join(__dirname, '../ui/modules/seasonal.js')).href);

test('Saisonale Deko: Oktober an, Juni aus, Grenzen 1.10. bis 2.11.', async () => {
  const { isHalloweenSeason, seasonalActive } = await load();
  assert.equal(seasonalActive('auto', new Date(2026, 9, 14)), true);
  assert.equal(seasonalActive('auto', new Date(2026, 5, 14)), false);
  assert.equal(isHalloweenSeason(new Date(2026, 9, 1, 0, 0)), true);
  assert.equal(isHalloweenSeason(new Date(2026, 10, 2, 23, 59)), true);
  assert.equal(isHalloweenSeason(new Date(2026, 10, 3)), false);
  assert.equal(isHalloweenSeason(new Date(2026, 8, 30, 23, 59)), false);
  assert.equal(seasonalActive(undefined, new Date(2026, 9, 31)), true, 'ohne Einstellung gilt automatisch');
});

test('Saisonale Deko: Nutzer-Override gewinnt gegen das Datum', async () => {
  const { seasonalActive, nextSeasonalSetting } = await load();
  const october = new Date(2026, 9, 20), june = new Date(2026, 5, 20);
  assert.equal(seasonalActive('off', october), false);
  assert.equal(seasonalActive('on', june), true);
  // Schalter: Abweichung vom Datum wird gespeichert, Übereinstimmung fällt auf 'auto' zurück
  assert.equal(nextSeasonalSetting(false, october), 'off');
  assert.equal(nextSeasonalSetting(true, october), 'auto');
  assert.equal(nextSeasonalSetting(true, june), 'on');
  assert.equal(nextSeasonalSetting(false, june), 'auto');
});

test('Saisonale Deko: Einstellung wird geprüft und gespeichert', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-seasonal-'));
  try {
    const controller = new Controller({ directory: dir, resources: dir, appVersion: '0.0.0', emit: () => {}, openBrowser: () => {} });
    await controller.load();
    assert.equal(controller.state().settings.seasonal, 'auto');
    assert.equal((await controller.updateSettings({ seasonal: 'off' })).settings.seasonal, 'off');
    await assert.rejects(controller.updateSettings({ seasonal: 'spooky' }), /saisonale Deko/);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf8')).seasonal, 'off');
    controller.destroy();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
