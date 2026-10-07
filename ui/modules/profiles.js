import { $, api, model, update, onState, action, toast, loaderName, navigate, openDetails, relativeTime } from './common.js';
import { icon } from './icons.js';
let editing = null, selectedLoader = 'vanilla', pendingDelete = null, saving = false;
let profileFilter = 'all';
const supportsFabric = version => !/^(old_|[abc]\d)/.test(version) && (!/^1\.(\d+)/.test(version) || Number(version.match(/^1\.(\d+)/)[1]) >= 14);
function versions() {
  const selected = $('profile-version').value || editing?.version || '1.21.11';
  const list = model.versions.filter(v => $('show-snapshots').checked || v.type === 'release');
  $('profile-version').replaceChildren();
  if (editing && !list.some(v => v.id === editing.version)) list.unshift({ id: editing.version });
  for (const v of list) { const option = document.createElement('option'); option.value = v.id; option.textContent = v.id; $('profile-version').append(option); }
  if (list.some(v => v.id === selected)) $('profile-version').value = selected;
  $('version-state').textContent = model.catalogueReady ? `${list.length} Versionen` : 'Versionsliste nicht geladen';
  $('save-profile').disabled = !editing && !model.catalogueReady;
  refreshLoaders();
}
function refreshLoaders() {
  const version = $('profile-version').value;
  if (!editing && selectedLoader === 'fabric' && !supportsFabric(version)) selectedLoader = 'vanilla';
  document.querySelectorAll('[data-loader]').forEach(button => {
    const mode = button.dataset.loader;
    button.disabled = !!editing || (mode === 'fabric' && !supportsFabric(version));
    button.classList.toggle('selected', mode === selectedLoader); button.setAttribute('aria-pressed', mode === selectedLoader);
  });
  $('loader-note').textContent = { vanilla: 'Vanilla ohne zusätzliche Mods.', fabric: 'Fabric Loader. Eigene Mods kommen in den Profilordner.' }[selectedLoader] || '';
}
function memory() {
  const amount = Number($('profile-memory').value);
  const minimum = Number($('profile-memory').min), maximum = Number($('profile-memory').max);
  $('profile-memory').style.setProperty('--ram-fill', `${maximum === minimum ? 100 : (amount-minimum)/(maximum-minimum)*100}%`);
  $('profile-memory-value').replaceChildren(document.createTextNode(`${amount} MB `));
  const gb = document.createElement('small'); gb.textContent = `(${(amount / 1024).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB)`;
  $('profile-memory-value').append(gb);
}
export function openProfile(profile = null) {
  editing = profile; selectedLoader = profile?.mode || 'vanilla';
  $('profile-name').value = profile?.name || '';
  $('profile-dialog-title').textContent = profile ? 'Profil bearbeiten' : 'Profil erstellen';
  $('save-profile').textContent = profile ? 'Speichern' : 'Profil erstellen';
  $('profile-error').hidden = true; $('profile-edit-note').hidden = !profile;
  $('profile-version').disabled = !!profile; $('show-snapshots').disabled = !!profile;
  $('show-snapshots').checked = profile ? model.versions.find(v => v.id === profile.version)?.type !== 'release' : false;
  $('profile-version').replaceChildren(); versions();
  if (profile) $('profile-version').value = profile.version; else $('profile-version').value = model.versions.some(v => v.id === '1.21.11') ? '1.21.11' : $('profile-version').value;
  refreshLoaders();
  $('profile-memory').max = model.state.maxMemoryMb; $('profile-memory').value = profile?.memoryMb || Math.min(4096, model.state.maxMemoryMb);
  $('ram-max').textContent = `${model.state.maxMemoryMb} MB`; $('ram-recommendation').textContent = `${Math.min(4096, model.state.maxMemoryMb)} MB`; memory();
  $('profile-dialog').showModal(); $('profile-name').focus();
}
function renderProfiles() {
  const { profiles, activeProfileId } = model.state;
  $('profile-count').textContent = profiles.length; const grid = $('profiles-grid'); grid.replaceChildren();
  if (!profiles.length) { $('profiles-result-count').textContent = '0 Profiles'; grid.innerHTML = '<div class="empty"><h3>Platz für deine nächste Welt.</h3><p>Erstelle oben dein erstes Profil.</p></div>'; return; }
  const query=$('profile-search').value.trim().toLowerCase();
  const filtered=profiles.filter(p=>(profileFilter === 'all' || p.mode === profileFilter) && `${p.name} ${p.version} ${loaderName(p.mode)}`.toLowerCase().includes(query));
  $('profiles-result-count').textContent=`${filtered.length} Profiles`;
  if (!filtered.length) grid.innerHTML='<div class="empty"><h3>Kein passendes Profil.</h3><p>Versuche einen anderen Namen oder Filter.</p></div>';
  for (const profile of filtered) {
    const card = document.createElement('article'); card.className = 'profile-card'; card.classList.toggle('active', profile.id === activeProfileId);
    card.tabIndex=0; card.setAttribute('aria-label',`Profil ${profile.name} öffnen`);
    card.innerHTML = `<div class="profile-cover"><img alt=""><span class="badge"></span><span class="active-badge">✓</span></div><div class="profile-body"><h3></h3><p></p><small class="profile-last"></small></div><div class="profile-actions"><button class="secondary select-profile"></button><button class="icon-button edit-profile" aria-label="Profil bearbeiten">${icon('edit')}</button><button class="icon-button delete-profile" aria-label="Profil entfernen">${icon('trash')}</button></div>`;
    card.querySelector('img').src = `assets/loaders/${profile.mode}.svg`;
    card.querySelector('.badge').textContent = loaderName(profile.mode);
    card.querySelector('.active-badge').hidden = profile.id !== activeProfileId;
    card.querySelector('h3').textContent = profile.name; card.querySelector('h3').title = profile.name;
    card.querySelector('.profile-body p').textContent = `${profile.version} · ${loaderName(profile.mode)} · ${profile.memoryMb/1024} GB`;
    card.querySelector('.profile-last').textContent=relativeTime(profile.lastPlayedAt);
    card.querySelector('.select-profile').textContent = profile.id === activeProfileId ? '▶ Spielen' : 'Auswählen';
    card.querySelector('.select-profile').onclick = () => action(async () => { update(await api.selectProfile(profile.id)); navigate('play'); });
    card.querySelector('.edit-profile').onclick = () => openProfile(profile);
    card.querySelector('.delete-profile').onclick = () => { pendingDelete = profile.id; $('delete-description').textContent = `„${profile.name}“ wird aus deiner Profilliste entfernt.`; $('delete-dialog').showModal(); };
    card.onclick=event=>{if(!event.target.closest('button')) openDetails(profile.id);};
    card.onkeydown=event=>{if(event.target === card && ['Enter',' '].includes(event.key)){event.preventDefault();openDetails(profile.id);}};
    grid.append(card);
  }
}
export function initProfiles() {
  onState(renderProfiles); document.addEventListener('catalogue-change', () => { if ($('profile-dialog').open) versions(); });
  $('profile-search').oninput=renderProfiles;
  document.querySelectorAll('[data-profile-filter]').forEach(button=>button.onclick=()=>{profileFilter=button.dataset.profileFilter;document.querySelectorAll('[data-profile-filter]').forEach(b=>b.classList.toggle('selected',b===button));renderProfiles();});
  $('new-profile').onclick = () => openProfile(); $('first-profile').onclick = () => openProfile();
  $('profile-version').onchange = refreshLoaders; $('show-snapshots').onchange = versions; $('profile-memory').oninput = memory;
  document.querySelectorAll('[data-loader]').forEach(button => button.onclick = () => { selectedLoader = button.dataset.loader; refreshLoaders(); });
  $('profile-dialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('profile-form').onsubmit = async event => {
    event.preventDefault(); if (saving) return; saving = true; $('save-profile').disabled = true; $('profile-error').hidden = true;
    $('profile-dialog').querySelectorAll('[data-close]').forEach(b => b.disabled = true);
    try {
      update(await api.saveProfile({ ...(editing ? { id: editing.id } : {}), name: $('profile-name').value,
        version: $('profile-version').value, mode: selectedLoader, memoryMb: Number($('profile-memory').value) }));
      $('profile-dialog').close(); toast(editing ? 'Profil gespeichert.' : 'Profil erstellt.');
    } catch (error) { $('profile-error').textContent = error.message; $('profile-error').hidden = false; }
    finally { saving = false; $('save-profile').disabled = false; $('profile-dialog').querySelectorAll('[data-close]').forEach(b => b.disabled = false); }
  };
  $('confirm-delete').onclick = () => action(async () => { update(await api.removeProfile(pendingDelete)); $('delete-dialog').close(); toast('Profil entfernt. Spieldateien bleiben erhalten.'); });
}
