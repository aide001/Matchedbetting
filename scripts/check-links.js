'use strict';
// Shows which bookmakers and exchanges The Odds API gives bet slip links for.
// Uses 2 requests from your quota.  Run:  ODDS_API_KEY=... node scripts/check-links.js [sport]
const { buildMatches } = require('../public/js/oddsmatch.js');

const key = process.env.ODDS_API_KEY;
const sport = process.argv[2] || 'soccer_epl';
if (!key) {
  console.error('Set ODDS_API_KEY first, for example: ODDS_API_KEY=abc123 node scripts/check-links.js');
  process.exit(1);
}

(async () => {
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?` + new URLSearchParams({
    apiKey: key, regions: 'uk', markets: 'h2h,h2h_lay', oddsFormat: 'decimal', includeLinks: 'true'
  });
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`The Odds API returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const events = await res.json();
  const rows = buildMatches(events);
  const tally = {};
  const add = (name, side, level, example) => {
    const t = tally[name] = tally[name] || { side, betslip: 0, market: 0, event: 0, none: 0, example: null };
    t[level || 'none']++;
    if (level && !t.example) t.example = example;
  };
  for (const r of rows) {
    add(r.bookmaker, 'back', r.backLinkLevel, r.backLink);
    add(r.exchange, 'lay', r.layLinkLevel, r.layLink);
  }
  console.log(`${events.length} events in ${sport}. Requests left this month: ${res.headers.get('x-requests-remaining')}\n`);
  console.log('Site'.padEnd(24) + 'Side'.padEnd(6) + 'Bet slip  Match  None   Example link');
  for (const [name, t] of Object.entries(tally).sort()) {
    const match = t.market + t.event;
    console.log(name.padEnd(24) + t.side.padEnd(6) + String(t.betslip).padEnd(10) + String(match).padEnd(7) + String(t.none).padEnd(7) + (t.example || ''));
  }
  console.log('\n"Bet slip" links open the bet slip with the selection added. "Match" links open the event page.');
  console.log('Sites with only "None" fall back to their home page.');
})().catch((err) => {
  console.error(`Couldn't reach The Odds API: ${err.message}`);
  process.exit(1);
});
