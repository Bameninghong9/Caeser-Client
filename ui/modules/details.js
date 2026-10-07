import { $, api, model, update, onState, action, toast, navigate, loaderName, relativeTime, bytesLabel } from './common.js';
import { openProfile } from './profiles.js';
import { modIcon } from './images.js';

let source = 'modrinth', hits = [], total = 0, generation = 0, detailRequest = 0, installing = false, timer;
let activeContentType = 'mods';
let drawerContentType = 'mods';

const profile = () => model.state?.profiles.find(p => p.id === model.detailId);
const element = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };

function updateBadgeCounts() {
  const data = model.details;
  const modsCount = data?.mods?.length || 0;
  const rpCount = data?.resourcepacks?.length || 0;
  const shadersCount = data?.shaders?.length || 0;
  if ($('badge-count-mods')) $('badge-count-mods').textContent = modsCount;
  if ($('badge-count-resourcepacks')) $('badge-count-resourcepacks').textContent = rpCount;
  if ($('badge-count-shaders')) $('badge-count-shaders').textContent = shadersCount;
}

function header() {
  const p = profile(); if (!p) return;
  $('detail-name').textContent = p.name; $('detail-image').src = `assets/loaders/${p.mode}.svg`;
  $('detail-version').textContent = p.version; $('detail-loader').textContent = loaderName(p.mode);
  $('detail-memory').textContent = `${p.memoryMb} MB RAM`;
  $('stat-last').textContent = relativeTime(p.lastPlayedAt);
  const minutes = Math.floor((p.playtimeMs || 0) / 60000);
  $('stat-time').textContent = minutes >= 60 ? `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.` : `${minutes} Min.`;

  updateBadgeCounts();

  const addBtn = $('add-mods');
  const addLabel = $('add-mods-label');
  const searchInput = $('installed-search');
  const titleEl = $('installed-title');
  const caeserBtn = $('install-caeser-mod');

  if (activeContentType === 'mods') {
    titleEl.innerHTML = `Installierte Mods <span id="installed-count">${model.details?.mods?.length || 0}</span>`;
    searchInput.placeholder = 'Mods im Profil suchen …';
    if (addLabel) addLabel.textContent = 'Mods hinzufügen';
    addBtn.disabled = p.mode === 'vanilla';
    addBtn.title = p.mode === 'vanilla' ? 'Mods benötigen ein Fabric-Profil.' : '';

    if (caeserBtn) {
      const isEligible = p.version === '1.21.11' && p.mode !== 'vanilla';
      caeserBtn.hidden = !isEligible;
      if (isEligible) {
        const hasCaeser = model.details?.mods?.some(m => m.filename.includes('caeserclient') || m.name.toLowerCase().includes('caeser'));
        if (hasCaeser) {
          caeserBtn.textContent = 'Caeser Mod installiert ✓';
          caeserBtn.disabled = true;
        } else {
          caeserBtn.textContent = 'Caeser Client Mod installieren';
          caeserBtn.disabled = false;
        }
      }
    }
  } else if (activeContentType === 'resourcepacks') {
    titleEl.innerHTML = `Installierte Ressourcenpakete <span id="installed-count">${model.details?.resourcepacks?.length || 0}</span>`;
    searchInput.placeholder = 'Ressourcenpakete durchsuchen …';
    if (addLabel) addLabel.textContent = 'Ressourcenpakete hinzufügen';
    addBtn.disabled = false;
    addBtn.title = '';
    if (caeserBtn) caeserBtn.hidden = true;
  } else if (activeContentType === 'shaders') {
    titleEl.innerHTML = `Installierte Shader-Pakete <span id="installed-count">${model.details?.shaders?.length || 0}</span>`;
    searchInput.placeholder = 'Shader-Pakete durchsuchen …';
    if (addLabel) addLabel.textContent = 'Shader-Pakete hinzufügen';
    addBtn.disabled = false;
    addBtn.title = '';
    if (caeserBtn) caeserBtn.hidden = true;
  }
}

