// Xbox SISU protocol reference: NoRiskClient/noriskclient-launcher,
// commit 2a283c5f35e946554a1afaaafacc7776c63a4eb4, minecraft_auth.rs.
// This module never contacts NoRisk services or handles Microsoft passwords.
const crypto = require('node:crypto');
const CLIENT_ID = '00000000402b5328';
const CALLBACK = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';
const TOKEN_URL = 'https://login.live.com/oauth20_token.srf';

function deviceIdentity(saved) {
  const privateKey = saved?.privateJwk
    ? crypto.createPrivateKey({ key: saved.privateJwk, format: 'jwk' })
    : crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
  const privateJwk = privateKey.export({ format: 'jwk' });
  const { x, y } = crypto.createPublicKey(privateKey).export({ format: 'jwk' });
  return { id: saved?.id || crypto.randomUUID(), privateKey, privateJwk,
    proof: { kty: 'EC', x, y, crv: 'P-256', alg: 'ES256', use: 'sig' } };
}
function signature(privateKey, pathname, body, now) {
  const version = Buffer.alloc(4); version.writeUInt32BE(1);
  const time = Buffer.alloc(8); time.writeBigUInt64BE((BigInt(Math.floor(now / 1000)) + 11644473600n) * 10000000n);
  const zero = Buffer.from([0]);
  const input = Buffer.concat([version, zero, time, zero, Buffer.from('POST'), zero, Buffer.from(pathname), zero, zero, Buffer.from(body), zero]);
  const signed = crypto.sign('sha256', input, { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return Buffer.concat([version, time, signed]).toString('base64');
}
function failure(status, body, stage) {
  if ([2148916233].includes(body?.XErr)) return new Error('Bitte erstelle zunächst ein Xbox-Profil für dein Microsoft-Konto.');
  if ([2148916235, 2148916238].includes(body?.XErr)) return new Error('Die Xbox-Familieneinstellungen müssen die Minecraft-Anmeldung erlauben.');
  if ([2148916236, 2148916237].includes(body?.XErr)) return new Error('Xbox verlangt eine Alters- oder Regionsprüfung für dieses Konto.');
  if (body?.error === 'invalid_grant') return new Error('Die Microsoft-Sitzung ist abgelaufen. Bitte melde dich erneut an.');
  if (stage === 'Minecraft-Profil' && status === 404) return new Error('Dieses Microsoft-Konto besitzt kein Minecraft-Java-Profil. Prüfe Java Edition auf minecraft.net.');
  return new Error(`${stage} fehlgeschlagen (HTTP ${status}). Bitte versuche die Anmeldung erneut.`);
}
async function request(url, options, stage, signal) {
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch(url, { ...options, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  let body; try { body = await response.json(); } catch { throw failure(response.status, null, stage); }
  if (!response.ok) throw failure(response.status, body, stage);
  return { body, headers: response.headers, date: Date.parse(response.headers.get('date')) || Date.now() };
}
function requireString(value, name) { if (typeof value !== 'string' || !value) throw new Error(`${name}: Unvollständige Antwort von Microsoft.`); return value; }
async function signed(context, url, data, stage, signal) {
  const body = JSON.stringify(data), headers = { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json',
    Signature: signature(context.device.privateKey, new URL(url).pathname, body, Date.now() + context.clockOffset) };
  if (url !== 'https://sisu.xboxlive.com/authorize') headers['x-xbl-contract-version'] = '1';
  const result = await request(url, { method: 'POST', headers, body }, stage, signal);
  context.clockOffset = result.date - Date.now(); return result;
}
async function context(saved, signal) {
  const context = { device: deviceIdentity(saved), clockOffset: 0 };
  const result = await signed(context, 'https://device.auth.xboxlive.com/device/authenticate', {
    Properties: { AuthMethod: 'ProofOfPossession', Id: `{${context.device.id.toUpperCase()}}`, DeviceType: 'Win32', Version: '10.16.0', ProofKey: context.device.proof },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT'
  }, 'Xbox-Geräteanmeldung', signal);
  context.deviceToken = requireString(result.body.Token, 'Xbox-Geräteanmeldung'); return context;
}
async function begin(signal) {
  const ctx = await context(null, signal);
  const verifier = crypto.randomBytes(48).toString('base64url'), state = crypto.randomBytes(32).toString('base64url');
  const result = await signed(ctx, 'https://sisu.xboxlive.com/authenticate', {
    AppId: CLIENT_ID, DeviceToken: ctx.deviceToken, Offers: [SCOPE],
    Query: { code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state, prompt: 'select_account' },
    RedirectUri: CALLBACK, Sandbox: 'RETAIL', TokenType: 'code', TitleId: '1794566092'
  }, 'Microsoft-Anmeldung', signal);
  const url = requireString(result.body.MsaOauthRedirect, 'Microsoft-Anmeldung');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['login.live.com', 'login.microsoftonline.com'].includes(parsed.hostname) || parsed.username || parsed.password) throw new Error('Microsoft hat eine unerwartete Anmeldeadresse geliefert.');
  return { ctx, verifier, state, url, sessionId: requireString(result.headers.get('x-sessionid'), 'Microsoft-Anmeldung') };
}
function callback(value, expectedState) {
  const url = new URL(value), expected = new URL(CALLBACK);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) return null;
  const actual = Buffer.from(url.searchParams.get('state') || ''), state = Buffer.from(expectedState);
  if (actual.length !== state.length || !crypto.timingSafeEqual(actual, state)) throw new Error('Die Microsoft-Anmeldeantwort gehört nicht zu diesem Anmeldeversuch.');
  if (url.searchParams.has('error')) throw new Error('Microsoft-Anmeldung abgebrochen oder abgelehnt.');
  return requireString(url.searchParams.get('code'), 'Microsoft-Anmeldecode');
}
function show(flow, openBrowser, signal, timeout = 600000) {
  return new Promise((resolve, reject) => {
    let settled = false, close;
    const finish = (error, code) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); close?.(); error ? reject(error) : resolve(code); };
    const cancel = () => finish(new DOMException('Anmeldung abgebrochen.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Die Anmeldung ist abgelaufen. Bitte erneut versuchen.')), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      const pending = openBrowser(flow.url, { redirectUri: CALLBACK, cancel, fail: error => finish(error), onNavigate: url => {
        try { const code = callback(url, flow.state); if (code) { finish(null, code); return true; } return false; }
        catch (error) { finish(error); return true; }
      } });
      Promise.resolve(pending).then(dispose => { if (typeof dispose === 'function') { if (settled) dispose(); else close = dispose; } }, error => finish(error));
    } catch (error) { finish(error); }
  });
}
async function tokens(values, signal) {
  const { body } = await request(TOKEN_URL, { method: 'POST', headers: { Accept: 'application/json' },
    body: new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: CALLBACK, scope: SCOPE, ...values }) }, 'Microsoft-Sitzung', signal);
  requireString(body.access_token, 'Microsoft-Sitzung'); return body;
}
async function complete(ctx, tokens, sessionId, signal) {
  const { body: sisu } = await signed(ctx, 'https://sisu.xboxlive.com/authorize', {
    AccessToken: `t=${tokens.access_token}`, AppId: CLIENT_ID, DeviceToken: ctx.deviceToken, ProofKey: ctx.device.proof,
    Sandbox: 'RETAIL', SessionId: sessionId || null, SiteName: 'user.auth.xboxlive.com', RelyingParty: 'http://xboxlive.com', UseModernGamertag: true
  }, 'Xbox-Anmeldung', signal);
  const { body: xsts } = await signed(ctx, 'https://xsts.auth.xboxlive.com/xsts/authorize', {
    RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT',
    Properties: { SandboxId: 'RETAIL', UserTokens: [requireString(sisu.UserToken?.Token, 'Xbox-Nutzertoken')], DeviceToken: ctx.deviceToken, TitleToken: requireString(sisu.TitleToken?.Token, 'Xbox-Anwendungstoken') }
  }, 'Xbox-Freigabe', signal);
  const identity = xsts.DisplayClaims?.xui?.[0];
  const { body: mc } = await request('https://api.minecraftservices.com/launcher/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ platform: 'PC_LAUNCHER', xtoken: `XBL3.0 x=${requireString(identity?.uhs, 'Xbox-Profil')};${requireString(xsts.Token, 'Xbox-Freigabe')}` })
  }, 'Minecraft-Anmeldung', signal);
  requireString(mc.access_token, 'Minecraft-Anmeldung');
  const { body: profile } = await request('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${mc.access_token}` } }, 'Minecraft-Profil', signal);
  return { id: requireString(profile.id, 'Minecraft-Profil'), name: requireString(profile.name, 'Minecraft-Profil'),
    accessToken: mc.access_token, refreshToken: requireString(tokens.refresh_token, 'Microsoft-Sitzung'),
    expiresAt: Date.now() + (Number(mc.expires_in) > 0 ? Number(mc.expires_in) : 86400) * 1000,
    clientId: CLIENT_ID, authFlow: 'sisu', xuid: identity.xid || '', skinUrl: profile.skins?.find(s => s.state === 'ACTIVE')?.url || '',
    device: { id: ctx.device.id, privateJwk: ctx.device.privateJwk } };
}
async function login(openBrowser, signal) {
  const flow = await begin(signal), code = await show(flow, openBrowser, signal);
  return complete(flow.ctx, await tokens({ grant_type: 'authorization_code', code, code_verifier: flow.verifier }, signal), flow.sessionId, signal);
}
async function refresh(account, signal) {
  const ctx = await context(account.device, signal);
  const token = await tokens({ grant_type: 'refresh_token', refresh_token: account.refreshToken }, signal);
  return complete(ctx, { ...token, refresh_token: token.refresh_token || account.refreshToken }, null, signal);
}
module.exports = { login, refresh, begin, show, callback, signature, deviceIdentity, CLIENT_ID, CALLBACK };
