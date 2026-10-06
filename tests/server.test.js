const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { openDb } = require('../server/db');
const { createApp } = require('../server/app');

async function startServer(overrides = {}) {
  const db = openDb(':memory:');
  const app = createApp(Object.assign({
    db, oddsApiKey: '', oddsSports: ['soccer_epl'], oddsRefreshMinutes: 60, log: { error() {} }
  }, overrides));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, base, close: () => new Promise((r) => server.close(r)) };
}

// Minimal cookie-keeping client.
function client(base) {
  let cookie = '';
  return async function call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: Object.assign(body !== undefined ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}, headers),
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* html */ }
    return { status: res.status, json, headers: res.headers, text };
  };
}

const ALICE = { name: 'Alice', email: 'Alice@Example.com', password: 'correct horse', confirmAge: true };

test('register, me, logout, login', async () => {
  const s = await startServer();
  const c = client(s.base);
  try {
    let r = await c('POST', '/api/auth/register', ALICE);
    assert.equal(r.status, 201);
    assert.equal(r.json.user.email, 'alice@example.com');
    assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);

    r = await c('GET', '/api/auth/me');
    assert.equal(r.json.user.name, 'Alice');

    r = await c('POST', '/api/auth/logout', {});
    assert.equal(r.status, 200);
    r = await c('GET', '/api/auth/me');
    assert.equal(r.json.user, null);

    r = await c('POST', '/api/auth/login', { email: 'ALICE@example.com', password: 'wrong password' });
    assert.equal(r.status, 401);
    r = await c('POST', '/api/auth/login', { email: 'ALICE@example.com', password: 'correct horse' });
    assert.equal(r.status, 200);
    r = await c('GET', '/api/auth/me');
    assert.equal(r.json.user.email, 'alice@example.com');

    // Passwords are never stored in plain text.
    const row = s.db.prepare('SELECT password_hash FROM users').get();
    assert.match(row.password_hash, /^scrypt\$/);
  } finally { await s.close(); }
});

test('registration validation', async () => {
  const s = await startServer();
  const c = client(s.base);
  try {
    assert.equal((await c('POST', '/api/auth/register', Object.assign({}, ALICE, { password: 'short' }))).status, 400);
    assert.equal((await c('POST', '/api/auth/register', Object.assign({}, ALICE, { email: 'nope' }))).status, 400);
    assert.equal((await c('POST', '/api/auth/register', Object.assign({}, ALICE, { confirmAge: false }))).status, 400);
    assert.equal((await c('POST', '/api/auth/register', ALICE)).status, 201);
    const dup = await client(s.base)('POST', '/api/auth/register', Object.assign({}, ALICE, { email: 'alice@example.COM' }));
    assert.equal(dup.status, 409);
  } finally { await s.close(); }
});

