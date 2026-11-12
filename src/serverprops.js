'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');
const props = require('./properties');
const { writeTextAtomic } = require('./util');

function file() {
  return path.join(config.serverDir(), 'server.properties');
}

function readText() {
  try {
    return fs.readFileSync(file(), 'utf8');
  } catch {
    return '';
  }
}

function read() {
  return props.toObject(props.parse(readText()));
}

function get(key, fallback) {
  const v = read()[key];
  return v === undefined || v === '' ? fallback : v;
}

function levelName() {
  return get('level-name', 'world');
}

function write(changes) {
  writeTextAtomic(file(), props.apply(readText(), changes));
}

module.exports = { file, readText, read, get, levelName, write };
