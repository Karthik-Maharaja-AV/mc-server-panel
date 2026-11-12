'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');

const config = require('./config');
config.load();
const auth = require('./auth');
const players = require('./players');
const props = require('./properties');
const serverprops = require('./serverprops');
const { describe } = require('./propmeta');
const installer = require('./installer');
const { MinecraftServer } = require('./mc');
const { Jobs } = require('./jobs');
const { Backups } = require('./backups');
const { Worlds, FLAT_PRESETS, BIOMES } = require('./worlds');
const { lanAddresses, PLAYER_NAME } = require('./util');

const mc = new MinecraftServer();
const jobs = new Jobs();
const log = (msg, lvl) => mc.panelLine(msg, lvl);
const backups = new Backups({ mc, jobs, log });
const worlds = new Worlds({ mc, jobs, backups, log });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use(express.json({ limit: '256kb' }));

// Basic hardening: no framing, no sniffing, only our own scripts.
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'");
  next();
});

// Reject cross-site form posts: every state-changing API call must be JSON.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.headers['content-type'] && !req.is('application/json')) {
    return res.status(415).json({ error: 'Send JSON.' });
  }
  next();
});

app.use(express.static(path.join(config.ROOT, 'public'), { index: 'index.html', maxAge: 0 }));

const clientIp = (req) => (req.socket.remoteAddress || '').replace(/^::ffff:/, '');

function requireUser(perm) {
  return (req, res, next) => {
    const user = auth.userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    if (perm && !auth.can(user, perm)) return res.status(403).json({ error: "You don't have permission to do that." });
    auth.touch(user.username, clientIp(req));
    req.user = user;
    next();
  };
}

// Wrap async handlers so thrown errors become JSON responses.
const h = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    if (!res.headersSent) res.status(e.status || 400).json({ error: e.message || 'Something went wrong.' });
  });
};

// ---------- session ----------
app.get('/api/session', (req, res) => {
  res.json({ setupNeeded: !auth.hasUsers(), user: auth.userFromRequest(req) });
});

app.post('/api/setup', h(async (req, res) => {
  if (auth.hasUsers()) throw Object.assign(new Error('Setup is already done.'), { status: 409 });
  const { username, password } = req.body || {};
  auth.createUser({ username, password, owner: true });
  const { token, user } = auth.login(username, password, clientIp(req));
  res.setHeader('Set-Cookie', auth.cookieHeader(token, req));
  res.json({ user });
}));

app.post('/api/login', h(async (req, res) => {
  const { username, password } = req.body || {};
  const { token, user } = auth.login(username, password, clientIp(req));
  res.setHeader('Set-Cookie', auth.cookieHeader(token, req));
  res.json({ user });
}));

app.post('/api/logout', (req, res) => {
  const u = auth.userFromRequest(req);
  if (u) auth.logout(u.token);
  res.setHeader('Set-Cookie', auth.clearCookieHeader());
  res.json({ ok: true });
});

app.post('/api/account/password', requireUser(), h(async (req, res) => {
  const { current, password } = req.body || {};
  auth.login(req.user.username, current, clientIp(req)); // verifies the current password
  auth.updateUser(req.user.username, { password });
  res.setHeader('Set-Cookie', auth.clearCookieHeader());
  res.json({ ok: true });
}));

// ---------- overview ----------
app.get('/api/overview', requireUser(), h(async (req, res) => {
  const cfg = config.get();
  res.json({
    status: mc.status(),
    stats: await mc.stats(),
    job: jobs.current,
    server: {
      installed: fs.existsSync(mc.jarPath()),
      type: cfg.serverType,
      version: cfg.serverVersion,
      eula: installer.eulaAccepted(),
      port: serverprops.get('server-port', '25565'),
      levelName: serverprops.levelName(),
      maxPlayers: parseInt(serverprops.get('max-players', '20'), 10)
    },
    panel: { port: cfg.panelPort, lanAccess: cfg.lanAccess, addresses: lanAddresses().map((a) => a.address) }
  });
}));

// ---------- power ----------
app.post('/api/server/:action', requireUser('power'), h(async (req, res) => {
  const a = req.params.action;
  if (jobs.busy() && a !== 'kill') throw Object.assign(new Error(`Wait for "${jobs.current.label}" to finish.`), { status: 409 });
  if (a === 'start') mc.start();
  else if (a === 'stop') mc.stop();
  else if (a === 'restart') mc.restart().catch((e) => log(e.message, 'ERROR'));
  else if (a === 'kill') mc.kill();
  else throw Object.assign(new Error('Unknown action.'), { status: 404 });
  log(`${a[0].toUpperCase() + a.slice(1)} requested by ${req.user.username}.`);
  res.json({ ok: true });
}));

