'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine, detectEvent } = require('../src/logparse');

test('vanilla format', () => {
  const p = parseLine('[15:42:01] [Server thread/INFO]: Steve joined the game');
  assert.deepStrictEqual([p.t, p.thread, p.lvl, p.msg, p.cont], ['15:42:01', 'Server thread', 'INFO', 'Steve joined the game', false]);
});

test('paper format with ANSI colours', () => {
  const p = parseLine('\x1b[33m[15:42:01 WARN]: Can\'t keep up! Is the server overloaded?\x1b[0m');
  assert.strictEqual(p.lvl, 'WARN');
  assert.strictEqual(p.msg, "Can't keep up! Is the server overloaded?");
});

test('chat and /say become CHAT', () => {
  assert.strictEqual(parseLine('[10:00:00 INFO]: <Alex> hello').lvl, 'CHAT');
  assert.strictEqual(parseLine('[10:00:00] [Server thread/INFO]: [Not Secure] <Alex> hi').lvl, 'CHAT');
  assert.strictEqual(parseLine('[10:00:00 INFO]: [Server] restarting soon').lvl, 'CHAT');
});

test('stack trace lines continue the previous entry', () => {
  const first = parseLine('[10:00:00 ERROR]: Could not pass event');
  const next = parseLine('\tat org.bukkit.Something(Something.java:12)', first);
  assert.strictEqual(next.cont, true);
  assert.strictEqual(next.lvl, 'ERROR');
});

test('section-sign colour codes are stripped', () => {
  assert.strictEqual(parseLine('[10:00:00 INFO]: §aGreen text').msg, 'Green text');
});

test('events', () => {
  assert.deepStrictEqual(detectEvent('Done (4.812s)! For help, type "help"'), { type: 'done', value: undefined });
  assert.deepStrictEqual(detectEvent('Steve_1 joined the game'), { type: 'join', value: 'Steve_1' });
  assert.deepStrictEqual(detectEvent('Steve_1 left the game'), { type: 'leave', value: 'Steve_1' });
  assert.deepStrictEqual(detectEvent('Seed: [-123]'), { type: 'seed', value: '-123' });
  assert.strictEqual(detectEvent('There are 2 of a max of 20 players online: A, B').value, 'A, B');
  assert.strictEqual(detectEvent('<Steve> Steve_1 joined the game'), null);
});
