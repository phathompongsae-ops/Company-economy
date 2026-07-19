# Company Economy — Simulation v1 (implemented)

The playable headless economy prototype. Zero dependencies, plain Node ESM, no build step.

## Run it

```
npm run simulate -- --a balanced --b premium --seed 7 --verbose   # one narrated match
npm run simulate -- --a economy --b balanced --matches 10          # N seeds, win tally
npm run simulate -- --league --matches 3                            # round-robin all scenarios
npm run simulate -- --a balanced --b premium --dump                 # tail of debug/event logs
npm test                                                            # 19-test required suite
```

Three.js debug viewer (rendering only — same sim, stepped per click): serve the repo root
(`npx serve .`) and open `three/debug-viewer.html`.

## Architecture

```
src/core/
  rng.js            mulberry32 — the only randomness; cursor lives in GameState
  data/city-v1.js   authored city board (authoritative positions), consumer profiles
  data/roles-v1.js  roles/skills as Modifier lists, product positions, TUNING knobs
  capabilities.js   CapabilityResolver: org+skills -> flat capability sheet
  state.js          createInitialState: buildings -> real consumer agents; serializable
  actions.js        10 commands, validate -> apply | reject-with-reason, event-logged
  systems.js        resolveMarketing / resolveSellIn / resolveConsumers / resolveFinance
  round.js          playRound: simultaneous plans -> deterministic phase pipeline
src/sim/
  scenarios.js      11 scripted strategy policies (not AI)
  run.js            CLI runner (seed / matches / league / verbose / dump)
tests/run-tests.mjs 19 required tests, real exit code
three/debug-viewer.html  ortho 2.5D debug scene bound to sim IDs
```

- **Determinism**: same seed + same policies ⇒ byte-identical outcome (test 1). All
  randomness flows through the state's RNG cursor.
- **Multiplayer shape**: `playRound(state, plansByCompany)` is the whole server loop;
  commands validate inside resolvers; event log is the renderer/replay contract.
- **Phases**: PLAN (actions) → MARKET (awareness ledgers) → SELL-IN (relationships → store
  shelf decisions with hysteresis + initiative tie-break → deliveries/reliability) →
  CONSUME (per-agent purchases + tourist rotation) → FINANCE (books + insolvency +
  victory/final-round check).

## Explainability surfaces

- `state.debugLog`: `StoreDecision` (per-offer expectedUnits/margin/relationship/history/
  reliability/total), `ConsumerChoice` / `NoPurchase` (full utility terms + alternatives).
- `state.eventLog`: actions + rejections (with reasons), `ShelfWon/ShelfDropped`,
  `DeliveryEvent/DeliveryFailed/DeliveryWasted`, `CampaignVisualEvent`, `PurchaseEvent`,
  `Finance` (per-line costs), `FinalRoundTriggered`, `GameEnd`.

Answering the required debug questions:
- *Why did consumer C choose store B?* → `ConsumerChoice` entry for C.
- *Why did store X reject company A?* → `StoreDecision` for X: A's offer ranked below
  capacity (compare totals; hysteresis shown by incumbent flag).
- *Why did product P sell badly?* → `NoPurchase` bests + P's utility terms (priceFit/
  brand≈0/distance) across agents; plus `DeliveryFailed`/stock zeros for availability.
- *Why did revenue drop?* → `Finance` lines round-over-round + `ShelfDropped`/stockouts.

## Known limitations (V1 prototype)

- Scripted policies are simple; league win-rates partly measure script quality, not pure
  strategy strength (see balance report).
- Manhattan distance stands in for the road graph; swap lives behind `dist()`.
- Single price per product (store margin = fixed 25% share); wholesale negotiation term
  reserved for later.
- No human-interactive UI yet (next phase); the debug viewer is step-and-watch only.
- Warehouses/production, ranks/promotions, research information-gating UI are schema-ready
  but not in the playable loop.
