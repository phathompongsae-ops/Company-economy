# Company Economy

Competitive business-strategy game in a small Three.js 2.5D pixel city — 2–4 companies
(any mix of humans and bots) fight for shelves, customers, and revenue.

## Play

- **Playtest build (GitHub Pages)**: deployed from `feature/playtest-build-v1` by
  `.github/workflows/deploy-playtest.yml` — open the Pages URL on desktop or Android,
  no login needed.
- **Run locally**: `npm run serve` then open `http://localhost:8080/`
  (fully static — any static file server works; `index.html` redirects into the game).

**Recommended first test**: keep the default setup (you vs 1 bot) and press Start Match.
Full guide: `docs/qa/playtest-guide-v1.md`

## Develop

- `npm test` — full headless and independent regression suite (44 tests, no install needed)
- `npm run simulate` — scripted-scenario runner
- `node src/sim/lab.js --all --seeds 20` — bot balance lab

Docs: `docs/game-design/` (design, bots, balance) · `docs/technical/` (runtime architecture) · `docs/qa/` (playtest and independent audit evidence)
