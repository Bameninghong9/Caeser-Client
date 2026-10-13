// Script des Log-Fensters (ausgelagert aus log-window.html, damit die CSP ohne 'unsafe-inline' auskommt)
// i18n Dictionary
const i18n = {
  de: {
    title: 'CAESER CLIENT · SPIELPROTOKOLL',
    profilePrefix: 'Profil:',
    searchPlaceholder: 'Im Log suchen …',
    autoScroll: '⬇ Auto-Scroll',
    autoScrollTitle: 'Automatisches Herunterscrollen',
    copy: '📋 Kopieren',
    copyTitle: 'Gesamtes Log in die Zwischenablage kopieren',
    copied: '✓ Kopiert!',
    clear: '🗑️ Leeren',
    clearTitle: 'Log-Ansicht leeren',
    lines: 'Zeilen',
    emptyNoLogs: 'Noch keine Log-Einträge vorhanden. Starte Minecraft, um die Ausgaben live zu verfolgen.',
    emptyNoMatches: (q) => `Keine Treffer für "${q}" gefunden.`,
    statusWaiting: 'Warte auf Spielstart …',
    statusRunning: 'Minecraft läuft',
    statusStarting: 'Startet …',
    statusStopped: (code) => code !== undefined && code !== null ? `Beendet (Code ${code})` : 'Beendet',
    statusCrashed: (code) => `Abgestürzt (Exit-Code ${code ?? 1})`,
    share: '🔗 Teilen',
    shareTitle: 'Log geschwärzt auf mclo.gs hochladen und Link kopieren',
    sharing: '⏳ Lädt hoch …',
    shareCopied: (url) => `Link kopiert: ${url}`,
    shareFailed: (msg) => `Teilen fehlgeschlagen: ${msg}`,
    shareOpen: 'Im Browser öffnen',
    save: '💾 Speichern',
    saveTitle: 'Log der gewählten Instanz als Textdatei speichern',
    saved: '✓ Gespeichert',
    removeTitle: 'Aus der Liste entfernen',
    instancesTitle: 'Instanzen',
    noInstancesNotice: 'Keine aktiven Instanzen vorhanden.',
    stopBtn: 'STOPP',
    stopTitle: 'Dieses Minecraft-Spiel beenden',
    runningSummary: (count) => `${count} LÄUFT`
  },
  en: {
    title: 'CAESER CLIENT · GAME LOGS',
    profilePrefix: 'Profile:',
    searchPlaceholder: 'Search in logs …',
    autoScroll: '⬇ Auto-Scroll',
    autoScrollTitle: 'Automatic scrolling',
    copy: '📋 Copy',
    copyTitle: 'Copy entire log to clipboard',
    copied: '✓ Copied!',
    clear: '🗑️ Clear',
    clearTitle: 'Clear log view',
    lines: 'lines',
    emptyNoLogs: 'No log entries yet. Launch Minecraft to see live output.',
    emptyNoMatches: (q) => `No matches found for "${q}".`,
    statusWaiting: 'Waiting for game launch …',
    statusRunning: 'Minecraft running',
    statusStarting: 'Starting …',
    statusStopped: (code) => code !== undefined && code !== null ? `Exited (Code ${code})` : 'Exited',
    statusCrashed: (code) => `Crashed (exit code ${code ?? 1})`,
    share: '🔗 Share',
    shareTitle: 'Upload the redacted log to mclo.gs and copy the link',
    sharing: '⏳ Uploading …',
    shareCopied: (url) => `Link copied: ${url}`,
    shareFailed: (msg) => `Sharing failed: ${msg}`,
    shareOpen: 'Open in browser',
    save: '💾 Save',
    saveTitle: 'Save the selected instance log as a text file',
    saved: '✓ Saved',
    removeTitle: 'Remove from list',
    instancesTitle: 'Instances',
    noInstancesNotice: 'No active instances available.',
    stopBtn: 'STOP',
    stopTitle: 'Terminate this Minecraft game',
    runningSummary: (count) => `${count} RUNNING`
  }
};

let currentLang = 'de';
function t(key, arg) {
  const dict = i18n[currentLang] || i18n.de;
  const val = dict[key];
  if (typeof val === 'function') return val(arg);
  return val || (i18n.de[key] ? (typeof i18n.de[key] === 'function' ? i18n.de[key](arg) : i18n.de[key]) : key);
}

