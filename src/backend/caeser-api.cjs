// Anbindung an das Caeser-Backend (Capes) und an die Cape-Endpunkte von Mojang. Läuft nur im Hauptprozess.
// Session-Tokens bleiben pro Minecraft-Konto im Speicher; weder sie noch Minecraft-Tokens verlassen dieses Modul.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { caeserApiUrl } = require('./caeser-config.cjs');
const { isPng, pngSize, isCapeLayout, toDataUrl } = require('./cape-image.cjs');
const { redactSecrets } = require('../app/account-bridge.cjs');

const UNREACHABLE = 'Caeser-Server nicht erreichbar.';
const MOJANG_UNREACHABLE = 'Minecraft-Dienste nicht erreichbar.';
const SESSION_JOIN_URL = 'https://sessionserver.mojang.com/session/minecraft/join';
const MOJANG_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';
const TEXTURE_HOST = 'textures.minecraft.net';
const CAPE_ID = /^[A-Za-z0-9_-]{6,128}$/;
const VANILLA_CAPE_ID = /^[A-Za-z0-9-]{8,64}$/;
const TEXTURE_HASH = /^[0-9a-f]{16,128}$/;
const MAX_CACHE_FILES = 200;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TIMEOUT = 10000, UPLOAD_TIMEOUT = 30000, IMAGE_TIMEOUT = 10000;

class CaeserApiError extends Error {
  constructor(message, { status = 0, code = '', missing, capeId } = {}) {
    super(message);
    this.name = 'CaeserApiError'; this.status = status; this.code = code;
    if (Number.isFinite(missing)) this.missing = missing;
    if (capeId) this.capeId = capeId;
  }
}

const cleanText = (value, max) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : '';
const count = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
const isCapeId = id => typeof id === 'string' && CAPE_ID.test(id);
const isVanillaCapeId = id => typeof id === 'string' && VANILLA_CAPE_ID.test(id);

