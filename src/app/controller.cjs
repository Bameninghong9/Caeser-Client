const path = require('node:path');
const os = require('node:os');
const auth = require('../auth/microsoft.cjs');
const launcher = require('../game/launcher.cjs');
const { Store } = require('../data/store.cjs');
const { Profiles, instanceKey, validateProfile } = require('../data/profiles.cjs');
const { json } = require('../shared/net.cjs');
const { Mods } = require('../mods/service.cjs');
const { DEFAULT_CURSEFORGE_KEY } = require('../mods/providers.cjs');
const { Session } = require('../game/session.cjs');
const { DiscordRpcClient } = require('../shared/discord-rpc.cjs');
const { createLogParser } = require('../game/log-parser.cjs');
const { diagnoseCrash, executeAutoFix } = require('../game/crash-doctor.cjs');
const themes = ['Cyberpunk','Ultraviolet','Toxic','Inferno','Glacier','Bloodmoon','Aurora','Bubblegum','Limelight','Sunset','Electric','Nebula','Goldrush','Emerald','Plasma','Crimson'];
const DEFAULT_COSMETICS = {
  wings: { type: 'none', color: '#a855f7' },
  head: { type: 'none', color: '#facc15' },
  pet: { type: 'none', color: '#38bdf8', customPlayer: '', customSkinUrl: '' }
};
const CAESER_DISCORD_ICON = 'https://raw.githubusercontent.com/Bameninghong9/Caeser-Client/main/resources/icon.png';

