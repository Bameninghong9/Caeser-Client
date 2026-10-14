// Schreibt src/generated/build-config.cjs aus Umgebungsvariablen (vor `npm start` und `npm run build`).
//   CAESER_CURSEFORGE_PROXY  HTTPS-URL eines eigenen Proxys, der den Schlüssel serverseitig anhängt (empfohlen)
//   CAESER_CURSEFORGE_KEY    eigener, bei CurseForge beantragter Projektschlüssel (wird mit ausgeliefert)
//   CAESER_API_URL           HTTPS-Basis-URL des Caeser-Backends (Capes); ohne Angabe der Produktivserver
// Der Schlüssel wird nie auf der Konsole ausgegeben. Die erzeugte Datei steht in .gitignore.
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_CAESER_API_URL, validateCaeserApiUrl } = require('../src/backend/caeser-config.cjs');

const DEFAULT_OUT = path.join(__dirname, '..', 'src', 'generated', 'build-config.cjs');

const DEFAULT_CF_KEY = '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm';

function readConfig(env) {
  const proxy = (env.CAESER_CURSEFORGE_PROXY || '').trim();
  const key = (env.CAESER_CURSEFORGE_KEY || DEFAULT_CF_KEY).trim();
  if (proxy) {
    let url;
    try { url = new URL(proxy); } catch { throw new Error('CAESER_CURSEFORGE_PROXY ist keine gültige URL.'); }
    if (url.protocol !== 'https:') throw new Error('CAESER_CURSEFORGE_PROXY muss mit https:// beginnen.');
    if (url.username || url.password || url.search || url.hash) throw new Error('CAESER_CURSEFORGE_PROXY darf keine Zugangsdaten, Parameter oder Anker enthalten.');
  }
  if (key && (key.length > 1024 || /[\r\n]/.test(key))) throw new Error('CAESER_CURSEFORGE_KEY ist ungültig (Zeilenumbruch oder länger als 1024 Zeichen).');
  const apiUrl = validateCaeserApiUrl((env.CAESER_API_URL || '').trim() || DEFAULT_CAESER_API_URL);
  return { curseforge: { proxy: proxy.replace(/\/+$/, ''), key }, caeser: { apiUrl } };
}

function writeBuildConfig({ env = process.env, outFile = DEFAULT_OUT, log = console.log, warn = console.warn } = {}) {
  const config = readConfig(env);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const content = `// Automatisch erzeugt von scripts/write-build-config.cjs – nicht einchecken, nicht bearbeiten.\nmodule.exports = ${JSON.stringify(config, null, 2)};\n`;
  fs.writeFileSync(outFile, content);
  const { proxy, key } = config.curseforge;
  if (!proxy && !key) warn('WARNUNG: Build ohne CurseForge. Weder CAESER_CURSEFORGE_PROXY noch CAESER_CURSEFORGE_KEY ist gesetzt; nur Modrinth ist verfügbar.');
  else log(`CurseForge-Build-Konfiguration: Proxy ${proxy ? `gesetzt (${new URL(proxy).host})` : 'nein'}, Schlüssel gesetzt: ${key ? 'ja' : 'nein'}${proxy && key ? ' (Proxy hat Vorrang)' : ''}.`);
  log(`Caeser-Backend: ${new URL(config.caeser.apiUrl).host}.`);
  return config;
}

if (require.main === module) {
  try { writeBuildConfig(); }
  catch (error) { console.error(`Fehler: ${error.message}`); process.exit(1); }
}
module.exports = { writeBuildConfig, readConfig };
