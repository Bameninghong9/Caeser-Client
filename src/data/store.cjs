const fs = require('node:fs/promises');
const path = require('node:path');
class Store {
  constructor(directory, encryption) { this.directory = directory; this.encryption = encryption; this.queue = Promise.resolve(); }
  async read(name, fallback, encrypted = false) {
    try {
      const value = await fs.readFile(path.join(this.directory, name));
      return JSON.parse(encrypted ? this.encryption.decryptString(value) : value.toString('utf8'));
    } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
  }
  write(name, value, encrypted = false) {
    let data = JSON.stringify(value, null, 2);
    if (encrypted) {
      if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows-Kontoverschlüsselung nicht verfügbar.');
      data = this.encryption.encryptString(data);
    }
    const file = path.join(this.directory, name);
    const operation = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      await fs.writeFile(file + '.tmp', data); await fs.rename(file + '.tmp', file);
    });
    this.queue = operation; return operation;
  }
  delete(name) {
    const file = path.join(this.directory, name);
    const operation = this.queue.catch(() => {}).then(async () => {
      try { await fs.unlink(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    });
    this.queue = operation; return operation;
  }
}
module.exports = { Store };
