'use strict';
/**
 * Linking a Minecraft server that already exists somewhere on this PC:
 * a folder browser for the Setup page, and a scan that finds the server jar,
 * worlds, EULA and the memory/Java settings from its start script.
 * Works for Vanilla, Paper, Spigot, Purpur and Fabric servers.
 */
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');
const props = require('./properties');

const IS_WIN = process.platform === 'win32';
const HIDDEN = new Set(['$Recycle.Bin', 'System Volume Information', 'node_modules', 'Library', 'AppData']);
const MAX_SCRIPT = 64 * 1024;

function looksLikeServer(dir) {
  return fs.existsSync(path.join(dir, 'server.properties')) || fs.existsSync(path.join(dir, 'eula.txt'));
}

// List sub-folders of `dir` (no files). Empty dir on Windows = list drives.
async function browse(dir) {
  if (!dir) dir = os.homedir();
  if (IS_WIN && (dir === 'drives' || dir === '\\' || dir === '/')) {
    const drives = [];
    for (let c = 65; c <= 90; c++) {
      const d = String.fromCharCode(c) + ':\\';
      if (fs.existsSync(d)) drives.push({ name: d, path: d, server: false });
    }
    return { path: '', parent: null, dirs: drives, home: os.homedir(), windows: true };
  }
  const abs = path.resolve(dir);
  let entries;
  try {
    entries = await fsp.readdir(abs, { withFileTypes: true });
  } catch (e) {
    throw Object.assign(new Error(e.code === 'ENOENT' ? 'That folder does not exist.' : e.code === 'EACCES' || e.code === 'EPERM' ? "The panel isn't allowed to open that folder." : e.message), { status: 400 });
  }
  const dirs = entries
    .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.') && !HIDDEN.has(e.name))
    .slice(0, 1000)
    .map((e) => {
      const p = path.join(abs, e.name);
      let server = false;
      try {
        server = looksLikeServer(p);
      } catch {
        /* unreadable */
      }
      return { name: e.name, path: p, server };
    })
    .sort((a, b) => Number(b.server) - Number(a.server) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const parentDir = path.dirname(abs);
  return {
    path: abs,
    parent: parentDir !== abs ? parentDir : IS_WIN ? 'drives' : null,
    dirs,
    home: os.homedir(),
    windows: IS_WIN,
    here: looksLikeServer(abs)
  };
}

// Read entry names (and a couple of tiny files) from a jar to tell what it is.
function peekJar(file) {
  return new Promise((resolve) => {
    const info = { names: new Set(), versionJson: null, versionsList: null, installProps: null };
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err) return resolve(info);
      const wanted = new Set(['version.json', 'META-INF/versions.list', 'install.properties']);
      zip.on('entry', (entry) => {
        info.names.add(entry.fileName);
        if (!wanted.has(entry.fileName) || entry.uncompressedSize > 64 * 1024) return zip.readEntry();
        zip.openReadStream(entry, (e2, rs) => {
          if (e2) return zip.readEntry();
          let text = '';
          rs.on('data', (d) => (text += d));
          rs.on('end', () => {
            if (entry.fileName === 'version.json') info.versionJson = text;
            else if (entry.fileName === 'META-INF/versions.list') info.versionsList = text;
            else info.installProps = text;
            zip.readEntry();
          });
          rs.on('error', () => zip.readEntry());
        });
      });
      zip.on('end', () => resolve(info));
      zip.on('error', () => resolve(info));
      zip.readEntry();
    });
  });
}

const TYPE_HINTS = [
  [/purpur/i, 'purpur'],
  [/paper/i, 'paper'],
  [/folia/i, 'folia'],
  [/spigot/i, 'spigot'],
  [/craftbukkit|bukkit/i, 'spigot'],
  [/fabric/i, 'fabric'],
  [/quilt/i, 'quilt'],
  [/neoforge/i, 'neoforge'],
  [/forge/i, 'forge'],
  [/mohist|arclight|magma/i, 'hybrid']
];

