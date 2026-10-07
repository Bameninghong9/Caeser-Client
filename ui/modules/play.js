import { $, api, model, update, onState, action, toast, loaderName, currentProfile, currentAccount, showAccounts, openDetails, getActiveSkinTexture } from './common.js';
import { openProfile } from './profiles.js';
import { SkinRenderer } from './skin-renderer.js';

let skinRenderer = null;
let currentSkinKey = '__init__';

async function updateSkin() {
  const canvas = $('player-skin-canvas');
  if (!canvas) return;
  if (!skinRenderer) {
    skinRenderer = new SkinRenderer(canvas);
  }
  const key = `${model.state?.settings?.activeSkinId || 'account'}:${model.state?.settings?.activeAccount || ''}`;
  if (currentSkinKey === key) return;
  currentSkinKey = key;
  try {
    const texture = await getActiveSkinTexture();
    skinRenderer.setSkin(texture);
  } catch {
    skinRenderer.setSkin(null);
  }
}

function renderPlay() {
  updateSkin();
  const profile = currentProfile(); $('selected-profile').hidden = !profile; $('play-empty').hidden = !!profile;
  const select = $('play-profile-select');
  if (select) {
    select.replaceChildren();
    for (const item of model.state.profiles) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; select.append(option); }
    if (profile) select.value = profile.id;
  }
  if (profile) {
    $('selected-name').textContent = profile.name;
    $('selected-meta').textContent = `${profile.version} · ${loaderName(profile.mode)} · ${profile.memoryMb} MB RAM`;
    const sub = $('play-profile-subtitle');
    if (sub) sub.textContent = profile.name;
  }
  const dropList = $('dropdown-profiles-list');
  if (dropList) {
    dropList.replaceChildren();
    for (const item of model.state.profiles) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'dropdown-profile-item' + (item.id === profile?.id ? ' active' : '');
      row.innerHTML = `<img src="assets/loaders/${item.mode}.svg" alt=""><div><strong>${item.name}</strong><small>${item.version} · ${loaderName(item.mode)} · ${item.memoryMb} MB</small></div><span class="active-mark">${item.id === profile?.id ? '✓' : ''}</span>`;
      row.onclick = () => action(async () => {
        const drop = $('play-profile-dropdown');
        if (drop) drop.hidden = true;
        update(await api.selectProfile(item.id));
      });
      dropList.append(row);
    }
  }
  const quick = $('quick-profiles');
  if (quick) {
    quick.replaceChildren();
    for (const item of [...model.state.profiles].sort((a,b)=>(b.lastPlayedAt||0)-(a.lastPlayedAt||0)).slice(0,4)){
      const button=document.createElement('button');button.className='quick-profile';button.classList.toggle('active',item.id===profile?.id);
      button.innerHTML='<img alt=""><span><strong></strong><small></small></span>';
      button.querySelector('img').src=`assets/loaders/${item.mode}.svg`;button.querySelector('strong').textContent=item.name;button.querySelector('small').textContent=`${item.version} · ${loaderName(item.mode)}`;
      button.onclick=()=>action(async()=>update(await api.selectProfile(item.id)));quick.append(button);
    }
  }
  const openProf = $('play-open-profile');
  if (openProf) openProf.disabled = !profile;
  if (!model.busy && !model.running) $('progress-label').textContent = currentAccount() ? 'Bereit, wenn du es bist.' : 'Melde dich an, um loszuspielen.';
}
export function initPlay() {
  onState(renderPlay);
  const select = $('play-profile-select');
  if (select) select.onchange = () => action(async () => update(await api.selectProfile(select.value)));
  const openProf = $('play-open-profile');
  if (openProf) openProf.onclick=()=>{const profile=currentProfile();if(profile)openDetails(profile.id);};
  const dropToggle = $('play-dropdown-toggle'), dropMenu = $('play-profile-dropdown');
  if (dropToggle && dropMenu) {
    dropToggle.onclick = e => { e.stopPropagation(); dropMenu.hidden = !dropMenu.hidden; };
    document.addEventListener('pointerdown', e => { if (!e.target.closest('.launch-combo') && dropMenu) dropMenu.hidden = true; });
  }
  const dropNew = $('dropdown-new-profile');
  if (dropNew) dropNew.onclick = () => { if (dropMenu) dropMenu.hidden = true; openProfile(); };
  $('play-button').onclick = () => action(async () => {
    if (!currentProfile()) { openProfile(); return; } if (!currentAccount()) { showAccounts(); return; }
    if (model.busy || model.running) return;
    model.busy = true; $('play-button').disabled = true; $('play-label').textContent = 'Startet …';
    try { const result = await api.launch(); model.running = result.running; $('play-label').textContent = result.running ? 'Läuft' : 'Spielen'; $('play-button').disabled = result.running; }
    catch (error) { $('play-button').disabled = false; $('play-label').textContent = 'Spielen'; $('progress-label').textContent = 'Start fehlgeschlagen. Bitte erneut versuchen.'; throw error; }
    finally { model.busy = false; }
  });
  api.on('progress', progress => { $('progress-label').textContent = progress.stage; $('progress-fill').classList.toggle('indeterminate', progress.percent === null); $('progress-fill').style.width = progress.percent === null ? '30%' : `${progress.percent}%`; });
  const lines = [];
  api.on('game-log', line => { lines.push(line); if (lines.length > 500) lines.shift(); $('game-log').textContent = lines.join('\n'); $('game-log').scrollTop = $('game-log').scrollHeight; });
  api.on('game-exit', ({ code, diagnosis }) => {
    action(async()=>update(await api.state()));
    model.running = false; $('play-button').disabled = false; $('play-label').textContent = 'Spielen'; $('progress-fill').classList.remove('indeterminate'); $('progress-fill').style.width = '0%';
    $('progress-label').textContent = code === 0 ? 'Minecraft wurde beendet.' : `Minecraft wurde beendet (Code ${code}).`;
    if (code !== 0) {
      if (diagnosis) {
        showCrashDoctor(diagnosis);
      } else {
        toast('Minecraft wurde unerwartet beendet. Details stehen im Spielprotokoll.', true);
      }
    }
  });
  $('show-log').onclick = () => {
    if (api.openLogWindow) {
      api.openLogWindow().catch(() => $('logs-dialog')?.showModal());
    } else {
      $('logs-dialog')?.showModal();
    }
  };
  $('clear-log').onclick = () => { lines.length = 0; $('game-log').textContent = 'Anzeige geleert.'; };
}

