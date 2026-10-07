import { $, api, model, update, onState, action, toast } from './common.js';
import { applyLanguage, t } from './i18n.js';
const themes = [['Cyberpunk','#00d9ef'],['Ultraviolet','#b23cee'],['Toxic','#54ef00'],['Inferno','#ff7900'],['Glacier','#00c7ee'],['Bloodmoon','#ff0645'],['Aurora','#00e8b8'],['Bubblegum','#ff43d9'],['Limelight','#b5f800'],['Sunset','#ff008b'],['Electric','#3470f8'],['Nebula','#a647f2'],['Goldrush','#ffc600'],['Emerald','#00d99b'],['Plasma','#f22dcb'],['Crimson','#fa335f']];
async function save(patch) { update(await api.settings(patch)); }

export function initSettings() {
  // Populate themes
  for (const [name, color] of themes) {
    const button = document.createElement('button'); button.className = 'theme-button'; button.dataset.theme = name;
    button.innerHTML = '<span></span><small></small>'; button.querySelector('span').style.background = color; button.querySelector('small').textContent = name;
    button.onclick = () => action(() => save({ theme: name, customAccent: '' })); $('themes').append(button);
  }

  // Category navigation tabs
  document.querySelectorAll('.settings-nav-tab').forEach(tab => {
    tab.onclick = () => {
      const cat = tab.dataset.settingsCategory;
      document.querySelectorAll('.settings-nav-tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.settings-category-content').forEach(c => {
        c.hidden = c.id !== `cat-${cat}`;
      });
    };
  });

  // Custom accent color
  const colorPicker = $('custom-accent-color');
  const hexInput = $('custom-accent-hex');
  if (colorPicker && hexInput) {
    colorPicker.oninput = () => {
      hexInput.value = colorPicker.value;
      document.documentElement.style.setProperty('--accent', colorPicker.value);
    };
    colorPicker.onchange = () => action(() => save({ theme: 'Custom', customAccent: colorPicker.value }));
    hexInput.oninput = () => {
      const val = hexInput.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(val)) {
        colorPicker.value = val;
        document.documentElement.style.setProperty('--accent', val);
      }
    };
    const applyBtn = $('apply-custom-accent');
    if (applyBtn) {
      applyBtn.onclick = () => action(async () => {
        const val = hexInput.value.trim();
        if (!/^#[0-9a-f]{6}$/i.test(val)) return toast('Bitte einen gültigen Hex-Farbcode (z. B. #00d9ef) eingeben.', true);
        await save({ theme: 'Custom', customAccent: val });
        toast('Akzentfarbe gespeichert!');
      });
    }
  }

  // Auto-open game log switch
  const autoLogSwitch = $('auto-open-log');
  if (autoLogSwitch) {
    autoLogSwitch.onchange = () => action(() => save({ autoOpenLog: autoLogSwitch.checked }));
  }

  // Discord RPC switch
  const discordRpcSwitch = $('setting-discord-rpc');
  if (discordRpcSwitch) {
    discordRpcSwitch.onchange = () => action(() => save({ discordRpc: discordRpcSwitch.checked }));
  }

  // Custom Wallpaper upload and controls
  let cachedWallpaper = null;
  const pickWallpaperBtn = $('btn-pick-wallpaper');
  const wallpaperInput = $('wallpaper-file-input');
  const removeWallpaperBtn = $('btn-remove-wallpaper');
  const opacitySlider = $('wallpaper-opacity');
  const blurSlider = $('wallpaper-blur');
  const opacityVal = $('wallpaper-opacity-val');
  const blurVal = $('wallpaper-blur-val');

  async function updateWallpaperDisplay(customWallpaperMeta) {
    if (customWallpaperMeta && customWallpaperMeta.enabled !== false) {
      if (!cachedWallpaper && api.getWallpaper) {
        try { cachedWallpaper = await api.getWallpaper(); } catch {}
      }
      if (cachedWallpaper?.data) {
        const layer = $('custom-wallpaper-layer');
        if (layer) {
          layer.hidden = false;
          const isVideo = cachedWallpaper.type === 'video';
          const existing = layer.firstElementChild;
          if (!existing || (isVideo && existing.tagName !== 'VIDEO') || (!isVideo && existing.tagName !== 'IMG')) {
            layer.innerHTML = isVideo
              ? `<video src="${cachedWallpaper.data}" autoplay loop muted playsinline class="custom-wallpaper-media"></video>`
              : `<img src="${cachedWallpaper.data}" alt="" class="custom-wallpaper-media">`;
          }
        }
        const preview = $('wallpaper-preview-inner');
        if (preview) {
          const isVideo = cachedWallpaper.type === 'video';
          preview.innerHTML = isVideo
            ? `<video src="${cachedWallpaper.data}" autoplay loop muted playsinline class="wallpaper-preview-media"></video>`
            : `<img src="${cachedWallpaper.data}" alt="" class="wallpaper-preview-media">`;
        }
        if (removeWallpaperBtn) removeWallpaperBtn.hidden = false;
        const op = customWallpaperMeta.opacity ?? 40;
        const bl = customWallpaperMeta.blur ?? 0;
        document.documentElement.style.setProperty('--wallpaper-opacity', (op / 100).toFixed(2));
        document.documentElement.style.setProperty('--wallpaper-blur', `${bl}px`);
        if (opacitySlider) opacitySlider.value = op;
        if (opacityVal) opacityVal.textContent = `${op}%`;
        if (blurSlider) blurSlider.value = bl;
        if (blurVal) blurVal.textContent = `${bl} px`;
        return;
      }
    }
    // No wallpaper active
    const layer = $('custom-wallpaper-layer');
    if (layer) { layer.hidden = true; layer.replaceChildren(); }
    const preview = $('wallpaper-preview-inner');
    if (preview) {
      preview.innerHTML = `<span id="wallpaper-preview-placeholder" data-i18n="noCustomWallpaper">${t('noCustomWallpaper')}</span>`;
    }
    if (removeWallpaperBtn) removeWallpaperBtn.hidden = true;
  }

  if (pickWallpaperBtn) {
    pickWallpaperBtn.onclick = () => action(async () => {
      if (api.pickWallpaperFile) {
        const res = await api.pickWallpaperFile();
        if (res) {
          cachedWallpaper = res.wallpaper;
          update(res.state);
          updateWallpaperDisplay(res.state.settings.customWallpaper);
          toast('Wallpaper eingerichtet!');
        }
      } else if (wallpaperInput) {
        wallpaperInput.click();
      }
    });
  }

  if (wallpaperInput) {
    wallpaperInput.onchange = () => action(async () => {
      const file = wallpaperInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const data = reader.result;
        const isVideo = file.type.startsWith('video');
        const res = await api.setWallpaper({ data, type: isVideo ? 'video' : 'image', name: file.name });
        cachedWallpaper = res.wallpaper;
        update(res.state);
        updateWallpaperDisplay(res.state.settings.customWallpaper);
        toast('Wallpaper eingerichtet!');
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeWallpaperBtn) {
    removeWallpaperBtn.onclick = () => action(async () => {
      const res = await api.removeWallpaper();
      cachedWallpaper = null;
      update(res.state);
      updateWallpaperDisplay(null);
      toast('Eigenes Wallpaper entfernt.');
    });
  }

  if (opacitySlider) {
    opacitySlider.oninput = () => {
      const val = Number(opacitySlider.value);
      if (opacityVal) opacityVal.textContent = `${val}%`;
      document.documentElement.style.setProperty('--wallpaper-opacity', (val / 100).toFixed(2));
    };
    opacitySlider.onchange = () => action(() => save({ customWallpaper: { opacity: Number(opacitySlider.value) } }));
  }

  if (blurSlider) {
    blurSlider.oninput = () => {
      const val = Number(blurSlider.value);
      if (blurVal) blurVal.textContent = `${val} px`;
      document.documentElement.style.setProperty('--wallpaper-blur', `${val}px`);
    };
    blurSlider.onchange = () => action(() => save({ customWallpaper: { blur: Number(blurSlider.value) } }));
  }

  // Atmosphere background presets
  document.querySelectorAll('.atmo-btn').forEach(btn => {
    btn.onclick = () => action(() => save({ atmosphere: btn.dataset.atmo }));
  });

  // Glow level presets
  document.querySelectorAll('.glow-btn').forEach(btn => {
    btn.onclick = () => action(() => save({ glow: btn.dataset.glow }));
  });

  onState(() => {
    const { settings } = model.state;
    const accent = (settings.theme === 'Custom' && settings.customAccent)
      ? settings.customAccent
      : (themes.find(t => t[0] === settings.theme)?.[1] || '#b23cee');

    document.documentElement.style.setProperty('--accent', accent);
    if (colorPicker) colorPicker.value = accent;
    if (hexInput) hexInput.value = accent;

    document.querySelectorAll('[data-theme]').forEach(el => {
      const isSelected = el.dataset.theme === settings.theme;
      el.classList.toggle('selected', isSelected);
      el.setAttribute('aria-pressed', isSelected);
    });

    // Atmosphere
    const atmo = settings.atmosphere || 'obsidian';
    document.body.classList.remove('atmo-obsidian', 'atmo-grid', 'atmo-space', 'atmo-aurora');
    document.body.classList.add(`atmo-${atmo}`);
    const atmoLayer = $('atmosphere-layer');
    if (atmoLayer) {
      atmoLayer.className = `atmosphere-layer atmo-${atmo}`;
    }
    document.querySelectorAll('.atmo-btn').forEach(b => b.classList.toggle('active', b.dataset.atmo === atmo));

    // Custom Wallpaper & Auto Log Switch & Discord RPC
    if (autoLogSwitch) autoLogSwitch.checked = settings.autoOpenLog !== false;
    if (discordRpcSwitch) discordRpcSwitch.checked = settings.discordRpc !== false;
    updateWallpaperDisplay(settings.customWallpaper);

    // Glow
    const glow = settings.glow || 'subtle';
    document.body.classList.remove('glow-off', 'glow-subtle', 'glow-neon');
    document.body.classList.add(`glow-${glow}`);
    document.querySelectorAll('.glow-btn').forEach(b => b.classList.toggle('active', b.dataset.glow === glow));

    $('animations').checked = settings.animations;
    document.body.classList.toggle('no-animation', !settings.animations);
    $('java-label').textContent = settings.javaPath || (settings.language === 'en' ? 'Automatic · matches your profile' : 'Automatisch · passend zu deinem Profil');

    const langSelect = $('language-select');
    const currentLang = settings.language || 'de';
    if (langSelect) {
      langSelect.value = currentLang;
      applyLanguage(currentLang);
    }

    const flagBox = $('lang-current-flag');
    const labelBox = $('lang-current-label');
    if (flagBox && flags[currentLang]) flagBox.innerHTML = flags[currentLang];
    if (labelBox) labelBox.textContent = currentLang === 'en' ? 'ENGLISH' : 'DEUTSCH';
    document.querySelectorAll('.lang-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.value === currentLang);
    });
  });

  const flags = {
    de: `<svg class="flag-svg" viewBox="0 0 5 3" width="20" height="13" stroke="none"><rect width="5" height="1" y="0" fill="#151515" stroke="none"/><rect width="5" height="1" y="1" fill="#dd0000" stroke="none"/><rect width="5" height="1" y="2" fill="#ffce00" stroke="none"/></svg>`,
    en: `<svg class="flag-svg" viewBox="0 0 60 30" width="20" height="13"><clipPath id="uk-flag-clip"><rect width="60" height="30" rx="1"/></clipPath><g clip-path="url(#uk-flag-clip)"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30" stroke="#C8102E" stroke-width="4"/><path d="M60,0 L0,30" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>`
  };

  const langSelect = $('language-select');
  const langToggle = $('lang-custom-toggle');
  const langMenu = $('lang-custom-menu');

  if (langToggle && langMenu) {
    langToggle.onclick = (e) => {
      e.stopPropagation();
      langMenu.hidden = !langMenu.hidden;
      langToggle.setAttribute('aria-expanded', String(!langMenu.hidden));
    };

    document.querySelectorAll('.lang-option').forEach(opt => {
      opt.onclick = () => action(async () => {
        const val = opt.dataset.value;
        if (langSelect) {
          langSelect.value = val;
          langSelect.dispatchEvent(new Event('change'));
        }
        langMenu.hidden = true;
        langToggle.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', (e) => {
      if (!langToggle.contains(e.target) && !langMenu.contains(e.target)) {
        langMenu.hidden = true;
        langToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (langSelect) {
    langSelect.onchange = () => action(async () => {
      const newLang = langSelect.value;
      applyLanguage(newLang);
      const flagBox = $('lang-current-flag');
      const labelBox = $('lang-current-label');
      if (flagBox && flags[newLang]) flagBox.innerHTML = flags[newLang];
      if (labelBox) labelBox.textContent = newLang === 'en' ? 'ENGLISH' : 'DEUTSCH';
      document.querySelectorAll('.lang-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === newLang);
      });
      await save({ language: newLang });
      toast(newLang === 'en' ? 'Language switched to English!' : 'Sprache auf Deutsch geändert!');
    });
  }

  $('animations').onchange = () => action(() => save({ animations: $('animations').checked }));
  $('java-auto').onclick = () => action(() => save({ javaPath: '' }));
  $('java-pick').onclick = () => action(async () => update(await api.pickJava()));
  $('open-folder').onclick = () => action(() => api.open('folder'));
  if ($('save-curseforge')) {
    $('save-curseforge').onclick = () => action(async () => {
      update(await api.setCurseForgeKey($('curseforge-key').value));
      $('curseforge-key').value = '';
      toast('CurseForge-Schlüssel verschlüsselt gespeichert.');
    });
  }
  if ($('remove-curseforge')) {
    $('remove-curseforge').onclick = () => action(async () => {
      update(await api.setCurseForgeKey(''));
      $('curseforge-key').value = '';
      toast('Gespeicherten CurseForge-Schlüssel entfernt.');
    });
  }
}

