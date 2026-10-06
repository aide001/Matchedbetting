/*
 * Oddsmatcher core: turns The Odds API v4 responses (markets h2h + h2h_lay)
 * into back/lay pairs ranked by rating. Pure functions; exposed as
 * window.MBOdds in the browser and module.exports in Node.
 */
(function (root) {
  'use strict';

  var Calc = typeof module !== 'undefined' && module.exports ? require('./calc.js') : root.MBCalc;

  // Exchanges The Odds API returns lay prices for, with typical default commission (%).
  var EXCHANGES = {
    betfair_ex_uk: { title: 'Betfair Exchange', commission: 5 },
    betfair_ex_eu: { title: 'Betfair Exchange (EU)', commission: 5 },
    smarkets: { title: 'Smarkets', commission: 2 },
    matchbook: { title: 'Matchbook', commission: 2 },
    betdaq: { title: 'Betdaq', commission: 2 }
  };

  function isExchange(key) {
    return Object.prototype.hasOwnProperty.call(EXCHANGES, key);
  }

  function findMarket(bookmaker, key) {
    var markets = bookmaker.markets || [];
    for (var i = 0; i < markets.length; i++) if (markets[i].key === key) return markets[i];
    return null;
  }

  function priceMap(market) {
    var map = {};
    (market && market.outcomes || []).forEach(function (o) {
      if (o && typeof o.price === 'number' && o.price > 1) map[o.name] = o.price;
    });
    return map;
  }

  // Only plain https links from the odds feed are used, so a bad value can't become a script link.
  function safeLink(v) {
    return typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null;
  }

  // Most specific link the feed gives: the selection (betslip), then the market, then the event at that bookmaker.
  function linkMap(bookmaker, market) {
    var map = {};
    (market && market.outcomes || []).forEach(function (o) {
      map[o.name] = safeLink(o.link) || safeLink(market.link) || safeLink(bookmaker.link);
    });
    return map;
  }

  function freeBetRating(backOdds, layOdds, commission) {
    var r = Calc.calculate({
      backStake: 100, backOdds: backOdds, layOdds: layOdds,
      commission: commission, betType: Calc.BET_TYPES.FREE_SNR
    });
    return r.ok ? r.rating : null;
  }

  /*
   * events      - array from GET /v4/sports/{sport}/odds?markets=h2h,h2h_lay
   * commissions - optional { exchangeKey: percent } overriding the defaults
   * Returns one row per (event, selection, bookmaker), paired with whichever
   * exchange gives the best qualifying rating after its commission.
   */
  function buildMatches(events, commissions) {
    commissions = commissions || {};
    var rows = [];
    (events || []).forEach(function (ev) {
      var books = ev.bookmakers || [];
      var lays = [];
      books.forEach(function (b) {
        if (!isExchange(b.key)) return;
        var m = findMarket(b, 'h2h_lay');
        if (!m) return;
        var c = commissions[b.key];
        lays.push({
          key: b.key,
          title: b.title || EXCHANGES[b.key].title,
          commission: typeof c === 'number' && !isNaN(c) ? c : EXCHANGES[b.key].commission,
          prices: priceMap(m),
          links: linkMap(b, m),
          updated: m.last_update || b.last_update
        });
      });
      if (!lays.length) return;

      books.forEach(function (b) {
        if (isExchange(b.key)) return;
        var m = findMarket(b, 'h2h');
        if (!m) return;
        var backs = priceMap(m);
        var backLinks = linkMap(b, m);
        Object.keys(backs).forEach(function (selection) {
          var backOdds = backs[selection];
          var best = null;
          lays.forEach(function (ex) {
            var layOdds = ex.prices[selection];
            if (!layOdds) return;
            var rating = Calc.qualifyingRating(backOdds, layOdds, ex.commission);
            if (!best || rating > best.rating) best = { ex: ex, layOdds: layOdds, rating: rating };
          });
          if (!best) return;
          rows.push({
            id: [ev.id, b.key, selection].join('|'),
            sportKey: ev.sport_key,
            sport: ev.sport_title || ev.sport_key,
            event: ev.home_team && ev.away_team ? ev.home_team + ' v ' + ev.away_team : (ev.home_team || ev.id),
            commenceTime: ev.commence_time,
            selection: selection,
            bookmakerKey: b.key,
            bookmaker: b.title || b.key,
            backOdds: backOdds,
            exchangeKey: best.ex.key,
            exchange: best.ex.title,
            layOdds: best.layOdds,
            commission: best.ex.commission,
            rating: best.rating,
            snrRating: freeBetRating(backOdds, best.layOdds, best.ex.commission),
            backUpdated: m.last_update || b.last_update || null,
            layUpdated: best.ex.updated || null,
            backLink: backLinks[selection] || null,
            layLink: best.ex.links[selection] || null
          });
        });
      });
    });
    return rows;
  }

  var SORTS = {
    rating: function (a, b) { return b.rating - a.rating; },
    snrRating: function (a, b) { return b.snrRating - a.snrRating; },
    time: function (a, b) { return Date.parse(a.commenceTime) - Date.parse(b.commenceTime); },
    backOdds: function (a, b) { return b.backOdds - a.backOdds; }
  };

  /*
   * filters: { mode: 'qualifying'|'free-snr' (default sort and minRating target),
   *            sort: 'rating'|'snrRating'|'time'|'backOdds', reverse: bool,
   *            minOdds, maxOdds, minRating, minSnrRating, hoursAhead, search, now (ms),
   *            bookmakers / exchanges / sports: [keys] (empty/undefined = all) }
   */
  function filterAndSort(rows, filters) {
    var f = filters || {};
    var now = f.now != null ? f.now : Date.now();
    var search = (f.search || '').trim().toLowerCase();
    var ratingKey = f.mode === 'free-snr' ? 'snrRating' : 'rating';
    var books = f.bookmakers && f.bookmakers.length ? f.bookmakers : null;
    var exchanges = f.exchanges && f.exchanges.length ? f.exchanges : null;
    var sports = f.sports && f.sports.length ? f.sports : null;
    var sortFn = SORTS[f.sort] || SORTS[ratingKey];
    return rows.filter(function (r) {
      var start = Date.parse(r.commenceTime);
      if (!isNaN(start)) {
        if (start <= now) return false; // in-play prices move too fast to match safely
        if (f.hoursAhead > 0 && start > now + f.hoursAhead * 3600e3) return false;
      }
      if (f.minOdds > 0 && r.backOdds < f.minOdds) return false;
      if (f.maxOdds > 0 && r.backOdds > f.maxOdds) return false;
      if (f.minRating > 0 && !(r[ratingKey] >= f.minRating)) return false;
      if (f.minSnrRating > 0 && !(r.snrRating >= f.minSnrRating)) return false;
      if (books && books.indexOf(r.bookmakerKey) === -1) return false;
      if (exchanges && exchanges.indexOf(r.exchangeKey) === -1) return false;
      if (sports && sports.indexOf(r.sportKey) === -1) return false;
      if (search && (r.event + ' ' + r.selection + ' ' + r.bookmaker).toLowerCase().indexOf(search) === -1) return false;
      return true;
    }).sort(function (a, b) {
      var d = sortFn(a, b);
      if (f.reverse) d = -d;
      return d || SORTS.time(a, b);
    });
  }

  var MBOdds = {
    EXCHANGES: EXCHANGES,
    isExchange: isExchange,
    safeLink: safeLink,
    buildMatches: buildMatches,
    filterAndSort: filterAndSort,
    SORTS: Object.keys(SORTS),
    freeBetRating: freeBetRating
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MBOdds;
  else root.MBOdds = MBOdds;
})(typeof window !== 'undefined' ? window : this);
