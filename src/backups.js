'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const yazl = require('yazl');
const yauzl = require('yauzl');
const config = require('./config');
const serverprops = require('./serverprops');
const { readJson, writeJsonAtomic, walkFiles, isInside, exists, WORLD_NAME } = require('./util');

const INDEX = 'backups.json';

/**
 * World backups as .zip files in the backup folder, with a small index file
 * for names and types.
 */
class Backups {
  constructor({ mc, jobs, log }) {
    this.mc = mc;
    this.jobs = jobs;
    this.log = log;
    this.lastAutoCheck = 0;
    this.timer = setInterval(() => this.autoTick().catch((e) => this.log('Automatic backup failed: ' + e.message, 'ERROR')), 60 * 1000);
    this.timer.unref();
  }

  dir() {
    return config.backupDir();
  }

  index() {
    const list = readJson(path.join(this.dir(), INDEX), []);
    return Array.isArray(list) ? list : [];
  }

  saveIndex(list) {
    writeJsonAtomic(path.join(this.dir(), INDEX), list);
  }

  async list() {
    const list = this.index();
    const out = [];
    for (const b of list) {
      if (await exists(path.join(this.dir(), b.file))) out.push(b);
    }
    if (out.length !== list.length) this.saveIndex(out);
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  find(id) {
    const b = this.index().find((x) => x.id === id);
    if (!b) throw Object.assign(new Error('Backup not found.'), { status: 404 });
    return b;
  }

  filePath(id) {
    const b = this.find(id);
    const p = path.join(this.dir(), b.file);
    if (!isInside(this.dir(), p)) throw new Error('Bad backup path.');
    return { backup: b, path: p };
  }

  // The world folder plus Paper/Spigot's separate Nether and End folders.
  worldFolders(world) {
    const base = config.serverDir();
    return [world, world + '_nether', world + '_the_end'].filter((n) => fs.existsSync(path.join(base, n)));
  }

  create({ name, type = 'Manual' } = {}) {
    return this.jobs.run('backup', 'Backup', (progress) => this._create({ name, type }, progress));
  }

  async _create({ name, type }, progress) {
    const world = serverprops.levelName();
    const folders = this.worldFolders(world);
    if (!folders.length) throw new Error(`World folder "${world}" doesn't exist yet. Start the server once to create it.`);
    await fsp.mkdir(this.dir(), { recursive: true });

    const running = this.mc.state === 'running';
    if (running) {
      progress('Pausing autosave and saving the world', 2);
      this.mc.send('save-off', 'panel');
      const saved = this.mc.waitForLine(/^Saved the game/, 120000).catch(() => null);
      this.mc.send('save-all flush', 'panel');
      await saved;
    }

    try {
      progress('Scanning files', 5);
      const base = config.serverDir();
      const files = [];
      for (const f of folders) {
        for (const file of await walkFiles(path.join(base, f), base)) {
          if (path.basename(file.rel) === 'session.lock') continue;
          files.push(file);
        }
      }
      const total = files.reduce((n, f) => n + f.size, 0) || 1;
      const id = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) + '-' + Math.random().toString(36).slice(2, 6);
      const fileName = `${world}_${id}.zip`;
      const outPath = path.join(this.dir(), fileName);
      const tmpPath = outPath + '.part';

      await new Promise((resolve, reject) => {
        const zip = new yazl.ZipFile();
        const out = fs.createWriteStream(tmpPath);
        out.on('error', reject);
        out.on('close', resolve);
        zip.outputStream.on('error', reject).pipe(out);
        let done = 0;
        let lastPct = -1;
        for (const f of files) {
          const rel = f.rel.split(path.sep).join('/');
          // Region files are already compressed; storing them is much faster.
          const compress = !/\.(mca|mcc|gz|zip|png)$/i.test(rel);
          zip.addReadStreamLazy(rel, { mtime: f.mtime, mode: f.mode, compress, forceZip64Format: f.size > 0xfffffff0 }, (cb) => {
            const s = fs.createReadStream(f.abs);
            s.on('data', (chunk) => {
              done += chunk.length;
              const pct = 5 + (done / total) * 93;
              if (Math.floor(pct) !== lastPct) {
                lastPct = Math.floor(pct);
                progress('Copying world files', pct);
              }
            });
            cb(null, s);
          });
        }
        zip.end();
      });
      await fsp.rename(tmpPath, outPath);
      const size = (await fsp.stat(outPath)).size;
      const entry = { id, file: fileName, name: (name || '').trim().slice(0, 80) || defaultName(type), type, world, size, createdAt: Date.now() };
      this.saveIndex(this.index().concat([entry]));
      progress('Done', 100);
      this.log(`Backup "${entry.name}" saved (${files.length} files).`);
      return entry;
    } finally {
      if (running && this.mc.state === 'running') this.mc.send('save-on', 'panel');
    }
  }

