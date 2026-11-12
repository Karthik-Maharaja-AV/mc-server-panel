'use strict';
/* Server Panel frontend: plain JavaScript, no build step.
 * All server-provided text goes through esc() before it touches innerHTML. */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICON = {
  logo: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>',
  console: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  players: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  perms: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  props: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8"/>',
  backups: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
  worlds: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  setup: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const TABS = [
  { id: 'console', label: 'Console', icon: 'console', perm: 'console' },
  { id: 'players', label: 'Players', icon: 'players', perm: null },
  { id: 'perms', label: 'Permissions', icon: 'perms', perm: 'access' },
  { id: 'props', label: 'server.properties', icon: 'props', perm: 'settings' },
  { id: 'backups', label: 'Backups', icon: 'backups', perm: 'files' },
  { id: 'worlds', label: 'Worlds', icon: 'worlds', perm: 'files' },
  { id: 'setup', label: 'Setup', icon: 'setup', perm: 'settings' }
];

const PERM_INFO = [
  ['power', 'Start, stop and restart', 'Control the server process'],
  ['console', 'View console', 'Read the live server log'],
  ['commands', 'Run console commands', 'Type commands as the server'],
  ['players', 'Manage players', 'Op, whitelist, kick and ban'],
  ['settings', 'Server settings and setup', 'Edit server.properties, install versions, Java and memory'],
  ['files', 'Backups and worlds', 'Create, restore, download and generate worlds'],
  ['access', 'Manage panel access', 'Add people and change their permissions']
];
const PRESETS = {
  Admin: ['power', 'console', 'commands', 'players', 'settings', 'files'],
  Moderator: ['console', 'commands', 'players'],
  Viewer: ['console']
};
const WORLD_TYPES = [
  ['minecraft:normal', 'Normal', 'Standard terrain, caves and biomes'],
  ['minecraft:flat', 'Superflat', 'Flat layers, good for building'],
  ['minecraft:large_biomes', 'Large biomes', 'Same terrain, much bigger biomes'],
  ['minecraft:amplified', 'Amplified', 'Huge mountains; needs a strong PC'],
  ['minecraft:single_biome_surface', 'Single biome', 'One biome everywhere']
];
const FLAT_LABELS = { classic: 'Classic Flat', tunnelers: "Tunnelers' Dream", water: 'Water World', snowy: 'Snowy Kingdom', redstone: 'Redstone Ready', void: 'The Void' };
const GROUP_TAG = { Players: 'tag-blue', Gameplay: 'tag-green', World: 'tag-purple', Network: 'tag-gray', Advanced: 'tag-amber', Other: 'tag-pink', New: 'tag-pink' };
const AVATAR_COLORS = ['#2563eb', '#b45309', '#7c3aed', '#15803d', '#0e7490', '#be185d', '#4d7c0f', '#9333ea'];

// ---------- state ----------
const S = {
  user: null,
  tab: localGet('tab') || 'console',
  overview: null,
  status: { state: 'stopped', online: [] },
  stats: null,
  job: null,
  lines: [],
  filter: 'all',
  search: '',
  cmdHistory: [],
  cmdIndex: -1,
  data: {}, // per-page data from the API
  form: { gen: { type: 'minecraft:normal', flatPreset: 'classic', biome: 'plains', gamemode: 'survival', difficulty: 'normal', structures: true, hardcore: false, backupFirst: true }, setupType: 'paper' },
  propEdits: {},
  propRemoved: [],
  propAdded: [],
  propGroup: 'all',
  propSearch: '',
  showRaw: false,
  selUser: null,
  confirmRestore: null,
  toast: null
};

function localGet(k) {
  try {
    return localStorage.getItem('panel.' + k);
  } catch {
    return null;
  }
}
function localSet(k, v) {
  try {
    localStorage.setItem('panel.' + k, v);
  } catch {
    /* storage unavailable */
  }
}

// ---------- api ----------
async function api(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (res.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/account')) {
    S.user = null;
    boot();
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const can = (perm) => !!S.user && (S.user.owner || S.user.perms.includes(perm));

function toast(text, kind = 'ok') {
  S.toast = { text, kind };
  renderToast();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    S.toast = null;
    renderToast();
  }, 5000);
}

async function act(fn, okText) {
  try {
    await fn();
    if (okText) toast(okText);
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ---------- formatting ----------
function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + ' ' + u[i];
}
function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtUptime(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}
function ago(ms) {
  if (!ms) return 'Never signed in';
  const s = (Date.now() - ms) / 1000;
  if (s < 120) return 'Active now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' days ago';
}
function avatarColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
const avatar = (name) => `<span class="avatar" style="background:${avatarColor(name)}">${esc(name[0].toUpperCase())}</span>`;
const sw = (on, attrs = '') => `<button type="button" class="switch" role="switch" aria-checked="${on ? 'true' : 'false'}" ${attrs}></button>`;
const pressed = (on) => `aria-pressed="${on ? 'true' : 'false'}"`;

// ---------- boot / auth ----------
async function boot() {
  stopSocket();
  let session;
  try {
    session = await api('GET', '/api/session');
  } catch (e) {
    $('#app').innerHTML = `<div class="auth"><div class="card"><h1>Can't reach the panel</h1><p class="muted">${esc(e.message)}</p></div></div>`;
    return;
  }
  if (session.setupNeeded) return renderAuth('setup');
  if (!session.user) return renderAuth('login');
  S.user = session.user;
  await startApp();
}

function renderAuth(mode) {
  const setup = mode === 'setup';
  $('#app').innerHTML = `
    <div class="auth">
      <form class="card" id="auth-form">
        <div class="logo">${icon('logo', 22)}</div>
        <div>
          <h1>${setup ? 'Create the owner account' : 'Sign in'}</h1>
          <p class="muted small" style="margin:6px 0 0">${setup ? 'This account has full control. You can add other people later on the Permissions page.' : 'Sign in to manage the Minecraft server.'}</p>
        </div>
        <label class="field"><span>Username</span><input class="fld" name="username" autocomplete="username" required minlength="2" maxlength="32"></label>
        <label class="field"><span>Password${setup ? ' (at least 8 characters)' : ''}</span><input class="fld" type="password" name="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required ${setup ? 'minlength="8"' : ''}></label>
        ${setup ? '<label class="field"><span>Repeat password</span><input class="fld" type="password" name="password2" autocomplete="new-password" required minlength="8"></label>' : ''}
        <div id="auth-error" role="alert"></div>
        <button class="btn btn-primary" type="submit">${setup ? 'Create account' : 'Sign in'}</button>
      </form>
    </div>`;
  $('#auth-form input').focus();
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = $('#auth-error');
    err.innerHTML = '';
    if (setup && f.get('password') !== f.get('password2')) {
      err.innerHTML = '<div class="notice notice-err">The passwords don\'t match.</div>';
      return;
    }
    try {
      const r = await api('POST', setup ? '/api/setup' : '/api/login', { username: f.get('username'), password: f.get('password') });
      S.user = r.user;
      if (setup) S.tab = 'setup';
      await startApp();
    } catch (ex) {
      err.innerHTML = `<div class="notice notice-err">${esc(ex.message)}</div>`;
    }
  });
}

async function startApp() {
  renderShell();
  await Promise.all([loadOverview(), can('console') ? loadConsole() : null]);
  const o = S.overview;
  if (o && can('settings') && (!o.server.installed || !o.server.eula) && !localGet('tab')) S.tab = 'setup';
  if (!visibleTabs().some((t) => t.id === S.tab)) S.tab = visibleTabs()[0].id;
  renderNav();
  showTab(S.tab);
  connectSocket();
  clearInterval(startApp.timer);
  startApp.timer = setInterval(loadOverview, 20000);
}

async function loadOverview() {
  try {
    S.overview = await api('GET', '/api/overview');
    S.status = S.overview.status;
    S.stats = S.overview.stats;
    S.job = S.overview.job;
    renderHeader();
    renderStats();
    renderJob();
    renderNav();
  } catch {
    /* handled by api() */
  }
}

async function loadConsole() {
  const r = await api('GET', '/api/console');
  S.lines = r.lines;
}

