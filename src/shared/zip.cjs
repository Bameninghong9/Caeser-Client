const yauzl = require('yauzl');
const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { inside } = require('./net.cjs');

// Windows runtime/native archives only need regular files. Reject links entirely.
module.exports = async function extract(file, { dir }) {
  await fs.mkdir(dir, { recursive: true });
  const zip = await new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true }, (error, value) => error ? reject(error) : resolve(value)));
  return new Promise((resolve, reject) => {
    const fail = error => { zip.close(); reject(error); };
    zip.on('error', fail); zip.on('end', resolve);
    zip.on('entry', entry => {
      (async () => {
        const type = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (type && ![0x8000, 0x4000].includes(type)) throw new Error('Archiv enthält eine unzulässige Verknüpfung.');
        if (entry.fileName.includes(':') || entry.fileName.includes('\\')) throw new Error('Ungültiger Archivpfad.');
        const target = inside(dir, entry.fileName);
        // Reject pre-existing symlinks, including junctions, anywhere below the extraction root.
        const parts = path.relative(dir, target).split(path.sep);
        let current = path.resolve(dir);
        for (const part of parts) {
          current = path.join(current, part);
          try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Verknüpfung im Entpackverzeichnis.'); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (entry.fileName.endsWith('/')) await fs.mkdir(target, { recursive: true });
        else {
          await fs.mkdir(path.dirname(target), { recursive: true });
          const stream = await new Promise((res, rej) => zip.openReadStream(entry, (error, value) => error ? rej(error) : res(value)));
          await pipeline(stream, createWriteStream(target));
        }
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
};
