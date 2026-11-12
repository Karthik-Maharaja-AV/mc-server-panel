'use strict';
const EventEmitter = require('events');

/**
 * Only one long task (backup, restore, world generation, install) may run at a
 * time, because they all touch the world folder or the server process.
 */
class Jobs extends EventEmitter {
  constructor() {
    super();
    this.current = null;
  }

  busy() {
    return !!this.current;
  }

  async run(type, label, fn) {
    if (this.current) throw Object.assign(new Error(`Please wait: "${this.current.label}" is still running.`), { status: 409 });
    const job = { type, label, stage: 'Starting', pct: 0, startedAt: Date.now() };
    this.current = job;
    this.emit('job', job);
    const progress = (stage, pct) => {
      if (stage) job.stage = stage;
      if (typeof pct === 'number') job.pct = Math.max(0, Math.min(100, Math.round(pct)));
      this.emit('job', job);
    };
    try {
      const result = await fn(progress);
      this.emit('jobDone', { type, label, ok: true });
      return result;
    } catch (e) {
      this.emit('jobDone', { type, label, ok: false, error: e.message });
      throw e;
    } finally {
      this.current = null;
      this.emit('job', null);
    }
  }
}

module.exports = { Jobs };
