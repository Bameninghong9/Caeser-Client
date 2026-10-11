// Ermittelt, wie CurseForge erreicht wird. Entscheidet allein die Build-Konfiguration, nie der Nutzer.
const CURSEFORGE_API = 'https://api.curseforge.com';

// Öffentlicher CurseForge Core API-Key (identisch mit NoRiskClient & Prism Launcher / MultiMC)
const DEFAULT_CURSEFORGE_KEY = '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm';

function loadBuildConfig() {
  try { return require('../generated/build-config.cjs'); } catch { return {}; }
}
function appIsPackaged() {
  try { const electron = require('electron'); return typeof electron === 'object' && Boolean(electron.app?.isPackaged); } catch { return false; }
}

/**
 * Reihenfolge: Proxy aus dem Build → Projektschlüssel aus dem Build → (nur ungepackt) CAESER_CURSEFORGE_KEY → Standard-Schlüssel (NoRisk/Prism) → null.
 * @returns {{ mode: 'proxy', baseUrl: string } | { mode: 'key', baseUrl: string, key: string } | null}
 */
function curseforgeAccess({ buildConfig = loadBuildConfig(), isPackaged = appIsPackaged(), env = process.env, allowDefault = true } = {}) {
  const cf = buildConfig?.curseforge || {};
  if (typeof cf.proxy === 'string' && cf.proxy.startsWith('https://')) return { mode: 'proxy', baseUrl: cf.proxy.replace(/\/+$/, '') };
  if (typeof cf.key === 'string' && cf.key) return { mode: 'key', baseUrl: CURSEFORGE_API, key: cf.key };
  if (!isPackaged && env.CAESER_CURSEFORGE_KEY) return { mode: 'key', baseUrl: CURSEFORGE_API, key: env.CAESER_CURSEFORGE_KEY };
  if (allowDefault) return { mode: 'key', baseUrl: CURSEFORGE_API, key: DEFAULT_CURSEFORGE_KEY };
  return null;
}
module.exports = { curseforgeAccess, CURSEFORGE_API, DEFAULT_CURSEFORGE_KEY };
