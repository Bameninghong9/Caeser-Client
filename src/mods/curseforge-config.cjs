// Ermittelt, wie CurseForge erreicht wird. Entscheidet allein die Build-Konfiguration, nie der Nutzer.
const CURSEFORGE_API = 'https://api.curseforge.com';

function loadBuildConfig() {
  try { return require('../generated/build-config.cjs'); } catch { return {}; }
}
function appIsPackaged() {
  try { const electron = require('electron'); return typeof electron === 'object' && Boolean(electron.app?.isPackaged); } catch { return false; }
}

/**
 * Reihenfolge: Proxy aus dem Build → Projektschlüssel aus dem Build → (nur ungepackt) CAESER_CURSEFORGE_KEY → null.
 * @returns {{ mode: 'proxy', baseUrl: string } | { mode: 'key', baseUrl: string, key: string } | null}
 */
function curseforgeAccess({ buildConfig = loadBuildConfig(), isPackaged = appIsPackaged(), env = process.env } = {}) {
  const cf = buildConfig?.curseforge || {};
  if (typeof cf.proxy === 'string' && cf.proxy.startsWith('https://')) return { mode: 'proxy', baseUrl: cf.proxy.replace(/\/+$/, '') };
  if (typeof cf.key === 'string' && cf.key) return { mode: 'key', baseUrl: CURSEFORGE_API, key: cf.key };
  if (!isPackaged && env.CAESER_CURSEFORGE_KEY) return { mode: 'key', baseUrl: CURSEFORGE_API, key: env.CAESER_CURSEFORGE_KEY };
  return null;
}
module.exports = { curseforgeAccess, CURSEFORGE_API };
