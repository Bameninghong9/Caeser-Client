import { $, api, model, update, onState, action, toast, currentAccount, getActiveSkinTexture } from './common.js';
import { renderSkinSnapshot, SkinRenderer } from './skin-renderer.js';
import { t } from './i18n.js';

let renamingSkinId = null;
let renamingSkinVariant = 'classic';

function syncModelPillsUI() {
  const classicBtn = $('skin-model-classic');
  const slimBtn = $('skin-model-slim');
  if (classicBtn) classicBtn.classList.toggle('active', renamingSkinVariant === 'classic');
  if (slimBtn) slimBtn.classList.toggle('active', renamingSkinVariant === 'slim');
}

function openRenameDialog(id, currentName, currentVariant = 'classic') {
  renamingSkinId = id;
  renamingSkinVariant = (currentVariant === 'slim' || currentVariant === 'classic') ? currentVariant : 'classic';
  const dialog = $('rename-skin-dialog');
  const input = $('rename-skin-input');
  if (input) {
    input.value = currentName;
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }
  syncModelPillsUI();
  if (dialog) dialog.showModal();
}

export async function detectSkinVariant(textureSrc) {
  if (!textureSrc) return 'classic';
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        if (img.width !== 64 || img.height !== 64) {
          resolve('classic');
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const p1 = ctx.getImageData(54, 20, 1, 1).data;
        const p2 = ctx.getImageData(55, 20, 1, 1).data;
        if (p1[3] === 0 && p2[3] === 0) {
          resolve('slim');
        } else {
          resolve('classic');
        }
      } catch {
        resolve('classic');
      }
    };
    img.onerror = () => resolve('classic');
    img.src = textureSrc;
  });
}

