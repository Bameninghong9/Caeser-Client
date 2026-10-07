// Measure only the lifetime of the spawned game, never download/installation time.
class Session {
  constructor(profiles, profileId, now = () => Date.now()) { this.profiles = profiles; this.profileId = profileId; this.now = now; this.startedAt = now(); this.recorded = this.startedAt; this.queue = Promise.resolve(); }
  flush() {
    const end = this.now(), elapsedMs = Math.max(0,end-this.recorded); this.recorded = end;
    this.queue = this.queue.catch(()=>{}).then(()=>this.profiles.recordSession(this.profileId,this.startedAt,elapsedMs)); return this.queue;
  }
}
module.exports = { Session };
