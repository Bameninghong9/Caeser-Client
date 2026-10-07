const fs = require('node:fs/promises');
const path = require('node:path');

async function findLatestCrashReport(instanceDir) {
  if (!instanceDir) return null;
  const crashDir = path.join(instanceDir, 'crash-reports');
  try {
    const entries = await fs.readdir(crashDir, { withFileTypes: true });
    const reports = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith('crash-') && entry.name.endsWith('.txt')) {
        const full = path.join(crashDir, entry.name);
        const stat = await fs.stat(full);
        reports.push({ path: full, name: entry.name, mtime: stat.mtimeMs });
      }
    }
    if (!reports.length) return null;
    reports.sort((a, b) => b.mtime - a.mtime);
    const newest = reports[0];
    // Check if created within last 3 minutes
    if (Date.now() - newest.mtime < 180000) {
      const content = await fs.readFile(newest.path, 'utf8');
      return { path: newest.path, name: newest.name, content };
    }
  } catch {}
  return null;
}

async function diagnoseCrash({ code, logLines = [], profile, instanceDir, maxMemoryMb = 8192 }) {
  const crashReport = await findLatestCrashReport(instanceDir);
  const recentLogs = logLines.slice(-250).join('\n');
  const fullText = (crashReport?.content ? crashReport.content + '\n' : '') + recentLogs;

  // 1. Out of Memory
  if (/OutOfMemoryError|Java heap space|insufficient memory to continue/i.test(fullText)) {
    const currentMb = profile?.memoryMb || 2048;
    const recommendedMb = Math.min(maxMemoryMb, Math.max(4096, currentMb + 2048));
    return {
      id: 'oom',
      code,
      title: 'Zu wenig Arbeitsspeicher (Out of Memory)',
      icon: '🧠',
      severity: 'error',
      cause: 'Minecraft hat den maximal zugewiesenen Arbeitsspeicher (RAM) überschritten und musste beendet werden.',
      details: `Aktuell zugewiesen: ${currentMb} MB. Empfohlene Zuweisung: ${recommendedMb} MB.`,
      recommendation: `Erhöhe den Arbeitsspeicher für dieses Profil auf mindestens ${recommendedMb} MB.`,
      crashReportPath: crashReport?.path || null,
      autoFix: currentMb < maxMemoryMb ? {
        type: 'increase-ram',
        buttonText: `RAM automatisch auf ${recommendedMb} MB erhöhen`,
        payload: { profileId: profile?.id, newMemoryMb: recommendedMb }
      } : null
    };
  }

  // 2. Java Version Mismatch
  const javaVersionMatch = fullText.match(/class file version (\d+)/i) || fullText.match(/UnsupportedClassVersionError/i);
  if (javaVersionMatch) {
    return {
      id: 'java-version',
      code,
      title: 'Inkompatible Java-Version',
      icon: '☕',
      severity: 'error',
      cause: 'Die Minecraft-Version oder installierte Mods benötigen eine andere Java-Version als aktuell verwendet wird.',
      details: javaVersionMatch[1] ? `Erforderliche Java-Klassenversion: ${javaVersionMatch[1]}` : 'Java-Laufzeitfehler.',
      recommendation: 'Setze den Java-Pfad zurück, damit Caeser Client automatisch die passende Version lädt.',
      crashReportPath: crashReport?.path || null,
      autoFix: {
        type: 'reset-java',
        buttonText: 'Java-Pfad automatisch zurücksetzen',
        payload: {}
      }
    };
  }

  // 3. Corrupted or Invalid Mod File / ZipException
  const corruptMatch = fullText.match(/Error analyzing \[.*?mods[\\/]([^\\/\]]+\.jar)\]/i)
    || fullText.match(/ZipException.*?\[.*?mods[\\/]([^\\/\]]+\.jar)\]/i)
    || fullText.match(/Error analyzing.*?([^\\/:]+\.jar):/i)
    || fullText.match(/mods[\\/]([^\\/:\s]+\.jar)/i);
  if (corruptMatch && /ZipException|Error analyzing|Mod discovery failed/i.test(fullText)) {
    const jarName = corruptMatch[1];
    return {
      id: 'corrupt-mod',
      code,
      title: 'Beschädigte Mod-Datei erkannt',
      icon: '📦',
      severity: 'error',
      cause: `Die Mod-Datei "${jarName}" ist beschädigt, leer oder keine gültige JAR-Datei (ZipException).`,
      details: `Fehler beim Analysieren von mods/${jarName}`,
      recommendation: `Entferne oder deaktiviere die ungültige Mod "${jarName}".`,
      crashReportPath: crashReport?.path || null,
      autoFix: {
        type: 'disable-mod',
        buttonText: `Mod "${jarName}" automatisch deaktivieren`,
        payload: { instanceDir, modName: jarName.replace(/\.jar$/i, '') }
      }
    };
  }

  // 3. Mod Conflict / Incompatibility
  const incompatMatch = fullText.match(/Mod '([^']+)' is incompatible with mod '([^']+)'/i)
    || fullText.match(/Mod '([^']+)' conflicts with mod '([^']+)'/i);
  if (incompatMatch) {
    const modA = incompatMatch[1];
    const modB = incompatMatch[2];
    return {
      id: 'mod-conflict',
      code,
      title: 'Mod-Konflikt erkannt',
      icon: '⚔️',
      severity: 'error',
      cause: `Die Mods "${modA}" und "${modB}" können nicht zusammen verwendet werden.`,
      details: `Inkompatibilität zwischen "${modA}" und "${modB}".`,
      recommendation: `Deaktiviere eine der beiden Mods im Profil, um das Spiel starten zu können.`,
      crashReportPath: crashReport?.path || null,
      autoFix: {
        type: 'disable-mod',
        buttonText: `Mod "${modB}" automatisch deaktivieren`,
        payload: { instanceDir, modName: modB }
      }
    };
  }

  // 4. Missing Dependency
  const reqMatch = fullText.match(/Mod '([^']+)' requires (?:version [^ ]+ of )?mod '([^']+)'/i)
    || fullText.match(/Could not find required mod: '([^']+)'/i)
    || fullText.match(/requires mod '([^']+)'/i);
  if (reqMatch) {
    const modHost = reqMatch[2] ? reqMatch[1] : 'Eine Mod';
    const missing = reqMatch[2] || reqMatch[1];
    return {
      id: 'missing-dep',
      code,
      title: 'Fehlende Mod-Abhängigkeit',
      icon: '🧩',
      severity: 'warning',
      cause: `${modHost} benötigt die Mod "${missing}", die aktuell nicht installiert ist.`,
      details: `Abhängigkeit "${missing}" fehlt.`,
      recommendation: `Installiere "${missing}" oder deaktiviere die anfordernde Mod "${modHost}".`,
      crashReportPath: crashReport?.path || null,
      autoFix: {
        type: 'disable-mod',
        buttonText: `Mod "${modHost}" automatisch deaktivieren`,
        payload: { instanceDir, modName: modHost }
      }
    };
  }

  // 5. Mixin / Injection Error
  const mixinMatch = fullText.match(/Critical injection failure:.*?in mod ([a-zA-Z0-9_\-]+)/i)
    || fullText.match(/MixinApplyError:.*?in mod ([a-zA-Z0-9_\-]+)/i)
    || fullText.match(/Error loading class:.*ClassNotFoundException: ([a-zA-Z0-9_.$]+)/i);
  if (mixinMatch) {
    const culprit = mixinMatch[1];
    return {
      id: 'mixin-error',
      code,
      title: 'Mod-Injektionsfehler (Mixin-Fehler)',
      icon: '⚡',
      severity: 'error',
      cause: `Eine Mod (${culprit}) konnte nicht erfolgreich in den Spielcode geladen werden.`,
      details: `Klasse oder Mixin-Fehler: ${culprit}`,
      recommendation: 'Überprüfe, ob die Mod für diese Minecraft-Version gedacht ist, oder deaktiviere sie.',
      crashReportPath: crashReport?.path || null,
      autoFix: {
        type: 'disable-mod',
        buttonText: `Mod "${culprit}" deaktivieren`,
        payload: { instanceDir, modName: culprit }
      }
    };
  }

  // 6. Graphics Driver / OpenGL
  if (/GLFW error 65542|Pixel format not accelerated|WGL: The driver does not appear to support OpenGL/i.test(fullText)) {
    return {
      id: 'opengl',
      code,
      title: 'Grafikkarten-Treiber Fehler (OpenGL)',
      icon: '🖥️',
      severity: 'error',
      cause: 'Dein Grafiktreiber unterstützt die für Minecraft benötigte OpenGL-Version nicht.',
      details: 'GLFW Error 65542 / WGL Pixelformat nicht beschleunigt.',
      recommendation: 'Aktualisiere den Grafiktreiber (NVIDIA, AMD oder Intel) und stelle sicher, dass Minecraft mit deiner dedizierten Grafikkarte ausgeführt wird.',
      crashReportPath: crashReport?.path || null,
      autoFix: null
    };
  }

  // 7. General Crash with Crash Report
  if (crashReport) {
    const descMatch = crashReport.content.match(/Description:\s*([^\r\n]+)/i);
    const summary = descMatch ? descMatch[1].trim() : 'Unerwarteter Fehler im Spiel.';
    return {
      id: 'crash-report',
      code,
      title: 'Spielabsturz mit Crash-Report',
      icon: '📄',
      severity: 'error',
      cause: summary,
      details: `Report gespeichert unter: ${crashReport.name}`,
      recommendation: 'Kopiere den Crash-Report oder überprüfe das Protokoll im Log-Fenster.',
      crashReportPath: crashReport.path,
      autoFix: null
    };
  }

  // 8. Unknown / Unclassified exit code
  return {
    id: 'unknown',
    code,
    title: `Minecraft beendet (Exit Code ${code})`,
    icon: '⚠️',
    severity: code === 0 ? 'info' : 'warning',
    cause: code === 0 ? 'Das Spiel wurde normal beendet.' : 'Das Spiel wurde unerwartet mit einem Fehlercode beendet.',
    details: `Exit-Code: ${code}`,
    recommendation: 'Öffne das Spielprotokoll, um detaillierte Fehlermeldungen von Minecraft einzusehen.',
    crashReportPath: null,
    autoFix: null
  };
}

