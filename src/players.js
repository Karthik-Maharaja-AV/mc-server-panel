'use strict';
const path = require('path');
const config = require('./config');
const { readJson } = require('./util');

// Combine the server's player files into one list.
function list(online) {
  const dir = config.serverDir();
  const read = (f) => readJson(path.join(dir, f), []);
  const usercache = read('usercache.json');
  const ops = read('ops.json');
  const whitelist = read('whitelist.json');
  const banned = read('banned-players.json');

  const map = new Map();
  const get = (name, uuid) => {
    const key = String(name).toLowerCase();
    if (!map.has(key)) map.set(key, { name, uuid: uuid || null, op: false, opLevel: 0, whitelisted: false, banned: false, banReason: null, online: false });
    const p = map.get(key);
    if (uuid && !p.uuid) p.uuid = uuid;
    return p;
  };

  for (const u of Array.isArray(usercache) ? usercache : []) if (u && u.name) get(u.name, u.uuid);
  for (const o of Array.isArray(ops) ? ops : []) if (o && o.name) Object.assign(get(o.name, o.uuid), { op: true, opLevel: o.level || 4 });
  for (const w of Array.isArray(whitelist) ? whitelist : []) if (w && w.name) get(w.name, w.uuid).whitelisted = true;
  for (const b of Array.isArray(banned) ? banned : []) if (b && b.name) Object.assign(get(b.name, b.uuid), { banned: true, banReason: b.reason || null });
  for (const n of online || []) get(n).online = true;

  return [...map.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

// Player actions run as server commands so the server stays the source of truth.
const ACTIONS = {
  op: (n) => `op ${n}`,
  deop: (n) => `deop ${n}`,
  'whitelist-add': (n) => `whitelist add ${n}`,
  'whitelist-remove': (n) => `whitelist remove ${n}`,
  kick: (n, reason) => `kick ${n}${reason ? ' ' + reason : ''}`,
  ban: (n, reason) => `ban ${n}${reason ? ' ' + reason : ''}`,
  pardon: (n) => `pardon ${n}`
};

module.exports = { list, ACTIONS };
