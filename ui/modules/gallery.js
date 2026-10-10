import { $, api, action, toast, bytesLabel, showConfirmDialog } from './common.js';
import { t } from './i18n.js';

let screenshotsList = [];
let currentRenamePath = null;
let currentLightboxItem = null;

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function updateGalleryCount() {
  const countBadge = $('gallery-count');
  if (countBadge) {
    countBadge.textContent = screenshotsList.length > 0 ? String(screenshotsList.length) : '';
  }
}

export async function loadScreenshots() {
  try {
    screenshotsList = (await api.getScreenshots()) || [];
    updateGalleryCount();
    renderGallery();
  } catch (err) {
    console.error('Failed to load screenshots:', err);
  }
}

function openRenameDialog(filePath, currentName) {
  currentRenamePath = filePath;
  const dialog = $('rename-screenshot-dialog');
  const input = $('rename-screenshot-input');
  if (input) {
    const baseName = (currentName || '').replace(/\.png$/i, '');
    input.value = baseName;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }
  if (dialog) dialog.showModal();
}

async function openLightbox(item) {
  currentLightboxItem = item;
  const dialog = $('screenshot-lightbox-dialog');
  const title = $('lightbox-title');
  const img = $('lightbox-img');

  if (title) title.textContent = item.name;
  if (img) {
    img.src = item.thumb || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }
  if (dialog) dialog.showModal();

  try {
    const fullData = await api.getScreenshotFull(item.path);
    if (img && currentLightboxItem?.path === item.path) {
      img.src = fullData;
    }
  } catch (err) {
    console.error('Failed to load full screenshot:', err);
  }
}

function renderGallery() {
  const grid = $('gallery-grid');
  const empty = $('gallery-empty');
  const searchInput = $('gallery-search');
  if (!grid) return;

  const query = (searchInput?.value || '').trim().toLowerCase();
  const filtered = query
    ? screenshotsList.filter(s => s.name.toLowerCase().includes(query))
    : screenshotsList;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  grid.innerHTML = '';

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'gallery-card';

    // Thumbnail container
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'gallery-thumb-wrap';

    const thumbImg = document.createElement('img');
    thumbImg.className = 'gallery-thumb-img';
    thumbImg.alt = item.name;
    thumbImg.loading = 'lazy';
    thumbImg.src = item.thumb || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    const zoomOverlay = document.createElement('div');
    zoomOverlay.className = 'gallery-zoom-overlay';
    zoomOverlay.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;

    thumbWrap.append(thumbImg, zoomOverlay);
    thumbWrap.onclick = () => openLightbox(item);

    // Card Details
    const details = document.createElement('div');
    details.className = 'gallery-card-details';

    const nameEl = document.createElement('div');
    nameEl.className = 'gallery-card-name';
    nameEl.textContent = item.name;

    const metaEl = document.createElement('div');
    metaEl.className = 'gallery-card-meta';
    metaEl.textContent = `${formatDateTime(item.mtime)} • ${bytesLabel(item.size)}`;

    details.append(nameEl, metaEl);

    // Card Actions
    const actions = document.createElement('div');
    actions.className = 'gallery-card-actions';

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'gallery-action-btn copy-btn';
    copyBtn.textContent = 'ᴄᴏᴘʏ';
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      action(async () => {
        await api.copyScreenshot(item.path);
        toast(t('screenshotCopied', 'Screenshot in die Zwischenablage kopiert!'));
      });
    };

    // Open button
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'gallery-action-btn open-btn';
    openBtn.textContent = 'ᴏᴘᴇɴ';
    openBtn.onclick = (e) => {
      e.stopPropagation();
      action(async () => {
        await api.openScreenshot(item.path);
      });
    };

    // Rename button
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'gallery-action-btn rename-btn';
    renameBtn.textContent = 'ʀᴇɴᴀᴍᴇ';
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      openRenameDialog(item.path, item.name);
    };

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'gallery-action-btn delete-btn';
    deleteBtn.textContent = 'ᴅᴇʟᴇᴛᴇ';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      action(async () => {
        const ok = await showConfirmDialog({
          title: t('deleteProfileTitle', 'Screenshot löschen?'),
          message: t('confirmDeleteScreenshot', 'Diesen Screenshot wirklich löschen?'),
          confirmText: t('btnDelete', 'ᴅᴇʟᴇᴛᴇ'),
          cancelText: t('cancel', 'Abbrechen'),
          isDanger: true
        });
        if (!ok) return;
        const targetPath = item.path;
        screenshotsList = screenshotsList.filter(s => s.path !== targetPath);
        updateGalleryCount();
        renderGallery();
        await api.deleteScreenshot(targetPath);
        toast(t('screenshotDeleted', 'Screenshot gelöscht.'));
      });
    };

    actions.append(copyBtn, openBtn, renameBtn, deleteBtn);
    card.append(thumbWrap, details, actions);
    grid.append(card);
  });
}

