'use strict';
const path = require('path');
const { readJson, writeJsonAtomic } = require('./util');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.PANEL_DATA_DIR || path.join(ROOT, 'data'));
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULTS = {
  panelPort: 8080,
  // true: other PCs on the network can open the panel. false: only this PC.
  lanAccess: true,
  serverDir: 'server',
  backupDir: 'backups',
  jar: 'server.jar',
  javaPath: 'java',
  minMemoryMB: 1024,
  maxMemoryMB: 4096,
  jvmArgs: '',
  serverType: null,
  serverVersion: null,
  autoRestartOnCrash: true,
  stopTimeoutSec: 60,
  autoBackup: { enabled: false, everyHours: 24, keep: 7 }
};

let current = null;

function load() {
  const saved = readJson(CONFIG_FILE, {});
  current = Object.assign({}, DEFAULTS, saved, {
    autoBackup: Object.assign({}, DEFAULTS.autoBackup, saved.autoBackup || {})
  });
  if (process.env.PANEL_PORT) current.panelPort = parseInt(process.env.PANEL_PORT, 10);
  return current;
}

function get() {
  return current || load();
}

function update(patch) {
  const cfg = get();
  const next = Object.assign({}, cfg, patch);
  if (patch.autoBackup) next.autoBackup = Object.assign({}, cfg.autoBackup, patch.autoBackup);
  current = next;
  writeJsonAtomic(CONFIG_FILE, next);
  return next;
}

// Paths in the config may be relative to the panel folder.
function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function serverDir() {
  return resolvePath(get().serverDir);
}

function backupDir() {
  return resolvePath(get().backupDir);
}

module.exports = { ROOT, DATA_DIR, DEFAULTS, load, get, update, resolvePath, serverDir, backupDir };
