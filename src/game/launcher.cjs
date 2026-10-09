const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const extract = require('../shared/zip.cjs');
const { json, download, inside, pool } = require('../shared/net.cjs');
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

function allowed(rules, features = {}) {
  if (!rules) return true;
  let result = false;
  for (const rule of rules) {
    const system = rule.os;
    if (system?.name && system.name !== 'windows') continue;
    if (system?.arch && !['x86_64', 'amd64', 'x64'].includes(system.arch)) continue;
    if (system?.version && !new RegExp(system.version).test(os.release())) continue;
    if (rule.features && !Object.entries(rule.features).every(([key, value]) => Boolean(features[key]) === value)) continue;
    result = rule.action === 'allow';
  }
  return result;
}
function argumentsFor(entries = [], values) {
  return entries.flatMap(entry => typeof entry === 'string' ? [entry] : allowed(entry.rules) ? [entry.value].flat() : [])
    .map(value => value.replace(/\$\{([^}]+)\}/g, (_, key) => {
      if (!(key in values)) throw new Error(`Nicht unterstütztes Startargument: ${key}`);
      return String(values[key]);
    }));
}
function mavenPath(name) {
  const [coordinate, extension = 'jar'] = name.split('@');
  const [group, artifact, version, classifier] = coordinate.split(':');
  if (!group || !artifact || !version) throw new Error('Ungültige Bibliothek.');
  return `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? '-' + classifier : ''}.${extension}`;
}
async function findJava(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const bin = path.join(directory, entry.name, 'bin', 'java.exe');
      try { await fs.access(bin); return bin; } catch {}
    }
  }
  return null;
}
async function ensureJava(major, root, customPath, report) {
  if (customPath) {
    const { stderr, stdout } = await promisify(execFile)(customPath, ['-version'], { windowsHide: true, timeout: 15000 });
    const match = (stderr + stdout).match(/version "(?:1\.)?(\d+)/);
    if (!match || Number(match[1]) !== major) throw new Error(`Diese Minecraft-Version benötigt Java ${major}. Bitte Java automatisch verwalten lassen oder einen passenden Pfad wählen.`);
    return customPath;
  }
  const target = path.join(root, 'runtimes', `java-${major}`);
  await fs.mkdir(target, { recursive: true });
  const existing = await findJava(target);
  if (existing) return existing;
  report({ stage: `Java ${major} wird eingerichtet`, percent: null });
  const builds = await json(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=x64&image_type=jre&os=windows`);
  const pkg = builds[0]?.binary?.package;
  if (!pkg) throw new Error(`Java ${major} ist derzeit nicht automatisch verfügbar. Bitte einen eigenen Java-Pfad angeben.`);
  const zip = path.join(root, 'runtimes', `java-${major}.zip`);
  await download(pkg.link, zip, pkg.checksum, 'sha256');
  const staging = path.join(root, 'runtimes', `java-${major}-extract`);
  await fs.rm(staging, { recursive: true, force: true });
  await extract(zip, { dir: staging });
  // Only publish a complete runtime, so a failed extraction can never look installed.
  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(staging, target);
  await fs.rm(zip, { force: true });
  const binary = await findJava(target);
  if (!binary) throw new Error('Java konnte nicht eingerichtet werden.');
  return binary;
}
async function manifest(root) {
  const file = path.join(root, 'versions-cache.json');
  try {
    const data = await json(MANIFEST);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data));
    return { ...data, cached: false };
  } catch (error) {
    try { return { ...JSON.parse(await fs.readFile(file, 'utf8')), cached: true }; } catch { throw error; }
  }
}
async function prepare({ root, version, mode, instanceKey, javaPath, resources, report, cosmetics }) {
  const versions = await manifest(root);
  const entry = versions.versions.find(v => v.id === version);
  if (!entry) throw new Error('Diese Version steht nicht im offiziellen Minecraft-Verzeichnis.');
  if (mode === 'caeser' && version !== '1.21.11') throw new Error('Die Caeser-Mod unterstützt derzeit Minecraft 1.21.11.');
  const metadataFile = inside(path.join(root, 'versions'), `${entry.id}.json`);
  report({ stage: 'Versionsdaten werden geladen', percent: null });
  await download(entry.url, metadataFile, entry.sha1);
  const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
  const java = await ensureJava(metadata.javaVersion?.majorVersion || 8, root, javaPath, report);
  const instance = inside(path.join(root, 'instances'), instanceKey || `${version}-${mode}`);
  const natives = path.join(instance, 'natives');
  await fs.mkdir(natives, { recursive: true });
  let libraries = [...metadata.libraries];
  let mainClass = metadata.mainClass;
  let extraArguments = { game: [], jvm: [] };
  if (mode === 'caeser' || mode === 'fabric') {
    report({ stage: 'Fabric Loader wird eingerichtet', percent: null });
    const loaders = await json(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}`);
    const loader = loaders.find(item => item.loader.stable) || loaders[0];
    if (!loader) throw new Error('Für diese Version ist kein Fabric Loader verfügbar.');
    const fabric = await json(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(loader.loader.version)}/profile/json`);
    libraries = [...libraries.filter(base => !fabric.libraries.some(lib => lib.name.split(':').slice(0, 2).join(':') === base.name.split(':').slice(0, 2).join(':'))), ...fabric.libraries];
    mainClass = fabric.mainClass;
    extraArguments = fabric.arguments || extraArguments;
  }
  const classpath = [];
  const nativeArchives = [];
  const downloads = [];
  const libraryRoot = path.join(root, 'libraries');
  for (const lib of libraries) {
    if (!allowed(lib.rules)) continue;
    const artifact = lib.downloads?.artifact || (!lib.downloads ? { path: mavenPath(lib.name), url: (lib.url || 'https://libraries.minecraft.net/') + mavenPath(lib.name) } : null);
    if (artifact) {
      const file = inside(libraryRoot, artifact.path);
      classpath.push(file);
      downloads.push({ ...artifact, file });
    }
    const classifier = lib.natives?.windows?.replace('${arch}', '64');
    if (classifier) {
      const native = lib.downloads?.classifiers?.[classifier];
      if (!native) throw new Error(`Native Bibliothek fehlt: ${lib.name}`);
      const file = inside(libraryRoot, native.path);
      downloads.push({ ...native, file });
      nativeArchives.push(file);
    }
  }
  const client = inside(path.join(root, 'versions'), `${version}.jar`);
  if (!metadata.downloads?.client) throw new Error('Diese historische Version enthält keinen herunterladbaren Client.');
  downloads.push({ ...metadata.downloads.client, file: client });
  classpath.push(client);
  let completed = 0;
  await pool(downloads, async item => {
    await download(item.url, item.file, item.sha1);
    report({ stage: `Bibliotheken · ${++completed}/${downloads.length}`, percent: Math.round(completed / downloads.length * 100) });
  });
  for (const file of nativeArchives) await extract(file, { dir: natives });
  const assetRoot = path.join(root, 'assets');
  const indexFile = inside(path.join(assetRoot, 'indexes'), `${metadata.assetIndex.id}.json`);
  await download(metadata.assetIndex.url, indexFile, metadata.assetIndex.sha1);
  const index = JSON.parse(await fs.readFile(indexFile, 'utf8'));
  const assets = Object.entries(index.objects);
  completed = 0;
  const virtualRoot = inside(path.join(assetRoot, 'virtual'), metadata.assetIndex.id);
  await pool(assets, async ([name, asset]) => {
    if (!/^[a-f\d]{40}$/.test(asset.hash)) throw new Error('Ungültige Asset-Prüfsumme.');
    const relative = `${asset.hash.slice(0, 2)}/${asset.hash}`;
    const file = inside(path.join(assetRoot, 'objects'), relative);
    await download(`https://resources.download.minecraft.net/${relative}`, file, asset.hash);
    if (index.virtual || index.map_to_resources) {
      const destinations = [index.virtual && inside(virtualRoot, name), index.map_to_resources && inside(path.join(instance, 'resources'), name)].filter(Boolean);
      for (const destination of destinations) { await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(file, destination); }
    }
    completed++;
    if (completed % 30 === 0 || completed === assets.length) report({ stage: `Spieldateien · ${completed}/${assets.length}`, percent: Math.round(completed / assets.length * 100) });
  });
  let loggingArgument;
  if (metadata.logging?.client) {
    const logging = metadata.logging.client;
    const file = inside(path.join(root, 'logging'), logging.file.id);
    await download(logging.file.url, file, logging.file.sha1);
    loggingArgument = logging.argument.replace('${path}', file);
  }
  if (mode === 'caeser') {
    report({ stage: 'Caeser-Mod wird eingerichtet', percent: null });
    const mods = path.join(instance, 'mods');
    await fs.mkdir(mods, { recursive: true });
    const candidatePaths = [
      path.join(resources, 'caeserclient-1.0.0.jar'),
      path.resolve(__dirname, '../../resources/caeserclient-1.0.0.jar'),
      path.join(process.cwd(), 'resources', 'caeserclient-1.0.0.jar'),
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
    const targetJar = path.join(mods, 'caeserclient-1.0.0.jar');
    let targetMtime = 0;
    try { targetMtime = (await fs.stat(targetJar)).mtimeMs; } catch {}
    if (!targetMtime || newestMtime > targetMtime) {
      await fs.copyFile(newestSource, targetJar);
    }
    const apiVersion = '0.140.2+1.21.11';
    const name = `fabric-api-${apiVersion}.jar`;
    const url = `https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/${apiVersion}/${name}`;
    const checksumResponse = await fetch(url + '.sha1', { signal: AbortSignal.timeout(30000) });
    if (!checksumResponse.ok) throw new Error('Fabric-API-Prüfsumme konnte nicht geladen werden.');
    const checksum = (await checksumResponse.text()).trim().split(/\s/)[0];
    if (!/^[a-f\d]{40}$/i.test(checksum)) throw new Error('Ungültige Fabric-API-Prüfsumme.');
    await download(url, path.join(mods, name), checksum);
  }
  const clientConfigDir = path.join(instance, 'config', 'CaeserClient');
  await fs.mkdir(clientConfigDir, { recursive: true });
  const cosmeticsPath = path.join(clientConfigDir, 'cosmetics.json');
  let existingCosmetics = {};
  try {
    const raw = await fs.readFile(cosmeticsPath, 'utf8');
    existingCosmetics = JSON.parse(raw);
  } catch {}

  const cosmeticsData = {
    wings: { type: 'none', color: '#a855f7' },
    head: { type: 'none', color: '#facc15' },
    pet: { type: 'none', color: '#38bdf8' },
    accessories: [],
    accessoryCustomPlayers: {},
    ...existingCosmetics,
    ...(cosmetics || {})
  };

  if (Array.isArray(existingCosmetics.accessories) && existingCosmetics.accessories.length > 0) {
    cosmeticsData.accessories = existingCosmetics.accessories;
  }
  if (existingCosmetics.accessoryCustomPlayers && typeof existingCosmetics.accessoryCustomPlayers === 'object') {
    cosmeticsData.accessoryCustomPlayers = {
      ...existingCosmetics.accessoryCustomPlayers,
      ...(cosmeticsData.accessoryCustomPlayers || {})
    };
  }
  if (existingCosmetics.pet && (!cosmetics || cosmetics.pet?.type === 'none')) {
    cosmeticsData.pet = existingCosmetics.pet;
  }
  if (existingCosmetics.wings && (!cosmetics || cosmetics.wings?.type === 'none')) {
    cosmeticsData.wings = existingCosmetics.wings;
  }
  if (existingCosmetics.head && (!cosmetics || cosmetics.head?.type === 'none')) {
    cosmeticsData.head = existingCosmetics.head;
  }

  await fs.writeFile(cosmeticsPath, JSON.stringify(cosmeticsData, null, 2), 'utf8');
  return { java, metadata, instance, natives, classpath, mainClass, extraArguments, assetRoot, virtualRoot, loggingArgument, libraryRoot };
}
function launchArguments(prepared, account, memory) {
  const { metadata, natives, instance, classpath, assetRoot, virtualRoot, libraryRoot } = prepared;
  const values = {
    auth_player_name: account.name, auth_uuid: account.id, auth_access_token: account.accessToken,
    auth_session: `token:${account.accessToken}:${account.id}`, auth_xuid: account.xuid || '', clientid: account.clientId,
    version_name: metadata.id, version_type: metadata.type, game_directory: instance, assets_root: assetRoot,
    assets_index_name: metadata.assetIndex.id, game_assets: virtualRoot, user_type: 'msa', user_properties: '{}',
    natives_directory: natives, launcher_name: 'Caeser Client', launcher_version: '0.3.18',
    classpath: classpath.join(path.delimiter), classpath_separator: path.delimiter, library_directory: libraryRoot,
    resolution_width: '1280', resolution_height: '720'
  };
  const jvm = metadata.arguments?.jvm || ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'];
  const game = metadata.arguments?.game || metadata.minecraftArguments?.split(/\s+/) || [];
  return [`-Xmx${memory}M`, '-Xms512M', '-Dlog4j2.formatMsgNoLookups=true',
    ...argumentsFor(jvm, values), ...argumentsFor(prepared.extraArguments.jvm, values),
    ...(prepared.loggingArgument ? [prepared.loggingArgument] : []), prepared.mainClass,
    ...argumentsFor(game, values), ...argumentsFor(prepared.extraArguments.game, values)];
}
function start(prepared, account, memory) {
  return spawn(prepared.java, launchArguments(prepared, account, memory), { cwd: prepared.instance, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}
module.exports = { manifest, prepare, start, allowed, argumentsFor, mavenPath, launchArguments, ensureJava };