// ---------- console ----------
app.get('/api/console', requireUser('console'), (req, res) => {
  res.json({ lines: mc.lines });
});

app.post('/api/console', requireUser('commands'), h(async (req, res) => {
  const cmd = String((req.body || {}).command || '').trim();
  if (!cmd) throw new Error('Type a command first.');
  if (cmd.length > 1000) throw new Error('That command is too long.');
  mc.send(cmd, req.user.username);
  res.json({ ok: true });
}));

// ---------- players ----------
app.get('/api/players', requireUser(), (req, res) => {
  res.json({ players: players.list(mc.online), running: mc.state === 'running' });
});

app.post('/api/players', requireUser('players'), h(async (req, res) => {
  const { name, action, reason } = req.body || {};
  if (!PLAYER_NAME.test(name || '')) throw new Error('Player names are 1–16 letters, numbers or underscores.');
  const make = players.ACTIONS[action];
  if (!make) throw new Error('Unknown action.');
  if (mc.state !== 'running') throw Object.assign(new Error('Start the server to change players.'), { status: 409 });
  const safeReason = reason ? String(reason).replace(/[\r\n]+/g, ' ').slice(0, 200) : '';
  mc.send(make(name, safeReason), req.user.username);
  res.json({ ok: true });
}));

// ---------- server.properties ----------
app.get('/api/properties', requireUser('settings'), (req, res) => {
  const text = serverprops.readText();
  const entries = props.parse(text).filter((l) => l.type === 'prop').map((l) => Object.assign(describe(l.key, l.value), { value: l.value }));
  res.json({ exists: text.length > 0, entries, raw: text, running: mc.isRunning() });
});

app.put('/api/properties', requireUser('settings'), h(async (req, res) => {
  const { set = {}, remove = [] } = req.body || {};
  if (typeof set !== 'object' || !Array.isArray(remove)) throw new Error('Bad request.');
  for (const k of Object.keys(set).concat(remove)) {
    if (!props.KEY_RE.test(k)) throw new Error(`"${k}" is not a valid property name.`);
  }
  for (const [k, v] of Object.entries(set)) {
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new Error(`Bad value for ${k}.`);
    if (String(v).length > 4000) throw new Error(`Value for ${k} is too long.`);
  }
  serverprops.write({ set, remove });
  const n = Object.keys(set).length + remove.length;
  log(`server.properties saved by ${req.user.username} (${n} change${n === 1 ? '' : 's'}).${mc.isRunning() ? ' Restart to apply.' : ''}`);
  res.json({ ok: true });
}));

// ---------- backups ----------
app.get('/api/backups', requireUser('files'), h(async (req, res) => {
  res.json({ backups: await backups.list(), auto: config.get().autoBackup, folder: config.backupDir(), world: serverprops.levelName() });
}));

app.post('/api/backups', requireUser('files'), h(async (req, res) => {
  if (jobs.busy()) throw Object.assign(new Error(`Wait for "${jobs.current.label}" to finish.`), { status: 409 });
  backups.create({ name: (req.body || {}).name, type: 'Manual' }).catch((e) => log('Backup failed: ' + e.message, 'ERROR'));
  res.status(202).json({ ok: true });
}));

app.post('/api/backups/:id/restore', requireUser('files'), h(async (req, res) => {
  if (jobs.busy()) throw Object.assign(new Error(`Wait for "${jobs.current.label}" to finish.`), { status: 409 });
  backups.find(req.params.id);
  log(`Restore requested by ${req.user.username}.`);
  backups.restore(req.params.id).catch((e) => log('Restore failed: ' + e.message, 'ERROR'));
  res.status(202).json({ ok: true });
}));

app.get('/api/backups/:id/download', requireUser('files'), h(async (req, res) => {
  const { backup, path: p } = backups.filePath(req.params.id);
  res.download(p, backup.file);
}));

app.delete('/api/backups/:id', requireUser('files'), h(async (req, res) => {
  await backups.remove(req.params.id);
  res.json({ ok: true });
}));

app.put('/api/backups/settings', requireUser('files'), h(async (req, res) => {
  const b = req.body || {};
  const everyHours = Math.min(24 * 30, Math.max(1, parseInt(b.everyHours, 10) || 24));
  const keep = Math.min(500, Math.max(1, parseInt(b.keep, 10) || 7));
  config.update({ autoBackup: { enabled: !!b.enabled, everyHours, keep } });
  res.json({ auto: config.get().autoBackup });
}));

