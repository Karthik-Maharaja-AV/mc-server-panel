'use strict';
/**
 * Reads and writes server.properties (Java .properties format) while keeping
 * comments, blank lines and key order intact.
 */

function unescapeValue(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\' || i === s.length - 1) {
      out += c;
      continue;
    }
    const n = s[++i];
    if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(s.substr(i + 1, 4))) {
      out += String.fromCharCode(parseInt(s.substr(i + 1, 4), 16));
      i += 4;
    } else if (n === 'n') out += '\n';
    else if (n === 't') out += '\t';
    else if (n === 'r') out += '\r';
    else if (n === 'f') out += '\f';
    else out += n;
  }
  return out;
}

function escapeText(s, isKey) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = c.charCodeAt(0);
    if (c === '\\') out += '\\\\';
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (c === '\f') out += '\\f';
    else if (c === '=' || c === ':' || c === '#' || c === '!') out += '\\' + c;
    else if (c === ' ' && (isKey || i === 0)) out += '\\ ';
    else if (code < 0x20 || code > 0x7e) out += '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
    else out += c;
  }
  return out;
}

// Split one logical line into key and raw value (first unescaped =, : or whitespace).
function splitKeyValue(line) {
  let i = 0;
  let key = '';
  while (i < line.length) {
    const c = line[i];
    if (c === '\\' && i + 1 < line.length) {
      key += c + line[i + 1];
      i += 2;
      continue;
    }
    if (c === '=' || c === ':' || c === ' ' || c === '\t') break;
    key += c;
    i++;
  }
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  if (line[i] === '=' || line[i] === ':') i++;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return { key: unescapeValue(key), value: unescapeValue(line.slice(i)) };
}

function parse(text) {
  const physical = String(text).replace(/\r\n?/g, '\n').split('\n');
  if (physical.length && physical[physical.length - 1] === '') physical.pop();
  const lines = [];
  for (let i = 0; i < physical.length; i++) {
    const raw = physical[i];
    const trimmed = raw.replace(/^\s+/, '');
    if (trimmed === '' || trimmed[0] === '#' || trimmed[0] === '!') {
      lines.push({ type: trimmed === '' ? 'blank' : 'comment', raw });
      continue;
    }
    // Join continuation lines (odd number of trailing backslashes).
    let logical = trimmed;
    while (/(^|[^\\])(\\\\)*\\$/.test(logical) && i + 1 < physical.length) {
      logical = logical.slice(0, -1) + physical[++i].replace(/^\s+/, '');
    }
    const { key, value } = splitKeyValue(logical);
    lines.push({ type: 'prop', key, value });
  }
  return lines;
}

function toObject(lines) {
  const obj = {};
  for (const l of lines) if (l.type === 'prop') obj[l.key] = l.value;
  return obj;
}

/**
 * Apply changes: `set` updates or appends keys, `remove` drops keys.
 * Returns new file text.
 */
function apply(text, { set = {}, remove = [] } = {}) {
  const lines = parse(text);
  const removeSet = new Set(remove);
  const seen = new Set();
  const out = [];
  for (const l of lines) {
    if (l.type !== 'prop') {
      out.push(l.raw);
      continue;
    }
    if (removeSet.has(l.key)) continue;
    seen.add(l.key);
    const value = Object.prototype.hasOwnProperty.call(set, l.key) ? set[l.key] : l.value;
    out.push(escapeText(l.key, true) + '=' + escapeText(String(value), false));
  }
  for (const [k, v] of Object.entries(set)) {
    if (!seen.has(k) && !removeSet.has(k)) out.push(escapeText(k, true) + '=' + escapeText(String(v), false));
  }
  return out.join('\n') + '\n';
}

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

module.exports = { parse, toObject, apply, escapeText, unescapeValue, KEY_RE };