function createSkinWindowCard({ id, name, subtitle, isActive, canDelete, canRename, skinTexture, variant }) {
  const card = document.createElement('div');
  card.className = 'skin-card skin-window-card' + (isActive ? ' active' : '');
  card.dataset.skinId = id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${name} (${isActive ? t('activeBadge') : t('selectSkin')})`);

  let effectiveVariant = (variant === 'slim' || variant === 'classic') ? variant : null;

  // Character preview box
  const preview = document.createElement('div');
  preview.className = 'skin-window-preview';

  // Snapshot placeholder
  const img = document.createElement('img');
  img.className = 'skin-window-snapshot';
  img.alt = name;
  img.loading = 'lazy';
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  preview.append(img);

  // Render 3D pose snapshot asynchronously
  renderSkinSnapshot(skinTexture).then(src => {
    if (src && card.isConnected) {
      img.src = src;
    }
  });

  // Top right actions: Pencil (rename/model), Cloud (sync to Mojang), & Trash (delete)
  const actions = document.createElement('div');
  actions.className = 'skin-window-actions';

  if (canRename) {
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'skin-action-btn edit-name';
    renameBtn.title = t('renameSkin', 'Skin anpassen (Name & Modell)');
    renameBtn.setAttribute('aria-label', t('renameSkin', 'Skin anpassen'));
    renameBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    renameBtn.onclick = async (e) => {
      e.stopPropagation();
      let v = effectiveVariant;
      if (!v && skinTexture) {
        v = await detectSkinVariant(skinTexture);
        effectiveVariant = v;
      }
      openRenameDialog(id, name, v || 'classic');
    };
    actions.append(renameBtn);
  }

  if (id !== 'account') {
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'skin-action-btn upload-skin';
    uploadBtn.title = 'Auf Minecraft-Account anwenden (für alle Spieler sichtbar)';
    uploadBtn.setAttribute('aria-label', 'Auf Minecraft-Account anwenden');
    uploadBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="m12 13-3-3m0 0-3 3m3-3v8"/></svg>`;
    uploadBtn.onclick = (e) => {
      e.stopPropagation();
      action(async () => {
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = '0.5';
        toast('Skin wird bei Mojang für deinen Account hochgeladen...', false);
        const curVariant = effectiveVariant || await detectSkinVariant(skinTexture);
        const res = await api.uploadSkinToAccount(id, curVariant);
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '';
        if (res?.uploaded) {
          toast(`✓ "${name}" (${curVariant === 'slim' ? 'Slim' : 'Classic'}) ist jetzt offiziell bei Mojang aktiv & für alle Spieler sichtbar!`);
        } else if (res?.reset) {
          toast('✓ Skin bei Mojang auf Standard zurückgesetzt.');
        } else if (res?.error) {
          toast(res.error, true);
        } else {
          toast(`Skin bei Mojang aktualisiert.`);
        }
      });
    };
    actions.append(uploadBtn);
  }

  if (canDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'skin-action-btn delete-skin';
    deleteBtn.title = t('deleteSkin');
    deleteBtn.setAttribute('aria-label', t('deleteSkin'));
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>`;
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      action(async () => {
        update(await api.removeSkin(id));
        toast('Skin gelöscht.');
      });
    };
    actions.append(deleteBtn);
  }

  if (actions.children.length > 0) {
    preview.append(actions);
  }

  if (isActive) {
    const activeTag = document.createElement('div');
    activeTag.className = 'skin-active-tag';
    activeTag.textContent = '✓';
    preview.append(activeTag);
  }

  // Bottom info area
  const info = document.createElement('div');
  info.className = 'skin-window-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'skin-window-name';
  nameEl.textContent = name;
  nameEl.title = name;

  const metaRow = document.createElement('div');
  metaRow.className = 'skin-window-meta';

  const badge = document.createElement('span');
  badge.className = 'skin-variant-badge ' + (effectiveVariant === 'slim' ? 'slim' : 'classic');
  badge.textContent = effectiveVariant === 'slim' ? 'Slim 3px' : 'Classic 4px';
  metaRow.append(badge);

  if (!effectiveVariant && skinTexture) {
    detectSkinVariant(skinTexture).then(detected => {
      effectiveVariant = detected;
      if (card.isConnected) {
        badge.className = 'skin-variant-badge ' + (detected === 'slim' ? 'slim' : 'classic');
        badge.textContent = detected === 'slim' ? 'Slim 3px' : 'Classic 4px';
      }
    });
  }

  info.append(nameEl, metaRow);
  card.append(preview, info);

  // Click on card selects it immediately & syncs with Mojang
  card.onclick = () => {
    action(async () => {
      toast('Skin wird ausgewählt und synchronisiert...', false);
      const curVariant = effectiveVariant || await detectSkinVariant(skinTexture);
      const res = await api.selectSkin(id, curVariant);
      update(res);
      if (res?.uploadResult?.uploaded) {
        toast(`✓ ${name} (${curVariant === 'slim' ? 'Slim' : 'Classic'}) ausgewählt & offiziell auf Minecraft-Account übertragen (für alle sichtbar)!`);
      } else if (res?.uploadResult?.reset) {
        toast('✓ Skin auf Standard zurückgesetzt.');
      } else if (res?.uploadResult?.error) {
        toast(`${name} lokal aktiv. (${res.uploadResult.error})`);
      } else {
        toast(`${name} ausgewählt.`);
      }
    });
  };

  card.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.click();
    }
  };

  return card;
}

async function renderSkins() {
  const skinsPage = $('page-skins');
  if (!skinsPage) return;

  const state = model.state;
  const activeSkinId = state?.settings?.activeSkinId || 'account';
  const customSkins = state?.skins || [];
  const account = currentAccount();
  const hiddenSkins = state?.settings?.hiddenSkins || [];
  const skinNames = state?.settings?.skinNames || {};
  const skinVariants = state?.settings?.skinVariants || {};

  // Render skins library grid
  const grid = $('skins-grid');
  if (!grid) return;
  grid.replaceChildren();

  // 1. Classic Steve
  if (!hiddenSkins.includes('steve')) {
    grid.append(createSkinWindowCard({
      id: 'steve',
      name: skinNames.steve || t('steveSkin'),
      isActive: activeSkinId === 'steve',
      canDelete: true,
      canRename: true,
      skinTexture: 'assets/skins/steve.png',
      variant: skinVariants.steve || 'classic'
    }));
  }

  // 2. Microsoft Account skin (if account exists)
  if (account && !hiddenSkins.includes('account')) {
    const avatarData = await api.accountAvatar(account.id).catch(() => null);
    grid.append(createSkinWindowCard({
      id: 'account',
      name: skinNames.account || account.name,
      isActive: activeSkinId === 'account',
      canDelete: true,
      canRename: true,
      skinTexture: avatarData?.skin || null,
      variant: skinVariants.account || null
    }));
  }

  // 3. Custom skins
  for (const s of customSkins) {
    grid.append(createSkinWindowCard({
      id: s.id,
      name: s.name,
      isActive: activeSkinId === s.id,
      canDelete: true,
      canRename: true,
      skinTexture: s.data,
      variant: s.variant
    }));
  }

  // Also update cosmetics preview if cosmetics view is active
  updateCosmeticsStudio();
}

let cosmeticsRenderer = null;

async function updateCosmeticsStudio() {
  const canvas = $('cosmetics-preview-canvas');
  if (!canvas) return;
  if (!cosmeticsRenderer) {
    cosmeticsRenderer = new SkinRenderer(canvas);
  }

  try {
    const texture = await getActiveSkinTexture();
    cosmeticsRenderer.setSkin(texture);
  } catch {
    cosmeticsRenderer.setSkin(null);
  }

  const cosmetics = model.state?.settings?.cosmetics || {
    wings: { type: 'none', color: '#a855f7' },
    head: { type: 'none', color: '#facc15' },
    pet: { type: 'none', color: '#38bdf8' }
  };

  cosmeticsRenderer.setCosmetics(cosmetics);
  syncCosmeticsUI(cosmetics);
}

function syncCosmeticsUI(cosmetics) {
  // Wings
  document.querySelectorAll('[data-category="wings"] .cosmetic-tile').forEach(tile => {
    tile.classList.toggle('active', tile.dataset.type === (cosmetics.wings?.type || 'none'));
  });

  // Head
  document.querySelectorAll('[data-category="head"] .cosmetic-tile').forEach(tile => {
    tile.classList.toggle('active', tile.dataset.type === (cosmetics.head?.type || 'none'));
  });

  // Pet
  document.querySelectorAll('[data-category="pet"] .cosmetic-tile').forEach(tile => {
    tile.classList.toggle('active', tile.dataset.type === (cosmetics.pet?.type || 'none'));
  });
  const petType = cosmetics.pet?.type || 'none';
  const customRow = $('pet-custom-row');
  if (customRow) customRow.hidden = petType !== 'custom';

  const playerInput = $('pet-custom-player-input');
  if (playerInput && playerInput.value !== (cosmetics.pet?.customPlayer || '')) {
    if (document.activeElement !== playerInput) {
      playerInput.value = cosmetics.pet?.customPlayer || '';
    }
  }
}

async function saveCosmetics(patch) {
  const current = model.state?.settings?.cosmetics || {
    wings: { type: 'none' },
    head: { type: 'none' },
    pet: { type: 'none', customPlayer: '', customSkinUrl: '' }
  };
  const next = {
    wings: { ...current.wings, ...patch.wings },
    head: { ...current.head, ...patch.head },
    pet: { ...current.pet, ...patch.pet }
  };
  action(async () => {
    const saveFn = api.settings || api.updateSettings;
    update(await saveFn({ cosmetics: next }));
    if (cosmeticsRenderer) cosmeticsRenderer.setCosmetics(next);
  });
}

async function applyCustomPet() {
  const input = $('pet-custom-player-input');
  const status = $('pet-custom-status');
  const applyBtn = $('pet-custom-player-apply');
  if (!input) return;
  const username = input.value.trim();
  if (!username) {
    if (status) {
      status.textContent = 'Bitte einen Spielernamen eingeben.';
      status.className = 'pet-custom-status error';
    }
    return;
  }
  if (applyBtn) applyBtn.disabled = true;
  if (status) {
    status.textContent = `Lade Skin von "${username}" …`;
    status.className = 'pet-custom-status loading';
  }
  try {
    const res = await api.playerSkinGet(username);
    if (res?.dataUrl) {
      if (status) {
        status.textContent = `✓ Skin von "${username}" geladen!`;
        status.className = 'pet-custom-status success';
      }
      await saveCosmetics({
        pet: {
          type: 'custom',
          customPlayer: username,
          customSkinUrl: res.dataUrl
        }
      });
      if (cosmeticsRenderer) {
        cosmeticsRenderer.setPetSkin(res.dataUrl);
      }
      toast(`Skin von "${username}" als Begleiter ausgerüstet!`);
    }
  } catch (err) {
    if (status) {
      status.textContent = `Fehler: ${err.message || 'Skin konnte nicht geladen werden'}`;
      status.className = 'pet-custom-status error';
    }
  } finally {
    if (applyBtn) applyBtn.disabled = false;
  }
}

export function initSkins() {
  onState(renderSkins);

  // Subnav tabs (Skins vs 3D-Cosmetics)
  document.querySelectorAll('.skins-nav-tab').forEach(tab => {
    tab.onclick = () => {
      const mode = tab.dataset.skinsTab;
      document.querySelectorAll('.skins-nav-tab').forEach(t => t.classList.toggle('active', t === tab));
      const libView = $('skins-view-library');
      const cosView = $('skins-view-cosmetics');
      const actions = $('skins-toolbar-actions');
      if (libView) libView.hidden = mode !== 'library';
      if (cosView) cosView.hidden = mode !== 'cosmetics';
      if (actions) actions.hidden = mode !== 'library';
      if (mode === 'cosmetics') {
        updateCosmeticsStudio();
      }
    };
  });

  // Cosmetic Option Tiles
  document.querySelectorAll('.cosmetic-tile').forEach(tile => {
    tile.onclick = () => {
      const category = tile.closest('[data-category]')?.dataset.category;
      const type = tile.dataset.type;
      if (!category) return;
      if (category === 'pet' && type === 'custom') {
        const customRow = $('pet-custom-row');
        if (customRow) customRow.hidden = false;
        const input = $('pet-custom-player-input');
        if (input && !input.value.trim()) {
          input.focus();
        } else if (input && input.value.trim()) {
          applyCustomPet();
          return;
        }
        saveCosmetics({ pet: { type: 'custom' } });
        return;
      }
      saveCosmetics({ [category]: { type } });
    };
  });

  // Custom Player Apply & Keydown
  const customPlayerInput = $('pet-custom-player-input');
  const customPlayerApply = $('pet-custom-player-apply');
  if (customPlayerApply) {
    customPlayerApply.onclick = () => applyCustomPet();
  }
  if (customPlayerInput) {
    customPlayerInput.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCustomPet();
      }
    };
  }

  const addBtn = $('add-skin-button');
  const fileInput = $('skin-file-input');

  if (addBtn) {
    addBtn.onclick = () => action(async () => {
      try {
        const result = await api.pickSkinFile();
        if (result) {
          update(result);
          toast('Neuer Skin hinzugefügt und ausgewählt!');
        }
      } catch (err) {
        if (fileInput) fileInput.click();
        else toast(err.message, true);
      }
    });
  }

  if (fileInput) {
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result;
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          update(await api.addSkin({ name: baseName, data: dataUrl }));
          toast(`${baseName} hinzugefügt!`);
        };
        reader.readAsDataURL(file);
      } catch (e) {
        toast(e.message, true);
      } finally {
        fileInput.value = '';
      }
    };
  }

  // Model pill buttons in skin edit dialog
  $('skin-model-classic')?.addEventListener('click', () => {
    renamingSkinVariant = 'classic';
    syncModelPillsUI();
  });
  $('skin-model-slim')?.addEventListener('click', () => {
    renamingSkinVariant = 'slim';
    syncModelPillsUI();
  });

  // Rename & model skin dialog setup
  const renameForm = $('rename-skin-form');
  if (renameForm) {
    renameForm.onsubmit = async (e) => {
      e.preventDefault();
      const input = $('rename-skin-input');
      const newName = input ? input.value.trim() : '';
      if (!renamingSkinId || !newName) return;
      action(async () => {
        const res = await api.renameSkin(renamingSkinId, newName, renamingSkinVariant);
        update(res);
        if (res?.uploadResult?.uploaded) {
          toast(`✓ "${newName}" (${renamingSkinVariant === 'slim' ? 'Slim 3px' : 'Classic 4px'}) gespeichert & bei Mojang aktiv!`);
        } else {
          toast(`✓ "${newName}" (${renamingSkinVariant === 'slim' ? 'Slim 3px' : 'Classic 4px'}) angepasst.`);
        }
        $('rename-skin-dialog')?.close();
      });
    };
  }
}