function renderInstalled() {
  const data = model.details; if (!data || data.profile.id !== model.detailId) return;
  $('stat-storage').textContent = bytesLabel(data.storageBytes);
  updateBadgeCounts();

  const currentList = activeContentType === 'resourcepacks' ? (data.resourcepacks || []) : activeContentType === 'shaders' ? (data.shaders || []) : (data.mods || []);
  $('installed-count').textContent = currentList.length;

  const list = $('installed-mods'); list.replaceChildren();
  const query = $('installed-search').value.toLowerCase();

  for (const item of currentList.filter(m => `${m.name} ${m.filename}`.toLowerCase().includes(query))) {
    const row = element('article', `installed-mod${item.enabled ? '' : ' disabled'}`);
    const img = element('img', 'mod-icon'); img.alt = '';
    if (item.iconUrl) {
      modIcon(img, item.iconUrl);
    } else {
      img.src = activeContentType === 'resourcepacks' ? 'assets/loaders/vanilla.svg' : 'assets/loaders/fabric.svg';
    }
    const body = element('div'); const name = element('strong', '', item.name); name.title = item.filename;
    body.append(name, element('p', '', `${item.version || item.filename} · ${bytesLabel(item.size)}`));
    row.append(img, body);

    if (item.managed) row.append(element('span', 'managed', 'Caeser'));
    else {
      const actions = element('div', 'installed-mod-actions');
      if (item.hasUpdate && activeContentType === 'mods') {
        const updateBtn = element('button', 'update-mod-btn', 'Aktualisieren');
        updateBtn.title = `Auf Version ${item.latestVersion} aktualisieren`;
        updateBtn.onclick = async () => {
          updateBtn.disabled = true; updateBtn.textContent = '…';
          try {
            const result = await api.updateMod({ profileId: data.profile.id, name: item.filename });
            if (model.detailId === data.profile.id) {
              model.details = result;
              renderInstalled();
              checkUpdatesForProfile(data.profile.id);
            }
            toast(`${item.name} auf Version ${item.latestVersion} aktualisiert!`);
          } catch (err) {
            toast(err.message, true);
            updateBtn.disabled = false;
            updateBtn.textContent = 'Aktualisieren';
          }
        };
        actions.append(updateBtn);
      }
      const label = element('label', 'mod-switch');
      label.title = item.enabled ? `${item.name} deaktivieren` : `${item.name} aktivieren`;
      const toggle = element('input'); toggle.type = 'checkbox'; toggle.checked = item.enabled;
      toggle.setAttribute('aria-label', `${item.name} aktivieren`);
      const slider = element('span', 'mod-slider');
      label.append(toggle, slider);
      toggle.onchange = async () => {
        toggle.disabled = true; const id = data.profile.id;
        try {
          const result = await api.toggleMod({ profileId: id, name: item.filename, enabled: toggle.checked, type: activeContentType });
          if (model.detailId === id) { model.details = result; renderInstalled(); }
        }
        catch (error) { toggle.checked = item.enabled; toast(error.message, true); }
        finally { toggle.disabled = false; }
      };
      actions.append(label);
      const delBtn = element('button', 'icon-button delete-mod');
      delBtn.title = `${activeContentType === 'resourcepacks' ? 'Ressourcenpaket' : activeContentType === 'shaders' ? 'Shader-Paket' : 'Mod'} löschen`;
      delBtn.setAttribute('aria-label', `${item.name} löschen`);
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
      delBtn.onclick = async () => {
        delBtn.disabled = true;
        const id = data.profile.id;
        try {
          const result = await api.removeMod({ profileId: id, name: item.filename, type: activeContentType });
          if (model.detailId === id) { model.details = result; renderInstalled(); }
          toast(`${item.name} wurde entfernt.`);
        } catch (error) {
          toast(error.message, true);
          delBtn.disabled = false;
        }
      };
      actions.append(delBtn);
      row.append(actions);
    }
    list.append(row);
  }
  if (!list.children.length) {
    const emptyMsg = query ? 'Keine Treffer für diese Suche.' :
      activeContentType === 'resourcepacks' ? 'Noch keine Ressourcenpakete installiert. Füge deine ersten Texturen hinzu.' :
      activeContentType === 'shaders' ? 'Noch keine Shader-Pakete installiert. Füge deine ersten Shader hinzu.' :
      profile()?.mode === 'vanilla' ? 'Dieses Vanilla-Profil verwendet keine Mods.' :
      'Noch keine Mods installiert. Füge deine ersten Mods hinzu.';
    list.append(element('p', 'source-empty', emptyMsg));
  }
}

async function checkUpdatesForProfile(profileId) {
  try {
    const updates = await api.checkModUpdates(profileId);
    if (!updates || !updates.length || model.detailId !== profileId) return;
    let hasChange = false;
    for (const u of updates) {
      const mod = model.details?.mods?.find(m => m.filename === u.filename);
      if (mod && !mod.hasUpdate) {
        mod.hasUpdate = true;
        mod.latestVersion = u.latestVersion;
        mod.latestVersionId = u.latestVersionId;
        hasChange = true;
      }
    }
    if (hasChange) renderInstalled();
  } catch {}
}

async function refresh() {
  const id = model.detailId, request = ++detailRequest;
  $('detail-error').hidden = true;
  try {
    const data = await api.profileDetails(id);
    if (request !== detailRequest || id !== model.detailId) return;
    model.details = data;
    header();
    renderInstalled();
    checkUpdatesForProfile(id);
  } catch (error) { if (request === detailRequest) { $('detail-error').textContent = error.message; $('detail-error').hidden = false; } }
}

