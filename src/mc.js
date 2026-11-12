'use strict';
const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const pidusage = require('pidusage');
const config = require('./config');
const serverprops = require('./serverprops');
const slp = require('./slp');
const { parseLine, detectEvent, nowTime } = require('./logparse');

const MAX_LINES = 2000;
const POLL_MS = 10000;
const ANON_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Owns the Minecraft server process: start/stop, console in/out, and who is
 * online.
 *
 * Online players come from two sources, so the count is right on any server
 * type (Vanilla, Paper, Spigot, Fabric…) and with any join-message plugin:
 *  1. Server List Ping every few seconds: the authoritative player count, plus
 *     names when the server shares them.
 *  2. Console lines ("X joined the game" etc.): instant updates and names.
 *
 * Events: 'line' (entry), 'status' (state), 'players' ({ names, count }), 'event' ({type,value})
 */
class MinecraftServer extends EventEmitter {
  constructor() {
    super();
    this.state = 'stopped'; // stopped | starting | running | stopping
    this.child = null;
    this.lines = [];
    this.seq = 0;
    this.online = new Set();
    this.onlineCount = null; // from Server List Ping; null = unknown
    this.pollTimer = null;
    this.startedAt = null;
    this.lastExit = null;
    this.crashTimes = [];
    this.stopRequested = false;
    this.prevEntry = null;
    this.loadHistory();
  }

  // Show the tail of the last log so the console isn't empty after a panel restart.
  loadHistory() {
    try {
      const file = path.join(config.serverDir(), 'logs', 'latest.log');
      const text = fs.readFileSync(file, 'utf8');
      const tail = text.split(/\r?\n/).filter(Boolean).slice(-200);
      let prev = null;
      for (const raw of tail) {
        const p = parseLine(raw, prev);
        prev = p;
        this.push(Object.assign(p, { history: true }), false);
      }
      if (tail.length) this.push({ t: nowTime(), lvl: 'PANEL', msg: '— previous session above (from logs/latest.log) —' }, false);
    } catch {
      /* no log yet */
    }
  }

  push(entry, emit = true) {
    entry.id = ++this.seq;
    this.lines.push(entry);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    if (emit) this.emit('line', entry);
    return entry;
  }

  panelLine(msg, lvl = 'PANEL') {
    return this.push({ t: nowTime(), lvl, msg });
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.emit('status', this.status());
  }

  status() {
    return {
      state: this.state,
      startedAt: this.startedAt,
      pid: this.child ? this.child.pid : null,
      online: [...this.online],
      onlineCount: this.playerCount(),
      lastExit: this.lastExit
    };
  }

  playerCount() {
    return this.onlineCount === null ? this.online.size : Math.max(this.onlineCount, 0);
  }

  emitPlayers() {
    this.emit('players', { names: [...this.online], count: this.playerCount() });
  }

  // Load the console history of a different server folder (after linking one).
  reloadHistory() {
    this.lines = [];
    this.prevEntry = null;
    this.loadHistory();
  }

  startPolling() {
    this.stopPolling();
    this.pollPlayers();
    this.pollTimer = setInterval(() => this.pollPlayers(), POLL_MS);
    this.pollTimer.unref();
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    clearTimeout(this.pollSoon);
    this.pollTimer = null;
  }

  // Ask again shortly after a join/leave line, to confirm it.
  pollAfter(ms) {
    clearTimeout(this.pollSoon);
    this.pollSoon = setTimeout(() => this.pollPlayers(), ms);
    this.pollSoon.unref();
  }

