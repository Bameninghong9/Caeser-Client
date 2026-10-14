// Capes-Seite: Galerie, eigene Uploads, Favoriten und Vanilla-Capes. Alle Daten kommen über IPC aus dem Hauptprozess;
// Bilder ausschließlich als PNG-Data-URL, die UI sieht keine Tokens und keine Dateipfade.
import { $, api, onState, action, toast, currentAccount, showAccounts, showConfirmDialog, getActiveSkinTexture } from './common.js';
import { SkinRenderer } from './skin-renderer.js';
import { icon } from './icons.js';
import { t, currentLanguage } from './i18n.js';

const DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const BACK_VIEW = Math.PI * 0.955; // Vorschau zeigt den Rücken, leicht schräg
const view = {
  tab: 'all', sort: 'popular', q: '', items: [], nextCursor: null, vanilla: null,
  me: null, config: null, favorites: new Set(), metaFor: null, accountId: undefined,
  loading: false, loadingMore: false, generation: 0, stale: true, previewKey: null
};
const images = new Map();
const upload = { info: null, mode: null, offsetX: 0.5, offsetY: 0.5, busy: false, cropTimer: null, cropGeneration: 0 };
let previewRenderer = null, uploadRenderer = null, searchTimer = null, reportTarget = null;

const fmt = (key, vars) => Object.entries(vars).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), t(key));
const number = value => Number(value || 0).toLocaleString(currentLanguage === 'en' ? 'en-US' : 'de-DE');
const usesLabel = uses => uses === 1 ? t('capesUse1') : fmt('capesUses', { n: number(uses) });
const pageActive = () => $('page-capes')?.classList.contains('active');
const isOwn = cape => view.tab === 'mine' || (Boolean(view.me?.name) && cape.ownerName === view.me.name);
const OFFLINE = 'Caeser-Server nicht erreichbar.';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function iconButton(className, name, label) {
  const button = el('button', className); button.type = 'button';
  button.innerHTML = icon(name); button.title = label; button.setAttribute('aria-label', label);
  return button;
}

// --- Bilder ---
function capeImage(key) {
  if (!images.has(key)) {
    const [type, id] = [key.slice(0, 1), key.slice(2)];
    const request = (type === 'v' ? api.capesImage({ vanilla: id }) : api.capesImage({ id }))
      .then(url => typeof url === 'string' && DATA_URL.test(url) ? url : null)
      .catch(() => { images.delete(key); return null; });
    images.set(key, request);
  }
  return images.get(key);
}
function setArt(node, key) {
  capeImage(key).then(url => { if (url && node.isConnected !== false) node.style.backgroundImage = `url("${url}")`; });
}

// --- Vorschau rechts ---
async function ensurePreview() {
  if (previewRenderer || !$('capes-preview-canvas')) return;
  previewRenderer = new SkinRenderer($('capes-preview-canvas'), { draggable: true, rotY: BACK_VIEW });
  previewRenderer.setSkin(await getActiveSkinTexture().catch(() => null));
}
function showPreview(key, title, meta) {
  if (!previewRenderer) return;
  view.previewKey = key;
  $('capes-preview-name').textContent = title || t('capesPreviewEmpty');
  $('capes-preview-meta').textContent = meta || '';
  if (!key) { previewRenderer.setCape(null); return; }
  capeImage(key).then(url => { if (view.previewKey === key) previewRenderer.setCape(url); });
}
function previewActive() {
  if (view.tab === 'vanilla') {
    const active = view.vanilla?.capes.find(c => c.active);
    showPreview(active ? `v:${active.id}` : null, active ? active.alias : t('capesNoCape'), active ? 'Minecraft' : '');
    return;
  }
  const active = view.items.find(c => c.id === view.me?.capeId);
  if (active) showPreview(`c:${active.id}`, active.name, active.ownerName ? fmt('capesByOwner', { name: active.ownerName }) : '');
  else if (view.me?.capeId) showPreview(`c:${view.me.capeId}`, t('capesActive'), '');
  else showPreview(null, t('capesPreviewEmpty'), t('capesPreviewHint'));
}

