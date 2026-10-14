// Basis-URL des Caeser-Backends. Entscheidet allein die Build-Konfiguration (CAESER_API_URL), sonst der Produktivserver.
const DEFAULT_CAESER_API_URL = 'https://caeser-backend.caeser-backend.workers.dev';

// Nur https://, ohne Zugangsdaten, Parameter oder Anker. Gibt die URL ohne abschließenden Schrägstrich zurück.
function validateCaeserApiUrl(value, name = 'CAESER_API_URL') {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error(`${name} ist keine gültige URL.`); }
  if (url.protocol !== 'https:') throw new Error(`${name} muss mit https:// beginnen.`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${name} darf keine Zugangsdaten, Parameter oder Anker enthalten.`);
  return url.href.replace(/\/+$/, '');
}

function loadBuildConfig() {
  try { return require('../generated/build-config.cjs'); } catch { return {}; }
}
// Ungültige oder fehlende Werte fallen auf den Produktivserver zurück (geprüft wird schon beim Build).
function caeserApiUrl({ buildConfig = loadBuildConfig() } = {}) {
  const configured = buildConfig?.caeser?.apiUrl;
  if (typeof configured === 'string' && configured) {
    try { return validateCaeserApiUrl(configured); } catch {}
  }
  return DEFAULT_CAESER_API_URL;
}
module.exports = { DEFAULT_CAESER_API_URL, validateCaeserApiUrl, caeserApiUrl };
