'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yazl = require('yazl');
const { parseScript, inspect, browse } = require('../src/existing');

test('reads memory, jar and flags from a Windows start.bat', () => {
  const s = parseScript('run.bat', '@echo off\r\nrem start it\r\njava -Xms2G -Xmx6G -XX:+UseG1GC -Dfile.encoding=UTF-8 -jar paper-1.21.4-120.jar nogui\r\npause\r\n');
  assert.strictEqual(s.maxMemoryMB, 6144);
  assert.strictEqual(s.minMemoryMB, 2048);
  assert.strictEqual(s.jar, 'paper-1.21.4-120.jar');
  assert.strictEqual(s.jvmArgs, '-XX:+UseG1GC -Dfile.encoding=UTF-8');
  assert.strictEqual(s.javaPath, null);
  assert.strictEqual(s.hasPause, true);
});

test('reads a quoted Java path and megabyte memory', () => {
  const s = parseScript('start.bat', '"C:\\Program Files\\Java\\jdk-21\\bin\\java.exe" -Xmx4096M -jar server.jar --nogui');
  assert.strictEqual(s.javaPath, 'C:\\Program Files\\Java\\jdk-21\\bin\\java.exe');
  assert.strictEqual(s.maxMemoryMB, 4096);
  assert.strictEqual(s.jar, 'server.jar');
});

test('spots Forge-style @args launches and ignores variables', () => {
  const s = parseScript('run.bat', 'java @user_jvm_args.txt @libraries/net/minecraftforge/forge/1.20.1-47.2.0/win_args.txt %*');
  assert.strictEqual(s.usesArgsFile, true);
  const v = parseScript('start.sh', '#!/bin/sh\njava -Xmx$MEM -jar $JAR nogui');
  assert.strictEqual(v.maxMemoryMB, null);
  assert.strictEqual(v.jar, null);
});

function makeJar(file, entries) {
  return new Promise((resolve) => {
    const z = new yazl.ZipFile();
    for (const [name, text] of Object.entries(entries)) z.addBuffer(Buffer.from(text), name);
    z.end();
    z.outputStream.pipe(fs.createWriteStream(file)).on('close', resolve);
  });
}

test('inspects a vanilla server folder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpanel-vanilla-'));
  await makeJar(path.join(dir, 'server.jar'), { 'version.json': JSON.stringify({ id: '1.21.4', name: '1.21.4' }), 'net/minecraft/bundler/Main.class': 'x' });
  fs.writeFileSync(path.join(dir, 'server.properties'), 'level-name=myworld\nserver-port=25570\n');
  fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n');
  fs.mkdirSync(path.join(dir, 'myworld'));
  fs.writeFileSync(path.join(dir, 'myworld', 'level.dat'), 'x');
  fs.writeFileSync(path.join(dir, 'start.bat'), 'java -Xmx3G -jar server.jar nogui\n');
  const r = await inspect(dir);
  assert.strictEqual(r.suggestedJar, 'server.jar');
  assert.deepStrictEqual([r.jars[0].type, r.jars[0].version], ['vanilla', '1.21.4']);
  assert.strictEqual(r.levelName, 'myworld');
  assert.strictEqual(r.port, '25570');
  assert.deepStrictEqual(r.worlds, ['myworld']);
  assert.strictEqual(r.eula, true);
  assert.strictEqual(r.script.maxMemoryMB, 3072);
  assert.deepStrictEqual(r.problems, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inspects a paper server and picks the jar from the start script', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpanel-paper-'));
  // Same layout as a real Paper 1.21.11 jar
  await makeJar(path.join(dir, 'paper-1.21.11-132.jar'), { 'META-INF/versions.list': 'abc\t1.21.11\t1.21.11/paper-1.21.11.jar', 'paperclip/libs/x': '' });
  await makeJar(path.join(dir, 'some-tool.jar'), { 'a.txt': 'x'.repeat(5000) });
  fs.writeFileSync(path.join(dir, 'run.bat'), 'java -Xmx4G -jar paper-1.21.11-132.jar --nogui\npause\n');
  const r = await inspect(dir);
  assert.strictEqual(r.suggestedJar, 'paper-1.21.11-132.jar');
  const jar = r.jars.find((j) => j.name === r.suggestedJar);
  assert.deepStrictEqual([jar.type, jar.version], ['paper', '1.21.11']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a renamed vanilla jar (1.18+ bundler layout) is still Vanilla, not Paper', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpanel-bundler-'));
  // Same layout as Mojang's real 1.21.4 server.jar
  await makeJar(path.join(dir, 'minecraft_server.1.21.4.jar'), { 'META-INF/versions.list': 'de95\t1.21.4\t1.21.4/server-1.21.4.jar', 'version.json': '{"id":"1.21.4"}', 'net/minecraft/bundler/Main.class': 'x' });
  const r = await inspect(dir);
  assert.deepStrictEqual([r.jars[0].type, r.jars[0].version], ['vanilla', '1.21.4']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('warns about Forge folders and empty folders', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpanel-forge-'));
  fs.writeFileSync(path.join(dir, 'run.bat'), 'java @user_jvm_args.txt @libraries/net/minecraftforge/forge/1.20.1/win_args.txt %*\n');
  const r = await inspect(dir);
  assert.ok(r.forgeStyle);
  assert.ok(r.problems.some((p) => /Forge/.test(p)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('browse lists folders and marks servers first', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpanel-browse-'));
  fs.mkdirSync(path.join(dir, 'aaa'));
  fs.mkdirSync(path.join(dir, 'zzz-server'));
  fs.writeFileSync(path.join(dir, 'zzz-server', 'server.properties'), '');
  fs.mkdirSync(path.join(dir, '.hidden'));
  const r = await browse(dir);
  assert.deepStrictEqual(r.dirs.map((d) => [d.name, d.server]), [['zzz-server', true], ['aaa', false]]);
  assert.ok(r.parent);
  fs.rmSync(dir, { recursive: true, force: true });
});
