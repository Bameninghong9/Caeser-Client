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

  test('executes disable-mod autoFix', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-test-mods-'));
    const modsDir = path.join(tmpDir, 'mods');
    await fs.mkdir(modsDir, { recursive: true });
    await fs.writeFile(path.join(modsDir, 'optifine-1.21.jar'), 'dummy');

    const res = await executeAutoFix({
      type: 'disable-mod',
      payload: { instanceDir: tmpDir, modName: 'optifine' }
    }, {});

    assert.equal(res.success, true);
    const files = await fs.readdir(modsDir);
    assert.ok(files.includes('optifine-1.21.jar.disabled'));
    assert.ok(!files.includes('optifine-1.21.jar'));

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
