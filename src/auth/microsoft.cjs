const { json } = require('../shared/net.cjs');
const { authorize } = require('./oauth.cjs');
const BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/';
const scope = 'XboxLive.signin offline_access';
const form = (url, values, signal) => json(url, { method: 'POST', body: new URLSearchParams(values), signal });
const post = (url, body, signal) => json(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });

async function minecraft(tokens, clientId, signal) {
  const xbox = await post('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${tokens.access_token}` },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT'
  }, signal);
  let xsts;
  try {
    xsts = await post('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbox.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT'
    }, signal);
  } catch (error) {
    if (error.xerr === 2148916233) throw new Error('Bitte zuerst ein Xbox-Profil für dieses Microsoft-Konto erstellen.');
    if (error.xerr === 2148916238) throw new Error('Die Xbox-Familieneinstellungen erlauben diese Anmeldung noch nicht.');
    throw error;
  }
  const identity = xsts.DisplayClaims.xui[0];
  let mc;
  try {
    mc = await post('https://api.minecraftservices.com/authentication/login_with_xbox', {
      identityToken: `XBL3.0 x=${identity.uhs};${xsts.Token}`
    }, signal);
  } catch (error) {
    if ([401, 403].includes(error.status)) throw new Error('Minecraft hat die Anmeldung abgelehnt. Prüfe die Freigabe deiner Microsoft-Anwendungs-ID für Minecraft.');
    throw error;
  }
  let profile;
  try { profile = await json('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${mc.access_token}` }, signal }); }
  catch (error) {
    if (error.status === 404) throw new Error('Dieses Konto hat kein Minecraft-Java-Profil. Prüfe den Besitz von Java Edition und lege dein Profil auf minecraft.net an.');
    throw error;
  }
  return { id: profile.id, name: profile.name, accessToken: mc.access_token, refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + mc.expires_in * 1000, clientId, xuid: identity.xid || '', skinUrl: profile.skins?.find(s=>s.state === 'ACTIVE')?.url || '' };
}
async function login(clientId, openBrowser, signal) {
  if (!/^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i.test(clientId)) throw new Error('Bitte in den Einstellungen eine gültige Microsoft-Anwendungs-ID hinterlegen.');
  const grant = await authorize({ clientId, scope, openBrowser, signal });
  const tokens = await form(BASE + 'token', { client_id: clientId, grant_type: 'authorization_code', code: grant.code,
    redirect_uri: grant.redirectUri, code_verifier: grant.verifier, scope }, signal);
  return minecraft(tokens, clientId, signal);
}
async function refresh(account) {
  if (account.expiresAt > Date.now() + 120000) return account;
  if (account.authFlow === 'sisu') return require('./sisu.cjs').refresh(account);
  const tokens = await form(BASE + 'token', { client_id: account.clientId, grant_type: 'refresh_token', refresh_token: account.refreshToken, scope });
  return minecraft({ ...tokens, refresh_token: tokens.refresh_token || account.refreshToken }, account.clientId);
}
module.exports = { login, refresh, minecraft };