async function executeAutoFix(action, controller) {
  if (!action || !action.type) throw new Error('Ungültige Reparatur-Aktion.');

  if (action.type === 'increase-ram') {
    const { profileId, newMemoryMb } = action.payload || {};
    if (!profileId || !newMemoryMb) throw new Error('Ungültige Profil-Angaben für RAM-Reparatur.');
    const profile = controller.profiles.data.profiles.find(p => p.id === profileId);
    if (!profile) throw new Error('Profil nicht gefunden.');
    await controller.profiles.save({ ...profile, memoryMb: newMemoryMb });
    return { success: true, message: `Arbeitsspeicher wurde erfolgreich auf ${newMemoryMb} MB erhöht!` };
  }

  if (action.type === 'reset-java') {
    await controller.updateSettings({ javaPath: '' });
    return { success: true, message: 'Java-Pfad wurde erfolgreich zurückgesetzt!' };
  }

  if (action.type === 'disable-mod') {
    const { instanceDir, modName } = action.payload || {};
    if (!instanceDir || !modName) throw new Error('Ungültige Mod-Angaben.');
    const modsDir = path.join(instanceDir, 'mods');
    const entries = await fs.readdir(modsDir, { withFileTypes: true });
    let disabledFile = null;
    const cleanMod = modName.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jar')) {
        const cleanEntry = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanEntry.includes(cleanMod) || entry.name.toLowerCase().includes(modName.toLowerCase())) {
          const oldPath = path.join(modsDir, entry.name);
          const newPath = path.join(modsDir, entry.name + '.disabled');
          await fs.rename(oldPath, newPath);
          disabledFile = entry.name;
          break;
        }
      }
    }

    if (disabledFile) {
      return { success: true, message: `Mod "${disabledFile}" wurde deaktiviert (.disabled)!` };
    }
    throw new Error(`Mod-Datei für "${modName}" konnte im mods-Ordner nicht gefunden werden.`);
  }

  throw new Error(`Unbekannter Reparatur-Typ: ${action.type}`);
}

module.exports = { diagnoseCrash, executeAutoFix, findLatestCrashReport };