// ---------- worlds ----------
app.get('/api/worlds', requireUser('files'), h(async (req, res) => {
  res.json({ worlds: await worlds.list(), flatPresets: Object.keys(FLAT_PRESETS), biomes: BIOMES });
}));

app.post('/api/worlds', requireUser('files'), h(async (req, res) => {
  if (jobs.busy()) throw Object.assign(new Error(`Wait for "${jobs.current.label}" to finish.`), { status: 409 });
  const p = worlds.generate(req.body || {});
  p.catch((e) => log('World generation failed: ' + e.message, 'ERROR'));
  res.status(202).json({ ok: true });
}));

app.post('/api/worlds/:name/activate', requireUser('files'), h(async (req, res) => {
  if (jobs.busy()) throw Object.assign(new Error(`Wait for "${jobs.current.label}" to finish.`), { status: 409 });
  worlds.activate(req.params.name).catch((e) => log('Switching world failed: ' + e.message, 'ERROR'));
  res.status(202).json({ ok: true });
}));

app.delete('/api/worlds/:name', requireUser('files'), h(async (req, res) => {
  await worlds.remove(req.params.name);
  res.json({ ok: true });
}));

// ---------- panel users ----------
app.get('/api/users', requireUser('access'), (req, res) => {
  res.json({ users: auth.listUsers(), perms: auth.PERMS });
});

app.post('/api/users', requireUser('access'), h(async (req, res) => {
  const { username, password, perms } = req.body || {};
  const user = auth.createUser({ username, password, perms: Array.isArray(perms) ? perms : ['console'] });
  log(`${req.user.username} gave panel access to ${user.username}.`);
  res.json({ user });
}));

app.put('/api/users/:username', requireUser('access'), h(async (req, res) => {
  const { perms, password } = req.body || {};
  if (perms && !req.user.owner && perms.includes('access')) throw Object.assign(new Error('Only the owner can grant "Manage panel access".'), { status: 403 });
  const user = auth.updateUser(req.params.username, { perms: Array.isArray(perms) ? perms : undefined, password });
  res.json({ user });
}));

app.delete('/api/users/:username', requireUser('access'), h(async (req, res) => {
  if (req.params.username.toLowerCase() === req.user.username.toLowerCase()) throw new Error("You can't remove yourself.");
  auth.deleteUser(req.params.username);
  log(`${req.user.username} removed panel access for ${req.params.username}.`);
  res.json({ ok: true });
}));

// ---------- setup: server jar, Java, memory, EULA ----------
app.get('/api/setup/info', requireUser('settings'), h(async (req, res) => {
  const cfg = config.get();
  res.json({
    installed: fs.existsSync(mc.jarPath()),
    type: cfg.serverType,
    version: cfg.serverVersion,
    eula: installer.eulaAccepted(),
    java: await installer.javaVersion(cfg.javaPath),
    config: {
      javaPath: cfg.javaPath,
      minMemoryMB: cfg.minMemoryMB,
      maxMemoryMB: cfg.maxMemoryMB,
      jvmArgs: cfg.jvmArgs,
      autoRestartOnCrash: cfg.autoRestartOnCrash,
      panelPort: cfg.panelPort,
      lanAccess: cfg.lanAccess,
      serverDir: config.serverDir(),
      backupDir: config.backupDir()
    },
    totalMemoryMB: Math.round(require('os').totalmem() / 1024 / 1024)
  });
}));

app.get('/api/setup/versions', requireUser('settings'), h(async (req, res) => {
  res.json({ versions: await installer.versions(req.query.type) });
}));

app.get('/api/setup/version-info', requireUser('settings'), h(async (req, res) => {
  res.json(await installer.info(req.query.type, req.query.version));
}));

app.post('/api/setup/install', requireUser('settings'), h(async (req, res) => {
  const { type, version } = req.body || {};
  if (mc.child) throw Object.assign(new Error('Stop the server before changing its version.'), { status: 409 });
  if (jobs.busy()) throw Object.assign(new Error(`Wait for "${jobs.current.label}" to finish.`), { status: 409 });
  const meta = await installer.info(type, version);
  jobs
    .run('install', 'Install server', async (progress) => {
      progress('Connecting', 1);
      await installer.download(meta, progress);
      log(`Installed ${type === 'paper' ? 'Paper' : 'Vanilla'} ${version}${meta.build ? ' build ' + meta.build : ''}.`);
      progress('Done', 100);
    })
    .catch((e) => log('Install failed: ' + e.message, 'ERROR'));
  res.status(202).json({ ok: true, javaMin: meta.javaMin });
}));