async function describeJar(dir, name) {
  const file = path.join(dir, name);
  const st = await fsp.stat(file);
  const out = { name, size: st.size, type: null, version: null };
  for (const [re, t] of TYPE_HINTS) {
    if (re.test(name)) {
      out.type = t;
      break;
    }
  }
  const peek = await peekJar(file);
  if (peek.versionsList) {
    // Bundled jars, both Mojang's own (1.18+) and Paperclip ones, list
    // "hash<TAB>version<TAB>path". The inner jar's name tells them apart:
    // "1.21.4/server-1.21.4.jar" (Vanilla) vs "1.21.11/paper-1.21.11.jar".
    const [, id, inner] = (peek.versionsList.split(/\r?\n/)[0] || '').split('\t');
    const m = id && /(\d+(?:\.\d+)+)/.exec(id);
    if (m) out.version = m[1];
    const base = path.basename(inner || '').toLowerCase();
    if (!out.type) {
      if (/^purpur/.test(base)) out.type = 'purpur';
      else if (/^folia/.test(base)) out.type = 'folia';
      else if (/^paper/.test(base) || [...peek.names].some((n) => n.startsWith('paperclip/'))) out.type = 'paper';
      else if (/^spigot|^craftbukkit/.test(base)) out.type = 'spigot';
      else if (/^server/.test(base)) out.type = 'vanilla';
    }
  }
  if (peek.versionJson) {
    try {
      const v = JSON.parse(peek.versionJson);
      if (!out.version) out.version = v.name || v.id || null;
    } catch {
      /* not JSON */
    }
    if (!out.type) out.type = peek.names.has('net/minecraft/server/Main.class') || peek.names.has('net/minecraft/bundler/Main.class') ? 'vanilla' : null;
  }
  if (peek.installProps) {
    const m = /game-version\s*=\s*(\S+)/.exec(peek.installProps);
    if (m) out.version = out.version || m[1];
    out.type = out.type || 'fabric';
  }
  if (!out.type && (peek.names.has('net/minecraft/bundler/Main.class') || peek.names.has('net/minecraft/server/MinecraftServer.class'))) out.type = 'vanilla';
  return out;
}

const UNITS = { k: 1 / 1024, m: 1, g: 1024, t: 1024 * 1024 };
function toMB(num, unit) {
  const mb = Math.round(parseFloat(num) * (UNITS[(unit || 'm').toLowerCase()] || 1 / (1024 * 1024)));
  return mb > 0 ? mb : null;
}

