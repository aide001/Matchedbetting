# MatchedBet

A static matched betting website with no build step and no dependencies.

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
