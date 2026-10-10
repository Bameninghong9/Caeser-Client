import { $, api, model, update, onState, action, toast, navigate, loaderName, relativeTime, bytesLabel } from './common.js';
import { openProfile } from './profiles.js';
import { modIcon } from './images.js';
import { t, currentLanguage } from './i18n.js';

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
  const isEn = currentLanguage === 'en';
  $('detail-name').textContent = p.name; $('detail-image').src = `assets/loaders/${p.mode}.svg`;
  $('detail-version').textContent = p.version; $('detail-loader').textContent = loaderName(p.mode);
  $('detail-memory').textContent = `${p.memoryMb} MB RAM`;
  $('stat-last').textContent = relativeTime(p.lastPlayedAt);
  const minutes = Math.floor((p.playtimeMs || 0) / 60000);
  $('stat-time').textContent = minutes >= 60
    ? (isEn ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`)
    : (isEn ? `${minutes} min` : `${minutes} Min.`);

  updateBadgeCounts();

  const addBtn = $('add-mods');
  const addLabel = $('add-mods-label');
  const searchInput = $('installed-search');
  const titleEl = $('installed-title');
  const caeserBtn = $('install-caeser-mod');

  if (activeContentType === 'mods') {
    titleEl.innerHTML = `${t('installedMods')} <span id="installed-count">${model.details?.mods?.length || 0}</span>`;
    searchInput.placeholder = t('searchModsPlaceholder');
    if (addLabel) addLabel.textContent = t('addMods');
    addBtn.disabled = p.mode === 'vanilla';
    addBtn.title = p.mode === 'vanilla' ? t('vanillaNoModsTitle') : '';

    if (caeserBtn) {
      const isEligible = p.version === '1.21.11' && p.mode !== 'vanilla';
      caeserBtn.hidden = !isEligible;
      if (isEligible) {
        const hasCaeser = model.details?.mods?.some(m => m.filename.includes('caeserclient') || m.name.toLowerCase().includes('caeser'));
        if (hasCaeser) {
          caeserBtn.textContent = t('caeserModInstalled');
          caeserBtn.disabled = true;
        } else {
          caeserBtn.textContent = t('installCaeserMod');
          caeserBtn.disabled = false;
        }
      }
    }
  } else if (activeContentType === 'resourcepacks') {
    titleEl.innerHTML = `${t('installedResourcePacks')} <span id="installed-count">${model.details?.resourcepacks?.length || 0}</span>`;
    searchInput.placeholder = t('searchResourcePacksPlaceholder');
    if (addLabel) addLabel.textContent = t('addResourcePacks');
    addBtn.disabled = false;
    addBtn.title = '';
    if (caeserBtn) caeserBtn.hidden = true;
  } else if (activeContentType === 'shaders') {
    titleEl.innerHTML = `${t('installedShaders')} <span id="installed-count">${model.details?.shaders?.length || 0}</span>`;
    searchInput.placeholder = t('searchShadersPlaceholder');
    if (addLabel) addLabel.textContent = t('addShaders');
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
    const body = element('div', 'mod-info'); const name = element('strong', '', item.name); name.title = item.filename;
    if (item.hasUpdate && activeContentType === 'mods') {
      name.append(element('span', 'mod-update-badge', `Update: ${item.latestVersion}`));
    }
    body.append(name, element('p', '', `${item.version || item.filename} · ${bytesLabel(item.size)}`));
    row.append(img, body);

    if (item.managed) row.append(element('span', 'managed', 'Caeser'));
    else {
      const actions = element('div', 'installed-mod-actions');
      if (item.hasUpdate && activeContentType === 'mods') {
        const updateBtn = element('button', 'update-mod-btn', t('update'));
        updateBtn.title = `${t('updateTo')} ${item.latestVersion}`;
        updateBtn.onclick = async () => {
          updateBtn.disabled = true; updateBtn.textContent = '…';
          try {
            const result = await api.updateMod({ profileId: data.profile.id, name: item.filename });
            if (model.detailId === data.profile.id) {
              model.details = result;
              renderInstalled();
              checkUpdatesForProfile(data.profile.id);
            }
            toast(`${item.name} ${t('modUpdatedTo')} ${item.latestVersion}!`);
          } catch (err) {
            toast(err.message, true);
            updateBtn.disabled = false;
            updateBtn.textContent = t('update');
          }
        };
        actions.append(updateBtn);
      }
      const label = element('label', 'mod-switch');
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
      delBtn.setAttribute('aria-label', `${item.name} löschen`);
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
      delBtn.onclick = async () => {
        delBtn.disabled = true;
        const id = data.profile.id;
        try {
          const result = await api.removeMod({ profileId: id, name: item.filename, type: activeContentType });
          if (model.detailId === id) { model.details = result; renderInstalled(); }
          toast(`${item.name} ${t('modRemoved')}`);
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
  const updateCount = (data.mods || []).filter(m => m.hasUpdate).length;
  const updateAllBtn = $('update-all-mods');
  if (updateAllBtn) {
    if (activeContentType === 'mods' && updateCount > 0) {
      updateAllBtn.hidden = false;
      updateAllBtn.innerHTML = `<i data-icon="download"></i><span>${t('updateAll')} (${updateCount})</span>`;
    } else {
      updateAllBtn.hidden = true;
    }
  }
  const checkUpdatesBtn = $('check-mod-updates');
  if (checkUpdatesBtn) {
    checkUpdatesBtn.hidden = activeContentType !== 'mods' || data.profile.mode === 'vanilla';
  }
  if (!list.children.length) {
    const emptyMsg = query ? t('noSearchHits', 'Keine Treffer für diese Suche.') :
      activeContentType === 'resourcepacks' ? t('noRpInstalled') :
      activeContentType === 'shaders' ? t('noShadersInstalled') :
      profile()?.mode === 'vanilla' ? t('vanillaProfileNoMods') :
      t('noModsInstalled');
    list.append(element('p', 'source-empty', emptyMsg));
  }
}

async function checkUpdatesForProfile(profileId, showFeedback = false) {
  try {
    const updates = await api.checkModUpdates(profileId);
    if (model.detailId !== profileId) return;
    let hasChange = false;
    for (const mod of (model.details?.mods || [])) {
      const u = updates?.find(up => up.filename === mod.filename);
      if (u) {
        if (!mod.hasUpdate || mod.latestVersion !== u.latestVersion) {
          mod.hasUpdate = true;
          mod.latestVersion = u.latestVersion;
          mod.latestVersionId = u.latestVersionId;
          hasChange = true;
        }
      } else if (mod.hasUpdate) {
        mod.hasUpdate = false;
        hasChange = true;
      }
    }
    if (hasChange) renderInstalled();
    return updates?.length || 0;
  } catch (err) {
    if (showFeedback) throw err;
  }
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
  if (drawerContentType === 'mods' && profile()?.mode === 'caeser' && ((source === 'modrinth' && hit.id === 'P7dR8mSH') || (source === 'curseforge' && hit.id === '306612'))) return t('included');
  const list = drawerContentType === 'resourcepacks' ? model.details?.resourcepacks : drawerContentType === 'shaders' ? model.details?.shaders : model.details?.mods;
  const match = list?.find(m => m.source === source && m.projectId === hit.id);
  return match ? (match.enabled ? t('installed') : t('disabled')) : null;
}

function updateDrawerHeader() {
  const p = profile(); if (!p) return;
  $('drawer-profile-name').textContent = p.name;
  const eyebrow = $('drawer-eyebrow');
  if (eyebrow) {
    eyebrow.textContent = drawerContentType === 'resourcepacks' ? t('addRpEyebrow') : drawerContentType === 'shaders' ? t('addShadersEyebrow') : t('addModsEyebrow');
  }
  const searchInput = $('mod-search');
  if (searchInput) {
    searchInput.placeholder = drawerContentType === 'resourcepacks' ? t('searchResourcePacksPlaceholder') : drawerContentType === 'shaders' ? t('searchShadersPlaceholder') : t('searchModsPlaceholder');
  }
  $('mod-version-filter').textContent = p.version;
  $('mod-loader-filter').textContent = drawerContentType === 'mods' ? (p.mode === 'caeser' ? 'Fabric' : p.mode === 'fabric' ? 'Fabric' : 'Vanilla') : (drawerContentType === 'resourcepacks' ? 'Resource Pack' : 'Shader');
  $('mod-loader-filter').hidden = false;
  document.querySelectorAll('.drawer-cat-btn').forEach(btn => btn.classList.toggle('selected', btn.dataset.drawerType === drawerContentType));
}

function renderResults() {
  const list = $('mod-results'); list.replaceChildren();
  const isEn = currentLanguage === 'en';
  for (const hit of hits) {
    const row = element('article', 'mod-result'), img = element('img', 'mod-icon'); img.alt = ''; modIcon(img, hit.iconUrl);
    const body = element('div'), name = element('h3', '', hit.title);
    name.append(element('span', 'mod-author', isEn ? `by ${hit.author}` : `von ${hit.author}`));
    body.append(name, element('p', '', hit.description), element('small', '', `${Number(hit.downloads || 0).toLocaleString(isEn ? 'en-US' : 'de-DE')} Downloads`));
    const button = element('button', 'secondary', installed(hit) || t('install')); button.disabled = installing || !!installed(hit);
    button.onclick = () => install(hit); row.append(img, body, button); list.append(row);
  }
  if (!hits.length) {
    const emptyMsg = drawerContentType === 'resourcepacks'
      ? (isEn ? 'No matching resource packs found. Try a different search term.' : 'Keine passenden Ressourcenpakete gefunden. Versuche einen anderen Suchbegriff.')
      : drawerContentType === 'shaders'
      ? (isEn ? 'No matching shader packs found. Try a different search term.' : 'Keine passenden Shader gefunden. Versuche einen anderen Suchbegriff.')
      : (isEn ? 'No matching mods found. Try a different search term.' : 'Keine passenden Mods gefunden. Versuche einen anderen Suchbegriff.');
    list.append(element('p', 'source-empty', emptyMsg));
  }
  $('more-mods').hidden = hits.length >= total; $('more-mods').disabled = installing;
  if (!installing) {
    const itemNoun = drawerContentType === 'resourcepacks' ? (isEn ? 'packs' : 'Pakete') : drawerContentType === 'shaders' ? 'Shader' : 'Mods';
    $('mod-results-status').textContent = isEn
      ? `${hits.length} of ${total.toLocaleString('en-US')} ${itemNoun}`
      : `${hits.length} von ${total.toLocaleString('de-DE')} ${itemNoun}`;
  }
}

async function search(append = false) {
  const p = profile(); if (!p || !$('mods-drawer').open) return;
  const request = ++generation, selectedSource = source, currentType = drawerContentType;
  $('more-mods').hidden = true;
  if (!append) { hits = []; $('mod-results').replaceChildren(element('p', 'mod-loading', t('searching'))); }
  try {
    const result = await api.searchMods({ profileId: p.id, source: selectedSource, query: $('mod-search').value.trim(), offset: append ? hits.length : 0, type: currentType });
    if (request !== generation || p.id !== model.detailId || currentType !== drawerContentType) return;
    hits = append ? [...hits, ...result.hits] : result.hits; total = result.total; renderResults();
  } catch (error) {
    if (request !== generation) return;
    const box = element('div', 'source-empty'); box.append(element('h3', '', currentLanguage === 'en' ? 'Source unavailable' : 'Quelle nicht verfügbar'), element('p', '', error.message));
    if (selectedSource === 'curseforge') { const button = element('button', 'secondary', currentLanguage === 'en' ? 'Open mod sources' : 'Mod-Quellen öffnen'); button.onclick = () => { $('mods-drawer').close(); navigate('settings'); $('mod-settings').open = true; $('curseforge-key').focus(); }; box.append(button); }
    $('mod-results').replaceChildren(box); $('mod-results-status').textContent = currentLanguage === 'en' ? 'Search failed' : 'Suche fehlgeschlagen';
  }
}

async function install(hit) {
  if (installing) return;
  const id = model.detailId, selectedSource = source, currentType = drawerContentType; installing = true; renderResults();
  const isEn = currentLanguage === 'en';
  $('mod-results-status').textContent = isEn ? `${hit.title}: Checking compatibility …` : `${hit.title}: Kompatibilität prüfen …`;
  let message;
  try {
    const data = await api.installMod({ profileId: id, source: selectedSource, projectId: hit.id, type: currentType });
    if (id === model.detailId) { model.details = data; renderInstalled(); }
    message = currentType === 'mods'
      ? (isEn ? `${hit.title} was installed with required dependencies.` : `${hit.title} wurde mit benötigten Abhängigkeiten installiert.`)
      : (isEn ? `${hit.title} was added successfully.` : `${hit.title} wurde erfolgreich hinzugefügt.`);
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
      caeserBtn.disabled = true; caeserBtn.textContent = t('installCaeserModProgress');
      try {
        const result = await api.installCaeserMod(p.id);
        if (model.detailId === p.id) { model.details = result; renderInstalled(); header(); }
        toast(t('caeserModInstalledSuccess'));
      } catch (err) { toast(err.message, true); header(); }
    });
  }

  const checkBtn = $('check-mod-updates');
  if (checkBtn) {
    checkBtn.onclick = async () => {
      const p = profile(); if (!p || p.mode === 'vanilla') return;
      checkBtn.disabled = true;
      checkBtn.classList.add('checking');
      try {
        await checkUpdatesForProfile(p.id, true);
        const updates = (model.details?.mods || []).filter(m => m.hasUpdate).length;
        if (updates > 0) {
          toast(currentLanguage === 'en' ? `${updates} ${t('modsUpdatesFound')}` : `${updates} ${t('modsUpdatesFound')}`);
        } else {
          toast(t('allModsUpToDate'));
        }
      } catch (err) {
        toast(err.message, true);
      } finally {
        checkBtn.disabled = false;
        checkBtn.classList.remove('checking');
      }
    };
  }

  const updateAllBtn = $('update-all-mods');
  if (updateAllBtn) {
    updateAllBtn.onclick = async () => {
      const p = profile(); if (!p) return;
      updateAllBtn.disabled = true;
      updateAllBtn.textContent = t('updating');
      try {
        const toUpdate = (model.details?.mods || []).filter(m => m.hasUpdate);
        for (const item of toUpdate) {
          try {
            model.details = await api.updateMod({ profileId: p.id, name: item.filename });
          } catch (e) {
            console.error('Update failed for', item.name, e);
          }
        }
        renderInstalled();
        await checkUpdatesForProfile(p.id);
        toast(t('allModsUpdatedSuccess'));
      } catch (err) {
        toast(err.message, true);
      } finally {
        updateAllBtn.disabled = false;
        renderInstalled();
      }
    };
  }

  document.addEventListener('language-change', () => {
    if (model.detailId) {
      header();
      renderInstalled();
      if ($('mods-drawer').open) {
        updateDrawerHeader();
        renderResults();
      }
    }
  });

  $('mods-drawer').addEventListener('close', () => { generation++; clearTimeout(timer); });
  $('mod-search').oninput = () => { generation++; clearTimeout(timer); $('mod-results').replaceChildren(element('p', 'mod-loading', t('searching'))); $('more-mods').hidden = true; timer = setTimeout(() => search(), 300); };
  document.querySelectorAll('[data-source]').forEach(button => button.onclick = () => {
    source = button.dataset.source; document.querySelectorAll('[data-source]').forEach(b => b.classList.toggle('selected', b === button)); search();
  });
  $('more-mods').onclick = () => search(true);
  api.on('mod-progress', event => { if (event.profileId === model.detailId && installing) $('mod-results-status').textContent = event.stage === 'done' ? (currentLanguage === 'en' ? 'Installation complete.' : 'Installation abgeschlossen.') : (currentLanguage === 'en' ? `Processing ${event.name} …` : `${event.name} wird verarbeitet …`); });
  api.on('game-exit', () => { document.body.classList.remove('in-game'); if (model.detailId) refresh(); });
  api.on('game-spawn', () => { document.body.classList.add('in-game'); });
}