function applyLanguage(lang) {
  currentLang = (lang === 'en') ? 'en' : 'de';
  document.documentElement.lang = currentLang;
  document.getElementById('titlebar-heading').textContent = t('title');
  document.getElementById('lbl-profile').textContent = t('profilePrefix');
  document.getElementById('search-input').placeholder = t('searchPlaceholder');
  document.getElementById('btn-autoscroll').title = t('autoScrollTitle');
  document.getElementById('btn-autoscroll').querySelector('span').textContent = t('autoScroll');
  document.getElementById('btn-copy').title = t('copyTitle');
  document.getElementById('btn-copy-text').textContent = t('copy');
  document.getElementById('btn-share').title = t('shareTitle');
  document.getElementById('btn-share-text').textContent = t('share');
  document.getElementById('btn-share-open').textContent = t('shareOpen');
  document.getElementById('btn-save').title = t('saveTitle');
  document.getElementById('btn-save-text').textContent = t('save');
  document.getElementById('btn-clear').title = t('clearTitle');
  document.getElementById('btn-clear-text').textContent = t('clear');
  document.getElementById('sidebar-title-text').textContent = t('instancesTitle');
  // Der Platzhalter aus dem HTML verschwindet beim ersten renderInstancesList(); ohne Prüfung
  // bricht jedes spätere init-logs hier ab und die Liste wird nicht mehr neu gezeichnet.
  const staticNotice = document.getElementById('no-instances-notice');
  if (staticNotice) staticNotice.textContent = t('noInstancesNotice');
  document.getElementById('btn-sidebar-stopp-text').textContent = t('stopBtn');
  document.getElementById('btn-sidebar-stopp').title = t('stopTitle');

  // Update active view
  const active = instances.find(i => i.id === activeInstanceId);
  if (active) {
    updateStatus(active.status, { code: active.exitCode });
  } else {
    updateStatus('waiting');
  }
  renderInstancesList();
  renderLines();
}

const term = document.getElementById('terminal');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const profileNameEl = document.getElementById('profile-name');
const lineCounter = document.getElementById('line-counter');
const searchInput = document.getElementById('search-input');
const btnAutoscroll = document.getElementById('btn-autoscroll');
const btnCopy = document.getElementById('btn-copy');
const btnClear = document.getElementById('btn-clear');
const btnSave = document.getElementById('btn-save');
const btnShare = document.getElementById('btn-share');
const shareNotice = document.getElementById('share-notice');
let shareBusy = false;
let lastShare = null;
let shareNoticeTimer = null;
const instancesListEl = document.getElementById('instances-list');
const instancesCountBadge = document.getElementById('instances-count-badge');
const btnSidebarStopp = document.getElementById('btn-sidebar-stopp');
const sidebarSummaryName = document.getElementById('sidebar-summary-name');
const sidebarSummaryRunning = document.getElementById('sidebar-summary-running');

let allLines = [];
let autoscroll = true;
let filterQuery = '';
let instances = [];
let activeInstanceId = null;

// Window controls
document.getElementById('win-min').onclick = () => window.logApi?.action('minimize');
document.getElementById('win-max').onclick = () => window.logApi?.action('maximize');
document.getElementById('win-close').onclick = () => window.logApi?.action('close');

// Knöpfe, die eine gewählte Instanz mit Inhalt brauchen
function updateActionButtons() {
  const hasLog = Boolean(activeInstanceId && instances.some(i => i.id === activeInstanceId) && allLines.length);
  btnSave.disabled = !hasLog;
  btnShare.disabled = !hasLog || shareBusy;
}

function showShareNotice(text, withLink) {
  document.getElementById('share-notice-text').textContent = text;
  document.getElementById('btn-share-open').hidden = !withLink;
  shareNotice.classList.toggle('error', !withLink);
  shareNotice.hidden = false;
  clearTimeout(shareNoticeTimer);
  shareNoticeTimer = setTimeout(() => { shareNotice.hidden = true; }, 15000);
}

function classifyLine(text) {
  if (/\[.*?(?:WARN|WARNUNG|WARNING).*?\]/i.test(text) || text.includes('WARN')) return 'warn';
  if (/\[.*?(?:ERROR|FATAL|EXCEPTION|CRASH).*?\]/i.test(text) || /(?:Exception|Error|CrashReport):/i.test(text)) return 'error';
  if (/\[.*?(?:INFO).*?\]/i.test(text)) return 'info';
  return '';
}

