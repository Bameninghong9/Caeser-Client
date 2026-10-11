# CurseForge-Proxy (Vorlage)

`curseforge-worker.js` ist eine Vorlage für einen Cloudflare Worker. Er hält den CurseForge-Schlüssel des Projekts serverseitig, sodass er nicht in der ausgelieferten App steckt. Diese Vorlage wird **nicht** automatisch bereitgestellt.

## Was der Worker tut

- Leitet nur die vier GET-Routen weiter, die der Launcher nutzt: `/v1/mods/search`, `/v1/mods/{id}`, `/v1/mods/{id}/files`, `/v1/mods/{id}/files/{fileId}`. Alles andere ergibt 404, andere Methoden 405.
- Erlaubt pro Route nur bekannte Query-Parameter; bei der Suche muss `gameId=432` (Minecraft) und eine Klasse für Mods, Ressourcenpakete oder Shader gesetzt sein.
- Hängt den Schlüssel aus dem Secret `CURSEFORGE_API_KEY` an, cacht erfolgreiche Antworten 5 Minuten und begrenzt Anfragen grob pro IP.
- Sendet keine CORS-Header, damit fremde Webseiten den Proxy nicht im Browser nutzen können.

Downloads laufen weiterhin direkt über das CurseForge-CDN (`*.forgecdn.net`) und brauchen keinen Schlüssel.

## Einrichtung

1. Eigenen CurseForge-Schlüssel für das Caeser-Client-Projekt unter <https://console.curseforge.com/> beantragen. Keine Schlüssel anderer Launcher verwenden.
2. Cloudflare-Konto anlegen und [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installieren.
3. Worker anlegen, z. B. mit einer `wrangler.toml`:
   ```toml
   name = "caeser-curseforge"
   main = "curseforge-worker.js"
   compatibility_date = "2026-10-01"
   ```
4. Schlüssel als Secret hinterlegen (wird abgefragt, landet nicht im Code):
   ```
   wrangler secret put CURSEFORGE_API_KEY
   ```
5. Bereitstellen: `wrangler deploy`. Die ausgegebene URL notieren, z. B. `https://caeser-curseforge.<konto>.workers.dev`.
6. Den Launcher mit dieser URL bauen:
   ```
   set CAESER_CURSEFORGE_PROXY=https://caeser-curseforge.<konto>.workers.dev
   npm run build
   ```
   Der Launcher ruft dann `<URL>/v1/...` ohne Schlüssel auf.

## Hinweise

- Das Rate-Limit im Worker gilt pro Worker-Instanz und ist nur ein grober Schutz. Für strengere Grenzen eignen sich die Rate-Limiting-Regeln von Cloudflare oder ein Durable Object.
- Der Proxy ist öffentlich erreichbar. Wer die URL kennt, kann die erlaubten Lese-Routen nutzen; mehr gibt die Allowlist nicht her.
