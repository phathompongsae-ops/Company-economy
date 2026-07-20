# Company Economy — Full Playable Game v1 Independent Audit

Audit date: 2026-07-20  
Auditor: Coco / Codex independent QA pass  
Repository allowlist: `phathompongsae-ops/Company-economy` only

## 1. Audited baseline

- Source-of-truth stacked head: `feature/playtest-build-v1` at `5955d313a9e2fc5ed7a6d72c6510179b2e5a76d6` (Draft PR #4).
- Lineage verified: `main` → PR #1 foundation → PR #2 interactive hot-seat → PR #3 full playable game → PR #4 playtest build.
- Baseline command: `node tests/run-tests.mjs`
- Baseline result: **39/39 PASS**, Node.js 22.16.0, 2.36 seconds.
- Browser entry: repository root `index.html` redirects to `ui/hotseat.html`.

## 2. Environment and isolation

The local QA workspace contained one Git repository context and one remote only:

`origin = https://github.com/phathompongsae-ops/Company-economy.git`

No other repository, nested repository, worktree, alternate remote, cross-project file, asset, history, or source context was used.

Browser verification used Chromium 144 with actual Three.js/WebGL under Xvfb + SwiftShader. Container browser policy blocked URL navigation, so the exact audited HTML/CSS/JavaScript modules were bundled and injected into an `about:blank` document for runtime testing. Core/UI source came only from the exact GitHub blobs at the audited head. Mobile tests are viewport emulation, not real-device tests.

A temporary GitHub Actions audit runner was attempted but ended in `startup_failure` before any job started. This was treated as tooling evidence only, not as a game test result. All reported game results below were executed locally and captured directly.

## 3. Scenarios executed

- Human vs Bot: full match to victory through real setup/turn/HQ/review/submit/selling/summary controls.
- Human + 3 Bots: full match to victory.
- 2-Human hot-seat: full match; 28 pass-device transitions checked for planning-data leakage.
- 4-Bot observer: full match without deadlock.
- 2-, 3-, and 4-company all-bot matches: all completed.
- Save/Resume: save → reload → resume → play another round → save again → reload again → resume → victory.
- Selling: x1, x2, x4 and Skip; authoritative state hash unchanged by Skip.
- Victory: final round, standings, exact-tie ordering and New Match save cleanup.
- Viewports: 1280×800 desktop, 1024×768 tablet-like, 390×844 mobile portrait emulation, 844×390 mobile landscape emulation.
- Lifecycle: three repeated 4-bot full matches; one canvas each and identical final DOM node count.

## 4. Proven issues and fixes

### BLOCKER — invalid shipment quantity created money and negative stock

**Reproduction:** Submit `AssignLogistics` with `units: -100` through the authoritative action API. The action was accepted, shelf stock became `-100`, COGS became `-200`, and cash increased because a negative goods cost was subtracted.

**Root cause:** `Math.min(action.units || shipmentMaxUnits, shipmentMaxUnits)` had no finite, integer, or positive lower-bound validation.

**Fix:** Require a positive integer before consuming the shipment slot; retain the existing maximum cap and default only when `units` is omitted.

**Regression coverage:** invalid negative/zero/fractional/NaN/Infinity quantities are rejected without consuming a slot; legal oversized quantities cap at the configured maximum; stock, COGS, and delivery events remain non-negative.

### BLOCKER — non-finite price corrupted authoritative product state

**Reproduction:** `SetPrice` accepted `NaN`; the product price became non-finite, allowing later utility/finance calculations to become `NaN`.

**Root cause:** range comparisons with `NaN` are false, so the existing band validation was bypassed.

**Fix:** Convert once and reject non-finite values before range validation.

**Regression coverage:** `NaN`, `Infinity`, and `-Infinity` are rejected and the prior legal price is preserved.

### IMPORTANT — exact multi-company victory ties used an invalid comparator

**Reproduction:** With four exactly tied companies and initiative at company 2, comparisons among companies that did not currently hold initiative returned `1` in both directions. This violated comparator antisymmetry and made remaining standings engine-order-dependent.

**Root cause:** the fallback only checked whether `a` was the initiative company and did not rank every company in rotating initiative order.

**Fix:** build a complete cyclic initiative-rank map and use its numeric difference as the final tie-break.

**Regression coverage:** exact ties for every initiative seat at 2, 3, and 4 companies produce the complete rotating order.

### IMPORTANT — four-company Summary overflowed horizontally on narrow viewports

**Reproduction:** At 390×844, the summary card width was 372 px but its scroll width was 744 px; only alternating company cards were initially visible. Overflow also occurred at 844×390 and 1024×768.

**Root cause:** a two-column grid combined with intrinsic/minimum widths and non-shrinking flex content.

**Fix:** use shrinkable grid tracks, remove intrinsic child minimums, allow summary text/flex rows to wrap, and switch to one column below 700 px. The top bar is horizontally scrollable rather than silently clipped on narrow screens.

**Verification:** final summary card/grid scroll widths equal client widths at all tested viewports; no horizontal Summary scrollbar remains.

### IMPORTANT — purchase walkers lacked stable source and visual IDs

**Reproduction:** Timeline items carried consumer/origin/store/company/product/quantity but no stable ID linking the visual entity to its authoritative `PurchaseEvent`.

**Root cause:** purchase events and replay timeline items did not assign identifiers.

**Fix:** every `PurchaseEvent` receives a deterministic unique `eventId`; timeline walkers copy it, receive `visualId = walker-<eventId>`, and remain attached to the live pooled walker through its replay item (`w.item`).

**Regression coverage:** every purchase maps one-to-one to a walker with matching event, consumer, real origin building, real destination store, company, product, and quantity.

## 5. Final verification

- Existing suite: **39/39 PASS**.
- Independent regressions: **5/5 PASS**.
- Total: **44/44 PASS**.
- 116-match deterministic balance smoke: completed, no inflation warnings; used only as a smoke test, not as a balance redesign.
- Human vs Bot browser match: victory at round 14, no console/page errors.
- Human + 3 Bots: victory at round 14, no console/page errors.
- 2-Human hot-seat: victory at round 14; 28 privacy transitions passed.
- Save/Resume: two reload/resume cycles and continuation to victory passed.
- All-bot 2/3/4 company matches: each completed at round 14.
- Determinism: three identical 4-company runs produced the same final SHA-256 state hash.
- Lifecycle: final DOM nodes `49, 49, 49`; canvas count `1, 1, 1`.
- Selling x1/x2/x4/Skip: passed; Skip did not mutate authoritative state.
- No fatal console error, unhandled page error, blank screen, phase deadlock, duplicate canvas, or obvious hot-seat privacy leak observed.

## 6. Finance, bot, determinism, replay, and privacy conclusions

- Finance conservation remains covered by the original suite; the proven resource-creation path is closed.
- Bots still use the same validator as humans; 2–4-company full matches completed without illegal-action deadlock.
- Same seed/config remains deterministic after adding event IDs because IDs derive only from deterministic round/event order.
- Replay remains presentation-only and now has explicit truth linkage.
- Pass-device screens did not retain the prior player's plan dock, queued plan counts, or visible dev panel.

## 7. Playtest readiness

The stabilized branch is ready for owner playtesting on desktop and viewport-emulated mobile layouts.

Run locally:

```bash
npm test
npm run serve
```

Then open `http://localhost:8080/`. The recommended first session remains the default **Human vs 1 Bot** setup. Full player instructions and the bug-report template are in `docs/qa/playtest-guide-v1.md`.

## 8. Deferred observations (not bugs fixed in this package)

- The small 116-match smoke batch showed archetype win-rate variation by player count. This is balance/tuning evidence, not proof of an implementation defect, so no balance values were changed.
- Selling-phase duration preference is a playtest question; x1/x2/x4/Skip already work and do not affect results.
- The playtest deployment workflow exists on `feature/playtest-build-v1`, but the live GitHub Pages URL was not independently verified in this environment.

## 9. Known limitations

- No physical Android/iOS device was available; mobile findings are Chromium viewport emulation only.
- Browser URL navigation was blocked by container policy; runtime verification used the exact bundled source in an inline document instead of navigating to the local server URL.
- GitHub Actions audit execution did not start; local Node/browser evidence is the source of truth for this audit.
- Audio, additional product categories, online multiplayer, backend/accounts, final-art expansion, and balance redesign were outside scope.
