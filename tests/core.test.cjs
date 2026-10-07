const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { allowed, argumentsFor, mavenPath, launchArguments } = require('../src/game/launcher.cjs');
const { inside } = require('../src/shared/net.cjs');
const auth = require('../src/auth/microsoft.cjs');
test('Windows rules honor order, features and architecture', () => {
  assert.equal(allowed(), true);
  assert.equal(allowed([{ action:'allow', os:{name:'osx'} }]), false);
  assert.equal(allowed([{ action:'allow' }, { action:'disallow', os:{name:'windows'} }]), false);
  assert.equal(allowed([{ action:'allow', os:{name:'windows',arch:'x86_64'} }]), true);
  assert.equal(allowed([{ action:'allow', features:{is_demo_user:true} }]), false);
  assert.equal(allowed([{ action:'allow', features:{is_demo_user:true} }], {is_demo_user:true}), true);
});
test('Arguments preserve paths with spaces and omit unsupported feature arguments', () => {
  assert.deepEqual(argumentsFor(['-cp','${classpath}',{rules:[{action:'allow',features:{is_demo_user:true}}],value:['--demo']}], {classpath:'C:\\My Game\\client.jar'}), ['-cp','C:\\My Game\\client.jar']);
  assert.throws(() => argumentsFor(['${unknown}'], {}), /Nicht unterstütztes/);
});
test('Download paths cannot escape storage', () => {
  const root = path.resolve('test-root');
  assert.throws(() => inside(root,'../escape'));
  assert.throws(() => inside(root,root));
  assert.equal(inside(root,'libraries/a.jar'),path.join(root,'libraries/a.jar'));
});
test('Maven coordinates support classifiers and extensions', () => {
  assert.equal(mavenPath('org.lwjgl:lwjgl:3.3.3:natives-windows'), 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar');
  assert.equal(mavenPath('a.b:c:1@zip'),'a/b/c/1/c-1.zip');
});
test('Modern and legacy launch commands use authenticated profiles', () => {
  const base = { metadata:{id:'1.21.11',type:'release',assetIndex:{id:'27'},arguments:{jvm:['-cp','${classpath}'],game:['--username','${auth_player_name}','--accessToken','${auth_access_token}','--userType','${user_type}']}},
    natives:'natives',instance:'C:\\Game Folder',classpath:['a.jar','b.jar'],assetRoot:'assets',virtualRoot:'virtual',libraryRoot:'libraries',extraArguments:{jvm:[],game:[]},mainClass:'net.minecraft.client.main.Main'};
  const account = { name:'TestPlayer', id:'123',accessToken:'secret-token',clientId:'app'};
  const modern = launchArguments(base,account,4096);
  assert.ok(modern.includes('-Xmx4096M')); assert.ok(modern.includes('secret-token')); assert.ok(modern.includes('msa'));
  const legacy = {...base,metadata:{...base.metadata,arguments:undefined,minecraftArguments:'${auth_player_name} ${auth_session}'}};
  const args = launchArguments(legacy,account,2048);
  assert.ok(args.includes('token:secret-token:123')); assert.ok(args.includes('-Djava.library.path=natives'));
});
test('Microsoft to Minecraft chain handles profile ownership and tokens', async t => {
  const replies = [{Token:'xbox'}, {Token:'xsts',DisplayClaims:{xui:[{uhs:'hash',xid:'xuid'}]}}, {access_token:'minecraft',expires_in:3600}, {id:'uuid',name:'Player'}];
  const requests = [];
  t.mock.method(global,'fetch', async (url, options) => { requests.push({url,options}); return {ok:true,json:async()=>replies.shift()}; });
  const account = await auth.minecraft({access_token:'microsoft',refresh_token:'refresh'},'client-id');
  assert.equal(account.name,'Player'); assert.equal(account.refreshToken,'refresh');
  assert.equal(JSON.parse(requests[0].options.body).Properties.RpsTicket,'d=microsoft');
  assert.equal(JSON.parse(requests[2].options.body).identityToken,'XBL3.0 x=hash;xsts');
  assert.equal(requests[3].options.headers.Authorization,'Bearer minecraft');
});
test('No Java profile yields a useful error instead of an offline account', async t => {
  const replies = [{Token:'xbox'}, {Token:'xsts',DisplayClaims:{xui:[{uhs:'hash'}]}}, {access_token:'minecraft',expires_in:3600}];
  t.mock.method(global,'fetch', async () => replies.length ? {ok:true,json:async()=>replies.shift()} : {ok:false,status:404,json:async()=>({})});
  await assert.rejects(auth.minecraft({access_token:'a'},'b'),/kein Minecraft-Java-Profil/);
});
test('Expired sessions renew; valid sessions do not make network requests', async t => {
  t.mock.method(global,'fetch', () => { throw new Error('Must not fetch'); });
  const account = {expiresAt:Date.now()+3600000};
  assert.equal(await auth.refresh(account),account);
});