// Split a command line, keeping "quoted parts" together.
function tokens(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// Pull java path, memory, jar and extra flags out of a start script.
function parseScript(name, text) {
  const out = { name, jar: null, minMemoryMB: null, maxMemoryMB: null, jvmArgs: '', javaPath: null, usesArgsFile: false, hasPause: /^\s*pause\b/im.test(text) };
  const lines = text.split(/\r?\n/).filter((l) => !/^\s*(rem\b|::|#)/i.test(l));
  const javaLine = lines.find((l) => /\bjava(w)?(\.exe)?["']?\s/i.test(l) && /(-jar\s|@\S*args)/i.test(l));
  if (!javaLine) return out;
  const t = tokens(javaLine.trim());
  const javaIdx = t.findIndex((x) => /(^|[\\/])java(w)?(\.exe)?$/i.test(x));
  if (javaIdx > 0 || (javaIdx === 0 && t[0] !== 'java' && t[0] !== 'java.exe')) out.javaPath = t[javaIdx];
  const extra = [];
  for (let i = javaIdx + 1; i < t.length; i++) {
    const x = t[i];
    if (/^-jar$/i.test(x)) {
      out.jar = path.basename(t[i + 1] || '') || null;
      break;
    }
    if (x.startsWith('@')) {
      out.usesArgsFile = true;
      continue;
    }
    let m;
    if ((m = /^-Xmx(\d+(?:\.\d+)?)([kKmMgGtT]?)$/.exec(x))) out.maxMemoryMB = toMB(m[1], m[2]);
    else if ((m = /^-Xms(\d+(?:\.\d+)?)([kKmMgGtT]?)$/.exec(x))) out.minMemoryMB = toMB(m[1], m[2]);
    else if (/^-(XX:|D|X)/.test(x) && !/^-Xm[sx]/.test(x)) extra.push(x);
  }
  // Batch/shell variables (%MEM%, $MEM) can't be resolved; skip anything containing them.
  out.jvmArgs = extra.filter((x) => !/[%$]/.test(x)).join(' ');
  if (out.jar && /[%$]/.test(out.jar)) out.jar = null;
  return out;
}

async function inspect(dir) {
  if (!dir || typeof dir !== 'string') throw Object.assign(new Error('Choose a folder first.'), { status: 400 });
  const abs = path.resolve(dir);
  let st;
  try {
    st = await fsp.stat(abs);
  } catch {
    throw Object.assign(new Error('That folder does not exist.'), { status: 400 });
  }
  if (!st.isDirectory()) throw Object.assign(new Error('That is a file, not a folder.'), { status: 400 });

  const entries = await fsp.readdir(abs, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const jarNames = files.filter((f) => /\.jar$/i.test(f) && !/installer/i.test(f)).slice(0, 20);
  const jars = [];
  for (const j of jarNames) {
    try {
      jars.push(await describeJar(abs, j));
    } catch {
      /* unreadable jar */
    }
  }

  const scripts = [];
  for (const f of files.filter((f) => /\.(bat|cmd|sh|command|ps1)$/i.test(f))) {
    try {
      const s = await fsp.stat(path.join(abs, f));
      if (s.size > MAX_SCRIPT) continue;
      scripts.push(parseScript(f, await fsp.readFile(path.join(abs, f), 'utf8')));
    } catch {
      /* unreadable */
    }
  }

  let properties = {};
  try {
    properties = props.toObject(props.parse(await fsp.readFile(path.join(abs, 'server.properties'), 'utf8')));
  } catch {
    /* none yet */
  }
  const levelName = properties['level-name'] || 'world';
  const worlds = dirs.filter((d) => fs.existsSync(path.join(abs, d, 'level.dat')) && !/_(nether|the_end)$/.test(d));
  let eula = false;
  try {
    eula = /eula\s*=\s*true/i.test(await fsp.readFile(path.join(abs, 'eula.txt'), 'utf8'));
  } catch {
    /* no eula file */
  }

  const forgeStyle =
    scripts.some((s) => s.usesArgsFile) ||
    fs.existsSync(path.join(abs, 'libraries', 'net', 'minecraftforge', 'forge')) ||
    fs.existsSync(path.join(abs, 'libraries', 'net', 'neoforged', 'neoforge'));

  // Pick the jar the start script uses; else the most likely server jar.
  const rank = (j) => (j.type === 'vanilla' || j.type === 'paper' || j.type === 'purpur' || j.type === 'spigot' || j.type === 'fabric' || j.type === 'folia' ? 2 : j.type ? 1 : 0);
  const scriptWithJar = scripts.find((s) => s.jar && jars.some((j) => j.name.toLowerCase() === s.jar.toLowerCase()));
  const suggestedJar = scriptWithJar
    ? jars.find((j) => j.name.toLowerCase() === scriptWithJar.jar.toLowerCase()).name
    : jars.slice().sort((a, b) => rank(b) - rank(a) || b.size - a.size)[0]?.name || null;
  const script = scriptWithJar || scripts.find((s) => s.maxMemoryMB) || null;

  const problems = [];
  if (!jars.length && !forgeStyle) problems.push('No server .jar file was found in this folder.');
  if (forgeStyle && !jars.some((j) => j.type && j.type !== 'forge' && j.type !== 'neoforge')) {
    problems.push('This looks like a Forge or NeoForge server. Those start through their own run script, which the panel cannot launch yet.');
  }

  return {
    path: abs,
    jars,
    suggestedJar,
    scripts,
    script: script ? { name: script.name, minMemoryMB: script.minMemoryMB, maxMemoryMB: script.maxMemoryMB, jvmArgs: script.jvmArgs, javaPath: script.javaPath } : null,
    hasProperties: Object.keys(properties).length > 0,
    levelName,
    port: properties['server-port'] || '25565',
    worlds,
    eula,
    forgeStyle,
    looksLikeServer: looksLikeServer(abs) || jars.length > 0,
    problems
  };
}

module.exports = { browse, inspect, parseScript, describeJar };
