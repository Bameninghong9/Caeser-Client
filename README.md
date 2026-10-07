# Caeser Client 0.3.2

Windows-11-Launcher für Minecraft **Java Edition** im Look der Caeser-Mod. Kein offizielles Mojang- oder Microsoft-Produkt.

## Starten

- Installation: `dist/Caeser Client Setup 0.3.2.exe`
- Ohne Installation: `dist/Caeser-Client-Portable-0.3.2.exe`
- Entwicklung: `npm ci`, `npm start`
- Tests: `npm test` und `npm run test:ui`
- Build: `npm run build`. Bei bereits installiertem Electron: `npm run build -- --config.electronDist=node_modules/electron/dist`

## Spielen & Profiles

Unter **Profiles → Profil erstellen** legst du Name, Minecraft-Version, Spielart und RAM fest. Die Bildkarten bieten Vanilla, Fabric und die Caeser-Mod. Die Caeser-Mod unterstützt ausschließlich **1.21.11** und bringt Fabric API mit. Forge und NeoForge sind derzeit nicht implementiert.

Unter **Spielen** wählst du ein gespeichertes Profil aus und startest es. Java und Spieldateien werden automatisch heruntergeladen. Namen und RAM kannst du nachträglich bearbeiten. Version und Spielart bleiben für ein bestehendes Profil fest; für ein anderes Setup erstellst du ein neues Profil.

Jedes neue Profil erhält einen eigenen Spielordner. Gleiche Versionen teilen Downloads, aber keine Welten, Mods oder Spieleinstellungen. Die bisherigen globalen Einstellungen aus 0.1.0 werden beim ersten Start einmalig als Profil übernommen; dessen bisheriger Spielordner bleibt erhalten. Beim Entfernen eines Profils bleiben die Spieldateien auf der Festplatte.

## Profilansicht & Mods

Die Profilübersicht zeigt zwei kompakte Karten pro Reihe, auch im normalen Fenster. Suche und Erstellung liegen oben rechts. Ein Klick auf die Karte öffnet zuletzt gespielt, gesamte Spielzeit, belegten Profilspeicher und installierte Mods. Spielzeit zählt ab dem gestarteten Java-Prozess und wird alle 15 Sekunden sowie beim Beenden gespeichert. Gemeinsame Java-/Minecraft-Downloads zählen nicht zum Profilspeicher.

**Mods hinzufügen** öffnet rechts den Mod-Browser. Minecraft-Version und Loader kommen unveränderlich aus dem Profil. Modrinth funktioniert direkt; passende Dateien und erforderliche Abhängigkeiten werden erneut geprüft, mit Prüfsummen heruntergeladen und erst nach erfolgreichem Download veröffentlicht. Installierte Mods lassen sich deaktivieren. Die mitgelieferten Caeser-Dateien bleiben geschützt. Während Minecraft läuft sind Mod-Änderungen gesperrt.

**CurseForge** benötigt einen eigenen API-Schlüssel unter **Einstellungen → Mod-Quellen** (alternativ `CAESER_CURSEFORGE_KEY`). Er wird mit Windows `safeStorage` in `integrations.bin` verschlüsselt. Ohne Schlüssel erscheint eine verständliche Einrichtungsmeldung. Downloads, die ein Mod-Autor für Drittanbieter-Launcher deaktiviert hat, werden nicht umgangen. Der Adapter ist mit API-Testantworten geprüft; ein echter CurseForge-Download ist mangels Schlüssel noch nicht bestätigt.

Bereits vorhandene Mods werden nicht automatisch aktualisiert. Bei widersprüchlichen festen Abhängigkeiten wird die Installation abgebrochen. Vanilla-Profile unterstützen keine Mods. Verschiedene Mods können trotz passender Spielversion miteinander inkompatibel sein.

## Microsoft-Anmeldung

**Mit Microsoft anmelden** öffnet direkt ein separates Fenster mit der echten Microsoft-Seite „Weiter zu Minecraft“ und dem E-Mail-Feld. Eine Client-ID-Eingabe oder Registrierung durch den Nutzer ist nicht erforderlich. Der Login verwendet den Xbox-SISU-Ablauf wie der Windows-Anmeldeweg der NoRisk-Referenz, mit dessen fest eingebauter öffentlicher Microsoft-Anwendungskennung. Es werden ausschließlich Microsoft-/Xbox-/Minecraft-Dienste kontaktiert, keine NoRisk-Dienste.

Der Ablauf erzeugt einen P-256-Geräteschlüssel und signierte Xbox-Anfragen, verwendet PKCE und prüft den zufälligen Rückleitungs-State. Das Microsoft-Fenster besitzt weder Node-Zugriff noch Preload oder Launcher-IPC. Die Rückleitung wird abgefangen und das Fenster geschlossen; danach werden Xbox-, Minecraft-Zugang und Java-Profil geprüft.

