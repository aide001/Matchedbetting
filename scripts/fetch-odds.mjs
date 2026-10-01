// Fetches UK bookmaker + exchange lay odds from The Odds API and writes data/odds.json,
// which the oddsmatcher loads for every visitor. Run by .github/workflows/fetch-odds.yml.
//
//   ODDS_API_KEY=... node scripts/fetch-odds.mjs
//
// Each sport costs 2 requests (markets h2h + h2h_lay, region uk).
import { writeFile, mkdir } from 'node:fs/promises';

const key = process.env.ODDS_API_KEY;
const base = process.env.ODDS_API_BASE || 'https://api.the-odds-api.com';
const sports = (process.env.ODDS_SPORTS || 'soccer_epl,soccer_efl_champ,soccer_uefa_champs_league')
  .split(',').map((s) => s.trim()).filter(Boolean);
const out = process.env.ODDS_OUT || 'data/odds.json';

if (!key) {
  console.error('ODDS_API_KEY is not set. Add it as a repository secret.');
  process.exit(1);
}

const result = { fetchedAt: new Date().toISOString(), sports: {} };
let remaining = null;
let failures = 0;

for (const sport of sports) {
  const url = `${base}/v4/sports/${encodeURIComponent(sport)}/odds/?` + new URLSearchParams({
    apiKey: key, regions: 'uk', markets: 'h2h,h2h_lay', oddsFormat: 'decimal', dateFormat: 'iso'
  });
  try {
    const res = await fetch(url);
    remaining = res.headers.get('x-requests-remaining') ?? remaining;
    if (!res.ok) {
      const body = await res.text();
      console.error(`${sport}: HTTP ${res.status} ${body.slice(0, 200)}`);
      failures++;
      continue;
    }
    const events = await res.json();
    // Keep only events that have at least one exchange lay market; the rest can't be matched.
    result.sports[sport] = events.filter((ev) =>
      (ev.bookmakers || []).some((b) => (b.markets || []).some((m) => m.key === 'h2h_lay')));
    console.log(`${sport}: ${events.length} events, ${result.sports[sport].length} with lay odds`);
  } catch (err) {
    console.error(`${sport}: ${err.message}`);
    failures++;
  }
}

if (failures === sports.length) {
  console.error('Every request failed; leaving the existing odds file in place.');
  process.exit(1);
}

await mkdir(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
await writeFile(out, JSON.stringify(result));
console.log(`Wrote ${out}. Requests remaining this month: ${remaining ?? 'unknown'}`);
