const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { encodePng } = require('../src/backend/cape-image.cjs');
(async () => {
  const output = path.resolve('test-results'); await fs.mkdir(output,{recursive:true});
  const profile = await fs.mkdtemp(path.join(output,'profiles-ui-'));
  const env = {...process.env,CAESER_TEST_DATA:profile}; delete env.ELECTRON_RUN_AS_NODE;
  const options = {args:process.env.CAESER_TEST_EXE ? [] : ['.'],...(process.env.CAESER_TEST_EXE ? {executablePath:process.env.CAESER_TEST_EXE} : {}),env};
  let app; const errors=[]; let savedId;
  const boot = async () => {
    app = await electron.launch(options); const page = await app.firstWindow();
    page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('connection-label').textContent !== 'Versionen laden …',null,{timeout:60000});
    return page;
  };
  try {
    let page = await boot();
    assert.equal(await page.locator('nav [data-page]').count(),5);
    await page.locator('[data-page="profiles"]').click(); await page.locator('#new-profile').click();
    await page.locator('#profile-name').fill('Survival mit Freunden');
    await page.locator('#profile-version').selectOption('1.21.11'); await page.locator('[data-loader="fabric"]').click();
    await page.locator('#profile-memory').fill('3072');
    assert.match(await page.locator('#profile-memory-value').textContent(),/3072 MB/);
    await page.screenshot({path:path.join(output,'profile-editor.png')});
    await page.locator('#save-profile').click(); await page.waitForFunction(()=>!document.getElementById('profile-dialog').open,null,{timeout:60000});
    let state = await page.evaluate(()=>window.caeser.state());
    const created=state.profiles.find(p=>p.name==='Survival mit Freunden'); assert.ok(created); savedId=created.id;
    assert.equal(created.mode,'fabric'); assert.equal(created.memoryMb,3072); assert.equal(state.activeProfileId,savedId);
    const card=page.locator('.profile-card').filter({hasText:'Survival mit Freunden'});
    await card.locator('.edit-profile').click(); assert.equal(await page.locator('#profile-version').isDisabled(),true);
    await page.locator('#profile-name').fill('Meine Survival-Welt'); await page.locator('#profile-memory').fill('5120');
    await page.locator('#save-profile').click(); await page.waitForFunction(()=>!document.getElementById('profile-dialog').open);
    await page.locator('[data-page="play"]').click(); assert.equal(await page.locator('#selected-name').textContent(),'Meine Survival-Welt');
    assert.match(await page.locator('#selected-meta').textContent(),/5120 MB/);
    await page.locator('#play-button').click(); assert.ok(await page.locator('#accounts-dialog').evaluate(el=>el.open));
    assert.equal(await page.locator('#client-id').count(),0);
    await page.locator('[data-close="accounts-dialog"]').click();
    await page.locator('[data-page="settings"]').click();
    await page.locator('[data-settings-category="themes"]').click();
    await page.locator('[data-theme="Aurora"]').click(); await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--accent')==='#00e8b8');
    await page.locator('[data-theme="Ultraviolet"]').click();
    // Eigener Hintergrund: Dateidialog gemockt, Auslieferung über caeser-wallpaper: (CSP + Protokoll)
    const wallpaperFile = path.join(profile, 'test-wallpaper.png');
    await fs.writeFile(wallpaperFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, wallpaperFile);
    await page.locator('#btn-pick-wallpaper').click();
    await page.waitForFunction(() => { const img = document.querySelector('#custom-wallpaper-layer img'); return img && img.complete && img.naturalWidth === 1; }, null, { timeout: 15000 });
    assert.match(await page.locator('#custom-wallpaper-layer img').getAttribute('src'), /^caeser-wallpaper:\/\/media\/[a-f0-9-]{36}\.png$/);
    assert.ok((await fs.stat(path.join(profile, 'wallpaper.json'))).size < 1024);
    await page.evaluate(async () => window.__update((await window.caeser.setWallpaper({ opacity: 60, blur: 5 })).state));
    assert.equal(await page.locator('#wallpaper-opacity-val').textContent(), '60%');
    await assert.rejects(page.evaluate(() => window.caeser.setWallpaper({ data: 'data:image/png;base64,AAAA' })), /Dateiauswahl/);
    await page.locator('#btn-remove-wallpaper').click();
    await page.waitForFunction(() => document.getElementById('custom-wallpaper-layer').hidden);
    // Galerie: Anzeige, Großansicht, Umbenennen und Löschen laufen über IDs, rohe Pfade werden abgelehnt
    const shotDir = path.join(profile, 'minecraft', 'screenshots'); await fs.mkdir(shotDir, { recursive: true });
    const shotName = `ui-test-${Date.now()}.png`, shotData = await fs.readFile(wallpaperFile);
    await fs.writeFile(path.join(shotDir, shotName), shotData);
    await page.locator('[data-page="gallery"]').click();
    await page.locator('#gallery-search').fill('ui-test-');
    const shotCard = page.locator('.gallery-card').filter({ hasText: shotName });
    await shotCard.waitFor({ timeout: 15000 });
    await shotCard.locator('.gallery-thumb-wrap').click();
    await page.waitForFunction(full => document.getElementById('lightbox-img').src === full, `data:image/png;base64,${shotData.toString('base64')}`);
    await page.keyboard.press('Escape');
    await assert.rejects(page.evaluate(file => window.caeser.getScreenshotFull(file), path.join(shotDir, shotName)), /Screenshot nicht gefunden/);
    await assert.rejects(page.evaluate(() => window.caeser.openScreenshot('C:\\Windows\\System32\\notepad.exe')), /Screenshot nicht gefunden/);
    await shotCard.locator('.rename-btn').click();
    await page.locator('#rename-screenshot-input').fill('ui-test-umbenannt');
    await page.locator('#save-screenshot-name').click();
    const renamedCard = page.locator('.gallery-card').filter({ hasText: 'ui-test-umbenannt.png' });
    await renamedCard.waitFor();
    await fs.access(path.join(shotDir, 'ui-test-umbenannt.png'));
    await renamedCard.locator('.delete-btn').click(); await page.locator('#app-confirm-ok').click();
    await page.waitForFunction(() => !document.querySelector('.gallery-card'));
    for (let i = 0; i < 20 && await fs.access(path.join(shotDir, 'ui-test-umbenannt.png')).then(() => true, () => false); i++) await new Promise(r => setTimeout(r, 100));
    await assert.rejects(fs.access(path.join(shotDir, 'ui-test-umbenannt.png')));
    await page.locator('#gallery-search').fill('');
    await page.locator('[data-page="settings"]').click();
    await page.locator('[data-page="play"]').click(); await page.evaluate(()=>{document.getElementById('toast').hidden=true;document.body.classList.add('no-animation');});
    await page.screenshot({path:path.join(output,'caeser-client-v2.png')});
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,content:document.querySelector('.content').clientWidth,contentScroll:document.querySelector('.content').scrollWidth}));
    assert.equal(layout.width,layout.scroll);assert.equal(layout.content,layout.contentScroll);
    // Exercise Windows safeStorage on a synthetic session without logging into Microsoft.
    const testAccount = {id:'synthetic-test-account',name:'Speicher-Test',refreshToken:'synthetic-refresh-token',accessToken:'synthetic-access-token',expiresAt:0,clientId:'test'};
    const secondAccount = {...testAccount,id:'synthetic-second-account',name:'Zweites-Konto'};
    const encrypted = await app.evaluate(({ safeStorage }, accounts) => Array.from(safeStorage.encryptString(JSON.stringify(accounts))), [testAccount,secondAccount]);
    await fs.writeFile(path.join(profile,'accounts.bin'),Buffer.from(encrypted));
    const settingsFile=path.join(profile,'settings.json'), savedSettings=JSON.parse(await fs.readFile(settingsFile,'utf8'));
    savedSettings.activeAccount=testAccount.id; await fs.writeFile(settingsFile,JSON.stringify(savedSettings));
    assert.equal((await fs.readFile(path.join(profile,'accounts.bin'))).includes(Buffer.from('synthetic-refresh-token')),false);
    await app.close(); app=null;
    page=await boot(); state=await page.evaluate(()=>window.caeser.state());
    assert.equal(state.activeProfileId,savedId); assert.equal(state.profiles.find(p=>p.id===savedId).memoryMb,5120);
    assert.equal(state.accounts[0].name,'Speicher-Test'); assert.ok(!JSON.stringify(state).includes('synthetic-refresh-token'));
    await page.locator('#account-chip').click();
    assert.equal(await page.locator('.account-option').count(),2);
    assert.equal(await page.locator('.account-option .skin-head img').count(),2);
    await page.locator('.choose-account').filter({hasText:'Zweites-Konto'}).click();
    await page.waitForFunction(()=>document.getElementById('account-name').textContent==='Zweites-Konto');
    assert.equal((await page.evaluate(()=>window.caeser.state())).settings.activeAccount,'synthetic-second-account');
    await page.locator('#account-chip').click();
    await page.locator('.account-option').filter({hasText:'Zweites-Konto'}).locator('.remove-menu-account').click();
    await page.waitForFunction(()=>document.getElementById('account-name').textContent==='Speicher-Test');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.caeser.removeAccount('synthetic-test-account'));
    assert.equal(await page.locator('#selected-name').textContent(),'Meine Survival-Welt');
    // Profilname mit HTML wird überall als Text angezeigt
    const evilName = '<img src=x onerror=alert(1)>';
    const evilState = await page.evaluate(name => window.caeser.saveProfile({ name, version: '1.21.11', mode: 'vanilla', memoryMb: 2048 }), evilName);
    const evilId = evilState.profiles.find(p => p.name === evilName).id;
    await page.evaluate(s => window.__update(s), evilState);
    assert.equal(await page.locator('#dropdown-profiles-list strong').filter({ hasText: evilName }).count(), 1);
    await page.locator('[data-page="profiles"]').click();
    assert.equal(await page.locator('.profile-card h3').filter({ hasText: evilName }).count(), 1);
    assert.equal(await page.evaluate(() => document.querySelectorAll('img[src="x"]').length), 0);
    await page.evaluate(async id => window.__update(await window.caeser.removeProfile(id)), evilId);
    await page.evaluate(async id => window.__update(await window.caeser.selectProfile(id)), savedId);
    // CurseForge: keine Schlüssel-Eingabe mehr; der Reiter im Mod-Browser folgt der Build-Verfügbarkeit
    const cfState = await page.evaluate(() => window.caeser.state());
    assert.equal(typeof cfState.curseforgeAvailable, 'boolean'); assert.equal('curseforgeConfigured' in cfState, false);
    assert.equal(await page.evaluate(() => typeof window.caeser.setCurseForgeKey), 'undefined');
    await page.locator('[data-page="settings"]').click(); await page.locator('[data-settings-category="general"]').click();
    assert.equal(await page.locator('#mod-settings, #curseforge-key, #save-curseforge, #open-curseforge-console').count(), 0);
    await page.locator('[data-page="profiles"]').click();
    await page.locator('.profile-card h3').filter({ hasText: 'Meine Survival-Welt' }).click();
    await page.locator('#add-mods').click(); await page.waitForFunction(() => document.getElementById('mods-drawer').open);
    const cfTab = page.locator('[data-source="curseforge"]');
    assert.equal(await cfTab.isDisabled(), !cfState.curseforgeAvailable);
    if (!cfState.curseforgeAvailable) assert.equal(await cfTab.getAttribute('title'), 'In dieser Version nicht verfügbar');
    assert.equal(await page.locator('[data-source="modrinth"]').evaluate(el => el.classList.contains('selected')), true);
    await page.locator('[data-close="mods-drawer"]').click(); await page.waitForFunction(() => !document.getElementById('mods-drawer').open);
    // Log-Fenster mit verschärfter CSP: Script läuft, keine CSP-Fehler, Suchtext erscheint wörtlich
    const logConsole = [];
    const logWinPromise = app.waitForEvent('window');
    await page.evaluate(() => window.caeser.openLogWindow());
    const logWin = await logWinPromise;
    logWin.on('console', m => logConsole.push(m.text())); logWin.on('pageerror', e => logConsole.push(e.message));
    await logWin.waitForSelector('#terminal');
    await logWin.locator('#search-input').fill('<b>test</b>');
    await logWin.waitForFunction(() => document.querySelector('#terminal .empty-notice')?.textContent.includes('<b>test</b>'));
    assert.equal(await logWin.locator('#terminal b').count(), 0);
    assert.equal(await logWin.locator('#btn-share').isDisabled(), true);
    assert.equal(await logWin.locator('#btn-save').isDisabled(), true);
    await logWin.locator('#btn-autoscroll').click();
    assert.equal(await logWin.locator('#btn-autoscroll').evaluate(el => el.classList.contains('active')), false);
    // Jedes weitere init-logs (z. B. nach "×" an einer beendeten Instanz) muss die Liste neu zeichnen
    const sendInitLogs = ids => app.evaluate(({ BrowserWindow }, list) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('log-window.html'));
      const instances = list.map(id => ({ id, profileName: id, accountName: 'P', status: 'stopped', exitCode: 0, startTime: 1, endTime: 2, lineCount: 0 }));
      win.webContents.send('init-logs', { instances, activeInstanceId: list[0] || null, logs: [], language: 'de' });
    }, ids);
    await sendInitLogs(['ui-a', 'ui-b', 'ui-c']);
    await logWin.waitForFunction(() => document.querySelectorAll('.instance-card .btn-card-close').length === 3);
    await sendInitLogs(['ui-a', 'ui-c']);
    await logWin.waitForFunction(() => document.querySelectorAll('.instance-card').length === 2);
    assert.deepEqual(logConsole.filter(m => /Cannot set properties|Uncaught/i.test(m)), []);
    const scripts = await logWin.evaluate(() => ({ inline: document.querySelectorAll('script:not([src])').length, external: [...document.scripts].map(s => s.getAttribute('src')), csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content }));
    assert.deepEqual(scripts.external, ['log-window.js']); assert.equal(scripts.inline, 0);
    assert.doesNotMatch(scripts.csp, /unsafe-inline'[^;]*;?\s*style-src/); assert.match(scripts.csp, /script-src 'self';/);
    assert.deepEqual(logConsole.filter(m => /Content Security Policy|Refused to/i.test(m)), []);
    await logWin.close();
    await page.locator('[data-page="profiles"]').click();
    await page.screenshot({path:path.join(output,'profiles-v2.png')});
    await page.locator('.profile-card').filter({hasText:'Meine Survival-Welt'}).locator('.delete-profile').click();
    await page.locator('#confirm-delete').click(); await page.waitForFunction(()=>!document.getElementById('delete-dialog').open);
    assert.equal((await page.evaluate(()=>window.caeser.state())).profiles.some(p=>p.id===savedId),false);
    // Capes-Seite mit gemocktem Caeser-Backend und Mojang (fetch im Hauptprozess ersetzt)
    const capeAccount = {id:'0123456789abcdef0123456789abcdef',name:'CapeTester',refreshToken:'synthetic-refresh-token',accessToken:'synthetic-access-token',expiresAt:Date.now()+3600000,clientId:'test'};
    const capeEncrypted = await app.evaluate(({ safeStorage }, accounts) => Array.from(safeStorage.encryptString(JSON.stringify(accounts))), [capeAccount]);
    await fs.writeFile(path.join(profile,'accounts.bin'),Buffer.from(capeEncrypted));
    const capeSettings=JSON.parse(await fs.readFile(settingsFile,'utf8')); capeSettings.activeAccount=capeAccount.id; await fs.writeFile(settingsFile,JSON.stringify(capeSettings));
    await app.close(); app=null; page=await boot();
    const capePng = encodePng({ width: 64, height: 32, data: new Uint8Array(64 * 32 * 4).map((_, i) => i % 4 === 3 ? 255 : (i % 4 === 0 ? 180 : 60)) }).toString('base64');
    await app.evaluate((_, { png, session }) => {
      const base = 'https://caeser-backend.caeser-backend.workers.dev', original = globalThis.fetch, image = Buffer.from(png, 'base64');
      const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      const mockState = { capeId: null, mine: [], ids: ['c0ffee0000000000000000000000000000000000000000000000000000000001', 'c0ffee0000000000000000000000000000000000000000000000000000000002'] };
      globalThis.__capeMock = mockState;
      globalThis.fetch = async (url, options = {}) => {
        const target = new URL(String(url)), method = options.method || 'GET';
        if (target.origin === base) {
          if (target.pathname === '/v1/auth/challenge') return reply({ challengeId: 'ch', serverId: 'srv' });
          if (target.pathname === '/v1/auth/verify') return reply({ token: session, uuid: '0123456789abcdef0123456789abcdef', name: 'CapeTester', expiresAt: Date.now() + 3600000 });
          if (target.pathname.endsWith('.png')) return new Response(image, { headers: { 'Content-Type': 'image/png' } });
          if (options.headers?.Authorization !== `Bearer ${session}`) return reply({ error: 'Nicht angemeldet.', code: 'UNAUTHORIZED' }, 401);
          if (target.pathname === '/v1/me') return reply({ uuid: '0123456789abcdef0123456789abcdef', name: 'CapeTester', jetons: 300, capeId: mockState.capeId });
          if (target.pathname === '/v1/capes/config') return reply({ uploadPrice: 100, maxPending: 3, maxTotal: 10 });
          if (target.pathname === '/v1/capes' && method === 'GET') return reply({ items: [{ id: mockState.ids[0], name: 'Sternenhimmel', ownerName: 'Anna', uses: 12, createdAt: 1 }, { id: mockState.ids[1], name: 'Lava', ownerName: 'Ben', uses: 1, createdAt: 2 }], nextCursor: null });
          if (target.pathname === '/v1/capes' && method === 'POST') { const cape = { id: 'c0ffee00000000000000000000000000000000000000000000000000000000ff', name: target.searchParams.get('name'), ownerName: 'CapeTester', uses: 0, status: 'pending', pricePaid: 100 }; mockState.mine.unshift(cape); return reply({ cape, jetons: 200 }, 201); }
          if (target.pathname === '/v1/capes/mine') return reply({ items: [...mockState.mine, { id: 'c0ffee0000000000000000000000000000000000000000000000000000000003', name: 'Abgelehnt', ownerName: 'CapeTester', uses: 0, status: 'rejected', reason: 'Fremdes Logo', pricePaid: 100 }] });
          if (target.pathname === '/v1/capes/favorites') return reply({ items: [] });
          if (target.pathname === '/v1/me/cape') { mockState.capeId = JSON.parse(options.body).capeId; return reply({ capeId: mockState.capeId }); }
          return reply({ ok: true });
        }
        if (String(url) === 'https://sessionserver.mojang.com/session/minecraft/join') return new Response(null, { status: 204 });
        if (target.href.startsWith('https://api.minecraftservices.com/minecraft/profile')) {
          const active = method === 'PUT' ? JSON.parse(options.body).capeId : method === 'DELETE' ? null : '11111111-2222-3333-4444-555555555555';
          return reply({ id: '0123456789abcdef0123456789abcdef', name: 'CapeTester', skins: [], capes: [{ id: '11111111-2222-3333-4444-555555555555', state: active === '11111111-2222-3333-4444-555555555555' ? 'ACTIVE' : 'INACTIVE', url: 'https://textures.minecraft.net/texture/abcdef0123456789abcdef', alias: 'Migrator' }] });
        }
        if (target.hostname === 'textures.minecraft.net') return new Response(image);
        return original(url, options);
      };
    }, { png: capePng, session: 'synthetic-caeser-session' });
    await page.locator('[data-page="capes"]').click();
    assert.equal(await page.locator('#page-label').textContent(), 'Capes');
    await page.locator('#capes-grid .cape-card').nth(1).waitFor({ timeout: 15000 });
    assert.equal(await page.locator('.cape-active-badge').count(), 0);
    await page.waitForFunction(() => [...document.querySelectorAll('#capes-grid .cape-art')].every(el => el.style.backgroundImage.startsWith('url("data:image/png;base64,')));
    await page.locator('#capes-grid .cape-card').filter({ hasText: 'Sternenhimmel' }).click();
    await page.locator('#capes-grid .cape-card.active .cape-active-badge').waitFor();
    assert.equal(await page.locator('#capes-grid .cape-card.active .cape-active-badge').textContent(), 'AKTIV');
    assert.match(await page.locator('#capes-grid .cape-card.active').textContent(), /Sternenhimmel/);
    assert.equal(await app.evaluate(() => globalThis.__capeMock.capeId), 'c0ffee0000000000000000000000000000000000000000000000000000000001');
    await page.evaluate(() => document.body.classList.add('no-animation'));
    await page.screenshot({ path: path.join(output, 'capes.png') });
    await page.locator('[data-capes-tab="mine"]').click();
    await page.locator('#capes-grid .cape-status.rejected').waitFor();
    assert.equal(await page.locator('#capes-info').textContent(), '1 von 10 Uploads');
    assert.match(await page.locator('#capes-grid .cape-card.rejected').textContent(), /Fremdes Logo.*◆ 100 erstattet/);
    assert.equal(await page.locator('#capes-toolbar').isVisible(), false);
    await page.locator('[data-capes-tab="favorites"]').click();
    await page.waitForFunction(() => document.querySelector('#capes-grid .capes-empty')?.textContent.includes('Favoriten'));
    await page.locator('[data-capes-tab="vanilla"]').click();
    await page.locator('#capes-grid [data-vanilla-id="11111111-2222-3333-4444-555555555555"].active').waitFor();
    await page.locator('#capes-grid [data-vanilla-id="none"]').click();
    await page.locator('#capes-grid [data-vanilla-id="none"].active').waitFor();
    // Hochladen: Dateidialog gemockt, synthetisches 64x32-Cape
    const uploadFile = path.join(output, 'upload-cape.png'); await fs.writeFile(uploadFile, Buffer.from(capePng, 'base64'));
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, uploadFile);
    await page.locator('#capes-upload-button').click();
    await page.waitForFunction(() => document.getElementById('cape-upload-dialog').open);
    assert.equal(await page.locator('#cape-name').inputValue(), 'upload-cape');
    await page.waitForFunction(() => document.getElementById('cape-price').textContent.includes('Kostet ◆ 100'));
    assert.equal(await page.locator('#cape-upload-submit').isDisabled(), true);
    await page.locator('#cape-name').fill('Mein Test-Cape'); await page.locator('#cape-consent').check();
    await page.locator('#cape-upload-submit').click();
    await page.waitForFunction(() => document.getElementById('app-confirm-dialog').open);
    assert.equal(await page.locator('#app-confirm-title').textContent(), 'Schon jetzt für dich auswählen?');
    await page.locator('#app-confirm-ok').click();
    await page.locator('#capes-grid .cape-card.active').filter({ hasText: 'Mein Test-Cape' }).locator('.cape-status.pending').waitFor();
    assert.equal(await page.locator('[data-capes-tab="mine"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML.includes('synthetic-caeser-session') || document.documentElement.outerHTML.includes('synthetic-access-token')), false);
    await page.locator('[data-capes-tab="all"]').click();
    await page.locator('#capes-grid .cape-card').nth(1).waitFor();
    assert.equal(await page.locator('#capes-grid .cape-active-badge').count(), 0, 'neues Cape ist aktiv, nicht mehr die Galerie-Karte');
    // „Skin speichern“ im Spiel (Account-Brücke sendet skins-changed): die offene Skin-Seite zeigt den Skin sofort, mit Hinweis
    await page.locator('[data-page="skins"]').click();
    await page.locator('.skin-window-card[data-skin-id="account"]').waitFor();
    const skinCards = await page.locator('.skin-window-card').count();
    const importedId = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
      canvas.getContext('2d').fillRect(0, 0, 64, 64);
      const state = await window.caeser.addSkin({ name: 'Notch', data: canvas.toDataURL('image/png') }); // nur im Hauptprozess, die Seite weiß noch nichts
      return state.skins.at(-1).id;
    });
    assert.equal(await page.locator('.skin-window-card').count(), skinCards);
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'))
      .webContents.send('skins-changed', { id, name: 'Notch', player: 'Notch' }), importedId);
    await page.locator(`.skin-window-card[data-skin-id="${importedId}"]`).waitFor();
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Skin von Notch gespeichert.');
    assert.equal(await page.locator('.skin-window-card').count(), skinCards + 1);
    assert.deepEqual(errors,[]);
    console.log('UI passed: profile create/edit/delete, isolated settings, MB slider, real catalogue, mode selection, restart persistence, account gate, client-ID validation, theme changes, layout, capes page, live skin library refresh.');
  } finally { if(app) await app.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
