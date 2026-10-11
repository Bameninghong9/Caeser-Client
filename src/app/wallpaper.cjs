const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createReadStream, constants } = require('node:fs');
const { Readable } = require('node:stream');
const { inside } = require('../shared/net.cjs');

// Größenlimits für eigene Hintergründe
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const WALLPAPER_SCHEME = 'caeser-wallpaper';
const FORMATS = {
  png: { mime: 'image/png', type: 'image' }, jpg: { mime: 'image/jpeg', type: 'image' }, gif: { mime: 'image/gif', type: 'image' },
  webp: { mime: 'image/webp', type: 'image' }, mp4: { mime: 'video/mp4', type: 'video' }, webm: { mime: 'video/webm', type: 'video' }
};
const FILE_NAME = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(png|jpg|gif|webp|mp4|webm)$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Erkennt das Format anhand der ersten Bytes, nicht anhand der Endung.
function sniffMedia(head) {
  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  const ascii = head.toString('latin1', 0, Math.min(head.length, 12));
  if (/^GIF8[79]a/.test(ascii)) return 'gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'webp';
  if (ascii.slice(4, 8) === 'ftyp') return 'mp4';
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}
function checkMedia(head, size) {
  const ext = sniffMedia(head);
  if (!ext) throw new Error('Dieser Dateityp wird nicht unterstützt. Erlaubt sind PNG, JPEG, GIF, WebP, MP4 und WebM.');
  const video = FORMATS[ext].type === 'video', limit = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (size > limit) throw new Error(`Die Datei ist zu groß (maximal ${limit / 1048576} MB für ${video ? 'Videos' : 'Bilder'}).`);
  return ext;
}
async function readHead(file) {
  const handle = await fs.open(file, 'r');
  try { const buffer = Buffer.alloc(16); const { bytesRead } = await handle.read(buffer, 0, 16, 0); return buffer.subarray(0, bytesRead); }
  finally { await handle.close(); }
}
function metadata(file, ext, name) {
  return { file, type: FORMATS[ext].type, mime: FORMATS[ext].mime, name: String(name || 'Custom Wallpaper').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 64) };
}

class Wallpapers {
  constructor(directory) { this.dir = path.join(directory, 'wallpapers'); }
  // Liefert den geprüften Pfad zu gespeicherten Metadaten oder null.
  path(meta) {
    if (!meta || typeof meta.file !== 'string' || !FILE_NAME.test(meta.file)) return null;
    return inside(this.dir, meta.file);
  }
  async import(source, name) {
    const stat = await fs.stat(source);
    if (!stat.isFile() || !stat.size) throw new Error('Die gewählte Datei ist leer oder ungültig.');
    checkMedia(await readHead(source), stat.size);
    await fs.mkdir(this.dir, { recursive: true });
    const id = randomUUID(), temporary = inside(this.dir, `${id}.part`);
    try {
      await fs.copyFile(source, temporary, constants.COPYFILE_EXCL);
      // Kopie erneut prüfen, falls sich die Quelle zwischendurch geändert hat.
      const ext = checkMedia(await readHead(temporary), (await fs.stat(temporary)).size);
      const meta = metadata(`${id}.${ext}`, ext, name);
      await fs.rename(temporary, this.path(meta));
      return meta;
    } finally { await fs.rm(temporary, { force: true }); }
  }
  // Einmalige Migration der alten Data-URL aus wallpaper.json.
  async importDataUrl(data, name) {
    const match = /^data:[\w/+.-]+;base64,/.exec(data);
    if (!match) throw new Error('Ungültige Hintergrund-Daten.');
    const buffer = Buffer.from(data.slice(match[0].length), 'base64');
    if (!buffer.length) throw new Error('Ungültige Hintergrund-Daten.');
    const ext = checkMedia(buffer.subarray(0, 16), buffer.length);
    const meta = metadata(`${randomUUID()}.${ext}`, ext, name);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.path(meta), buffer, { flag: 'wx' });
    return meta;
  }
  // Prüft gespeicherte Metadaten und gibt eine bereinigte Kopie zurück.
  async verify(meta) {
    const file = this.path(meta);
    if (!file) throw new Error('Ungültige Hintergrund-Daten.');
    const stat = await fs.lstat(file);
    if (!stat.isFile()) throw new Error('Ungültige Hintergrund-Daten.');
    const ext = checkMedia(await readHead(file), stat.size);
    return metadata(meta.file, ext, meta.name);
  }
  async remove(meta) { const file = this.path(meta); if (file) await fs.rm(file, { force: true }); }
  // Entfernt verwaiste Dateien (z. B. nach einem Absturz während des Kopierens).
  async prune(keep) {
    let entries = [];
    try { entries = await fs.readdir(this.dir); } catch { return; }
    for (const entry of entries) if (entry !== keep?.file) await fs.rm(inside(this.dir, entry), { force: true, recursive: true }).catch(() => {});
  }
  url(meta) { return `${WALLPAPER_SCHEME}://media/${meta.file}`; }
  // Antwort für protocol.handle; liefert ausschließlich die aktuelle Hintergrunddatei aus.
  async respond(request, meta) {
    const url = new URL(request.url);
    const file = url.host === 'media' && meta && url.pathname === `/${meta.file}` ? this.path(meta) : null;
    if (!file) return new Response('Nicht gefunden', { status: 404 });
    let size;
    try { size = (await fs.stat(file)).size; } catch { return new Response('Nicht gefunden', { status: 404 }); }
    const headers = { 'Content-Type': meta.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    let start = 0, end = size - 1, status = 200;
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
    if (range && (range[1] || range[2])) {
      if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), size - 1); }
      else start = Math.max(0, size - Number(range[2]));
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = String(end - start + 1);
    return new Response(Readable.toWeb(createReadStream(file, { start, end })), { status, headers });
  }
}
module.exports = { Wallpapers, sniffMedia, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, WALLPAPER_SCHEME };
