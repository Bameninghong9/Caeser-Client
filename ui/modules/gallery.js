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

let currentZoom = 1.0;
let isPanning = false;
let startX = 0;
let startY = 0;
let panX = 0;
let panY = 0;

function updateZoomTransform() {
  const img = $('lightbox-img');
  if (!img) return;
  img.style.transition = isPanning ? 'none' : 'transform 0.08s ease-out';
  img.style.transform = `scale(${currentZoom}) translate(${panX}px, ${panY}px)`;
  const badge = $('lightbox-zoom-badge');
  if (badge) {
    badge.textContent = `${Math.round(currentZoom * 100)}%`;
  }
}

function resetZoom() {
  currentZoom = 1.0;
  panX = 0;
  panY = 0;
  isPanning = false;
  const img = $('lightbox-img');
  if (img) {
    img.style.transition = 'transform 0.15s ease-out';
    img.style.transform = 'scale(1) translate(0px, 0px)';
    img.style.cursor = 'default';
  }
  const badge = $('lightbox-zoom-badge');
  if (badge) {
    badge.textContent = '100%';
  }
}

function updateLightboxNavButtons() {
  const prevBtn = $('lightbox-prev-btn');
  const nextBtn = $('lightbox-next-btn');
  const hasMultiple = screenshotsList && screenshotsList.length > 1;
  if (prevBtn) prevBtn.style.display = hasMultiple ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = hasMultiple ? 'flex' : 'none';
}

function navigateLightbox(direction) {
  if (!screenshotsList || screenshotsList.length <= 1) return;
  const currentPath = currentLightboxItem?.path;
  const currentIndex = screenshotsList.findIndex(s => s.path === currentPath);
  let nextIndex = 0;
  if (currentIndex !== -1) {
    nextIndex = (currentIndex + direction + screenshotsList.length) % screenshotsList.length;
  }
  openLightbox(screenshotsList[nextIndex]);
}

async function openLightbox(item) {
  if (!item) return;
  currentLightboxItem = item;
  resetZoom();
  const dialog = $('screenshot-lightbox-dialog');
  const title = $('lightbox-title');
  const img = $('lightbox-img');

  if (title) title.textContent = item.name;
  if (img) {
    img.src = item.thumb || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }
  updateLightboxNavButtons();
  if (dialog && !dialog.open) dialog.showModal();

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
    copyBtn.textContent = 'COPY';
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      action(async () => {
        await api.copyScreenshot(item.path);
        toast('Screenshot copied to Clipboard');
      });
    };

    // Open button
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'gallery-action-btn open-btn';
    openBtn.textContent = 'OPEN';
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
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>`;
    deleteBtn.setAttribute('aria-label', t('btnDelete', 'Löschen'));
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
        toast('Screenshot deleted');
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
        toast('Screenshot copied to Clipboard');
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
        toast('Screenshot deleted');
      });
    };
  }

  // Lightbox zoom with mouse wheel and drag-to-pan
  const lbWrap = document.querySelector('.lightbox-img-wrap');
  const lbImg = $('lightbox-img');
  const lbDialog = $('screenshot-lightbox-dialog');
  const lbBadge = $('lightbox-zoom-badge');
  const lbPrev = $('lightbox-prev-btn');
  const lbNext = $('lightbox-next-btn');

  if (lbBadge) {
    lbBadge.onclick = () => resetZoom();
  }

  if (lbPrev) {
    lbPrev.onclick = (e) => {
      e.stopPropagation();
      navigateLightbox(-1);
    };
  }

  if (lbNext) {
    lbNext.onclick = (e) => {
      e.stopPropagation();
      navigateLightbox(1);
    };
  }

  if (lbDialog) {
    lbDialog.addEventListener('close', () => resetZoom());

    // Click outside lightbox dialog (on window/backdrop) to close
    let mouseDownOnBackdrop = false;

    lbDialog.addEventListener('mousedown', (e) => {
      if (e.target === lbDialog) {
        const rect = lbDialog.getBoundingClientRect();
        const isOutside = (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        );
        mouseDownOnBackdrop = isOutside;
      } else {
        mouseDownOnBackdrop = false;
      }
    });

    lbDialog.addEventListener('click', (e) => {
      if (isPanning) return;
      if (e.target === lbDialog && mouseDownOnBackdrop) {
        const rect = lbDialog.getBoundingClientRect();
        const isOutside = (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        );
        if (isOutside) {
          lbDialog.close();
        }
      }
      mouseDownOnBackdrop = false;
    });

    // Wheel zoom on the lightbox dialog (works whenever hovering anywhere in dialog except buttons)
    lbDialog.addEventListener('wheel', (e) => {
      if (!lbDialog.open) return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      e.stopPropagation();

      const zoomFactor = e.deltaY < 0 ? 1.18 : 0.85;
      const nextZoom = Math.min(Math.max(currentZoom * zoomFactor, 0.5), 10.0);
      if (nextZoom <= 1.0) {
        currentZoom = 1.0;
        panX = 0;
        panY = 0;
      } else {
        currentZoom = nextZoom;
      }
      if (lbImg) {
        lbImg.style.cursor = currentZoom > 1.0 ? (isPanning ? 'grabbing' : 'grab') : 'default';
      }
      updateZoomTransform();
    }, { passive: false });
  }

  if (lbWrap && lbImg) {
    // Drag to pan when zoomed
    lbWrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || currentZoom <= 1.0) return;
      if (e.target.closest('button')) return;
      isPanning = true;
      startX = e.clientX - panX * currentZoom;
      startY = e.clientY - panY * currentZoom;
      lbImg.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      panX = (e.clientX - startX) / currentZoom;
      panY = (e.clientY - startY) / currentZoom;
      updateZoomTransform();
    });

    window.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false;
        if (lbImg) lbImg.style.cursor = currentZoom > 1.0 ? 'grab' : 'default';
      }
    });

    // Double-click to reset zoom
    lbWrap.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      resetZoom();
    });
  }

  // Keyboard navigation for Lightbox (Left / Right Arrow)
  window.addEventListener('keydown', (e) => {
    if (!lbDialog || !lbDialog.open) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateLightbox(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateLightbox(1);
    }
  });

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
