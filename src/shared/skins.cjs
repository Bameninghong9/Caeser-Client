const SKIN_PREFIX = 'data:image/png;base64,';
const MAX_SKIN_BYTES = 256 * 1024;
const MAX_SKINS = 100;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function nativeImage() {
  try { const electron = require('electron'); return typeof electron === 'object' ? electron.nativeImage : null; } catch { return null; }
}
// Prüft eine Skin-Data-URL: PNG, höchstens 256 KB, lesbar, 64x64 oder 64x32 Pixel.
function validateSkinDataUrl(data) {
  if (typeof data !== 'string' || !data.startsWith(SKIN_PREFIX)) throw new Error('Minecraft-Skins müssen als PNG-Bild vorliegen.');
  const base64 = data.slice(SKIN_PREFIX.length);
  if (base64.length > Math.ceil(MAX_SKIN_BYTES / 3) * 4 + 4) throw new Error('Das Skin-Bild darf höchstens 256 KB groß sein.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Ungültiges Bild für Minecraft-Skin.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_SKIN_BYTES) throw new Error('Das Skin-Bild darf höchstens 256 KB groß sein.');
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.toString('latin1', 12, 16) !== 'IHDR') throw new Error('Minecraft-Skins müssen als PNG-Bild vorliegen.');
  let width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  const images = nativeImage();
  if (images) {
    const image = images.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('Das Skin-Bild konnte nicht gelesen werden.');
    ({ width, height } = image.getSize());
  }
  if (width !== 64 || ![32, 64].includes(height)) throw new Error('Minecraft-Skins müssen 64x64 oder 64x32 Pixel groß sein.');
  return buffer;
}
function validateSkinName(name, fallback) {
  const clean = typeof name === 'string' ? name.trim().slice(0, 32) : '';
  if (/[\x00-\x1f\x7f]/.test(clean)) throw new Error('Der Skin-Name enthält ungültige Zeichen.');
  return clean || fallback;
}
module.exports = { validateSkinDataUrl, validateSkinName, MAX_SKIN_BYTES, MAX_SKINS };
