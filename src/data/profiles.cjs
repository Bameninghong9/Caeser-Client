const { randomUUID } = require('node:crypto');
const ID = /^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i;
function validateProfile(input, maxMemoryMb) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 40) throw new Error('Gib deinem Profil einen Namen mit 1 bis 40 Zeichen.');
  if (/[\x00-\x1f]/.test(input.name)) throw new Error('Der Profilname enthält ungültige Zeichen.');
  if (typeof input.version !== 'string' || !/^[a-zA-Z0-9_.+ -]{1,100}$/.test(input.version)) throw new Error('Wähle eine gültige Minecraft-Version.');
  if (!['vanilla', 'fabric', 'caeser'].includes(input.mode)) throw new Error('Wähle Vanilla, Fabric oder Caeser.');
  if (input.mode === 'caeser' && input.version !== '1.21.11') throw new Error('Die Caeser-Mod benötigt Minecraft 1.21.11.');
  if (!Number.isInteger(input.memoryMb) || input.memoryMb < 1024 || input.memoryMb > maxMemoryMb || input.memoryMb % 256 !== 0) throw new Error(`Wähle zwischen 1024 und ${maxMemoryMb} MB RAM (256-MB-Schritte).`);
  return { name: input.name.trim(), version: input.version, mode: input.mode, memoryMb: input.memoryMb };
}
function instanceKey(profile) {
  if (!ID.test(profile.id)) throw new Error('Ungültige Profil-ID.');
  const versionMode = `${profile.version}-${profile.mode}`;
  return profile.legacyKey === versionMode ? versionMode : `profiles/${profile.id}/${versionMode}`;
}
class Profiles {
  constructor(store, maxMemoryMb) { this.store = store; this.maxMemoryMb = maxMemoryMb; this.data = { profiles: [], activeId: '' }; this.queue = Promise.resolve(); }
  async load(settings) {
    const saved = await this.store.read('profiles.json', null);
    if (saved) { this.data = saved; return; }
    const profile = { id: randomUUID(), name: !settings.mode || settings.mode === 'caeser' ? 'Caeser' : 'Mein Minecraft',
      version: settings.version || '1.21.11', mode: settings.mode || 'caeser',
      memoryMb: Math.max(1024, Math.min(this.maxMemoryMb, (settings.memory || 4) * 1024)), createdAt: Date.now() };
    profile.legacyKey = `${profile.version}-${profile.mode}`;
    this.data = { profiles: [profile], activeId: profile.id }; await this.persist();
  }
  persist() { return this.store.write('profiles.json', this.data); }
  recordSession(id, startedAt, elapsedMs) { return this.transact(async () => {
    const next = { ...this.data, profiles: this.data.profiles.map(p=>p.id === id ? { ...p, lastPlayedAt: startedAt, playtimeMs: (p.playtimeMs || 0) + elapsedMs } : p) };
    await this.store.write('profiles.json',next); this.data=next;
  }); }
  selected() { return this.data.profiles.find(profile => profile.id === this.data.activeId); }
  transact(fn) { const task = this.queue.catch(() => {}).then(fn); this.queue = task; return task; }
  save(input) { return this.transact(async () => {
    const fields = validateProfile(input, this.maxMemoryMb);
    const existing = input.id && this.data.profiles.find(profile => profile.id === input.id);
    if (input.id && !existing) throw new Error('Profil nicht gefunden.');
    if (existing && (existing.version !== fields.version || existing.mode !== fields.mode)) throw new Error('Version und Spielart eines bestehenden Profils bleiben fest. Erstelle dafür ein neues Profil.');
    if (!existing && this.data.profiles.length >= 100) throw new Error('Maximal 100 Profile möglich.');
    const profile = { ...(existing || { id: randomUUID(), createdAt: Date.now() }), ...fields };
    const next = { profiles: existing ? this.data.profiles.map(p => p.id === profile.id ? profile : p) : [...this.data.profiles, profile], activeId: profile.id };
    await this.store.write('profiles.json', next); this.data = next; return profile;
  }); }
  select(id) { return this.transact(async () => {
    if (!this.data.profiles.some(p => p.id === id)) throw new Error('Profil nicht gefunden.');
    const next = { ...this.data, activeId: id }; await this.store.write('profiles.json', next); this.data = next;
  }); }
  remove(id) { return this.transact(async () => {
    const next = { profiles: this.data.profiles.filter(p => p.id !== id), activeId: this.data.activeId };
    if (next.activeId === id) next.activeId = next.profiles[0]?.id || '';
    await this.store.write('profiles.json', next); this.data = next;
  }); }
}
module.exports = { Profiles, validateProfile, instanceKey };
