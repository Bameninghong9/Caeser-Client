// Prüfung und Umwandlung von Cape-Bildern im Hauptprozess.
// Cape-Layout (2:1, 64×32 bis 1024×512) wird unverändert hochgeladen; andere Bilder können als Vorderseite
// in ein 512×256-Cape umgewandelt werden. PNG-Kodierung ohne Abhängigkeiten (zlib), damit es auch in Tests läuft.
const zlib = require('node:zlib');

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 40 * 1000 * 1000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CAPE_WIDTHS = [64, 128, 256, 512, 1024];
// Standard-Cape-Bereiche im 64×32-Raster: [x, y, Breite, Höhe]
const CAPE_REGIONS = {
  top: [1, 0, 10, 1], bottom: [11, 0, 10, 1], right: [0, 1, 1, 16], front: [1, 1, 10, 16], left: [11, 1, 1, 16], back: [12, 1, 10, 16]
};
const OUTPUT_WIDTH = 512, OUTPUT_HEIGHT = 256, SCALE = OUTPUT_WIDTH / 64;
const FRONT_RATIO = 10 / 16;

function electronImages() {
  try { const electron = require('electron'); return typeof electron === 'object' ? electron.nativeImage : null; } catch { return null; }
}
function isPng(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 33 && buffer.subarray(0, 8).equals(PNG_SIGNATURE) && buffer.toString('latin1', 12, 16) === 'IHDR';
}
function pngSize(buffer) {
  if (!isPng(buffer)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
function isCapeLayout(width, height) {
  return CAPE_WIDTHS.includes(width) && width === height * 2;
}

// --- PNG-Dekodierung (alle Farbtypen, Bittiefe 1–16, ohne Interlacing) ---
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function decodePng(buffer) {
  if (!isPng(buffer)) throw new Error('Kein gültiges PNG-Bild.');
  let offset = 8, header = null, palette = null, transparency = null;
  const data = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('latin1', offset + 4, offset + 8);
    const start = offset + 8, end = start + length;
    if (end + 4 > buffer.length) throw new Error('Das PNG-Bild ist beschädigt.');
    const chunk = buffer.subarray(start, end);
    if (type === 'IHDR') header = { width: chunk.readUInt32BE(0), height: chunk.readUInt32BE(4), depth: chunk[8], color: chunk[9], interlace: chunk[12] };
    else if (type === 'PLTE') palette = chunk;
    else if (type === 'tRNS') transparency = chunk;
    else if (type === 'IDAT') data.push(chunk);
    else if (type === 'IEND') break;
    offset = end + 4;
  }
  if (!header || !data.length) throw new Error('Das PNG-Bild ist beschädigt.');
  const { width, height, depth, color, interlace } = header;
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('Das Bild ist zu groß.');
  if (interlace) throw Object.assign(new Error('Interlaced PNG'), { unsupported: true });
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth)) throw new Error('Das PNG-Format wird nicht unterstützt.');
  const bitsPerPixel = channels * depth, bpp = Math.max(1, bitsPerPixel >> 3), stride = Math.ceil(width * bitsPerPixel / 8);
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * height + 1024 }); }
  catch { throw new Error('Das PNG-Bild ist beschädigt.'); }
  if (raw.length < (stride + 1) * height) throw new Error('Das PNG-Bild ist beschädigt.');
  const lines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    if (filter > 4) throw new Error('Das PNG-Bild ist beschädigt.');
    for (let x = 0; x < stride; x++) {
      const value = raw[src + x];
      const a = x >= bpp ? lines[dst + x - bpp] : 0, b = y ? lines[dst - stride + x] : 0, c = y && x >= bpp ? lines[dst - stride + x - bpp] : 0;
      lines[dst + x] = filter === 0 ? value : filter === 1 ? value + a : filter === 2 ? value + b : filter === 3 ? value + ((a + b) >> 1) : value + paeth(a, b, c);
    }
  }
  const out = new Uint8Array(width * height * 4);
  const sample = (row, index) => {
    if (depth === 8) return lines[row + index];
    if (depth === 16) return lines[row + index * 2];
    const bit = index * depth, byte = lines[row + (bit >> 3)], shift = 8 - depth - (bit & 7);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (color === 3) {
        const i = sample(row, x);
        if (!palette || i * 3 + 2 >= palette.length) throw new Error('Das PNG-Bild ist beschädigt.');
        out[o] = palette[i * 3]; out[o + 1] = palette[i * 3 + 1]; out[o + 2] = palette[i * 3 + 2];
        out[o + 3] = transparency && i < transparency.length ? transparency[i] : 255;
      } else if (color === 0 || color === 4) {
        const g = Math.round(sample(row, x * channels) * scale);
        out[o] = out[o + 1] = out[o + 2] = g;
        out[o + 3] = color === 4 ? sample(row, x * channels + 1) : 255;
      } else {
        out[o] = sample(row, x * channels); out[o + 1] = sample(row, x * channels + 1); out[o + 2] = sample(row, x * channels + 2);
        out[o + 3] = color === 6 ? sample(row, x * channels + 3) : 255;
      }
    }
  }
  return { width, height, data: out };
}

// --- PNG-Kodierung (RGBA, 8 Bit) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) { let c = 0xffffffff; for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePng({ width, height, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

// Dekodiert über den eigenen Decoder; was er nicht kann (z. B. Interlacing), übernimmt nativeImage.
function decodeImage(buffer, images = electronImages()) {
  try { return decodePng(buffer); }
  catch (error) {
    if (!error.unsupported || !images) throw error.unsupported ? new Error('Das PNG-Format wird nicht unterstützt.') : error;
    const image = images.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('Das Bild konnte nicht gelesen werden.');
    const { width, height } = image.getSize(), bgra = image.toBitmap(), data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = bgra[i + 2]; data[i + 1] = bgra[i + 1]; data[i + 2] = bgra[i]; data[i + 3] = bgra[i + 3]; }
    return { width, height, data };
  }
}