// ---------- websocket ----------
let ws = null;
let wsRetry = 0;
let wsTimer = null;
function connectSocket() {
  stopSocket();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => {
    wsRetry = 0;
    setConn(true);
  };
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    onSocket(msg);
  };
  ws.onclose = (ev) => {
    setConn(false);
    ws = null;
    if (ev.code === 4001) return boot();
    if (!S.user) return;
    wsTimer = setTimeout(() => {
      // Re-sync history after a reconnect so no lines are missed.
      if (can('console')) loadConsole().then(() => S.tab === 'console' && fillLog()).catch(() => {});
      connectSocket();
    }, Math.min(10000, 1000 * 2 ** wsRetry++));
  };
}
function stopSocket() {
  clearTimeout(wsTimer);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}
function setConn(ok) {
  const el = $('#conn');
  if (el) el.classList.toggle('hidden', ok);
}

function onSocket(msg) {
  switch (msg.type) {
    case 'line':
      S.lines.push(msg.data);
      if (S.lines.length > 2000) S.lines.splice(0, S.lines.length - 2000);
      if (S.tab === 'console') appendLine(msg.data);
      break;
    case 'status': {
      const prev = S.status.state;
      S.status = msg.data;
      renderHeader();
      renderStats();
      renderNav();
      if (prev !== S.status.state) {
        if (['players', 'props', 'worlds'].includes(S.tab)) refreshTab();
        if (S.tab === 'console') renderCmdbar();
      }
      break;
    }
    case 'players':
      S.status.online = msg.data;
      renderStats();
      renderNav();
      if (S.tab === 'players') refreshTab();
      break;
    case 'stats':
      S.stats = msg.data;
      renderStats();
      break;
    case 'job':
      S.job = msg.data;
      renderJob();
      break;
    case 'jobDone':
      toast(msg.data.ok ? `${msg.data.label} finished.` : `${msg.data.label} failed: ${msg.data.error}`, msg.data.ok ? 'ok' : 'err');
      loadOverview();
      if (['backups', 'worlds', 'setup', 'props'].includes(S.tab)) refreshTab();
      break;
  }
}

// ---------- shell ----------
function visibleTabs() {
  return TABS.filter((t) => !t.perm || can(t.perm));
}

function renderShell() {
  $('#app').innerHTML = `
    <header class="top">
      <div class="brand">
        <div class="logo">${icon('logo', 22)}</div>
        <div><div class="title">Minecraft server</div><div class="sub" id="sub"></div></div>
        <span id="status" class="status stopped">Offline</span>
        <span id="conn" class="tag tag-amber hidden">Reconnecting…</span>
      </div>
      <div class="power" id="power"></div>
    </header>
    <div class="layout">
      <nav class="side" aria-label="Panel sections" id="nav"></nav>
      <main>
        <div id="job"></div>
        <div id="toast" role="status" aria-live="polite"></div>
        <div id="stats" class="stats"></div>
        <div id="page"></div>
      </main>
    </div>`;
}

const STATE_LABEL = { stopped: 'Offline', starting: 'Starting…', running: 'Online', stopping: 'Stopping…' };

function renderHeader() {
  const o = S.overview;
  const st = S.status.state;
  const status = $('#status');
  if (!status) return;
  status.className = 'status ' + st;
  status.textContent = STATE_LABEL[st] || st;
  if (o) {
    const s = o.server;
    const addr = o.panel.addresses[0] || 'localhost';
    $('#sub').innerHTML = [
      s.installed ? `<span>${esc(s.type === 'paper' ? 'Paper' : s.type === 'vanilla' ? 'Vanilla' : 'Custom jar')} ${esc(s.version || '')}</span>` : '<span>No server installed</span>',
      `<span>World: ${esc(s.levelName)}</span>`,
      `<span class="mono">${esc(addr)}:${esc(s.port)}</span>`
    ].join('');
  }
  const p = $('#power');
  if (!can('power')) {
    p.innerHTML = '';
    return;
  }
  const busy = !!S.job;
  p.innerHTML = `
    <button class="btn btn-primary" data-act="power" data-a="start" ${st !== 'stopped' || busy ? 'disabled' : ''}>${icon('play', 16)}Start</button>
    <button class="btn" data-act="power" data-a="restart" ${st !== 'running' || busy ? 'disabled' : ''}>${icon('restart', 16)}Restart</button>
    ${st === 'stopping' ? `<button class="btn btn-danger" data-act="power" data-a="kill">Force stop</button>` : `<button class="btn btn-danger" data-act="power" data-a="stop" ${st === 'stopped' || busy ? 'disabled' : ''}>${icon('stop', 14)}Stop</button>`}`;
}

function renderNav() {
  const nav = $('#nav');
  if (!nav) return;
  const count = { players: String(S.status.online ? S.status.online.length : 0) };
  nav.innerHTML =
    visibleTabs()
      .map(
        (t) => `<button class="tab" data-act="tab" data-id="${t.id}" ${S.tab === t.id ? 'aria-current="page"' : ''}>${icon(t.icon)}<span class="label-text">${esc(t.label)}</span>${count[t.id] ? `<span class="count">${count[t.id]}</span>` : ''}</button>`
      )
      .join('') +
    `<div class="me">
      <span class="cap">Signed in as</span>
      <strong>${esc(S.user.username)}</strong>
      <span class="muted small">${S.user.owner ? 'Owner' : roleOf(S.user.perms)}</span>
      <div class="row" style="margin-top:8px"><button class="btn btn-sm" data-act="logout">Sign out</button></div>
    </div>`;
}

function renderStats() {
  const el = $('#stats');
  if (!el || !S.overview) return;
  const st = S.stats || {};
  const running = S.status.state !== 'stopped';
  const online = (S.status.online || []).length;
  const max = S.overview.server.maxPlayers || 20;
  const memPct = st.maxMemory ? Math.min(100, (st.memory / st.maxMemory) * 100) : 0;
  const cards = [
    ['Players online', `${online} / ${max}`, (online / max) * 100, 'var(--green)'],
    ['CPU', running ? `${st.cpu || 0}%` : '—', Math.min(100, st.cpu || 0), 'var(--blue)'],
    ['Memory', running ? `${fmtBytes(st.memory)} / ${fmtBytes(st.maxMemory)}` : '—', memPct, 'var(--purple)'],
    ['Uptime', running ? fmtUptime(st.uptime) : '—', running ? 100 : 0, 'var(--amber)']
  ];
  el.innerHTML = cards
    .map(([l, v, pct, c]) => `<div class="stat"><div class="muted small">${l}</div><div class="value">${esc(v)}</div><div class="bar"><div style="width:${pct.toFixed(0)}%;background:${c}"></div></div></div>`)
    .join('');
}

function renderJob() {
  const el = $('#job');
  if (!el) return;
  const j = S.job;
  el.innerHTML = j
    ? `<div class="job" role="status"><div class="top-line"><strong>${esc(j.label)}</strong><span>${j.pct}%</span></div><div class="muted small">${esc(j.stage)}</div><div class="bar thick"><div style="width:${j.pct}%;background:var(--blue)"></div></div></div>`
    : '';
  renderHeader();
}

function renderToast() {
  const el = $('#toast');
  if (!el) return;
  el.innerHTML = S.toast ? `<div class="notice ${S.toast.kind === 'err' ? 'notice-err' : 'notice-ok'}">${esc(S.toast.text)}</div>` : '';
}

function roleOf(perms) {
  for (const [name, list] of Object.entries(PRESETS)) {
    if (list.length === perms.length && list.every((p) => perms.includes(p))) return name;
  }
  return 'Custom';
}

// ---------- tabs ----------
function showTab(id) {
  S.tab = id;
  localSet('tab', id);
  renderNav();
  refreshTab(true);
}

async function refreshTab(first) {
  const page = $('#page');
  if (!page) return;
  const id = S.tab;
  try {
    if (id === 'console') {
      renderConsole();
      return;
    }
    if (first) page.innerHTML = '<div class="card empty">Loading…</div>';
    if (id === 'players') S.data.players = await api('GET', '/api/players');
    if (id === 'perms') S.data.users = await api('GET', '/api/users');
    if (id === 'props') S.data.props = await api('GET', '/api/properties');
    if (id === 'backups') S.data.backups = await api('GET', '/api/backups');
    if (id === 'worlds') S.data.worlds = await api('GET', '/api/worlds');
    if (id === 'setup') S.data.setup = await api('GET', '/api/setup/info');
    if (S.tab !== id) return; // user switched tabs while loading
    PAGES[id]();
  } catch (e) {
    page.innerHTML = `<div class="notice notice-err">${esc(e.message)}</div>`;
  }
}

