/*
 * Generates SAMPLE odds in The Odds API v4 shape so the oddsmatcher can be
 * tried without an API key. Prices are made up and are not real markets.
 */
(function (root) {
  'use strict';

  var FIXTURES = [
    ['soccer_epl', 'EPL', 'Arsenal', 'Chelsea'],
    ['soccer_epl', 'EPL', 'Liverpool', 'Aston Villa'],
    ['soccer_epl', 'EPL', 'Manchester City', 'Brighton and Hove Albion'],
    ['soccer_epl', 'EPL', 'Newcastle United', 'Tottenham Hotspur'],
    ['soccer_epl', 'EPL', 'Everton', 'West Ham United'],
    ['soccer_epl', 'EPL', 'Brentford', 'Fulham'],
    ['soccer_epl', 'EPL', 'Crystal Palace', 'Manchester United'],
    ['soccer_epl', 'EPL', 'Nottingham Forest', 'Wolverhampton Wanderers'],
    ['soccer_efl_champ', 'Championship', 'Leeds United', 'Sheffield Wednesday'],
    ['soccer_efl_champ', 'Championship', 'Norwich City', 'Middlesbrough'],
    ['soccer_efl_champ', 'Championship', 'Coventry City', 'Stoke City'],
    ['soccer_efl_champ', 'Championship', 'Hull City', 'Watford']
  ];
  var BOOKMAKERS = [
    ['williamhill', 'William Hill'], ['paddypower', 'Paddy Power'], ['skybet', 'Sky Bet'],
    ['coral', 'Coral'], ['ladbrokes_uk', 'Ladbrokes'], ['betvictor', 'Bet Victor'],
    ['betway', 'Betway'], ['boylesports', 'BoyleSports'], ['sport888', '888sport'],
    ['unibet_uk', 'Unibet'], ['virginbet', 'Virgin Bet']
  ];
  var EXCHANGES = [['betfair_ex_uk', 'Betfair'], ['smarkets', 'Smarkets'], ['matchbook', 'Matchbook']];

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function round2(n) { return Math.max(1.01, Math.round(n * 100) / 100); }

  function makeDemoOdds(nowMs, seed) {
    var rand = mulberry32(seed == null ? 20261001 : seed);
    var updated = new Date(nowMs - 3 * 60e3).toISOString();
    return FIXTURES.map(function (f, i) {
      var pHome = 0.22 + rand() * 0.42;
      var pDraw = 0.22 + rand() * 0.07;
      var pAway = 1 - pHome - pDraw;
      var probs = {};
      probs[f[2]] = pHome; probs.Draw = pDraw; probs[f[3]] = pAway;
      var names = Object.keys(probs);

      var bookmakers = BOOKMAKERS.filter(function () { return rand() > 0.15; }).map(function (b) {
        return {
          key: b[0], title: b[1], last_update: updated,
          markets: [{ key: 'h2h', last_update: updated, outcomes: names.map(function (n) {
            // Usually a 2–8% margin below fair; now and then a price at or above fair.
            var edge = rand() < 0.1 ? 1 + rand() * 0.03 : 0.92 + rand() * 0.07;
            return { name: n, price: round2(edge / probs[n]) };
          }) }]
        };
      });
      EXCHANGES.forEach(function (x) {
        if (rand() < 0.2) return;
        var lay = names.map(function (n) { return { name: n, price: round2((1 + 0.005 + rand() * 0.03) / probs[n]) }; });
        var back = lay.map(function (o) { return { name: o.name, price: round2(o.price * (0.97 + rand() * 0.02)) }; });
        bookmakers.push({
          key: x[0], title: x[1], last_update: updated,
          markets: [{ key: 'h2h', last_update: updated, outcomes: back },
            { key: 'h2h_lay', last_update: updated, outcomes: lay }]
        });
      });

      return {
        id: 'demo-' + i,
        sport_key: f[0],
        sport_title: f[1],
        commence_time: new Date(nowMs + (3 + i * 7 + rand() * 3) * 3600e3).toISOString(),
        home_team: f[2],
        away_team: f[3],
        bookmakers: bookmakers
      };
    });
  }

  var api = { makeDemoOdds: makeDemoOdds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MBDemoOdds = api;
})(typeof window !== 'undefined' ? window : this);
