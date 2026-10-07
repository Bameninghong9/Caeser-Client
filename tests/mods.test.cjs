const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {Mods}=require('../src/mods/service.cjs');
const {CurseForge,Modrinth}=require('../src/mods/providers.cjs');
const {Profiles}=require('../src/data/profiles.cjs');
const {Store}=require('../src/data/store.cjs');
const {Session}=require('../src/game/session.cjs');
const payload=Buffer.from('test mod content'),sha=createHash('sha512').update(payload).digest('hex');
const version=(id,dependencies=[])=>({id:id+'-v1',projectId:id,label:'1.0',gameVersions:['1.21.6'],loaders:['fabric'],file:{name:id+'.jar',url:'https://cdn.modrinth.com/'+id+'.jar',hash:sha,algorithm:'sha512'},dependencies});
async function fixture(t,versions){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'caeser-mods-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const profile={id:randomUUID(),version:'1.21.6',mode:'fabric',name:'Test',memoryMb:4096};
 const provider={version:async(p,id,pinned)=>versions[pinned||id],project:async id=>({title:id,iconUrl:''})};
 const mods=new Mods({root,profiles:{data:{profiles:[profile]}},getKey:()=>'',assertIdle:()=>{},providers:{modrinth:provider}});
 t.mock.method(global,'fetch',async()=>new Response(payload));return{mods,profile};
}
test('Mods install exact versions with required dependencies, persist, and toggle',async t=>{
 const {mods,profile}=await fixture(t,{main:version('main',[{projectId:'dep'}]),dep:version('dep')});
 let details=await mods.install({profileId:profile.id,source:'modrinth',projectId:'main'});
 assert.equal(details.mods.length,2);assert.ok(details.storageBytes>0);assert.ok(details.mods.every(m=>m.gameVersion==='1.21.6'&&m.loader==='fabric'));
 details=await mods.toggle({profileId:profile.id,name:'main.jar',enabled:false});assert.equal(details.mods.find(m=>m.name==='main').enabled,false);
 await assert.rejects(mods.install({profileId:profile.id,source:'modrinth',projectId:'main'}),/Aktiviere/);
 details=await mods.toggle({profileId:profile.id,name:'main.jar',enabled:true});assert.equal(details.mods.find(m=>m.name==='main').enabled,true);
 assert.equal((await mods.install({profileId:profile.id,source:'modrinth',projectId:'main'})).mods.length,2);
});
test('Wrong game/loader and conflicting pinned dependencies never install',async t=>{
 const bad={...version('bad'),gameVersions:['1.21.11']};const wrong={...version('wrong'),loaders:['forge']};
 const {mods,profile}=await fixture(t,{bad,wrong,main:version('main',[{projectId:'dep',versionId:'one'},{projectId:'dep',versionId:'two'}]),one:{...version('dep'),id:'one'},two:{...version('dep'),id:'two'}});
 for(const id of ['bad','wrong'])await assert.rejects(mods.install({profileId:profile.id,source:'modrinth',projectId:id}),/passt nicht/);
 await assert.rejects(mods.install({profileId:profile.id,source:'modrinth',projectId:'main'}),/Widersprüchliche/);
 assert.equal((await mods.details(profile.id)).mods.length,0);
});
test('A checksum failure rolls back the whole dependency batch',async t=>{
 const {mods,profile}=await fixture(t,{main:version('main',[{projectId:'dep'}]),dep:{...version('dep'),file:{...version('dep').file,hash:'0'.repeat(128)}}});
 await assert.rejects(mods.install({profileId:profile.id,source:'modrinth',projectId:'main'}));
 assert.equal((await mods.details(profile.id)).mods.length,0);
 assert.deepEqual((await fs.readdir(mods.folder(profile))).filter(n=>n.startsWith('.caeser-stage')),[]);
});
test('CurseForge requires key, sends exact filters, rejects wrong loader and restricted downloads',async t=>{
 const p={version:'1.21.6',mode:'fabric'};await assert.rejects(new CurseForge('').search(p,''),/API-Schlüssel/);
 const calls=[];let mode='wrong';
 t.mock.method(global,'fetch',async(url,options)=>{calls.push({url:new URL(url),options});return Response.json({data:[{id:1,modId:2,fileName:'a.jar',displayName:'a',gameVersions:['1.21.6',mode==='wrong'?'Forge':'Fabric'],downloadUrl:null,hashes:[],dependencies:[]}],pagination:{totalCount:1}});});
 const cf=new CurseForge('test-key');await assert.rejects(cf.version(p,'2'),/Keine passende/);mode='restricted';await assert.rejects(cf.version(p,'2'),/keinen direkten/);
 assert.equal(calls[0].url.searchParams.get('gameVersion'),'1.21.6');assert.equal(calls[0].url.searchParams.get('modLoaderType'),'4');assert.equal(calls[0].options.headers['x-api-key'],'test-key');
});
test('Modrinth search fixes the selected version and loader',async t=>{
 let url;t.mock.method(global,'fetch',async u=>{url=new URL(u);return Response.json({hits:[],total_hits:0});});
 await new Modrinth().search({version:'1.21.6',mode:'fabric'},'Sodium');
 const facets=JSON.parse(url.searchParams.get('facets')).flat();assert.ok(facets.includes('versions:1.21.6'));assert.ok(facets.includes('categories:fabric'));
});
test('Playtime deltas survive restart without double counting or losing profile edits',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'caeser-session-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const profiles=new Profiles(new Store(root),16384);await profiles.load({});const p=profiles.selected();let now=1000;
 const session=new Session(profiles,p.id,()=>now);await session.flush();now+=15000;const a=session.flush();now+=8000;const b=session.flush();await Promise.all([a,b]);
 await profiles.save({...p,name:'Renamed'});now+=7000;await session.flush();
 const restored=new Profiles(new Store(root),16384);await restored.load({});assert.equal(restored.selected().playtimeMs,30000);assert.equal(restored.selected().lastPlayedAt,1000);assert.equal(restored.selected().name,'Renamed');
});
test('Mods remove deletes file and updates manifest',async t=>{
 const {mods,profile}=await fixture(t,{main:version('main')});
 await mods.install({profileId:profile.id,source:'modrinth',projectId:'main'});
 let details=await mods.details(profile.id);assert.equal(details.mods.length,1);
 details=await mods.remove({profileId:profile.id,name:'main.jar'});
 assert.equal(details.mods.length,0);
});
test('Mods checkUpdates detects newer version and update applies it',async t=>{
 const oldVer=version('main');
 const newVer={...version('main'),id:'main-v2',label:'2.0',file:{...version('main').file,name:'main-2.0.jar'}};
 let currentVer=oldVer;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'caeser-mods-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const profile={id:randomUUID(),version:'1.21.6',mode:'fabric',name:'Test',memoryMb:4096};
 const provider={version:async()=>currentVer,project:async id=>({title:id,iconUrl:''})};
 const mods=new Mods({root,profiles:{data:{profiles:[profile]}},getKey:()=>'',assertIdle:()=>{},providers:{modrinth:provider}});
 t.mock.method(global,'fetch',async()=>new Response(payload));
 await mods.install({profileId:profile.id,source:'modrinth',projectId:'main'});
 let updates=await mods.checkUpdates(profile.id);assert.equal(updates.length,0);
 currentVer=newVer;updates=await mods.checkUpdates(profile.id);
 assert.equal(updates.length,1);assert.equal(updates[0].latestVersion,'2.0');
 const updated=await mods.update({profileId:profile.id,name:'main.jar'});
 assert.equal(updated.mods.length,1);assert.equal(updated.mods[0].version,'2.0');assert.equal(updated.mods[0].filename,'main-2.0.jar');
});
test('Resourcepacks and shaders install, persist, toggle and remove',async t=>{
 const rpVer = id => ({id:id+'-v1',projectId:id,label:'1.0',gameVersions:['1.21.6'],loaders:[],file:{name:id+'.zip',url:'https://cdn.modrinth.com/'+id+'.zip',hash:sha,algorithm:'sha512'},dependencies:[]});
 const {mods,profile}=await fixture(t,{myrp:rpVer('myrp'),myshader:rpVer('myshader')});
 let details=await mods.install({profileId:profile.id,source:'modrinth',projectId:'myrp',type:'resourcepacks'});
 assert.equal(details.resourcepacks.length,1);assert.equal(details.resourcepacks[0].filename,'myrp.zip');assert.equal(details.resourcepacks[0].enabled,true);
 details=await mods.toggle({profileId:profile.id,name:'myrp.zip',type:'resourcepacks',enabled:false});
 assert.equal(details.resourcepacks[0].enabled,false);
 details=await mods.install({profileId:profile.id,source:'modrinth',projectId:'myshader',type:'shaders'});
 assert.equal(details.shaders.length,1);assert.equal(details.shaders[0].filename,'myshader.zip');
 details=await mods.remove({profileId:profile.id,name:'myrp.zip',type:'resourcepacks'});
 assert.equal(details.resourcepacks.length,0);assert.equal(details.shaders.length,1);
 details=await mods.remove({profileId:profile.id,name:'myshader.zip',type:'shaders'});
 assert.equal(details.shaders.length,0);
});

