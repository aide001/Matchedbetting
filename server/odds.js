'use strict';
// Fetches odds from The Odds API on the server, so members never need their own key.
// Results are cached in the database to save quota across restarts.
const { makeDemoOdds } = require('../public/js/demo-odds.js');

const CACHE_KEY = 'odds-cache';

function createOddsService({ db, apiKey, sports, refreshMinutes, baseUrl, fetchImpl, now, log }) {
  const doFetch = fetchImpl || fetch;
  const clock = now || Date.now;
  const logger = log || console;
  const base = baseUrl || 'https://api.the-odds-api.com';
  let inflight = null;

  function readCache() {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(CACHE_KEY);
    try { return row ? JSON.parse(row.value) : null; } catch { return null; }
  }

  function writeCache(value) {
    db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(CACHE_KEY, JSON.stringify(value));
  }

  async function fetchAll() {
    const result = { source: 'live', fetchedAt: new Date(clock()).toISOString(), events: [], remaining: null };
    let ok = 0;
    for (const sport of sports) {
      const url = `${base}/v4/sports/${encodeURIComponent(sport)}/odds/?` + new URLSearchParams({
        apiKey, regions: 'uk', markets: 'h2h,h2h_lay', oddsFormat: 'decimal', dateFormat: 'iso',
        // Links to the event or bet slip at each bookmaker, where the feed has them.
        includeLinks: 'true'
      });
      try {
        const res = await doFetch(url);
        result.remaining = res.headers.get('x-requests-remaining') ?? result.remaining;
        if (!res.ok) {
          logger.error(`odds: ${sport} HTTP ${res.status}`);
          continue;
        }
        const events = await res.json();
        if (Array.isArray(events)) {
          result.events.push(...events.filter((ev) =>
            (ev.bookmakers || []).some((b) => (b.markets || []).some((m) => m.key === 'h2h_lay'))));
          ok++;
        }
      } catch (err) {
        logger.error(`odds: ${sport} ${err.message}`);
      }
    }
    if (!ok) throw new Error('every odds request failed');
    return result;
  }

  function sample() {
    return { source: 'sample', fetchedAt: new Date(clock()).toISOString(), events: makeDemoOdds(clock()) };
  }

  async function get() {
    if (!apiKey) return sample();
    const cached = readCache();
    const fresh = cached && clock() - Date.parse(cached.fetchedAt) < refreshMinutes * 60e3;
    if (fresh) return cached;
    if (!inflight) {
      inflight = fetchAll()
        .then((r) => { writeCache(r); return r; })
        .finally(() => { inflight = null; });
    }
    try {
      return await inflight;
    } catch (err) {
      logger.error(`odds: refresh failed (${err.message})`);
      // Serve the last good odds if we have them, flagged as stale.
      return cached ? Object.assign({}, cached, { stale: true }) : sample();
    }
  }

  return { get };
}

module.exports = { createOddsService };