export function initGallery() {
  const searchInput = $('gallery-search');
  if (searchInput) {
    searchInput.oninput = () => renderGallery();
  }

  const openFolderBtn = $('gallery-open-folder');
  if (openFolderBtn) {
    openFolderBtn.onclick = () => action(() => api.openScreenshotsFolder());
  }

  const refreshBtn = $('gallery-refresh');
  if (refreshBtn) {
    refreshBtn.onclick = () => action(loadScreenshots);
  }

  const deleteAllBtn = $('gallery-delete-all');
  if (deleteAllBtn) {
    deleteAllBtn.onclick = () => {
      if (!screenshotsList.length) return;
      action(async () => {
        const ok = await showConfirmDialog({
          title: t('deleteAllScreenshots', 'Alle Screenshots löschen?'),
          message: t('confirmDeleteAllScreenshots', 'Möchtest du wirklich ALLE Screenshots löschen? Dies kann nicht rückgängig gemacht werden.'),
          confirmText: t('deleteAllScreenshots', 'Alle löschen'),
          cancelText: t('cancel', 'Abbrechen'),
          isDanger: true
        });
        if (!ok) return;
        screenshotsList = [];
        updateGalleryCount();
        renderGallery();
        await api.deleteAllScreenshots();
        toast(t('allScreenshotsDeleted', 'Alle Screenshots wurden gelöscht.'));
      });
    };
  }

  // Rename form handler
  const renameForm = $('rename-screenshot-form');
  if (renameForm) {
    renameForm.onsubmit = (e) => {
      e.preventDefault();
      const input = $('rename-screenshot-input');
      const newName = input ? input.value.trim() : '';
      if (!newName || !currentRenamePath) return;

      action(async () => {
        const res = await api.renameScreenshot(currentRenamePath, newName);
        $('rename-screenshot-dialog')?.close();
        if (res && res.path) {
          const it = screenshotsList.find(s => s.path === currentRenamePath);
          if (it) {
            it.name = res.name;
            it.path = res.path;
          }
        }
        renderGallery();
        toast(t('screenshotRenamed', 'Screenshot umbenannt.'));
      });
    };
  }

  // Lightbox actions
  const lbCopy = $('lightbox-copy');
  if (lbCopy) {
    lbCopy.onclick = () => {
      if (!currentLightboxItem) return;
      action(async () => {
        await api.copyScreenshot(currentLightboxItem.path);
        toast(t('screenshotCopied', 'Screenshot in die Zwischenablage kopiert!'));
      });
    };
  }

  const lbOpen = $('lightbox-open');
  if (lbOpen) {
    lbOpen.onclick = () => {
      if (!currentLightboxItem) return;
      action(() => api.openScreenshot(currentLightboxItem.path));
    };
  }

  const lbDelete = $('lightbox-delete');
  if (lbDelete) {
    lbDelete.onclick = () => {
      if (!currentLightboxItem) return;
      action(async () => {
        const ok = await showConfirmDialog({
          title: t('deleteProfileTitle', 'Screenshot löschen?'),
          message: t('confirmDeleteScreenshot', 'Diesen Screenshot wirklich löschen?'),
          confirmText: t('btnDelete', 'ᴅᴇʟᴇᴛᴇ'),
          cancelText: t('cancel', 'Abbrechen'),
          isDanger: true
        });
        if (!ok) return;
        const targetPath = currentLightboxItem.path;
        screenshotsList = screenshotsList.filter(s => s.path !== targetPath);
        updateGalleryCount();
        renderGallery();
        $('screenshot-lightbox-dialog')?.close();
        await api.deleteScreenshot(targetPath);
        toast(t('screenshotDeleted', 'Screenshot gelöscht.'));
      });
    };
  }

  document.addEventListener('language-change', () => {
    renderGallery();
  });

  // Auto-refresh when switching to gallery page or returning to window
  document.addEventListener('page-navigate', (e) => {
    if (e.detail === 'gallery') {
      loadScreenshots();
    }
  });

  window.addEventListener('focus', () => {
    const page = document.querySelector('.page.active');
    if (page?.id === 'page-gallery') {
      loadScreenshots();
    }
  });

  // Initial load
  loadScreenshots();
}
