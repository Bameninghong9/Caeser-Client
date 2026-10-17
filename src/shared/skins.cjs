const SKIN_PREFIX = 'data:image/png;base64,';
const MAX_SKIN_BYTES = 256 * 1024;
const MAX_SKINS = 100;
const MAX_SKIN_NAME = 32;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function nativeImage() {
  try { const electron = require('electron'); return typeof electron === 'object' ? electron.nativeImage : null; } catch { return null; }
}
// Ungültige Eingaben tragen code 'INVALID_SKIN' (die Account-Brücke antwortet dann mit 400), technische Fehler nicht.
function invalidSkin(message) { return Object.assign(new Error(message), { code: 'INVALID_SKIN' }); }
// Prüft eine Skin-Data-URL: PNG, höchstens 256 KB, lesbar, 64x64 oder 64x32 Pixel.
function validateSkinDataUrl(data) {
  if (typeof data !== 'string' || !data.startsWith(SKIN_PREFIX)) throw invalidSkin('Minecraft-Skins müssen als PNG-Bild vorliegen.');
  const base64 = data.slice(SKIN_PREFIX.length);
  if (base64.length > Math.ceil(MAX_SKIN_BYTES / 3) * 4 + 4) throw invalidSkin('Das Skin-Bild darf höchstens 256 KB groß sein.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw invalidSkin('Ungültiges Bild für Minecraft-Skin.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_SKIN_BYTES) throw invalidSkin('Das Skin-Bild darf höchstens 256 KB groß sein.');
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.toString('latin1', 12, 16) !== 'IHDR') throw invalidSkin('Minecraft-Skins müssen als PNG-Bild vorliegen.');
  let width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  const images = nativeImage();
  if (images) {
    const image = images.createFromBuffer(buffer);
    if (image.isEmpty()) throw invalidSkin('Das Skin-Bild konnte nicht gelesen werden.');
    ({ width, height } = image.getSize());
  }
  if (width !== 64 || ![32, 64].includes(height)) throw invalidSkin('Minecraft-Skins müssen 64x64 oder 64x32 Pixel groß sein.');
  return buffer;
}
function validateSkinName(name, fallback) {
  const clean = typeof name === 'string' ? name.trim().slice(0, MAX_SKIN_NAME) : '';
  if (/[\x00-\x1f\x7f]/.test(clean)) throw invalidSkin('Der Skin-Name enthält ungültige Zeichen.');
  return clean || fallback;
}
// Spielername beim Import aus dem Spiel: 1–32 Zeichen, keine Steuerzeichen; wird nicht still gekürzt.
function validatePlayerName(name) {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean || clean.length > MAX_SKIN_NAME || /[\x00-\x1f\x7f]/.test(clean)) throw invalidSkin('Ungültiger Spielername.');
  return clean;
}
// Optionale Armbreite; fehlt sie (undefined/null), erkennt der Launcher sie selbst.
function validateSkinVariant(variant) {
  if (variant === undefined || variant === null) return null;
  if (variant !== 'classic' && variant !== 'slim') throw invalidSkin('Ungültige Skin-Variante (classic oder slim).');
  return variant;
}
// PNG-Bytes einer gespeicherten Skin-Data-URL, um gleiche Bilder unabhängig von der Base64-Schreibweise zu erkennen.
function skinBytes(data) {
  return typeof data === 'string' ? Buffer.from(data.slice(data.indexOf(',') + 1), 'base64') : null;
}
// „Name“, ist er vergeben „Name (2)“, „Name (3)“ … (ohne Unterschied in der Groß-/Kleinschreibung, höchstens 32 Zeichen).
function uniqueSkinName(base, names) {
  const taken = new Set(Array.from(names, name => String(name ?? '').trim().toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    name = base.slice(0, MAX_SKIN_NAME - suffix.length).replace(/[\ud800-\udbff]$/, '').trimEnd() + suffix;
  }
  return name;
}
module.exports = { validateSkinDataUrl, validateSkinName, validatePlayerName, validateSkinVariant, skinBytes, uniqueSkinName, MAX_SKIN_BYTES, MAX_SKINS, MAX_SKIN_NAME };
