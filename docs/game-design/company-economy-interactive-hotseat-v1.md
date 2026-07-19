# Company Economy — Interactive Hot-Seat Playable Vertical Slice v1 (As-Built)

Status: implemented, human-playthrough-validated (via automated browser driving, see
"Playtest findings" below). This document describes what was actually built on top of
Foundation v2 + Simulation v1 (`docs/game-design/company-economy-vertical-slice-v1.md` is
the earlier pre-implementation plan; this doc is the as-built report).

Scope: a real Three.js + HTML/CSS UI (`ui/hotseat.html`, `ui/hotseat.js`, `ui/hotseat.css`)
that lets 2 human players finish a full match on one screen, one city, using the existing
headless core simulation as the sole source of truth. No new economy logic was written for
the UI — every mutation goes through the same `applyAction()` the 19 pre-existing headless
tests exercise.

## 1. Player flow

`Setup → (per company, round 1 only) HQ placement → Planning → Submit/Pass → Planning
(other company) → Submit/Resolve → Resolution replay → Round summary → Next round → …
→ Victory`

1. **Setup screen**: enter two company names (defaults "Alpha Co." / "Bravo Inc.") and a
   seed, click Start Match. Calls `createInitialState(seed, [nameA, nameB])` — the same
   entry point the headless simulator uses.
2. **HQ placement** (round 1 only, once per company): pick one of `CITY_V1.hqPlots` from a
   card list or by clicking the plot marker on the 3D map. Confirm calls the existing
   `ChooseCompanyLocation` action.
3. **Planning**: tabbed dock (Overview / Hire / Skills / Product / Marketing / Sales /
   Logistics). Every button calls a real Core action (`HireEmployee`, `UpgradeSkill`,
   `SetProductPosition`, `SetPrice`, `LaunchMarketing`, `AssignSales`, `PitchStore`,
   `AssignLogistics`) and immediately shows the validated result (`r.ok` / `r.reason`) via
   a toast — there is no separate client-side validation path.
4. **Submit & Pass**: calls `SubmitTurn`, then shows a "Pass the device" privacy screen
   before the other company's turn.
5. **Resolution**: once both companies submit, `resolveRound(state)` runs (the real
   MARKET → SELL-IN → CONSUME → FINANCE pipeline). The UI replays the resulting
   `PurchaseEvent`s as walkers and lists key events; it never computes an outcome itself.
6. **Round summary**: per-company finance breakdown read directly from the round's
   `Finance` event.
7. **Next round** repeats from Planning; the HQ step is skipped after round 1 since
   `co.hqPlotId` is already set.
8. **Victory**: shown when `state.finished` (revenue target reached, final round played,
   or `maxRounds` safety cap), with standings and a JSON telemetry export.

## 2. Hot-seat turn flow (architecture)

The pre-existing `playRound(state, plans)` batches an entire round (all actions for both
companies, submitted together) into one call — good for headless simulation, unusable for
an interactive UI where each human needs immediate feedback as they act.

