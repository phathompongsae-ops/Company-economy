# Company Economy — Bot Design v1 (As-Built)

Modules: `src/bots/bot.js` (view + planner + driver), `src/bots/archetypes.js` (data-only
weights). Bots are exercised by the UI (`runBotTurn` at the bot's initiative position) and
by the balance lab (`src/sim/lab.js`) through the exact same code.

## 1. Perception — the BotView fairness boundary

`buildBotView(state, co)` is the ONLY window bot logic gets. It exposes exactly what a
hot-seat human sees on screen:

| Visible | Source on a human's screen |
|---|---|
| Own company: everything | own panels |
| Competitors: name, cash, cumulative revenue, employee count, HQ plot, product positions+prices | shared topbar, overview panel, store shelves |
| Stores: location, type, traffic tier, shelf contents+stock, own product history | map + inspector |
| City: buildings, populations, districts, HQ plots | map |
| `estimateOwnDemand(store, prod)` | the same public estimator stores themselves use |

**Never exposed**: competitors' relationships, competitors' queued `_plans`, employee
skill details, future RNG. Test 30 asserts the boundary; test 31 asserts bots cannot
leave illegal state (every action goes through `applyAction`).

## 2. Decision system

Deterministic utility planner — no RNG anywhere (same state ⇒ same decisions; match
determinism proven by test 29). Per planning phase, in order:

1. **HQ (round 1)**: score every free plot = weighted(store access, population reach,
   tourist reach) − weighted(setup+rent). Weights per archetype. All later distance math
   uses the *planned* plot position (the action is queued, not yet applied).
2. **Product/price open**: archetype position + band-point price.
3. **Price adaptation**: price_leader undercuts the cheapest same-position rival by 1,
   floored at ~1.5× unit cost margin ("cheap, not suicidal"); everyone else nudges price
   up when sold out everywhere, down when selling nothing.
4. **Hiring**: bottleneck-driven (pitch slots, campaign slots, shipment slots, org
   capacity) AND funded: after round 2 a hire requires last-round revenue to cover the
   bigger payroll OR a real capital buffer. Emergency mode (cash < 60% of reserve)
   freezes all discretionary spending.
5. **Skills**: train the archetype's priority skill only when cash-rich.
6. **Pitches**: off-shelf stores in range scored by estimated demand × margin × crowding.
7. **Coverage**: defend owned shelves first, then support pitches, respecting far-account
   load.
8. **Shipments**: restock by expected sales (last round ×1.3 vs estimate), skip dead
   stores, working-capital projection per shipment (cash after goods+freight plus a
   conservative sell-through must stay ≥ 0). Poverty-trap escape: when underwater, one
   small restock to the best proven seller is always allowed — selling is the only way
   back. Speculative stock to pitched stores: round-1 land grab (all archetypes, ≤2) and
   per-archetype appetite afterwards.
9. **Campaigns**: districts scored by population × awareness gap × fatigue × shelf
   presence (campaigns compound where the bot can actually be bought). High-appetite
   archetypes accept a leaner reserve for campaigns — it's their core engine.

Every decision carries a human-readable reason; the driver logs
`{t:'BotDecision', decisions:[{action, ok, reason, rejection?}]}` to `state.debugLog`
(visible in the UI dev panel).

## 3. Archetypes (data-only; no hidden bonuses)

| | position/price | hire priority | signature knobs |
|---|---|---|---|
| Balanced Operator | mainstream @ band 0.5 | sales→mkt→log | moderate everything |
| Price Leader | economy @ band 0.45 | sales→log→mgr | undercut w/ margin floor, lean reserve, spec shipments |
| Brand Builder | premium @ band 0.5 | mkt→sales→log | campaignAppetite 1.0, lean reserve for campaigns, tourist-weighted HQ |
| Retail Expansion | mainstream @ band 0.4 | sales→log→sales | pitchAppetite 1.0, deepest cash reserve (biggest payroll) |

Counterplay: each archetype's strength is another's target — see balance report v2 for
measured win rates by player count (price shines at 4p, retail at 2p, brand needs its
niche, balanced never spikes).

## 4. Difficulty / fairness

- One difficulty (Normal) in v1 — competitive vs humans (it beat the scripted human line
  in the automated full-match playtest) without any resource cheat.
- No hidden modifiers, no extra actions, no private reads, no future-RNG knowledge; the
  bot plans at its initiative seat like everyone else (last seat = same public info a
  last-seat human would have).
- Easy/Hard variants are deliberately deferred: the clean lever would be candidate-set
  truncation (Easy) / deeper candidate evaluation (Hard) under identical rules.

## 5. Debugging

- UI Dev Mode shows the last `BotDecision` with reasons and rejections.
- `node src/sim/lab.js --match balanced_operator,price_leader --seed 7 --verbose` replays
  any matchup headlessly with per-round finances.