// Re-render while keeping focus and caret in the field the user is typing in.
function keepFocus(fn) {
  const a = document.activeElement;
  const key = a && a.dataset ? a.dataset.model : null;
  const start = a && 'selectionStart' in a ? a.selectionStart : null;
  fn();
  if (key) {
    const el = document.querySelector(`[data-model="${CSS.escape(key)}"]`);
    if (el) {
      el.focus();
      try {
        if (start !== null) el.setSelectionRange(start, start);
      } catch {
        /* not a text field */
      }
    }
  }
}

// ---------- console ----------
const FILTERS = [
  ['all', 'All'],
  ['INFO', 'Info'],
  ['WARN', 'Warnings'],
  ['ERROR', 'Errors'],
  ['CHAT', 'Chat'],
  ['CMD', 'Commands']
];
const QUICK = ['list', 'save-all', 'say Server restarting in 5 minutes', 'time set day', 'weather clear', 'help'];

function renderConsole() {
  $('#page').innerHTML = `
    <section class="card" aria-labelledby="h-console" style="overflow:hidden">
      <div class="card-head">
        <h2 id="h-console">Console</h2>
        <div class="row">
          <div role="group" aria-label="Filter log lines" class="row" style="gap:6px">
            ${FILTERS.map(([id, l]) => `<button class="pill" data-act="filter" data-id="${id}" ${pressed(S.filter === id)}>${l}</button>`).join('')}
          </div>
          <input class="fld" type="search" data-model="search" placeholder="Search log" aria-label="Search log" value="${esc(S.search)}" style="width:180px;height:34px">
        </div>
      </div>
      <div class="log" id="log" role="log" aria-live="off"></div>
      <div id="cmdbar"></div>
    </section>`;
  fillLog();
  renderCmdbar();
}

function renderCmdbar() {
  const el = $('#cmdbar');
  if (!el) return;
  if (!can('commands')) {
    el.innerHTML = '<div class="cmdbar muted small">You can read the console but not run commands.</div>';
    return;
  }
  const off = S.status.state === 'stopped';
  el.innerHTML = `
    <form class="cmdbar" id="cmd-form">
      <label for="cmd" class="prompt">&gt;</label>
      <input id="cmd" class="fld" autocomplete="off" spellcheck="false" aria-label="Server command" placeholder="${off ? 'Server is offline. Start it to run commands' : 'Type a command, e.g. say Hello, then press Enter'}">
      <button class="btn btn-primary" type="submit">Send</button>
    </form>
    <div class="chips"><span class="muted small">Quick:</span>${QUICK.map((q) => `<button class="chip" data-act="quick" data-cmd="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
  $('#cmd-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#cmd');
    const cmd = input.value.trim();
    if (!cmd) return;
    S.cmdHistory.push(cmd);
    S.cmdIndex = S.cmdHistory.length;
    input.value = '';
    act(() => api('POST', '/api/console', { command: cmd }));
  });
  $('#cmd').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!S.cmdHistory.length) return;
    e.preventDefault();
    S.cmdIndex = Math.max(0, Math.min(S.cmdHistory.length, S.cmdIndex + (e.key === 'ArrowUp' ? -1 : 1)));
    e.target.value = S.cmdHistory[S.cmdIndex] || '';
  });
}

function lineVisible(l) {
  if (S.filter !== 'all' && l.lvl !== S.filter) return false;
  if (S.search && !l.msg.toLowerCase().includes(S.search.toLowerCase())) return false;
  return true;
}

function lineNode(l) {
  const div = document.createElement('div');
  div.className = `ln ln-${l.lvl}${l.cont ? ' cont' : ''}${l.history ? ' hist' : ''}`;
  div.innerHTML = `<span class="t">${esc(l.t)}</span><span class="lv lv-${esc(l.lvl)}">${esc(l.lvl)}</span><span class="m">${esc(l.msg)}${l.user && l.user !== 'panel' ? ` <span class="by">· ${esc(l.user)}</span>` : ''}</span>`;
  return div;
}

function fillLog() {
  const log = $('#log');
  if (!log) return;
  const frag = document.createDocumentFragment();
  const shown = S.lines.filter(lineVisible);
  for (const l of shown) frag.appendChild(lineNode(l));
  log.replaceChildren(frag);
  if (!shown.length) log.innerHTML = `<div class="muted">${S.lines.length ? 'No lines match.' : 'Nothing here yet. Start the server to see its output.'}</div>`;
  log.scrollTop = log.scrollHeight;
}

function appendLine(l) {
  const log = $('#log');
  if (!log || !lineVisible(l)) return;
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  if (log.firstElementChild && log.firstElementChild.classList.contains('muted')) log.innerHTML = '';
  log.appendChild(lineNode(l));
  while (log.childElementCount > 2000) log.firstElementChild.remove();
  if (nearBottom) log.scrollTop = log.scrollHeight;
}

// ---------- players ----------
function renderPlayers() {
  const d = S.data.players;
  const running = d.running;
  const allowed = can('players');
  const disabled = !running || !allowed ? 'disabled' : '';
  $('#page').innerHTML = `
    <section class="card" aria-labelledby="h-players" style="overflow:hidden">
      <div class="card-head">
        <div><h2 id="h-players">Players</h2><p>Operators, whitelist and bans. Changes run as server commands.</p></div>
        ${allowed ? `<form class="row" id="wl-form"><input class="fld" data-model="newPlayer" value="${esc(S.form.newPlayer || '')}" placeholder="Player name" aria-label="Player name to whitelist" maxlength="16" style="width:180px"><button class="btn btn-primary" type="submit" ${disabled}>Add to whitelist</button></form>` : ''}
      </div>
      ${!running ? '<div style="padding:12px 16px 0"><div class="notice notice-info">The server is offline. Start it to change operators, the whitelist or bans.</div></div>' : ''}
      ${!allowed ? '<div style="padding:12px 16px 0"><div class="notice notice-info">You can see players but not change them.</div></div>' : ''}
      ${
        d.players.length
          ? `<div class="table-wrap" style="margin-top:8px"><table>
        <thead><tr><th>Player</th><th>Status</th><th>Operator</th><th>Whitelisted</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>${d.players
          .map((p) => {
            const status = p.banned ? '<span class="tag tag-red">Banned</span>' : p.online ? '<span class="tag tag-green">Online</span>' : '<span class="tag tag-gray">Offline</span>';
            const n = esc(p.name);
            return `<tr>
              <td><div class="who">${avatar(p.name)}<span style="font-weight:500">${n}</span></div></td>
              <td>${status}</td>
              <td>${sw(p.op, `data-act="player" data-name="${n}" data-a="${p.op ? 'deop' : 'op'}" aria-label="Operator: ${n}" ${disabled}`)}</td>
              <td>${sw(p.whitelisted, `data-act="player" data-name="${n}" data-a="${p.whitelisted ? 'whitelist-remove' : 'whitelist-add'}" aria-label="Whitelisted: ${n}" ${disabled}`)}</td>
              <td class="actions">
                <button class="btn btn-sm" data-act="player" data-name="${n}" data-a="kick" ${!p.online || disabled ? 'disabled' : ''}>Kick</button>
                <button class="btn btn-sm ${p.banned ? '' : 'btn-danger'}" data-act="player" data-name="${n}" data-a="${p.banned ? 'pardon' : 'ban'}" ${disabled}>${p.banned ? 'Unban' : 'Ban'}</button>
              </td></tr>`;
          })
          .join('')}</tbody></table></div>`
          : '<div class="empty">No players yet. Players appear here after they join, or when you whitelist them.</div>'
      }
    </section>`;
  const f = $('#wl-form');
  if (f)
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (S.form.newPlayer || '').trim();
      if (!name) return;
      act(async () => {
        await api('POST', '/api/players', { name, action: 'whitelist-add' });
        S.form.newPlayer = '';
        setTimeout(refreshTab, 800);
      }, `Added ${name} to the whitelist.`);
    });
}

