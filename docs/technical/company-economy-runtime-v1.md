# Company Economy — Runtime Architecture v1 (As-Built)

## 1. Layer boundary

```
src/core/**        headless, deterministic, renderer-free (state, actions, systems, round)
src/bots/**        bot planner — reads BotView, emits actions through applyAction only
src/replay/**      PURE presentation-prep (timeline schedule, round summary) — node-testable
src/sim/**         headless runners: scripted scenarios (run.js) + bot balance lab (lab.js)
ui/**              Three.js + DOM presentation (hotseat.js, pixel-art.js, css)
```

Rules enforced by construction and tests:
- Economic truth lives ONLY in `GameState` (plain JSON). Three.js objects never own any.
- The UI mutates state exclusively through `applyAction` / `runBotTurn` / `resolveRound`.
- `resolveRound()` completes before the selling replay is even built; replay speed/skip
  move a playback clock over a fixed schedule (tests 32–33).
- Economic RNG is the state's single seeded cursor; the replay/visual layer uses NO RNG
  at all (timeline is a pure function of events).

## 2. Event replay pipeline

```
resolveRound(state)            // MARKET → SELL-IN → CONSUME → FINANCE, events appended
roundEvents = eventLog.slice(startIdx)
timeline = buildSellingTimeline(roundEvents, ctx)   // pure; ~20s schedule
renderer: clock += dt * speed  // spawn walkers/vans/pops as items pass; skip = jump to end
summarizeRound(state, roundEvents)                  // pure; feeds the summary screen
```

Every walker carries the real `PurchaseEvent` (consumerId, origin building, store,
company, qty, revenue). Walkers use L-shaped street paths consistent with the economy's
Manhattan distances.

## 3. Bot integration

Bots plan at their initiative seat inside the same round flow humans use. `runBotTurn`
= buildBotView → decideBotActions (pure, deterministic) → applyAction each → SubmitTurn,
with a `BotDecision` debug log. The lab (`src/sim/lab.js`) reuses this exact function, so
balance evidence describes the shipped game.

## 4. Presentation lifecycle (Three.js)

- Static: textures generated ONCE at module init (`ui/pixel-art.js` canvases); shared
  `SpriteMaterial`s per company/profile/frame. Buildings/stores/plots are billboard
  sprites created once; HQ sprites created per match and removed on new match.
- Pooled: walkers (cap 80), vans (cap 14), DOM feedback pops (cap 16), shelf chips —
  allocated lazily once, reused every round, hidden when idle. No per-round
  geometry/material/texture allocation, no disposal churn, no listener leaks (window
  listeners registered once at module scope).
- Per-frame work: replay clock, pop projection, select-ring — O(active entities).
  Economic decisions are never computed per frame.

## 5. Save / resume

`serializeState`/`deserializeState` (pure JSON round-trip; scratch fields are plain data
and rebuilt by `beginPlanningPhase`). The UI writes `{config, state}` to localStorage at
every round boundary; resume restores and continues identically (test 36). Saves are
best-effort — a blocked storage never breaks gameplay.

## 6. Test-config rules

`createInitialState(seed, names, rulesOverrides)` stores `state.rules`
(revenueTarget/maxRounds). Production UI never passes overrides; tests/lab use them for
accelerated matches (test 37 verifies TUNING itself stays untouched).

## 7. Performance notes (headless + browser observed)

- Headless: full 4-bot match ≈ 10–15 ms; 440-match lab batch ≈ 6 s.
- Browser: ≤ ~60 sprites + ≤ 14 vans + ≤ 16 DOM pops active during a selling phase;
  draw calls dominated by ~40 static sprites; no measurable growth across a 14-round
  match (pools stable, no per-round allocations).
- 4-company matches exercised end-to-end in the browser (observer playtest) without
  frame-loop errors.

## 8. Future multiplayer note

The core is already server-shaped: plain-JSON state, action validation, deterministic
resolution, event log. An online build would put `GameState` behind a server, accept
actions per company, broadcast `roundEvents` — the existing timeline/summary/UI would
consume them unchanged. Nothing in v1 binds economy truth to the client.