app.post('/api/setup/eula', requireUser('settings'), h(async (req, res) => {
  if ((req.body || {}).accept !== true) throw new Error('Tick the box to accept the EULA.');
  installer.acceptEula();
  log(`Minecraft EULA accepted by ${req.user.username}.`);
  res.json({ ok: true });
}));

app.put('/api/setup/config', requireUser('settings'), h(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.javaPath !== undefined) {
    const jp = String(b.javaPath).trim();
    if (!jp || jp.length > 500 || /[\r\n]/.test(jp)) throw new Error('Enter a valid Java path.');
    patch.javaPath = jp;
  }
  if (b.minMemoryMB !== undefined) patch.minMemoryMB = Math.max(256, parseInt(b.minMemoryMB, 10) || 1024);
  if (b.maxMemoryMB !== undefined) patch.maxMemoryMB = Math.max(512, parseInt(b.maxMemoryMB, 10) || 4096);
  if (patch.minMemoryMB && patch.maxMemoryMB && patch.minMemoryMB > patch.maxMemoryMB) throw new Error('Minimum memory must not be more than maximum memory.');
  if (b.jvmArgs !== undefined) {
    const a = String(b.jvmArgs);
    if (a.length > 2000 || /[\r\n]/.test(a)) throw new Error('Extra Java arguments must be one line.');
    patch.jvmArgs = a;
  }
  if (b.autoRestartOnCrash !== undefined) patch.autoRestartOnCrash = !!b.autoRestartOnCrash;
  if (b.lanAccess !== undefined) {
    if (!req.user.owner) throw Object.assign(new Error('Only the owner can change network access.'), { status: 403 });
    patch.lanAccess = !!b.lanAccess;
  }
  config.update(patch);
  res.json({ ok: true, restartPanel: b.lanAccess !== undefined });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- live updates over WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on('upgrade', (req, socket, head) => {
  const user = auth.userFromRequest(req);
  const origin = req.headers.origin;
  const host = req.headers.host;
  let sameOrigin = false;
  try {
    sameOrigin = !origin || new URL(origin).host === host;
  } catch {
    sameOrigin = false;
  }
  if (!user || !sameOrigin || new URL(req.url, 'http://x').pathname !== '/ws') {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.token = user.token;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', () => {}); // clients only listen
  send(ws, { type: 'status', data: mc.status() });
  send(ws, { type: 'job', data: jobs.current });
});

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(msg, perm) {
  const text = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws.readyState !== 1) continue;
    // Re-check the session every time so removed users or revoked
    // permissions take effect immediately.
    const user = auth.userFromToken(ws.token);
    if (!user) {
      ws.close(4001, 'Signed out');
      continue;
    }
    if (perm && !auth.can(user, perm)) continue;
    ws.send(text);
  }
}

mc.on('line', (entry) => broadcast({ type: 'line', data: entry }, 'console'));
mc.on('status', (s) => broadcast({ type: 'status', data: s }));
mc.on('players', (list) => broadcast({ type: 'players', data: list }));
jobs.on('job', (j) => broadcast({ type: 'job', data: j }));
jobs.on('jobDone', (j) => broadcast({ type: 'jobDone', data: j }));

setInterval(async () => {
  broadcast({ type: 'stats', data: await mc.stats() });
}, 3000).unref();

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();

// ---------- start ----------
const cfg = config.get();
const host = cfg.lanAccess ? '0.0.0.0' : '127.0.0.1';
server.listen(cfg.panelPort, host, () => {
  const lines = [`Server panel is running.`, `  On this PC:      http://localhost:${cfg.panelPort}`];
  if (cfg.lanAccess) for (const a of lanAddresses()) lines.push(`  On your network: http://${a.address}:${cfg.panelPort}`);
  else lines.push('  Network access is off: only this PC can open the panel.');
  if (!auth.hasUsers()) lines.push('', 'Open the address above to create the owner account.');
  console.log(lines.join('\n'));
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${cfg.panelPort} is already in use. Close the other program or start with PANEL_PORT=8081.`);
  else console.error(e);
  process.exit(1);
});

// Stop Minecraft cleanly when the panel is closed, so the world is saved.
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nShutting down…');
  if (mc.child) {
    console.log('Stopping the Minecraft server and saving the world…');
    await mc.stop();
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