// ---------- permissions ----------
function renderPerms() {
  const users = S.data.users.users;
  if (!S.selUser || !users.some((u) => u.username === S.selUser)) S.selUser = (users.find((u) => !u.owner) || users[0]).username;
  const sel = users.find((u) => u.username === S.selUser);
  const locked = sel.owner || (!S.user.owner && sel.perms.includes('access'));
  const role = sel.owner ? 'Owner' : roleOf(sel.perms);
  const o = S.overview;
  const urls = o.panel.lanAccess ? o.panel.addresses.map((a) => `http://${a}:${o.panel.port}`) : [];
  const roleTag = { Owner: 'tag-green', Admin: 'tag-blue', Moderator: 'tag-purple', Viewer: 'tag-gray', Custom: 'tag-amber' };

  $('#page').innerHTML = `
    <section class="stack" aria-labelledby="h-perms" style="gap:16px">
      <div class="page-head"><div><h2 id="h-perms">Panel access</h2><p>People who can open this panel from other PCs, and what each of them may do.</p></div></div>
      <div class="split">
        <div class="side-col card" style="overflow:hidden">
          ${users
            .map((u) => {
              const r = u.owner ? 'Owner' : roleOf(u.perms);
              return `<button class="user-row" data-act="seluser" data-name="${esc(u.username)}" ${u.username === S.selUser ? 'aria-current="true"' : ''}>
                ${avatar(u.username)}
                <span style="flex:1;min-width:0"><span style="display:block;font-weight:600">${esc(u.username)}${u.username === S.user.username ? ' (you)' : ''}</span><span class="muted tiny">${esc(ago(u.lastSeen))}${u.lastIp ? ' · ' + esc(u.lastIp) : ''}</span></span>
                <span class="tag ${roleTag[r]}">${r}</span></button>`;
            })
            .join('')}
          <form id="add-user" class="stack" style="padding:14px;gap:10px;border-top:1px solid var(--line)">
            <strong>Add a person</strong>
            <input class="fld" data-model="nuName" value="${esc(S.form.nuName || '')}" placeholder="Username" aria-label="New username" autocomplete="off" maxlength="32">
            <input class="fld" type="password" data-model="nuPass" value="${esc(S.form.nuPass || '')}" placeholder="Temporary password (8+ characters)" aria-label="Temporary password" autocomplete="new-password">
            <div class="row"><select class="fld" data-model="nuRole" aria-label="Role" style="flex:1">${Object.keys(PRESETS).map((r) => `<option ${(S.form.nuRole || 'Viewer') === r ? 'selected' : ''}>${r}</option>`).join('')}</select><button class="btn btn-primary" type="submit">Add</button></div>
            <span class="muted tiny">Give them the username and password. They can change the password after signing in.</span>
          </form>
        </div>
        <div class="grow card" style="overflow:hidden">
          <div class="card-head">
            <div><h3>${esc(sel.username)}</h3><p>${sel.owner ? 'Owner of this panel. Has every permission.' : `${role} · ${esc(ago(sel.lastSeen))}`}</p></div>
            <div role="group" aria-label="Role presets" class="row" style="gap:6px">
              ${Object.keys(PRESETS).map((r) => `<button class="pill" data-act="preset" data-role="${r}" ${pressed(role === r)} ${locked ? 'disabled' : ''}>${r}</button>`).join('')}
            </div>
          </div>
          <div class="divide">
            ${PERM_INFO.map(([id, label, desc]) => {
              const has = sel.owner || sel.perms.includes(id);
              const ownerOnly = id === 'access' && !S.user.owner;
              return `<div class="item"><div class="info"><div style="font-weight:500">${label}</div><div class="desc">${desc}</div></div>${sw(has, `data-act="perm" data-perm="${id}" aria-label="${esc(label)}" ${locked || ownerOnly ? 'disabled' : ''}`)}</div>`;
            }).join('')}
          </div>
          ${
            !sel.owner && sel.username !== S.user.username && !locked
              ? `<div class="row" style="padding:14px 16px;justify-content:space-between;border-top:1px solid var(--line)">
              <form class="row" id="reset-pass"><input class="fld" type="password" data-model="resetPass" value="${esc(S.form.resetPass || '')}" placeholder="New password" aria-label="New password for ${esc(sel.username)}" autocomplete="new-password" style="width:200px"><button class="btn" type="submit">Reset password</button></form>
              <button class="btn btn-danger" data-act="deluser">Remove access</button></div>`
              : ''
          }
        </div>
      </div>
      <div class="card card-pad split" style="gap:16px 32px">
        <div class="grow stack" style="gap:10px">
          <h3>Open the panel from another PC</h3>
          ${
            urls.length
              ? `<p class="muted small" style="margin:0">On the same Wi-Fi or network, open one of these addresses in a browser and sign in:</p>${urls
                  .map((u) => `<div class="row"><code class="fld" style="flex:1;display:flex;align-items:center;overflow-x:auto;white-space:nowrap">${esc(u)}</code><button class="btn" data-act="copy" data-text="${esc(u)}">Copy</button></div>`)
                  .join('')}<p class="muted tiny" style="margin:0">If it doesn't load, allow Node.js through this PC's firewall.</p>`
              : '<div class="notice notice-info">Network access is off, so only this PC can open the panel. Turn it on below.</div>'
          }
        </div>
        <div class="side-col stack" style="gap:6px">
          <div class="toggle-row"><div><div style="font-weight:500">Allow other PCs on my network</div><div class="muted small">Needs a panel restart to take effect</div></div>${sw(o.panel.lanAccess, `data-act="lan" aria-label="Allow other PCs on my network" ${S.user.owner ? '' : 'disabled'}`)}</div>
          <div class="notice notice-info">To reach the panel from outside your home, use a private VPN such as Tailscale or ZeroTier. Don't port-forward the panel to the internet.</div>
        </div>
      </div>
    </section>`;

  $('#add-user').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = (S.form.nuName || '').trim();
    act(async () => {
      await api('POST', '/api/users', { username, password: S.form.nuPass || '', perms: PRESETS[S.form.nuRole || 'Viewer'] });
      S.form.nuName = S.form.nuPass = '';
      S.selUser = username;
      await refreshTab();
    }, `${username} can now sign in.`);
  });
  const rp = $('#reset-pass');
  if (rp)
    rp.addEventListener('submit', (e) => {
      e.preventDefault();
      act(async () => {
        await api('PUT', '/api/users/' + encodeURIComponent(sel.username), { password: S.form.resetPass || '' });
        S.form.resetPass = '';
        renderPerms();
      }, `Password reset for ${sel.username}. They have been signed out.`);
    });
}

async function setPerms(perms) {
  const name = S.selUser;
  await act(async () => {
    await api('PUT', '/api/users/' + encodeURIComponent(name), { perms });
    await refreshTab();
  });
}

// ---------- server.properties ----------
function propRows() {
  const d = S.data.props;
  const removed = new Set(S.propRemoved);
  const rows = d.entries
    .filter((e) => !removed.has(e.key))
    .map((e) => Object.assign({}, e, { saved: e.value, value: e.key in S.propEdits ? S.propEdits[e.key] : e.value }));
  for (const a of S.propAdded) rows.push({ key: a.key, value: a.value, saved: null, group: 'New', type: a.value === 'true' || a.value === 'false' ? 'bool' : 'text', desc: 'Added by you', isNew: true });
  return rows;
}

function changeCount() {
  const d = S.data.props;
  const edited = d.entries.filter((e) => e.key in S.propEdits && S.propEdits[e.key] !== e.value && !S.propRemoved.includes(e.key)).length;
  return edited + S.propRemoved.length + S.propAdded.length;
}

