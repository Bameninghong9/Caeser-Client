const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Controller } = require('../src/app/controller.cjs');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function setup(t) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-screens-sec-'));
  const appData = process.env.APPDATA;
  process.env.APPDATA = path.join(tmp, 'appdata');
  const shots = path.join(tmp, 'minecraft', 'screenshots');
  const outside = path.join(tmp, 'outside');
  await fs.mkdir(shots, { recursive: true }); await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(shots, 'echt.png'), png);
  const secret = path.join(outside, 'geheim.png'); await fs.writeFile(secret, png);
  const victim = path.join(outside, 'opfer.txt'); await fs.writeFile(victim, 'nicht anfassen');
  const controller = new Controller({ directory: tmp, resources: tmp, appVersion: 'test', emit: () => {}, openBrowser: () => {} });
  t.after(async () => {
    controller.destroy();
    if (appData === undefined) delete process.env.APPDATA; else process.env.APPDATA = appData;
    await fs.rm(tmp, { recursive: true, force: true });
  });
  return { tmp, shots, outside, secret, victim, controller };
}

const allOps = (c, id) => [
  () => c.getScreenshotFull(id), () => c.openScreenshot(id), () => c.deleteScreenshot(id),
  () => c.renameScreenshot(id, 'neu'), () => c.copyScreenshot(id)
];

test('Erfundene IDs und rohe Pfade werden abgelehnt, ohne Dateien zu berühren', async t => {
  const { controller, secret, victim } = await setup(t);
  await controller.getScreenshots();
  const forged = Buffer.from(secret).toString('base64url'); // altes, dekodierbares ID-Format
  for (const id of ['erfunden', forged, secret, victim, 'C:\\Windows\\System32\\notepad.exe', '', null, undefined, 42, { id: secret }]) {
    for (const op of allOps(controller, id)) await assert.rejects(op, /Screenshot nicht gefunden/);
  }
  assert.equal(await fs.readFile(victim, 'utf8'), 'nicht anfassen');
  await fs.access(secret);
});

test('Gültige IDs funktionieren und liefern keine Pfade', async t => {
  const { controller } = await setup(t);
  const [item] = await controller.getScreenshots();
  assert.equal(item.name, 'echt.png'); assert.equal(item.path, undefined);
  assert.match(await controller.getScreenshotFull(item.id), /^data:image\/png;base64,/);
});

test('Symlinks und Junctions, die aus dem Screenshot-Ordner herausführen, werden abgelehnt', async t => {
  const { controller, shots, outside, secret } = await setup(t);
  // Junction (unter Windows ohne Adminrechte möglich) auf einen fremden Ordner
  await fs.symlink(outside, path.join(shots, 'link'), 'junction');
  let fileLink = false;
  try { await fs.symlink(secret, path.join(shots, 'verlinkt.png'), 'file'); fileLink = true; } catch {}
  const list = await controller.getScreenshots();
  assert.deepEqual(list.map(s => s.name), ['echt.png'], 'Links werden nicht aufgelistet');

  // Selbst wenn ein Eintrag in den Index gelangt, verhindert die realpath-Prüfung den Zugriff.
  controller.screenshotIndex.set('via-junction', path.join(shots, 'link', 'geheim.png'));
  await assert.rejects(controller.getScreenshotFull('via-junction'), /außerhalb der erlaubten Ordner/);
  await assert.rejects(controller.deleteScreenshot('via-junction'), /außerhalb der erlaubten Ordner/);
  if (fileLink) {
    controller.screenshotIndex.set('via-symlink', path.join(shots, 'verlinkt.png'));
    await assert.rejects(controller.getScreenshotFull('via-symlink'), /Ungültige Screenshot-Datei/);
    await assert.rejects(controller.deleteScreenshot('via-symlink'), /Ungültige Screenshot-Datei/);
  }
  // Nicht-PNG im erlaubten Ordner
  await fs.writeFile(path.join(shots, 'boese.exe'), 'MZ');
  controller.screenshotIndex.set('exe', path.join(shots, 'boese.exe'));
  await assert.rejects(controller.openScreenshot('exe'), /Ungültige Screenshot-Datei/);
  await fs.access(secret); await fs.access(path.join(shots, 'boese.exe'));
});

test('Umbenennen lehnt gefährliche Namen ab und bleibt im selben Ordner', async t => {
  const { controller, shots } = await setup(t);
  const [item] = await controller.getScreenshots();
  for (const name of ['.', '..', '...', 'CON', 'nul', 'com1', 'LPT9.png', 'aux.txt', 'x'.repeat(121), '   ', 42]) {
    await assert.rejects(controller.renameScreenshot(item.id, name), /Ungültiger Name|reserviert|120 Zeichen/, String(name));
  }
  const res = await controller.renameScreenshot(item.id, '..\\..\\ausbruch');
  assert.equal(res.name, '.._.._ausbruch.png');
  await fs.access(path.join(shots, '.._.._ausbruch.png'));
  await assert.rejects(controller.getScreenshotFull(item.id), /Screenshot nicht gefunden/, 'alte ID verfällt');
  assert.match(await controller.getScreenshotFull(res.id), /^data:image\/png/);
});

test('Alle löschen entfernt nur PNGs aus den erlaubten Ordnern', async t => {
  const { controller, shots, outside, secret } = await setup(t);
  await fs.symlink(outside, path.join(shots, 'link'), 'junction');
  const res = await controller.deleteAllScreenshots();
  assert.equal(res.count, 1);
  await fs.access(secret);
  await assert.rejects(fs.access(path.join(shots, 'echt.png')));
});
