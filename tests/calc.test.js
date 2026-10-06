const test = require('node:test');
const assert = require('node:assert/strict');
const MBCalc = require('../public/js/calc.js');

const { BET_TYPES } = MBCalc;

test('qualifying bet balances both outcomes', () => {
  const r = MBCalc.calculate({
    backStake: 10, backOdds: 3.0, layOdds: 3.1, commission: 2, betType: BET_TYPES.QUALIFYING
  });
  assert.ok(r.ok);
  // L = 10*3 / (3.1 - 0.02) = 9.74
  assert.equal(r.layStake, 9.74);
  assert.equal(r.liability, 20.45);
  assert.ok(Math.abs(r.profitIfBackWins - r.profitIfLayWins) <= 0.01);
  assert.equal(r.guaranteedProfit, -0.45);
});

test('free bet SNR extracts most of the free bet', () => {
  const r = MBCalc.calculate({
    backStake: 10, backOdds: 6.0, layOdds: 6.2, commission: 2, betType: BET_TYPES.FREE_SNR
  });
  // L = 10*5 / 6.18 = 8.09; lay win = 8.09*0.98 = 7.93
  assert.equal(r.layStake, 8.09);
  assert.ok(Math.abs(r.profitIfBackWins - r.profitIfLayWins) <= 0.01);
  assert.ok(r.guaranteedProfit > 7.9 && r.guaranteedProfit < 8);
  assert.ok(r.rating > 79 && r.rating < 80);
});

test('free bet SR lays the full return', () => {
  const r = MBCalc.calculate({
    backStake: 10, backOdds: 2.0, layOdds: 2.0, commission: 0, betType: BET_TYPES.FREE_SR
  });
  assert.equal(r.layStake, 10);
  assert.equal(r.profitIfBackWins, 10);
  assert.equal(r.profitIfLayWins, 10);
});

test('equal odds with no commission is break-even for qualifying bets', () => {
  const r = MBCalc.calculate({
    backStake: 25, backOdds: 4, layOdds: 4, commission: 0, betType: BET_TYPES.QUALIFYING
  });
  assert.equal(r.guaranteedProfit, 0);
  assert.equal(r.rating, 100);
});

test('lay stake override produces unbalanced outcomes', () => {
  const input = { backStake: 10, backOdds: 3, layOdds: 3, commission: 0, betType: BET_TYPES.QUALIFYING };
  const r = MBCalc.calculate(input, 5);
  assert.equal(r.profitIfBackWins, 10);
  assert.equal(r.profitIfLayWins, -5);
});

test('invalid input reports errors', () => {
  const r = MBCalc.calculate({ backStake: 0, backOdds: 1, layOdds: 0.5, commission: 120, betType: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 5);
});

test('qualifyingRating', () => {
  assert.equal(MBCalc.qualifyingRating(2, 2, 0), 100);
  assert.ok(MBCalc.qualifyingRating(2, 2.1, 2) < 100);
});