function renderProps() {
  const d = S.data.props;
  if (!d.exists) {
    $('#page').innerHTML = `<div class="stack"><div class="page-head"><div><h2>server.properties</h2></div></div><div class="notice notice-info">There's no server.properties file yet. Minecraft creates it the first time the server starts. Start the server once, then come back here.</div></div>`;
    return;
  }
  const rows = propRows();
  const groups = ['all', ...['Players', 'Gameplay', 'World', 'Network', 'Advanced', 'Other', 'New'].filter((g) => rows.some((r) => r.group === g))];
  if (!groups.includes(S.propGroup)) S.propGroup = 'all';
  const q = S.propSearch.trim().toLowerCase();
  const shown = rows.filter((r) => (S.propGroup === 'all' || r.group === S.propGroup) && (!q || r.key.includes(q) || (r.desc || '').toLowerCase().includes(q)));
  const n = changeCount();

  $('#page').innerHTML = `
    <section class="stack" aria-labelledby="h-props" style="gap:16px">
      <div class="page-head">
        <div><h2 id="h-props">server.properties</h2><p>Every setting in the file. Most changes apply after a restart.</p></div>
        <div class="row">
          <span class="small" style="color:${n ? 'var(--amber)' : 'var(--muted)'};font-weight:500">${n ? `${n} unsaved change${n > 1 ? 's' : ''}` : 'All changes saved'}</span>
          <button class="btn" data-act="raw" ${pressed(S.showRaw)}>${S.showRaw ? 'Show as list' : 'View file'}</button>
          <button class="btn" data-act="discard" ${n ? '' : 'disabled'}>Discard</button>
          <button class="btn btn-primary" data-act="saveprops" ${n ? '' : 'disabled'}>Save file</button>
        </div>
      </div>
      ${d.running && n ? '<div class="notice notice-info">The server is running. Restart it after saving to apply the changes.</div>' : ''}
      <div class="row" style="gap:10px">
        <div style="position:relative;flex:1 1 260px;min-width:0"><span class="muted" style="position:absolute;left:12px;top:11px">${icon('search', 16)}</span><input class="fld" type="search" data-model="propSearch" value="${esc(S.propSearch)}" placeholder="Search, e.g. pvp or seed" aria-label="Search properties" style="width:100%;padding-left:36px"></div>
        <div role="group" aria-label="Property groups" class="row" style="gap:6px">${groups.map((g) => `<button class="pill" data-act="pgroup" data-id="${g}" ${pressed(S.propGroup === g)}>${g === 'all' ? 'All' : g}</button>`).join('')}</div>
      </div>
      ${
        S.showRaw
          ? `<p class="muted small" style="margin:0">The file as it is saved on disk${n ? ' (your unsaved changes are not included)' : ''}:</p><pre class="raw">${esc(d.raw)}</pre>`
          : `<div class="card divide" style="overflow:hidden">${
              shown.length
                ? shown
                    .map((r) => {
                      const k = esc(r.key);
                      const edited = r.isNew || r.value !== r.saved;
                      let control;
                      if (r.type === 'bool') control = `<span class="mono small muted" style="width:40px;text-align:right">${esc(r.value)}</span>${sw(r.value === 'true', `data-act="pbool" data-key="${k}" aria-label="${k}"`)}`;
                      else if (r.type === 'enum')
                        control = `<div role="group" aria-label="${k}" class="row" style="gap:4px;justify-content:flex-end">${(r.options.includes(r.value) ? r.options : r.options.concat([r.value]))
                          .map((o) => `<button class="pill" data-act="penum" data-key="${k}" data-v="${esc(o)}" ${pressed(r.value === o)}>${esc(o.replace('minecraft:', ''))}</button>`)
                          .join('')}</div>`;
                      else
                        control = `<input class="fld mono" ${r.secret ? 'type="password" autocomplete="off"' : r.type === 'int' ? 'type="number"' : 'type="text"'} data-prop="${k}" value="${esc(r.value)}" placeholder="(empty)" aria-label="${k}" style="width:${r.type === 'int' ? '140px' : '300px'};max-width:100%;font-size:13px">`;
                      return `<div class="item" style="${edited ? 'background:#1a1f18' : ''}">
                        <div class="info"><div class="row" style="gap:8px"><code style="font-weight:500">${k}</code><span class="tag ${GROUP_TAG[r.group] || 'tag-gray'}">${esc(r.group)}</span>${edited ? `<span class="tag tag-amber">${r.isNew ? 'New' : 'Edited'}</span>` : ''}</div><div class="desc">${esc(r.desc)}</div></div>
                        <div class="row" style="justify-content:flex-end;max-width:100%">${control}<button class="btn btn-sm btn-icon btn-danger" data-act="premove" data-key="${k}" aria-label="Remove ${k}" title="Remove from file">${icon('trash', 15)}</button></div>
                      </div>`;
                    })
                    .join('')
                : `<div class="empty">No properties match.</div>`
            }</div>`
      }
      <form class="card card-pad stack" id="add-prop" style="gap:10px">
        <h3>Add a property</h3>
        <p class="muted small" style="margin:0">For settings not in the file yet, e.g. from a newer Minecraft version or a mod.</p>
        <div class="row">
          <input class="fld mono" data-model="newKey" value="${esc(S.form.newKey || '')}" placeholder="key, e.g. hide-online-players" aria-label="Property key" style="flex:1 1 220px">
          <span class="mono muted">=</span>
          <input class="fld mono" data-model="newVal" value="${esc(S.form.newVal || '')}" placeholder="value" aria-label="Property value" style="flex:1 1 180px">
          <button class="btn btn-primary" type="submit">Add</button>
        </div>
      </form>
    </section>`;

  $('#add-prop').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = (S.form.newKey || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(key)) return toast('Keys use lowercase letters, numbers, dots and dashes.', 'err');
    if (propRows().some((r) => r.key === key)) return toast(`${key} is already in the file.`, 'err');
    S.propAdded.push({ key, value: (S.form.newVal || '').trim() });
    S.form.newKey = S.form.newVal = '';
    S.propGroup = 'New';
    renderProps();
  });
}

function setPropValue(key, value) {
  const added = S.propAdded.find((a) => a.key === key);
  if (added) added.value = value;
  else S.propEdits[key] = value;
}