function installed(hit) {
  if (drawerContentType === 'mods' && profile()?.mode === 'caeser' && ((source === 'modrinth' && hit.id === 'P7dR8mSH') || (source === 'curseforge' && hit.id === '306612'))) return 'Enthalten';
  const list = drawerContentType === 'resourcepacks' ? model.details?.resourcepacks : drawerContentType === 'shaders' ? model.details?.shaders : model.details?.mods;
  const match = list?.find(m => m.source === source && m.projectId === hit.id);
  return match ? (match.enabled ? 'Installiert' : 'Deaktiviert') : null;
}

function updateDrawerHeader() {
  const p = profile(); if (!p) return;
  $('drawer-profile-name').textContent = p.name;
  const eyebrow = $('drawer-eyebrow');
  if (eyebrow) {
    eyebrow.textContent = drawerContentType === 'resourcepacks' ? 'RESSOURCENPAKETE HINZUFÜGEN' : drawerContentType === 'shaders' ? 'SHADER-PAKETE HINZUFÜGEN' : 'MODS HINZUFÜGEN';
  }
  const searchInput = $('mod-search');
  if (searchInput) {
    searchInput.placeholder = drawerContentType === 'resourcepacks' ? 'Ressourcenpakete entdecken …' : drawerContentType === 'shaders' ? 'Shader entdecken …' : 'Mods entdecken …';
  }
  $('mod-version-filter').textContent = p.version;
  $('mod-loader-filter').textContent = drawerContentType === 'mods' ? (p.mode === 'caeser' ? 'Fabric' : p.mode === 'fabric' ? 'Fabric' : 'Vanilla') : (drawerContentType === 'resourcepacks' ? 'Resource Pack' : 'Shader');
  $('mod-loader-filter').hidden = false;
  document.querySelectorAll('.drawer-cat-btn').forEach(btn => btn.classList.toggle('selected', btn.dataset.drawerType === drawerContentType));
}

function renderResults() {
  const list = $('mod-results'); list.replaceChildren();
  for (const hit of hits) {
    const row = element('article', 'mod-result'), img = element('img', 'mod-icon'); img.alt = ''; modIcon(img, hit.iconUrl);
    const body = element('div'), name = element('h3', '', hit.title);
    name.append(element('span', 'mod-author', `von ${hit.author}`));
    body.append(name, element('p', '', hit.description), element('small', '', `${Number(hit.downloads || 0).toLocaleString('de-DE')} Downloads`));
    const button = element('button', 'secondary', installed(hit) || 'Installieren'); button.disabled = installing || !!installed(hit);
    button.onclick = () => install(hit); row.append(img, body, button); list.append(row);
  }
  if (!hits.length) {
    const emptyMsg = drawerContentType === 'resourcepacks' ? 'Keine passenden Ressourcenpakete gefunden. Versuche einen anderen Suchbegriff.' : drawerContentType === 'shaders' ? 'Keine passenden Shader gefunden. Versuche einen anderen Suchbegriff.' : 'Keine passenden Mods gefunden. Versuche einen anderen Suchbegriff.';
    list.append(element('p', 'source-empty', emptyMsg));
  }
  $('more-mods').hidden = hits.length >= total; $('more-mods').disabled = installing;
  if (!installing) {
    const itemNoun = drawerContentType === 'resourcepacks' ? 'Pakete' : drawerContentType === 'shaders' ? 'Shader' : 'Mods';
    $('mod-results-status').textContent = `${hits.length} von ${total.toLocaleString('de-DE')} ${itemNoun}`;
  }
}

async function search(append = false) {
  const p = profile(); if (!p || !$('mods-drawer').open) return;
  const request = ++generation, selectedSource = source, currentType = drawerContentType;
  $('more-mods').hidden = true;
  if (!append) { hits = []; $('mod-results').replaceChildren(element('p', 'mod-loading', 'Wird gesucht …')); }
  try {
    const result = await api.searchMods({ profileId: p.id, source: selectedSource, query: $('mod-search').value.trim(), offset: append ? hits.length : 0, type: currentType });
    if (request !== generation || p.id !== model.detailId || currentType !== drawerContentType) return;
    hits = append ? [...hits, ...result.hits] : result.hits; total = result.total; renderResults();
  } catch (error) {
    if (request !== generation) return;
    const box = element('div', 'source-empty'); box.append(element('h3', '', 'Quelle nicht verfügbar'), element('p', '', error.message));
    if (selectedSource === 'curseforge') { const button = element('button', 'secondary', 'Mod-Quellen öffnen'); button.onclick = () => { $('mods-drawer').close(); navigate('settings'); $('mod-settings').open = true; $('curseforge-key').focus(); }; box.append(button); }
    $('mod-results').replaceChildren(box); $('mod-results-status').textContent = 'Suche fehlgeschlagen';
  }
}

