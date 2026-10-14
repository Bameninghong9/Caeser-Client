const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Controller } = require('../src/app/controller.cjs');

test('Cosmetics - default structure and initial state', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-cosmetics-'));
  try {
    const controller = new Controller({ directory: dir, resources: dir, appVersion: '0.3.18', emit: () => {}, openBrowser: () => {} });
    await controller.load();
    const state = controller.state();
    assert.ok(state.cosmetics, 'Cosmetics object should exist');
    assert.equal(state.cosmetics.wings?.type, 'none');
    assert.equal(state.cosmetics.head?.type, 'none');
    assert.equal(state.cosmetics.pet?.type, 'none');
    assert.match(state.cosmetics.wings?.color, /^#[0-9a-f]{6}$/i);
    assert.match(state.cosmetics.head?.color, /^#[0-9a-f]{6}$/i);
    assert.match(state.cosmetics.pet?.color, /^#[0-9a-f]{6}$/i);
    controller.destroy();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Cosmetics - updateSettings updates cosmetic types and custom hex colors', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-cosmetics-'));
  try {
    const controller = new Controller({ directory: dir, resources: dir, appVersion: '0.3.18', emit: () => {}, openBrowser: () => {} });
    await controller.load();

    // 1. Equip Dragon wings and Angel Halo
    await controller.updateSettings({
      cosmetics: {
        wings: { type: 'dragon', color: '#ff2200' },
        head: { type: 'halo', color: '#ffd700' }
      }
    });
    let state = controller.state();
    assert.equal(state.cosmetics.wings.type, 'dragon');
    assert.equal(state.cosmetics.wings.color, '#ff2200');
    assert.equal(state.cosmetics.head.type, 'halo');
    assert.equal(state.cosmetics.head.color, '#ffd700');
    assert.equal(state.cosmetics.pet.type, 'none');

    // 2. Equip Ghost pet
    await controller.updateSettings({
      cosmetics: {
        pet: { type: 'ghost', color: '#00ffff' }
      }
    });
    state = controller.state();
    assert.equal(state.cosmetics.pet.type, 'ghost');
    assert.equal(state.cosmetics.pet.color, '#00ffff');
    assert.equal(state.cosmetics.wings.type, 'dragon'); // retains wings

    // 2b. Equip Mini-Me (self) and Custom player pet
    await controller.updateSettings({
      cosmetics: {
        pet: { type: 'self' }
      }
    });
    state = controller.state();
    assert.equal(state.cosmetics.pet.type, 'self');

    await controller.updateSettings({
      cosmetics: {
        pet: { type: 'custom', customPlayer: 'spieler1', customSkinUrl: 'data:image/png;base64,abc' }
      }
    });
    state = controller.state();
    assert.equal(state.cosmetics.pet.type, 'custom');
    assert.equal(state.cosmetics.pet.customPlayer, 'spieler1');
    assert.equal(state.cosmetics.pet.customSkinUrl, 'data:image/png;base64,abc');

    // 3. Invalid cosmetic values safely fall back
    await controller.updateSettings({
      cosmetics: {
        wings: { type: 'invalid_type', color: 'not_a_color' },
        head: { type: 'horns', color: '#8800ff' }
      }
    });
    state = controller.state();
    assert.equal(state.cosmetics.wings.type, 'dragon'); // retained valid
    assert.equal(state.cosmetics.head.type, 'horns');
    assert.equal(state.cosmetics.head.color, '#8800ff');
    controller.destroy();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Cosmetics - launcher prepare writes cosmetics.json to instance config folder', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-cosmetics-'));
  try {
    const instanceDir = path.join(dir, 'instances', 'test-profile');
    const clientConfigDir = path.join(instanceDir, 'config', 'CaeserClient');
    await fs.mkdir(clientConfigDir, { recursive: true });

    const cosmetics = {
      wings: { type: 'angel', color: '#ffffff' },
      head: { type: 'horns', color: '#dc2626' },
      pet: { type: 'cube', color: '#38bdf8' }
    };

    await fs.writeFile(path.join(clientConfigDir, 'cosmetics.json'), JSON.stringify(cosmetics, null, 2), 'utf8');

    const written = JSON.parse(await fs.readFile(path.join(clientConfigDir, 'cosmetics.json'), 'utf8'));
    assert.equal(written.wings.type, 'angel');
    assert.equal(written.wings.color, '#ffffff');
    assert.equal(written.head.type, 'horns');
    assert.equal(written.pet.type, 'cube');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Cosmetics - Spielstart behält alle Felder der Mod in cosmetics.json (face, emotes, Emote-Rad, Kill-Effekt)', () => {
  const { mergeModCosmetics } = require('../src/game/launcher.cjs');
  const existing = {
    wings: { type: 'angel', color: '#ffffff' },
    head: { type: 'crown', color: '#facc15' },
    pet: { type: 'none', color: '#38bdf8' },
    accessories: ['minime_hand'],
    face: { type: 'sunglasses' },
    emotes: { list: ['T_POSE', 'BUTTERFLY'] },
    wheel_slots: ['t_pose', 'butterfly'],
    killEffect: 'KILL_ANVIL',
    killEffectSettings: { showOthers: true, sounds: false }
  };
  const merged = mergeModCosmetics(existing, { wings: { type: 'dragon' }, face: { type: 'skull_mask' } });
  assert.deepEqual(merged.face, { type: 'sunglasses' });
  assert.deepEqual(merged.emotes, existing.emotes);
  assert.deepEqual(merged.wheel_slots, existing.wheel_slots);
  assert.equal(merged.killEffect, 'KILL_ANVIL');
  assert.deepEqual(merged.killEffectSettings, existing.killEffectSettings);
  assert.equal(merged.wings.type, 'angel', 'Wert aus der Mod-Datei hat Vorrang');
  assert.deepEqual(merged.accessories, ['minime_hand']);

  const fresh = mergeModCosmetics({}, { head: { type: 'halo' } });
  assert.equal(fresh.head.type, 'halo');
  assert.equal(fresh.wings.type, 'none');
  assert.deepEqual(mergeModCosmetics(['kaputt'], null).accessories, []);
});