// --- Hinweise und Kopfzeilen ---
function showNotice(title, text = '', actionButton = null) {
  $('capes-notice').hidden = false;
  $('capes-notice-title').textContent = title;
  $('capes-notice-text').textContent = text;
  const button = $('capes-notice-action');
  button.hidden = !actionButton;
  if (actionButton) { button.textContent = actionButton.label; button.onclick = actionButton.run; }
}
const hideNotice = () => { $('capes-notice').hidden = true; };
function showError(error) {
  const message = error?.message || OFFLINE;
  if (message === OFFLINE) showNotice(t('capesOfflineTitle'), '', { label: t('capesRetry'), run: () => reload({ meta: true }) });
  else showNotice(message, '', { label: t('capesRetry'), run: () => reload({ meta: true }) });
}
function updateHeader() {
  $('capes-toolbar').hidden = view.tab !== 'all';
  const info = $('capes-info');
  if (view.tab === 'mine' && view.config?.maxTotal) { info.hidden = false; info.textContent = fmt('capesUploadsCount', { x: number(view.items.length), max: number(view.config.maxTotal) }); }
  else if (view.tab === 'vanilla') { info.hidden = false; info.textContent = t('capesVanillaHint'); }
  else info.hidden = true;
}

// --- Karten ---
function statusBadge(status) {
  const map = { pending: 'capesStatusPending', approved: 'capesStatusApproved', rejected: 'capesStatusRejected', removed: 'capesStatusRemoved' };
  return el('span', `cape-status ${map[status] ? status : 'pending'}`, t(map[status] || 'capesStatusPending'));
}
function heartButton(cape) {
  const favorite = view.favorites.has(cape.id) || cape.favorite === true;
  const button = iconButton('cape-heart' + (favorite ? ' active' : ''), 'heart', t(favorite ? 'capesFavoriteRemove' : 'capesFavoriteAdd'));
  button.setAttribute('aria-pressed', String(favorite));
  button.onclick = event => { event.stopPropagation(); toggleFavorite(cape, !favorite); };
  return button;
}
function capeCard(cape) {
  const active = view.me?.capeId === cape.id, own = isOwn(cape);
  const card = el('div', 'cape-card' + (active ? ' active' : '') + (cape.status === 'rejected' || cape.status === 'removed' ? ' rejected' : ''));
  card.dataset.capeId = cape.id; card.tabIndex = 0; card.setAttribute('role', 'button');
  card.setAttribute('aria-label', cape.name || cape.id);
  const art = el('div', 'cape-art-wrap'), image = el('div', 'cape-art');
  art.append(image); setArt(image, `c:${cape.id}`);
  const actions = el('div', 'cape-card-actions');
  if (cape.status === undefined || cape.status === 'approved') actions.append(heartButton(cape));
  const more = iconButton('cape-more-btn', 'more', t('capesMenu'));
  more.onclick = event => { event.stopPropagation(); const r = more.getBoundingClientRect(); openCardMenu(cape, r.right, r.bottom + 4, own); };
  actions.append(more);
  art.append(actions);
  if (active) art.append(el('span', 'cape-active-badge', t('capesActive')));
  const info = el('div', 'cape-card-info');
  info.append(el('strong', 'cape-card-name', cape.name || '–'));
  if (view.tab === 'mine') {
    const row = el('div', 'cape-card-row'); row.append(statusBadge(cape.status));
    if (cape.status === 'approved') row.append(el('small', '', usesLabel(cape.uses)));
    info.append(row);
    if (cape.status === 'removed' && cape.reason) info.append(el('small', 'cape-reason', cape.reason));
    if (cape.status === 'rejected') {
      if (cape.reason) info.append(el('small', 'cape-reason', cape.reason));
      if (cape.pricePaid) info.append(el('small', 'cape-refund', fmt('capesRefunded', { n: number(cape.pricePaid) })));
    }
  } else {
    if (cape.ownerName) info.append(el('small', 'cape-owner', fmt('capesByOwner', { name: cape.ownerName })));
    info.append(el('small', 'cape-uses', usesLabel(cape.uses)));
  }
  card.append(art, info);
  card.onpointerenter = () => showPreview(`c:${cape.id}`, cape.name, cape.ownerName ? fmt('capesByOwner', { name: cape.ownerName }) : '');
  card.onclick = () => { if (cape.status !== 'rejected' && cape.status !== 'removed') selectCape(cape); };
  card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); } };
  card.oncontextmenu = event => { event.preventDefault(); openCardMenu(cape, event.clientX, event.clientY, own); };
  return card;
}
function vanillaCard(cape) {
  const active = cape ? cape.active : !view.vanilla?.active;
  const card = el('div', 'cape-card vanilla' + (active ? ' active' : '') + (cape ? '' : ' none'));
  card.dataset.vanillaId = cape?.id || 'none'; card.tabIndex = 0; card.setAttribute('role', 'button');
  const art = el('div', 'cape-art-wrap');
  if (cape) { const image = el('div', 'cape-art'); art.append(image); setArt(image, `v:${cape.id}`); }
  else { const empty = el('div', 'cape-art-empty'); empty.innerHTML = icon('cape'); art.append(empty); }
  if (active) art.append(el('span', 'cape-active-badge', t('capesActive')));
  const info = el('div', 'cape-card-info');
  info.append(el('strong', 'cape-card-name', cape ? cape.alias : t('capesNoCape')));
  info.append(el('small', 'cape-owner', cape ? 'Minecraft' : t('capesNoCapeHint')));
  card.append(art, info);
  card.setAttribute('aria-label', cape ? cape.alias : t('capesNoCape'));
  card.onpointerenter = () => showPreview(cape ? `v:${cape.id}` : null, cape ? cape.alias : t('capesNoCape'), cape ? 'Minecraft' : '');
  card.onclick = () => selectVanilla(cape?.id || null);
  card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); } };
  return card;
}
function renderGrid() {
  const grid = $('capes-grid');
  grid.replaceChildren();
  updateHeader();
  if (!$('capes-notice').hidden) { $('capes-more').hidden = true; return; }
  if (view.tab === 'vanilla') {
    if (!view.vanilla) return;
    grid.append(vanillaCard(null), ...view.vanilla.capes.map(vanillaCard));
    if (!view.vanilla.capes.length) grid.append(el('p', 'capes-empty', t('capesEmptyVanilla')));
  } else {
    grid.append(...view.items.map(capeCard));
    if (!view.items.length && !view.loading) grid.append(el('p', 'capes-empty', t({ all: 'capesEmptyAll', mine: 'capesEmptyMine', favorites: 'capesEmptyFavorites' }[view.tab])));
  }
  $('capes-more').hidden = !(view.tab === 'all' && view.nextCursor);
  previewActive();
}

