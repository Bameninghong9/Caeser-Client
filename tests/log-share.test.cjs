const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { redactLog, buildShareText, uploadToMclogs, MCLOGS_API, MCLOGS_MAX_BYTES, MCLOGS_MAX_LINES } = require('../src/shared/log-share.cjs');

const ctx = { secrets: ['geheimer-access-token-123', 'refresh-token-456789'], usernames: ['Max', 'Max Muster'] };
const one = (line, context = ctx) => redactLog([line], context)[0];

test('redactLog entfernt Tokens, JWTs und Sitzungsdaten', () => {
  assert.equal(one('auth geheimer-access-token-123 ok'), 'auth [TOKEN] ok');
  assert.equal(one('refresh=refresh-token-456789'), 'refresh=[TOKEN]');
  assert.equal(one('java -jar mc.jar --username Steve --accessToken abc.def.ghi --version 1.21'), 'java -jar mc.jar --username Steve --accessToken [TOKEN] --version 1.21');
  assert.equal(one('accessToken=xyz123&foo=1'), 'accessToken=[TOKEN]&foo=1');
  assert.equal(one('{"access_token":"qwertz"}'), '{"access_token":"[TOKEN]"}');
  assert.equal(one('Session: token:abc123:def456 aktiv'), 'Session: token:[TOKEN] aktiv');
  assert.equal(one('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'), 'Bearer [TOKEN]');
});

test('redactLog ersetzt Benutzernamen in Pfaden', () => {
  assert.equal(one('Lade C:\\Users\\Max\\AppData\\Roaming\\Caeser Client\\x.jar'), 'Lade C:\\Users\\<user>\\AppData\\Roaming\\Caeser Client\\x.jar');
  assert.equal(one('Pfad c:/Users/Max Muster/Desktop/a.png'), 'Pfad c:/Users/<user>/Desktop/a.png');
  assert.equal(one('/Users/max/Library/x'), '/Users/<user>/Library/x');
  assert.equal(one('/home/max/.minecraft'), '/home/<user>/.minecraft');
  assert.equal(one('C:\\Users\\Fremd\\x', { secrets: [], usernames: [] }), 'C:\\Users\\<user>\\x', 'auch unbekannte Namen');
  assert.equal(one('C:\\Users\\Public\\x'), 'C:\\Users\\Public\\x');
});

test('redactLog ersetzt IP- und E-Mail-Adressen', () => {
  assert.equal(one('Connecting to 192.168.178.20, 25565'), 'Connecting to [IP], 25565');
  assert.equal(one('Server 10.0.0.1.'), 'Server [IP].');
  assert.equal(one('IPv6 [2001:db8:85a3::8a2e:370:7334]:25565'), 'IPv6 [[IP]]:25565');
  assert.equal(one('voll fe80:0000:0000:0000:0204:61ff:fe9d:f156 lokal'), 'voll [IP] lokal');
  assert.equal(one('loopback ::1'), 'loopback [IP]');
  assert.equal(one('Kontakt: max.muster@example.com'), 'Kontakt: [EMAIL]');
});

test('redactLog lässt normale Logzeilen unverändert', () => {
  const lines = [
    '[12:34:56] [Render thread/INFO]: Setting user: Steve',
    '[12:34:57] [main/INFO]: Loading Minecraft 1.21.11 with Fabric Loader 0.18.1',
    '[12:35:00] [main/WARN]: Mod fabric-api 0.140.2+1.21.11 uses deprecated API',
    'java.lang.NullPointerException: Cannot invoke "net.minecraft.class_310.method_1551()"',
    '\tat net.minecraft.client.Main::main(Main.java:42)',
    '[12:35:01] [main/ERROR]: Mixin apply failed sodium.mixins.json:core.MixinFoo -> net.minecraft.Foo'
  ];
  assert.deepEqual(redactLog(lines, ctx), lines);
  assert.notEqual(redactLog(lines, ctx), lines, 'liefert ein neues Array');
});

test('buildShareText kürzt von oben und behält die letzte Zeile', () => {
  const header = ['[Caeser Client] Kopf', ''];
  const lines = Array.from({ length: 50 }, (_, i) => `Zeile ${i} ${'x'.repeat(50)}`);
  const text = buildShareText(header, lines, { maxBytes: 1200, maxLines: 30 });
  assert.ok(Buffer.byteLength(text) <= 1200);
  assert.ok(text.split('\n').length <= 30);
  assert.ok(text.endsWith(lines.at(-1)));
  assert.match(text, /^\[Caeser Client\] Kopf\n\n\[… \d+ ältere Zeilen vom Caeser Client gekürzt …\]/);
  const big = Array.from({ length: MCLOGS_MAX_LINES + 10 }, (_, i) => `L${i}`);
  const full = buildShareText(header, big);
  assert.ok(full.split('\n').length <= MCLOGS_MAX_LINES && Buffer.byteLength(full) <= MCLOGS_MAX_BYTES);
  assert.ok(full.endsWith(`L${MCLOGS_MAX_LINES + 9}`));
  assert.equal(buildShareText(header, ['a', 'b']), '[Caeser Client] Kopf\n\na\nb', 'kleine Logs bleiben vollständig');
});

