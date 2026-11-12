'use strict';
/**
 * Server List Ping: the same request the Minecraft multiplayer screen uses to
 * show "3/20 players". It works on every Java server version without any
 * setup, so the panel can count online players without relying on log lines.
 * https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping
 */
const net = require('net');

function writeVarInt(value) {
  let n = value >>> 0; // negative numbers use the 32-bit two's complement form
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n !== 0) b |= 0x80;
    out.push(b);
  } while (n !== 0);
  return Buffer.from(out);
}

// Returns { value, size } or null when the buffer doesn't hold the whole number yet.
function readVarInt(buf, offset = 0) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null;
    const b = buf[offset + i];
    value |= (b & 0x7f) << (7 * i);
    if ((b & 0x80) === 0) return { value, size: i + 1 };
  }
  throw new Error('VarInt is too long');
}

function packet(id, payload) {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

function handshake(host, port) {
  const hostBuf = Buffer.from(host, 'utf8');
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port);
  // protocol -1 = "just asking for status", next state 1 = status
  return packet(0x00, Buffer.concat([writeVarInt(-1), writeVarInt(hostBuf.length), hostBuf, portBuf, writeVarInt(1)]));
}

/**
 * Ask a server for its status.
 * Resolves { online, max, sample: [{ name, id }], version }.
 */
function ping(host, port, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (err, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Status ping timed out')), timeoutMs);

    socket.on('connect', () => {
      socket.write(handshake(host, port));
      socket.write(packet(0x00, Buffer.alloc(0)));
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 1024 * 1024) return finish(new Error('Status response too large'));
      try {
        const len = readVarInt(buf, 0);
        if (!len || buf.length < len.size + len.value) return; // wait for more data
        let off = len.size;
        const id = readVarInt(buf, off);
        off += id.size;
        if (id.value !== 0x00) return finish(new Error('Unexpected status packet'));
        const strLen = readVarInt(buf, off);
        off += strLen.size;
        const json = JSON.parse(buf.slice(off, off + strLen.value).toString('utf8'));
        const players = json.players || {};
        finish(null, {
          online: Number(players.online) || 0,
          max: Number(players.max) || 0,
          sample: Array.isArray(players.sample) ? players.sample.filter((p) => p && typeof p.name === 'string') : [],
          version: json.version && json.version.name ? String(json.version.name) : null
        });
      } catch (e) {
        finish(e);
      }
    });
    socket.on('error', (e) => finish(e));
    socket.on('close', () => finish(new Error('Connection closed before the status reply')));
  });
}

module.exports = { ping, writeVarInt, readVarInt };
