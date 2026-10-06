const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatches } = require('../public/js/oddsmatch.js');
const { makePlan, HOME_LINKS } = require('../public/js/bet-plan.js');

const NOW = Date.parse('2026-10-06T12:00:00Z');
const at = (h) => new Date(NOW + h * 3600e3).toISOString();
const h2h = (prices, link) => ({ key: 'h2h', outcomes: Object.entries(prices).map(([name, price]) => ({ name, price, link })) });
const lay = (prices) => ({ key: 'h2h_lay', outcomes: Object.entries(prices).map(([name, price]) => ({ name, price })) });

function ev(id, hours, coral, smk) {
  return { id, sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: at(hours), home_team: 'Arsenal', away_team: 'Chelsea',
    bookmakers: [
      { key: 'coral', title: 'Coral', markets: [h2h(coral, 'https://coral.example/slip')] },
      { key: 'williamhill', title: 'William Hill', markets: [h2h({ Arsenal: 1.9, Draw: 3.4, Chelsea: 4.5 })] },
      { key: 'smarkets', title: 'Smarkets', markets: [lay(smk)] }
    ] };
}

const CORAL = { id: 'coral', bookmaker: 'Coral', oddsKeys: ['coral'], qualifying: { stake: 5, minOdds: 1.5 },
  freeBets: [{ count: 4, value: 5, use: 'single' }, { count: 1, value: 5, use: 'betbuilder' }] };

test('qualifying plan picks the best-rated eligible Coral price and works out the lay', () => {
  const rows = buildMatches([
    ev('soon', 0.5, { Arsenal: 2.0, Draw: 3.5, Chelsea: 4.4 }, { Arsenal: 2.0, Draw: 3.5, Chelsea: 4.4 }), // too soon
    ev('good', 5, { Arsenal: 2.04, Draw: 3.5, Chelsea: 4.4 }, { Arsenal: 2.06, Draw: 3.7, Chelsea: 4.8 })
  ]);
  const p = makePlan(rows, CORAL, 'qualifying', { now: NOW });
  assert.equal(p.ok, true);
  assert.equal(p.event, 'Arsenal v Chelsea');
  assert.equal(p.selection, 'Arsenal');
  assert.equal(p.back.bookmaker, 'Coral');
  assert.equal(p.back.stake, 5);
  assert.equal(p.back.link, 'https://coral.example/slip');
  assert.equal(p.back.direct, true);
  assert.equal(p.lay.exchange, 'Smarkets');
  assert.equal(p.lay.link, HOME_LINKS.smarkets);
  assert.equal(p.lay.direct, false);
  assert.ok(Math.abs(p.profitIfBackWins - p.profitIfLayWins) <= 0.01);
  assert.ok(p.result < 0 && p.result > -0.5);
  assert.match(p.calculatorQuery, /^type=qualifying&stake=5&backOdds=2.04&layOdds=2.06&commission=2$/);
});

test('free bet plan uses longer odds and the first single free bet', () => {
  const rows = buildMatches([ev('e', 5, { Arsenal: 2.0, Draw: 3.5, Chelsea: 5.0 }, { Arsenal: 2.02, Draw: 3.6, Chelsea: 5.1 })]);
  const p = makePlan(rows, CORAL, 'free', { now: NOW });
  assert.equal(p.selection, 'Chelsea');
  assert.equal(p.betType, 'free-snr');
  assert.equal(p.back.stake, 5);
  assert.ok(p.result > 3.5 && p.result < 4.5);
});

test('explains why there is no plan', () => {
  const rows = buildMatches([ev('e', 5, { Arsenal: 2.0 }, { Arsenal: 2.02 })]);
  assert.equal(makePlan(rows, { bookmaker: 'Bet365', oddsKeys: [], qualifying: { stake: 10 }, freeBets: [] }, 'qualifying', { now: NOW }).reason, 'not-in-feed');
  assert.equal(makePlan(rows, Object.assign({}, CORAL, { freeBets: [{ count: 1, value: 10, use: 'acca' }] }), 'free', { now: NOW }).reason, 'no-single-free-bet');
  assert.equal(makePlan(rows, Object.assign({}, CORAL, { qualifying: { stake: 5, minOdds: 3 } }), 'qualifying', { now: NOW }).reason, 'no-match');
  assert.equal(makePlan(rows, { bookmaker: 'Smarkets', qualifying: null, freeBets: [] }, 'qualifying', { now: NOW }).reason, 'no-qualifying');
});

test('matches bookmakers by name when the feed key differs', () => {
  const rows = buildMatches([ev('e', 5, { Arsenal: 2.0 }, { Arsenal: 2.02 })]);
  const p = makePlan(rows, { bookmaker: 'Coral', oddsKeys: [], qualifying: { stake: 5, minOdds: 1.5 }, freeBets: [] }, 'qualifying', { now: NOW });
  assert.equal(p.ok, true);
});

test('bet labels read naturally', () => {
  const { betLabel } = require('../public/js/bet-plan.js');
  assert.equal(betLabel('Arsenal'), 'Arsenal to win');
  assert.equal(betLabel('Draw'), 'The draw');
});