// ---------- backups ----------
function renderBackups() {
  const d = S.data.backups;
  const busy = !!S.job;
  const total = d.backups.reduce((n, b) => n + b.size, 0);
  const typeTag = { Manual: 'tag-blue', Auto: 'tag-gray', Safety: 'tag-amber' };
  const a = d.auto;
  $('#page').innerHTML = `
    <section class="stack" aria-labelledby="h-backups" style="gap:16px">
      <div class="page-head"><div><h2 id="h-backups">Backups</h2><p>Zip copies of the world "${esc(d.world)}", including the Nether and the End. Safe to take while the server runs.</p></div></div>
      <div class="split" style="align-items:stretch">
        <form class="grow card card-pad stack" id="backup-form">
          <h3>Back up now</h3>
          <div class="row"><input class="fld" data-model="backupName" value="${esc(S.form.backupName || '')}" maxlength="80" placeholder="Name (optional), e.g. Before the castle build" aria-label="Backup name" style="flex:1 1 260px"><button class="btn btn-primary" type="submit" ${busy ? 'disabled' : ''}>${icon('backups', 16)}Create backup</button></div>
          <p class="muted small" style="margin:0">While copying, the panel pauses autosave (<code>save-off</code>), saves the world (<code>save-all flush</code>), then turns autosave back on.</p>
        </form>
        <div class="side-col card card-pad stack">
          <div class="toggle-row" style="padding:0"><div><h3>Automatic backups</h3><div class="muted small">${a.enabled ? `On · every ${a.everyHours} h · keeps the last ${a.keep}` : 'Off'}</div></div>${sw(a.enabled, 'data-act="autobk" aria-label="Automatic backups"')}</div>
          <div class="grid-auto" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <label class="field"><span>How often</span><select class="fld" data-act-change="autofreq">${[[6, 'Every 6 hours'], [12, 'Every 12 hours'], [24, 'Daily'], [168, 'Weekly']].map(([h, l]) => `<option value="${h}" ${a.everyHours === h ? 'selected' : ''}>${l}</option>`).join('')}${[6, 12, 24, 168].includes(a.everyHours) ? '' : `<option value="${a.everyHours}" selected>Every ${a.everyHours} h</option>`}</select></label>
            <label class="field"><span>Keep last</span><input class="fld" type="number" min="1" max="500" value="${a.keep}" data-act-change="autokeep"></label>
          </div>
          <div class="stack" style="gap:6px"><div class="row small" style="justify-content:space-between"><span class="muted">Backup folder uses</span><span>${fmtBytes(total)}</span></div><code class="muted tiny" style="word-break:break-all">${esc(d.folder)}</code></div>
        </div>
      </div>
      <div class="card" style="overflow:hidden">
        <div class="card-head"><h3>Saved backups</h3><span class="muted small">${d.backups.length} backup${d.backups.length === 1 ? '' : 's'}</span></div>
        <div class="divide">
        ${
          d.backups.length
            ? d.backups
                .map(
                  (b) => `<div>
            <div class="item">
              <div class="info"><div class="row" style="gap:8px"><strong>${esc(b.name)}</strong><span class="tag ${typeTag[b.type] || 'tag-gray'}">${esc(b.type)}</span></div><div class="desc">${esc(fmtDate(b.createdAt))} · ${esc(b.world)} · ${fmtBytes(b.size)}</div></div>
              <div class="row" style="gap:6px">
                <button class="btn btn-sm" data-act="askrestore" data-id="${esc(b.id)}" ${busy ? 'disabled' : ''}>Restore</button>
                <a class="btn btn-sm" href="/api/backups/${encodeURIComponent(b.id)}/download" download>Download</a>
                <button class="btn btn-sm btn-icon btn-danger" data-act="delbackup" data-id="${esc(b.id)}" aria-label="Delete backup ${esc(b.name)}" ${busy ? 'disabled' : ''}>${icon('trash', 15)}</button>
              </div>
            </div>
            ${
              S.confirmRestore === b.id
                ? `<div class="notice notice-warn row" style="margin:0 16px 12px;justify-content:space-between"><span style="flex:1 1 260px">Restoring replaces the world "${esc(b.world)}" with this backup. The server stops, swaps the files, then starts again. A safety backup of the current world is taken first.</span><span class="row" style="gap:6px"><button class="btn btn-sm" data-act="cancelrestore">Cancel</button><button class="btn btn-sm btn-warn" data-act="restore" data-id="${esc(b.id)}">Restore world</button></span></div>`
                : ''
            }</div>`
                )
                .join('')
            : '<div class="empty">No backups yet.</div>'
        }
        </div>
      </div>
    </section>`;
  $('#backup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    act(async () => {
      await api('POST', '/api/backups', { name: S.form.backupName || '' });
      S.form.backupName = '';
    }, 'Backup started.');
  });
}

async function saveAuto(patch) {
  const a = Object.assign({}, S.data.backups.auto, patch);
  await act(async () => {
    const r = await api('PUT', '/api/backups/settings', a);
    S.data.backups.auto = r.auto;
    renderBackups();
  }, 'Automatic backup settings saved.');
}

// ---------- worlds ----------
function renderWorlds() {
  const d = S.data.worlds;
  const g = S.form.gen;
  const busy = !!S.job;
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const genFlags = [
    ['structures', 'Generate structures', 'Villages, temples, strongholds and more'],
    ['hardcore', 'Hardcore', 'One life; difficulty is locked to hard'],
    ['backupFirst', 'Back up the current world first', `Keeps a copy of "${S.overview.server.levelName}" before switching`]
  ];
  $('#page').innerHTML = `
    <section class="stack" aria-labelledby="h-worlds" style="gap:16px">
      <div class="page-head"><div><h2 id="h-worlds">Worlds</h2><p>Generate new worlds and choose which one the server loads.</p></div></div>
      <div class="split">
        <form class="grow card card-pad stack" id="gen-form" style="gap:14px">
          <h3>World generator</h3>
          <div class="grid-auto">
            <label class="field"><span>World name (folder)</span><input class="fld mono" data-model="gen.name" value="${esc(g.name || '')}" placeholder="e.g. survival_2" maxlength="64" required></label>
            <div class="field"><label for="seed" class="label">Seed (empty = random)</label><div class="row" style="flex-wrap:nowrap"><input id="seed" class="fld mono" data-model="gen.seed" value="${esc(g.seed || '')}" placeholder="Any text or number" style="flex:1"><button type="button" class="btn btn-icon" data-act="randseed" aria-label="Random seed">${icon('dice')}</button></div></div>
          </div>
          <div class="field"><span>World type</span><div role="group" aria-label="World type" class="type-grid">
            ${WORLD_TYPES.map(([id, l, desc]) => `<button type="button" class="type-card" data-act="wtype" data-id="${id}" ${pressed(g.type === id)}><strong>${l}</strong><span class="d">${desc}</span></button>`).join('')}
          </div></div>
          ${g.type === 'minecraft:flat' ? `<label class="field"><span>Flat preset</span><select class="fld" data-model="gen.flatPreset">${opt(d.flatPresets.map((p) => [p, FLAT_LABELS[p] || p]), g.flatPreset)}</select></label>` : ''}
          ${g.type === 'minecraft:single_biome_surface' ? `<label class="field"><span>Biome</span><select class="fld" data-model="gen.biome">${opt(d.biomes.map((b) => [b, b.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())]), g.biome)}</select></label>` : ''}
          <div class="grid-auto">
            <label class="field"><span>Game mode</span><select class="fld" data-model="gen.gamemode">${opt([['survival', 'Survival'], ['creative', 'Creative'], ['adventure', 'Adventure'], ['spectator', 'Spectator']], g.gamemode)}</select></label>
            <label class="field"><span>Difficulty</span><select class="fld" data-model="gen.difficulty" ${g.hardcore ? 'disabled' : ''}>${opt([['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], g.hardcore ? 'hard' : g.difficulty)}</select></label>
          </div>
          <div class="divide">${genFlags.map(([id, l, desc]) => `<div class="toggle-row"><div><div style="font-weight:500">${l}</div><div class="muted small">${esc(desc)}</div></div>${sw(g[id], `data-act="genflag" data-id="${id}" aria-label="${l}"`)}</div>`).join('')}</div>
          <div class="row" style="justify-content:space-between">
            <p class="muted small" style="margin:0;flex:1 1 260px">Sets <code>level-name</code>, <code>level-seed</code> and <code>level-type</code>, then restarts the server to generate the world.</p>
            <button class="btn btn-primary" type="submit" ${busy ? 'disabled' : ''}>${icon('worlds', 16)}Generate world</button>
          </div>
        </form>
        <div class="side-col card" style="overflow:hidden">
          <div class="card-head"><h3>Worlds on this PC</h3></div>
          <div class="divide">
          ${d.worlds
            .map(
              (w) => `<div class="stack" style="padding:12px 16px;gap:6px">
              <div class="row" style="justify-content:space-between"><span class="mono" style="font-weight:500">${esc(w.name)}</span>${w.active ? '<span class="tag tag-green">Loaded</span>' : '<span class="tag tag-gray">Saved</span>'}</div>
              <div class="muted small">${w.pending ? 'Created the next time the server starts' : [w.type, fmtBytes(w.size), w.created ? 'created ' + fmtDate(w.created) : ''].filter(Boolean).map(esc).join(' · ')}</div>
              ${w.seed ? `<div class="muted tiny mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">seed ${esc(w.seed)}</div>` : ''}
              ${!w.active ? `<div class="row" style="gap:6px"><button class="btn btn-sm" data-act="loadworld" data-name="${esc(w.name)}" ${busy ? 'disabled' : ''}>Load this world</button><button class="btn btn-sm btn-danger" data-act="delworld" data-name="${esc(w.name)}" ${busy ? 'disabled' : ''}>Delete</button></div>` : ''}
            </div>`
            )
            .join('')}
          </div>
        </div>
      </div>
    </section>`;
  $('#gen-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (g.name || '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) return toast('Give the world a folder name using letters, numbers, - or _.', 'err');
    if (S.status.state !== 'stopped' && !confirm(`The server will restart to generate "${name}". Players will be disconnected. Continue?`)) return;
    act(async () => {
      await api('POST', '/api/worlds', Object.assign({}, g, { name }));
      g.name = '';
      g.seed = '';
    }, `Generating "${name}"…`);
  });
}

