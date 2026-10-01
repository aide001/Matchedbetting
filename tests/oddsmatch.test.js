const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatches, filterAndSort } = require('../js/oddsmatch.js');

const NOW = Date.parse('2026-10-01T12:00:00Z');

function event(id, hoursFromNow, books) {
  return {
    id, sport_key: 'soccer_epl', sport_title: 'EPL',
    commence_time: new Date(NOW + hoursFromNow * 3600e3).toISOString(),
    home_team: 'Arsenal', away_team: 'Chelsea', bookmakers: books
  };
}
const book = (key, prices) => ({ key, title: key, markets: [{ key: 'h2h', outcomes: Object.entries(prices).map(([name, price]) => ({ name, price })) }] });
const exch = (key, prices) => ({ key, title: key, markets: [
  { key: 'h2h', outcomes: [] },
  { key: 'h2h_lay', outcomes: Object.entries(prices).map(([name, price]) => ({ name, price })) }
] });

test('pairs each bookmaker price with the best exchange after commission', () => {
  const rows = buildMatches([event('e1', 5, [
    book('williamhill', { Arsenal: 2.0, Draw: 3.4, Chelsea: 4.0 }),
    // Betfair has the lower lay price but 5% commission; Smarkets at 2% wins on Arsenal.
    exch('betfair_ex_uk', { Arsenal: 2.02, Draw: 3.5, Chelsea: 4.2 }),
    exch('smarkets', { Arsenal: 2.04, Draw: 3.6 })
  ])]);
  assert.equal(rows.length, 3);
  const arsenal = rows.find(r => r.selection === 'Arsenal');
  assert.equal(arsenal.exchangeKey, 'smarkets');
  assert.equal(arsenal.layOdds, 2.04);
  const chelsea = rows.find(r => r.selection === 'Chelsea');
  assert.equal(chelsea.exchangeKey, 'betfair_ex_uk'); // only exchange with a Chelsea lay price
  assert.ok(arsenal.rating > 95 && arsenal.rating < 100);
  assert.ok(arsenal.snrRating > 40 && arsenal.snrRating < 50);
});

test('commission overrides change the chosen exchange', () => {
  const ev = event('e1', 5, [
    book('coral', { Arsenal: 2.0 }),
    exch('betfair_ex_uk', { Arsenal: 2.02 }),
    exch('smarkets', { Arsenal: 2.04 })
  ]);
  const [row] = buildMatches([ev], { betfair_ex_uk: 0 });
  assert.equal(row.exchangeKey, 'betfair_ex_uk');
  assert.equal(row.commission, 0);
});

test('events without exchange lay prices produce no rows', () => {
  assert.deepEqual(buildMatches([event('e1', 5, [book('coral', { Arsenal: 2 })])]), []);
});

test('filters by odds, rating, bookmaker, time and search; sorts by chosen rating', () => {
  const rows = buildMatches([
    event('soon', 2, [book('coral', { Arsenal: 2.0, Chelsea: 6.0 }), exch('smarkets', { Arsenal: 2.02, Chelsea: 6.2 })]),
    event('started', -1, [book('coral', { Arsenal: 2.0 }), exch('smarkets', { Arsenal: 2.0 })]),
    event('later', 100, [book('skybet', { Arsenal: 3.0 }), exch('smarkets', { Arsenal: 3.0 })])
  ]);
  const all = filterAndSort(rows, { now: NOW });
  assert.equal(all.length, 3, 'started events are excluded');
  assert.equal(all[0].bookmakerKey, 'skybet'); // 3.0/3.0 is the highest qualifying rating

  assert.equal(filterAndSort(rows, { now: NOW, hoursAhead: 48 }).length, 2);
  assert.equal(filterAndSort(rows, { now: NOW, minOdds: 4 }).length, 1);
  assert.equal(filterAndSort(rows, { now: NOW, maxOdds: 2.5 }).length, 1);
  assert.equal(filterAndSort(rows, { now: NOW, bookmakers: ['coral'] }).length, 2);
  assert.equal(filterAndSort(rows, { now: NOW, search: 'skybet' }).length, 1);
  assert.equal(filterAndSort(rows, { now: NOW, minRating: 98.5 }).length, 1);

  const snr = filterAndSort(rows, { now: NOW, mode: 'free-snr' });
  assert.equal(snr[0].selection, 'Chelsea'); // long odds extract the most from a free bet
});
