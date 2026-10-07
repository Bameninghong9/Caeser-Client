const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { crc32 } = require('node:zlib');
const extract = require('../src/shared/zip.cjs');
const { download } = require('../src/shared/net.cjs');
function zipEntry(name, text, mode = 0x81a4) {
  const filename = Buffer.from(name), data = Buffer.from(text), checksum = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt32LE(checksum,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(filename.length,26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x314,4); central.writeUInt16LE(20,6); central.writeUInt32LE(checksum,16); central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24); central.writeUInt16LE(filename.length,28); central.writeUInt32LE((mode << 16) >>> 0,38);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10); end.writeUInt32LE(central.length+filename.length,12); end.writeUInt32LE(local.length+filename.length+data.length,16);
  return Buffer.concat([local,filename,data,central,filename,end]);
}
test('Archive extraction writes regular files and rejects links and traversal', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'caeser-zip-test-'));
  try {
    const file = path.join(root,'test.zip'), destination = path.join(root,'out');
    await fs.writeFile(file,zipEntry('bin/file.txt','hello'));
    await extract(file,{dir:destination});
    assert.equal(await fs.readFile(path.join(destination,'bin/file.txt'),'utf8'),'hello');
    await fs.writeFile(file,zipEntry('link','../escape',0xa1ff));
    await assert.rejects(extract(file,{dir:destination}),/Verknüpfung/);
    await fs.writeFile(file,zipEntry('../escape.txt','bad'));
    await assert.rejects(extract(file,{dir:destination}));
    await assert.rejects(fs.access(path.join(root,'escape.txt')));
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
test('Incorrect checksums never publish a downloaded file', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'caeser-download-test-'));
  try {
    t.mock.method(global,'fetch',async()=>new Response('incorrect payload'));
    await assert.rejects(download('https://example.com/file',path.join(root,'file.jar'),'0'.repeat(40)),/Prüfsumme/);
    assert.deepEqual(await fs.readdir(root),[]);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