// ---------- setup ----------
function renderSetup() {
  const d = S.data.setup;
  const c = d.config;
  const running = S.status.state !== 'stopped';
  const type = S.form.setupType;
  const versions = (S.data.versions && S.data.versions[type]) || null;
  const vinfo = S.data.vinfo;
  const javaOk = vinfo && vinfo.javaMin && d.java ? d.java.major >= vinfo.javaMin : null;

  $('#page').innerHTML = `
    <section class="stack" aria-labelledby="h-setup" style="gap:16px">
      <div class="page-head"><div><h2 id="h-setup">Setup</h2><p>Install the server, accept the EULA, and choose Java and memory.</p></div></div>
      ${!d.installed || !d.eula ? `<div class="notice notice-info">To get started: <strong>1.</strong> install a server version, <strong>2.</strong> accept the EULA, <strong>3.</strong> press Start at the top.</div>` : ''}

      <div class="card card-pad stack">
        <div class="row" style="justify-content:space-between"><h3>1. Server software</h3>${d.installed ? `<span class="tag tag-green">Installed: ${esc(d.type === 'paper' ? 'Paper' : d.type === 'vanilla' ? 'Vanilla' : 'custom jar')} ${esc(d.version || '')}</span>` : '<span class="tag tag-amber">Not installed</span>'}</div>
        <p class="muted small" style="margin:0"><strong>Paper</strong> is faster and supports plugins (recommended). <strong>Vanilla</strong> is the official server from Mojang. Downloads come straight from PaperMC or Mojang and are checked against their checksums.</p>
        <div class="row">
          <div role="group" aria-label="Server type" class="row" style="gap:6px">
            <button class="pill" data-act="stype" data-id="paper" ${pressed(type === 'paper')}>Paper</button>
            <button class="pill" data-act="stype" data-id="vanilla" ${pressed(type === 'vanilla')}>Vanilla</button>
          </div>
          <select class="fld" id="version-select" aria-label="Version" style="min-width:160px" ${versions ? '' : 'disabled'}>
            ${versions ? `<option value="">Choose a version…</option>${versions.map((v) => `<option ${S.form.version === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}` : '<option>Loading versions…</option>'}
          </select>
          <button class="btn btn-primary" data-act="install" ${!S.form.version || running || S.job ? 'disabled' : ''}>${d.installed ? 'Install this version' : 'Install'}</button>
        </div>
        ${vinfo ? `<div class="notice ${javaOk === false ? 'notice-err' : 'notice-ok'}">${esc(vinfo.type === 'paper' ? 'Paper' : 'Vanilla')} ${esc(vinfo.version)}${vinfo.build ? ' build ' + esc(vinfo.build) : ''} · ${fmtBytes(vinfo.size)} · needs Java ${esc(vinfo.javaMin || '?')} or newer. ${d.java ? `You have Java ${esc(d.java.major)}${javaOk === false ? ': install a newer Java first (see adoptium.net), or pick an older version.' : '.'}` : 'Java was not found on this PC.'}</div>` : ''}
        ${running ? '<p class="muted small" style="margin:0">Stop the server to change its version.</p>' : ''}
        ${d.installed ? '<p class="muted small" style="margin:0">Switching versions keeps your worlds. Make a backup first: worlds can be upgraded to newer versions but not downgraded.</p>' : ''}
      </div>

      <div class="card card-pad stack">
        <div class="row" style="justify-content:space-between"><h3>2. Minecraft EULA</h3>${d.eula ? '<span class="tag tag-green">Accepted</span>' : '<span class="tag tag-amber">Not accepted</span>'}</div>
        ${
          d.eula
            ? '<p class="muted small" style="margin:0">You have agreed to the <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener noreferrer">Minecraft End User License Agreement</a>.</p>'
            : `<label class="check"><input type="checkbox" id="eula-check"><span>I have read and agree to the <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener noreferrer">Minecraft End User License Agreement</a>. The server won't start without it.</span></label><div><button class="btn btn-primary" data-act="eula">Accept EULA</button></div>`
        }
      </div>

      <form class="card card-pad stack" id="java-form">
        <h3>3. Java and memory</h3>
        <div class="grid-auto">
          <label class="field"><span>Java command or path</span><input class="fld mono" name="javaPath" value="${esc(c.javaPath)}" required></label>
          <div class="field"><span>Detected Java</span><div class="fld" style="display:flex;align-items:center">${d.java ? `Java ${esc(d.java.major)}` : '<span style="color:var(--red)">Not found</span>'}</div></div>
          <label class="field"><span>Minimum memory (MB)</span><input class="fld" type="number" name="minMemoryMB" min="256" step="256" value="${c.minMemoryMB}"></label>
          <label class="field"><span>Maximum memory (MB)</span><input class="fld" type="number" name="maxMemoryMB" min="512" step="256" value="${c.maxMemoryMB}"></label>
        </div>
        <p class="muted small" style="margin:0">This PC has ${fmtBytes(d.totalMemoryMB * 1024 * 1024)} of memory. 4–6 GB is plenty for a few friends; leave at least 2 GB for the system.</p>
        <label class="field"><span>Extra Java arguments (optional)</span><input class="fld mono" name="jvmArgs" value="${esc(c.jvmArgs)}" placeholder="e.g. -XX:+UseG1GC"></label>
        ${vinfo && vinfo.recommendedFlags && vinfo.recommendedFlags.length ? `<div><button type="button" class="btn btn-sm" data-act="useflags">Use Paper's recommended flags</button></div>` : ''}
        <div class="toggle-row"><div><div style="font-weight:500">Restart automatically after a crash</div><div class="muted small">Gives up after 3 crashes in 10 minutes</div></div>${sw(c.autoRestartOnCrash, 'data-act="autorestart" aria-label="Restart automatically after a crash"')}</div>
        <div class="row" style="justify-content:space-between"><span class="muted small">Changes apply the next time the server starts.</span><button class="btn btn-primary" type="submit">Save</button></div>
      </form>

      <div class="card card-pad stack">
        <h3>Folders</h3>
        <div class="grid-auto">
          <div class="field"><span>Server files</span><code class="small" style="word-break:break-all">${esc(c.serverDir)}</code></div>
          <div class="field"><span>Backups</span><code class="small" style="word-break:break-all">${esc(c.backupDir)}</code></div>
        </div>
        <p class="muted small" style="margin:0">To use an existing server, copy its files (worlds, server.properties, and its jar renamed to <code>server.jar</code>) into the server folder while the server is stopped.</p>
      </div>

      <form class="card card-pad stack" id="pw-form">
        <h3>Your password</h3>
        <div class="grid-auto">
          <label class="field"><span>Current password</span><input class="fld" type="password" name="current" autocomplete="current-password" required></label>
          <label class="field"><span>New password</span><input class="fld" type="password" name="password" autocomplete="new-password" minlength="8" required></label>
        </div>
        <div><button class="btn" type="submit">Change password</button></div>
      </form>
    </section>`;

  if (!versions) loadVersions(type);
  $('#version-select').addEventListener('change', async (e) => {
    S.form.version = e.target.value;
    S.data.vinfo = null;
    renderSetup();
    if (!S.form.version) return;
    try {
      S.data.vinfo = await api('GET', `/api/setup/version-info?type=${type}&version=${encodeURIComponent(S.form.version)}`);
      if (S.tab === 'setup') renderSetup();
    } catch (ex) {
      toast(ex.message, 'err');
    }
  });
  $('#java-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    act(async () => {
      await api('PUT', '/api/setup/config', { javaPath: f.get('javaPath'), minMemoryMB: f.get('minMemoryMB'), maxMemoryMB: f.get('maxMemoryMB'), jvmArgs: f.get('jvmArgs') });
      await refreshTab();
    }, 'Saved. Restart the server to apply.');
  });
  $('#pw-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    act(async () => {
      await api('POST', '/api/account/password', { current: f.get('current'), password: f.get('password') });
      toast('Password changed. Please sign in again.');
      setTimeout(boot, 1200);
    });
  });
}

async function loadVersions(type) {
  try {
    const r = await api('GET', '/api/setup/versions?type=' + type);
    S.data.versions = Object.assign({}, S.data.versions, { [type]: r.versions.slice().reverse().sort(cmpVersionDesc) });
    if (S.tab === 'setup' && S.form.setupType === type) renderSetup();
  } catch (e) {
    toast("Couldn't load versions: " + e.message, 'err');
  }
}
function cmpVersionDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
}

const PAGES = { players: renderPlayers, perms: renderPerms, props: renderProps, backups: renderBackups, worlds: renderWorlds, setup: renderSetup };

// ---------- event delegation ----------
const ACTIONS = {
  tab: (el) => showTab(el.dataset.id),
  logout: () =>
    act(async () => {
      await api('POST', '/api/logout');
      S.user = null;
      localSet('tab', '');
      boot();
    }),
  power: (el) => act(() => api('POST', '/api/server/' + el.dataset.a)),
  filter: (el) => {
    S.filter = el.dataset.id;
    renderConsole();
  },
  quick: (el) => {
    const input = $('#cmd');
    input.value = el.dataset.cmd;
    input.focus();
  },
  player: (el) =>
    act(async () => {
      const { name, a } = el.dataset;
      if (a === 'ban' && !confirm(`Ban ${name}? They will be kicked and can't rejoin until unbanned.`)) return;
      await api('POST', '/api/players', { name, action: a });
      setTimeout(refreshTab, 800);
    }),
  seluser: (el) => {
    S.selUser = el.dataset.name;
    renderPerms();
  },
  preset: (el) => setPerms(PRESETS[el.dataset.role].slice()),
  perm: (el) => {
    const sel = S.data.users.users.find((u) => u.username === S.selUser);
    const p = el.dataset.perm;
    setPerms(sel.perms.includes(p) ? sel.perms.filter((x) => x !== p) : sel.perms.concat([p]));
  },
  deluser: () => {
    if (!confirm(`Remove ${S.selUser}'s access to the panel?`)) return;
    act(async () => {
      await api('DELETE', '/api/users/' + encodeURIComponent(S.selUser));
      S.selUser = null;
      await refreshTab();
    }, 'Access removed.');
  },
  copy: (el) => {
    const t = el.dataset.text;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
      () => toast('Copied ' + t),
      () => toast('Copy this address: ' + t)
    );
  },
  lan: (el) =>
    act(async () => {
      const on = el.getAttribute('aria-checked') !== 'true';
      await api('PUT', '/api/setup/config', { lanAccess: on });
      toast(on ? 'Network access will turn on after you restart the panel.' : 'Network access will turn off after you restart the panel.');
    }),
  raw: () => {
    S.showRaw = !S.showRaw;
    renderProps();
  },
  pgroup: (el) => {
    S.propGroup = el.dataset.id;
    renderProps();
  },
  pbool: (el) => {
    setPropValue(el.dataset.key, el.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    renderProps();
  },
  penum: (el) => {
    setPropValue(el.dataset.key, el.dataset.v);
    renderProps();
  },
  premove: (el) => {
    const key = el.dataset.key;
    if (S.propAdded.some((a) => a.key === key)) S.propAdded = S.propAdded.filter((a) => a.key !== key);
    else {
      if (!confirm(`Remove ${key} from server.properties? Minecraft will put it back with its default value next time it starts.`)) return;
      S.propRemoved.push(key);
    }
    renderProps();
  },
  discard: () => {
    S.propEdits = {};
    S.propRemoved = [];
    S.propAdded = [];
    renderProps();
  },
  saveprops: () =>
    act(async () => {
      const set = {};
      for (const e of S.data.props.entries) if (e.key in S.propEdits && S.propEdits[e.key] !== e.value) set[e.key] = S.propEdits[e.key];
      for (const a of S.propAdded) set[a.key] = a.value;
      await api('PUT', '/api/properties', { set, remove: S.propRemoved });
      S.propEdits = {};
      S.propRemoved = [];
      S.propAdded = [];
      await refreshTab();
      loadOverview();
    }, S.status.state !== 'stopped' ? 'Saved. Restart the server to apply the changes.' : 'Saved server.properties.'),
  askrestore: (el) => {
    S.confirmRestore = el.dataset.id;
    renderBackups();
  },
  cancelrestore: () => {
    S.confirmRestore = null;
    renderBackups();
  },
  restore: (el) =>
    act(async () => {
      S.confirmRestore = null;
      await api('POST', `/api/backups/${encodeURIComponent(el.dataset.id)}/restore`);
      renderBackups();
    }, 'Restore started.'),
  delbackup: (el) => {
    if (!confirm('Delete this backup? This cannot be undone.')) return;
    act(async () => {
      await api('DELETE', '/api/backups/' + encodeURIComponent(el.dataset.id));
      await refreshTab();
    }, 'Backup deleted.');
  },
  autobk: (el) => saveAuto({ enabled: el.getAttribute('aria-checked') !== 'true' }),
  randseed: () => {
    let d = String(1 + Math.floor(Math.random() * 9));
    for (let i = 0; i < 17; i++) d += Math.floor(Math.random() * 10);
    S.form.gen.seed = (Math.random() < 0.5 ? '-' : '') + d;
    renderWorlds();
  },
  wtype: (el) => {
    S.form.gen.type = el.dataset.id;
    renderWorlds();
  },
  genflag: (el) => {
    S.form.gen[el.dataset.id] = !S.form.gen[el.dataset.id];
    renderWorlds();
  },
  loadworld: (el) => {
    const name = el.dataset.name;
    if (S.status.state !== 'stopped' && !confirm(`Load "${name}"? The server will restart and players will be disconnected.`)) return;
    act(() => api('POST', `/api/worlds/${encodeURIComponent(name)}/activate`), `Switching to "${name}"…`);
  },
  delworld: (el) => {
    const name = el.dataset.name;
    if (!confirm(`Delete the world "${name}" for good? Make a backup first if you might want it later.`)) return;
    act(async () => {
      await api('DELETE', '/api/worlds/' + encodeURIComponent(name));
      await refreshTab();
    }, `Deleted "${name}".`);
  },
  stype: (el) => {
    S.form.setupType = el.dataset.id;
    S.form.version = '';
    S.data.vinfo = null;
    renderSetup();
  },
  install: () =>
    act(async () => {
      const r = await api('POST', '/api/setup/install', { type: S.form.setupType, version: S.form.version });
      void r;
    }, 'Download started.'),
  eula: () => {
    if (!$('#eula-check').checked) return toast('Tick the box to accept the EULA.', 'err');
    act(async () => {
      await api('POST', '/api/setup/eula', { accept: true });
      await refreshTab();
      loadOverview();
    }, 'EULA accepted.');
  },
  useflags: () => {
    const input = $('#java-form [name="jvmArgs"]');
    input.value = S.data.vinfo.recommendedFlags.join(' ');
    toast("Paper's recommended flags filled in. Press Save to keep them.");
  },
  autorestart: (el) =>
    act(async () => {
      await api('PUT', '/api/setup/config', { autoRestartOnCrash: el.getAttribute('aria-checked') !== 'true' });
      await refreshTab();
    })
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el);
});