// Prüft eine gewählte Datei. Liefert { kind: 'cape', png } oder { kind: 'photo', bitmap }.
function inspectUpload(buffer, { images = electronImages() } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Die gewählte Datei ist leer.');
  if (buffer.length > MAX_INPUT_BYTES) throw new Error('Das Bild darf höchstens 5 MB groß sein.');
  if (!isPng(buffer)) throw new Error('Bitte ein PNG-Bild auswählen.');
  if (images) {
    const image = images.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('Das Bild konnte nicht gelesen werden.');
  }
  const bitmap = decodeImage(buffer, images);
  if (isCapeLayout(bitmap.width, bitmap.height)) return { kind: 'cape', png: buffer, width: bitmap.width, height: bitmap.height, bitmap };
  if (bitmap.width < 10 || bitmap.height < 16) throw new Error('Das Bild ist zu klein.');
  return { kind: 'photo', width: bitmap.width, height: bitmap.height, bitmap };
}

// Größter 10:16-Ausschnitt; offsetX/offsetY (0–1) verschieben ihn entlang der freien Achse.
function frontCrop(width, height, offsetX = 0.5, offsetY = 0.5) {
  const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  let w = width, h = Math.round(width / FRONT_RATIO);
  if (h > height) { h = height; w = Math.max(1, Math.round(height * FRONT_RATIO)); }
  return { x: Math.round((width - w) * clamp(offsetX)), y: Math.round((height - h) * clamp(offsetY)), width: w, height: h };
}

// Flächenmittel beim Verkleinern, nächster Nachbar beim Vergrößern.
function scaleRegion(src, crop, targetWidth, targetHeight) {
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const fx = crop.width / targetWidth, fy = crop.height / targetHeight;
  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = crop.y + Math.floor(ty * fy), y1 = Math.max(y0 + 1, crop.y + Math.floor((ty + 1) * fy));
    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = crop.x + Math.floor(tx * fx), x1 = Math.max(x0 + 1, crop.x + Math.floor((tx + 1) * fx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1 && y < src.height; y++) for (let x = x0; x < x1 && x < src.width; x++) {
        const i = (y * src.width + x) * 4, alpha = src.data[i + 3];
        r += src.data[i] * alpha; g += src.data[i + 1] * alpha; b += src.data[i + 2] * alpha; a += alpha; n++;
      }
      const o = (ty * targetWidth + tx) * 4;
      if (a) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = n ? Math.round(a / n) : 0;
    }
  }
  return out;
}

// Vorderseite = Bild, Rückseite = dasselbe Bild abgedunkelt, Ränder in der Durchschnittsfarbe. Ergebnis: 512×256-PNG.
function buildCapeFromPhoto(bitmap, { offsetX = 0.5, offsetY = 0.5 } = {}) {
  const crop = frontCrop(bitmap.width, bitmap.height, offsetX, offsetY);
  const [, , fw, fh] = CAPE_REGIONS.front;
  const faceWidth = fw * SCALE, faceHeight = fh * SCALE;
  const face = scaleRegion(bitmap, crop, faceWidth, faceHeight);
  // Halbtransparente Pixel werden auf Weiß gelegt: Capes sollen deckend sein.
  let sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < face.length; i += 4) {
    const alpha = face[i + 3] / 255;
    for (let c = 0; c < 3; c++) face[i + c] = Math.round(face[i + c] * alpha + 255 * (1 - alpha));
    face[i + 3] = 255; sr += face[i]; sg += face[i + 1]; sb += face[i + 2];
  }
  const count = face.length / 4, average = [Math.round(sr / count), Math.round(sg / count), Math.round(sb / count), 255];
  const out = new Uint8Array(OUTPUT_WIDTH * OUTPUT_HEIGHT * 4);
  const fill = ([x, y, w, h], color) => {
    for (let py = y * SCALE; py < (y + h) * SCALE; py++) for (let px = x * SCALE; px < (x + w) * SCALE; px++) out.set(color, (py * OUTPUT_WIDTH + px) * 4);
  };
  const paste = ([x, y], factor) => {
    for (let py = 0; py < faceHeight; py++) for (let px = 0; px < faceWidth; px++) {
      const i = (py * faceWidth + px) * 4, o = ((y * SCALE + py) * OUTPUT_WIDTH + x * SCALE + px) * 4;
      out[o] = Math.round(face[i] * factor); out[o + 1] = Math.round(face[i + 1] * factor); out[o + 2] = Math.round(face[i + 2] * factor); out[o + 3] = 255;
    }
  };
  for (const edge of ['top', 'bottom', 'right', 'left']) fill(CAPE_REGIONS[edge], average);
  paste(CAPE_REGIONS.front, 1);
  paste(CAPE_REGIONS.back, 0.62);
  return { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, crop, png: encodePng({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, data: out }) };
}

// Verkleinerte Vorschau (für den Ausschnitt-Dialog), höchstens maxSide Pixel.
function previewPng(bitmap, maxSide = 480) {
  const factor = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * factor)), height = Math.max(1, Math.round(bitmap.height * factor));
  if (factor === 1) return encodePng(bitmap);
  return encodePng({ width, height, data: scaleRegion(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height }, width, height) });
}
const toDataUrl = png => `data:image/png;base64,${png.toString('base64')}`;

module.exports = { MAX_INPUT_BYTES, CAPE_REGIONS, isPng, pngSize, isCapeLayout, decodePng, encodePng, inspectUpload, frontCrop, buildCapeFromPhoto, previewPng, toDataUrl };
