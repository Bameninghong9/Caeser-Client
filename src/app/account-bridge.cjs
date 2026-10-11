// Lokale Account-Brücke für den Ingame-Account-Switcher der Caeser-Mod.
// Die Konten bleiben im Launcher (accounts.bin); die laufende Minecraft-Instanz bekommt nur für den
// gewählten Account ein frisches Access-Token, niemals Refresh-Tokens.
// Zugang nur über 127.0.0.1 und ein zufälliges Token pro Instanz (per Umgebungsvariable übergeben).
const http = require('node:http');
const crypto = require('node:crypto');
const auth = require('../auth/microsoft.cjs');
const HOST = '127.0.0.1';
const MAX_BODY = 4096;
const SWITCH_INTERVAL = 1000;
// Mod-Timeout 10 s: Token-Erneuerung plus Skin-Sync müssen darunter bleiben.
const SKIN_SYNC_TIMEOUT = 6000;
const ROUTES = { '/v1/accounts': 'GET', '/v1/accounts/switch': 'POST', '/v1/accounts/login': 'POST' };

// Ersetzt alle bekannten Geheimnisse; leere Werte würden sonst jede Stelle des Texts treffen.
function redactSecrets(text, secrets) {
  let result = String(text);
  for (const secret of secrets) if (typeof secret === 'string' && secret) result = result.replaceAll(secret, '[TOKEN]');
  return result;
}
// Verständliche Meldung für den Spieler; technische Fehler (Netzwerk, Dateisystem) werden nicht durchgereicht.
function playerMessage(error, fallback, secrets) {
  if (error?.name === 'AbortError') return 'Anmeldung abgebrochen.';
  if (error?.name === 'TimeoutError') return 'Microsoft antwortet gerade nicht. Bitte versuche es später erneut.';
  if (error instanceof TypeError && /fetch/i.test(error.message)) return 'Keine Verbindung zu Microsoft. Prüfe deine Internetverbindung und versuche es erneut.';
  if (error instanceof TypeError || error?.syscall || typeof error?.errno === 'number') return fallback;
  const text = redactSecrets(error?.message || '', secrets).trim();
  return text && text.length <= 300 ? text : fallback;
}

// skinId und error nur mitsenden, wenn gesetzt.
function skinSyncBody({ status, skinId, error }) {
  return { status, ...(skinId ? { skinId } : {}), ...(error ? { error } : {}) };
}

class AccountBridge {
  constructor(controller, { log = console, skinSyncTimeout = SKIN_SYNC_TIMEOUT } = {}) {
    this.controller = controller; this.log = log; this.skinSyncTimeout = skinSyncTimeout;
    this.tokens = new Map(); // token -> { instanceId, accountId, lastSwitch }
    this.server = null; this.port = 0; this.listening = null; this.closing = null;
    this.loginRunning = false; this.loginError = null; this.lastAddedId = null;
  }
  get url() { return this.server ? `http://${HOST}:${this.port}` : null; }
  address() { return this.server?.address() || null; }
  secrets() { return [...this.controller.accounts.flatMap(a => [a.accessToken, a.refreshToken]), ...this.tokens.keys()]; }
  // Technische Details nur gekürzt und ohne Tokens in die Konsole.
  warn(message, error) { this.log.warn(`[Account-Brücke] ${message}:`, redactSecrets(error?.message || error || 'Unbekannter Fehler', this.secrets()).slice(0, 200)); }

