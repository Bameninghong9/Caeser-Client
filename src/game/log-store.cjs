// Einzige Ablage für Spiel-Logs. Laufende Instanzen bleiben immer erhalten,
// von den beendeten werden nur die neuesten MAX_FINISHED_INSTANCES behalten.
const MAX_FINISHED_INSTANCES = 5;
const MAX_LINES_PER_INSTANCE = 3000;

class LogStore {
  constructor({ maxFinished = MAX_FINISHED_INSTANCES, maxLines = MAX_LINES_PER_INSTANCE } = {}) {
    this.maxFinished = maxFinished; this.maxLines = maxLines; this.instances = new Map();
    this.finishOrder = new Map(); this.sequence = 0;
  }
  add(meta) {
    const inst = {
      id: meta.id, profileId: meta.profileId || '', profileName: meta.profileName || 'Minecraft', profileIcon: meta.profileIcon || null,
      profileVersion: meta.profileVersion || '', profileMode: meta.profileMode || 'vanilla', accountName: meta.accountName || 'Player',
      startTime: meta.startTime || Date.now(), endTime: null, status: 'running', exitCode: null, logs: []
    };
    this.instances.set(inst.id, inst);
    return this.summary(inst);
  }
  push(id, line) {
    const inst = this.instances.get(id); if (!inst) return 0;
    inst.logs.push(String(line));
    if (inst.logs.length > this.maxLines) inst.logs.splice(0, inst.logs.length - this.maxLines);
    return inst.logs.length;
  }
  // Markiert eine Instanz als beendet, statt sie zu löschen, und räumt ältere beendete Instanzen auf.
  finish(id, { status, exitCode, endTime = Date.now() }) {
    const inst = this.instances.get(id); if (!inst) return null;
    Object.assign(inst, { status: status === 'crashed' ? 'crashed' : 'stopped', exitCode: exitCode ?? null, endTime });
    this.finishOrder.set(id, ++this.sequence);
    this.prune();
    return this.summary(inst);
  }
  prune() {
    // Reihenfolge des Beendens statt endTime, damit gleiche Zeitstempel nicht die neueste Instanz treffen.
    const order = id => this.finishOrder.get(id) || 0;
    const finished = [...this.instances.values()].filter(i => i.status !== 'running').sort((a, b) => order(b.id) - order(a.id));
    for (const old of finished.slice(this.maxFinished)) this.remove(old.id);
  }
  remove(id) { this.finishOrder.delete(id); return this.instances.delete(id); }
  clear(id) { const inst = this.instances.get(id); if (!inst) return false; inst.logs = []; return true; }
  get(id) { return this.instances.get(id) || null; }
  has(id) { return this.instances.has(id); }
  lines(id) { return [...(this.instances.get(id)?.logs || [])]; }
  latestId() { return [...this.instances.keys()].pop() || null; }
  summary(inst) {
    const { logs, ...rest } = inst;
    return { ...rest, lineCount: logs.length };
  }
  list() { return [...this.instances.values()].map(i => this.summary(i)); }
}
module.exports = { LogStore, MAX_FINISHED_INSTANCES, MAX_LINES_PER_INSTANCE };
