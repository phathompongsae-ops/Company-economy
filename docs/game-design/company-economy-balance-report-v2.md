# Company Economy — Balance Report v2 (Full Playable Game v1)

Method: `src/sim/lab.js` runs full bot matches through the EXACT interactive pipeline the
UI uses (beginPlanningPhase → per-company bot turns via applyAction → resolveRound).
All numbers below are from the final tuned build (deterministic seeds; reproducible with
`node src/sim/lab.js --all --seeds 20`).

## 1. Simulations executed

- Tuning loop batches: ~220–330 matches per iteration across ~8 iterations during
  development (≈2,000 matches total while tuning).
- **Final validation batch: 440 matches** — 2-company full matrix both seat orders
  (240), same-archetype mirrors (40), 3-company combos (80), 4-company mixed+rotated
  seats (80). Runtime ≈ 6s (headless).

## 2. Final archetype outcomes (440-match batch)

Overall win rates (games ≠ equal because suites weight archetypes differently):

| archetype | overall | 2-company | 3-company | 4-company | avg revenue | avg end cash |
|---|---|---|---|---|---|---|
| Balanced Operator | 0.50 | 0.65 | 0.68 | 0.15 | 1632 | 35 |
| Price Leader | 0.27 | 0.18 | 0.17 | **0.40** | 1613 | 21 |
| Brand Builder | 0.44 | 0.63 | 0.43 | 0.16 | 1818 | 101 |
| Retail Expansion | 0.36 | **0.54** | 0.05 | 0.25 | 1722 | 201 |

Mirrors: 0.50 by construction (seat/initiative fairness confirmed — no first-seat bias).

Reading: **no archetype auto-wins, none is dead, and strength is situational by player
count** — volume pricing peaks when demand splits four ways; shelf-width peaks with only
one rival; premium/brand needs its niche uncontested; balanced is the generalist. This
matches the design goal (counterplay > forced 25/25/25/25).

## 3. Cash / anti-inflation findings

| metric | 2-co | mirrors | 3-co | 4-co | threshold |
|---|---|---|---|---|---|
| median end cash (start 1300) | 77 | −9 | 11 | −14 | < 3250 |
| max end cash | 662 | 360 | 777 | 524 | < 7800 |
| late-game cash growth /round | −3 | 12 | 13 | 5 | < 220 |

Zero inflation warnings in any suite. Money is consumed by real tradeoffs to the end;
late-game "buy everything" never appears. Guarded permanently by automated test 38.

Additional health: bot action rejection rate 1.2% (bots plan within their real budgets);
no-purchase rate 27–57% (unmet demand exists at every player count — market reading and
positioning keep mattering); avg HHI 0.48 (no monopoly collapse).

## 4. Game length

avgRounds 13.4–13.9 — most bot matches run to the round cap (14) with the revenue target
reached in stronger runs. Human pace estimate: 2–4 min planning + ~20 s selling + summary
per round ⇒ **~40–70 min per match**, inside the 30–75 min target. Speeds x2/x4 and Skip
compress the selling phase without touching results.

## 5. Dominant strategies checked

- **Price dumping**: floor price margin is thin (test 15) and dumping loses the
  head-to-head majority. The price_leader bot itself refuses sub-1.5×-COGS margins.
- **Marketing spam**: fatigue (−20%/consecutive), decay (10%/round), and cash reserve
  make blanket campaigning self-defeating; campaigns only compound where shelf presence
  exists.
- **HR-first**: not mandatory (test 4) and the bots almost never open HR.
- **Central plot**: contested and rejected as auto-win by test 2/3; bots choose 4
  different plots by archetype weights in the observer match.
- **First-to-market**: incumbency decays without upkeep (tests 5/16); 13% of matches are
  comebacks; leads persist only while defended.

## 6. Tuning changes made this package (with reasons)

Core economy:
1. **COGS became a real cash cost** (was ledger-only — found by the new cash-conservation
   test). This is the biggest economic correctness fix in the package.
2. Rebalanced for it: startingCash 1000→1300 (working capital); unitCost 3/5/9→2/3/6;
   economy price floor 6→5 (dumping stays possible AND stays thin).

Bot-side (behavior, not rules): payroll gate tied to revenue-or-capital, emergency cash
brake, poverty-trap escape shipment, per-shipment working-capital projection, margin
floor scaled by unit cost, campaign focus on shelf-presence districts, round-1 planning
from the planned HQ position (bots previously wasted round 1 — fixed).

## 7. Limitations

- Bot-vs-bot evidence only for the batch numbers; human-vs-bot evidence is from scripted
  UI playthroughs (bot won both full-match runs vs a simple scripted human line).
- 14-round cap means "time to victory target" is right-censored in many matches; if human
  play proves faster than bots, the target/cap may want a small tune.
- Seeds are fixed sets; different seed families shift point estimates by a few percent
  (observed across tuning iterations) without changing the ordering conclusions.
