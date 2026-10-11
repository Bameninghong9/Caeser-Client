const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { Controller } = require('../src/app/controller.cjs');
const { sniffMedia } = require('../src/app/wallpaper.cjs');
const { validateSkinDataUrl } = require('../src/shared/skins.cjs');

function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
function png(width, height) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dataUrl = (buffer, mime = 'image/png') => `data:${mime};base64,${buffer.toString('base64')}`;
const MP4_HEAD = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);

async function setup(t, before) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-wallpaper-'));
  if (before) await before(dir);
  const controller = new Controller({ directory: dir, resources: dir, appVersion: 'test', emit: () => {}, openBrowser: () => {} });
  controller.discordRpc.setEnabled = () => {};
  await controller.load();
  t.after(async () => { controller.destroy(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, controller };
}

test('Dateityp wird anhand der ersten Bytes erkannt', () => {
  assert.equal(sniffMedia(png(1, 1)), 'png');
  assert.equal(sniffMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(sniffMedia(Buffer.from('GIF89a......')), 'gif');
  assert.equal(sniffMedia(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  assert.equal(sniffMedia(MP4_HEAD), 'mp4');
  assert.equal(sniffMedia(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01])), 'webm');
  assert.equal(sniffMedia(Buffer.from('MZ\x90\0\x03\0\0\0')), null);
});

test('Wallpaper wird als Datei gespeichert, wallpaper.json enthält nur Metadaten', async t => {
  const { dir, controller } = await setup(t);
  const video = path.join(dir, 'gross.mp4');
  await fs.writeFile(video, MP4_HEAD); await fs.truncate(video, 150 * 1024 * 1024);
  const res = await controller.importWallpaper(video, 'gross.mp4');
  assert.equal(res.wallpaper.type, 'video');
  assert.match(res.wallpaper.url, /^caeser-wallpaper:\/\/media\/[a-f0-9-]{36}\.mp4$/);
  assert.equal(res.wallpaper.data, undefined);
  assert.ok((await fs.stat(path.join(dir, 'wallpaper.json'))).size < 1024, 'wallpaper.json bleibt klein');
  const files = await fs.readdir(path.join(dir, 'wallpapers'));
  assert.equal(files.length, 1);
  assert.equal((await fs.stat(path.join(dir, 'wallpapers', files[0]))).size, 150 * 1024 * 1024);

  // Neues Bild ersetzt das Video und räumt die alte Datei auf
  const image = path.join(dir, 'bild.png'); await fs.writeFile(image, png(4, 4));
  await controller.importWallpaper(image, 'bild.png');
  assert.deepEqual((await fs.readdir(path.join(dir, 'wallpapers'))).map(f => path.extname(f)), ['.png']);
  await controller.removeWallpaper();
  assert.deepEqual(await fs.readdir(path.join(dir, 'wallpapers')), []);
});

test('Getarnte, zu große oder unbekannte Dateien werden abgelehnt', async t => {
  const { dir, controller } = await setup(t);
  const exe = path.join(dir, 'harmlos.png'); await fs.writeFile(exe, Buffer.from('MZ\x90\0\x03\0\0\0\x04\0\0\0\xff\xff\0\0', 'latin1'));
  await assert.rejects(controller.importWallpaper(exe, 'harmlos.png'), /Dateityp wird nicht unterstützt/);
  const bigImage = path.join(dir, 'riesig.png'); await fs.writeFile(bigImage, png(1, 1)); await fs.truncate(bigImage, 21 * 1024 * 1024);
  await assert.rejects(controller.importWallpaper(bigImage, 'riesig.png'), /maximal 20 MB/);
  const bigVideo = path.join(dir, 'riesig.webm'); await fs.writeFile(bigVideo, Buffer.from([0x1a, 0x45, 0xdf, 0xa3])); await fs.truncate(bigVideo, 201 * 1024 * 1024);
  await assert.rejects(controller.importWallpaper(bigVideo, 'riesig.webm'), /maximal 200 MB/);
  assert.equal(controller.wallpaper, null);
  assert.deepEqual(await fs.readdir(path.join(dir, 'wallpapers')).catch(() => []), []);
});

test('wallpaper-set ändert nur Darstellungsoptionen', async t => {
  const { dir, controller } = await setup(t);
  await assert.rejects(controller.setWallpaper({ data: dataUrl(png(1, 1)), type: 'image', name: 'x' }), /Dateiauswahl/);
  await assert.rejects(controller.setWallpaper({ opacity: 50 }), /kein eigener Hintergrund/);
  const image = path.join(dir, 'bild.png'); await fs.writeFile(image, png(4, 4));
  await controller.importWallpaper(image, 'bild.png');
  const res = await controller.setWallpaper({ opacity: 60, blur: 5, file: '../../evil' });
  assert.deepEqual(res.state.settings.customWallpaper, { enabled: true, opacity: 60, blur: 5 });
  assert.match(res.wallpaper.url, /\.png$/);
});

test('updateSettings übernimmt bei customWallpaper nur erlaubte Felder', async t => {
  const { controller } = await setup(t);
  const state = await controller.updateSettings({ customWallpaper: { opacity: 500, blur: -3, data: 'x', __proto__x: 1, enabled: 0 } });
  assert.deepEqual(state.settings.customWallpaper, { enabled: false, opacity: 100, blur: 0 });
});

test('Alte wallpaper.json mit Data-URL wird einmalig migriert, Einstellungen bleiben', async t => {
  const image = png(8, 8);
  const { dir, controller } = await setup(t, async d => {
    await fs.writeFile(path.join(d, 'wallpaper.json'), JSON.stringify({ data: dataUrl(image), type: 'image', name: 'alt.png' }));
    await fs.writeFile(path.join(d, 'settings.json'), JSON.stringify({ customWallpaper: { enabled: true, name: 'alt.png', type: 'image', opacity: 70, blur: 3 } }));
  });
  assert.equal(controller.wallpaper.name, 'alt.png');
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'wallpaper.json'), 'utf8'));
  assert.equal(saved.data, undefined); assert.equal(saved.type, 'image');
  assert.deepEqual(await fs.readFile(path.join(dir, 'wallpapers', saved.file)), image);
  assert.equal(controller.state().wallpaper.opacity, 70); assert.equal(controller.state().wallpaper.blur, 3);

  // Auslieferung über das eigene Protokoll inklusive Range-Anfragen
  const url = (await controller.getWallpaper()).url;
  const full = await controller.serveWallpaper(new Request(url));
  assert.equal(full.status, 200); assert.equal(full.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), image);
  const part = await controller.serveWallpaper(new Request(url, { headers: { Range: 'bytes=1-3' } }));
  assert.equal(part.status, 206); assert.deepEqual(Buffer.from(await part.arrayBuffer()), image.subarray(1, 4));
  for (const other of ['caeser-wallpaper://media/../wallpaper.json', 'caeser-wallpaper://media/00000000-0000-0000-0000-000000000000.png', 'caeser-wallpaper://andere/' + saved.file]) {
    assert.equal((await controller.serveWallpaper(new Request(other))).status, 404, other);
  }
});

