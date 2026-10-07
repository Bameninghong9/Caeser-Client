const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { authorize, authorizationURL } = require('../src/auth/oauth.cjs');
const { allowedNavigation } = require('../src/auth/window.cjs');
test('Sign-in navigation accepts Microsoft and only the exact local callback', () => {
  const redirect='http://localhost:4567/';
  for(const url of ['https://login.live.com/login.srf','https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize','http://localhost:4567/?code=test']) assert.equal(allowedNavigation(url,redirect),true);
  for(const url of ['https://live.com.example.org','http://login.live.com/','file:///C:/Windows','http://localhost:9999/','http://localhost:4567/other','https://user:password@login.live.com']) assert.equal(allowedNavigation(url,redirect),false);
});
test('Browser flow requests email login, personal accounts and S256 PKCE', () => {
  const url = new URL(authorizationURL({clientId:'client',scope:'XboxLive.signin offline_access',redirectUri:'http://localhost:3456/',state:'state',verifier:'verifier'}));
  assert.equal(url.origin,'https://login.microsoftonline.com');
  assert.equal(url.searchParams.get('prompt'),'login'); assert.equal(url.searchParams.get('response_type'),'code');
  assert.equal(url.searchParams.get('code_challenge'),crypto.createHash('sha256').update('verifier').digest('base64url'));
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
});
test('Loopback callback ignores forged state and accepts the matching response', async () => {
  let captured;
  const grant = await authorize({clientId:'client',scope:'scope',timeout:5000,openBrowser:async location=>{
    captured = new URL(location);
    const callback = new URL(captured.searchParams.get('redirect_uri')); callback.hostname='127.0.0.1';
    callback.search = new URLSearchParams({state:'forged',code:'bad'}).toString();
    const bad = await fetch(callback); assert.equal(bad.status,400); await bad.text();
    callback.search = new URLSearchParams({state:captured.searchParams.get('state'),code:'valid-code'}).toString();
    const good = await fetch(callback); assert.equal(good.status,200); await good.text();
  }});
  assert.equal(grant.code,'valid-code');
  assert.equal(crypto.createHash('sha256').update(grant.verifier).digest('base64url'),captured.searchParams.get('code_challenge'));
});
test('Cancellation and timeout close an unfinished login', async () => {
  const controller = new AbortController();
  await assert.rejects(authorize({clientId:'a',scope:'b',signal:controller.signal,openBrowser:async()=>controller.abort()}),{name:'AbortError'});
  await assert.rejects(authorize({clientId:'a',scope:'b',timeout:30,openBrowser:async()=>{}}),/abgelaufen/);
});
test('Closing the sign-in window cancels OAuth and disposes the window', async () => {
  let closed = 0;
  await assert.rejects(authorize({clientId:'a',scope:'b',openBrowser:(_url,{cancel})=>{
    setTimeout(cancel,10); return ()=>closed++;
  }}),{name:'AbortError'});
  assert.equal(closed,1);
});
test('A failed sign-in page closes the window and reports a useful error', async () => {
  let closed = 0;
  await assert.rejects(authorize({clientId:'a',scope:'b',openBrowser:(_url,{fail})=>{
    setTimeout(()=>fail(new Error('Page unavailable')),10); return ()=>closed++;
  }}),/Page unavailable/);
  assert.equal(closed,1);
});
