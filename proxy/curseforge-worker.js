// Vorlage: Cloudflare Worker als CurseForge-Proxy für den Caeser Client.
// Der Schlüssel liegt ausschließlich im Worker-Secret CURSEFORGE_API_KEY (wrangler secret put CURSEFORGE_API_KEY).
// Erlaubt sind nur die Routen, die src/mods/providers.cjs aufruft – alle als GET, ohne Request-Body.
const UPSTREAM = 'https://api.curseforge.com';
const CACHE_SECONDS = 300;            // gleiche Anfragen kommen 5 Minuten aus dem Cache
const RATE_LIMIT = 120;               // Anfragen pro IP und Minute (pro Worker-Instanz, nur grober Schutz)
const MAX_QUERY_LENGTH = 1024;
const MINECRAFT_GAME_ID = '432';
const ALLOWED_CLASS_IDS = ['6', '12', '6552']; // Mods, Ressourcenpakete, Shader

// Erlaubte Routen mit den jeweils zulässigen Query-Parametern
const ROUTES = [
  { pattern: /^\/v1\/mods\/search$/, params: ['gameId', 'classId', 'gameVersion', 'modLoaderType', 'searchFilter', 'index', 'pageSize', 'sortField', 'sortOrder'], search: true },
  { pattern: /^\/v1\/mods\/\d{1,10}$/, params: [] },
  { pattern: /^\/v1\/mods\/\d{1,10}\/files$/, params: ['gameVersion', 'modLoaderType', 'pageSize', 'index'] },
  { pattern: /^\/v1\/mods\/\d{1,10}\/files\/\d{1,10}$/, params: [] }
];

const hits = new Map(); // ip -> { windowStart, count }

function rateLimited(ip) {
  const now = Date.now(), entry = hits.get(ip);
  if (!entry || now - entry.windowStart > 60000) { hits.set(ip, { windowStart: now, count: 1 }); return false; }
  entry.count++;
  if (hits.size > 10000) hits.clear(); // Speicher begrenzen
  return entry.count > RATE_LIMIT;
}

function reject(status, message) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
}

function validQuery(url, route) {
  if (url.search.length > MAX_QUERY_LENGTH) return false;
  for (const [name, value] of url.searchParams) {
    if (!route.params.includes(name)) return false;
    if (['index', 'pageSize', 'modLoaderType', 'sortField', 'classId', 'gameId'].includes(name) && !/^\d{1,6}$/.test(value)) return false;
  }
  const pageSize = Number(url.searchParams.get('pageSize') || 0);
  const index = Number(url.searchParams.get('index') || 0);
  if (pageSize > 50 || index > 10000) return false;
  if (route.search) {
    if (url.searchParams.get('gameId') !== MINECRAFT_GAME_ID) return false;
    if (!ALLOWED_CLASS_IDS.includes(url.searchParams.get('classId'))) return false;
  }
  return true;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return reject(405, 'Nur GET ist erlaubt.');
    if (request.headers.get('content-length') && request.headers.get('content-length') !== '0') return reject(413, 'Kein Request-Body erlaubt.');
    const url = new URL(request.url);
    const route = ROUTES.find(r => r.pattern.test(url.pathname));
    if (!route) return reject(404, 'Nicht gefunden.');
    if (!validQuery(url, route)) return reject(400, 'Ungültige Parameter.');
    if (!env.CURSEFORGE_API_KEY) return reject(503, 'Proxy ist nicht konfiguriert.');

    const ip = request.headers.get('cf-connecting-ip') || 'unbekannt';
    if (rateLimited(ip)) return reject(429, 'Zu viele Anfragen.');

    const upstreamUrl = UPSTREAM + url.pathname + url.search;
    const cache = caches.default;
    const cacheKey = new Request(upstreamUrl, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const upstream = await fetch(upstreamUrl, {
      headers: { 'x-api-key': env.CURSEFORGE_API_KEY, Accept: 'application/json', 'User-Agent': 'CaeserClient-Proxy' }
    });
    // Keine CORS-Header: der Launcher fragt aus dem Hauptprozess an, Webseiten sollen den Proxy nicht nutzen können.
    const response = new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', 'Cache-Control': upstream.ok ? `public, max-age=${CACHE_SECONDS}` : 'no-store' }
    });
    if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
};