`src/core/round.js` was split (without changing `playRound`'s behavior) into:

- `beginPlanningPhase(state)` — round++, phase='PLAN', `resetBudgets()`, finance reset.
  Called once per round by the UI.
- `resolveRound(state)` — the MARKET→SELL-IN→CONSUME→FINANCE pipeline, victory check,
  initiative rotation. Called once per round, after both companies submit.

Between those two calls, the UI calls `applyAction(state, {...})` **directly and
immediately** for every player click — not queued, not batched. This was proven
behaviorally identical to the batched `playRound()` path by test 20
(`hot-seat: beginPlanningPhase+applyAction(per player)+resolveRound matches playRound
exactly`): same action sequence through both paths produces identical cash/revenue/shelf
state for the same seed.

`playRound()` itself is unchanged and still used by the headless simulator/scenarios/tests.

## 3. UI information architecture

- **Topbar** (persistent once a match starts): both companies' cash, round/target, phase.
- **Planning dock** (left, only during Planning): tabs for each action category, always
  rendering `activeCo()` only.
- **Inspector** (right, on building/store click): public-tier information only — shelf
  occupants with company color swatches, traffic level, nearby population, qualitative
  building blurbs (see §13 of the source spec — no exact segment-mix numbers here).
- **Dev panel** (toggle, top-right): seed, round, phase, selection, recent
  `StoreDecision`/`ConsumerChoice`/`NoPurchase` debug log entries with exact numbers —
  kept visually and functionally separate from the normal player UI.

## 4. HQ placement UX

Each of the 4 `CITY_V1.hqPlots` is shown as a card with setup cost, rent, nearby-store
count, and nearby-resident estimate — e.g. Central Office ($150 setup, $25/round rent, 5
stores in range, ~30 residents) vs. South Edge ($60 setup, $10/round rent, 1 store in
range, ~0 residents). The tradeoff (cheap-and-isolated vs. expensive-and-central) is
readable directly off the card list without opening any other screen. Plots are also
clickable directly on the 3D map.

## 5. Planning actions

All 7 planning tabs are wired to real Core actions only; no tab offers an action the
simulation doesn't support. The **Hire** and **Marketing** tabs read
`computeCapabilities(co)` and a presentation-only preview
(`capabilitiesPreview(co, extraRole, extraSkill)` — clones `co.employees`, adds a
hypothetical hire/skill, and calls the *same* `computeCapabilities()` on the clone) to
answer "what does hiring this unlock?" without any duplicate capability logic.

One pre-existing Core behavior surfaced during hire/marketing testing and is *not* a bug:
`co._budget` (recruit/campaign/pitch/shipment slots) is computed once per round at the
start of planning by `resetBudgets()`, so a role hired mid-round only grants its capacity
**next** round. This matches the existing `marketing_heavy` scripted scenario and all 19
original tests. The UI adds a one-line clarifying note in the Marketing tab
("A role hired this round activates its capacity next round") rather than changing Core
behavior.

## 6. Resolution replay

After `resolveRound()` runs (economics already fully resolved), the UI:
1. Slices the new `EventLog`/`DebugLog` entries produced by this round.
2. Spawns walker meshes from the new `PurchaseEvent`s only (real `consumerId`/origin
   building/target store — no fabricated purchases), capped at 40 for perf.
3. Lists key events in resolution order (`Marketing → Sales/Store Decisions →
   Logistics/Deliveries → Consumer Purchases → Finance`), matching the real Core order.
4. Offers x1/x2/x4 speed (scales walker lerp speed) and Skip
   (`finishWalkersInstantly()` — snaps all walker positions to `t=1`; this only affects
   animation, the economic result was already computed in step 0).

## 7. Round summary / finance

Each company's card reads directly off that round's `Finance` event: revenue, COGS,
salaries, rent, logistics, profit, ending cash, units sold, shelf won/lost counts. No
values are recomputed in the UI.

## 8. Victory flow

Uses the existing victory/final-round logic unchanged. The UI shows the winner, final
standings (revenue + cash), and detects any tie-break note in the event log. "Export
Telemetry JSON" downloads a Blob of the match's telemetry (see §9). "New Match" reloads
the page — no campaign/progression system was added, per scope.

## 9. Privacy handling

Between a company's submit and the other company's turn, a full-screen "Pass the device to
<Company>" overlay replaces the planning dock entirely — `#planDock` is not rendered while
this overlay is up. Verified via automated test: the opposing company's planning panel is
absent from the DOM during transition (no HTML present to leak, not just visually hidden),
and the "OPPONENT (PUBLIC INFO ONLY)" section of the planning dock shows only name/employee
count/HQ-set-or-not — never cash, plans, or product pricing.

## 10. Playtest findings

A full match was driven end-to-end through the actual rendered browser UI via Playwright
(clicking real buttons/inputs in the real DOM — not a headless simulation call). Results:

- 13/13 automated UI checks passed (setup load, topbar, HQ screen, HQ confirm, inspector,
  privacy transition, resolution screen, round summary, victory screen reached through the
  UI only, telemetry export present, dev panel toggle, zero console/page errors).
- The match ran 14 rounds and ended via the `maxRounds` safety cap rather than the revenue
  target, because the scripted test policy was a minimal exercise pass (hire + one pitch
  per round), not an optimizing strategy — this is expected test-script behavior, not a
  balance finding.
- See "5 Core Fun Test Questions" in the final report delivered alongside this doc for an
  honest Promising/Unclear/Problem assessment — that assessment is deliberately not
  duplicated into this document since it depends on evidence gathered in the same session
  and is reported directly to the requester.

## 11. Known limitations

- **No real second human tested this build** — the "manual playthrough" was an automated
  Playwright script driving the real UI, not a live two-person session. It proves the flow
  is mechanically completable and bug-free, not that it is fun for two people at a table.
- **Mobile is emulated only** — Chromium viewport/touch emulation (390×844, `isMobile:
  true`, `hasTouch: true`) showed no horizontal overflow and usable panels, but no real
  mobile device or browser was used. This must not be read as "mobile validated."
- **Undo/cancel is not implemented** for pending planning decisions (price, marketing
  target, shipment assignment) before submit, per the explicit scope guidance to skip this
  if it would add architecture complexity.
- **No bot/scripted opponent hookup** — out of scope this round (hot-seat was the
  priority); the existing scripted scenario policies were not wired in as an optional
  opponent.
- Campaign world-feedback markers are simple flag icons on district corners, not
  billboards/overlays — kept intentionally minimal per the "no big VFX" guidance.

## 12. UI ↔ Core boundary (technical note)

- The only files under `ui/` that import from `src/core/` are `hotseat.js`. It imports
  `createInitialState`, `CITY_V1`, `PROFILES`, `byId` (state), `beginPlanningPhase`,
  `resolveRound` (round), `applyAction`, `salesLoad` (actions), `computeCapabilities`
  (capabilities), and `ROLES`/`SKILLS`/`POSITIONS`/`TUNING` (data) — all read-only lookups
  or the same mutation entry points the headless tests use.
- `hotseat.js` never branches on economic outcomes before calling Core — e.g. it does not
  pre-check "can I afford this hire" and disable the button client-side; it always calls
  `applyAction()` and displays whatever `{ok, reason}` Core returns. The one place the UI
  *previews* a hypothetical result (`capabilitiesPreview`) does so by calling the real
  `computeCapabilities()` on a cloned employee list, not by re-implementing the capability
  formula.
- Three.js scene objects (buildings/stores/HQ/plots/walkers) are tagged with
  `userData.{pickType, simId}` and are read from `GameState`/`CITY_V1` on sync — Three.js
  never owns or mutates economic state.
