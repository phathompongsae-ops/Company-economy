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

## 5. Deployment status (diagnosed)

**Historical failures explained.** All 27 pre-RC runs ended `startup_failure` inside a
single window (2026-07-19 23:29 UTC → 2026-07-20 01:21 UTC): 24 synthetic
"BuildFailed" runs (one per push, on every branch, including pushes of the final valid
workflow file) plus 2 failed and 1 forever-queued `workflow_dispatch` runs of the deploy
workflow. Pushes after that window create no spurious runs, and a fresh dispatch starts
normally — so the storm was a GitHub Actions platform incident, not workflow content.

**Current verified state.** Run #4 of `deploy-playtest.yml`
(id 29774516929, dispatched from `cc/company-economy-release-candidate-v1` @ `47a71d1e`)
started normally: checkout ✓, Node 22 ✓, **43/43 tests passed on the runner** ✓, then
`actions/configure-pages@v5` failed with `Get Pages site: Not Found` followed by
`Create Pages site: Resource not accessible by integration`. Meaning: **GitHub Pages has
never been enabled for this repository, and a workflow token cannot enable it** — that
is an owner-only repository setting.

**Owner action required (once).** Open
<https://github.com/phathompongsae-ops/Company-economy/settings/pages> and under
**Build and deployment → Source** select **GitHub Actions** (takes effect immediately —
no Save button). Then re-run the deploy workflow from
Actions → "Deploy Playtest to GitHub Pages" → Run workflow → branch
`cc/company-economy-release-candidate-v1`. Expected URL:
`https://phathompongsae-ops.github.io/Company-economy/`.

The base path was validated locally before dispatching: the repository served under a
`/Company-economy/` prefix boots to the HQ screen with zero console errors (relative
entry redirect, no absolute-root asset references, `.nojekyll` present, three.js
vendored).

## 6. Honest limitations

- Mobile tests are viewport emulation, not physical devices.
- GitHub Pages deployment remains blocked at the repository-settings level (see §5).
- Balance evidence beyond the automated lab (anti-inflation, counterplay, archetype
  spread — tests 37–39) is from bot self-play plus the scripted human strategies above,
  not long human sessions.