test('cross-site and non-JSON writes are rejected', async () => {
  const s = await startServer();
  const c = client(s.base);
  try {
    let r = await c('POST', '/api/auth/register', ALICE, { Origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    r = await fetch(s.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
    assert.equal(r.status, 415);
  } finally { await s.close(); }
});

test('login attempts are rate limited', async () => {
  const s = await startServer();
  const c = client(s.base);
  try {
    let last;
    for (let i = 0; i < 11; i++) last = await c('POST', '/api/auth/login', { email: 'x@example.com', password: 'wrongwrong' });
    assert.equal(last.status, 429);
  } finally { await s.close(); }
});

test('bets are private to each account', async () => {
  const s = await startServer();
  const alice = client(s.base);
  const bob = client(s.base);
  try {
    await alice('POST', '/api/auth/register', ALICE);
    await bob('POST', '/api/auth/register', { name: 'Bob', email: 'bob@example.com', password: 'another pass', confirmAge: true });

    let r = await alice('POST', '/api/bets', { bet: { date: '2026-10-01', bookmaker: 'Coral', profit: '7.93', stake: 10, type: 'free-snr' } });
    assert.equal(r.status, 201);
    const id = r.json.bets[0].id;
    assert.equal(r.json.bets[0].profit, 7.93);

    assert.equal((await alice('POST', '/api/bets', { bet: { date: 'nope', bookmaker: 'Coral', profit: 1 } })).status, 400);
    assert.equal((await alice('POST', '/api/bets', { bet: { date: '2026-10-01', bookmaker: '', profit: 1 } })).status, 400);

    r = await alice('POST', '/api/bets', { bets: [
      { date: '2026-09-01', bookmaker: 'Sky Bet', profit: -0.4, type: 'qualifying' },
      { date: '2026-09-02', bookmaker: 'Betway', profit: 5, type: 'weird' }
    ] });
    assert.equal(r.json.bets.length, 2);
    assert.equal(r.json.bets[1].type, 'other');

    assert.equal((await bob('GET', '/api/bets')).json.bets.length, 0);
    assert.equal((await bob('DELETE', `/api/bets/${id}`)).status, 404);
    assert.equal((await alice('GET', '/api/bets')).json.bets.length, 3);
    assert.equal((await alice('DELETE', `/api/bets/${id}`)).status, 200);
    assert.equal((await alice('DELETE', '/api/bets')).json.deleted, 2);
    assert.equal((await client(s.base)('GET', '/api/bets')).status, 401);
  } finally { await s.close(); }
});

test('offer progress is saved per account', async () => {
  const s = await startServer();
  const c = client(s.base);
  try {
    await c('POST', '/api/auth/register', ALICE);
    let r = await c('GET', '/api/offers');
    assert.ok(r.json.offers.length > 5);
    assert.ok(r.json.offers.every((o) => o.status === 'not-started'));
    r = await c('PUT', '/api/offers/coral', { status: 'done', profit: '24.5' });
    assert.equal(r.status, 200);
    assert.equal((await c('PUT', '/api/offers/coral', { status: 'bogus' })).status, 400);
    assert.equal((await c('PUT', '/api/offers/nope', { status: 'done' })).status, 404);
    r = await c('GET', '/api/offers');
    const coral = r.json.offers.find((o) => o.id === 'coral');
    assert.equal(coral.status, 'done');
    assert.equal(coral.profit, 24.5);
  } finally { await s.close(); }
});

test('password change signs out other sessions; account deletion removes data', async () => {
  const s = await startServer();
  const a1 = client(s.base);
  const a2 = client(s.base);
  try {
    await a1('POST', '/api/auth/register', ALICE);
    await a2('POST', '/api/auth/login', { email: ALICE.email, password: ALICE.password });
    assert.equal((await a1('POST', '/api/account/password', { currentPassword: 'wrong', newPassword: 'new password 1' })).status, 400);
    assert.equal((await a1('POST', '/api/account/password', { currentPassword: ALICE.password, newPassword: 'new password 1' })).status, 200);
    assert.equal((await a2('GET', '/api/auth/me')).json.user, null);
    assert.equal((await a1('GET', '/api/auth/me')).json.user.name, 'Alice');

    assert.equal((await a1('PATCH', '/api/account', { name: 'Alice B' })).json.user.name, 'Alice B');
    await a1('POST', '/api/bets', { bet: { date: '2026-10-01', bookmaker: 'Coral', profit: 1 } });
    assert.equal((await a1('DELETE', '/api/account', { password: 'nope' })).status, 400);
    assert.equal((await a1('DELETE', '/api/account', { password: 'new password 1' })).status, 200);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM bets').get().n, 0);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  } finally { await s.close(); }
});

test('member pages redirect to login; static files are served safely', async () => {
  const s = await startServer();
  const c = client(s.base);
  try {
    let r = await c('GET', '/tracker.html');
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/login.html?next=%2Ftracker.html');
    r = await c('GET', '/calculator.html');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal((await c('GET', '/../server/app.js')).status, 404);
    assert.equal((await c('GET', '/%2e%2e/server/app.js')).status, 404);
    await c('POST', '/api/auth/register', ALICE);
    assert.equal((await c('GET', '/tracker.html')).status, 200);
    assert.equal((await c('GET', '/login.html')).status, 302);
  } finally { await s.close(); }
});

test('odds: sample without a key, live and cached with one', async () => {
  let calls = 0;
  const events = [{ id: 'e', sport_key: 'soccer_epl', commence_time: '2030-01-01T00:00:00Z', home_team: 'A', away_team: 'B',
    bookmakers: [{ key: 'smarkets', markets: [{ key: 'h2h_lay', outcomes: [{ name: 'A', price: 2 }] }] }] }];
  const fetchImpl = async (url) => {
    calls++;
    assert.match(url, /apiKey=k&regions=uk&markets=h2h%2Ch2h_lay/);
    return new Response(JSON.stringify(events), { headers: { 'x-requests-remaining': '400' } });
  };
  const sample = await startServer();
  const live = await startServer({ oddsApiKey: 'k', fetchImpl });
  try {
    const c1 = client(sample.base);
    assert.equal((await c1('GET', '/api/odds')).status, 401);
    await c1('POST', '/api/auth/register', ALICE);
    const r1 = await c1('GET', '/api/odds');
    assert.equal(r1.json.source, 'sample');
    assert.ok(r1.json.events.length > 0);

    const c2 = client(live.base);
    await c2('POST', '/api/auth/register', ALICE);
    const r2 = await c2('GET', '/api/odds');
    assert.equal(r2.json.source, 'live');
    assert.equal(r2.json.events.length, 1);
    await c2('GET', '/api/odds');
    assert.equal(calls, 1, 'second request is served from the cache');
  } finally { await sample.close(); await live.close(); }
});

function fakeMailer() {
  const sent = [];
  return { sent, send: async (m) => { sent.push(m); return {}; } };
}

test('forgot password: same reply for unknown emails; reset link works once', async () => {
  const mailer = fakeMailer();
  const s = await startServer({ mailer, appUrl: 'https://matchedbet.example/' });
  const a1 = client(s.base);
  const a2 = client(s.base);
  try {
    await a1('POST', '/api/auth/register', ALICE);
    await a2('POST', '/api/auth/login', { email: ALICE.email, password: ALICE.password });

    const anon = client(s.base);
    let r = await anon('POST', '/api/auth/forgot', { email: 'nobody@example.com' });
    assert.equal(r.status, 200);
    assert.equal(mailer.sent.length, 0);
    assert.equal((await anon('POST', '/api/auth/forgot', { email: 'not-an-email' })).status, 400);

    r = await anon('POST', '/api/auth/forgot', { email: 'ALICE@example.com' });
    assert.equal(r.status, 200);
    assert.equal(mailer.sent.length, 1);
    const mail = mailer.sent[0];
    assert.equal(mail.to, 'alice@example.com');
    const link = mail.text.match(/https:\/\/matchedbet\.example\/reset-password\.html\?token=([\w-]+)/);
    assert.ok(link, 'link uses APP_URL');
    assert.ok(mail.html.includes(link[0]));
    const token = link[1];

    assert.equal((await anon('POST', '/api/auth/reset/check', { token })).json.valid, true);
    assert.equal((await anon('POST', '/api/auth/reset/check', { token: 'nope' })).json.valid, false);

    // A too-short password doesn't use up the token.
    assert.equal((await anon('POST', '/api/auth/reset', { token, password: 'short' })).status, 400);
    r = await anon('POST', '/api/auth/reset', { token, password: 'brand new pass' });
    assert.equal(r.status, 200);
    assert.equal((await anon('GET', '/api/auth/me')).json.user.email, 'alice@example.com');

    // Existing sessions are signed out, the token can't be reused, and only the new password works.
    assert.equal((await a1('GET', '/api/auth/me')).json.user, null);
    assert.equal((await a2('GET', '/api/auth/me')).json.user, null);
    assert.equal((await anon('POST', '/api/auth/reset', { token, password: 'another pass 2' })).status, 400);
    assert.equal((await client(s.base)('POST', '/api/auth/login', { email: ALICE.email, password: ALICE.password })).status, 401);
    assert.equal((await client(s.base)('POST', '/api/auth/login', { email: ALICE.email, password: 'brand new pass' })).status, 200);
  } finally { await s.close(); }
});

test('reset links expire, and a newer request replaces an older link', async () => {
  const mailer = fakeMailer();
  const s = await startServer({ mailer, appUrl: 'https://matchedbet.example' });
  const c = client(s.base);
  const tokenOf = (m) => m.text.match(/token=([\w-]+)/)[1];
  try {
    await c('POST', '/api/auth/register', ALICE);
    await c('POST', '/api/auth/forgot', { email: ALICE.email });
    await c('POST', '/api/auth/forgot', { email: ALICE.email });
    const [first, second] = mailer.sent.map(tokenOf);
    assert.equal((await c('POST', '/api/auth/reset', { token: first, password: 'brand new pass' })).status, 400);

    s.db.prepare('UPDATE password_resets SET expires_at = ?').run(Date.now() - 1);
    assert.equal((await c('POST', '/api/auth/reset/check', { token: second })).json.valid, false);
    assert.equal((await c('POST', '/api/auth/reset', { token: second, password: 'brand new pass' })).status, 400);

    // Third request in an hour for the same email is still allowed; the fourth is rate limited.
    assert.equal((await c('POST', '/api/auth/forgot', { email: ALICE.email })).status, 200);
    assert.equal((await c('POST', '/api/auth/forgot', { email: ALICE.email })).status, 429);
  } finally { await s.close(); }
});

test('in production, reset emails are only sent when APP_URL is set', async () => {
  const mailer = fakeMailer();
  const s = await startServer({ mailer, secureCookies: true });
  const c = client(s.base);
  try {
    await c('POST', '/api/auth/register', ALICE);
    // Without APP_URL the server would have to trust the Host header, which an attacker controls.
    const r = await c('POST', '/api/auth/forgot', { email: ALICE.email }, { Host: 'evil.example' });
    assert.equal(r.status, 200);
    assert.equal(mailer.sent.length, 0);
  } finally { await s.close(); }
});

test('Brevo mailer sends the expected request', async () => {
  const { createMailer } = require('../server/mailer');
  let req;
  const mailer = createMailer({
    apiKey: 'xkeysib-test', fromEmail: 'no-reply@matchedbet.example', fromName: 'MatchedBet',
    fetchImpl: async (url, opts) => { req = { url, opts }; return new Response('{"messageId":"m1"}', { status: 201 }); }
  });
  const r = await mailer.send({ to: 'a@example.com', toName: 'A', subject: 'Hi', text: 'text', html: '<p>html</p>' });
  assert.equal(r.messageId, 'm1');
  assert.equal(req.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(req.opts.headers['api-key'], 'xkeysib-test');
  assert.deepEqual(JSON.parse(req.opts.body), {
    sender: { name: 'MatchedBet', email: 'no-reply@matchedbet.example' },
    to: [{ email: 'a@example.com', name: 'A' }],
    subject: 'Hi', textContent: 'text', htmlContent: '<p>html</p>'
  });

  const failing = createMailer({ apiKey: 'k', fromEmail: 'x@y.z', fetchImpl: async () => new Response('{"message":"bad key"}', { status: 401 }) });
  await assert.rejects(failing.send({ to: 'a@example.com', subject: 's', text: 't', html: 'h' }), /Brevo returned 401/);

  const logged = [];
  const noKey = createMailer({ log: { log: (m) => logged.push(m) } });
  assert.deepEqual(await noKey.send({ to: 'a@example.com', subject: 's', text: 'the body', html: 'h' }), { logged: true });
  assert.match(logged[0], /the body/);
});

test('bet plans: on the page and by email, built from live odds with links', async () => {
  const start = new Date(Date.now() + 5 * 3600e3).toISOString();
  const events = [{ id: 'e1', sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: start, home_team: 'Arsenal', away_team: '<b>Chelsea</b>',
    bookmakers: [
      { key: 'williamhill', title: 'William Hill', link: 'https://wh.example/event', markets: [{ key: 'h2h', outcomes: [
        { name: 'Arsenal', price: 2.1 }, { name: 'Draw', price: 3.4 }, { name: '<b>Chelsea</b>', price: 4.0 }] }] },
      { key: 'betfair_ex_uk', title: 'Betfair', markets: [{ key: 'h2h_lay', outcomes: [
        { name: 'Arsenal', price: 2.12, link: 'https://bf.example/market' }, { name: 'Draw', price: 3.6 }, { name: '<b>Chelsea</b>', price: 4.2 }] }] }
    ] }];
  let oddsUrl;
  const fetchImpl = async (url) => { oddsUrl = url; return new Response(JSON.stringify(events)); };
  const mailer = fakeMailer();
  const s = await startServer({ oddsApiKey: 'k', fetchImpl, mailer, appUrl: 'https://matchedbet.example' });
  const c = client(s.base);
  try {
    assert.equal((await c('GET', '/api/offers/williamhill/plan?step=qualifying')).status, 401);
    await c('POST', '/api/auth/register', ALICE);

    let r = await c('GET', '/api/offers/williamhill/plan?step=qualifying');
    assert.equal(r.status, 200);
    assert.match(oddsUrl, /includeLinks=true/);
    assert.equal(r.json.sample, false);
    const p = r.json.plan;
    assert.equal(p.ok, true);
    assert.equal(p.selection, 'Arsenal');
    assert.equal(p.back.odds, 2.1);
    assert.equal(p.back.stake, 10);
    assert.equal(p.back.link, 'https://wh.example/event');
    assert.equal(p.lay.exchange, 'Betfair');
    assert.equal(p.lay.link, 'https://bf.example/market');
    assert.equal(p.lay.odds, 2.12);
    assert.ok(p.lay.stake > 9 && p.lay.stake < 11);

    r = await c('GET', '/api/offers/williamhill/plan?step=free');
    assert.equal(r.json.plan.selection, '<b>Chelsea</b>');

    r = await c('GET', '/api/offers/bet365/plan?step=qualifying');
    assert.equal(r.json.plan.ok, false);
    assert.equal(r.json.plan.reason, 'not-in-feed');
    assert.equal((await c('GET', '/api/offers/williamhill/plan?step=bogus')).status, 400);
    assert.equal((await c('GET', '/api/offers/nope/plan?step=free')).status, 404);

    r = await c('POST', '/api/offers/williamhill/plan/email', { step: 'free' });
    assert.equal(r.status, 200);
    assert.equal(mailer.sent.length, 1);
    const mail = mailer.sent[0];
    assert.equal(mail.to, 'alice@example.com');
    assert.equal(mail.subject, 'William Hill: your £10 free bet, step by step');
    assert.match(mail.text, /BACK at William Hill/);
    assert.match(mail.text, /Odds: 4\.00/);
    assert.match(mail.text, /LAY at Betfair/);
    assert.match(mail.text, /https:\/\/matchedbet\.example\/calculator\.html\?type=free-snr&stake=10&backOdds=4&layOdds=4\.2&commission=5/);
    assert.ok(mail.html.includes('&lt;b&gt;Chelsea&lt;/b&gt;'), 'names from the feed are escaped');
    assert.ok(!mail.html.includes('<b>Chelsea</b>'));
    assert.ok(mail.html.includes('href="https://wh.example/event"'));

    assert.equal((await c('POST', '/api/offers/bet365/plan/email', { step: 'qualifying' })).status, 409);
  } finally { await s.close(); }
});

test('bet plan emails say clearly when odds are samples', async () => {
  const mailer = fakeMailer();
  const s = await startServer({ mailer, appUrl: 'https://matchedbet.example' });
  const c = client(s.base);
  try {
    await c('POST', '/api/auth/register', ALICE);
    const r = await c('POST', '/api/offers/coral/plan/email', { step: 'qualifying' });
    assert.equal(r.status, 200);
    assert.match(mailer.sent[0].subject, /^\[SAMPLE ODDS\] Coral/);
    assert.match(mailer.sent[0].text, /SAMPLE ODDS FOR TESTING/);
  } finally { await s.close(); }
});
