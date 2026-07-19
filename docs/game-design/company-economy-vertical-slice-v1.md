# Company Economy — Vertical Slice v1 (First Playable)

Goal: **prove the core loop is fun** — two humans finish a game in 30–60 minutes and can
articulate *why the winner won* mostly from the map. Nothing enters this slice that doesn't
serve that test.

## Exact scope

| Axis | Slice value |
|---|---|
| Players | 2 companies, hot-seat (shared screen; simultaneous-resolution architecture identical to online) |
| Map | 1 small city: road grid, 3 zones, 8 stores, 2 offices |
| Zones | Budget Residential (70/20/10), Mixed District (20/50/30), Affluent Uptown (10/30/60) |
| Stores | 5 convenience (shelf 2–3), 2 supermarket (shelf 3–4), 1 mall shop (shelf 2) |
| Product | 1 category (beverage); max 2 SKUs per company; positions Economy / Mainstream / Premium |
| Roles | President, HR, Manager, Marketing, Sales, Logistics + minimal Market Research (Analyst) |
| Skills | 1–3 per role, ~14 total; rank cap 2 |
| Rounds | target 8–12 to reach $X (tune X in playtest); final-round rule active |
| Session | 30–60 minutes including learning |

## Must Have (the fun-proof core)

- Full phase cycle `PLAN → POSITION → MARKET → SELL-IN → CONSUME → FINANCE` with
  simultaneous planning + deterministic resolution + rotating initiative
- Hiring/training with capability unlocks (verbs, not bonuses) + org capacity constraints
- 3-factor Store Score with hysteresis ×1.15 and per-offer breakdown UI (explainability)
- Additive-utility demand model + softmax share + stock-capped fulfillment
- Awareness/familiarity/relationship ledgers with decay (first-to-market feel)
- Marketing: local campaign + price promotion with saturation/decay/fatigue
- Logistics: capacity/range/cost + store stock + stockout consequences
- Finance line + insolvency auto-downsize rule
- Victory: cumulative revenue trigger + one full final round + tie-breakers
- Map view with representative walkers (cap ~60) + store busyness — market readable from
  the sidewalk

## Should Have (add if the core lands quickly)

- Minimal Analyst role: 1 skill (`research.zone_visibility` — exact zone demand/segment
  numbers; without it players see qualitative bands only). Included because the three-tier
  information model is core identity; minimal because one reveal already proves it.
- Brand campaign (slow durable ledger) as the third campaign type
- Awareness heatmap overlay; store tooltip with last-round units
- `logistics.reliability` late-delivery events (else: deliveries always succeed in slice)

## Not Yet (deliberately excluded — revisit only after the fun test passes)

- Online networking/backend/DB (architecture is ready; wiring is not this slice)
- 3rd/4th company, AI opponents
- More categories/SKUs, warehouses/production/inventory chains
- Rank 3, promotions, employee experience curves, department efficiency math
- Segment axes beyond price/quality/brand; seasonal shifts; zone development
- Debt/loans/valuation victory variant; mobile layout; audio; animation pipeline;
  procedural city; monetization — all out

## Success criteria (measured in playtest)

1. Both players make ≥3 genuinely different org/skill decisions per game.
2. At least one shelf flip and one successful shelf defense happen per game.
3. The loser can state the winning strategy without opening the finance panel.
4. No dominant opener across 5 consecutive playtests (track opener win rate).
5. Round time ≤5 minutes by round 3.
