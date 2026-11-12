'use strict';
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const { ping, writeVarInt, readVarInt } = require('../src/slp');

test('varints round-trip, including negatives', () => {
  for (const n of [0, 1, 127, 128, 255, 25565, 2147483647, -1]) {
    const buf = writeVarInt(n);
    assert.strictEqual(readVarInt(buf).value, n);
  }
  assert.strictEqual(readVarInt(Buffer.from([0x80])), null, 'incomplete varint');
});

// A fake Minecraft server that answers the status request, optionally in tiny chunks.
function fakeServer(status, { chunked = false } = {}) {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      let got = Buffer.alloc(0);
      sock.on('data', (d) => {
        got = Buffer.concat([got, d]);
        // handshake + status request received: reply once
        if (got.length < 4 || sock.replied) return;
        sock.replied = true;
        const json = Buffer.from(JSON.stringify(status), 'utf8');
        const body = Buffer.concat([writeVarInt(0), writeVarInt(json.length), json]);
        const reply = Buffer.concat([writeVarInt(body.length), body]);
        if (!chunked) return sock.end(reply);
        let i = 0;
        const t = setInterval(() => {
          if (i >= reply.length) {
            clearInterval(t);
            return sock.end();
          }
          sock.write(reply.slice(i, i + 7));
          i += 7;
        }, 1);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('reads online count and player names', async () => {
  const server = await fakeServer({
    version: { name: 'Paper 26.3', protocol: 999 },
    players: { max: 20, online: 2, sample: [{ name: 'iReal_Strange', id: 'a' }, { name: 'Alex', id: 'b' }] },
    description: { text: 'hi' }
  });
  const r = await ping('127.0.0.1', server.address().port);
  server.close();
  assert.strictEqual(r.online, 2);
  assert.strictEqual(r.max, 20);
  assert.deepStrictEqual(r.sample.map((p) => p.name), ['iReal_Strange', 'Alex']);
  assert.strictEqual(r.version, 'Paper 26.3');
});

test('handles a reply split into many small chunks', async () => {
  const big = { players: { max: 100, online: 50, sample: Array.from({ length: 12 }, (_, i) => ({ name: 'Player' + i, id: String(i) })) }, description: 'x'.repeat(3000) };
  const server = await fakeServer(big, { chunked: true });
  const r = await ping('127.0.0.1', server.address().port);
  server.close();
  assert.strictEqual(r.online, 50);
  assert.strictEqual(r.sample.length, 12);
});

test('rejects when nothing is listening', async () => {
  const server = await fakeServer({});
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  await assert.rejects(ping('127.0.0.1', port, 1000));
});
