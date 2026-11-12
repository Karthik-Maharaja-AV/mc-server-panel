'use strict';

// Terminal colour codes (ESC[...m) and Minecraft section-sign colour codes (§a).
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const SECTION = /§[0-9a-fk-orx]/gi;

// Vanilla / latest.log:  [15:42:01] [Server thread/INFO]: message
const VANILLA = /^\[(\d{2}:\d{2}:\d{2})\] \[([^\]]*?)\/(INFO|WARN|ERROR|FATAL|DEBUG|TRACE)\]:? ?(.*)$/;
// Paper / Spigot console:  [15:42:01 INFO]: message   (optionally [15:42:01 INFO]: [Plugin] message)
const PAPER = /^\[(\d{2}:\d{2}:\d{2}) (INFO|WARN|ERROR|FATAL|DEBUG|TRACE)\]:? ?(.*)$/;

const CHAT = /^(?:\[Not Secure\] )?<([A-Za-z0-9_]{1,16})> /;
const SAY = /^\[(?:Server|Rcon|[A-Za-z0-9_]{1,16})\] /;

function clean(raw) {
  return String(raw).replace(ANSI, '').replace(SECTION, '').replace(/\r/g, '').replace(/^>\s?/, '');
}

/**
 * Parse one console line.
 * Returns { t, thread, lvl, msg, cont } where lvl is INFO|WARN|ERROR|CHAT|DEBUG.
 * Lines without a header (stack traces, multi-line output) are continuations of
 * the previous line and inherit its level.
 */
function parseLine(raw, prev) {
  const line = clean(raw);
  let m = VANILLA.exec(line);
  let t, thread, lvl, msg;
  if (m) {
    [, t, thread, lvl, msg] = m;
  } else if ((m = PAPER.exec(line))) {
    [, t, lvl, msg] = m;
    thread = '';
  } else {
    return {
      t: prev ? prev.t : nowTime(),
      thread: prev ? prev.thread : '',
      lvl: prev ? prev.lvl : 'INFO',
      msg: line,
      cont: true
    };
  }
  if (lvl === 'FATAL') lvl = 'ERROR';
  if (lvl === 'TRACE') lvl = 'DEBUG';
  if (lvl === 'INFO' && (CHAT.test(msg) || SAY.test(msg))) lvl = 'CHAT';
  return { t, thread, lvl, msg, cont: false };
}

function nowTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Events the panel reacts to.
const EVENTS = [
  { type: 'done', re: /^Done \([\d.,]+s\)!/ },
  { type: 'join', re: /^([A-Za-z0-9_]{1,16}) joined the game/ },
  { type: 'leave', re: /^([A-Za-z0-9_]{1,16}) left the game/ },
  { type: 'saved', re: /^Saved the game/ },
  { type: 'seed', re: /^Seed: \[(-?\d+)\]/ },
  { type: 'listPlayers', re: /^There are \d+ of a max of \d+ players online:\s*(.*)$/ },
  { type: 'portInUse', re: /FAILED TO BIND TO PORT/i },
  { type: 'eula', re: /You need to agree to the EULA/i },
  { type: 'lag', re: /^Can't keep up!/ }
];

function detectEvent(msg) {
  for (const e of EVENTS) {
    const m = e.re.exec(msg);
    if (m) return { type: e.type, value: m[1] };
  }
  return null;
}

module.exports = { parseLine, detectEvent, clean, nowTime };
