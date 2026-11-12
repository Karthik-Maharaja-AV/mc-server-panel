'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const config = require('./config');

const UA = 'mc-server-panel/1.0 (self-hosted server panel)';
const PAPER = 'https://fill.papermc.io/v3/projects/paper';
const MOJANG = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Download server answered ${res.status} for ${url}`);
  return res.json();
}

const STABLE = /^\d+(\.\d+)+$/;

async function versions(type) {
  if (type === 'paper') {
    const j = await getJson(PAPER);
    return Object.values(j.versions).flat().filter((v) => STABLE.test(v));
  }
  if (type === 'vanilla') {
    const j = await getJson(MOJANG);
    return j.versions.filter((v) => v.type === 'release').map((v) => v.id);
  }
  throw new Error('Unknown server type.');
}

// Download URL, checksum and the Java version the release needs.
async function info(type, version) {
  if (!STABLE.test(version || '')) throw new Error('Pick a version from the list.');
  if (type === 'paper') {
    const [v, builds] = await Promise.all([getJson(`${PAPER}/versions/${version}`), getJson(`${PAPER}/versions/${version}/builds`)]);
    const build = builds.find((b) => b.channel === 'STABLE') || builds[0];
    if (!build) throw new Error('No Paper builds for ' + version);
    const d = build.downloads['server:default'];
    const java = v.version && v.version.java ? v.version.java : {};
    return {
      type,
      version,
      build: build.id,
      url: d.url,
      size: d.size,
      hash: { algo: 'sha256', value: d.checksums.sha256 },
      javaMin: java.version ? java.version.minimum : null,
      recommendedFlags: java.flags && java.flags.recommended ? java.flags.recommended : []
    };
  }
  if (type === 'vanilla') {
    const manifest = await getJson(MOJANG);
    const entry = manifest.versions.find((v) => v.id === version);
    if (!entry) throw new Error('Unknown version ' + version);
    const v = await getJson(entry.url);
    if (!v.downloads || !v.downloads.server) throw new Error('Mojang has no server download for ' + version);
    return {
      type,
      version,
      build: null,
      url: v.downloads.server.url,
      size: v.downloads.server.size,
      hash: { algo: 'sha1', value: v.downloads.server.sha1 },
      javaMin: v.javaVersion ? v.javaVersion.majorVersion : null,
      recommendedFlags: []
    };
  }
  throw new Error('Unknown server type.');
}

async function download(meta, progress) {
  const dir = config.serverDir();
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, 'server.jar');
  const tmp = dest + '.download';
  const res = await fetch(meta.url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || meta.size || 0;
  const hash = crypto.createHash(meta.hash.algo);
  let got = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    const body = Readable.fromWeb(res.body);
    body.on('data', (chunk) => {
      got += chunk.length;
      hash.update(chunk);
      if (total) progress('Downloading ' + path.basename(new URL(meta.url).pathname), (got / total) * 95);
    });
    body.on('error', reject);
    out.on('error', reject);
    out.on('close', resolve);
    body.pipe(out);
  });
  const digest = hash.digest('hex');
  if (digest !== meta.hash.value) {
    await fsp.rm(tmp, { force: true });
    throw new Error('The download was corrupted (checksum mismatch). Please try again.');
  }
  await fsp.rename(tmp, dest);
  config.update({ jar: 'server.jar', serverType: meta.type, serverVersion: meta.version + (meta.build ? ` (build ${meta.build})` : '') });
  return dest;
}

// Major Java version from `java -version` (e.g. 21), or null if Java isn't found.
function javaVersion(javaPath) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(javaPath || 'java', ['-version'], { windowsHide: true });
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 10000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const m = /version "(\d+)(?:\.(\d+))?/.exec(out);
      if (!m) return resolve(null);
      const major = m[1] === '1' ? parseInt(m[2], 10) : parseInt(m[1], 10);
      resolve({ major, text: out.split(/\r?\n/)[0] });
    });
  });
}

function eulaAccepted() {
  try {
    return /eula\s*=\s*true/i.test(fs.readFileSync(path.join(config.serverDir(), 'eula.txt'), 'utf8'));
  } catch {
    return false;
  }
}

function acceptEula() {
  fs.mkdirSync(config.serverDir(), { recursive: true });
  fs.writeFileSync(
    path.join(config.serverDir(), 'eula.txt'),
    `#Accepted through the server panel on ${new Date().toISOString()}\n#https://aka.ms/MinecraftEULA\neula=true\n`
  );
}

module.exports = { versions, info, download, javaVersion, eulaAccepted, acceptEula };