// --- Laden ---
async function loadMeta(force) {
  const account = currentAccount();
  if (!force && view.metaFor === account.id && view.me) return;
  const { config, me } = await api.capesConfig();
  view.config = config; view.me = me; view.metaFor = account.id;
  const favorites = await api.capesFavorites().catch(() => null);
  if (favorites) view.favorites = new Set(favorites.items.map(c => c.id));
}
async function reload({ meta = false } = {}) {
  const generation = ++view.generation;
  closeMenus();
  view.stale = false; view.items = []; view.nextCursor = null;
  await ensurePreview();
  if (!currentAccount()) {
    view.me = null; view.vanilla = null;
    showNotice(t('capesNoAccountTitle'), t('capesNoAccountText'), { label: t('capesSignIn'), run: showAccounts });
    renderGrid(); return;
  }
  hideNotice(); view.loading = true;
  $('capes-grid').replaceChildren(el('p', 'capes-empty', t('capesLoading')));
  try {
    if (view.tab === 'vanilla') {
      // Vanilla braucht nur Mojang; ohne Caeser-Server fehlt lediglich die Abwahl-Frage.
      await loadMeta(meta).catch(() => {});
      const vanilla = await api.vanillaCapes();
      if (generation !== view.generation) return;
      view.vanilla = vanilla;
    } else {
      await loadMeta(meta);
      const result = view.tab === 'all' ? await api.capesList({ sort: view.sort, q: view.q })
        : view.tab === 'mine' ? await api.capesMine() : await api.capesFavorites();
      if (generation !== view.generation) return;
      view.items = result.items; view.nextCursor = result.nextCursor || null;
      if (view.tab === 'favorites') view.favorites = new Set(result.items.map(c => c.id));
    }
  } catch (error) {
    if (generation !== view.generation) return;
    showError(error);
  } finally {
    if (generation === view.generation) { view.loading = false; renderGrid(); }
  }
}
async function loadMore() {
  if (view.tab !== 'all' || !view.nextCursor || view.loading || view.loadingMore) return;
  const generation = view.generation;
  view.loadingMore = true;
  try {
    const result = await api.capesList({ sort: view.sort, q: view.q, cursor: view.nextCursor });
    if (generation !== view.generation) return;
    const known = new Set(view.items.map(c => c.id));
    const fresh = result.items.filter(c => !known.has(c.id));
    view.items.push(...fresh); view.nextCursor = result.nextCursor || null;
    $('capes-grid').append(...fresh.map(capeCard));
    $('capes-more').hidden = !view.nextCursor;
  } catch (error) { toast(error.message, true); }
  finally { view.loadingMore = false; }
}

