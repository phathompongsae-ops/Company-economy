# Company Economy — Release Candidate v1 QA Record

Branch: `cc/company-economy-release-candidate-v1` (baseline: `feature/playtest-build-v1`
@ `2f1c5939`, which is `feature/full-playable-game-v1` plus deployment-only commits —
ancestry verified before branching).

## 1. Scope of this RC pass

1. Independent verification of the five findings reported by the external full-playable
   audit (`docs/qa/full-playable-v1-independent-audit.md` on the
   `coco/full-playable-v1-bug-audit` branch). Per project policy the audit branch was
   **not** merged or cherry-picked; every finding was first reproduced on this branch
   with fresh scripts, then fixed independently in this branch's own code.
2. Regression tests for all five findings.
3. A full browser playtest matrix (Playwright, real UI clicks) on the fixed build.
4. Documentation + this QA record.

## 2. Findings verified and fixed

| # | Severity | Finding (reproduced before fixing) | Fix |
|---|----------|------------------------------------|-----|
| 1 | BLOCKER | `SetPrice` accepted `NaN` (any non-finite / non-numeric price bypassed the band check `price < lo \|\| price > hi`, corrupting the product price to `NaN`) | `Number(action.price)` + `Number.isFinite` check before the band check; converted value assigned (`src/core/actions.js`) |
| 2 | BLOCKER | `AssignLogistics` accepted `-100`, `0`, `0.5`, `Infinity`, `'abc'` as `units` — consuming a shipment slot and recording nonsense shipments | when provided, `units` must be a positive integer, validated **before** the slot decrement; omitted `units` still defaults to the max; explicit values still capped at `shipmentMaxUnits` |
| 3 | IMPORTANT | final-standings comparator returned `1` for both orders of a fully tied non-initiative pair (antisymmetry violation → engine-dependent ordering) | last-resort tie-break replaced with cyclic initiative rank `(index - initiativeIndex + n) % n` — a consistent total order (`src/core/round.js`) |
| 4 | IMPORTANT | round-summary `.grid2` (used for 3–4 companies) forced 480px-wide cards into fixed-width tracks → horizontal overflow on narrow viewports | `minmax(0,1fr)` tracks, shrinkable children, `width:auto` for nested overlay cards, single column ≤700px (`ui/hotseat.css`) |
| 5 | IMPORTANT | `PurchaseEvent`s had no id, so selling-phase walkers could not be traced 1:1 to purchases | deterministic `eventId` (`pe-r<round>-<seq>`) on every `PurchaseEvent`; timeline items carry `eventId` + `visualId` (`walker-<eventId>`); walker sprites are named with the `visualId` (index fallback keeps pre-eventId saves replayable) |

## 3. Automated test suite

`npm test` — **43/43 pass** (39 baseline + 4 new regression tests covering all five
findings; the CSS fix is covered by the browser viewport scenario below).

## 4. Browser playtest matrix (Playwright, chromium, local static server)

All scenarios drive the real UI (setup selects, planning tabs, submit/confirm buttons,
skip/continue) and assert on engine state via the `window.__ceTest` hook; any
`pageerror`/console error fails the scenario.

| Scenario | Result |
|----------|--------|
| Human (economy) vs bot — full match to victory, real clicks every round | PASS — finished round 14, winner declared, 293 PurchaseEvents |
| Human premium strategy, 3 rounds | PASS — premium sells through the real UI |
| 2-human hot-seat — pass-device privacy (no plan dock or plan details on transition screen; next player starts with empty plans) | PASS through round 2 |
| Human + 3 bots | PASS through round 4, 4 companies ranked |
| 4-bot observer (auto-advance) — full match | PASS — finished round 14 with only Skip clicks |
| Save/resume — 2 rounds, reload, Resume, identical company state, play on | PASS |
| Speed invariance — same seed/actions: Skip vs x2 vs x4 → identical states | PASS |
| Viewports 1280×800 / 1024×768 / 390×844 / 844×390 — 3-company summary, no horizontal overflow (regression for finding 4) | PASS (single column on mobile portrait) |

Mobile viewports are emulated browser windows (no real touch hardware in this
environment); touch behavior on physical devices remains follow-up validation.

## 5. Deployment status (read-only check)

GitHub Actions for this repository: 27 historical runs, **all `startup_failure`**
(latest 2026-07-20 01:21 UTC, on the audit branch) — the deploy workflow has never
started, which points to repository-level Actions/Pages enablement rather than workflow
content. No run was triggered from this RC branch. Publishing the playtest link stays an
environment/settings task outside this branch; the game runs from any static server
(`npm run serve`).

## 6. Honest limitations

- Mobile tests are viewport emulation, not physical devices.
- GitHub Pages deployment remains blocked at the repository-settings level (see §5).
- Balance evidence beyond the automated lab (anti-inflation, counterplay, archetype
  spread — tests 37–39) is from bot self-play plus the scripted human strategies above,
  not long human sessions.
