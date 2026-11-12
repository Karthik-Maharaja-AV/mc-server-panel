'use strict';
const test = require('node:test');
const assert = require('node:assert');
const props = require('../src/properties');

const SAMPLE = `#Minecraft server properties
#Tue Nov 11 14:02:11 UTC 2026
motd=A Minecraft Server \\u00A7aGreen
pvp=true
resource-pack=https\\://example.com/pack.zip
level-seed=
max-players=20
`;

test('parses keys, unicode and escaped colons', () => {
  const obj = props.toObject(props.parse(SAMPLE));
  assert.strictEqual(obj.motd, 'A Minecraft Server §aGreen');
  assert.strictEqual(obj['resource-pack'], 'https://example.com/pack.zip');
  assert.strictEqual(obj['level-seed'], '');
  assert.strictEqual(obj.pvp, 'true');
});

test('apply keeps comments and order, updates and appends', () => {
  const out = props.apply(SAMPLE, { set: { pvp: 'false', 'new-key': 'x' }, remove: ['max-players'] });
  const lines = out.trim().split('\n');
  assert.strictEqual(lines[0], '#Minecraft server properties');
  assert.ok(lines.includes('pvp=false'));
  assert.ok(!out.includes('max-players'));
  assert.strictEqual(lines[lines.length - 1], 'new-key=x');
});

test('round-trips special characters', () => {
  const tricky = 'Hi: = # ! \\ ünïcode §b';
  const out = props.apply('', { set: { motd: tricky } });
  assert.strictEqual(props.toObject(props.parse(out)).motd, tricky);
  assert.ok(/^[\x20-\x7e\n]*$/.test(out), 'output is plain ASCII');
});

test('newlines in values cannot inject extra keys', () => {
  const out = props.apply('', { set: { motd: 'a\nop-permission-level=0' } });
  const obj = props.toObject(props.parse(out));
  assert.strictEqual(Object.keys(obj).length, 1);
  assert.strictEqual(obj.motd, 'a\nop-permission-level=0');
});

test('handles CRLF and continuation lines', () => {
  const obj = props.toObject(props.parse('a=1\r\nb=two \\\r\n   parts\r\n'));
  assert.strictEqual(obj.a, '1');
  assert.strictEqual(obj.b, 'two parts');
});
