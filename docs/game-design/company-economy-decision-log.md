# Company Economy — Decision Log

Format per entry: **Decision · Reason · Alternatives considered · Revisit trigger.**
Scope: Phase 0 foundation decisions. Assumptions made autonomously are marked [A].

## 1. Turn structure — hybrid: simultaneous submission + deterministic phased resolution
- **Reason**: zero downtime at 2–4p; hidden simultaneous plans create positioning tension;
  maps 1:1 to server-authoritative online; phased pipeline keeps cause→effect readable.
- **Alternatives**: sequential turns (downtime, shelf-sniping by order, king-making);
  single-blob simultaneous resolution (opaque outcomes).
- **Revisit**: if playtests show planning windows drag >5 min, add per-phase soft locks.

## 2. Consumer simulation — aggregate zone/segment math + representative visual walkers
- **Reason**: deterministic, CPU-light, tunable per term, multiplayer-safe; the map still
  *feels* alive because walkers visualize real sales events.
- **Alternatives**: per-NPC economic agents (heavy, non-deterministic feel, sync nightmare);
  pure spreadsheet with no map feedback (kills pillar 4).
- **Revisit**: only if playtests say the city feels fake — then enrich the *visual* layer,
  never the economic one.

## 3. Product utility — additive weighted score (NOT multiplicative), softmax share
- **Reason**: multiplicative chains zero out new entrants (0 awareness ⇒ 0 sales — kills
  comebacks) and make tuning opaque; additive terms are explainable and each weight is a
  knob; softmax temperature controls winner-takes-how-much.
- **Alternatives**: multiplicative utility (rejected above); strict ranking/lexicographic
  choice (brittle, all-or-nothing).
- **Revisit**: if playtest shows price too dominant/weak, tune weights before changing model.

## 4. Store decision — 3-factor deterministic score + ×1.15 replacement hysteresis
- **Reason**: explainable ("demand × margin × relationship + promo"), all inputs are player
  levers, hysteresis models real shelf stickiness AND is the natural shelf half of
  first-to-market; no opaque RNG anywhere.
- **Alternatives**: probabilistic acceptance rolls (feels arbitrary, breaks §8 predictability
  requirement); auction/bid mechanics (thematic mismatch V1, adds a whole economy).
- **Revisit**: hysteresis value 1.15 [A] is a tuning seed; adjust from shelf-flip frequency
  in playtests (§ slice success criterion 2).

## 5. First-to-market — four decaying ledgers (awareness, familiarity, relationship, shelf hysteresis); NO milestones
- **Reason**: "first mover advantaged but never permanently" falls out of stocks-that-leak;
  every ledger is contestable by a listed lever; smallest model that gives the feel.
- **Alternatives**: permanent milestone bonuses (explicitly banned by requirements — snowball);
  a single combined "market presence" score (harder to read and counter selectively).
- **Revisit**: if late entrants still can't break in by mid-game, raise decay rates or lower
  hysteresis before adding mechanisms.

## 6. Organization — DAG-of-managers with capability constraints; verbs-not-bonuses; no map presence
- **Reason**: branching org shapes with real tradeoffs, zero micromanagement (employees are
  per-round capabilities, not units to move); every constraint expressed through the same
  Modifier system so new roles are data.
- **Alternatives**: fixed tree template (no expression); free-form no-manager pool (kills
  Manager role and org identity); employees as map agents (micromanagement RTS drift).
- **Revisit**: if org UI tests show players ignore structure, strengthen department
  efficiency effects.

## 7. Victory — cumulative revenue trigger + one full final round; tie-breakers cash → units → initiative
- **Reason**: readable race matching the sales fantasy; equal-rounds equalizer kills
  first-player trigger advantage; simple V1.
- **Alternatives**: valuation target (healthier but opaque, anticlimactic); hybrid score
  (multi-criteria confusion in V1).
- **Revisit**: if playtests show reckless-spend racing wins, pivot to valuation variant
  (schema already reserves liabilities).

## 8. Multiplayer model — hot-seat slice on server-authoritative-shaped core (command/resolver/event, seeded RNG, snapshot=save=sync)
- **Reason**: online later without economy rewrite; determinism + event log buy replay,
  spectate, reconnect for free.
- **Alternatives**: build netcode now (violates Phase 0 scope); pure local architecture
  (guarantees a painful rewrite).
- **Revisit**: when the slice proves fun → Phase "online alpha" wraps the same loop in a
  server.

## 9. [A] Finance V1 — cash only; no debt/loans/stock; insolvency = unpaid employees leave
- **Reason**: debt adds bailout dynamics and UI before the loop is proven; the auto-downsize
  rule is harsh, visible, and self-correcting without a credit system.
- **Alternatives**: emergency loans (softens the exact pressure money must create).
- **Revisit**: if playtests show unrecoverable death spirals that aren't the player's
  strategic fault.

## 10. [A] Segment axes V1 — exactly price/quality/brand; convenience/trend/health/luxury reserved in schema
- **Reason**: three axes already produce distinct zone strategies; each extra axis
  multiplies the balance surface pre-fun-proof.
- **Revisit**: after slice fun-test passes; trend is the likely first addition (creates
  late-game windows).

## 11. [A] Spatial model — straight-line distance + zone membership + static store traffic; pathfinding presentation-only
- **Reason**: smallest model where "where" matters (3 numbers); no economic pathfinding
  burden or sync risk.
- **Revisit**: only if map play feels flat — prefer authored map variety over deeper sim.

## 12. [A] Market Research in slice — minimal Analyst (one reveal skill), Should-Have
- **Reason**: the three-tier info model is core identity (consistency-pass fix — an earlier
  draft deferred research entirely, contradicting the information pillar); one reveal skill
  proves it at minimal cost.
- **Revisit**: promote to Must-Have if hidden info confuses playtesters without it.

## 13. [A] Slice category = beverage; salary/cost numbers; awareness decay −10%/round; fatigue −20%/repeat; spill 50%; walker cap 60; N-per-walker zoom-tuned
- **Reason**: concrete tuning seeds required for docs/prototype math to be testable; all
  flagged as seeds, not commitments.
- **Revisit**: continuously in playtest; the numbers are knobs by design.