test('Kaputte alte Wallpaper-Daten werden verworfen statt abzustürzen', async t => {
  const { dir, controller } = await setup(t, async d => {
    await fs.writeFile(path.join(d, 'wallpaper.json'), JSON.stringify({ data: 'data:image/png;base64,' + Buffer.from('MZ-keine-Bilddatei').toString('base64'), name: 'x' }));
    await fs.writeFile(path.join(d, 'settings.json'), JSON.stringify({ customWallpaper: { enabled: true, opacity: 40 } }));
  });
  assert.equal(controller.wallpaper, null);
  assert.equal(controller.settings.customWallpaper, null);
  await assert.rejects(fs.access(path.join(dir, 'wallpaper.json')));
  assert.match(controller.notice, /Hintergrundbild/);
});

test('validateSkinDataUrl akzeptiert nur 64x64/64x32-PNGs bis 256 KB', () => {
  assert.ok(validateSkinDataUrl(dataUrl(png(64, 64))));
  assert.ok(validateSkinDataUrl(dataUrl(png(64, 32))));
  assert.throws(() => validateSkinDataUrl(dataUrl(png(128, 128))), /64x64 oder 64x32/);
  assert.throws(() => validateSkinDataUrl(dataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'image/jpeg')), /PNG/);
  assert.throws(() => validateSkinDataUrl(dataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))), /PNG/);
  assert.throws(() => validateSkinDataUrl('https://example.com/skin.png'), /PNG/);
  assert.throws(() => validateSkinDataUrl(null), /PNG/);
  assert.throws(() => validateSkinDataUrl(dataUrl(Buffer.concat([png(64, 64), Buffer.alloc(300 * 1024)]))), /256 KB/);
  assert.throws(() => validateSkinDataUrl('data:image/png;base64,<script>'), /Ungültiges Bild/);
});

test('addSkin prüft Bild, Namen und Anzahl', async t => {
  const { controller } = await setup(t);
  await assert.rejects(controller.addSkin({ name: 'Riesig', data: dataUrl(png(128, 128)) }), /64x64 oder 64x32/);
  await assert.rejects(controller.addSkin({ name: 'Text', data: 'data:text/html;base64,PGI+' }), /PNG/);
  await assert.rejects(controller.addSkin({ name: 'Böse\u0007Name', data: dataUrl(png(64, 64)) }), /ungültige Zeichen/);
  const state = await controller.addSkin({ name: 'Okay', data: dataUrl(png(64, 64)) });
  assert.equal(state.skins.length, 1); assert.equal(state.skins[0].name, 'Okay');
  await assert.rejects(controller.renameSkin(state.skins[0].id, 'Neu\nName'), /ungültige Zeichen/);
  controller.skins = Array.from({ length: 100 }, (_, i) => ({ id: `skin-${i}`, name: `S${i}`, data: '' }));
  await assert.rejects(controller.addSkin({ name: 'Zuviel', data: dataUrl(png(64, 64)) }), /Maximal 100/);
});
