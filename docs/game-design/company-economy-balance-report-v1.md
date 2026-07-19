# Company Economy — Balance Report v1 (real prototype runs)

All numbers from actual headless runs at the committed tuning (`roles-v1.js` TUNING).
Reproduce: `npm run simulate -- --league --matches 3` (seeds are fixed per pairing).

## Scenario league (round-robin, 3 seeds per pairing, 27 games per scenario)

| Scenario | Win rate | Reading |
|---|---|---|
| balanced (mainstream + sales/marketing/logistics hires) | 93% | strongest **script**, see caveat below |
| sales_rush | 74% | early shelf grab monetizes fast |
| economy (cheap @8, west volume) | 67% | volume strategy healthy |
| hr_growth | 56% | capacity pays off mid-game, salary drag early |
| marketing_heavy | 52% | awareness converts, fatigue caps it |
| premium (@24, east/central) | 48% | viable niche — margin offsets small audience |
| ftm_rush | 48% | early presence decays without follow-through |
| location_advantage | 37% | location alone isn't a strategy |
| tourist_focus | 15% | pool too narrow as scripted — needs 2nd SKU (backlog) |
| price_dumping (@7 floor) | 11% | sells volume, earns nothing — intended downside |

**Caveat (honest):** the league conflates *policy script quality* with *strategy
strength* — `balanced` plays the most complete script (hires + campaigns + full ops), so
its 93% overstates "mainstream+central" as a strategy. Matched-sophistication policies are
the top tuning backlog item before reading these rates as game balance.

## Structural head-to-heads (the design-critical results)

| Matchup (4 seeds) | Result | Requirement verified |
|---|---|---|
| location_advantage vs location_far (identical policy) | 3–1 | location matters, **not** auto-win |
| premium vs price_dumping | 4–0 | dumping loses to margin play |
| economy vs balanced | 1–3 | counterplay exists both directions |

## Findings

1. **The spatial economy works**: west volume (economy) vs central coverage (balanced) vs
   east margin (premium) are genuinely different games on the same map.
2. **Dumping teeth confirmed**: floor-price margin (6×0.75−3 = 1.5/unit) cannot carry
   salaries — matches the "core cost scales with core benefit" guardrail.
3. **Incumbency is breakable**: shelf-flip test passes; ShelfWon/Dropped events occur in
   league games (first-to-market contestable in practice, not just in unit tests).
4. **Tourist niche under-served**: budget tourists (15 cheap units/round of latent demand
   in the east) are rarely served because no scripted policy ships economy product east —
   a real strategic opportunity the scripts don't exploit; revisit with better policies
   before touching tuning.
5. **Insolvency rule bites correctly**: over-hiring scripts (early sales_rush drafts) shed
   staff instead of death-spiraling.

## Tuning changes made during this pass (all committed)

- Salaries: operations roles 40→45 (multi-hire overhead), HR 40→35, analyst 35→30.
- Unit costs: economy 4→3, mainstream 7→5, premium 12→9 (margins were unlivable).
- Consumers: budget qty 1→2 (bulk cheap buying), need chances +5pp, budget tourists
  qty 2→3, hotels 4→5 tourists/round.
- buyThreshold 0.34→0.30; revenue target 3000→2400 (game length 8–14 rounds).

## Top balance risks going forward

1. Script-quality bias in league numbers (fix policies first).
2. `balanced`-style full-coverage play may still be dominant with matched scripts —
   watch salary/rent pressure at central.
3. Tourist/east economy is an unexploited pocket — good design if reachable, dead content
   if not; needs a policy probe.
4. Relationship growth (+6..+13/round) may saturate too fast at cap 100 — recheck when
   games lengthen.
5. Softmax-free argmax choice (best-candidate) can make small utility edges too decisive
   at scale; revisit share-splitting if store monocultures appear.
