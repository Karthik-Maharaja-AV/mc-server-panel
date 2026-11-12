'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Write to a temp file first and rename, so a crash never leaves half a file.
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function writeTextAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

// Recursively list files under dir: [{ abs, rel, size, mtime, mode }]
async function walkFiles(dir, base = dir, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkFiles(abs, base, out);
    } else if (e.isFile()) {
      try {
        const st = await fsp.stat(abs);
        out.push({ abs, rel: path.relative(base, abs), size: st.size, mtime: st.mtime, mode: st.mode });
      } catch {
        /* file vanished while walking */
      }
    }
  }
  return out;
}

async function dirSize(dir) {
  const files = await walkFiles(dir);
  return files.reduce((n, f) => n + f.size, 0);
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + ' ' + units[i];
}

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

// True when `child` resolves to a path inside `parent` (prevents ../ escapes).
function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/;
const WORLD_NAME = /^[A-Za-z0-9_-]{1,64}$/;

module.exports = {
  readJson,
  writeJsonAtomic,
  writeTextAtomic,
  exists,
  walkFiles,
  dirSize,
  fmtBytes,
  lanAddresses,
  isInside,
  PLAYER_NAME,
  WORLD_NAME
};