// --- Aktionen ---
function refreshActive() {
  document.querySelectorAll('#capes-grid .cape-card[data-cape-id]').forEach(card => {
    const active = card.dataset.capeId === view.me?.capeId;
    card.classList.toggle('active', active);
    const badge = card.querySelector('.cape-active-badge');
    if (active && !badge) card.querySelector('.cape-art-wrap').append(el('span', 'cape-active-badge', t('capesActive')));
    if (!active && badge) badge.remove();
  });
  previewActive();
}
async function selectCape(cape) {
  await action(async () => {
    const result = await api.capesSelect(cape.id);
    if (view.me) view.me.capeId = result.capeId; else view.me = { capeId: result.capeId };
    refreshActive(); toast(t('capesSelected'));
  });
}
async function deselectCape() {
  await action(async () => {
    const result = await api.capesSelect(null);
    if (view.me) view.me.capeId = result.capeId || null;
    refreshActive(); toast(t('capesDeselected'));
  });
}
async function toggleFavorite(cape, favorite) {
  await action(async () => {
    await api.capesFavorite(cape.id, favorite);
    if (favorite) view.favorites.add(cape.id); else view.favorites.delete(cape.id);
    cape.favorite = favorite;
    if (view.tab === 'favorites' && !favorite) { view.items = view.items.filter(c => c.id !== cape.id); renderGrid(); return; }
    const card = document.querySelector(`#capes-grid .cape-card[data-cape-id="${CSS.escape(cape.id)}"]`);
    card?.querySelector('.cape-heart')?.replaceWith(heartButton(cape));
  });
}
async function selectVanilla(id) {
  await action(async () => {
    view.vanilla = await api.vanillaCapeSelect(id);
    renderGrid();
    toast(t(id ? 'capesVanillaSet' : 'capesVanillaHidden'));
    if (id && view.me?.capeId) {
      const ok = await showConfirmDialog({ eyebrow: 'CAPES', title: t('capesVanillaDeselectTitle'), message: t('capesVanillaDeselectText'), confirmText: t('capesDeselect'), cancelText: t('capesLater'), isDanger: false });
      if (ok) await deselectCape();
    }
  });
}

