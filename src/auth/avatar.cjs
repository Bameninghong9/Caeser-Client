const { nativeImage } = require('electron');
const { json } = require('../shared/net.cjs');
const cache = new Map();
async function avatar(account) {
  const key = `${account.id}:${account.skinUrl || ''}`;
  if (cache.has(key)) return cache.get(key);
  try {
    let skinUrl = account.skinUrl;
    if (!skinUrl) {
      if (!account.accessToken || account.expiresAt < Date.now()) return null;
      const profile = await json('https://api.minecraftservices.com/minecraft/profile',{headers:{Authorization:`Bearer ${account.accessToken}`}});
      skinUrl = profile.skins?.find(s=>s.state === 'ACTIVE')?.url;
    }
    if (!skinUrl) return null;
    const url = new URL(skinUrl); if (url.hostname !== 'textures.minecraft.net') return null; url.protocol='https:';
    const response = await fetch(url,{signal:AbortSignal.timeout(15000)});
    if (!response.ok || Number(response.headers.get('content-length')) > 1048576) return null;
    const buffer=Buffer.from(await response.arrayBuffer()); if (buffer.length > 1048576) return null;
    const texture=nativeImage.createFromBuffer(buffer); const size=texture.getSize();
    if (size.width !== 64 || ![32,64].includes(size.height)) return null;
    const data = { base: texture.crop({x:8,y:8,width:8,height:8}).toDataURL(), overlay: texture.crop({x:40,y:8,width:8,height:8}).toDataURL(), skin: texture.toDataURL() };
    cache.set(key,data); return data;
  } catch { return null; }
}
module.exports = { avatar };
