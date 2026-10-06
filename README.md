# MatchedBet

A matched betting website with member accounts. It runs on Node.js with SQLite and has no npm dependencies.

## Features

**Free for everyone**
- **Calculator** (`/calculator.html`) works out lay stakes, liability and profit for qualifying bets and for
  stake-not-returned (SNR) and stake-returned (SR) free bets. It includes commission and has an
  underlay/overlay slider.
- **Beginner's guide** (`/guide.html`) is a walkthrough with a worked example and a glossary.

**Members (free account)**
- **Accounts:**
  - Register with name, email, password and an 18+ confirmation.
  - Log in and out.
  - Change your name or password. Changing the password signs out your other devices.
  - Delete your account and all its data.
- **Dashboard:** total and monthly profit, bets logged, offer progress, the next offers to do and recent bets.
- **Oddsmatcher:**
  - Pairs UK bookmaker prices with Betfair, Smarkets and Matchbook lay odds.
  - Filter by rating type (Normal or SNR), odds, rating, start time, sport, bookmaker and exchange
    (with each exchange's commission).
  - Sortable columns.
  - A pop-up calculator on every row, which can log the bet straight to the tracker.
- **Sign-up offers checklist:** mark each bookmaker's welcome offer as to do, in progress or done, and
  record the profit. The list is in `server/offers.json`.
- **Profit tracker:** bets are saved to the account, with totals by bookmaker and month and CSV
  import/export. Bets from the old browser-only tracker can be moved into the account.

## Running locally

Needs Node.js 22.13 or newer, for the built-in `node:sqlite`.

```sh
npm start                     # http://localhost:3000
npm test                      # unit tests and server API tests
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. |
| `DATABASE_PATH` | `data/matchedbet.db` | SQLite file. Put it on persistent storage in production. |
| `NODE_ENV` | | Set to `production` to mark session cookies `Secure` (needs HTTPS). |
| `TRUST_PROXY` | | Set to `1` behind a reverse proxy or load balancer, so rate limits use the real client IP. |
| `ODDS_API_KEY` | | Key from [the-odds-api.com](https://the-odds-api.com/). Without it the oddsmatcher shows labelled sample odds. |
| `ODDS_SPORTS` | `soccer_epl,soccer_efl_champ,soccer_uefa_champs_league` | Sports to fetch. |
| `ODDS_REFRESH_MINUTES` | `360` | How long fetched odds are reused before refreshing. |

The server fetches odds only when a member opens the oddsmatcher and the cached odds are older than
`ODDS_REFRESH_MINUTES`. Each refresh costs 2 requests per sport. With the defaults, that's at most about
370 a month, which is within the free plan's 500. For fresher odds, use a paid plan and lower the
refresh time.

## Deploying

The site needs a host that runs Node.js and keeps a persistent disk for the SQLite file. GitHub Pages and
other static hosts won't work. A `Dockerfile` is included, which stores the database in `/data`.

Example for Render, Railway or Fly.io:

1. Create a web service from this repository, using the Dockerfile.
2. Attach a persistent volume mounted at `/data`.
3. Set `NODE_ENV=production`, `TRUST_PROXY=1` and `ODDS_API_KEY`.
4. Make sure the site is served over HTTPS. These platforms do this by default.

Back up the database file regularly. It holds every member's account and bets.

## Security

- Passwords are hashed with scrypt and a random salt per password, and never stored in plain text.
- Sessions use random 256-bit tokens stored hashed in the database. The cookie is `HttpOnly` and
  `SameSite=Lax`, and also `Secure` in production. Sessions last 30 days.
- Writes must be JSON from the site's own origin, which blocks cross-site form posts.
- Logins are rate limited to 10 attempts per 15 minutes per IP and per email. Sign-ups are limited to
  5 per hour per IP.
- A strict Content Security Policy only allows the site's own scripts.
- Every query is scoped to the logged-in member, so one member can never read or change another's data.

## Not built yet

- **Password reset by email.** This needs an email provider such as Postmark, SES or Resend. Until then, a
  member who forgets their password can't recover the account.
- **Email verification.**
- **Paid plans.** OddsMonkey and Outplayed charge a subscription, which would need a payment provider
  such as Stripe.
- **Admin pages.** Edit `server/offers.json` to change the offers list.

## The maths

With back stake `S`, back odds `B`, lay odds `L` and commission `c`, the balanced lay stake is:

| Bet type        | Lay stake              |
| --------------- | ---------------------- |
| Qualifying      | `S × B / (L − c)`      |
| Free bet (SNR)  | `S × (B − 1) / (L − c)` |
| Free bet (SR)   | `S × B / (L − c)`      |

Liability is `lay stake × (L − 1)`.
