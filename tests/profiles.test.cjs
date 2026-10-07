const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Store } = require('../src/data/store.cjs');
const { Profiles, validateProfile, instanceKey } = require('../src/data/profiles.cjs');
test('Profiles migrate once, isolate instances, persist edits and active selection across restarts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'caeser-profiles-'));
  try {
    const store = new Store(dir); const first = new Profiles(store, 16384);
    await first.load({version:'1.21.11',mode:'caeser',memory:4});
    assert.equal(instanceKey(first.selected()), '1.21.11-caeser');
    const a = await first.save({name:'Survival',version:'1.21.11',mode:'vanilla',memoryMb:3072});
    const b = await first.save({name:'Survival 2',version:'1.21.11',mode:'vanilla',memoryMb:4096});
    assert.notEqual(instanceKey(a),instanceKey(b));
    await first.save({...a,name:'Meine Welt',memoryMb:5120});
    const restarted = new Profiles(new Store(dir),16384); await restarted.load({version:'wrong'});
    assert.equal(restarted.data.profiles.length,3); assert.equal(restarted.selected().name,'Meine Welt');
    assert.equal(restarted.selected().memoryMb,5120);
    await assert.rejects(restarted.save({...a,version:'1.20.1'}),/bleiben fest/);
    await restarted.remove(a.id); assert.notEqual(restarted.selected().id,a.id);
    for (const p of [...restarted.data.profiles]) await restarted.remove(p.id);
    const empty = new Profiles(new Store(dir),16384); await empty.load({});
    assert.equal(empty.data.profiles.length,0);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('Invalid profile input is rejected', () => {
  const base = {name:'A',version:'1.21.11',mode:'vanilla',memoryMb:4096};
  assert.throws(()=>validateProfile({...base,name:'  '},16384));
  assert.throws(()=>validateProfile({...base,version:'../outside'},16384));
  assert.throws(()=>validateProfile({...base,mode:'forge'},16384));
  assert.throws(()=>validateProfile({...base,memoryMb:999999},16384));
  assert.throws(()=>validateProfile({...base,memoryMb:1200},16384));
  assert.throws(()=>validateProfile({...base,mode:'caeser',version:'1.20.1'},16384));
  assert.throws(()=>instanceKey({...base,id:'../escape'}));
});
test('Encrypted account store never writes plaintext and survives restart', async () => {
  const crypto = require('node:crypto'); const key = crypto.randomBytes(32);
  const encryption = { isEncryptionAvailable:()=>true,
    encryptString:value=>{const iv=crypto.randomBytes(16);const c=crypto.createCipheriv('aes-256-cbc',key,iv);return Buffer.concat([iv,c.update(value),c.final()]);},
    decryptString:value=>{const d=crypto.createDecipheriv('aes-256-cbc',key,value.subarray(0,16));return Buffer.concat([d.update(value.subarray(16)),d.final()]).toString();} };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'caeser-store-'));
  try {
    const data = [{name:'Test',refreshToken:'test-sensitive-token'}];
    await new Store(dir,encryption).write('accounts.bin',data,true);
    assert.equal((await fs.readFile(path.join(dir,'accounts.bin'))).includes(Buffer.from('test-sensitive-token')),false);
    assert.deepEqual(await new Store(dir,encryption).read('accounts.bin',[],true),data);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
