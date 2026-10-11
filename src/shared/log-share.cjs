const os = require('node:os');
const path = require('node:path');

// Laut https://api.mclo.gs/ (Stand Oktober 2026): POST /1/log mit JSON { content, source },
// höchstens 10 MiB und 25.000 Zeilen, 60 Anfragen pro Minute und IP.
const MCLOGS_API = 'https://api.mclo.gs/1/log';
const MCLOGS_MAX_BYTES = 10 * 1024 * 1024;
const MCLOGS_MAX_LINES = 25000;
const MCLOGS_URL_PREFIX = 'https://mclo.gs/';
const UPLOAD_TIMEOUT_MS = 15000;

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IPV4 = /(?<![\d.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?!\d|\.\d)/g;
const IPV6_CANDIDATE = /(?<![\w:.])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;

// Nur echte IPv6-Adressen: entweder mit "::" oder voll ausgeschrieben (8 Gruppen). Uhrzeiten wie 12:34:56 bleiben.
function isIpv6(candidate) {
  const compressed = candidate.includes('::');
  if (compressed && candidate.indexOf('::') !== candidate.lastIndexOf('::')) return false;
  const groups = candidate.split(':');
  if (!compressed && groups.length !== 8) return false;
  if (groups.some(g => g.length > 4)) return false;
  return candidate.replace(/:/g, '').length > 0 || candidate === '::';
}

// Benutzernamen dieses PCs, die in Pfaden ersetzt werden sollen (nicht rein: liest das Betriebssystem).
function localUsernames() {
  const names = new Set();
  try { if (os.userInfo().username) names.add(os.userInfo().username); } catch {}
  if (process.env.USERPROFILE) names.add(path.win32.basename(process.env.USERPROFILE));
  if (process.env.HOME) names.add(path.posix.basename(process.env.HOME));
  return [...names].filter(Boolean);
}

/**
 * Entfernt sensible Daten aus Logzeilen, bevor sie das Gerät verlassen. Rein: verändert nichts und liest keinen Zustand.
 * @param {string[]} lines
 * @param {{ secrets?: string[], usernames?: string[] }} context  secrets = Tokens der Konten, usernames = lokale Benutzernamen
 */
function redactLog(lines, { secrets = [], usernames = [] } = {}) {
  const secretList = [...new Set(secrets.filter(s => typeof s === 'string' && s.length >= 8))].sort((a, b) => b.length - a.length);
  const nameList = [...new Set(usernames.filter(n => typeof n === 'string' && n.length))].sort((a, b) => b.length - a.length);
  const namePatterns = nameList.map(name => new RegExp(`([A-Za-z]:[\\\\/]+Users[\\\\/]+|/(?:Users|home)/)${escapeRegExp(name)}(?=[\\\\/"'\\s]|$)`, 'gi'));
  return lines.map(raw => {
    let line = String(raw);
    for (const secret of secretList) line = line.split(secret).join('[TOKEN]');
    line = line
      .replace(/(--(?:accessToken|session|xuid|clientId)\s+)("[^"]*"|\S+)/gi, '$1[TOKEN]')
      .replace(/((?:access|refresh|session|auth|id|bearer)[_-]?token["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi, '$1[TOKEN]')
      .replace(/(Authorization["']?\s*[:=]\s*["']?Bearer\s+)[^\s"',;]+/gi, '$1[TOKEN]')
      .replace(/\btoken:[^\s:]+:\S+/g, 'token:[TOKEN]')
      .replace(JWT, '[TOKEN]')
      .replace(EMAIL, '[EMAIL]');
    for (const pattern of namePatterns) line = line.replace(pattern, '$1<user>');
    line = line
      .replace(/([A-Za-z]:[\\/]+Users[\\/]+)(?!<user>|Public(?=[\\/])|Default(?=[\\/]))[^\\/\s"':*?<>|]+/gi, '$1<user>')
      .replace(/(\/(?:Users|home)\/)(?!<user>|Shared\/)[^/\s"']+/g, '$1<user>')
      .replace(IPV6_CANDIDATE, match => isIpv6(match) ? '[IP]' : match)
      .replace(IPV4, '[IP]');
    return line;
  });
}

/**
 * Baut den Upload-Text aus Kopfzeilen und Log. Ist das Log zu groß, bleiben die letzten Zeilen erhalten
 * (dort steht der Absturz) und oben wird ein Hinweis eingefügt.
 */
function buildShareText(header, lines, { maxBytes = MCLOGS_MAX_BYTES, maxLines = MCLOGS_MAX_LINES } = {}) {
  const bytes = text => Buffer.byteLength(text, 'utf8') + 1;
  const markerReserve = 120;
  let budgetBytes = maxBytes - header.reduce((sum, l) => sum + bytes(l), 0) - markerReserve;
  let budgetLines = maxLines - header.length - 1;
  const kept = [];
  for (let i = lines.length - 1; i >= 0 && budgetLines > 0; i--) {
    const size = bytes(lines[i]);
    if (size > budgetBytes) break;
    kept.push(lines[i]); budgetBytes -= size; budgetLines--;
  }
  kept.reverse();
  const dropped = lines.length - kept.length;
  const body = dropped > 0 ? [`[… ${dropped} ältere Zeilen vom Caeser Client gekürzt …]`, ...kept] : kept;
  return [...header, ...body].join('\n');
}

async function uploadToMclogs(text, { fetchImpl = fetch, signal, timeoutMs = UPLOAD_TIMEOUT_MS } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(MCLOGS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'CaeserClient (Minecraft desktop launcher)' },
      body: JSON.stringify({ content: text, source: 'Caeser Client' }),
      signal: combined
    });
  } catch (error) {
    if (timeout.aborted) throw new Error('mclo.gs antwortet nicht (Zeitüberschreitung). Bitte später erneut versuchen.');
    if (signal?.aborted) throw new Error('Upload abgebrochen.');
    throw new Error('mclo.gs ist nicht erreichbar. Bitte die Internetverbindung prüfen.');
  }
  if (response.status === 429) throw new Error('Zu viele Uploads in kurzer Zeit. Bitte eine Minute warten und erneut versuchen.');
  if (response.status === 413) throw new Error('Das Log ist zu groß für mclo.gs.');
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(`mclo.gs meldet einen Fehler (HTTP ${response.status})${body?.error ? `: ${body.error}` : ''}.`);
  if (!body || body.success !== true) throw new Error(`mclo.gs hat den Upload abgelehnt: ${body?.error || 'unbekannter Fehler'}.`);
  if (typeof body.url !== 'string' || !body.url.startsWith(MCLOGS_URL_PREFIX) || typeof body.id !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(body.id)) {
    throw new Error('Unerwartete Antwort von mclo.gs.');
  }
  return { url: body.url, id: body.id };
}

module.exports = { redactLog, buildShareText, uploadToMclogs, localUsernames, MCLOGS_API, MCLOGS_MAX_BYTES, MCLOGS_MAX_LINES, MCLOGS_URL_PREFIX };