async function install(hit) {
  if (installing) return;
  const id = model.detailId, selectedSource = source, currentType = drawerContentType; installing = true; renderResults();
  $('mod-results-status').textContent = `${hit.title}: Kompatibilität prüfen …`;
  let message;
  try {
    const data = await api.installMod({ profileId: id, source: selectedSource, projectId: hit.id, type: currentType });
    if (id === model.detailId) { model.details = data; renderInstalled(); }
    message = currentType === 'mods'
      ? `${hit.title} wurde mit benötigten Abhängigkeiten installiert.`
      : `${hit.title} wurde erfolgreich hinzugefügt.`;
    toast(message);
  } catch (error) { message = error.message; toast(error.message, true); }
  finally { installing = false; if ($('mods-drawer').open) { renderResults(); $('mod-results-status').textContent = message; } }
}

export function initDetails() {
  document.addEventListener('profile-open', event => {
    model.detailId = event.detail; model.details = null; $('installed-search').value = '';
    $('installed-mods').replaceChildren(); $('stat-storage').textContent = '…'; $('installed-count').textContent = '0';
    activeContentType = 'mods';
    document.querySelectorAll('.inhalte-tab').forEach(b => b.classList.toggle('active', b.dataset.contentTab === 'mods'));
    header(); navigate('profile'); refresh();
  });

  onState(() => { if (model.detailId) { if (!profile()) { model.detailId = null; model.details = null; navigate('profiles'); } else header(); } });
  $('back-profiles').onclick = () => navigate('profiles');
  $('detail-folder').onclick = () => action(() => api.profileFolder(model.detailId));
  $('detail-edit').onclick = () => openProfile(profile());
  $('detail-play').onclick = () => action(async () => { update(await api.selectProfile(model.detailId)); navigate('play'); $('play-button').click(); });
  $('installed-search').oninput = renderInstalled;

  document.querySelectorAll('[data-content-tab]').forEach(tab => {
    tab.onclick = () => {
      activeContentType = tab.dataset.contentTab;
      document.querySelectorAll('[data-content-tab]').forEach(t => t.classList.toggle('active', t === tab));
      $('installed-search').value = '';
      header();
      renderInstalled();
    };
  });

  $('add-mods').onclick = () => {
    const p = profile(); if (!p) return;
    if (activeContentType === 'mods' && p.mode === 'vanilla') return;
    drawerContentType = activeContentType;
    updateDrawerHeader();
    $('mods-drawer').showModal();
    search();
  };

  document.querySelectorAll('.drawer-cat-btn').forEach(btn => {
    btn.onclick = () => {
      drawerContentType = btn.dataset.drawerType;
      updateDrawerHeader();
      search();
    };
  });

  // Backdrop click to close drawer: clicking in the free space on the left closes the drawer immediately!
  $('mods-drawer').addEventListener('mousedown', event => {
    const rect = $('mods-drawer').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      $('mods-drawer').close();
    }
  });

  const caeserBtn = $('install-caeser-mod');
  if (caeserBtn) {
    caeserBtn.onclick = () => action(async () => {
      const p = profile();
      if (!p || p.version !== '1.21.11' || p.mode === 'vanilla') return;
      caeserBtn.disabled = true; caeserBtn.textContent = 'Wird installiert …';
      try {
        const result = await api.installCaeserMod(p.id);
        if (model.detailId === p.id) { model.details = result; renderInstalled(); header(); }
        toast('Caeser Client Mod wurde erfolgreich installiert!');
      } catch (err) { toast(err.message, true); header(); }
    });
  }

  $('mods-drawer').addEventListener('close', () => { generation++; clearTimeout(timer); });
  $('mod-search').oninput = () => { generation++; clearTimeout(timer); $('mod-results').replaceChildren(element('p', 'mod-loading', 'Wird gesucht …')); $('more-mods').hidden = true; timer = setTimeout(() => search(), 300); };
  document.querySelectorAll('[data-source]').forEach(button => button.onclick = () => {
    source = button.dataset.source; document.querySelectorAll('[data-source]').forEach(b => b.classList.toggle('selected', b === button)); search();
  });
  $('more-mods').onclick = () => search(true);
  api.on('mod-progress', event => { if (event.profileId === model.detailId && installing) $('mod-results-status').textContent = event.stage === 'done' ? 'Installation abgeschlossen.' : `${event.name} wird verarbeitet …`; });
  api.on('game-exit', () => { document.body.classList.remove('in-game'); if (model.detailId) refresh(); });
  api.on('game-spawn', () => { document.body.classList.add('in-game'); });
}

