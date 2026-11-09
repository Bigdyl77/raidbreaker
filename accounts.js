// Player accounts for the Node server. Balance, gear, history and seed pairs
// are stored on disk. The active server seed is encrypted with a random key,
// and that key is wrapped by the password, so the files never hold the seed
// in the clear. Nothing in this file is logged.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createHouse, httpError } = require('./shared/house');

const SCRYPT_N = 16384;
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const COOKIE = 'rb';
const DUMMY_SALT = Buffer.from('raidbreaker-unknown!!');
const DUMMY_CHECK = crypto.createHash('sha256').update('raidbreaker-no-user').digest();

// One scrypt output splits into a stored password check and the key that
// wraps the random data key. The check does not reveal the wrapping key.
function keysFrom(password, salt, N) {
  const master = crypto.scryptSync(password, salt, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const check = crypto.createHash('sha256').update(master).digest();
  const wrapKey = crypto.createHmac('sha256', master).update('raidbreaker-dek').digest();
  return { check, wrapKey };
}

function seal(key, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('hex') };
}

function openSeal(key, box) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(box.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(box.data, 'hex')), decipher.final()]).toString('utf8');
}

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
}

function createLimiter({ max = 30, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  return function limit(key) {
    const now = Date.now();
    let row = hits.get(key);
    if (!row || now - row.start > windowMs) {
      row = { start: now, n: 0 };
      if (hits.size > 2000) hits.clear();
    }
    row.n += 1;
    hits.set(key, row);
    if (row.n > max) throw httpError(429, 'Too many attempts. Wait a few minutes.');
  };
}

function readCookie(header, name = COOKIE) {
  const raw = String(header || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function sessionCookie(token, { secure = false, maxAge = Math.floor(SESSION_MS / 1000) } = {}) {
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie({ secure = false } = {}) {
  const parts = [`${COOKIE}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function createAccounts({ dir, newSeed, dev = false, simulate = null, scryptN = SCRYPT_N }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.chmodSync(dir, 0o700);
  const indexPath = path.join(dir, 'index.json');
  const sessions = new Map();
  const lives = new Map();

  function playerPath(id) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw httpError(500, 'Could not read this account');
    return path.join(dir, `${id}.json`);
  }

  function readIndex() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return Object.create(null);
      throw httpError(500, 'Could not read accounts');
    }
    const index = Object.create(null);
    if (!raw || typeof raw !== 'object') return index;
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k === 'string' && typeof v === 'string') index[k] = v;
    }
    return index;
  }

  function readPlayer(id) {
    try {
      const record = JSON.parse(fs.readFileSync(playerPath(id), 'utf8'));
      if (!record || record.v !== 1 || !record.pass || !record.wrap || !record.game) {
        throw httpError(500, 'Could not read this account');
      }
      return record;
    } catch (err) {
      if (err.status) throw err;
      throw httpError(500, 'Could not read this account');
    }
  }

  function issue(id, username, dek, house) {
    let live = lives.get(id);
    if (!live) {
      live = { dek, house, tokens: new Set() };
      lives.set(id, live);
    }
    const token = crypto.randomBytes(32).toString('hex');
    live.tokens.add(token);
    const session = {
      token,
      id,
      username,
      house: live.house,
      dek: live.dek,
      expires: Date.now() + SESSION_MS,
    };
    sessions.set(token, session);
    return session;
  }

  function houseFrom(record, dek) {
    let serverSeed;
    try {
      serverSeed = openSeal(dek, record.game.serverSeed);
    } catch {
      throw httpError(500, 'Could not read this account');
    }
    const saved = { ...record.game, serverSeed };
    try {
      return createHouse({ newSeed, dev: !!dev, saved, simulate });
    } catch {
      throw httpError(500, 'Could not read this account');
    }
  }

  function register({ username, password } = {}) {
    const name = String(username || '').trim();
    const pass = String(password ?? '');
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) throw httpError(400, 'Name must be 3-20 letters, numbers, _ or -');
    if (pass.length < 8 || pass.length > 128) throw httpError(400, 'Password must be 8-128 characters');
    const index = readIndex();
    const key = name.toLowerCase();
    if (index[key]) throw httpError(409, 'That name is taken');

    const id = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(16);
    const { check, wrapKey } = keysFrom(pass, salt, scryptN);
    const dek = crypto.randomBytes(32);
    const house = createHouse({ newSeed, dev: !!dev, simulate });
    const snap = house.snapshot();
    const record = {
      v: 1,
      id,
      username: name,
      pass: { salt: salt.toString('hex'), hash: check.toString('hex') },
      wrap: { salt: salt.toString('hex'), ...seal(wrapKey, dek.toString('hex')) },
      game: { ...snap, serverSeed: seal(dek, snap.serverSeed) },
    };
    writeJson(playerPath(id), record);
    index[key] = id;
    writeJson(indexPath, index);
    return issue(id, name, dek, house);
  }

  function login({ username, password } = {}) {
    const name = String(username || '').trim().slice(0, 20);
    let pass = String(password ?? '');
    if (pass.length > 128) pass = pass.slice(0, 128);
    const index = readIndex();
    const id = /^[A-Za-z0-9_-]{3,20}$/.test(name) ? index[name.toLowerCase()] : '';
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      const burned = keysFrom(pass, DUMMY_SALT, scryptN).check;
      crypto.timingSafeEqual(burned, DUMMY_CHECK);
      throw httpError(401, 'Wrong name or password');
    }
    const record = readPlayer(id);
    const { check, wrapKey } = keysFrom(pass, Buffer.from(record.pass.salt, 'hex'), scryptN);
    const match = crypto.timingSafeEqual(check, Buffer.from(record.pass.hash, 'hex'));
    if (!match) throw httpError(401, 'Wrong name or password');
    const live = lives.get(id);
    if (live && live.tokens.size > 0) return issue(id, record.username);
    let dek;
    try {
      dek = Buffer.from(openSeal(wrapKey, record.wrap), 'hex');
    } catch {
      throw httpError(500, 'Could not read this account');
    }
    if (dek.length !== 32) throw httpError(500, 'Could not read this account');
    return issue(id, record.username, dek, houseFrom(record, dek));
  }

  function logout(token) {
    const session = sessions.get(token);
    if (!session) return;
    sessions.delete(token);
    const live = lives.get(session.id);
    if (!live) return;
    live.tokens.delete(token);
    if (live.tokens.size === 0) {
      live.dek.fill(0);
      lives.delete(session.id);
    }
  }

  function session(token) {
    if (!token || typeof token !== 'string' || token.length > 128) return null;
    const found = sessions.get(token);
    if (!found) return null;
    if (found.expires <= Date.now()) {
      logout(token);
      return null;
    }
    return found;
  }

  function save(session) {
    const live = lives.get(session.id);
    if (!live || !live.tokens.has(session.token)) throw httpError(401, 'Sign in required');
    const snap = live.house.snapshot();
    const record = readPlayer(session.id);
    record.username = session.username;
    record.game = { ...snap, serverSeed: seal(live.dek, snap.serverSeed) };
    writeJson(playerPath(session.id), record);
  }

  return { register, login, logout, session, save };
}

module.exports = {
  SCRYPT_N,
  createAccounts,
  createLimiter,
  readCookie,
  sessionCookie,
  clearCookie,
};