function renderLines() {
  term.innerHTML = '';
  const visible = filterQuery
    ? allLines.filter(line => line.toLowerCase().includes(filterQuery))
    : allLines;

  if (!visible.length) {
    // Suchtext nur als Text einfügen, nie als HTML
    const notice = document.createElement('div');
    notice.className = 'empty-notice';
    notice.textContent = filterQuery ? t('emptyNoMatches', filterQuery) : t('emptyNoLogs');
    term.replaceChildren(notice);
    lineCounter.textContent = `${allLines.length} ${t('lines')}`;
    updateActionButtons();
    return;
  }

  const fragment = document.createDocumentFragment();
  visible.forEach((line, index) => {
    const row = document.createElement('div');
    const levelClass = classifyLine(line);
    row.className = 'log-line' + (levelClass ? ' ' + levelClass : '');

    const num = document.createElement('span');
    num.className = 'log-num';
    num.textContent = index + 1;

    const text = document.createElement('span');
    text.className = 'log-text';
    text.textContent = line;

    row.appendChild(num);
    row.appendChild(text);
    fragment.appendChild(row);
  });

  term.appendChild(fragment);
  lineCounter.textContent = `${allLines.length} ${t('lines')}`;
  updateActionButtons();
  if (autoscroll) term.scrollTop = term.scrollHeight;
}

function cleanXmlIfPresent(raw) {
  if (!raw || typeof raw !== 'string') return '';
  if (raw.includes('<log4j:Event') || raw.includes('<log4j:Message>')) {
    const loggerMatch = raw.match(/logger="([^"]*)"/);
    const levelMatch = raw.match(/level="([^"]*)"/);
    const timeMatch = raw.match(/timestamp="([^"]*)"/);
    const msgMatch = raw.match(/<log4j:Message>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/log4j:Message>/) || raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (msgMatch) {
      const logger = loggerMatch ? loggerMatch[1] : '';
      const level = (levelMatch ? levelMatch[1] : 'INFO').toUpperCase();
      const d = timeMatch ? new Date(Number(timeMatch[1])) : new Date();
      const pad = n => String(n).padStart(2, '0');
      const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      return `[${timeStr}] [${level}]${logger ? ' [' + logger + ']' : ''}: ${msgMatch[1].trim()}`;
    }
  }
  return raw;
}

function addLine(rawLine) {
  const line = cleanXmlIfPresent(rawLine);
  allLines.push(line);
  if (allLines.length > 3000) allLines.shift();

  const existingNotice = term.querySelector('.empty-notice');
  if (existingNotice) existingNotice.remove();

  if (!filterQuery || line.toLowerCase().includes(filterQuery)) {
    const row = document.createElement('div');
    const levelClass = classifyLine(line);
    row.className = 'log-line' + (levelClass ? ' ' + levelClass : '');

    const num = document.createElement('span');
    num.className = 'log-num';
    num.textContent = allLines.length;

    const text = document.createElement('span');
    text.className = 'log-text';
    text.textContent = line;

    row.appendChild(num);
    row.appendChild(text);
    term.appendChild(row);

    if (autoscroll) term.scrollTop = term.scrollHeight;
  }
  lineCounter.textContent = `${allLines.length} ${t('lines')}`;
  if (allLines.length === 1) updateActionButtons();
}

function updateStatus(state, info) {
  statusBadge.className = 'status-badge ' + (state || 'stopped');
  if (state === 'running') {
    statusText.textContent = t('statusRunning');
  } else if (state === 'starting') {
    statusText.textContent = t('statusStarting');
  } else if (state === 'stopped') {
    statusText.textContent = t('statusStopped', info?.code);
  } else if (state === 'crashed') {
    statusText.textContent = t('statusCrashed', info?.code);
  } else {
    statusText.textContent = t('statusWaiting');
  }
}

