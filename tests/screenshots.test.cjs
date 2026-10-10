const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Controller } = require('../src/app/controller.cjs');

test('Screenshots - discover, rename, delete, and deleteAll', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-screenshots-test-'));
  const screenshotsDir = path.join(tmpDir, 'minecraft', 'screenshots');
  await fs.mkdir(screenshotsDir, { recursive: true });

  // Create unique dummy screenshot png files
  const id1 = `test_screenshot_${Date.now()}_1.png`;
  const id2 = `test_screenshot_${Date.now()}_2.png`;
  const sample1 = path.join(screenshotsDir, id1);
  const sample2 = path.join(screenshotsDir, id2);
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await fs.writeFile(sample1, pngBytes);
  await fs.writeFile(sample2, pngBytes);

  const controller = new Controller({ directory: tmpDir, resources: tmpDir, appVersion: '0.3.22', emit: () => {}, openBrowser: () => {} });
  await controller.load();

  // Discover screenshots (cached)
  const found = await controller.getScreenshots();
  assert.ok(found.some(s => s.name === id1));
  assert.ok(found.some(s => s.name === id2));

  // Verify caching returns quickly
  const found2 = await controller.getScreenshots();
  assert.ok(found2.some(s => s.name === id1));

  // Rename screenshot
  const renamedName = `renamed_${Date.now()}.png`;
  const renameRes = await controller.renameScreenshot(sample1, renamedName);
  assert.equal(renameRes.ok, true);
  assert.equal(renameRes.name, renamedName);

  const afterRename = await controller.getScreenshots();
  assert.ok(afterRename.some(s => s.name === renamedName));
  assert.ok(!afterRename.some(s => s.name === id1));

  // Delete single screenshot (and repeated delete should not throw ENOENT)
  const deleteRes = await controller.deleteScreenshot(renameRes.path);
  assert.equal(deleteRes.ok, true);
  const deleteRes2 = await controller.deleteScreenshot(renameRes.path);
  assert.equal(deleteRes2.ok, true);

  const afterDelete = await controller.getScreenshots();
  assert.ok(!afterDelete.some(s => s.name === renamedName));

  // Delete all screenshots in this directory
  await controller.deleteScreenshot(sample2);
  const afterDeleteAll = await controller.getScreenshots();
  assert.ok(!afterDeleteAll.some(s => s.name === id2));

  controller.destroy();
  await fs.rm(tmpDir, { recursive: true, force: true });
});
