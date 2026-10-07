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
const themes = ['Cyberpunk','Ultraviolet','Toxic','Inferno','Glacier','Bloodmoon','Aurora','Bubblegum','Limelight','Sunset','Electric','Nebula','Goldrush','Emerald','Plasma','Crimson'];
class Controller {
  constructor({ directory, encryption, resources, appVersion, emit, openBrowser }) {
    this.store = new Store(directory, encryption); this.root = path.join(directory, 'minecraft');
    Object.assign(this, { resources, appVersion, emit, openBrowser });
    this.maxMemoryMb = Math.max(1024, Math.min(65536, Math.floor(os.totalmem() / 1073741824 - 2) * 1024));
    this.profiles = new Profiles(this.store, this.maxMemoryMb);
    this.accounts = []; this.busy = false; this.game = null; this.loginController = null;
    this.secrets = {};
    this.logHistory = [];
    this.wallpaper = null;
    this.mods = new Mods({root:this.root, profiles:this.profiles, getKey:()=>this.secrets.curseforgeKey || process.env.CAESER_CURSEFORGE_KEY || DEFAULT_CURSEFORGE_KEY,
      assertIdle:()=>{if(this.busy || this.game) throw new Error('Bitte zuerst Minecraft beenden.');},report:data=>this.emit('mod-progress',data)});
  }
  async load() {
    this.settings = { theme: 'Ultraviolet', customAccent: '', atmosphere: 'obsidian', glow: 'subtle', clientId: '', javaPath: '', activeAccount: '', activeSkinId: 'account', hiddenSkins: [], skinNames: {}, language: 'de', animations: true, autoOpenLog: true, customWallpaper: null, ...await this.store.read('settings.json', {}) };
    this.skins = await this.store.read('skins.json', []);
    try { this.wallpaper = await this.store.read('wallpaper.json', null); } catch { this.wallpaper = null; }
    await this.profiles.load(this.settings);
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
      if (!['obsidian','grid','space','aurora'].includes(patch.atmosphere)) throw new Error('Ungültiger Hintergrund-Stil.');
      next.atmosphere = patch.atmosphere;
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
    if (this.busy || this.game) throw new Error('Minecraft wird bereits gestartet oder läuft noch.');
    const profile = this.profiles.selected(); if (!profile) throw new Error('Bitte zuerst ein Profil erstellen.');
    let account = this.accounts.find(a => a.id === this.settings.activeAccount);
    if (!account) throw new Error('Bitte zuerst mit einem Microsoft-Konto anmelden.');
    this.busy = true;
    const options = { ...profile, instanceKey: instanceKey(profile), javaPath: this.settings.javaPath };
    const report = progress => this.emit('progress', progress); report({ stage: 'Konto wird geprüft', percent: null });
    try {
      account = await auth.refresh(account); await this.updateAccount(account);
      const prepared = await launcher.prepare({ root: this.root, ...options, resources: this.resources, report });
      account = await auth.refresh(account); await this.updateAccount(account);
      const child = launcher.start(prepared, account, options.memoryMb); this.game = child;
      let session, timer;
      let buffer = '';
      const redact = text => String(text).replaceAll(account.accessToken, '[TOKEN]').replaceAll(account.refreshToken, '[TOKEN]');
      const output = data => {
        buffer += data.toString(); const lines = buffer.split(/\r?\n/); buffer = lines.pop();
        for (const line of lines) {
          const item = redact(line).slice(0, 2000);
          this.logHistory.push(item);
          if (this.logHistory.length > 2500) this.logHistory.shift();
          this.emit('game-log', item);
        }
        if (buffer.length > 16000) buffer = '';
      };
      child.stdout.on('data', output); child.stderr.on('data', output);
      child.once('spawn', () => {
        this.emit('game-spawn', { profileName: profile.name, autoOpenLog: this.settings.autoOpenLog !== false });
        session = new Session(this.profiles,profile.id); session.flush().catch(()=>this.emit('notice','Spielstatistik konnte nicht gespeichert werden.'));
        timer=setInterval(()=>session.flush().catch(()=>{}),15000); timer.unref();
      });
      child.once('close', async code => {
        clearInterval(timer);
        if (buffer) {
          const item = redact(buffer).slice(0, 2000);
          this.logHistory.push(item);
          this.emit('game-log', item);
        }
        this.game = null;
        if (session) await session.flush().catch(()=>this.emit('notice','Spielstatistik konnte nicht gespeichert werden.'));
        this.emit('game-exit', { code });
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      if (this.game) report({ stage: 'Minecraft läuft', percent: 100 });
      return { running: !!this.game };
    } catch (error) { this.game = null; report({ stage: 'Start fehlgeschlagen', percent: 0 }); throw error; }
    finally { this.busy = false; }
  }
}
module.exports = { Controller };
