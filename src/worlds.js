'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('./config');
const serverprops = require('./serverprops');
const { readJson, writeJsonAtomic, dirSize, WORLD_NAME } = require('./util');

const META_FILE = path.join(config.DATA_DIR, 'worlds.json');

const TYPES = {
  'minecraft:normal': 'Normal',
  'minecraft:flat': 'Superflat',
  'minecraft:large_biomes': 'Large biomes',
  'minecraft:amplified': 'Amplified',
  'minecraft:single_biome_surface': 'Single biome'
};

const L = (block, height) => ({ block: 'minecraft:' + block, height });
// Approximations of the game's built-in superflat presets.
const FLAT_PRESETS = {
  classic: { layers: [L('bedrock', 1), L('dirt', 2), L('grass_block', 1)], biome: 'minecraft:plains' },
  tunnelers: { layers: [L('bedrock', 1), L('stone', 230), L('dirt', 5), L('grass_block', 1)], biome: 'minecraft:windswept_hills' },
  water: { layers: [L('bedrock', 1), L('deepslate', 64), L('stone', 5), L('dirt', 5), L('sand', 5), L('water', 90)], biome: 'minecraft:deep_ocean' },
  snowy: { layers: [L('bedrock', 1), L('stone', 59), L('dirt', 3), L('grass_block', 1), L('snow', 1)], biome: 'minecraft:snowy_plains' },
  redstone: { layers: [L('bedrock', 1), L('stone', 3), L('sandstone', 116)], biome: 'minecraft:desert' },
  void: { layers: [L('air', 1)], biome: 'minecraft:the_void' }
};

const BIOMES = ['plains', 'forest', 'birch_forest', 'dark_forest', 'taiga', 'desert', 'savanna', 'badlands', 'jungle', 'swamp', 'snowy_plains', 'ice_spikes', 'mushroom_fields', 'cherry_grove', 'meadow', 'ocean'];

class Worlds {
  constructor({ mc, jobs, backups, log }) {
    this.mc = mc;
    this.jobs = jobs;
    this.backups = backups;
    this.log = log;
    this.sizeCache = new Map();
    mc.on('event', (ev) => {
      if (ev.type === 'seed') this.setMeta(serverprops.levelName(), { seed: ev.value });
    });
  }

  meta() {
    return readJson(META_FILE, {});
  }

  setMeta(name, patch) {
    const all = this.meta();
    all[name] = Object.assign({}, all[name], patch);
    writeJsonAtomic(META_FILE, all);
  }

