const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { diagnoseCrash, executeAutoFix } = require('../src/game/crash-doctor.cjs');

describe('Crash Doctor Diagnostics', () => {
  test('identifies Out of Memory crash and provides autoFix', async () => {
    const logLines = [
      'Loading Minecraft 1.21.11',
      'java.lang.OutOfMemoryError: Java heap space',
      'Minecraft crashed'
    ];
    const profile = { id: 'prof-1', name: 'Test', memoryMb: 2048 };
    const result = await diagnoseCrash({ code: 1, logLines, profile, maxMemoryMb: 8192 });

    assert.equal(result.id, 'oom');
    assert.equal(result.title, 'Zu wenig Arbeitsspeicher (Out of Memory)');
    assert.ok(result.autoFix);
    assert.equal(result.autoFix.type, 'increase-ram');
    assert.equal(result.autoFix.payload.newMemoryMb, 4096);
  });

  test('identifies Missing Mod Dependency', async () => {
    const logLines = [
      'net.fabricmc.loader.impl.FormattedException: Some of your mods have failed to validate!',
      '- Mod \'sodium\' requires version 0.140.0 of mod \'fabric-api\', which is missing!'
    ];
    const profile = { id: 'prof-1', name: 'Test' };
    const result = await diagnoseCrash({ code: 1, logLines, profile });

    assert.equal(result.id, 'missing-dep');
    assert.match(result.cause, /fabric-api/);
  });

  test('identifies Incompatible Mods conflict', async () => {
    const logLines = [
      'Mod \'iris\' is incompatible with mod \'optifine\''
    ];
    const profile = { id: 'prof-1', name: 'Test' };
    const result = await diagnoseCrash({ code: 1, logLines, profile });

    assert.equal(result.id, 'mod-conflict');
    assert.match(result.cause, /iris.*optifine/);
    assert.equal(result.autoFix.type, 'disable-mod');
  });

  test('identifies Corrupted/Empty Mod file (ZipException)', async () => {
    const logLines = [
      'ModResolutionException: Mod discovery failed!',
      'RuntimeException: Error analyzing [C:\\Users\\test\\mods\\kaputte-mod.jar]:',
      'java.util.zip.ZipException: zip file is empty'
    ];
    const profile = { id: 'prof-1', name: 'Test' };
    const result = await diagnoseCrash({ code: 1, logLines, profile });

    assert.equal(result.id, 'corrupt-mod');
    assert.match(result.cause, /kaputte-mod\.jar/);
    assert.equal(result.autoFix.type, 'disable-mod');
  });

  test('identifies OpenGL GLFW driver issue', async () => {
    const logLines = [
      'GLFW error 65542: WGL: The driver does not appear to support OpenGL'
    ];
    const profile = { id: 'prof-1', name: 'Test' };
    const result = await diagnoseCrash({ code: 1, logLines, profile });

    assert.equal(result.id, 'opengl');
    assert.match(result.title, /OpenGL/);
    assert.equal(result.autoFix, null);
  });

  test('executes increase-ram autoFix', async () => {
    let savedProfile = null;
    const fakeController = {
      profiles: {
        data: { profiles: [{ id: 'prof-1', memoryMb: 2048 }] },
        save: async p => { savedProfile = p; }
      }
    };
    const res = await executeAutoFix({
      type: 'increase-ram',
      payload: { profileId: 'prof-1', newMemoryMb: 4096 }
    }, fakeController);

    assert.equal(res.success, true);
    assert.equal(savedProfile.memoryMb, 4096);
  });

});