  // Pro Instanz ein Token; die Instanz spielt anfangs mit dem Start-Account.
  register(instanceId, accountId) {
    const token = crypto.randomBytes(32).toString('hex');
    this.tokens.set(token, { instanceId, accountId, lastSwitch: 0 });
    return token;
  }
  // Instanz beendet: Token sofort ungültig; ohne laufende Instanz wird der Server gestoppt.
  unregister(token) {
    this.tokens.delete(token);
    if (!this.tokens.size) this.stop().catch(error => this.warn('Server konnte nicht gestoppt werden', error));
  }
  async start() {
    for (;;) {
      if (this.closing) { await this.closing; continue; }
      if (!this.listening) this.listening = this.listen();
      const pending = this.listening;
      try { await pending; } catch (error) { if (this.listening === pending) this.listening = null; throw error; }
      if (this.listening === pending && this.server) return this.url;
    }
  }
  listen() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handle(req, res).catch(error => {
        this.warn('Anfrage fehlgeschlagen', error);
        if (!res.headersSent) this.send(res, 500, { error: 'Interner Fehler in der Account-Brücke.' });
      }));
      server.requestTimeout = 10000; server.headersTimeout = 5000;
      server.once('error', reject);
      server.listen(0, HOST, () => {
        server.off('error', reject); server.on('error', error => this.warn('Serverfehler', error));
        server.unref(); this.server = server; this.port = server.address().port; resolve();
      });
    });
  }
  stop() {
    const pending = this.listening; this.listening = null;
    if (!pending) return this.closing || Promise.resolve();
    this.closing = pending.then(() => new Promise(resolve => {
      const server = this.server; this.server = null; this.port = 0;
      server.close(() => resolve()); server.closeAllConnections();
    }), () => {}).finally(() => { this.closing = null; });
    return this.closing;
  }

  send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  // Token-Vergleich in konstanter Zeit gegen alle registrierten Instanzen.
  authenticate(header) {
    const match = /^Bearer ([0-9a-f]{64})$/.exec(typeof header === 'string' ? header : '');
    if (!match) return null;
    const given = Buffer.from(match[1]);
    let found = null;
    for (const [token, entry] of this.tokens) {
      const expected = Buffer.from(token);
      if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) found = entry;
    }
    return found;
  }
  readBody(req) {
    return new Promise((resolve, reject) => {
      if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); resolve(null); return; }
      const chunks = []; let size = 0, tooLarge = false;
      req.on('data', chunk => { if (tooLarge) return; size += chunk.length; if (size > MAX_BODY) { tooLarge = true; chunks.length = 0; } else chunks.push(chunk); });
      req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  async handle(req, res) {
    // Browser schicken bei Cross-Origin-Anfragen immer Origin mit; DNS-Rebinding erkennt man am falschen Host.
    if (req.headers.origin !== undefined || req.headers.host !== `${HOST}:${this.port}`) { req.resume(); return this.send(res, 403, { error: 'Zugriff verweigert.' }); }
    const entry = this.authenticate(req.headers.authorization);
    if (!entry) { req.resume(); return this.send(res, 401, { error: 'Nicht autorisiert.' }); }
    const pathname = (req.url || '').split('?')[0];
    if (!(pathname in ROUTES)) { req.resume(); return this.send(res, 404, { error: 'Unbekannte Anfrage.' }); }
    if (req.method !== ROUTES[pathname]) { req.resume(); res.setHeader('Allow', ROUTES[pathname]); return this.send(res, 405, { error: 'Methode nicht erlaubt.' }); }
    if (req.method === 'GET') { req.resume(); return this.send(res, 200, this.list(entry)); }
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) { req.resume(); return this.send(res, 415, { error: 'Ungültiges Anfrageformat.' }); }
    const raw = await this.readBody(req);
    if (raw === null) return this.send(res, 413, { error: 'Anfrage zu groß.' });
    let body;
    try { body = raw.trim() ? JSON.parse(raw) : {}; } catch { body = null; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return this.send(res, 400, { error: 'Ungültige Anfrage.' });
    if (pathname === '/v1/accounts/switch') return this.switch(res, entry, body);
    return this.login(res);
  }
  // Niemals Tokens: nur ID, Name und ob diese Instanz gerade damit spielt.
  list(entry) {
    return {
      accounts: this.controller.accounts.map(a => ({ id: a.id, name: a.name, active: a.id === entry.accountId })),
      login: { running: this.loginRunning || Boolean(this.controller.loginController), error: this.loginError, lastAddedId: this.lastAddedId }
    };
  }
  async switch(res, entry, body) {
    if (typeof body.id !== 'string' || !body.id) return this.send(res, 400, { error: 'Ungültige Anfrage.' });
    const now = Date.now();
    if (now - entry.lastSwitch < SWITCH_INTERVAL) return this.send(res, 429, { error: 'Bitte warte einen Moment, bevor du erneut wechselst.' });
    entry.lastSwitch = now;
    const stored = this.controller.accounts.find(a => a.id === body.id);
    if (!stored) return this.send(res, 404, { error: 'Dieses Konto ist im Launcher nicht (mehr) vorhanden.' });
    let account;
    try { account = await auth.refresh(stored); }
    catch (error) {
      this.warn('Konto konnte nicht erneuert werden', error);
      return this.send(res, 502, { error: playerMessage(error, 'Das Konto konnte nicht erneuert werden. Bitte melde es im Launcher erneut an.', this.secrets()) });
    }
    await this.controller.updateAccount(account);
    entry.accountId = account.id;
    this.controller.settings.activeAccount = account.id; await this.controller.saveSettings();
    this.controller.emit('accounts-changed');
    const skinSync = await this.syncSkin(account.id);
    // Der Skin-Upload kann das Konto erneut erneuern und speichern: Token frisch lesen.
    const current = this.controller.accounts.find(a => a.id === account.id) || account;
    return this.send(res, 200, { id: current.id, name: current.name, accessToken: current.accessToken, xuid: current.xuid || null,
      clientId: current.clientId || null, expiresAt: Number.isFinite(current.expiresAt) ? current.expiresAt : null, skinSync });
  }
  // Skin vor dem ersten Server-Beitritt übertragen, aber höchstens skinSyncTimeout warten.
  // Ein Fehler verhindert den Wechsel nie; ein verspäteter Fehler geht als Hinweis an die Launcher-UI.
  async syncSkin(accountId) {
    const skinId = this.controller.settings.activeSkinId || undefined;
    const sync = Promise.resolve().then(() => this.controller.syncSkinForAccount(accountId)).catch(error => {
      this.warn('Skin-Sync fehlgeschlagen', error);
      return { status: 'failed', skinId, error: 'Der Skin konnte nicht auf das Minecraft-Konto übertragen werden.' };
    });
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(resolve, this.skinSyncTimeout, null); });
    const result = await Promise.race([sync, timeout]);
    clearTimeout(timer);
    if (!result) {
      sync.then(late => {
        if (late.status === 'failed') this.controller.emit('notice', `Skin konnte nicht auf das Minecraft-Konto übertragen werden: ${late.error}`);
      });
      return skinSyncBody({ status: 'pending', skinId });
    }
    return skinSyncBody(result);
  }
  // Startet die Anmeldung im Hintergrund; die Mod fragt danach GET /v1/accounts ab.
  login(res) {
    if (this.loginRunning || this.controller.loginController) return this.send(res, 409, { error: 'Es läuft bereits eine Anmeldung.' });
    this.loginRunning = true; this.loginError = null; this.lastAddedId = null;
    // Ergebnis zuerst festhalten, erst dann running = false: die Mod sieht nie "fertig" ohne Ergebnis.
    this.controller.addAccount({ foreground: true }).then(account => {
      this.lastAddedId = account.id;
      this.controller.emit('accounts-changed');
    }, error => {
      if (error?.name !== 'AbortError') this.warn('Anmeldung fehlgeschlagen', error);
      this.loginError = playerMessage(error, 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.', this.secrets());
    }).catch(error => this.warn('Anmeldung konnte nicht abgeschlossen werden', error)).finally(() => { this.loginRunning = false; });
    return this.send(res, 202, { started: true });
  }
}
module.exports = { AccountBridge, redactSecrets, playerMessage };