Passwörter bleiben bei Microsoft. Refresh-Token und Geräteschlüssel werden mit Windows `safeStorage` in `accounts.bin` verschlüsselt. Die Sitzung wird nach einem Neustart geladen und bei Bedarf erneuert. Bestehende Sitzungen des vorherigen OAuth-Ablaufs bleiben erneuerbar. Das Entfernen eines Kontos entfernt seine lokale gespeicherte Sitzung.

`node tests/login-window.cjs` prüft den echten SISU-Start bis zum sichtbaren Microsoft-E-Mail-Feld ohne hinterlegte ID sowie Schließen, Abbrechen und erneutes Öffnen. Ein vollständiger Login mit einem echten Nutzerkonto und authentifizierter Spielstart sind noch nicht bestätigt. Die gesamte Token-Kette und Erneuerung sind mit simulierten Dienstantworten getestet.

## Projektstruktur

```text
src/
  main.cjs             Einstiegspunkt
  preload.cjs          Eng begrenzte IPC-Schnittstelle
  app/                 Fenster, Lebenszyklus, IPC und Ablaufsteuerung
  auth/                Microsoft/Xbox/Minecraft, OAuth mit PKCE
  data/                Profile, Migration und verschlüsselte Speicherung
  game/                Installation, Java und Spielstart
  mods/                Modrinth/CurseForge, Abhängigkeiten und Profilinhalte
  shared/              Downloads, Prüfsummen, sichere Archivextraktion
ui/
  index.html           Oberfläche und Dialoge
  app.css              Gestaltung
  modules/             Spielen, Profile, Konten, Einstellungen und gemeinsame UI-Funktionen
  assets/              Schrift, Logo und SVG-Bildkarten
tests/                 Kernlogik, Profile, OAuth, Archive und Electron-Oberfläche
```

## Daten & Grenzen

Alle Benutzerdaten liegen unter `%APPDATA%/Caeser Client/`:

- `profiles.json`: Namen, Versionen, Spielarten, RAM und aktives Profil.
- `settings.json`: Theme, Java-Einstellung und aktive Konto-ID.
- `accounts.bin`: Windows-verschlüsselte Sitzungen.
- `minecraft/instances/profiles/<profil-id>/<version>-<spielart>/`: neue Profilordner.

Der Mojang-Katalog enthält Releases, Snapshots und historische Versionen. Alte Versionen können Einschränkungen auf Windows 11 haben. Nicht jede Kombination wurde gestartet. Eine abgelaufene Sitzung und neue Downloads benötigen Internet. Der Launcher bleibt während des Spiels geöffnet. Die Windows-Dateien sind unsigniert; ein Auto-Updater ist nicht enthalten.

## Prüfung

- Automatisierte Tests prüfen Profile, Migration, getrennte Spielordner, RAM, Neustart-Persistenz, OAuth-State/PKCE/Abbruch, Startargumente, Download-Prüfsummen und Archivpfade.
- Mod-Tests prüfen genaue Version/Loader, Abhängigkeiten, Konflikte, Rollback, Deaktivierung und Spielzeit-Persistenz. `node tests/workspace-ui.cjs` prüft das Layout bei 940, 1180 und 1920 Pixeln sowie eine echte Modrinth-Installation von Mod Menu samt Abhängigkeiten für Fabric 1.21.6 in isolierten Testdaten.
- Electron-Tests prüfen Profilerstellung, Bearbeitung, Auswahl, Entfernen, Themes und Neustart-Persistenz. Eine synthetische Sitzung wird mit echtem Windows `safeStorage` verschlüsselt und nach dem Neustart geladen; Tokens gelangen nicht in die UI.
- Der vollständige echte Download für Caeser 1.21.11 wurde bereits in 0.1.0 geprüft: Java 21, 84 Klassenpfad-Einträge, 4.591 Assets, Fabric und Mod.
- Die echte Microsoft-E-Mail-Seite wurde live erreicht. Der vollständige Kontologin und authentifizierte Spielstart benötigen noch den Test durch den Kontoinhaber.

## Herkunft

Die Mod, Schrift und das ursprüngliche Logo stammen aus dem bereitgestellten Projekt `C:/Users/thorb/.gemini/antigravity/scratch/BameClient`. Das Originalprojekt wurde nicht geändert. Die Mod deklariert CC0-1.0. Die Loader-Bildkarten sind neue SVG-Illustrationen. Rechte an Drittanbieter-Assets sollten vor öffentlicher Verbreitung geklärt werden.
