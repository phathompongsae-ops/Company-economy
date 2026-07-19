# Company Economy — Consumer Model v1

Real consumer agents, as implemented in `src/core/systems.js` (`resolveConsumers`,
`productUtility`) and `src/core/data/city-v1.js` (`PROFILES`, `BUILDING_MIX`).

## Agent

```
Consumer { id, homeBuildingId, profileId, tourist, x, y }
Profile  { wPrice, wQuality, wBrand, distSens, idealPrice, maxTravel, needChance, qty }
```

Five profiles: budget/mainstream/premium residents + budget/premium tourists. ~39 resident
agents (persistent) + 10 tourist agents (rotate per round). Kept to exactly four preference
axes (price / quality / brand / distance) — more axes multiply tuning surface before the
loop is proven.

## Purchase decision (discrete, per round — never per frame)

```
Need trigger (seeded by needChance)
→ candidate set = every (store within maxTravel, shelf slot with stock)
→ utility per candidate:
     U = wPrice·priceFit + wQuality·qualityFit + wBrand·brand − distance·distSens + ε
     priceFit  = 1 − |price − idealPrice| / (idealPrice × 1.2)   (clamped ≥ 0)
     qualityFit = position quality / 100
     brand      = (awareness[homeDistrict]/100) × (0.6 + 0.4 × familiarity/100)
     ε          = seeded noise ±0.04 (determinism preserved per seed)
→ best candidate if U > 0.30 buys qty (capped by stock); otherwise NoPurchase (logged)
```

Design properties:
- **Additive, not multiplicative** — a new brand with zero awareness can still win on
  price/quality fit (no cold-start death); every term is a visible tuning knob.
- **Distance shapes, never dictates** — nearest-store-wins is impossible by construction;
  verified numerically in test 10.
- **Positioning is soft** — a budget agent facing only premium products may still buy
  when fit/brand/need line up; utility is just naturally lower (no hard segment walls).
- Aggregate CPU cost: ~50 agents × ≤ ~15 candidates, once per round — trivial, and safe
  for lockstep multiplayer because it is fully deterministic.

## Explainability (required behavior, implemented)

Every choice logs a structured breakdown to `state.debugLog`:

```
ConsumerChoice { consumerId, profile, chosen: { storeId, productId, dist,
                 priceFit, qualityFit, brand, distPenalty, noise, total },
                 alternatives: top-3 with totals }
NoPurchase     { consumerId, best (same breakdown) | null }
```

"Why did consumer C choose store B?" is answered by reading one log entry. The same
utility function powers store demand estimates (`estimateDemand`), so "why did the store
expect X units?" reduces to the same explanation.

## Visual contract

`PurchaseEvent { consumerId, from, storeId, companyId, productId, qty, revenue }` — the
renderer walks the real agent from their real home to the real store they chose. Economy
resolves first; presentation replays it; deleting all visuals changes nothing economically.