// data-model inputs write straight into S.form (or S for console/prop search).
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.prop) {
    setPropValue(el.dataset.prop, el.value);
    const count = changeCount();
    const label = document.querySelector('#page .page-head .row span');
    if (label) {
      label.textContent = count ? `${count} unsaved change${count > 1 ? 's' : ''}` : 'All changes saved';
      label.style.color = count ? 'var(--amber)' : 'var(--muted)';
    }
    document.querySelectorAll('[data-act="discard"],[data-act="saveprops"]').forEach((b) => (b.disabled = !count));
    return;
  }
  const model = el.dataset && el.dataset.model;
  if (!model) return;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  if (model === 'search') {
    S.search = value;
    fillLog();
    return;
  }
  if (model === 'propSearch') {
    S.propSearch = value;
    keepFocus(renderProps);
    return;
  }
  if (model.startsWith('gen.')) {
    S.form.gen[model.slice(4)] = value;
    return;
  }
  S.form[model] = value;
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.model && el.dataset.model.startsWith('gen.') && el.tagName === 'SELECT') {
    S.form.gen[el.dataset.model.slice(4)] = el.value;
  }
  const a = el.dataset && el.dataset.actChange;
  if (a === 'autofreq') saveAuto({ everyHours: parseInt(el.value, 10) });
  if (a === 'autokeep') saveAuto({ keep: parseInt(el.value, 10) || 1 });
});

boot();