// Nur bekannte Felder an die UI weitergeben.
function publicCape(item) {
  if (!item || typeof item !== 'object' || !isCapeId(item.id)) return null;
  const cape = { id: item.id, name: cleanText(item.name, 64), ownerName: cleanText(item.ownerName, 32), uses: count(item.uses),
    createdAt: typeof item.createdAt === 'number' || typeof item.createdAt === 'string' ? item.createdAt : null };
  if (typeof item.status === 'string' && /^[a-z_]{1,20}$/.test(item.status)) cape.status = item.status;
  if (typeof item.reason === 'string') cape.reason = cleanText(item.reason, 300);
  if (Number.isFinite(item.pricePaid)) cape.pricePaid = count(item.pricePaid);
  if (typeof item.favorite === 'boolean') cape.favorite = item.favorite;
  return cape;
}
const publicCapes = items => Array.isArray(items) ? items.map(publicCape).filter(Boolean) : [];
function publicMe(me) {
  return { uuid: cleanText(me?.uuid, 36), name: cleanText(me?.name, 32), jetons: count(me?.jetons), capeId: isCapeId(me?.capeId) ? me.capeId : null };
}
function publicConfig(config) {
  return { uploadPrice: count(config?.uploadPrice), maxPending: count(config?.maxPending), maxTotal: count(config?.maxTotal) };
}
function expiry(value) {
  if (Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now() + 3600000;
}

class CaeserApi {
  // account(id?): liefert das (erneuerte) Minecraft-Konto { id, name, accessToken }; ohne id das aktive Konto.
  constructor({ directory, account, baseUrl = caeserApiUrl(), fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, ''); this.origin = new URL(this.baseUrl).origin;
    this.account = account; this.fetchImpl = fetch || null;
    this.cacheDir = path.join(directory, 'cape-cache');
    this.sessions = new Map(); // accountId -> { token, expiresAt }
    this.logins = new Map(); // accountId -> laufende Anmeldung
    this.vanillaUrls = new Map(); // Mojang-Cape-ID -> Textur-URL
  }
  // Zur Laufzeit auflösen, damit Tests fetch ersetzen können.
  get fetch() { return this.fetchImpl || globalThis.fetch; }
  forget(accountId) { this.sessions.delete(accountId); }
  secrets() { return [...this.sessions.values()].map(s => s.token); }

  async send(url, options, timeout, unreachable = UNREACHABLE) {
    try { return await this.fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeout) }); }
    catch { throw new CaeserApiError(unreachable); }
  }
  async readJson(response) {
    try { const text = await response.text(); return text ? JSON.parse(text) : {}; } catch { return null; }
  }
  backendError(response, body, secrets = []) {
    const message = redactSecrets(cleanText(body?.error, 300), [...this.secrets(), ...secrets]) || `Caeser-Server antwortet mit HTTP ${response.status}.`;
    return new CaeserApiError(message, { status: response.status, code: typeof body?.code === 'string' && /^[A-Z_]{1,40}$/.test(body.code) ? body.code : '',
      missing: Number.isFinite(body?.missing) ? count(body.missing) : undefined, capeId: isCapeId(body?.capeId) ? body.capeId : undefined });
  }
  // Ein Aufruf ans Backend ohne automatische Neuanmeldung.
  async raw(method, pathname, { json, body, contentType, token, timeout = TIMEOUT, secrets } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    else if (contentType) headers['Content-Type'] = contentType;
    const response = await this.send(this.baseUrl + pathname, { method, headers, body }, timeout);
    const data = await this.readJson(response);
    if (!response.ok) throw this.backendError(response, data, secrets);
    if (data === null) throw new CaeserApiError('Ungültige Antwort vom Caeser-Server.', { status: response.status });
    return data;
  }

  // Anmeldung: Challenge holen, bei Mojang "beitreten" (beweist den Kontobesitz), Challenge bestätigen.
  async login(account) {
    const uuid = String(account?.id || '').replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(uuid) || typeof account.accessToken !== 'string' || !account.accessToken) throw new CaeserApiError('Ungültiges Minecraft-Konto. Bitte melde es im Launcher neu an.');
    const secrets = [account.accessToken, account.refreshToken];
    const challenge = await this.raw('POST', '/v1/auth/challenge', { json: { name: account.name }, secrets });
    const challengeId = cleanText(challenge.challengeId, 200), serverId = cleanText(challenge.serverId, 200);
    if (!challengeId || !serverId) throw new CaeserApiError('Ungültige Antwort vom Caeser-Server.');
    const join = await this.send(SESSION_JOIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: account.accessToken, selectedProfile: uuid, serverId }) }, TIMEOUT, MOJANG_UNREACHABLE);
    if (join.status !== 204 && !join.ok) throw new CaeserApiError('Minecraft hat die Anmeldung beim Caeser-Server abgelehnt. Bitte melde dein Konto im Launcher neu an.', { status: join.status });
    const verified = await this.raw('POST', '/v1/auth/verify', { json: { challengeId }, secrets });
    if (typeof verified.token !== 'string' || !verified.token || verified.token.length > 4096) throw new CaeserApiError('Ungültige Antwort vom Caeser-Server.');
    const session = { token: verified.token, expiresAt: expiry(verified.expiresAt) };
    this.sessions.set(account.id, session);
    return session;
  }
  // Token für das Konto; force erzwingt eine neue Anmeldung. Gleichzeitige Anfragen teilen sich eine Anmeldung.
  async session(accountId, force = false) {
    const account = await this.account(accountId);
    const current = this.sessions.get(account.id);
    if (current && !force && current.expiresAt > Date.now() + 60000) return { account, token: current.token };
    if (force) this.sessions.delete(account.id);
    let pending = this.logins.get(account.id);
    if (!pending) {
      pending = this.login(account).finally(() => this.logins.delete(account.id));
      this.logins.set(account.id, pending);
    }
    const session = await pending;
    return { account, token: session.token };
  }
  // Authentifizierter Aufruf; bei 401 genau eine Neuanmeldung und ein zweiter Versuch.
  async request(method, pathname, options = {}) {
    const { account, token } = await this.session(options.accountId);
    try { return await this.raw(method, pathname, { ...options, token }); }
    catch (error) {
      if (error.status !== 401) throw error;
      const retry = await this.session(account.id, true);
      return this.raw(method, pathname, { ...options, token: retry.token });
    }
  }

  async config() { return publicConfig(await this.request('GET', '/v1/capes/config')); }
  async me() { return publicMe(await this.request('GET', '/v1/me')); }
  async list({ sort = 'popular', q = '', cursor = '' } = {}) {
    const params = new URLSearchParams({ sort });
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    const data = await this.request('GET', `/v1/capes?${params}`);
    return { items: publicCapes(data.items), nextCursor: typeof data.nextCursor === 'string' && data.nextCursor.length <= 512 ? data.nextCursor : null };
  }
  async mine() { const data = await this.request('GET', '/v1/capes/mine'); return { items: publicCapes(data.items) }; }
  async favorites() { const data = await this.request('GET', '/v1/capes/favorites'); return { items: publicCapes(data.items) }; }
  async setFavorite(id, favorite) {
    await this.request(favorite ? 'PUT' : 'DELETE', `/v1/capes/${encodeURIComponent(id)}/favorite`);
    return { id, favorite: Boolean(favorite) };
  }
  async selectCape(capeId) {
    const data = await this.request('PUT', '/v1/me/cape', { json: { capeId } });
    return { capeId: isCapeId(data?.capeId) ? data.capeId : capeId };
  }
  async report(id, reason) {
    await this.request('POST', `/v1/capes/${encodeURIComponent(id)}/report`, { json: { reason } });
    return { reported: true };
  }
  async upload(name, png) {
    const data = await this.request('POST', `/v1/capes?${new URLSearchParams({ name })}`, { body: png, contentType: 'image/png', timeout: UPLOAD_TIMEOUT });
    const cape = publicCape(data.cape);
    if (!cape) throw new CaeserApiError('Ungültige Antwort vom Caeser-Server.');
    return { cape, jetons: count(data.jetons) };
  }

  // --- Vanilla-Capes (Mojang) ---
  async mojang(method, url, accountId, body) {
    const account = await this.account(accountId);
    const headers = { Authorization: `Bearer ${account.accessToken}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.send(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, TIMEOUT, MOJANG_UNREACHABLE);
    const data = await this.readJson(response);
    if (!response.ok) {
      if (response.status === 401) throw new CaeserApiError('Die Minecraft-Sitzung ist abgelaufen. Bitte melde dein Konto im Launcher neu an.', { status: 401 });
      throw new CaeserApiError(`Minecraft-Dienste antworten mit HTTP ${response.status}.`, { status: response.status });
    }
    return data || {};
  }
  vanillaList(profile) {
    const capes = Array.isArray(profile?.capes) ? profile.capes : [];
    const list = [];
    for (const cape of capes) {
      if (!isVanillaCapeId(cape?.id)) continue;
      if (typeof cape.url === 'string') this.vanillaUrls.set(cape.id, cape.url);
      list.push({ id: cape.id, alias: cleanText(cape.alias, 40) || 'Cape', active: cape.state === 'ACTIVE' });
    }
    return { capes: list, active: list.find(c => c.active)?.id || null };
  }
  async vanillaCapes(accountId) { return this.vanillaList(await this.mojang('GET', MOJANG_PROFILE_URL, accountId)); }
  async setVanillaCape(capeId, accountId) {
    const profile = capeId
      ? await this.mojang('PUT', `${MOJANG_PROFILE_URL}/capes/active`, accountId, { capeId })
      : await this.mojang('DELETE', `${MOJANG_PROFILE_URL}/capes/active`, accountId);
    return this.vanillaList(profile);
  }

  // --- Bilder: nur vom Backend-Host oder von textures.minecraft.net, als Data-URL, mit Datei-Cache ---
  allowedImageUrl(url) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === TEXTURE_HOST)) return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.hostname === TEXTURE_HOST) { parsed.protocol = 'https:'; return parsed; }
    return parsed.origin === this.origin ? parsed : null;
  }
  async image(input) {
    if (typeof input === 'string' || input?.id !== undefined) {
      const id = typeof input === 'string' ? input : input.id;
      if (!isCapeId(id)) throw new CaeserApiError('Ungültige Cape-ID.');
      return this.cachedImage(`${id}.png`, () => this.loadImage(`${this.baseUrl}/v1/capes/${encodeURIComponent(id)}.png`, { backend: true }));
    }
    const id = input?.vanilla;
    if (!isVanillaCapeId(id)) throw new CaeserApiError('Ungültige Cape-ID.');
    const url = this.allowedImageUrl(this.vanillaUrls.get(id));
    const hash = url?.pathname.split('/').pop();
    if (!url || !TEXTURE_HASH.test(hash || '')) throw new CaeserApiError('Bild nicht gefunden.');
    return this.cachedImage(`mc-${hash}.png`, () => this.loadImage(url.href));
  }
  async loadImage(url, { backend = false } = {}) {
    const target = this.allowedImageUrl(url);
    if (!target) throw new CaeserApiError('Bildquelle nicht erlaubt.');
    const headers = {};
    // Eigene Capes in Prüfung liefert das Backend nur mit Token; ohne Konto wird öffentlich geladen.
    if (backend) { try { headers.Authorization = `Bearer ${(await this.session()).token}`; } catch {} }
    const response = await this.send(target.href, { headers }, IMAGE_TIMEOUT, backend ? UNREACHABLE : MOJANG_UNREACHABLE);
    if (!response.ok) throw new CaeserApiError('Bild nicht gefunden.', { status: response.status });
    if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new CaeserApiError('Das Bild ist zu groß.');
    const buffer = Buffer.from(await response.arrayBuffer());
    const size = pngSize(buffer);
    if (buffer.length > MAX_IMAGE_BYTES || !size || (backend ? !isCapeLayout(size.width, size.height) : size.width > 1024 || size.height > 1024)) throw new CaeserApiError('Ungültiges Cape-Bild.');
    return buffer;
  }
  async cachedImage(name, load) {
    const file = path.join(this.cacheDir, name);
    try {
      const buffer = await fs.readFile(file);
      if (isPng(buffer)) { const now = new Date(); await fs.utimes(file, now, now).catch(() => {}); return toDataUrl(buffer); }
    } catch {}
    const buffer = await load();
    await fs.mkdir(this.cacheDir, { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.part`;
    try { await fs.writeFile(temporary, buffer); await fs.rename(temporary, file); }
    catch {} finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
    await this.pruneCache();
    return toDataUrl(buffer);
  }
  // Höchstens 200 Dateien; die am längsten nicht benutzten werden gelöscht.
  async pruneCache(limit = MAX_CACHE_FILES) {
    let names;
    try { names = (await fs.readdir(this.cacheDir)).filter(n => n.endsWith('.png')); } catch { return; }
    if (names.length <= limit) return;
    const entries = await Promise.all(names.map(async name => ({ name, time: (await fs.stat(path.join(this.cacheDir, name)).catch(() => null))?.mtimeMs ?? 0 })));
    entries.sort((a, b) => a.time - b.time);
    for (const entry of entries.slice(0, entries.length - limit)) await fs.rm(path.join(this.cacheDir, entry.name), { force: true }).catch(() => {});
  }
}
module.exports = { CaeserApi, CaeserApiError, isCapeId, isVanillaCapeId, publicCape, UNREACHABLE, MAX_CACHE_FILES };