test('uploadToMclogs: Erfolg', async () => {
  let request;
  const fetchImpl = async (url, options) => { request = { url, options }; return Response.json({ success: true, id: 'Ab12Cd', url: 'https://mclo.gs/Ab12Cd', raw: 'https://api.mclo.gs/1/raw/Ab12Cd', token: 'x' }); };
  assert.deepEqual(await uploadToMclogs('hallo', { fetchImpl }), { url: 'https://mclo.gs/Ab12Cd', id: 'Ab12Cd' });
  assert.equal(request.url, MCLOGS_API); assert.equal(request.options.method, 'POST');
  assert.equal(JSON.parse(request.options.body).content, 'hallo');
});

test('uploadToMclogs: Fehlerfälle mit verständlichen Meldungen', async () => {
  await assert.rejects(uploadToMclogs('x', { fetchImpl: async () => Response.json({ success: false, error: 'Required field \'content\' not found.' }) }), /abgelehnt: Required field/);
  await assert.rejects(uploadToMclogs('x', { fetchImpl: async () => new Response('Bad Gateway', { status: 502 }) }), /HTTP 502/);
  await assert.rejects(uploadToMclogs('x', { fetchImpl: async () => new Response('', { status: 429 }) }), /Zu viele Uploads/);
  await assert.rejects(uploadToMclogs('x', { fetchImpl: async () => { throw new TypeError('fetch failed'); } }), /nicht erreichbar/);
  await assert.rejects(uploadToMclogs('x', { fetchImpl: async () => Response.json({ success: true, id: 'a', url: 'https://evil.example/a' }) }), /Unerwartete Antwort/);
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await assert.rejects(uploadToMclogs('x', { fetchImpl: hang, timeoutMs: 30 }), /Zeitüberschreitung/);
});

test('Controller: ohne Bestätigung kein Netzwerkaufruf, danach Upload mit geschwärztem Log', async t => {
  const { Controller } = require('../src/app/controller.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-share-'));
  let answer = { ok: false }, dialogs = 0; const clipboard = [], opened = [], uploads = [];
  const controller = new Controller({ directory: dir, resources: dir, appVersion: '9.9.9', emit: () => {}, openBrowser: () => {},
    confirmShare: async () => { dialogs++; return answer; }, writeClipboard: text => clipboard.push(text), openExternal: async url => opened.push(url) });
  t.mock.method(globalThis, 'fetch', async (url, options) => { uploads.push(JSON.parse(options.body).content); return Response.json({ success: true, id: 'XyZ123', url: 'https://mclo.gs/XyZ123' }); });
  t.after(async () => { controller.destroy(); await fs.rm(dir, { recursive: true, force: true }); });
  await controller.load();
  controller.accounts = [{ id: 'a', name: 'Spieler', accessToken: 'sehr-geheimes-token-1', refreshToken: 'sehr-geheimes-token-2' }];
  controller.logs.add({ id: 'inst', profileName: 'Mein geheimes Profil', profileVersion: '1.21.11', profileMode: 'fabric' });
  controller.logs.push('inst', 'Token sehr-geheimes-token-1 in C:\\Users\\Max\\x');
  controller.logs.finish('inst', { status: 'crashed', exitCode: 1 });

  await assert.rejects(controller.shareLog('unbekannt'), /Log nicht gefunden/);
  assert.deepEqual(await controller.shareLog('inst'), { canceled: true });
  assert.equal(uploads.length, 0, 'ohne Bestätigung kein Upload');

  answer = { ok: true, remember: false };
  const res = await controller.shareLog('inst');
  assert.deepEqual(res, { url: 'https://mclo.gs/XyZ123', id: 'XyZ123' });
  assert.deepEqual(clipboard, ['https://mclo.gs/XyZ123']);
  const content = uploads[0];
  assert.ok(!content.includes('sehr-geheimes-token-1') && content.includes('[TOKEN]'));
  assert.ok(!content.includes('Mein geheimes Profil') && !content.includes('Spieler'), 'keine Profil- oder Kontonamen');
  assert.match(content, /Launcher-Version: 9\.9\.9/); assert.match(content, /Spielart: Fabric \| Minecraft: 1\.21\.11/); assert.match(content, /Status: abgestürzt \| Exit-Code: 1/);
  await controller.shareLog('inst');
  assert.equal(dialogs, 2, 'pro Sitzung nur einmal fragen');
  assert.equal(controller.settings.shareLogsConfirmed, false);

  await controller.openSharedLog('XyZ123');
  assert.deepEqual(opened, ['https://mclo.gs/XyZ123']);
  await assert.rejects(controller.openSharedLog('https://evil.example'), /Link nicht gefunden/);
  await assert.rejects(controller.updateSettings({ shareLogsConfirmed: 'ja' }), /Ungültige Einstellung/);
  assert.equal((await controller.updateSettings({ shareLogsConfirmed: true })).settings.shareLogsConfirmed, true);
});

test('Controller: „Nicht erneut fragen“ wird gespeichert', async t => {
  const { Controller } = require('../src/app/controller.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caeser-share-'));
  let dialogs = 0;
  const controller = new Controller({ directory: dir, resources: dir, appVersion: 'test', emit: () => {}, openBrowser: () => {}, confirmShare: async () => { dialogs++; return { ok: true, remember: true }; } });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, id: 'a1', url: 'https://mclo.gs/a1' }));
  t.after(async () => { controller.destroy(); await fs.rm(dir, { recursive: true, force: true }); });
  await controller.load();
  controller.logs.add({ id: 'i' }); controller.logs.push('i', 'x');
  await controller.shareLog('i');
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf8')).shareLogsConfirmed, true);
  controller.shareConsentGiven = false; await controller.shareLog('i');
  assert.equal(dialogs, 1);
});
