'use strict';
const crypto = require('crypto');
const path = require('path');
const config = require('./config');
const { readJson, writeJsonAtomic } = require('./util');

const USERS_FILE = path.join(config.DATA_DIR, 'users.json');
const COOKIE = 'panel_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const PERMS = ['power', 'console', 'commands', 'players', 'settings', 'files', 'access'];
const USERNAME_RE = /^[A-Za-z0-9_.-]{2,32}$/;

let users = readJson(USERS_FILE, []);
const sessions = new Map(); // token -> { username, expires }
const attempts = new Map(); // ip -> [timestamps]

function save() {
  writeJsonAtomic(USERS_FILE, users);
}

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function publicUser(u) {
  if (!u) return null;
  return { username: u.username, owner: !!u.owner, perms: u.owner ? PERMS.slice() : u.perms.slice(), createdAt: u.createdAt, lastSeen: u.lastSeen || null, lastIp: u.lastIp || null };
}

function hasUsers() {
  return users.length > 0;
}

function findUser(username) {
  const lc = String(username || '').toLowerCase();
  return users.find((u) => u.username.toLowerCase() === lc);
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new Error('Passwords need at least 8 characters.');
  if (pw.length > 200) throw new Error('That password is too long.');
}

function createUser({ username, password, perms = ['console'], owner = false }) {
  if (!USERNAME_RE.test(username || '')) throw new Error('Usernames use 2–32 letters, numbers, dots, dashes or underscores.');
  if (findUser(username)) throw new Error('That username is already taken.');
  validatePassword(password);
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    username,
    salt,
    hash: hash(password, salt),
    owner,
    perms: owner ? PERMS.slice() : perms.filter((p) => PERMS.includes(p)),
    createdAt: Date.now()
  };
  users.push(user);
  save();
  return publicUser(user);
}

function updateUser(username, { perms, password }) {
  const u = findUser(username);
  if (!u) throw new Error('User not found.');
  if (perms) {
    if (u.owner) throw new Error("The owner's permissions can't be changed.");
    u.perms = perms.filter((p) => PERMS.includes(p));
  }
  if (password !== undefined) {
    validatePassword(password);
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = hash(password, u.salt);
    // Sign the user out everywhere after a password change.
    for (const [token, s] of sessions) if (s.username === u.username) sessions.delete(token);
  }
  save();
  return publicUser(u);
}

function deleteUser(username) {
  const u = findUser(username);
  if (!u) throw new Error('User not found.');
  if (u.owner) throw new Error("The owner can't be removed.");
  users = users.filter((x) => x !== u);
  for (const [token, s] of sessions) if (s.username === u.username) sessions.delete(token);
  save();
}

function listUsers() {
  return users.map(publicUser);
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  attempts.set(ip, list);
  return list.length >= 10;
}

function login(username, password, ip) {
  if (rateLimited(ip)) throw Object.assign(new Error('Too many attempts. Wait 10 minutes and try again.'), { status: 429 });
  const u = findUser(username);
  const ok = u && typeof password === 'string' && crypto.timingSafeEqual(Buffer.from(hash(password, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
  if (!ok) {
    attempts.get(ip).push(Date.now());
    throw Object.assign(new Error('Wrong username or password.'), { status: 401 });
  }
  attempts.delete(ip);
  u.lastSeen = Date.now();
  u.lastIp = ip;
  save();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: u.username, expires: Date.now() + SESSION_MS });
  return { token, user: publicUser(u) };
}

function logout(token) {
  sessions.delete(token);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function userFromRequest(req) {
  return userFromToken(parseCookies(req.headers.cookie)[COOKIE]);
}

function userFromToken(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const u = findUser(s.username);
  if (!u) return null;
  return Object.assign(publicUser(u), { token });
}

function touch(username, ip) {
  const u = findUser(username);
  if (!u) return;
  u.lastSeen = Date.now();
  u.lastIp = ip;
}

function can(user, perm) {
  return !!user && (user.owner || user.perms.includes(perm));
}

function cookieHeader(token, req) {
  const secure = req.secure ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`;
}

function clearCookieHeader() {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

// Persist lastSeen occasionally rather than on every request.
setInterval(() => {
  try {
    if (users.length) save();
  } catch {
    /* ignore */
  }
}, 60000).unref();

module.exports = {
  PERMS,
  hasUsers,
  createUser,
  updateUser,
  deleteUser,
  listUsers,
  login,
  logout,
  userFromRequest,
  userFromToken,
  touch,
  can,
  cookieHeader,
  clearCookieHeader
};
