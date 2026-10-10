const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createWriteStream, createReadStream } = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(45000) });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(`Dienst antwortet mit HTTP ${response.status}${body.error ? ` (${typeof body.error === 'string' ? body.error : 'API-Fehler'})` : ''}.`);
    error.code = body.error;
    error.xerr = body.XErr;
    error.status = response.status;
    throw error;
  }
  return body;
}
async function hash(file, algorithm = 'sha1') {
  const digest = crypto.createHash(algorithm);
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function download(url, file, checksum, algorithm = 'sha1') {
  if (!url.startsWith('https://')) throw new Error('Unsichere Download-Adresse verworfen.');
  try {
    const st = await fs.stat(file);
    if (st.size > 0) {
      if (!checksum) return;
      if (await hash(file, algorithm) === checksum.toLowerCase()) return;
    }
  } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.part`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw new Error(`Download fehlgeschlagen (HTTP ${response.status}).`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    if (checksum && await hash(temporary, algorithm) !== checksum.toLowerCase()) throw new Error('Die Prüfsumme des Downloads stimmt nicht. Bitte erneut versuchen.');
    try {
      await fs.rename(temporary, file);
    } catch (renameErr) {
      const existing = await fs.stat(file).catch(() => null);
      if (!existing || existing.size === 0) throw renameErr;
    }
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
function inside(root, relative) {
  const result = path.resolve(root, relative);
  if (!result.startsWith(path.resolve(root) + path.sep)) throw new Error('Ungültiger Dateipfad.');
  return result;
}
async function pool(items, work, count = 8) {
  let cursor = 0;
  const results = await Promise.allSettled(Array.from({ length: Math.min(count, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; await work(items[index], index); }
  }));
  const failure = results.find(r => r.status === 'rejected');
  if (failure) throw failure.reason;
}
module.exports = { json, hash, download, inside, pool };
