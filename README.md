# MatchedBet

A static matched betting website with no build step and no dependencies.

- **Oddsmatcher** (`oddsmatcher.html`) pulls UK bookmaker odds and exchange lay odds (Betfair, Smarkets,
  Matchbook) from [The Odds API](https://the-odds-api.com/) and ranks every back/lay pair by rating for
  qualifying bets or free bets. Each user pastes their own API key, which is kept in their browser. The free
  plan allows 500 requests a month, and each load costs 2 (markets `h2h` and `h2h_lay`, region `uk`). The
  last response for each sport is cached in the browser to save requests. Sample odds are built in so the
  page works without a key, and they're clearly labelled as sample data.
- **Calculator** (`calculator.html`) works out lay stakes, liability and profit for qualifying bets and for
  stake-not-returned (SNR) and stake-returned (SR) free bets. It includes exchange commission and has an
  underlay/overlay slider.
- **Profit tracker** (`tracker.html`) logs bets in the browser's `localStorage` and shows totals by bookmaker
  and by month. You can import and export CSV.
- **Guide** (`guide.html`) is a beginner's walkthrough with a worked example and a glossary.

## Running locally

Open `index.html` in a browser, or serve the folder:

```sh
npm start          # serves on http://localhost:8080
```

## Showing real odds to every visitor

The oddsmatcher first loads `data/odds.json`. The **Fetch odds** GitHub Actions workflow writes that file
every 6 hours, so visitors see real odds without an API key. To turn it on:

1. Get a free API key at [the-odds-api.com](https://the-odds-api.com/).
2. In the repo, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it
   `ODDS_API_KEY` and paste the key.
3. Merge this work into the default branch. Scheduled workflows only run there.
4. Open **Actions → Fetch odds → Run workflow** to fetch the first batch now.
5. Publish the site with **Settings → Pages**, deploying from the default branch root. Each odds update
   commits `data/odds.json`, and Pages redeploys.

The workflow fetches the Premier League, the Championship and the Champions League. Each sport uses
2 requests per run, which is about 370 of the free plan's 500 monthly requests. To change the sports or the
schedule, edit `ODDS_SPORTS` and the cron line in `.github/workflows/fetch-odds.yml`.

Until `data/odds.json` exists, the page shows clearly labelled sample odds. Visitors can still load fresh
odds with their own key from the collapsed panel.

## Tests

The maths in `js/calc.js` and the CSV helpers in `js/csv.js` are plain functions with Node tests:

```sh
npm test
```

## Deploying

Every file is static, so the repo can go on GitHub Pages, Netlify or any static host without changes.
For GitHub Pages, open **Settings → Pages** and deploy from the branch root.

## The maths

With back stake `S`, back odds `B`, lay odds `L` and commission `c`, the balanced lay stake is:

| Bet type        | Lay stake              |
| --------------- | ---------------------- |
| Qualifying      | `S × B / (L − c)`      |
| Free bet (SNR)  | `S × (B − 1) / (L − c)` |
| Free bet (SR)   | `S × B / (L − c)`      |

Liability is `lay stake × (L − 1)`.