function showCrashDoctor(diag) {
  const dialog = $('crash-doctor-dialog');
  if (!dialog) return;

  const titleEl = $('doctor-title');
  const iconEl = $('doctor-icon');
  const causeEl = $('doctor-cause');
  const detailsEl = $('doctor-details-box');
  const recEl = $('doctor-recommendation');
  const autoFixBtn = $('doctor-autofix');
  const openLogBtn = $('doctor-open-log');

  if (titleEl) titleEl.textContent = diag.title || 'Spielabsturz analysiert';
  if (iconEl) iconEl.textContent = diag.icon || '🩺';
  if (causeEl) causeEl.textContent = diag.cause || 'Das Spiel wurde unerwartet beendet.';
  if (detailsEl) {
    detailsEl.textContent = diag.details || `Exit-Code: ${diag.code}`;
    detailsEl.hidden = !diag.details;
  }
  if (recEl) recEl.textContent = diag.recommendation || 'Überprüfe das Log-Fenster.';

  if (autoFixBtn) {
    if (diag.autoFix) {
      autoFixBtn.hidden = false;
      autoFixBtn.textContent = diag.autoFix.buttonText || '⚡ Problem automatisch beheben';
      autoFixBtn.disabled = false;
      autoFixBtn.onclick = () => action(async () => {
        autoFixBtn.disabled = true;
        autoFixBtn.textContent = 'Wird repariert …';
        try {
          const res = await api.crashDoctorFix(diag.autoFix);
          update(await api.state());
          toast(res.message || 'Problem erfolgreich behoben!');
          autoFixBtn.textContent = '✓ Behoben!';
          setTimeout(() => {
            dialog.close();
          }, 1200);
        } catch (err) {
          autoFixBtn.disabled = false;
          autoFixBtn.textContent = diag.autoFix.buttonText;
          toast(err.message, true);
        }
      });
    } else {
      autoFixBtn.hidden = true;
    }
  }

  if (openLogBtn) {
    openLogBtn.onclick = () => {
      dialog.close();
      if (api.openLogWindow) {
        api.openLogWindow().catch(() => $('logs-dialog')?.showModal());
      } else {
        $('logs-dialog')?.showModal();
      }
    };
  }

  if (!dialog.open) dialog.showModal();
}
