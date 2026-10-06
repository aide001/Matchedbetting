/*
 * Offer estimates and guide text. Pure functions; window.MBOffers in the browser, module.exports in Node.
 */
(function (root) {
  'use strict';

  // Rough share of a free bet's face value a matched bettor keeps, by how the free bet can be used.
  var EXTRACTION = { single: 0.75, acca: 0.55, betbuilder: 0.35, luckydip: 0.3, unknown: 0.6 };

  var USE_LABELS = {
    single: 'Free bet',
    acca: 'Acca free bet',
    betbuilder: 'Bet Builder free bet',
    luckydip: 'Lucky Dip free bet',
    unknown: 'Free bets'
  };

  var USE_ADVICE = {
    single: 'Use the oddsmatcher in SNR mode. Look for a high SNR rating at odds of roughly 4.0 to 8.0, where free bets keep the most value. Back the free bet at the bookmaker, then lay it straight away.',
    acca: 'An acca can\'t be laid as one bet, because exchanges don\'t offer accumulator markets. The usual approach is "lay as you go": pick legs that start at different times, lay the first leg, and only if it wins lay the next one, and so on. It takes more effort and you need enough exchange balance for each lay. If that sounds like too much, a small acca of short-priced picks is a simpler way to use it, but it isn\'t risk-free.',
    betbuilder: 'Bet Builders usually can\'t be fully covered, because exchanges don\'t offer the same combined markets. Matched bettors often lay one key leg, such as the match result, to reduce the risk, or simply accept the risk. Expect to keep less of these than of a normal free bet.',
    luckydip: 'A Lucky Dip picks a selection for you, so you can\'t choose odds to match. Treat it as a bonus rather than guaranteed profit.',
    unknown: 'The sources didn\'t say exactly how these free bets are split. Check the terms when they arrive. If they can be used on singles, match them in the oddsmatcher\'s SNR mode.'
  };

  function qualifyingLoss(offer) {
    var q = offer.qualifying;
    if (!q || !q.stake) return 0;
    // Close matches at low minimum odds lose less; typical ratings are about 95-97%.
    var rate = q.minOdds && q.minOdds < 1.8 ? 0.03 : 0.05;
    return Math.round(q.stake * rate * 100) / 100;
  }

  function freeBetTotal(offer) {
    return (offer.freeBets || []).reduce(function (s, f) { return s + f.count * f.value; }, 0);
  }

  // A rough guide to profit if the offer is matched carefully. Not a promise.
  function estimateProfit(offer) {
    var total = freeBetTotal(offer);
    if (!total) return null;
    var kept = (offer.freeBets || []).reduce(function (s, f) {
      return s + f.count * f.value * (EXTRACTION[f.use] != null ? EXTRACTION[f.use] : EXTRACTION.unknown);
    }, 0);
    return Math.max(0, Math.round(kept - qualifyingLoss(offer)));
  }

  var api = {
    EXTRACTION: EXTRACTION,
    USE_LABELS: USE_LABELS,
    USE_ADVICE: USE_ADVICE,
    qualifyingLoss: qualifyingLoss,
    freeBetTotal: freeBetTotal,
    estimateProfit: estimateProfit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MBOffers = api;
})(typeof window !== 'undefined' ? window : this);
