/*
 * Matched betting maths. Pure functions, no DOM access, so they can be
 * unit tested in Node and reused in the browser (exposed as window.MBCalc).
 *
 * Conventions:
 *   backStake  - stake placed at the bookmaker
 *   backOdds   - decimal odds at the bookmaker
 *   layOdds    - decimal odds at the exchange
 *   commission - exchange commission as a percentage (e.g. 2 for 2%)
 */
(function (root) {
  'use strict';

  var BET_TYPES = {
    QUALIFYING: 'qualifying', // your own cash at the bookmaker
    FREE_SNR: 'free-snr',     // free bet, stake not returned
    FREE_SR: 'free-sr'        // free bet, stake returned
  };

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function validate(input) {
    var errors = [];
    if (!(input.backStake > 0)) errors.push('Back stake must be greater than 0.');
    if (!(input.backOdds > 1)) errors.push('Back odds must be greater than 1.');
    if (!(input.layOdds > 1)) errors.push('Lay odds must be greater than 1.');
    if (!(input.commission >= 0 && input.commission < 100)) {
      errors.push('Commission must be between 0 and 100%.');
    }
    if (!BET_TYPES_LIST.includes(input.betType)) errors.push('Unknown bet type.');
    return errors;
  }

  var BET_TYPES_LIST = Object.keys(BET_TYPES).map(function (k) { return BET_TYPES[k]; });

  /*
   * Returns the lay stake that equalises profit across both outcomes.
   * Back win P = backReturn - L*(layOdds-1); lay win P = L*(1-c) - backCost.
   * Setting these equal gives L = (backReturn + backCost) / (layOdds - c).
   */
  function idealLayStake(input) {
    var c = input.commission / 100;
    var s = input.backStake;
    var o = input.backOdds;
    var numerator = input.betType === BET_TYPES.FREE_SNR ? s * (o - 1) : s * o;
    return numerator / (input.layOdds - c);
  }

  /*
   * Computes profit for each outcome for a given lay stake.
   * layStake is optional; defaults to the ideal (balanced) lay stake.
   */
  function calculate(input, layStakeOverride) {
    var errors = validate(input);
    if (errors.length) return { ok: false, errors: errors };

    var c = input.commission / 100;
    var s = input.backStake;
    var o = input.backOdds;
    var lo = input.layOdds;
    var layStake = layStakeOverride != null ? layStakeOverride : idealLayStake(input);
    var liability = layStake * (lo - 1);

    var backReturn; // what the bookmaker pays out if the back bet wins (net of original stake)
    var backCost;   // what you lose at the bookmaker if the back bet loses
    switch (input.betType) {
      case BET_TYPES.QUALIFYING:
        backReturn = s * (o - 1);
        backCost = s;
        break;
      case BET_TYPES.FREE_SNR:
        backReturn = s * (o - 1);
        backCost = 0;
        break;
      case BET_TYPES.FREE_SR:
        backReturn = s * o;
        backCost = 0;
        break;
    }

    var profitIfBackWins = backReturn - liability;
    var profitIfLayWins = layStake * (1 - c) - backCost;
    var worst = Math.min(profitIfBackWins, profitIfLayWins);

    // Rating: for qualifying bets, the % of stake you keep; for free bets, the % of the free bet you extract.
    var rating = input.betType === BET_TYPES.QUALIFYING
      ? ((s + worst) / s) * 100
      : (worst / s) * 100;

    return {
      ok: true,
      layStake: round2(layStake),
      liability: round2(liability),
      profitIfBackWins: round2(profitIfBackWins),
      profitIfLayWins: round2(profitIfLayWins),
      guaranteedProfit: round2(worst),
      rating: round2(rating)
    };
  }

  /* Rating (%) of back/lay odds for a qualifying bet, ignoring stake size. */
  function qualifyingRating(backOdds, layOdds, commission) {
    return calculate({
      backStake: 100, backOdds: backOdds, layOdds: layOdds,
      commission: commission, betType: BET_TYPES.QUALIFYING
    }).rating;
  }

  var MBCalc = {
    BET_TYPES: BET_TYPES,
    validate: validate,
    idealLayStake: idealLayStake,
    calculate: calculate,
    qualifyingRating: qualifyingRating,
    round2: round2
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MBCalc;
  } else {
    root.MBCalc = MBCalc;
  }
})(typeof window !== 'undefined' ? window : this);