// --- Menüs ---
function closeMenus() {
  for (const id of ['cape-card-menu']) { const menu = $(id); if (menu?.matches(':popover-open')) menu.hidePopover(); }
}
function placeMenu(menu, right, top) {
  menu.showPopover();
  const width = menu.offsetWidth, height = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, right - width))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, top))}px`;
}
function openCardMenu(cape, right, top, own) {
  const menu = $('cape-card-menu');
  closeMenus(); menu.replaceChildren();
  const add = (label, run, danger = false) => {
    const button = el('button', danger ? 'danger-item' : '', label); button.type = 'button'; button.setAttribute('role', 'menuitem');
    button.onclick = () => { menu.hidePopover(); run(); };
    menu.append(button);
  };
  if (own && view.me?.capeId === cape.id) add(t('capesDeselect'), deselectCape);
  add(t('capesReport'), () => openReport(cape), true);
  placeMenu(menu, right, top);
}
function openReport(cape) {
  reportTarget = cape;
  $('cape-report-reason').value = '';
  $('cape-report-dialog').showModal();
}

// --- Hochladen ---
function uploadValid() {
  const name = $('cape-name').value.trim();
  return !upload.busy && ['cape', 'photo'].includes(upload.mode) && name.length >= 1 && name.length <= 32 && $('cape-consent').checked;
}
const syncUploadButton = () => { $('cape-upload-submit').disabled = !uploadValid(); };
function uploadError(message) { const node = $('cape-upload-error'); node.hidden = !message; node.textContent = message || ''; }
function renderPrice() {
  const price = view.config?.uploadPrice ?? null;
  const parts = [];
  if (price !== null) parts.push(price === 0 ? t('capesFree') : fmt('capesPrice', { price: number(price) }));
  if (view.me && price !== 0) parts.push(fmt('capesBalanceShort', { n: number(view.me.jetons) }));
  $('cape-price').textContent = parts.join(' · ');
}
function placeFrame() {
  const frame = upload.info?.frame;
  if (!frame) return;
  const node = $('cape-crop-frame');
  node.style.width = `${frame.width * 100}%`; node.style.height = `${frame.height * 100}%`;
  node.style.left = `${(1 - frame.width) * upload.offsetX * 100}%`; node.style.top = `${(1 - frame.height) * upload.offsetY * 100}%`;
}
function requestCrop(delay = 0) {
  clearTimeout(upload.cropTimer);
  upload.cropTimer = setTimeout(async () => {
    const generation = ++upload.cropGeneration;
    try {
      const { cape } = await api.capesUploadCrop({ offsetX: upload.offsetX, offsetY: upload.offsetY });
      if (generation === upload.cropGeneration && DATA_URL.test(cape)) uploadRenderer?.setCape(cape);
    } catch (error) { uploadError(error.message); }
  }, delay);
}
function useAsFront() {
  upload.mode = 'photo';
  $('cape-photo-offer').hidden = true; $('cape-crop').hidden = false;
  $('cape-crop-image').src = upload.info.photo;
  placeFrame(); requestCrop(); syncUploadButton();
}
function bindCropDrag() {
  const frame = $('cape-crop-frame'), stage = $('cape-crop-stage');
  let drag = null;
  frame.addEventListener('pointerdown', event => {
    event.preventDefault();
    drag = { x: event.clientX, y: event.clientY, offsetX: upload.offsetX, offsetY: upload.offsetY };
    try { frame.setPointerCapture(event.pointerId); } catch {}
  });
  frame.addEventListener('pointermove', event => {
    if (!drag || !upload.info?.frame) return;
    const rect = stage.getBoundingClientRect(), { width, height } = upload.info.frame;
    const freeX = rect.width * (1 - width), freeY = rect.height * (1 - height);
    if (freeX > 0) upload.offsetX = Math.max(0, Math.min(1, drag.offsetX + (event.clientX - drag.x) / freeX));
    if (freeY > 0) upload.offsetY = Math.max(0, Math.min(1, drag.offsetY + (event.clientY - drag.y) / freeY));
    placeFrame(); requestCrop(150);
  });
  const end = () => { if (drag) { drag = null; requestCrop(); } };
  frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
}
async function startUpload() {
  if (!currentAccount()) { showAccounts(); return; }
  const info = await api.capesUploadPick();
  if (!info) return;
  Object.assign(upload, { info, mode: info.kind === 'cape' ? 'cape' : null, offsetX: 0.5, offsetY: 0.5, busy: false });
  $('cape-name').value = info.name || '';
  $('cape-consent').checked = false;
  $('cape-photo-offer').hidden = info.kind !== 'photo';
  $('cape-crop').hidden = true;
  $('cape-upload-submit-label').textContent = t('capesUpload');
  uploadError('');
  if (!uploadRenderer) uploadRenderer = new SkinRenderer($('cape-upload-canvas'), { draggable: true, rotY: BACK_VIEW });
  uploadRenderer.setSkin(await getActiveSkinTexture().catch(() => null));
  uploadRenderer.setCape(info.kind === 'cape' && DATA_URL.test(info.cape) ? info.cape : null);
  renderPrice(); syncUploadButton();
  $('cape-upload-dialog').showModal(); uploadRenderer.resume();
  // Preis und Kontostand frisch holen; ein Fehler zeigt sich spätestens beim Hochladen.
  api.capesConfig().then(({ config, me }) => { view.config = config; view.me = me; view.metaFor = currentAccount()?.id; renderPrice(); updateHeader(); }).catch(() => {});
}
async function submitUpload(event) {
  event.preventDefault();
  if (!uploadValid()) return;
  upload.busy = true; uploadError(''); syncUploadButton();
  $('cape-upload-submit-label').textContent = t('capesUploading');
  try {
    const result = await api.capesUploadConfirm({ name: $('cape-name').value.trim(), accepted: true, offsetX: upload.offsetX, offsetY: upload.offsetY });
    if (view.me) view.me.jetons = result.jetons;
    upload.info = null; upload.mode = null;
    $('cape-upload-dialog').close();
    toast(t('capesUploaded'));
    switchTab('mine');
    const ok = await showConfirmDialog({ eyebrow: 'CAPES', title: t('capesSelectNowTitle'), message: t('capesSelectNowText'), confirmText: t('capesSelectNow'), cancelText: t('capesLater'), isDanger: false });
    if (ok) await selectCape(result.cape);
  } catch (error) {
    uploadError(error.message);
  } finally {
    upload.busy = false;
    $('cape-upload-submit-label').textContent = t('capesUpload');
    syncUploadButton();
  }
}

function switchTab(tab) {
  view.tab = tab;
  document.querySelectorAll('[data-capes-tab]').forEach(button => {
    const active = button.dataset.capesTab === tab;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
  });
  reload();
}

export function initCapes() {
  if (!$('page-capes')) return;
  document.querySelectorAll('[data-capes-tab]').forEach(button => { button.onclick = () => switchTab(button.dataset.capesTab); });
  document.querySelectorAll('[data-capes-sort]').forEach(button => {
    button.onclick = () => {
      view.sort = button.dataset.capesSort;
      document.querySelectorAll('[data-capes-sort]').forEach(b => b.classList.toggle('active', b === button));
      reload();
    };
  });
  $('capes-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { view.q = $('capes-search').value.trim().slice(0, 64); reload(); }, 300);
  });
  $('capes-upload-button').onclick = () => action(startUpload);
  $('cape-name').addEventListener('input', syncUploadButton);
  $('cape-consent').addEventListener('change', syncUploadButton);
  $('cape-use-front').onclick = useAsFront;
  $('cape-upload-form').onsubmit = submitUpload;
  $('cape-upload-dialog').addEventListener('close', () => {
    uploadRenderer?.pause();
    if (upload.info) { upload.info = null; upload.mode = null; api.capesUploadCancel().catch(() => {}); }
  });
  bindCropDrag();
  $('cape-report-form').onsubmit = event => {
    event.preventDefault();
    const reason = $('cape-report-reason').value.trim();
    if (!reportTarget || reason.length < 3) { $('cape-report-reason').focus(); return; }
    action(async () => {
      await api.capesReport(reportTarget.id, reason);
      $('cape-report-dialog').close(); toast(t('capesReported'));
    });
  };
  // Unendliches Nachladen in der Galerie
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) loadMore(); }, { root: document.querySelector('.content'), rootMargin: '300px' }).observe($('capes-more'));
  }
  document.addEventListener('page-navigate', event => {
    if (event.detail !== 'capes') { closeMenus(); return; }
    if (view.stale) reload(); else previewRenderer?.resume();
  });
  // Kontowechsel: anderer Kontostand, andere Auswahl, andere Vanilla-Capes
  onState(() => {
    const id = currentAccount()?.id || null;
    if (id === view.accountId) return;
    view.accountId = id; view.me = null; view.metaFor = null; view.vanilla = null; view.favorites = new Set();
    for (const key of [...images.keys()]) if (key.startsWith('v:')) images.delete(key);
    if (previewRenderer) getActiveSkinTexture().then(skin => previewRenderer.setSkin(skin)).catch(() => {});
    if (pageActive()) reload(); else view.stale = true;
  });
  document.addEventListener('language-change', () => { if (pageActive() && !view.loading) renderGrid(); });
}
