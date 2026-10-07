const { json } = require('../shared/net.cjs');
const USER_AGENT = 'CaeserClient/0.3.0 (Minecraft desktop launcher)';
const loaderFor = profile => profile.mode === 'caeser' ? 'fabric' : profile.mode;
function compatible(version, profile, type = 'mods') {
  if (type === 'resourcepacks' || type === 'resourcepack') return !version.gameVersions?.length || version.gameVersions.includes(profile.version);
  if (type === 'shaders' || type === 'shader') return true;
  return version.gameVersions.includes(profile.version) && version.loaders.includes(loaderFor(profile));
}
function modrinthVersion(v) {
  const file = v.files.find(f => f.primary) || v.files[0];
  return { id: v.id, projectId: v.project_id, label: v.version_number, published: v.date_published,
    gameVersions: v.game_versions, loaders: v.loaders, file: file && { name: file.filename, url: file.url, hash: file.hashes.sha512 || file.hashes.sha1, algorithm: file.hashes.sha512 ? 'sha512' : 'sha1' },
    dependencies: v.dependencies.filter(d => d.dependency_type === 'required').map(d => ({ projectId: d.project_id, versionId: d.version_id })) };
}
class Modrinth {
  request(route) { return json(`https://api.modrinth.com/v2${route}`, { headers: { 'User-Agent': USER_AGENT } }); }
  async search(profile, query, offset = 0, type = 'mods') {
    let facets;
    if (type === 'resourcepacks' || type === 'resourcepack') facets = [['project_type:resourcepack'], [`versions:${profile.version}`]];
    else if (type === 'shaders' || type === 'shader') facets = [['project_type:shader']];
    else facets = [['project_type:mod'], [`versions:${profile.version}`], [`categories:${loaderFor(profile)}`], ['client_side!=unsupported']];
    const data = await this.request(`/search?${new URLSearchParams({ query, facets: JSON.stringify(facets), limit: '20', offset: String(offset), index: query ? 'relevance' : 'downloads' })}`);
    return { total: data.total_hits, hits: data.hits.map(p => ({ id: p.project_id, title: p.title, description: p.description, author: p.author, iconUrl: p.icon_url, downloads: p.downloads })) };
  }
  async project(id) { const p = await this.request(`/project/${encodeURIComponent(id)}`); return { id: p.id, title: p.title, iconUrl: p.icon_url }; }
  async version(profile, projectId, versionId, type = 'mods') {
    if (versionId) return modrinthVersion(await this.request(`/version/${encodeURIComponent(versionId)}`));
    let params;
    if (type === 'resourcepacks' || type === 'resourcepack') params = { game_versions: JSON.stringify([profile.version]) };
    else if (type === 'shaders' || type === 'shader') params = {};
    else params = { game_versions: JSON.stringify([profile.version]), loaders: JSON.stringify([loaderFor(profile)]) };
    const versions = await this.request(`/project/${encodeURIComponent(projectId)}/version?${new URLSearchParams(params)}`);
    const selected = versions.map(modrinthVersion).filter(v => compatible(v, profile, type)).sort((a,b) => Date.parse(b.published) - Date.parse(a.published))[0];
    if (!selected) throw new Error(`Keine passende Datei für Minecraft ${profile.version} verfügbar.`);
    return selected;
  }
}
function curseVersion(v) {
  const hash = v.hashes?.find(h => h.algo === 1);
  return { id: String(v.id), projectId: String(v.modId), label: v.displayName, published: v.fileDate,
    gameVersions: v.gameVersions || [], loaders: (v.gameVersions || []).map(s => s.toLowerCase()),
    file: { name: v.fileName, url: v.downloadUrl, hash: hash?.value, algorithm: 'sha1' },
    dependencies: (v.dependencies || []).filter(d => d.relationType === 3).map(d => ({ projectId: String(d.modId) })) };
}
const DEFAULT_CURSEFORGE_KEY = '$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm';
class CurseForge {
  constructor(key = DEFAULT_CURSEFORGE_KEY) { this.key = key; }
  async request(route) {
    if (!this.key) throw new Error('CurseForge benötigt einen API-Schlüssel. Hinterlege ihn unter Einstellungen → Mod-Quellen.');
    try { return await json(`https://api.curseforge.com/v1${route}`, { headers: { 'x-api-key': this.key, Accept: 'application/json', 'User-Agent': USER_AGENT } }); }
    catch (error) { if ([401,403].includes(error.status)) throw new Error('CurseForge hat den API-Schlüssel abgelehnt. Bitte unter Einstellungen prüfen.'); throw error; }
  }
  async search(profile, query, offset = 0, type = 'mods') {
    let params;
    if (type === 'resourcepacks' || type === 'resourcepack') params = { gameId: '432', classId: '12', gameVersion: profile.version, searchFilter: query, index: String(offset), pageSize: '20', sortField: '6', sortOrder: 'desc' };
    else if (type === 'shaders' || type === 'shader') params = { gameId: '432', classId: '6552', searchFilter: query, index: String(offset), pageSize: '20', sortField: '6', sortOrder: 'desc' };
    else params = { gameId: '432', classId: '6', gameVersion: profile.version, modLoaderType: '4', searchFilter: query, index: String(offset), pageSize: '20', sortField: '6', sortOrder: 'desc' };
    const data = await this.request(`/mods/search?${new URLSearchParams(params)}`);
    return { total: data.pagination?.totalCount || 0, hits: data.data.map(p => ({ id: String(p.id), title: p.name, description: p.summary, author: p.authors?.map(a=>a.name).join(', ') || '', iconUrl: p.logo?.thumbnailUrl, downloads: p.downloadCount })) };
  }
  async project(id) { const { data:p } = await this.request(`/mods/${Number(id)}`); return { id: String(p.id), title: p.name, iconUrl: p.logo?.thumbnailUrl }; }
  async version(profile, projectId, versionId, type = 'mods') {
    let selected;
    if (versionId) selected = curseVersion((await this.request(`/mods/${Number(projectId)}/files/${Number(versionId)}`)).data);
    else {
      let index = 0;
      const params = (type === 'resourcepacks' || type === 'resourcepack')
        ? { gameVersion: profile.version, pageSize: '50' }
        : (type === 'shaders' || type === 'shader')
        ? { pageSize: '50' }
        : { gameVersion: profile.version, modLoaderType: '4', pageSize: '50' };
      do {
        const result = await this.request(`/mods/${Number(projectId)}/files?${new URLSearchParams({ ...params, index: String(index) })}`);
        selected = result.data.map(curseVersion).filter(v => compatible(v, profile, type)).sort((a,b)=>Date.parse(b.published)-Date.parse(a.published))[0];
        index += result.data.length;
        if (selected || !result.data.length || index >= (result.pagination?.totalCount || index)) break;
      } while (index < 1000);
    }
    if (!selected) throw new Error(`Keine passende CurseForge-Datei für ${profile.version} verfügbar.`);
    if (!selected.file.url) throw new Error('Der Autor erlaubt keinen direkten Launcher-Download dieser CurseForge-Datei.');
    return selected;
  }
}
module.exports = { Modrinth, CurseForge, DEFAULT_CURSEFORGE_KEY, compatible, loaderFor, modrinthVersion, curseVersion };
