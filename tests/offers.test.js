const test = require('node:test');
const assert = require('node:assert/strict');
const OFFERS = require('../server/offers.json');
const { estimateProfit, qualifyingLoss, freeBetTotal, USE_ADVICE } = require('../public/js/offer-guide.js');

test('every offer has the fields the guide needs', () => {
  const ids = new Set();
  for (const o of OFFERS) {
    assert.match(o.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(o.id), `duplicate id ${o.id}`);
    ids.add(o.id);
    assert.ok(o.bookmaker && o.headline, o.id);
    assert.ok(['sports', 'exchange'].includes(o.kind), o.id);
    assert.ok(['checked', 'conflicting', 'partial'].includes(o.check.status), o.id);
    assert.ok(o.source && /^https:\/\//.test(o.source.url), o.id);
    assert.match(o.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    for (const f of o.freeBets) {
      assert.ok(f.count > 0 && f.value > 0, o.id);
      assert.ok(USE_ADVICE[f.use], `${o.id} has unknown free bet use ${f.use}`);
    }
    if (o.kind === 'sports') assert.ok(o.qualifying && o.qualifying.stake > 0, o.id);
  }
});

test('free bet totals match the headlines', () => {
  for (const o of OFFERS) {
    const m = o.headline.match(/get £(\d+)/i);
    if (m) assert.equal(freeBetTotal(o), Number(m[1]), o.id);
  }
});

test('profit estimate', () => {
  const offer = { qualifying: { stake: 10, minOdds: 2 }, freeBets: [{ count: 3, value: 10, use: 'single' }] };
  assert.equal(qualifyingLoss(offer), 0.5);
  assert.equal(estimateProfit(offer), 22); // 30 * 0.75 - 0.5 = 22.0
  assert.equal(estimateProfit({ qualifying: null, freeBets: [] }), null);
  const bb = { qualifying: { stake: 5, minOdds: 1.5 }, freeBets: [{ count: 2, value: 10, use: 'betbuilder' }] };
  assert.equal(estimateProfit(bb), 7); // 20 * 0.35 - 0.15 = 6.85
});
