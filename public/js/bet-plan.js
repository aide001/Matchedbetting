/*
 * Turns oddsmatcher rows into exact instructions for one step of an offer:
 * which bet to back where, at what odds and stake, and what to lay where.
 * Pure functions; window.MBPlan in the browser, module.exports in Node.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Calc = isNode ? require('./calc.js') : root.MBCalc;

  // Home pages, used when the odds feed has no direct link to the event.
  var HOME_LINKS = {
    williamhill: 'https://sports.williamhill.com',
    paddypower: 'https://www.paddypower.com',
    skybet: 'https://www.skybet.com',
    coral: 'https://www.coral.co.uk',
    ladbrokes_uk: 'https://www.ladbrokes.com',
    betfred_uk: 'https://www.betfred.com',
    betfred: 'https://www.betfred.com',
    betvictor: 'https://www.betvictor.com',
    betway: 'https://betway.com',
    boylesports: 'https://www.boylesports.com',
    unibet_uk: 'https://www.unibet.co.uk',
    sport888: 'https://www.888sport.com',
    virginbet: 'https://www.virginbet.com',
    betfair_sb_uk: 'https://www.betfair.com/sport',
    livescorebet: 'https://www.livescorebet.com',
    betfair_ex_uk: 'https://www.betfair.com/exchange/plus',
    betfair_ex_eu: 'https://www.betfair.com/exchange/plus',
    smarkets: 'https://smarkets.com',
    matchbook: 'https://www.matchbook.com',
    betdaq: 'https://www.betdaq.com'
  };

  var STEPS = {
    qualifying: { minOdds: 1.5, maxOdds: 6, sortKey: 'rating' },
    free: { minOdds: 3, maxOdds: 10, sortKey: 'snrRating' }
  };
  var MIN_LEAD_MS = 60 * 60e3;        // leave at least an hour to place both bets
  var MAX_AHEAD_MS = 7 * 24 * 3600e3; // and don't pick events more than a week away

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function rowsForOffer(rows, offer) {
    var keys = offer.oddsKeys || [];
    var name = norm(offer.bookmaker);
    return rows.filter(function (r) { return keys.indexOf(r.bookmakerKey) >= 0 || norm(r.bookmaker) === name; });
  }

  // The free bet the plan covers: the first one that can be used on a single.
  function singleFreeBet(offer) {
    return (offer.freeBets || []).filter(function (f) { return f.use === 'single'; })[0] || null;
  }

  /*
   * step: 'qualifying' or 'free'. Returns { ok: true, ... } with the instructions,
   * or { ok: false, reason } where reason is one of:
   * 'no-qualifying', 'no-single-free-bet', 'not-in-feed', 'no-match'.
   */
  function makePlan(rows, offer, step, opts) {
    opts = opts || {};
    var now = opts.now != null ? opts.now : Date.now();
    var cfg = STEPS[step];
    if (!cfg) throw new Error('Unknown step ' + step);

    var stake, betType, minOdds = cfg.minOdds;
    if (step === 'qualifying') {
      if (!offer.qualifying || !offer.qualifying.stake) return { ok: false, reason: 'no-qualifying' };
      stake = offer.qualifying.stake;
      betType = 'qualifying';
      // Unknown minimum odds: stay at evens or above, which meets almost every offer.
      minOdds = Math.max(cfg.minOdds, offer.qualifying.minOdds || 2);
    } else {
      var fb = singleFreeBet(offer);
      if (!fb) return { ok: false, reason: 'no-single-free-bet' };
      stake = fb.value;
      betType = 'free-snr';
    }

    var mine = rowsForOffer(rows, offer);
    if (!mine.length) return { ok: false, reason: 'not-in-feed' };

    var candidates = mine.filter(function (r) {
      var start = Date.parse(r.commenceTime);
      return r.backOdds >= minOdds && r.backOdds <= cfg.maxOdds &&
        start - now >= MIN_LEAD_MS && start - now <= MAX_AHEAD_MS;
    }).sort(function (a, b) {
      return (b[cfg.sortKey] - a[cfg.sortKey]) || (Date.parse(a.commenceTime) - Date.parse(b.commenceTime));
    });
    if (!candidates.length) return { ok: false, reason: 'no-match' };

    var r = candidates[0];
    var calc = Calc.calculate({ backStake: stake, backOdds: r.backOdds, layOdds: r.layOdds, commission: r.commission, betType: betType });
    return {
      ok: true,
      step: step,
      betType: betType,
      event: r.event,
      sport: r.sport,
      commenceTime: r.commenceTime,
      selection: r.selection,
      back: {
        bookmaker: r.bookmaker,
        odds: r.backOdds,
        stake: stake,
        link: r.backLink || HOME_LINKS[r.bookmakerKey] || null,
        direct: !!r.backLink
      },
      lay: {
        exchange: r.exchange,
        odds: r.layOdds,
        stake: calc.layStake,
        liability: calc.liability,
        commission: r.commission,
        link: r.layLink || HOME_LINKS[r.exchangeKey] || null,
        direct: !!r.layLink
      },
      profitIfBackWins: calc.profitIfBackWins,
      profitIfLayWins: calc.profitIfLayWins,
      result: calc.guaranteedProfit,
      rating: step === 'free' ? r.snrRating : r.rating,
      calculatorQuery: 'type=' + betType + '&stake=' + stake + '&backOdds=' + r.backOdds +
        '&layOdds=' + r.layOdds + '&commission=' + r.commission
    };
  }

  var REASONS = {
    'no-qualifying': 'This offer has no qualifying bet to match.',
    'no-single-free-bet': 'This offer\'s free bets can\'t be used on a normal single, so there\'s no simple back-and-lay match for them. See the advice in the guide.',
    'not-in-feed': 'Our odds feed doesn\'t include this bookmaker, so we can\'t pick a match automatically. Use the oddsmatcher\'s filters with another bookmaker\'s prices as a guide, and check the odds on the bookmaker\'s own site.',
    'no-match': 'There\'s no suitable match right now (we look for events starting between 1 hour and 7 days from now). Try again later, when more prices are available.'
  };

  // How to describe the bet in plain words: "Arsenal to win" or "The draw".
  function betLabel(selection) {
    return /^draw$/i.test(selection) ? 'The draw' : selection + ' to win';
  }

  function layLabel(selection) {
    return /^draw$/i.test(selection) ? 'The draw' : selection;
  }

  var api = { betLabel: betLabel, layLabel: layLabel, HOME_LINKS: HOME_LINKS, REASONS: REASONS, rowsForOffer: rowsForOffer, singleFreeBet: singleFreeBet, makePlan: makePlan };
  if (isNode) module.exports = api;
  else root.MBPlan = api;
})(typeof window !== 'undefined' ? window : this);