  async list() {
    const base = config.serverDir();
    let entries = [];
    try {
      entries = await fsp.readdir(base, { withFileTypes: true });
    } catch {
      return [];
    }
    const names = entries.filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, 'level.dat'))).map((e) => e.name);
    const nameSet = new Set(names);
    const active = serverprops.levelName();
    const meta = this.meta();
    const out = [];
    for (const name of names) {
      // Paper keeps the Nether and End next to the world; show them as part of it.
      const parent = name.replace(/_(nether|the_end)$/, '');
      if (parent !== name && nameSet.has(parent)) continue;
      const st = await fsp.stat(path.join(base, name));
      const m = meta[name] || {};
      out.push({
        name,
        active: name === active,
        size: await this.size(name),
        created: m.created || st.birthtimeMs || st.ctimeMs,
        type: m.type ? TYPES[m.type] || m.type : null,
        seed: m.seed || null
      });
    }
    if (!out.some((w) => w.active)) out.unshift({ name: active, active: true, size: 0, created: null, type: null, seed: null, pending: true });
    return out.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }

  // Sizing large worlds is slow, so cache for a minute.
  async size(name) {
    const c = this.sizeCache.get(name);
    if (c && Date.now() - c.at < 60000) return c.size;
    const base = config.serverDir();
    let total = 0;
    for (const n of [name, name + '_nether', name + '_the_end']) total += await dirSize(path.join(base, n));
    this.sizeCache.set(name, { size: total, at: Date.now() });
    return total;
  }

  validateName(name) {
    if (!WORLD_NAME.test(name || '')) throw Object.assign(new Error('World names use letters, numbers, - or _ (up to 64).'), { status: 400 });
  }

  generate(opts) {
    const name = String(opts.name || '').trim();
    this.validateName(name);
    if (fs.existsSync(path.join(config.serverDir(), name))) throw Object.assign(new Error(`A folder called "${name}" already exists.`), { status: 409 });
    const type = TYPES[opts.type] ? opts.type : 'minecraft:normal';
    const set = {
      'level-name': name,
      'level-seed': String(opts.seed || '').trim(),
      'level-type': type,
      'generate-structures': String(opts.structures !== false),
      hardcore: String(!!opts.hardcore),
      gamemode: ['survival', 'creative', 'adventure', 'spectator'].includes(opts.gamemode) ? opts.gamemode : 'survival',
      difficulty: opts.hardcore ? 'hard' : ['peaceful', 'easy', 'normal', 'hard'].includes(opts.difficulty) ? opts.difficulty : 'normal',
      'generator-settings': '{}'
    };
    if (type === 'minecraft:flat') set['generator-settings'] = JSON.stringify(FLAT_PRESETS[opts.flatPreset] || FLAT_PRESETS.classic);
    if (type === 'minecraft:single_biome_surface') set['generator-settings'] = JSON.stringify({ biome: 'minecraft:' + (BIOMES.includes(opts.biome) ? opts.biome : 'plains') });

    return this.jobs.run('generate', 'Generate world', async (progress) => {
      const wasRunning = this.mc.isRunning();
      const current = serverprops.levelName();
      if (opts.backupFirst !== false && this.backups.worldFolders(current).length) {
        await this.backups._create({ name: `Before switching to "${name}"`, type: 'Safety' }, (s, pct) => progress('Backing up current world: ' + s, (pct || 0) * 0.4));
      }
      if (this.mc.child) {
        progress('Stopping the server', 42);
        await this.mc.stop();
      }
      progress('Writing server.properties', 45);
      serverprops.write({ set });
      this.setMeta(name, { type, seed: set['level-seed'] || null, created: Date.now() });
      this.log(`World "${name}" set up (${TYPES[type]}). ${wasRunning || opts.start !== false ? 'Starting the server to generate it…' : 'Start the server to generate it.'}`);
      if (opts.start !== false) {
        progress('Starting the server and generating terrain', 50);
        this.mc.start();
        await this.mc.waitForState('running', 15 * 60 * 1000);
        this.mc.send('seed', 'panel');
      }
      progress('Done', 100);
      return { name };
    });
  }

  activate(name) {
    this.validateName(name);
    if (!fs.existsSync(path.join(config.serverDir(), name, 'level.dat'))) throw Object.assign(new Error('World not found.'), { status: 404 });
    return this.jobs.run('activate', 'Switch world', async (progress) => {
      const wasRunning = !!this.mc.child;
      if (wasRunning) {
        progress('Stopping the server', 20);
        await this.mc.stop();
      }
      serverprops.write({ set: { 'level-name': name } });
      this.log(`Loaded world "${name}".`);
      if (wasRunning) {
        progress('Starting the server', 60);
        this.mc.start();
      }
      progress('Done', 100);
    });
  }

  async remove(name) {
    this.validateName(name);
    if (name === serverprops.levelName()) throw Object.assign(new Error("You can't delete the world that is loaded. Load another world first."), { status: 409 });
    if (this.jobs.busy()) throw Object.assign(new Error('Wait for the current task to finish.'), { status: 409 });
    const base = config.serverDir();
    if (!fs.existsSync(path.join(base, name, 'level.dat'))) throw Object.assign(new Error('World not found.'), { status: 404 });
    for (const n of [name, name + '_nether', name + '_the_end']) {
      await fsp.rm(path.join(base, n), { recursive: true, force: true });
    }
    const all = this.meta();
    delete all[name];
    writeJsonAtomic(META_FILE, all);
    this.sizeCache.delete(name);
    this.log(`Deleted world "${name}".`);
  }
}

module.exports = { Worlds, TYPES, FLAT_PRESETS, BIOMES };
