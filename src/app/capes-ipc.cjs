// IPC-Handler der Capes-Seite. Alle Eingaben aus der UI werden hier geprüft; Netzwerk und Dateien bleiben im Hauptprozess.
// Die UI bekommt weder Tokens noch Dateipfade: Bilder gehen als Data-URL hinaus, Dateien nur über Dialoge hinein.
const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectUpload, buildCapeFromPhoto, previewPng, frontCrop, toDataUrl, MAX_INPUT_BYTES } = require('../backend/cape-image.cjs');
const { isCapeId, isVanillaCapeId } = require('../backend/caeser-api.cjs');

const SORTS = ['popular', 'new'];

const reject = () => { throw new Error('Ungültige Anfrage.'); };
const object = input => input && typeof input === 'object' && !Array.isArray(input) ? input : reject();
const capeId = id => isCapeId(id) ? id : reject();
function text(value, { min = 0, max, label }) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) reject();
  const clean = value.trim();
  if (clean.length < min || clean.length > max) throw new Error(`${label} muss ${min}–${max} Zeichen lang sein.`);
  return clean;
}
const fraction = value => value === undefined ? 0.5 : Number.isFinite(value) && value >= 0 && value <= 1 ? value : reject();

function createCapesHandlers({ controller, dialog, window, files = fs }) {
  const api = () => controller.caeserApi;
  let pending = null; // gewähltes Bild bis zum Hochladen: { kind, png | bitmap, offsetX, offsetY }

  const capeFromPending = (offsetX = pending.offsetX, offsetY = pending.offsetY) => {
    if (pending.kind === 'cape') return pending.png;
    pending.offsetX = offsetX; pending.offsetY = offsetY;
    return buildCapeFromPhoto(pending.bitmap, { offsetX, offsetY }).png;
  };

  return {
    'capes-config': async () => {
      const [config, me] = await Promise.all([api().config(), api().me()]);
      return { config, me };
    },
    'capes-list': (input = {}) => {
      const { sort = 'popular', q = '', cursor = '' } = object(input);
      if (!SORTS.includes(sort)) reject();
      if (typeof cursor !== 'string' || cursor.length > 512 || !/^[\x21-\x7e]*$/.test(cursor)) reject();
      return api().list({ sort, q: text(q, { max: 64, label: 'Die Suche' }), cursor });
    },
    'capes-mine': () => api().mine(),
    'capes-favorites': () => api().favorites(),
    'capes-favorite': input => {
      const { id, favorite } = object(input);
      if (typeof favorite !== 'boolean') reject();
      return api().setFavorite(capeId(id), favorite);
    },
    // { id: null } wählt das Caeser-Cape ab.
    'capes-select': input => {
      const { id } = object(input);
      return api().selectCape(id === null ? null : capeId(id));
    },
    'capes-report': input => {
      const { id, reason } = object(input);
      return api().report(capeId(id), text(reason, { min: 3, max: 300, label: 'Der Grund' }));
    },
    // { id } für Caeser-Capes, { vanilla } für Minecraft-Capes des aktiven Kontos. Keine URLs aus der UI.
    'capes-image': input => {
      const { id, vanilla } = object(input);
      if (id !== undefined) return api().image({ id: capeId(id) });
      if (!isVanillaCapeId(vanilla)) reject();
      return api().image({ vanilla });
    },
    'capes-upload-pick': async () => {
      const result = await dialog.showOpenDialog(window, {
        title: 'Cape-Bild auswählen', properties: ['openFile'], filters: [{ name: 'PNG-Bilder (*.png)', extensions: ['png'] }]
      });
      if (result.canceled || !result.filePaths?.length) return null;
      const file = result.filePaths[0];
      const stat = await files.stat(file);
      if (!stat.isFile() || !stat.size) throw new Error('Die gewählte Datei ist leer oder ungültig.');
      if (stat.size > MAX_INPUT_BYTES) throw new Error('Das Bild darf höchstens 5 MB groß sein.');
      const checked = inspectUpload(await files.readFile(file));
      const name = path.basename(file, path.extname(file)).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 32);
      if (checked.kind === 'cape') {
        pending = { kind: 'cape', png: checked.png };
        return { kind: 'cape', width: checked.width, height: checked.height, name, cape: toDataUrl(checked.png) };
      }
      pending = { kind: 'photo', bitmap: checked.bitmap, offsetX: 0.5, offsetY: 0.5 };
      const crop = frontCrop(checked.width, checked.height);
      return { kind: 'photo', width: checked.width, height: checked.height, name, photo: toDataUrl(previewPng(checked.bitmap)),
        frame: { width: crop.width / checked.width, height: crop.height / checked.height } };
    },
    // Ausschnitt verschieben: erzeugt die 512×256-Vorschau neu.
    'capes-upload-crop': input => {
      if (pending?.kind !== 'photo') throw new Error('Kein Bild zum Zuschneiden ausgewählt.');
      const { offsetX, offsetY } = object(input);
      return { cape: toDataUrl(capeFromPending(fraction(offsetX), fraction(offsetY))) };
    },
    'capes-upload-confirm': async input => {
      const { name, accepted, offsetX, offsetY } = object(input);
      if (accepted !== true) throw new Error('Bitte bestätige die Rechte am Bild.');
      const clean = text(name, { min: 1, max: 32, label: 'Der Name' });
      if (!pending) throw new Error('Bitte zuerst ein Bild auswählen.');
      const png = pending.kind === 'photo' ? capeFromPending(fraction(offsetX), fraction(offsetY)) : pending.png;
      const result = await api().upload(clean, png);
      pending = null;
      return result;
    },
    'capes-upload-cancel': () => { pending = null; return true; },
    'vanilla-capes': () => api().vanillaCapes(),
    // { id: null } blendet das Minecraft-Cape aus.
    'vanilla-cape-select': input => {
      const { id } = object(input);
      if (id !== null && !isVanillaCapeId(id)) reject();
      return api().setVanillaCape(id);
    }
  };
}
module.exports = { createCapesHandlers };