class Controller {
  constructor({ directory, encryption, resources, appVersion, emit, openBrowser }) {
    this.store = new Store(directory, encryption); this.root = path.join(directory, 'minecraft');
    Object.assign(this, { resources, appVersion, emit, openBrowser });
    this.maxMemoryMb = Math.max(1024, Math.min(65536, Math.floor(os.totalmem() / 1073741824 - 2) * 1024));

    this.profiles = new Profiles(this.store, this.maxMemoryMb);
    this.accounts = []; this.busy = false; this.game = null; this.games = new Set(); this.instances = new Map(); this.loginController = null;
    this.secrets = {};
    this.logHistory = [];
    this.wallpaper = null;
    this.screenshotThumbsCache = new Map();
    this.discordRpc = new DiscordRpcClient();
    this.mods = new Mods({root:this.root, profiles:this.profiles, getKey:()=>this.secrets.curseforgeKey || process.env.CAESER_CURSEFORGE_KEY || DEFAULT_CURSEFORGE_KEY,
      assertIdle:()=>{if(this.busy) throw new Error('Ein Startvorgang läuft bereits.');},report:data=>this.emit('mod-progress',data)});
  }
  async load() {
    this.settings = { theme: 'Ultraviolet', customAccent: '', atmosphere: 'nebula', glow: 'subtle', clientId: '', javaPath: '', activeAccount: '', activeSkinId: 'account', hiddenSkins: [], skinNames: {}, language: 'de', animations: true, autoOpenLog: true, discordRpc: true, customWallpaper: null, cosmetics: DEFAULT_COSMETICS, ...await this.store.read('settings.json', {}) };
    if (this.settings.atmosphere === 'obsidian') this.settings.atmosphere = 'nebula';
    if (this.settings.atmosphere === 'aurora') this.settings.atmosphere = 'rain';
    if (!this.settings.cosmetics) this.settings.cosmetics = DEFAULT_COSMETICS;
    this.skins = await this.store.read('skins.json', []);
    try { this.wallpaper = await this.store.read('wallpaper.json', null); } catch { this.wallpaper = null; }
    await this.profiles.load(this.settings);
    if (this.settings.discordRpc !== false) {
      this.discordRpc.setEnabled(true);
      this.discordRpc.setActivity({
        details: 'Im Hauptmenü',
        state: 'Bereit zum Spielen',
        assets: {
          large_image: CAESER_DISCORD_ICON,
          large_text: `Caeser Client v${this.appVersion || '0.3.23'}`
        }
      });
    } else {
      this.discordRpc.setEnabled(false);
    }
    try { this.secrets = await this.store.read('integrations.bin',{},true); } catch { this.notice='Mod-Quellen konnten nicht entschlüsselt werden. Bitte den CurseForge-Schlüssel erneut hinterlegen.'; }
    try { this.accounts = await this.store.read('accounts.bin', [], true); }
    catch { this.notice = 'Gespeicherte Konten konnten nicht entschlüsselt werden. Bitte erneut anmelden.'; }
    if ((!this.settings.activeAccount || !this.accounts.some(a => a.id === this.settings.activeAccount)) && this.accounts.length) {
      this.settings.activeAccount = this.accounts[0].id;
    }
  }
  state() { return { settings: this.settings, accounts: this.accounts.map(({ id, name }) => ({ id, name })), profiles: this.profiles.data.profiles,
    activeProfileId: this.profiles.data.activeId, maxMemoryMb: this.maxMemoryMb, root: this.root, busy: this.busy, running: !!this.game, appVersion: this.appVersion,
    curseforgeConfigured: Boolean(this.secrets.curseforgeKey || process.env.CAESER_CURSEFORGE_KEY || DEFAULT_CURSEFORGE_KEY),
    skins: this.skins, activeSkinId: this.settings.activeSkinId || 'account',
    cosmetics: this.settings.cosmetics || DEFAULT_COSMETICS,
    wallpaper: this.wallpaper ? { name: this.wallpaper.name, type: this.wallpaper.type, opacity: this.settings.customWallpaper?.opacity ?? 40, blur: this.settings.customWallpaper?.blur ?? 0 } : null }; }
  async getSkins() { return this.skins; }
  async addSkin({ name, data }) {
    if (!data || typeof data !== 'string') throw new Error('Ungültiges Bild für Minecraft-Skin.');
    const skin = {
      id: 'skin-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: (name || 'Custom Skin').slice(0, 32),
      data,
      createdAt: Date.now()
    };
    this.skins = [...this.skins, skin];
    await this.store.write('skins.json', this.skins);
    this.settings.activeSkinId = skin.id;
    await this.saveSettings();
    return this.state();
  }
  async removeSkin(id) {
    if (id === 'steve' || id === 'account') {
      const hidden = new Set(this.settings.hiddenSkins || []);
      hidden.add(id);
      this.settings.hiddenSkins = Array.from(hidden);
    } else {
      this.skins = this.skins.filter(s => s.id !== id);
      await this.store.write('skins.json', this.skins);
    }
    if (this.settings.activeSkinId === id) {
      const remainingCustom = this.skins.map(s => s.id);
      const remainingBuiltin = ['account', 'steve'].filter(s => !this.settings.hiddenSkins?.includes(s));
      this.settings.activeSkinId = remainingCustom[0] || remainingBuiltin[0] || '';
    }
    await this.saveSettings();
    return this.state();
  }
  async renameSkin(id, newName) {
    const trimmed = (newName || '').trim().slice(0, 32);
    if (!trimmed) throw new Error('Skin-Name darf nicht leer sein.');
    if (id === 'steve' || id === 'account') {
      if (!this.settings.skinNames) this.settings.skinNames = {};
      this.settings.skinNames[id] = trimmed;
    } else {
      this.skins = this.skins.map(s => s.id === id ? { ...s, name: trimmed } : s);
      await this.store.write('skins.json', this.skins);
    }
    await this.saveSettings();
    return this.state();
  }
  async selectSkin(id) {
    this.settings.activeSkinId = id;
    await this.saveSettings();
    return this.state();
  }
  async fetchPlayerSkin(name) {
    const clean = (name || '').trim();
    if (!clean || !/^[a-zA-Z0-9_]{1,16}$/.test(clean)) throw new Error('Ungültiger Minecraft-Spielername (nur A-Z, 0-9, _, max 16 Zeichen).');
    const cdns = [
      `https://minotar.net/skin/${encodeURIComponent(clean)}`,
      `https://mc-heads.net/skin/${encodeURIComponent(clean)}`
    ];
    for (const url of cdns) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 100 && buf.length < 1048576) {
            return { ok: true, player: clean, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
          }
        }
      } catch {}
    }
    try {
      const pRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(clean)}`, { signal: AbortSignal.timeout(6000) });
      if (pRes.ok) {
        const profile = await pRes.json();
        if (profile?.id) {
          const sRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`, { signal: AbortSignal.timeout(6000) });
          if (sRes.ok) {
            const sess = await sRes.json();
            const prop = sess.properties?.find(p => p.name === 'textures');
            if (prop?.value) {
              const decoded = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
              const skinUrl = decoded.textures?.SKIN?.url;
              if (skinUrl) {
                const imgRes = await fetch(skinUrl, { signal: AbortSignal.timeout(8000) });
                if (imgRes.ok) {
                  const buf = Buffer.from(await imgRes.arrayBuffer());
                  return { ok: true, player: clean, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
                }
              }
            }
          }
        }
      }
    } catch {}
    throw new Error(`Konnte den Skin für "${clean}" nicht finden oder laden.`);
  }
  async getWallpaper() { return this.wallpaper; }
  async setWallpaper({ data, type, name, opacity, blur }) {
    if (!data || typeof data !== 'string') throw new Error('Ungültige Hintergrund-Daten.');
    this.wallpaper = {
      data,
      type: type || 'image',
      name: (name || 'Custom Wallpaper').slice(0, 64)
    };
    await this.store.write('wallpaper.json', this.wallpaper);
    this.settings.customWallpaper = {
      enabled: true,
      name: this.wallpaper.name,
      type: this.wallpaper.type,
      opacity: Number.isFinite(opacity) ? Math.max(10, Math.min(100, opacity)) : 40,
      blur: Number.isFinite(blur) ? Math.max(0, Math.min(30, blur)) : 0
    };
    await this.saveSettings();
    return { state: this.state(), wallpaper: this.wallpaper };
  }
  async removeWallpaper() {
    this.wallpaper = null;
    await this.store.delete('wallpaper.json');
    this.settings.customWallpaper = null;
    await this.saveSettings();
    return { state: this.state(), wallpaper: null };
  }
  async setCurseForgeKey(key) {
    if (typeof key !== 'string' || key.length > 1024 || /[\r\n]/.test(key)) throw new Error('Ungültiger API-Schlüssel.');
    const secrets = {...this.secrets,curseforgeKey:key.trim()}; await this.store.write('integrations.bin',secrets,true); this.secrets=secrets; return this.state();
  }
  saveSettings() { return this.store.write('settings.json', this.settings); }
  saveAccounts() { return this.store.write('accounts.bin', this.accounts, true); }
  async updateSettings(patch) {
    if (!patch || typeof patch !== 'object') throw new Error('Ungültige Einstellungen.');
    const next = { ...this.settings };
    if ('theme' in patch) { if (!themes.includes(patch.theme) && patch.theme !== 'Custom') throw new Error('Ungültiges Theme.'); next.theme = patch.theme; }
    if ('customAccent' in patch) {
      if (typeof patch.customAccent !== 'string' || (patch.customAccent && !/^#[0-9a-f]{6}$/i.test(patch.customAccent))) throw new Error('Ungültige Akzentfarbe.');
      next.customAccent = patch.customAccent;
    }
    if ('atmosphere' in patch) {
      let atmo = patch.atmosphere;
      if (atmo === 'obsidian') atmo = 'nebula';
      if (atmo === 'aurora') atmo = 'rain';
      if (!['nebula', 'grid', 'space', 'rain'].includes(atmo)) throw new Error('Ungültiger Hintergrund-Stil.');
      next.atmosphere = atmo;
    }
    if ('glow' in patch) {
      if (!['off','subtle','neon'].includes(patch.glow)) throw new Error('Ungültige Glow-Einstellung.');
      next.glow = patch.glow;
    }
    if ('clientId' in patch) {
      if (this.loginController) throw new Error('Bitte zuerst die Anmeldung abbrechen.');
      if (typeof patch.clientId !== 'string' || (patch.clientId && !/^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i.test(patch.clientId))) throw new Error('Die Anwendungs-ID muss eine gültige UUID sein.');
      next.clientId = patch.clientId;
    }
    if ('animations' in patch) next.animations = Boolean(patch.animations);
    if ('autoOpenLog' in patch) next.autoOpenLog = Boolean(patch.autoOpenLog);
    if ('discordRpc' in patch) {
      next.discordRpc = Boolean(patch.discordRpc);
      this.discordRpc.setEnabled(next.discordRpc);
      if (next.discordRpc) {
        if (this.game && this.profiles.selected()) {
          const profile = this.profiles.selected();
          this.discordRpc.setActivity({
            details: `Spielt ${profile.name}`,
            state: `${profile.version} (${profile.mode === 'caeser' ? 'Caeser Client' : profile.mode === 'fabric' ? 'Fabric' : 'Vanilla'})`,
            timestamps: { start: Math.floor(Date.now() / 1000) },
            assets: { large_image: CAESER_DISCORD_ICON, large_text: `Caeser Client v${this.appVersion || '0.3.23'}` }
          });
        } else {
          this.discordRpc.setActivity({
            details: 'Im Hauptmenü',
            state: 'Bereit zum Spielen',
            assets: { large_image: CAESER_DISCORD_ICON, large_text: `Caeser Client v${this.appVersion || '0.3.23'}` }
          });
        }
      }
    }
    if ('customWallpaper' in patch) {
      if (patch.customWallpaper === null) {
        next.customWallpaper = null;
      } else if (typeof patch.customWallpaper === 'object') {
        next.customWallpaper = { ...next.customWallpaper, ...patch.customWallpaper };
        if (typeof patch.customWallpaper.opacity === 'number') next.customWallpaper.opacity = Math.max(10, Math.min(100, patch.customWallpaper.opacity));
        if (typeof patch.customWallpaper.blur === 'number') next.customWallpaper.blur = Math.max(0, Math.min(30, patch.customWallpaper.blur));
      }
    }
    if ('language' in patch) {
      if (!['de', 'en'].includes(patch.language)) throw new Error('Ungültige Sprache.');
      next.language = patch.language;
    }
    if ('activeSkinId' in patch) {
      next.activeSkinId = String(patch.activeSkinId);
    }
    if ('cosmetics' in patch && patch.cosmetics && typeof patch.cosmetics === 'object') {
      const cur = next.cosmetics || { ...DEFAULT_COSMETICS };
      next.cosmetics = {
        wings: {
          type: ['none', 'angel', 'dragon'].includes(patch.cosmetics.wings?.type) ? patch.cosmetics.wings.type : (cur.wings?.type || 'none'),
          color: (typeof patch.cosmetics.wings?.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.cosmetics.wings.color)) ? patch.cosmetics.wings.color : (cur.wings?.color || '#a855f7')
        },
        head: {
          type: ['none', 'halo', 'horns'].includes(patch.cosmetics.head?.type) ? patch.cosmetics.head.type : (cur.head?.type || 'none'),
          color: (typeof patch.cosmetics.head?.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.cosmetics.head.color)) ? patch.cosmetics.head.color : (cur.head?.color || '#facc15')
        },
        pet: {
          type: ['none', 'self', 'custom', 'cube', 'ghost'].includes(patch.cosmetics.pet?.type) ? patch.cosmetics.pet.type : (cur.pet?.type || 'none'),
          color: (typeof patch.cosmetics.pet?.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.cosmetics.pet.color)) ? patch.cosmetics.pet.color : (cur.pet?.color || '#38bdf8'),
          customPlayer: typeof patch.cosmetics.pet?.customPlayer === 'string' ? patch.cosmetics.pet.customPlayer.slice(0, 32) : (cur.pet?.customPlayer || ''),
          customSkinUrl: typeof patch.cosmetics.pet?.customSkinUrl === 'string' ? patch.cosmetics.pet.customSkinUrl : (cur.pet?.customSkinUrl || '')
        }
      };
    }
    if ('activeAccount' in patch) { if (!this.accounts.some(a => a.id === patch.activeAccount)) throw new Error('Konto nicht gefunden.'); next.activeAccount = patch.activeAccount; }
    if (patch.javaPath === '') next.javaPath = '';
    await this.store.write('settings.json', next); this.settings = next; return this.state();
  }
  async login() {
    if (this.loginController) throw new Error('Eine Anmeldung läuft bereits.');
    if (!this.store.encryption.isEncryptionAvailable()) throw new Error('Windows-Kontoverschlüsselung nicht verfügbar.');
    const controller = new AbortController(); this.loginController = controller;
    try {
      const account = await require('../auth/sisu.cjs').login(this.openBrowser, controller.signal); controller.signal.throwIfAborted();
      this.accounts = [...this.accounts.filter(a => a.id !== account.id), account]; await this.saveAccounts();
      this.settings.activeAccount = account.id; await this.saveSettings(); return this.state();
    } finally { this.loginController = null; this.emit('auth-finished'); }
  }
  async removeAccount(id) {
    if (this.busy || this.loginController) throw new Error('Bitte warte, bis der laufende Vorgang abgeschlossen ist.');
    this.accounts = this.accounts.filter(a => a.id !== id);
    if (this.settings.activeAccount === id) this.settings.activeAccount = this.accounts[0]?.id || '';
    await this.saveAccounts(); await this.saveSettings(); return this.state();
  }
  async saveProfile(input) {
    validateProfile(input, this.maxMemoryMb);
    const existing = input?.id && this.profiles.data.profiles.find(p => p.id === input.id);
    if (existing && this.busy) throw new Error('Bitte warte, bis der Spielstart abgeschlossen ist.');
    if (!existing) {
      const data = await launcher.manifest(this.root);
      if (!data.versions.some(v => v.id === input?.version)) throw new Error('Diese Minecraft-Version ist nicht verfügbar.');
      if (['fabric','caeser'].includes(input.mode)) {
        const loaders = await json(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(input.version)}`);
        if (!loaders.length) throw new Error('Fabric ist für diese Minecraft-Version nicht verfügbar.');
      }
    }
    await this.profiles.save(input); return this.state();
  }
  async installCaeserMod(profileId) { return this.mods.installCaeserClientMod(profileId, this.resources); }
  async updateAccount(account) { this.accounts = this.accounts.map(a => a.id === account.id ? account : a); await this.saveAccounts(); }
  async launch() {
    if (this.mods.busy) throw new Error('Bitte warte, bis die Mods installiert wurden.');
    if (this.busy) throw new Error('Minecraft wird gerade gestartet. Bitte einen Moment warten.');
    const profile = this.profiles.selected(); if (!profile) throw new Error('Bitte zuerst ein Profil erstellen.');
    let account = this.accounts.find(a => a.id === this.settings.activeAccount);
    if (!account) throw new Error('Bitte zuerst mit einem Microsoft-Konto anmelden.');
    this.busy = true;
    const options = { ...profile, instanceKey: instanceKey(profile), javaPath: this.settings.javaPath, cosmetics: this.settings.cosmetics || DEFAULT_COSMETICS };
    const report = progress => this.emit('progress', progress); report({ stage: 'Konto wird geprüft', percent: null });
    try {
      account = await auth.refresh(account); await this.updateAccount(account);
      const prepared = await launcher.prepare({ root: this.root, ...options, resources: this.resources, report });
      account = await auth.refresh(account); await this.updateAccount(account);
      const child = launcher.start(prepared, account, options.memoryMb);
      this.games.add(child);
      this.game = child;
      const instanceId = 'inst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      child.instanceId = instanceId;
      const instanceData = {
        id: instanceId,
        profileId: profile.id,
        profileName: profile.name,
        profileIcon: profile.icon || null,
        profileVersion: profile.version,
        profileMode: profile.mode,
        accountName: account?.name || 'Player',
        startTime: Date.now(),
        endTime: null,
        status: 'running',
        exitCode: null,
        process: child,
        logs: []
      };
      this.instances.set(instanceId, instanceData);

      let session, timer;
      let buffer = '';
      const redact = text => String(text).replaceAll(account.accessToken, '[TOKEN]').replaceAll(account.refreshToken, '[TOKEN]');
      const parser = createLogParser(parsedLine => {
        const item = redact(parsedLine).slice(0, 2000);
        instanceData.logs.push(item);
        if (instanceData.logs.length > 3000) instanceData.logs.shift();
        this.logHistory.push(item);
        if (this.logHistory.length > 2500) this.logHistory.shift();
        this.emit('game-log', { instanceId, line: item, profileName: profile.name });
      });
      const output = data => {
        buffer += data.toString(); const lines = buffer.split(/\r?\n/); buffer = lines.pop();
        for (const line of lines) {
          parser.feed(line);
        }
        if (buffer.length > 16000) buffer = '';
      };
      child.stdout.on('data', output); child.stderr.on('data', output);
      child.once('spawn', () => {
        if (this.settings.discordRpc !== false) {
          this.discordRpc.setActivity({
            details: `Spielt ${profile.name}`,
            state: `${profile.version} (${profile.mode === 'caeser' ? 'Caeser Client' : profile.mode === 'fabric' ? 'Fabric' : 'Vanilla'})`,
            timestamps: { start: Math.floor(Date.now() / 1000) },
            assets: {
              large_image: CAESER_DISCORD_ICON,
              large_text: `Caeser Client v${this.appVersion || '0.3.23'}`
            }
          });
        }
        this.emit('game-spawn', {
          instanceId,
          instance: {
            id: instanceId,
            profileId: profile.id,
            profileName: profile.name,
            profileIcon: profile.icon || null,
            profileVersion: profile.version,
            profileMode: profile.mode,
            accountName: account?.name || 'Player',
            startTime: instanceData.startTime,
            status: 'running'
          },
          profileName: profile.name,
          autoOpenLog: this.settings.autoOpenLog !== false
        });
        session = new Session(this.profiles,profile.id); session.flush().catch(()=>this.emit('notice','Spielstatistik konnte nicht gespeichert werden.'));
        timer=setInterval(()=>session.flush().catch(()=>{}),15000); timer.unref();
      });
      child.once('close', async code => {
        clearInterval(timer);
        if (buffer) {
          parser.feed(buffer);
          buffer = '';
        }
        parser.flush();
        this.games.delete(child);
        if (this.games.size === 0) {
          this.game = null;
        }
        const wasManualStop = Boolean(child.wasKilledByUser || instanceData.stoppedByUser);
        instanceData.status = (code === 0 || wasManualStop ? 'stopped' : 'crashed');
        instanceData.exitCode = wasManualStop ? 0 : code;
        instanceData.endTime = Date.now();

        if (session) await session.flush().catch(()=>this.emit('notice','Spielstatistik konnte nicht gespeichert werden.'));

        let diagnosis = null;
        if (!wasManualStop && code !== 0 && code !== null) {
          try {
            diagnosis = await diagnoseCrash({
              code,
              logLines: instanceData.logs.length ? instanceData.logs : this.logHistory,
              profile,
              instanceDir: prepared.instance,
              maxMemoryMb: this.maxMemoryMb
            });
          } catch (err) {
            console.error('Fehler bei Crash-Diagnose:', err);
          }
        }

        if (this.games.size === 0 && this.settings.discordRpc !== false) {
          this.discordRpc.setActivity({
            details: 'Im Hauptmenü',
            state: 'Bereit zum Spielen',
            assets: { large_image: CAESER_DISCORD_ICON, large_text: `Caeser Client v${this.appVersion || '0.3.23'}` }
          });
        }

        this.emit('game-exit', {
          instanceId,
          code: wasManualStop ? 0 : code,
          diagnosis: wasManualStop ? null : diagnosis,
          wasManualStop,
          runningCount: this.games.size
        });
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      report({ stage: 'Minecraft läuft', percent: 100 });
      return { running: true, count: this.games.size, instanceId };
    } catch (error) {
      if (this.games.size === 0) this.game = null;
      report({ stage: 'Start fehlgeschlagen', percent: 0 });
      throw error;
    }
    finally { this.busy = false; }
  }
  stopGame(instanceId) {
    if (!instanceId) {
      for (const [id, inst] of this.instances.entries()) {
        if (inst.status === 'running' && inst.process) {
          this.stopGame(id);
        }
      }
      return true;
    }
    const inst = this.instances.get(instanceId);
    if (inst && inst.process && !inst.process.killed) {
      try {
        inst.stoppedByUser = true;
        if (inst.process) inst.process.wasKilledByUser = true;
        inst.process.kill('SIGTERM');
        setTimeout(() => {
          if (!inst.process.killed) {
            try { inst.process.kill('SIGKILL'); } catch {}
          }
        }, 3000);
        return true;
      } catch (e) {
        console.error('Fehler beim Stoppen der Instanz:', e);
        return false;
      }
    }
    return false;
  }
  async autoFixCrash(action) {
    return executeAutoFix(action, this);
  }
  async getScreenshots() {
    const fs = require('node:fs/promises');
    const { nativeImage } = require('electron');
    const dirs = new Set();
    dirs.add(path.join(this.root, 'screenshots'));
    try {
      const instancesRoot = path.join(this.root, 'instances');
      const entries = await fs.readdir(instancesRoot, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          dirs.add(path.join(instancesRoot, ent.name, 'screenshots'));
          try {
            const subEntries = await fs.readdir(path.join(instancesRoot, ent.name), { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isDirectory()) {
                dirs.add(path.join(instancesRoot, ent.name, sub.name, 'screenshots'));
              }
            }
          } catch {}
        }
      }
    } catch {}

    const appData = process.env.APPDATA || '';
    if (appData) {
      dirs.add(path.join(appData, '.minecraft', 'screenshots'));
    }

    const screenshots = [];
    const seenPaths = new Set();

    for (const dir of dirs) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (!file.toLowerCase().endsWith('.png')) continue;
          const fullPath = path.join(dir, file);
          if (seenPaths.has(fullPath)) continue;
          seenPaths.add(fullPath);

          const stat = await fs.stat(fullPath);
          const cacheKey = `${fullPath}:${stat.mtimeMs}:${stat.size}`;
          let thumb = this.screenshotThumbsCache ? this.screenshotThumbsCache.get(cacheKey) : '';
          if (!thumb) {
            try {
              const img = nativeImage.createFromPath(fullPath);
              if (!img.isEmpty()) {
                const size = img.getSize();
                const scale = Math.min(1, 380 / Math.max(size.width, 1));
                const thumbW = Math.max(1, Math.round(size.width * scale));
                const thumbH = Math.max(1, Math.round(size.height * scale));
                thumb = img.resize({ width: thumbW, height: thumbH, quality: 'good' }).toDataURL();
                if (this.screenshotThumbsCache) {
                  this.screenshotThumbsCache.set(cacheKey, thumb);
                }
              }
            } catch {}
          }

          screenshots.push({
            id: Buffer.from(fullPath).toString('base64url'),
            name: file,
            path: fullPath,
            size: stat.size,
            mtime: stat.mtimeMs,
            thumb: thumb || ''
          });
        }
      } catch {}
    }

    screenshots.sort((a, b) => b.mtime - a.mtime);
    return screenshots;
  }
  async getScreenshotFull(filePath) {
    const fs = require('node:fs/promises');
    const buf = await fs.readFile(filePath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  }
  async copyScreenshot(filePath) {
    const { clipboard, nativeImage } = require('electron');
    try {
      const img = nativeImage.createFromPath(filePath);
      if (!img.isEmpty()) {
        if (typeof clipboard.write === 'function') {
          clipboard.write({ image: img });
        } else if (typeof clipboard.writeImage === 'function') {
          clipboard.writeImage(img);
        }
      }
    } catch (e) {
      console.warn('Native image clipboard write failed:', e);
    }

    if (process.platform === 'win32') {
      this._clipboardQueue = (this._clipboardQueue || Promise.resolve())
        .then(() => this.copyScreenshotToWindowsClipboard(filePath))
        .catch(err => console.warn('Windows clipboard write failed:', err));
      await this._clipboardQueue;
    }
    return { ok: true };
  }

  async copyScreenshotToWindowsClipboard(filePath) {
    const { spawn } = require('node:child_process');
    const fs = require('node:fs');
    const helperExe = this.resources ? path.join(this.resources, 'caeser-clipboard.exe') : null;

    if (helperExe && fs.existsSync(helperExe)) {
      return new Promise((resolve) => {
        const child = spawn(helperExe, [path.resolve(filePath)], { windowsHide: true, stdio: 'ignore' });
        const timer = setTimeout(() => {
          try { child.kill(); } catch {}
          resolve(false);
        }, 1500);
        child.once('close', (code) => {
          clearTimeout(timer);
          resolve(code === 0);
        });
        child.once('error', () => {
          clearTimeout(timer);
          resolve(false);
        });
      });
    }

    const absPath = path.resolve(filePath).replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      'Add-Type -AssemblyName System.Drawing;',
      `$p = '${absPath}';`,
      '$img = [System.Drawing.Image]::FromFile($p);',
      '$data = New-Object System.Windows.Forms.DataObject;',
      '$data.SetImage($img);',
      '$files = New-Object System.Collections.Specialized.StringCollection;',
      '$files.Add($p);',
      '$data.SetFileDropList($files);',
      '[System.Windows.Forms.Clipboard]::SetDataObject($data, $true, 10, 50);',
      '$img.Dispose();'
    ].join('\n');

    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    return new Promise((resolve) => {
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle', 'Hidden',
        '-EncodedCommand', b64
      ], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        resolve(false);
      }, 3000);
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
      child.once('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }
  async openScreenshot(filePath) {
    const { shell } = require('electron');
    const err = await shell.openPath(filePath);
    if (err) throw new Error(err);
    return { ok: true };
  }
  async deleteScreenshot(filePath) {
    const fs = require('node:fs/promises');
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (this.screenshotThumbsCache) {
      for (const key of this.screenshotThumbsCache.keys()) {
        if (key.startsWith(filePath + ':')) {
          this.screenshotThumbsCache.delete(key);
        }
      }
    }
    return { ok: true };
  }
  async deleteAllScreenshots() {
    const fs = require('node:fs/promises');
    const list = await this.getScreenshots();
    let deleted = 0;
    for (const item of list) {
      try {
        await fs.unlink(item.path);
        deleted++;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    if (this.screenshotThumbsCache) {
      this.screenshotThumbsCache.clear();
    }
    return { ok: true, count: deleted };
  }
  async renameScreenshot(filePath, newName) {
    const fs = require('node:fs/promises');
    let clean = (newName || '').trim();
    if (!clean) throw new Error('Ungültiger Name.');
    if (!clean.toLowerCase().endsWith('.png')) clean += '.png';
    clean = clean.replace(/[<>:"/\\|?*]/g, '_');
    const dir = path.dirname(filePath);
    const target = path.join(dir, clean);
    if (target !== filePath) {
      try {
        await fs.access(target);
        throw new Error('Eine Datei mit diesem Namen existiert bereits.');
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      await fs.rename(filePath, target);
      if (this.screenshotThumbsCache) {
        for (const [k, v] of Array.from(this.screenshotThumbsCache.entries())) {
          if (k.startsWith(filePath + ':')) {
            this.screenshotThumbsCache.delete(k);
            const newK = k.replace(filePath + ':', target + ':');
            this.screenshotThumbsCache.set(newK, v);
          }
        }
      }
    }
    return { ok: true, path: target, name: clean };
  }
  async openScreenshotsFolder() {
    const fs = require('node:fs/promises');
    const { shell } = require('electron');
    const dir = path.join(this.root, 'screenshots');
    await fs.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
    return { ok: true };
  }
  destroy() {
    this.discordRpc.destroy();
  }
}
module.exports = { Controller };
