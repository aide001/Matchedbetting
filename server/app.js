'use strict';
const path = require('node:path');
const auth = require('./auth');
const { createOddsService } = require('./odds');
const { HttpError, sendJson, readJson, parseCookies, cookie, serveStatic, SECURITY_HEADERS } = require('./http');
const OFFERS = require('./offers.json');

const SESSION_COOKIE = 'mb_session';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// Pages that need an account; visitors are sent to the login page first.
const MEMBER_PAGES = new Set(['/dashboard.html', '/tracker.html', '/oddsmatcher.html', '/offers.html', '/account.html']);
const BET_TYPES = new Set(['qualifying', 'free-snr', 'free-sr', 'casino', 'other']);
const OFFER_STATUSES = new Set(['not-started', 'in-progress', 'done']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createApp(config) {
  const { db } = config;
  const secureCookies = !!config.secureCookies;
  const odds = createOddsService({
    db,
    apiKey: config.oddsApiKey,
    sports: config.oddsSports,
    refreshMinutes: config.oddsRefreshMinutes,
    baseUrl: config.oddsApiBase,
    fetchImpl: config.fetchImpl,
    log: config.log
  });
  const loginLimiter = auth.createRateLimiter({ max: 10, windowMs: 15 * 60e3 });
  const registerLimiter = auth.createRateLimiter({ max: 5, windowMs: 60 * 60e3 });

  function clientIp(req) {
    if (config.trustProxy) {
      const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function sessionCookie(token, maxAgeMs) {
    return cookie(SESSION_COOKIE, token, { maxAge: maxAgeMs / 1000, secure: secureCookies });
  }

  function publicUser(u) {
    return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt || u.created_at };
  }

  function requireUser(req) {
    if (!req.user) throw new HttpError(401, 'Log in to continue.');
    return req.user;
  }

  // State-changing requests must come from this site. Browsers always send Origin on these.
  function checkOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return;
    let host;
    try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Request blocked.'); }
    const expected = config.trustProxy && req.headers['x-forwarded-host'] ? req.headers['x-forwarded-host'] : req.headers.host;
    if (host !== expected) throw new HttpError(403, 'Request blocked.');
  }

  function text(v, max, field, { required = false } = {}) {
    const s = v == null ? '' : String(v).trim();
    if (required && !s) throw new HttpError(400, `Enter ${field}.`);
    if (s.length > max) throw new HttpError(400, `${field[0].toUpperCase() + field.slice(1)} must be ${max} characters or fewer.`);
    return s;
  }

  function validPassword(pw) {
    if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Use a password of at least 8 characters.');
    if (pw.length > 200) throw new HttpError(400, 'Use a password of 200 characters or fewer.');
    return pw;
  }

  function normaliseBet(raw) {
    if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Each bet must be an object.');
    const date = String(raw.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw new HttpError(400, 'Enter a valid date.');
    const profit = Number(raw.profit);
    if (raw.profit === '' || raw.profit == null || !isFinite(profit) || Math.abs(profit) > 1e7) {
      throw new HttpError(400, 'Enter the profit or loss as a number.');
    }
    let stake = raw.stake === '' || raw.stake == null ? null : Number(raw.stake);
    if (stake != null && (!isFinite(stake) || stake < 0 || stake > 1e7)) throw new HttpError(400, 'Enter the stake as a positive number.');
    return {
      date,
      bookmaker: text(raw.bookmaker, 80, 'the bookmaker', { required: true }),
      exchange: text(raw.exchange, 80, 'the exchange'),
      event: text(raw.event, 200, 'the event'),
      type: BET_TYPES.has(raw.type) ? raw.type : 'other',
      stake: stake == null ? null : Math.round(stake * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      notes: text(raw.notes, 500, 'the notes')
    };
  }

  const insertBet = db.prepare(`INSERT INTO bets (user_id, date, bookmaker, exchange, event, type, stake, profit, notes, created_at)
    VALUES (:user_id, :date, :bookmaker, :exchange, :event, :type, :stake, :profit, :notes, :created_at)`);

  function betRow(r) {
    return { id: r.id, date: r.date, bookmaker: r.bookmaker, exchange: r.exchange, event: r.event,
      type: r.type, stake: r.stake, profit: r.profit, notes: r.notes };
  }

  // ---------- Routes ----------
  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

  route('POST', '/api/auth/register', async (req, res) => {
    const limit = registerLimiter.hit(clientIp(req));
    if (!limit.allowed) throw new HttpError(429, 'Too many sign-ups from this network. Try again later.');
    const body = await readJson(req);
    const name = text(body.name, 60, 'your name', { required: true });
    const email = text(body.email, 254, 'your email', { required: true }).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = validPassword(body.password);
    if (body.confirmAge !== true) throw new HttpError(400, 'You must be 18 or over to create an account.');
    const hash = await auth.hashPassword(password);
    let id;
    try {
      id = db.prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(email, name, hash, new Date().toISOString()).lastInsertRowid;
    } catch (err) {
      if (/UNIQUE/.test(err.message)) throw new HttpError(409, 'An account with that email already exists. Log in instead.');
      throw err;
    }
    const s = auth.createSession(db, Number(id));
    const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
    sendJson(res, 201, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(s.token, auth.SESSION_TTL_MS) });
  });

  route('POST', '/api/auth/login', async (req, res) => {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const ipLimit = loginLimiter.hit('ip:' + clientIp(req));
    const emailLimit = loginLimiter.hit('email:' + email);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      throw new HttpError(429, 'Too many login attempts. Wait 15 minutes and try again.');
    }
    const row = email ? db.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;
    const ok = row ? await auth.verifyPassword(password, row.password_hash) : await auth.dummyVerify(password);
    if (!ok) throw new HttpError(401, 'That email and password don\'t match an account.');
    loginLimiter.reset('email:' + email);
    const s = auth.createSession(db, row.id);
    sendJson(res, 200, { user: publicUser(row) }, { 'Set-Cookie': sessionCookie(s.token, auth.SESSION_TTL_MS) });
  });

  route('POST', '/api/auth/logout', async (req, res) => {
    auth.deleteSession(db, req.token);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  });

  route('GET', '/api/auth/me', async (req, res) => {
    sendJson(res, 200, { user: req.user ? publicUser(req.user) : null });
  });

  route('PATCH', '/api/account', async (req, res) => {
    const user = requireUser(req);
    const body = await readJson(req);
    const name = text(body.name, 60, 'your name', { required: true });
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
    sendJson(res, 200, { user: Object.assign(publicUser(user), { name }) });
  });

  route('POST', '/api/account/password', async (req, res) => {
    const user = requireUser(req);
    const body = await readJson(req);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!(await auth.verifyPassword(String(body.currentPassword || ''), row.password_hash))) {
      throw new HttpError(400, 'Your current password is wrong.');
    }
    const next = validPassword(body.newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await auth.hashPassword(next), user.id);
    auth.deleteOtherSessions(db, user.id, req.token);
    sendJson(res, 200, { ok: true });
  });

  route('DELETE', '/api/account', async (req, res) => {
    const user = requireUser(req);
    const body = await readJson(req);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!(await auth.verifyPassword(String(body.password || ''), row.password_hash))) {
      throw new HttpError(400, 'That password is wrong, so your account wasn\'t deleted.');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  });

  route('GET', '/api/bets', async (req, res) => {
    const user = requireUser(req);
    const rows = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY date DESC, id DESC').all(user.id);
    sendJson(res, 200, { bets: rows.map(betRow) });
  });

  route('POST', '/api/bets', async (req, res) => {
    const user = requireUser(req);
    const body = await readJson(req, 5 * 1024 * 1024);
    const list = Array.isArray(body.bets) ? body.bets : [body.bet];
    if (list.length > 5000) throw new HttpError(400, 'Import up to 5,000 bets at a time.');
    const bets = list.map(normaliseBet);
    const created = new Date().toISOString();
    const ids = [];
    db.exec('BEGIN');
    try {
      for (const b of bets) ids.push(Number(insertBet.run(Object.assign({ user_id: user.id, created_at: created }, b)).lastInsertRowid));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    sendJson(res, 201, { bets: bets.map((b, i) => Object.assign({ id: ids[i] }, b)) });
  });

  route('DELETE', /^\/api\/bets\/(\d+)$/, async (req, res, m) => {
    const user = requireUser(req);
    const r = db.prepare('DELETE FROM bets WHERE id = ? AND user_id = ?').run(Number(m[1]), user.id);
    if (!r.changes) throw new HttpError(404, 'That bet doesn\'t exist.');
    sendJson(res, 200, { ok: true });
  });

  route('DELETE', '/api/bets', async (req, res) => {
    const user = requireUser(req);
    const r = db.prepare('DELETE FROM bets WHERE user_id = ?').run(user.id);
    sendJson(res, 200, { deleted: Number(r.changes) });
  });

  route('GET', '/api/offers', async (req, res) => {
    const user = requireUser(req);
    const progress = {};
    db.prepare('SELECT offer_id, status, profit, updated_at FROM offer_progress WHERE user_id = ?').all(user.id)
      .forEach((p) => { progress[p.offer_id] = p; });
    sendJson(res, 200, {
      offers: OFFERS.map((o) => {
        const p = progress[o.id];
        return Object.assign({}, o, {
          status: p ? p.status : 'not-started',
          profit: p ? p.profit : null,
          updatedAt: p ? p.updated_at : null
        });
      })
    });
  });

  route('PUT', /^\/api\/offers\/([a-z0-9-]+)$/, async (req, res, m) => {
    const user = requireUser(req);
    if (!OFFERS.some((o) => o.id === m[1])) throw new HttpError(404, 'That offer doesn\'t exist.');
    const body = await readJson(req);
    if (!OFFER_STATUSES.has(body.status)) throw new HttpError(400, 'Choose a valid status.');
    let profit = body.profit === '' || body.profit == null ? null : Number(body.profit);
    if (profit != null && (!isFinite(profit) || Math.abs(profit) > 1e7)) throw new HttpError(400, 'Enter the profit as a number.');
    if (profit != null) profit = Math.round(profit * 100) / 100;
    const updatedAt = new Date().toISOString();
    db.prepare(`INSERT INTO offer_progress (user_id, offer_id, status, profit, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, offer_id) DO UPDATE SET status = excluded.status, profit = excluded.profit, updated_at = excluded.updated_at`)
      .run(user.id, m[1], body.status, profit, updatedAt);
    sendJson(res, 200, { offer: { id: m[1], status: body.status, profit, updatedAt } });
  });

  route('GET', '/api/odds', async (req, res) => {
    requireUser(req);
    const data = await odds.get();
    sendJson(res, 200, {
      source: data.source,
      fetchedAt: data.fetchedAt,
      stale: !!data.stale,
      events: data.events
    });
  });

  // ---------- Request handler ----------
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    try {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      req.token = token;
      req.user = auth.userForToken(db, token);

      if (pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') checkOrigin(req);
        let matchedPath = false;
        for (const r of routes) {
          const m = typeof r.pattern === 'string' ? (r.pattern === pathname ? [pathname] : null) : pathname.match(r.pattern);
          if (!m) continue;
          matchedPath = true;
          if (r.method !== req.method) continue;
          await r.handler(req, res, m);
          return;
        }
        throw new HttpError(matchedPath ? 405 : 404, matchedPath ? 'Method not allowed.' : 'Not found.');
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      if (pathname === '/healthz') return sendJson(res, 200, { ok: true });

      if (MEMBER_PAGES.has(pathname) && !req.user) {
        res.writeHead(302, Object.assign({ Location: '/login.html?next=' + encodeURIComponent(pathname) }, SECURITY_HEADERS));
        return res.end();
      }
      if ((pathname === '/login.html' || pathname === '/register.html') && req.user) {
        res.writeHead(302, Object.assign({ Location: '/dashboard.html' }, SECURITY_HEADERS));
        return res.end();
      }
      if (serveStatic(PUBLIC_DIR, pathname, res)) return;
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, SECURITY_HEADERS));
      res.end('<!doctype html><title>Not found</title><p>Page not found. <a href="/">Go to the home page</a>.</p>');
    } catch (err) {
      if (err instanceof HttpError) {
        const headers = err.status === 429 ? { 'Retry-After': '900' } : undefined;
        if (!res.headersSent) sendJson(res, err.status, { error: err.message }, headers);
        return;
      }
      (config.log || console).error(err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong on our side. Try again.' });
    }
  };
}

module.exports = { createApp };