function formatDuration(startMs, endMs) {
  const end = endMs || Date.now();
  const diff = Math.max(0, Math.floor((end - startMs) / 1000));
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}:${String(remM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderInstancesList() {
  updateActionButtons();
  instancesListEl.innerHTML = '';
  instancesCountBadge.textContent = instances.length;

  const runningCount = instances.filter(i => i.status === 'running').length;
  sidebarSummaryRunning.textContent = t('runningSummary', runningCount);

  if (!instances.length) {
    const notice = document.createElement('div');
    notice.className = 'no-instances-notice';
    notice.textContent = t('noInstancesNotice');
    instancesListEl.appendChild(notice);
    sidebarSummaryName.textContent = '-';
    btnSidebarStopp.disabled = true;
    return;
  }

  const activeInst = instances.find(i => i.id === activeInstanceId) || instances[0];
  if (activeInst) {
    sidebarSummaryName.textContent = activeInst.profileName;
    btnSidebarStopp.disabled = activeInst.status !== 'running';
  }

  instances.forEach(inst => {
    const card = document.createElement('div');
    card.className = 'instance-card' + (inst.id === activeInstanceId ? ' active' : '');
    card.onclick = () => selectInstance(inst.id);

    const iconBox = document.createElement('div');
    iconBox.className = 'instance-icon';
    iconBox.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;

    const info = document.createElement('div');
    info.className = 'instance-info';

    const title = document.createElement('div');
    title.className = 'instance-title';
    title.textContent = inst.profileName;

    const sub = document.createElement('div');
    sub.className = 'instance-sub';

    const userSpan = document.createElement('span');
    userSpan.textContent = inst.accountName || 'Player';

    const dot = document.createElement('span');
    dot.textContent = '·';

    const uptime = document.createElement('span');
    uptime.className = `instance-uptime ${inst.status || 'stopped'}`;
    uptime.dataset.start = inst.startTime;
    uptime.dataset.end = inst.endTime || '';
    uptime.dataset.status = inst.status;
    // Beendete Instanzen: Status plus auf endTime eingefrorene Laufzeit
    uptime.textContent = inst.status === 'running'
      ? formatDuration(inst.startTime, null)
      : `${inst.status === 'crashed' ? t('statusCrashed', inst.exitCode) : t('statusStopped', inst.exitCode)} · ${formatDuration(inst.startTime, inst.endTime)}`;

    sub.appendChild(userSpan);
    sub.appendChild(dot);
    sub.appendChild(uptime);

    info.appendChild(title);
    info.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'instance-card-actions';

    if (inst.status === 'running') {
      const stopBtn = document.createElement('button');
      stopBtn.className = 'btn-card-stop';
      stopBtn.title = t('stopTitle');
      stopBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>`;
      stopBtn.onclick = (e) => {
        e.stopPropagation();
        window.logApi?.stopInstance(inst.id);
      };
      actions.appendChild(stopBtn);
    } else {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn-card-close';
      closeBtn.title = t('removeTitle');
      closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        window.logApi?.closeInstance(inst.id);
      };
      actions.appendChild(closeBtn);
    }

    card.appendChild(iconBox);
    card.appendChild(info);
    card.appendChild(actions);
    instancesListEl.appendChild(card);
  });
}

async function selectInstance(instanceId) {
  if (activeInstanceId === instanceId) return;
  activeInstanceId = instanceId;
  const res = await window.logApi?.selectInstance(instanceId);
  if (res) {
    profileNameEl.textContent = res.profileName || 'Caeser';
    updateStatus(res.status, { code: res.exitCode });
    allLines = Array.isArray(res.logs) ? [...res.logs] : [];
    renderLines();
  }
  renderInstancesList();
}

// Stop selected instance button in sidebar footer
btnSidebarStopp.onclick = () => {
  if (activeInstanceId) {
    window.logApi?.stopInstance(activeInstanceId);
  }
};

// Live uptime ticker every 1 second
setInterval(() => {
  document.querySelectorAll('.instance-uptime.running').forEach(el => {
    const start = Number(el.dataset.start);
    if (start) {
      el.textContent = formatDuration(start, null);
    }
  });
}, 1000);

// Autoscroll toggle
btnAutoscroll.onclick = () => {
  autoscroll = !autoscroll;
  btnAutoscroll.classList.toggle('active', autoscroll);
  if (autoscroll) term.scrollTop = term.scrollHeight;
};

term.addEventListener('wheel', (e) => {
  if (e.deltaY < 0 && autoscroll) {
    autoscroll = false;
    btnAutoscroll.classList.remove('active');
  }
});

// Copy
btnCopy.onclick = async () => {
  const content = allLines.join('\n');
  try {
    if (window.logApi?.copy) {
      await window.logApi.copy(content);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(content);
    }
  } catch (e) {
    console.error('Clipboard copy error:', e);
  }
  const copySpan = document.getElementById('btn-copy-text');
  const origText = copySpan.textContent;
  copySpan.textContent = t('copied');
  setTimeout(() => { copySpan.textContent = origText; }, 1800);
};

// Teilen: nur die Instanz-ID geht an den Hauptprozess; er schwärzt, lädt hoch und kopiert den Link
btnShare.onclick = async () => {
  if (!activeInstanceId || shareBusy) return;
  const span = document.getElementById('btn-share-text');
  shareBusy = true; updateActionButtons(); span.textContent = t('sharing');
  try {
    const res = await window.logApi?.shareInstance(activeInstanceId);
    if (res?.ok && res.url) {
      lastShare = res;
      showShareNotice(t('shareCopied', res.url), true);
    } else if (!res?.ok) {
      showShareNotice(t('shareFailed', res?.error || '?'), false);
    }
  } finally {
    shareBusy = false; span.textContent = t('share'); updateActionButtons();
  }
};
document.getElementById('btn-share-open').onclick = () => {
  if (lastShare?.id) window.logApi?.openShared(lastShare.id);
};

// Speichern: nur die Instanz-ID geht an den Hauptprozess, der Pfad kommt aus dem nativen Dialog
btnSave.onclick = async () => {
  if (!activeInstanceId) return;
  const res = await window.logApi?.saveInstance(activeInstanceId);
  if (res?.ok) {
    const span = document.getElementById('btn-save-text');
    span.textContent = t('saved');
    setTimeout(() => { span.textContent = t('save'); }, 1800);
  } else if (res?.error) {
    console.error(res.error);
  }
};

// Clear
btnClear.onclick = () => {
  allLines = [];
  renderLines();
  if (activeInstanceId) {
    window.logApi?.clearInstance(activeInstanceId);
  } else if (window.logApi?.clear) {
    window.logApi.clear();
  }
};

// Search filter
searchInput.oninput = () => {
  filterQuery = searchInput.value.trim().toLowerCase();
  renderLines();
};

// IPC wiring
if (window.logApi) {
  window.logApi.getInitialData().then(init => {
    if (!init) return;
    if (init.language) applyLanguage(init.language);
    if (Array.isArray(init.instances)) {
      instances = init.instances;
    }
    if (init.activeInstanceId) {
      activeInstanceId = init.activeInstanceId;
    } else if (instances.length) {
      activeInstanceId = instances[0].id;
    }

    const active = instances.find(i => i.id === activeInstanceId);
    if (active) {
      profileNameEl.textContent = active.profileName;
      updateStatus(active.status, { code: active.exitCode });
    } else if (init.profileName) {
      profileNameEl.textContent = init.profileName;
      updateStatus(init.running ? 'running' : 'stopped');
    }

    if (Array.isArray(init.logs)) {
      allLines = [...init.logs];
    }
    renderInstancesList();
    renderLines();
  });

  window.logApi.on('init-logs', (payload) => {
    if (payload?.language) applyLanguage(payload.language);
    if (Array.isArray(payload?.instances)) {
      instances = payload.instances;
    }
    if (payload?.activeInstanceId) {
      activeInstanceId = payload.activeInstanceId;
    }
    const active = instances.find(i => i.id === activeInstanceId);
    if (active) {
      profileNameEl.textContent = active.profileName;
      updateStatus(active.status, { code: active.exitCode });
    }
    if (Array.isArray(payload?.logs)) {
      allLines = [...payload.logs];
    }
    renderInstancesList();
    renderLines();
  });

  window.logApi.on('instance-spawn', ({ instance, activeInstanceId: newActiveId }) => {
    if (instance) {
      const idx = instances.findIndex(i => i.id === instance.id);
      if (idx !== -1) instances[idx] = instance;
      else instances.push(instance);
    }
    if (newActiveId) {
      activeInstanceId = newActiveId;
    }
    const active = instances.find(i => i.id === activeInstanceId);
    if (active) {
      profileNameEl.textContent = active.profileName;
      updateStatus('running');
      allLines = [];
    }
    renderInstancesList();
    renderLines();
  });

  window.logApi.on('game-log', ({ instanceId, line }) => {
    if (!instanceId || instanceId === activeInstanceId) {
      addLine(line);
    }
  });

  // Beendete Instanzen bleiben in der Liste (Status + eingefrorene Laufzeit); das Fenster bleibt offen.
  window.logApi.on('instance-exit', ({ instance, instances: list, activeInstanceId: newActiveId }) => {
    if (Array.isArray(list)) instances = list;
    else if (instance) {
      const idx = instances.findIndex(i => i.id === instance.id);
      if (idx !== -1) instances[idx] = instance;
    }
    const previous = activeInstanceId;
    if (!instances.some(i => i.id === activeInstanceId)) activeInstanceId = newActiveId || (instances.length ? instances[instances.length - 1].id : null);
    if (activeInstanceId && activeInstanceId !== previous) {
      const target = activeInstanceId; activeInstanceId = null;
      selectInstance(target);
      return;
    }
    const active = instances.find(i => i.id === activeInstanceId);
    if (active) updateStatus(active.status, { code: active.exitCode });
    renderInstancesList();
  });

  window.logApi.on('language-change', (newLang) => {
    applyLanguage(newLang);
  });

  window.logApi.on('clear-logs', ({ instanceId }) => {
    if (!instanceId || instanceId === activeInstanceId) {
      allLines = [];
      renderLines();
    }
  });
}