describe('Crash Doctor Reparaturen', () => {
  const { Store } = require('../src/data/store.cjs');
  const { Profiles, instanceKey } = require('../src/data/profiles.cjs');

  async function setup(t, mode = 'fabric') {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-doctor-'));
    t.after(() => fs.rm(tmp, { recursive: true, force: true }));
    const profiles = new Profiles(new Store(tmp), 16384);
    await profiles.load({});
    const profile = await profiles.save({ name: 'Test', version: '1.21.11', mode, memoryMb: 2048 });
    const controller = { root: path.join(tmp, 'minecraft'), profiles, mods: { busy: false }, game: null, busy: false };
    const modsDir = path.join(controller.root, 'instances', instanceKey(profile), 'mods');
    await fs.mkdir(modsDir, { recursive: true });
    return { tmp, profiles, profile, controller, modsDir };
  }
  const disable = (controller, payload) => executeAutoFix({ type: 'disable-mod', payload }, controller);

  test('disable-mod leitet den Ordner aus dem Profil ab und ignoriert instanceDir', async t => {
    const { tmp, profile, controller, modsDir } = await setup(t);
    await fs.writeFile(path.join(modsDir, 'optifine-1.21.jar'), 'dummy');
    const foreign = path.join(tmp, 'fremd', 'mods'); await fs.mkdir(foreign, { recursive: true });
    await fs.writeFile(path.join(foreign, 'optifine-1.21.jar'), 'dummy');

    const res = await disable(controller, { profileId: profile.id, modName: 'optifine', instanceDir: path.join(tmp, 'fremd') });
    assert.equal(res.success, true);
    assert.deepEqual(await fs.readdir(modsDir), ['optifine-1.21.jar.disabled']);
    assert.deepEqual(await fs.readdir(foreign), ['optifine-1.21.jar'], 'fremder Ordner bleibt unberührt');
  });

  test('disable-mod nur mit instanceDir hat keine Wirkung', async t => {
    const { tmp, controller } = await setup(t);
    const foreign = path.join(tmp, 'fremd', 'mods'); await fs.mkdir(foreign, { recursive: true });
    await fs.writeFile(path.join(foreign, 'optifine.jar'), 'dummy');
    await assert.rejects(disable(controller, { instanceDir: path.join(tmp, 'fremd'), modName: 'optifine' }), /Profil nicht gefunden/);
    assert.deepEqual(await fs.readdir(foreign), ['optifine.jar']);
  });

  test('unbekannte profileId wird abgelehnt', async t => {
    const { controller } = await setup(t);
    await assert.rejects(disable(controller, { profileId: '00000000-0000-4000-8000-000000000000', modName: 'optifine' }), /Profil nicht gefunden/);
  });

  test('zu kurze, ungültige oder mehrdeutige Mod-Namen benennen nichts um', async t => {
    const { profile, controller, modsDir } = await setup(t);
    const files = ['optifine-1.21.jar', 'optifine-addon.jar', 'sodium.jar'];
    for (const f of files) await fs.writeFile(path.join(modsDir, f), 'dummy');
    for (const modName of ['a', 'ab', '-_-']) await assert.rejects(disable(controller, { profileId: profile.id, modName }), /zu kurz/);
    for (const modName of ['', 42, null, '../sodium', 'mods\\sodium', 'x'.repeat(101)]) await assert.rejects(disable(controller, { profileId: profile.id, modName }), /Ungültige Mod-Angaben/);
    await assert.rejects(disable(controller, { profileId: profile.id, modName: 'optifine' }), err => /Mehrere Mod-Dateien/.test(err.message) && err.message.includes('optifine-1.21.jar') && err.message.includes('optifine-addon.jar'));
    assert.deepEqual((await fs.readdir(modsDir)).sort(), files.sort());
  });

  test('exakter Dateiname hat Vorrang vor Teiltreffern', async t => {
    const { profile, controller, modsDir } = await setup(t);
    await fs.writeFile(path.join(modsDir, 'sodium.jar'), 'dummy');
    await fs.writeFile(path.join(modsDir, 'sodium-extra.jar'), 'dummy');
    await disable(controller, { profileId: profile.id, modName: 'sodium' });
    assert.deepEqual((await fs.readdir(modsDir)).sort(), ['sodium-extra.jar', 'sodium.jar.disabled']);
  });

  test('mitgelieferte Caeser-Dateien werden nicht deaktiviert', async t => {
    const { profile, controller, modsDir } = await setup(t, 'caeser');
    await fs.writeFile(path.join(modsDir, 'caeserclient-1.0.0.jar'), 'dummy');
    await assert.rejects(disable(controller, { profileId: profile.id, modName: 'caeserclient-1.0.0' }), /gehört zum Caeser-Profil/);
    assert.deepEqual(await fs.readdir(modsDir), ['caeserclient-1.0.0.jar']);
  });

  test('Reparaturen werden abgelehnt, solange Minecraft läuft oder Mods installiert werden', async t => {
    const { profile, controller, modsDir } = await setup(t);
    await fs.writeFile(path.join(modsDir, 'sodium.jar'), 'dummy');
    await assert.rejects(disable({ ...controller, game: {} }, { profileId: profile.id, modName: 'sodium' }), /Minecraft beenden/);
    await assert.rejects(disable({ ...controller, mods: { busy: true } }, { profileId: profile.id, modName: 'sodium' }), /Mods installiert/);
    await assert.rejects(executeAutoFix({ type: 'increase-ram', payload: { profileId: profile.id, newMemoryMb: 4096 } }, { ...controller, game: {} }), /Minecraft beenden/);
    assert.deepEqual(await fs.readdir(modsDir), ['sodium.jar']);
  });

  test('RAM-Reparatur an einem nicht aktiven Profil wechselt das aktive Profil nicht', async t => {
    const { profiles, profile, controller } = await setup(t);
    const other = await profiles.save({ name: 'Aktiv', version: '1.21.11', mode: 'vanilla', memoryMb: 2048 });
    assert.equal(profiles.data.activeId, other.id);
    await executeAutoFix({ type: 'increase-ram', payload: { profileId: profile.id, newMemoryMb: 4096 } }, controller);
    assert.equal(profiles.data.activeId, other.id);
    assert.equal(profiles.data.profiles.find(p => p.id === profile.id).memoryMb, 4096);
  });

  test('Diagnose liefert profileId statt instanceDir in der Payload', async () => {
    const result = await diagnoseCrash({ code: 1, logLines: ["Mod 'iris' is incompatible with mod 'optifine'"], profile: { id: 'p1' }, instanceDir: 'C:\\irgendwo' });
    assert.deepEqual(result.autoFix.payload, { profileId: 'p1', modName: 'optifine' });
  });
});
