const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { inside, download, hash } = require('../shared/net.cjs');
const { instanceKey } = require('../data/profiles.cjs');
const { Store } = require('../data/store.cjs');
const { Modrinth, CurseForge, compatible } = require('./providers.cjs');
function filename(name) {
  if (typeof name !== 'string' || name.length > 180 || !/\.(jar|zip)$/i.test(name) || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) throw new Error('Ungültiger Dateiname.');
  return name;
}
function downloadURL(url, source) {
  if (!url) throw new Error('Für diese Datei ist kein direkter Download erlaubt.');
  const parsed = new URL(url);
  const allowed = source === 'modrinth' ? parsed.hostname === 'cdn.modrinth.com' : parsed.hostname.endsWith('.forgecdn.net');
  if (parsed.protocol !== 'https:' || !allowed || parsed.username || parsed.password) throw new Error('Die Download-Adresse gehört nicht zur gewählten Mod-Quelle.');
  return url;
}
async function directoryBytes(dir) {
  let bytes = 0;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return 0; throw e; }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) bytes += await directoryBytes(file);
    else if (entry.isFile()) { try { bytes += (await fs.stat(file)).size; } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  }
  return bytes;
}
class Mods {
  constructor({ root, profiles, getKey, assertIdle, report = () => {}, providers }) { Object.assign(this, { root, profiles, getKey, assertIdle, report, providers }); this.busy = false; }
  profile(id) { const p = this.profiles.data.profiles.find(p => p.id === id); if (!p) throw new Error('Profil nicht gefunden.'); return p; }
  folder(profile) { return inside(path.join(this.root, 'instances'), instanceKey(profile)); }
  provider(source) {
    if (!['modrinth','curseforge'].includes(source)) throw new Error('Unbekannte Mod-Quelle.');
    return this.providers?.[source] || (source === 'modrinth' ? new Modrinth() : new CurseForge(this.getKey()));
  }
  async search({ profileId, source, query = '', offset = 0, type = 'mods' }) {
    const profile = this.profile(profileId);
    if (type === 'mods' && profile.mode === 'vanilla') throw new Error('Vanilla lädt keine Mods. Erstelle dafür ein Fabric- oder Caeser-Profil.');
    if (typeof query !== 'string' || query.length > 120 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error('Ungültige Suche.');
    return this.provider(source).search(profile, query, offset, type);
  }
  async details(id) {
    const profile = this.profile(id), folder = this.folder(profile), store = new Store(folder);
    const modsManifest = await store.read('caeser-mods.json', { mods: [] });
    const rpManifest = await store.read('caeser-resourcepacks.json', { items: [] });
    const shadersManifest = await store.read('caeser-shaderpacks.json', { items: [] });

    const loadItems = async (dirName, extRegex, manifestList, isManagedCheck) => {
      let entries = [];
      try { entries = await fs.readdir(path.join(folder, dirName), { withFileTypes: true }); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const items = [];
      for (const entry of entries) {
        if (!entry.isFile() || !extRegex.test(entry.name)) continue;
        const name = entry.name.replace(/\.disabled$/i, '');
        const record = manifestList.find(m => m.filename === name);
        let size = 0;
        try { size = (await fs.stat(path.join(folder, dirName, entry.name))).size; } catch {}
        const managed = isManagedCheck ? isManagedCheck(name) : false;
        items.push({
          ...record,
          filename: name,
          name: record?.name || name,
          enabled: !entry.name.endsWith('.disabled'),
          size,
          managed
        });
      }
      return items.sort((a, b) => a.name.localeCompare(b.name));
    };

    const mods = await loadItems('mods', /\.jar(\.disabled)?$/i, modsManifest.mods || [], name => {
      return profile.mode === 'caeser' && (name === 'caeserclient-1.0.0.jar' || name === 'fabric-api-0.140.2+1.21.11.jar');
    });
    const resourcepacks = await loadItems('resourcepacks', /\.zip(\.disabled)?$/i, rpManifest.items || rpManifest.resourcepacks || []);
    const shaders = await loadItems('shaderpacks', /\.zip(\.disabled)?$/i, shadersManifest.items || shadersManifest.shaders || []);

    return {
      profile,
      storageBytes: await directoryBytes(folder),
      mods,
      resourcepacks,
      shaders
    };
  }
  async mutate(work) {
    this.assertIdle(); if (this.busy) throw new Error('Ein Mod-Vorgang läuft bereits.'); this.busy = true;
    try { return await work(); } finally { this.busy = false; }
  }
  async install({ profileId, source, projectId, type = 'mods' }) { return this.mutate(async () => {
    const profile = this.profile(profileId);
    if (type === 'mods' && profile.mode === 'vanilla') throw new Error('Mods benötigen ein Fabric- oder Caeser-Profil.');
    if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) throw new Error('Ungültiges Projekt.');
    const provider = this.provider(source), folder = this.folder(profile), store = new Store(folder);

    const subDir = type === 'resourcepacks' ? 'resourcepacks' : type === 'shaders' ? 'shaderpacks' : 'mods';
    const manifestName = type === 'resourcepacks' ? 'caeser-resourcepacks.json' : type === 'shaders' ? 'caeser-shaderpacks.json' : 'caeser-mods.json';
    const manifest = await store.read(manifestName, type === 'mods' ? { mods: [] } : { items: [] });
    const manifestList = type === 'mods' ? (manifest.mods || []) : (manifest.items || manifest[type] || []);

    const planned = new Map();
    const resolve = async (id, pinned) => {
      if (planned.size >= 64) throw new Error('Zu viele Abhängigkeiten.');
      const version = await provider.version(profile, id, pinned, type);
      if (!compatible(version, profile, type)) throw new Error(`Die Datei passt nicht zu Minecraft ${profile.version} / ${profile.mode === 'caeser' ? 'Fabric' : profile.mode}.`);
      if (id && String(version.projectId) !== String(id)) throw new Error('Die Datei gehört zu einem anderen Projekt.');
      const key = String(version.projectId);
      if (type === 'mods' && profile.mode === 'caeser' && ((source === 'modrinth' && key === 'P7dR8mSH') || (source === 'curseforge' && key === '306612'))) {
        if (pinned) throw new Error('Eine Mod verlangt eine feste Fabric-API-Version. Verwende dafür ein eigenes Fabric-Profil.');
        return; // This profile ships a pinned Fabric API; never install a second copy.
      }
      if (planned.has(key)) { if (planned.get(key).version.id !== version.id && pinned) throw new Error('Widersprüchliche Abhängigkeiten.'); return; }
      const existing = manifestList.find(m => m.source === source && m.projectId === key);
      if (existing) {
        if (pinned && existing.versionId !== version.id) throw new Error('Eine benötigte Version steht im Konflikt mit der installierten Version.');
        try { await fs.access(inside(path.join(folder, subDir), filename(existing.filename))); }
        catch { throw new Error(`Aktiviere den Eintrag „${existing.name}“ oder entferne seinen alten Eintrag.`); }
        return;
      }
      if (!version.file?.hash || !['sha1','sha512'].includes(version.file.algorithm) || !new RegExp(`^[a-f0-9]{${version.file.algorithm === 'sha1' ? 40 : 128}}$`, 'i').test(version.file.hash)) throw new Error('Die Quelle liefert keine gültige Datei-Prüfsumme.');
      filename(version.file.name); downloadURL(version.file.url, source);
      const project = await provider.project(key);
      planned.set(key, { version, project });
      for (const dependency of (version.dependencies || [])) {
        if (!dependency.projectId && !dependency.versionId) throw new Error('Eine benötigte externe Abhängigkeit kann nicht automatisch installiert werden.');
        await resolve(dependency.projectId, dependency.versionId);
      }
    };
    await resolve(projectId);
    if (!planned.size) return this.details(profileId);
    const targetDir = path.join(folder, subDir), stage = inside(folder, `.caeser-stage-${randomUUID()}`);
    await fs.mkdir(targetDir, { recursive: true }); await fs.mkdir(stage, { recursive: true });
    const published = [], additions = [], names = new Set();
    try {
      for (const { version, project } of planned.values()) {
        const name = filename(version.file.name);
        if (names.has(name.toLowerCase())) throw new Error('Zwei Dateien haben denselben Namen.'); names.add(name.toLowerCase());
        const target = inside(targetDir, name);
        for (const candidate of [target, target + '.disabled']) {
          try { await fs.access(candidate); throw new Error(`Die Datei ${name} ist bereits vorhanden. Bitte zuerst im Profil prüfen.`); } catch(e) { if (e.code !== 'ENOENT') throw e; }
        }
        this.report({ profileId, name: project.title, stage: 'download' });
        await download(version.file.url, inside(stage, name), version.file.hash, version.file.algorithm);
        additions.push({ source, projectId: String(version.projectId), versionId: version.id, name: project.title, iconUrl: project.iconUrl,
          filename: name, version: version.label, gameVersion: profile.version, loader: type === 'mods' ? (profile.mode === 'caeser' ? 'fabric' : profile.mode) : undefined, hash: version.file.hash, algorithm: version.file.algorithm,
          dependencies: (version.dependencies || []).map(d => d.projectId).filter(Boolean).map(String), installedAt: Date.now() });
      }
      for (const item of additions) { const target = inside(targetDir, item.filename); await fs.copyFile(inside(stage, item.filename), target, require('node:fs').constants.COPYFILE_EXCL); published.push(target); }
      if (type === 'mods') {
        await store.write('caeser-mods.json', { mods: [...(manifest.mods || []), ...additions] });
      } else {
        await store.write(manifestName, { items: [...manifestList, ...additions] });
      }
    } catch(error) { for (const file of published) await fs.rm(file, { force: true }); throw error; }
    finally { await fs.rm(stage, { recursive: true, force: true }); }
    this.report({ profileId, stage: 'done', count: additions.length });
    return this.details(profileId);
  }); }
  async toggle({ profileId, name, enabled, type }) { return this.mutate(async () => {
    const details = await this.details(profileId);
    let resolvedType = type;
    if (!resolvedType) {
      if (details.resourcepacks.some(m => m.filename === name)) resolvedType = 'resourcepacks';
      else if (details.shaders.some(m => m.filename === name)) resolvedType = 'shaders';
      else resolvedType = 'mods';
    }
    const list = resolvedType === 'resourcepacks' ? details.resourcepacks : resolvedType === 'shaders' ? details.shaders : details.mods;
    const item = list.find(m => m.filename === name);
    if (!item) throw new Error('Eintrag nicht gefunden.');
    if (item.managed) throw new Error('Diese Datei gehört zum Caeser-Profil.');
    if (typeof enabled !== 'boolean') throw new Error('Ungültiger Status.');
    if (enabled === item.enabled) return details;
    const subDir = resolvedType === 'resourcepacks' ? 'resourcepacks' : resolvedType === 'shaders' ? 'shaderpacks' : 'mods';
    const dir = path.join(this.folder(details.profile), subDir), base = inside(dir, filename(name));
    const source = item.enabled ? base : base + '.disabled', target = enabled ? base : base + '.disabled';
    try { await fs.access(target); throw new Error('Die Zieldatei existiert bereits.'); } catch(e) { if (e.code !== 'ENOENT') throw e; }
    await fs.rename(source, target);
    return this.details(profileId);
  }); }
  async installCaeserClientMod(profileId, resourcesPath) { return this.mutate(async () => {
    const profile = this.profile(profileId);
    if (profile.version !== '1.21.11') throw new Error('Die Caeser-Mod ist nur für Minecraft 1.21.11 verfügbar.');
    if (profile.mode === 'vanilla') throw new Error('Mods benötigen ein Fabric-Profil.');
    const folder = this.folder(profile), store = new Store(folder);
    const manifest = await store.read('caeser-mods.json', { mods: [] });
    const modsDir = path.join(folder, 'mods');
    await fs.mkdir(modsDir, { recursive: true });
    const modFile = 'caeserclient-1.0.0.jar';
    const candidatePaths = [
      path.join(resourcesPath, modFile),
      path.resolve(__dirname, '../../resources', modFile),
      path.join(process.cwd(), 'resources', modFile),
      'C:\\Users\\thorb\\Documents\\ChatGPT\\Caeser Client\\resources\\caeserclient-1.0.0.jar',
      'C:\\Users\\thorb\\.gemini\\antigravity\\scratch\\BameClient\\build\\libs\\caeserclient-1.0.0.jar'
    ];
    let newestSource = candidatePaths[0];
    let newestMtime = 0;
    for (const p of candidatePaths) {
      try {
        const st = await fs.stat(p);
        if (st.mtimeMs > newestMtime) {
          newestMtime = st.mtimeMs;
          newestSource = p;
        }
      } catch {}
    }
    const targetJar = path.join(modsDir, modFile);
    let targetMtime = 0;
    try { targetMtime = (await fs.stat(targetJar)).mtimeMs; } catch {}
    if (!targetMtime || newestMtime > targetMtime) {
      await fs.copyFile(newestSource, targetJar);
    }
    let fabricAddition = null;
    try {
      const files = await fs.readdir(modsDir);
      if (!files.some(f => f.toLowerCase().includes('fabric-api'))) {
        const apiVersion = '0.140.2+1.21.11';
        const name = `fabric-api-${apiVersion}.jar`;
        const url = `https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/${apiVersion}/${name}`;
        const checksumResponse = await fetch(url + '.sha1', { signal: AbortSignal.timeout(15000) });
        if (checksumResponse.ok) {
          const checksum = (await checksumResponse.text()).trim().split(/\s/)[0];
          if (/^[a-f\d]{40}$/i.test(checksum)) {
            await download(url, path.join(modsDir, name), checksum);
            fabricAddition = { source: 'fabricmc', projectId: 'fabric-api', versionId: apiVersion, name: 'Fabric API', filename: name, version: apiVersion, gameVersion: profile.version, loader: 'fabric', installedAt: Date.now() };
          }
        }
      }
    } catch {}
    const caeserAddition = { source: 'local', projectId: 'caeserclient', versionId: '1.0.0', name: 'Caeser Client', filename: modFile, version: '1.0.0', gameVersion: profile.version, loader: 'fabric', installedAt: Date.now() };
    const nextMods = manifest.mods.filter(m => m.filename !== modFile);
    nextMods.push(caeserAddition);
    if (fabricAddition && !nextMods.some(m => m.filename === fabricAddition.filename)) nextMods.push(fabricAddition);
    await store.write('caeser-mods.json', { mods: nextMods });
    this.report({ profileId, stage: 'done', count: 1 });
    return this.details(profileId);
  }); }
  async remove({ profileId, name, type }) { return this.mutate(async () => {
    const details = await this.details(profileId);
    let resolvedType = type;
    if (!resolvedType) {
      if (details.resourcepacks.some(m => m.filename === name)) resolvedType = 'resourcepacks';
      else if (details.shaders.some(m => m.filename === name)) resolvedType = 'shaders';
      else resolvedType = 'mods';
    }
    const list = resolvedType === 'resourcepacks' ? details.resourcepacks : resolvedType === 'shaders' ? details.shaders : details.mods;
    const item = list.find(m => m.filename === name);
    if (!item) throw new Error('Eintrag nicht gefunden.');
    if (item.managed) throw new Error('Diese Datei gehört zum Caeser-Profil und kann nicht gelöscht werden.');
    const subDir = resolvedType === 'resourcepacks' ? 'resourcepacks' : resolvedType === 'shaders' ? 'shaderpacks' : 'mods';
    const folder = this.folder(details.profile), dir = path.join(folder, subDir);
    const target = inside(dir, filename(name));
    await fs.rm(target, { force: true });
    await fs.rm(target + '.disabled', { force: true });
    const store = new Store(folder);
    const manifestName = resolvedType === 'resourcepacks' ? 'caeser-resourcepacks.json' : resolvedType === 'shaders' ? 'caeser-shaderpacks.json' : 'caeser-mods.json';
    if (resolvedType === 'mods') {
      const manifest = await store.read(manifestName, { mods: [] });
      await store.write(manifestName, { mods: (manifest.mods || []).filter(m => m.filename !== name) });
    } else {
      const manifest = await store.read(manifestName, { items: [] });
      const items = manifest.items || manifest[resolvedType] || [];
      await store.write(manifestName, { items: items.filter(m => m.filename !== name) });
    }
    this.report({ profileId, stage: 'done', count: 1 });
    return this.details(profileId);
  }); }
  async checkUpdates(profileId) {
    const profile = this.profile(profileId);
    const details = await this.details(profileId);
    const candidates = details.mods.filter(m => !m.managed && m.source && m.projectId);
    if (!candidates.length) return [];
    const checks = await Promise.allSettled(candidates.map(async m => {
      const provider = this.provider(m.source);
      const latest = await provider.version(profile, m.projectId);
      if (latest && compatible(latest, profile)) {
        const isDiff = (m.versionId && String(m.versionId) !== String(latest.id)) ||
                       (m.version && m.version !== latest.label);
        if (isDiff) {
          return {
            filename: m.filename,
            currentVersion: m.version,
            latestVersion: latest.label,
            latestVersionId: latest.id
          };
        }
      }
      return null;
    }));
    return checks.filter(c => c.status === 'fulfilled' && c.value).map(c => c.value);
  }
  async update({ profileId, name }) { return this.mutate(async () => {
    const profile = this.profile(profileId);
    const folder = this.folder(profile), store = new Store(folder);
    const manifest = await store.read('caeser-mods.json', { mods: [] });
    const existing = manifest.mods.find(m => m.filename === name);
    if (!existing) throw new Error('Mod-Eintrag nicht gefunden.');
    if (!existing.source || !existing.projectId) throw new Error('Diese Mod kann nicht automatisch aktualisiert werden.');
    const provider = this.provider(existing.source);
    const version = await provider.version(profile, existing.projectId);
    if (!compatible(version, profile)) throw new Error(`Keine passende Aktualisierung für Minecraft ${profile.version} verfügbar.`);
    if (String(version.id) === String(existing.versionId)) throw new Error('Die Mod ist bereits auf dem neuesten Stand.');

    filename(version.file.name); downloadURL(version.file.url, existing.source);
    const modsDir = path.join(folder, 'mods'), stage = inside(folder, `.caeser-stage-${randomUUID()}`);
    await fs.mkdir(modsDir, { recursive: true }); await fs.mkdir(stage, { recursive: true });
    const newFilename = filename(version.file.name);
    try {
      this.report({ profileId, name: existing.name, stage: 'download' });
      await download(version.file.url, inside(stage, newFilename), version.file.hash, version.file.algorithm);
      const oldTarget = inside(modsDir, filename(name));
      await fs.rm(oldTarget, { force: true });
      await fs.rm(oldTarget + '.disabled', { force: true });
      await fs.copyFile(inside(stage, newFilename), inside(modsDir, newFilename));
      let project = { title: existing.name, iconUrl: existing.iconUrl };
      try { project = await provider.project(existing.projectId); } catch {}
      const updatedRecord = {
        source: existing.source, projectId: String(version.projectId), versionId: version.id,
        name: project.title || existing.name, iconUrl: project.iconUrl || existing.iconUrl,
        filename: newFilename, version: version.label, gameVersion: profile.version,
        loader: profile.mode === 'caeser' ? 'fabric' : profile.mode, hash: version.file.hash, algorithm: version.file.algorithm,
        dependencies: (version.dependencies || []).map(d => d.projectId).filter(Boolean).map(String),
        installedAt: Date.now()
      };
      const nextMods = manifest.mods.filter(m => m.filename !== name);
      nextMods.push(updatedRecord);
      await store.write('caeser-mods.json', { mods: nextMods });
    } finally {
      await fs.rm(stage, { recursive: true, force: true });
    }
    this.report({ profileId, stage: 'done', count: 1 });
    return this.details(profileId);
  }); }
}
module.exports = { Mods, filename, downloadURL, directoryBytes };
