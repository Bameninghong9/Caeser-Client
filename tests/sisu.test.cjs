const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const sisu=require('../src/auth/sisu.cjs');
const auth=require('../src/auth/microsoft.cjs');
test('Xbox request signature verifies the method, path, payload and timestamp',()=>{
 const device=sisu.deviceIdentity(), body='{"test":true}';
 const signed=Buffer.from(sisu.signature(device.privateKey,'/authenticate',body,1700000000000),'base64');
 assert.equal(signed.length,76);assert.equal(signed.readUInt32BE(0),1);
 const zero=Buffer.from([0]);
 const message=Buffer.concat([signed.subarray(0,4),zero,signed.subarray(4,12),zero,Buffer.from('POST'),zero,Buffer.from('/authenticate'),zero,zero,Buffer.from(body),zero]);
 assert.ok(crypto.verify('sha256',message,{key:crypto.createPublicKey(device.privateKey),dsaEncoding:'ieee-p1363'},signed.subarray(12)));
 assert.equal(signed.readBigUInt64BE(4),(1700000000n+11644473600n)*10000000n);
});
test('Embedded callback requires exact origin, path, matching state and code',()=>{
 assert.equal(sisu.callback('https://login.live.com/other?code=x&state=abc','abc'),null);
 assert.equal(sisu.callback('https://login.live.com.evil.test/oauth20_desktop.srf?code=x&state=abc','abc'),null);
 assert.throws(()=>sisu.callback(sisu.CALLBACK+'?code=x&state=bad','abc'),/Anmeldeversuch/);
 assert.throws(()=>sisu.callback(sisu.CALLBACK+'?error=access_denied&state=abc','abc'),/abgebrochen/);
 assert.equal(sisu.callback(sisu.CALLBACK+'?code=valid&state=abc','abc'),'valid');
});
function mockProtocol(t){
 const calls=[];let expectedState,challenge;
 t.mock.method(global,'fetch',async(url,options)=>{
  options.signal?.throwIfAborted();const u=new URL(url),form=options.body instanceof URLSearchParams?Object.fromEntries(options.body):null;
  const body=form|| (options.body?JSON.parse(options.body):null);calls.push({url,body});
  const reply=(data,headers={})=>Response.json(data,{headers:{date:new Date().toUTCString(),...headers}});
  if(u.hostname==='device.auth.xboxlive.com'){
   assert.equal(body.Properties.ProofKey.crv,'P-256');assert.ok(options.headers.Signature);return reply({Token:'device'});
  }
  if(u.hostname==='sisu.xboxlive.com'&&u.pathname==='/authenticate'){
   expectedState=body.Query.state;challenge=body.Query.code_challenge;
   return reply({MsaOauthRedirect:'https://login.live.com/oauth20_authorize.srf'},{'x-sessionid':'test-session'});
  }
  if(u.hostname==='login.live.com'){
   assert.equal(form.client_id,sisu.CLIENT_ID);
   if(form.grant_type==='authorization_code')assert.equal(crypto.createHash('sha256').update(form.code_verifier).digest('base64url'),challenge);
   return reply({access_token:'ms-access',refresh_token:'rotated-refresh',expires_in:3600});
  }
  if(u.hostname==='sisu.xboxlive.com')return reply({UserToken:{Token:'user'},TitleToken:{Token:'title'}});
  if(u.hostname==='xsts.auth.xboxlive.com'){
   assert.equal(body.Properties.DeviceToken,'device');assert.equal(body.Properties.TitleToken,'title');
   return reply({Token:'xsts',DisplayClaims:{xui:[{uhs:'hash',xid:'xuid'}]}});
  }
  if(u.pathname==='/launcher/login'){assert.equal(body.xtoken,'XBL3.0 x=hash;xsts');return reply({access_token:'mc-access',expires_in:86400});}
  if(u.pathname==='/minecraft/profile')return reply({id:'profile-id',name:'Player',skins:[]});
  throw new Error('Unexpected request');
 });
 return {calls,state:()=>expectedState};
}
test('SISU login completes Xbox and Minecraft chain and refreshes with its original device',async t=>{
 const mock=mockProtocol(t);let disposed=0;
 const account=await sisu.login((_url,{onNavigate})=>{
  queueMicrotask(()=>onNavigate(sisu.CALLBACK+'?'+new URLSearchParams({state:mock.state(),code:'test-code'})));
  return ()=>disposed++;
 });
 assert.equal(disposed,1);assert.equal(account.name,'Player');assert.equal(account.authFlow,'sisu');assert.equal(account.accessToken,'mc-access');
 assert.ok(account.device.privateJwk.d);const deviceId=account.device.id;
 const refreshed=await auth.refresh({...account,expiresAt:0});assert.equal(refreshed.device.id,deviceId);assert.equal(refreshed.refreshToken,'rotated-refresh');
 assert.ok(mock.calls.some(c=>c.body?.grant_type==='refresh_token'));
 assert.ok(mock.calls.every(c=>!new URL(c.url).hostname.includes('norisk')));
});
test('Closing or aborting a SISU popup cleans up without exchanging a code',async()=>{
 let closed=0;
 await assert.rejects(sisu.show({url:'https://login.live.com',state:'abc'},(_url,{cancel})=>{queueMicrotask(cancel);return()=>closed++;}),{name:'AbortError'});
 assert.equal(closed,1);
 const controller=new AbortController();controller.abort();let opened=false;
 await assert.rejects(sisu.show({url:'https://login.live.com',state:'abc'},()=>{opened=true;},controller.signal),{name:'AbortError'});
 assert.equal(opened,false);
});
test('SISU errors do not leak Microsoft response bodies or tokens',async t=>{
 t.mock.method(global,'fetch',async()=>Response.json({error:'bad',access_token:'secret-token'},{status:401}));
 await assert.rejects(sisu.begin(),e=>e.message.includes('401')&&!e.message.includes('secret-token'));
});
