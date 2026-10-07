const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve('test-results');await fs.mkdir(out,{recursive:true});const data=await fs.mkdtemp(path.join(out,'workspace-ui-'));
 const env={...process.env,CAESER_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:process.env.CAESER_TEST_EXE?[]:['.'],...(process.env.CAESER_TEST_EXE?{executablePath:process.env.CAESER_TEST_EXE}:{}),env});
 const errors=[];
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>document.getElementById('connection-label').textContent==='Alles aktuell',null,{timeout:60000});
  await page.locator('[data-page="profiles"]').click();await page.locator('#new-profile').click();
  await page.locator('#profile-name').fill('Fabric 1.21.6');await page.locator('#profile-version').selectOption('1.21.6');await page.locator('[data-loader="fabric"]').click();
  await page.locator('#save-profile').click();await page.waitForFunction(()=>!document.getElementById('profile-dialog').open,null,{timeout:60000});
  for(const [width,height] of [[940,690],[1180,800],[1920,1080]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),[width,height]);
   await page.waitForFunction(w=>innerWidth===w,width);
   const rects=await page.locator('.profile-card').evaluateAll(cards=>cards.map(c=>({x:c.offsetLeft,y:c.offsetTop,w:c.offsetWidth})));
   assert.equal(rects[0].y,rects[1].y);assert.ok(rects[1].x>rects[0].x);
   assert.equal(await page.evaluate(()=>document.querySelector('.content').scrollWidth>document.querySelector('.content').clientWidth),false);
   await page.screenshot({path:path.join(out,`profiles-${width}.png`)});
  }
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1180,800));
  await page.locator('#profile-search').fill('1.21.6');assert.equal(await page.locator('.profile-card').count(),1);
  await page.locator('.profile-card h3').click();await page.waitForFunction(()=>document.getElementById('stat-storage').textContent!=='…');
  assert.equal(await page.locator('#stat-last').textContent(),'Noch nie');assert.equal(await page.locator('#stat-time').textContent(),'0 Min.');
  await page.locator('#add-mods').click();await page.locator('.mod-result').first().waitFor({timeout:60000});
  assert.equal(await page.locator('#mod-version-filter').textContent(),'1.21.6');
  await page.locator('#mod-search').fill('Mod Menu');
  const mod=page.locator('.mod-result').filter({has:page.locator('h3',{hasText:/^Mod Menu/})}).first();
  await mod.waitFor({timeout:60000});await page.waitForFunction(()=>[...document.querySelectorAll('.mod-result img')].slice(0,4).every(img=>img.complete));await page.screenshot({path:path.join(out,'modrinth-drawer.png')});
  await mod.locator('button').click();await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('wurde mit benötigten'),null,{timeout:120000});
  const state=await page.evaluate(()=>window.caeser.state());const p=state.profiles.find(p=>p.name==='Fabric 1.21.6');
  const details=await page.evaluate(id=>window.caeser.profileDetails(id),p.id);
  assert.ok(details.mods.length>=1);assert.ok(details.mods.every(m=>m.gameVersion==='1.21.6'&&m.loader==='fabric'));
  await page.locator('[data-source="curseforge"]').click();
  await page.locator('.mod-result').first().waitFor({timeout:60000});
  await page.locator('[data-close="mods-drawer"]').click();
  assert.equal(await page.locator('.installed-mod').count(),details.mods.length);
  const modWidth = await page.locator('.installed-mod').first().evaluate(el => el.offsetWidth);
  const containerWidth = await page.locator('.installed-mods').evaluate(el => el.offsetWidth);
  assert.ok(modWidth < containerWidth);
  await page.locator('.installed-mod input').first().uncheck();await page.waitForFunction(()=>document.querySelector('.installed-mod.disabled'));
  await page.locator('.installed-mod input').first().check();await page.waitForFunction(()=>!document.querySelector('.installed-mod.disabled'));
  await page.screenshot({path:path.join(out,'profile-details.png')});
  // Verify INHALTE tab switching & dynamic labels
  await page.locator('[data-content-tab="resourcepacks"]').click();
  assert.ok((await page.locator('#installed-title').textContent()).includes('Ressourcenpakete'));
  assert.equal(await page.locator('#add-mods-label').textContent(), 'Ressourcenpakete hinzufügen');
  await page.locator('#add-mods').click();
  await page.waitForFunction(()=>document.getElementById('mods-drawer').open);
  assert.equal(await page.locator('.drawer-cat-btn.selected').getAttribute('data-drawer-type'), 'resourcepacks');
  // Verify backdrop click to close (clicking in empty space on the left)
  await page.mouse.click(100, 300);
  await page.waitForFunction(()=>!document.getElementById('mods-drawer').open);
  // Return to mods tab
  await page.locator('[data-content-tab="mods"]').click();

  // Verify settings categories and themes
  await page.locator('[data-page="settings"]').click();
  assert.equal(await page.locator('.settings-nav-tab').count(), 2);
  await page.locator('[data-settings-category="themes"]').click();
  assert.equal(await page.locator('#cat-themes').isVisible(), true);
  assert.equal(await page.locator('#cat-general').isVisible(), false);
  await page.locator('[data-settings-category="general"]').click();
  assert.equal(await page.locator('#cat-general').isVisible(), true);
  assert.equal(await page.locator('#cat-themes').isVisible(), false);
  await page.locator('[data-settings-category="themes"]').click();
  await page.locator('[data-atmo="grid"]').click();
  await page.waitForFunction(()=>document.body.classList.contains('atmo-grid'));
  await page.waitForFunction(()=>document.getElementById('atmosphere-layer').classList.contains('atmo-grid'));
  await page.locator('[data-atmo="aurora"]').click();
  await page.waitForFunction(()=>document.getElementById('atmosphere-layer').classList.contains('atmo-aurora'));

  // Test custom wallpaper upload and removal
  await page.evaluate(async () => {
    const res = await window.caeser.setWallpaper({
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      type: 'image',
      name: 'test-wallpaper.png',
      opacity: 60,
      blur: 5
    });
    window.__update(res.state);
  });
  await page.waitForFunction(() => !document.getElementById('custom-wallpaper-layer').hidden);
  assert.equal(await page.locator('#wallpaper-opacity-val').textContent(), '60%');
  assert.equal(await page.locator('#wallpaper-blur-val').textContent(), '5 px');
  assert.equal(await page.locator('#btn-remove-wallpaper').isVisible(), true);
  await page.screenshot({path:path.join(out,'settings-custom-wallpaper.png')});

  await page.locator('#btn-remove-wallpaper').click();
  await page.waitForFunction(() => document.getElementById('custom-wallpaper-layer').hidden);

  await page.evaluate(()=>document.querySelector('.content').scrollTop = 0);
  await page.screenshot({path:path.join(out,'settings-categories.png')});

  await page.locator('[data-settings-category="general"]').click();
  // Verify auto-open log switch exists and can be toggled
  assert.equal(await page.locator('#auto-open-log').isChecked(), true);
  await page.locator('label:has(#auto-open-log)').click();
  await page.waitForFunction(async () => {
    const s = await window.caeser.state();
    return s.settings.autoOpenLog === false;
  });
  await page.locator('label:has(#auto-open-log)').click();
  await page.waitForFunction(async () => {
    const s = await window.caeser.state();
    return s.settings.autoOpenLog === true;
  });

  // Verify opening the detached log window
  const logWinPromise = app.waitForEvent('window');
  await page.evaluate(() => window.caeser.openLogWindow());
  const logWin = await logWinPromise;
  await logWin.waitForSelector('#terminal');
  assert.equal(await logWin.locator('#terminal').isVisible(), true);
  assert.equal(await logWin.locator('#btn-autoscroll').isVisible(), true);
  await logWin.screenshot({path:path.join(out,'detached-log-window.png')});
  await logWin.close();

  await page.locator('#lang-custom-toggle').click();
  await page.waitForFunction(()=>!document.getElementById('lang-custom-menu').hidden);
  await page.screenshot({path:path.join(out,'settings-lang-dropdown.png')});
  await page.locator('.lang-option[data-value="en"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-i18n="settingsTitle"]').textContent.trim() === 'Settings');
  await page.locator('#lang-custom-toggle').click();
  await page.locator('.lang-option[data-value="de"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-i18n="settingsTitle"]').textContent.trim() === 'Einstellungen');

  // Add a sample custom skin to verify window card actions (pencil, trash, select)
  await page.evaluate(async () => {
    const s = await window.caeser.addSkin({
      name: '2026-07-13_01.20',
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAT0lEQVR42u3BAQEAAACAkP6v7ggKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA1wEAAAe352X0AAAAASUVORK5CYII='
    });
    window.__update(s);
  });

  await page.locator('[data-page="skins"]').click();
  assert.equal(await page.locator('.skin-window-card').count(), 2);
  assert.equal(await page.locator('.skin-window-model').count(), 0);

  const steveCard = page.locator('.skin-window-card').first();
  assert.ok(await steveCard.locator('.delete-skin').isVisible());

  const customCard = page.locator('.skin-window-card').last();
  assert.ok(await customCard.locator('.edit-name').isVisible());
  assert.ok(await customCard.locator('.delete-skin').isVisible());

  // Test pencil icon to rename display name
  await customCard.locator('.edit-name').click();
  await page.waitForFunction(() => document.getElementById('rename-skin-dialog').open);
  await page.locator('#rename-skin-input').fill('Mein Super Skin');
  await page.locator('#save-skin-name').click();
  await page.waitForFunction(() => !document.getElementById('rename-skin-dialog').open);
  assert.equal(await customCard.locator('.skin-window-name').textContent(), 'Mein Super Skin');

  // Click on window card to select it
  await customCard.click();
  assert.ok(await customCard.evaluate(el => el.classList.contains('active')));

  // Verify header avatar head changed
  await page.waitForFunction(() => document.querySelector('#header-avatar img') !== null);

  // Test deleting Steve card
  await steveCard.locator('.delete-skin').click();
  await page.waitForFunction(() => document.querySelectorAll('.skin-window-card').length === 1);
  assert.equal(await page.locator('.skin-window-card').count(), 1);

  await page.screenshot({path:path.join(out,'skins-custom-window.png')});

  await page.locator('[data-page="play"]').click();await page.locator('#account-chip').click();
  assert.ok(await page.locator('#account-menu').evaluate(el=>el.matches(':popover-open')));
  await page.screenshot({path:path.join(out,'play-accounts.png')});await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log(`Workspace UI passed: 2 columns, search, INHALTE tabs, backdrop drawer close, settings categories & themes, language switcher, skins page, live Modrinth install (${details.mods.length} files) for 1.21.6.`);
 }finally{await app.close();}

})().catch(e=>{console.error(e);process.exitCode=1;});
