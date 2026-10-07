const http = require('node:http');
const crypto = require('node:crypto');

function authorizationURL({ clientId, scope, redirectUri, state, verifier }) {
  const url = new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
  url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
    response_mode: 'query', scope, state, code_challenge_method: 'S256',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), prompt: 'login', ui_locales: 'de' }).toString();
  return url.href;
}

// Only an authorization code returns from Microsoft's isolated sign-in page.
function authorize({ clientId, scope, openBrowser, signal, timeout = 300000 }) {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    let settled = false, redirectUri, timer, closeBrowser;
    const server = http.createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      const url = new URL(req.url, redirectUri);
      if (req.method !== 'GET' || url.pathname !== '/') { res.writeHead(404).end('Nicht gefunden.'); return; }
      if (url.searchParams.get('state') !== state) { res.writeHead(400).end('Ungültige Anmeldeantwort.'); return; }
      if (url.searchParams.has('error')) {
        res.end('Anmeldung abgebrochen. Du kannst dieses Fenster schließen.');
        finish(new Error('Microsoft-Anmeldung abgebrochen oder abgelehnt.')); return;
      }
      const code = url.searchParams.get('code');
      if (!code) { res.writeHead(400).end('Anmeldecode fehlt.'); return; }
      res.end('Anmeldung empfangen. Du kannst zu Caeser Client zurückkehren und dieses Fenster schließen.');
      finish(null, { code, redirectUri, verifier });
    });
    function finish(error, result) {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      closeBrowser?.();
      server.close(); server.closeIdleConnections();
      error ? reject(error) : resolve(result);
    }
    const abort = () => finish(new DOMException('Anmeldung abgebrochen.', 'AbortError'));
    server.on('error', error => finish(error));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    timer = setTimeout(() => finish(new Error('Die Anmeldung ist abgelaufen. Bitte erneut versuchen.')), timeout);
    server.listen(0, '127.0.0.1', async () => {
      if (settled) { server.close(); return; }
      redirectUri = `http://localhost:${server.address().port}/`;
      try {
        const close = await openBrowser(authorizationURL({ clientId, scope, redirectUri, state, verifier }), { cancel: abort, fail: error => finish(error) });
        if (typeof close === 'function') { if (settled) close(); else closeBrowser = close; }
      }
      catch (error) { finish(error); }
    });
  });
}
module.exports = { authorize, authorizationURL };