  async remove(id) {
    if (this.jobs.busy()) throw Object.assign(new Error('Wait for the current task to finish.'), { status: 409 });
    const { backup, path: p } = this.filePath(id);
    await fsp.rm(p, { force: true });
    this.saveIndex(this.index().filter((b) => b.id !== backup.id));
  }

  restore(id) {
    const { backup, path: zipPath } = this.filePath(id);
    return this.jobs.run('restore', 'Restore', async (progress) => {
      const wasRunning = this.mc.isRunning();
      progress('Taking a safety backup of the current world', 1);
      if (this.worldFolders(serverprops.levelName()).length) {
        await this._create({ name: `Safety copy before restoring "${backup.name}"`, type: 'Safety' }, (s, pct) => progress('Safety backup: ' + s, (pct || 0) * 0.3));
      }
      if (wasRunning) {
        progress('Stopping the server', 32);
        await this.mc.stop();
      }
      progress('Restoring files', 35);
      await this.extractWorld(zipPath, (pct) => progress('Restoring files', 35 + pct * 0.6));
      if (serverprops.levelName() !== backup.world) serverprops.write({ set: { 'level-name': backup.world } });
      this.log(`Restored world "${backup.world}" from backup "${backup.name}".`);
      if (wasRunning) {
        progress('Starting the server', 97);
        this.mc.start();
      }
      progress('Done', 100);
    });
  }

  // Extract into a temp folder, then swap folders in, so a failed restore
  // never leaves a half-written world.
  async extractWorld(zipPath, onPct) {
    const base = config.serverDir();
    const staging = path.join(base, '.restore-tmp-' + Date.now());
    await fsp.mkdir(staging, { recursive: true });
    const tops = new Set();
    try {
      await new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (err, zip) => {
          if (err) return reject(err);
          let n = 0;
          zip.on('error', reject);
          zip.on('end', resolve);
          zip.on('entry', (entry) => {
            n++;
            onPct((n / Math.max(1, zip.entryCount)) * 100);
            const name = entry.fileName;
            const top = name.split('/')[0];
            const dest = path.join(staging, name);
            if (!WORLD_NAME.test(top) || !isInside(staging, dest)) return reject(new Error('This backup contains unsafe file paths: ' + name));
            tops.add(top);
            if (name.endsWith('/')) {
              fsp.mkdir(dest, { recursive: true }).then(() => zip.readEntry(), reject);
              return;
            }
            fsp.mkdir(path.dirname(dest), { recursive: true }).then(() => {
              zip.openReadStream(entry, (e2, rs) => {
                if (e2) return reject(e2);
                const ws = fs.createWriteStream(dest);
                ws.on('error', reject);
                ws.on('close', () => zip.readEntry());
                rs.on('error', reject);
                rs.pipe(ws);
              });
            }, reject);
          });
          zip.readEntry();
        });
      });

      const moved = [];
      try {
        for (const top of tops) {
          const live = path.join(base, top);
          const old = path.join(staging, '.old-' + top);
          if (fs.existsSync(live)) {
            await fsp.rename(live, old);
            moved.push({ live, old });
          }
          await fsp.rename(path.join(staging, top), live);
        }
      } catch (e) {
        for (const m of moved) {
          await fsp.rm(m.live, { recursive: true, force: true }).catch(() => {});
          await fsp.rename(m.old, m.live).catch(() => {});
        }
        throw e;
      }
    } finally {
      await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }

  async autoTick() {
    const ab = config.get().autoBackup;
    if (!ab.enabled || this.jobs.busy()) return;
    const autos = (await this.list()).filter((b) => b.type === 'Auto');
    const last = autos.length ? autos[0].createdAt : 0;
    if (Date.now() - last < ab.everyHours * 3600 * 1000) return;
    if (!this.worldFolders(serverprops.levelName()).length) return;
    await this.create({ type: 'Auto' });
    await this.prune();
  }

  async prune() {
    const keep = Math.max(1, config.get().autoBackup.keep);
    const autos = (await this.list()).filter((b) => b.type === 'Auto');
    for (const b of autos.slice(keep)) {
      await fsp.rm(path.join(this.dir(), b.file), { force: true });
      this.saveIndex(this.index().filter((x) => x.id !== b.id));
    }
  }
}

function defaultName(type) {
  return type === 'Auto' ? 'Automatic backup' : type === 'Safety' ? 'Safety backup' : 'Manual backup';
}

module.exports = { Backups };
