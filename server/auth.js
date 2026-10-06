'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_TTL_MS = 30 * 24 * 3600e3;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem
  });
  return crypto.timingSafeEqual(actual, expected);
}

// A hash to compare against when the email doesn't exist, so login timing doesn't reveal accounts.
let dummyHash = null;
async function dummyVerify(password) {
  if (!dummyHash) dummyHash = await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
  return false;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(db, userId, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, now, now + SESSION_TTL_MS);
  return { token, expiresAt: now + SESSION_TTL_MS };
}

function userForToken(db, token, now = Date.now()) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.created_at, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).get(hashToken(token));
  if (!row) return null;
  if (row.expires_at <= now) {
    deleteSession(db, token);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

function deleteOtherSessions(db, userId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, hashToken(keepToken || ''));
}

function purgeExpiredSessions(db, now = Date.now()) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}

// Fixed-window attempt counter, kept in memory.
function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    hit(key, now = Date.now()) {
      let h = hits.get(key);
      if (!h || h.resetAt <= now) {
        h = { count: 0, resetAt: now + windowMs };
        hits.set(key, h);
      }
      h.count++;
      if (hits.size > 10000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      return { allowed: h.count <= max, retryAfter: Math.ceil((h.resetAt - now) / 1000) };
    },
    reset(key) { hits.delete(key); }
  };
}

module.exports = {
  SESSION_TTL_MS,
  hashPassword,
  verifyPassword,
  dummyVerify,
  createSession,
  userForToken,
  deleteSession,
  deleteOtherSessions,
  purgeExpiredSessions,
  createRateLimiter
};