  async pollPlayers() {
    if (this.state !== 'running') return;
    const port = parseInt(serverprops.get('server-port', '25565'), 10) || 25565;
    let host = serverprops.get('server-ip', '127.0.0.1');
    if (!host || host === '0.0.0.0' || host === '::') host = '127.0.0.1';
    let r;
    try {
      r = await slp.ping(host, port);
    } catch {
      return; // status disabled or server busy: keep what the console told us
    }
    if (this.state !== 'running') return;
    const before = JSON.stringify([this.playerCount(), [...this.online].sort()]);
    // Players who turned off "Allow Server Listings" show up as "Anonymous Player".
    const names = r.sample.filter((p) => p.id !== ANON_UUID && /^[.*]?[A-Za-z0-9_]{1,16}$/.test(p.name)).map((p) => p.name);
    this.onlineCount = r.online;
    if (r.online === 0) this.online.clear();
    else if (names.length === r.online) this.online = new Set(names);
    else for (const n of names) this.online.add(n);
    if (JSON.stringify([this.playerCount(), [...this.online].sort()]) !== before) this.emitPlayers();
  }

  isRunning() {
    return this.state === 'running' || this.state === 'starting';
  }

  jarPath() {
    return path.join(config.serverDir(), config.get().jar);
  }

  start() {
    if (this.child) throw new Error('The server is already running.');
    const cfg = config.get();
    const dir = config.serverDir();
    if (!fs.existsSync(this.jarPath())) throw new Error('No server jar found. Install one on the Setup page first.');
    const eula = path.join(dir, 'eula.txt');
    if (!fs.existsSync(eula) || !/eula\s*=\s*true/i.test(fs.readFileSync(eula, 'utf8'))) {
      throw new Error('You need to accept the Minecraft EULA on the Setup page first.');
    }
    const args = [`-Xms${cfg.minMemoryMB}M`, `-Xmx${cfg.maxMemoryMB}M`];
    if (cfg.jvmArgs && cfg.jvmArgs.trim()) args.push(...cfg.jvmArgs.trim().split(/\s+/));
    args.push('-jar', cfg.jar, 'nogui');

    this.panelLine(`Starting: ${cfg.javaPath} ${args.join(' ')}`);
    this.stopRequested = false;
    this.online.clear();
    this.onlineCount = null;
    this.prevEntry = null;
    this.startedAt = Date.now();
    this.setState('starting');

    let child;
    try {
      child = spawn(cfg.javaPath, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      this.setState('stopped');
      throw e;
    }
    this.child = child;

    const onLine = (raw) => this.handleOutput(raw);
    readline.createInterface({ input: child.stdout }).on('line', onLine);
    readline.createInterface({ input: child.stderr }).on('line', onLine);

    child.on('error', (err) => {
      this.panelLine(
        err.code === 'ENOENT'
          ? `Could not run Java ("${cfg.javaPath}"). Install Java or set the Java path on the Setup page.`
          : 'Failed to start: ' + err.message,
        'ERROR'
      );
    });
    child.stdin.on('error', () => {});
    child.on('exit', (code, signal) => this.handleExit(code, signal));
  }

  handleOutput(raw) {
    if (!raw.trim()) return;
    const entry = parseLine(raw, this.prevEntry);
    this.prevEntry = entry;
    this.push(entry);
    if (entry.cont) return;
    const ev = detectEvent(entry.msg);
    if (!ev) return;
    if (ev.type === 'done') {
      this.setState('running');
      this.startPolling();
    }
    if (ev.type === 'join' && !this.online.has(ev.value)) {
      this.online.add(ev.value);
      if (this.onlineCount !== null && this.onlineCount < this.online.size) this.onlineCount = this.online.size;
      this.emitPlayers();
      this.pollAfter(1500);
    }
    if (ev.type === 'leave' && this.online.has(ev.value)) {
      this.online.delete(ev.value);
      if (this.onlineCount !== null) this.onlineCount = Math.max(this.online.size, this.onlineCount - 1);
      this.emitPlayers();
      this.pollAfter(1500);
    }
    if (ev.type === 'listPlayers') {
      this.online = new Set(ev.value.names);
      this.onlineCount = ev.value.count;
      this.emitPlayers();
    }
    this.emit('event', ev);
  }

  handleExit(code, signal) {
    const crashed = !this.stopRequested && code !== 0;
    this.child = null;
    clearTimeout(this.killTimer);
    this.stopPolling();
    this.online.clear();
    this.onlineCount = null;
    this.emitPlayers();
    this.lastExit = { code, signal, at: Date.now(), crashed };
    this.startedAt = null;
    this.panelLine(
      crashed ? `Server stopped unexpectedly (exit code ${code}${signal ? ', ' + signal : ''}).` : 'Server stopped.',
      crashed ? 'ERROR' : 'PANEL'
    );
    this.setState('stopped');
    this.emit('exit', this.lastExit);

    if (crashed && config.get().autoRestartOnCrash) {
      const now = Date.now();
      this.crashTimes = this.crashTimes.filter((t) => now - t < 10 * 60 * 1000);
      this.crashTimes.push(now);
      if (this.crashTimes.length <= 3) {
        this.panelLine('Restarting automatically in 10 seconds…');
        this.restartTimer = setTimeout(() => {
          try {
            if (!this.child) this.start();
          } catch (e) {
            this.panelLine(e.message, 'ERROR');
          }
        }, 10000);
      } else {
        this.panelLine('Crashed 3 times in 10 minutes. Not restarting automatically. Check the errors above.', 'ERROR');
      }
    }
  }

  send(command, user) {
    const cmd = String(command).replace(/[\r\n]+/g, ' ').trim().replace(/^\//, '');
    if (!cmd) return;
    if (!this.child || this.state === 'stopping') throw new Error('The server is not running.');
    this.push({ t: nowTime(), lvl: 'CMD', msg: '> ' + cmd, user: user || null });
    this.child.stdin.write(cmd + '\n');
  }

  stop() {
    clearTimeout(this.restartTimer);
    if (!this.child) return Promise.resolve();
    const child = this.child;
    return new Promise((resolve) => {
      child.once('exit', () => resolve());
      if (this.state === 'stopping') return;
      this.stopRequested = true;
      this.setState('stopping');
      try {
        child.stdin.write('stop\n');
      } catch {
        /* ignore */
      }
      const secs = config.get().stopTimeoutSec;
      this.killTimer = setTimeout(() => {
        this.panelLine(`Server did not stop within ${secs}s, forcing it to close.`, 'WARN');
        child.kill('SIGKILL');
      }, secs * 1000);
    });
  }

  kill() {
    if (!this.child) return;
    this.stopRequested = true;
    this.panelLine('Force-closing the server process.', 'WARN');
    this.child.kill('SIGKILL');
  }

  async restart() {
    await this.stop();
    this.start();
  }

  // Resolve when a console message matches `re` (or reject after timeout).
  waitForLine(re, timeoutMs) {
    return new Promise((resolve, reject) => {
      const onLine = (e) => {
        if (re.test(e.msg)) {
          cleanup();
          resolve(e);
        }
      };
      const onExit = () => {
        cleanup();
        reject(new Error('Server stopped'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for the server'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off('line', onLine);
        this.off('exit', onExit);
      };
      this.on('line', onLine);
      this.on('exit', onExit);
    });
  }

  waitForState(state, timeoutMs) {
    if (this.state === state) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('status', on);
        reject(new Error('Timed out waiting for the server to be ' + state));
      }, timeoutMs);
      const on = (s) => {
        if (s.state === state) {
          clearTimeout(timer);
          this.off('status', on);
          resolve();
        } else if (s.state === 'stopped' && state !== 'stopped') {
          clearTimeout(timer);
          this.off('status', on);
          reject(new Error('The server stopped before it was ready'));
        }
      };
      this.on('status', on);
    });
  }

  async stats() {
    const cfg = config.get();
    const base = { cpu: 0, memory: 0, maxMemory: cfg.maxMemoryMB * 1024 * 1024, uptime: 0 };
    if (!this.child) return base;
    try {
      const u = await pidusage(this.child.pid);
      return { cpu: Math.round(u.cpu), memory: u.memory, maxMemory: base.maxMemory, uptime: this.startedAt ? Date.now() - this.startedAt : 0 };
    } catch {
      return base;
    }
  }
}

module.exports = { MinecraftServer };
