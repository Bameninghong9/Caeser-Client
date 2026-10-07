const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const output=path.resolve('test-results');await fs.mkdir(output,{recursive:true});const data=await fs.mkdtemp(path.join(output,'login-window-'));
 const env={...process.env,CAESER_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:process.env.CAESER_TEST_EXE?[]:['.'],...(process.env.CAESER_TEST_EXE?{executablePath:process.env.CAESER_TEST_EXE}:{}),env});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>document.getElementById('build-version').textContent.trim().length>0);
  await page.locator('#account-chip').click();await page.locator('#add-account').click();
  const next=app.waitForEvent('window');await page.locator('#login-button').click();const popup=await next;
  await popup.locator('input[name="loginfmt"]').waitFor({timeout:60000});
  assert.equal(new URL(popup.url()).hostname,'login.live.com');
  await popup.screenshot({path:path.join(output,'microsoft-email-login.png')});
  assert.equal(await popup.evaluate(()=>typeof window.caeser),'undefined');assert.equal(await popup.evaluate(()=>typeof require),'undefined');
  const prefs=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getParentWindow()).webContents.getLastWebPreferences());
  assert.equal(prefs.sandbox,true);assert.equal(prefs.contextIsolation,true);assert.equal(prefs.nodeIntegration,false);assert.ok(!prefs.preload);
  await popup.close();await page.waitForFunction(()=>document.getElementById('login-pending').hidden);
  assert.equal(await page.locator('#login-button').isEnabled(),true);
  const second=app.waitForEvent('window');await page.locator('#login-button').click();await second;
  await page.locator('#cancel-login').click();await page.waitForFunction(()=>document.getElementById('login-pending').hidden);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  console.log('Live SISU popup passed without configured client ID: actual Microsoft email input, no Node/preload, close/cancel/retry cleanup. No account credentials entered.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
