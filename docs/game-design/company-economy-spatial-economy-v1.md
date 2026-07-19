# Company Economy — Spatial Economy v1

How space works, as implemented in `src/core/data/city-v1.js` + `src/core/systems.js`.

## Distance model

One deterministic metric — Manhattan tile distance — consumed by **three separate systems
that must never merge into one modifier**:

| Edge | Used by | Effect |
|---|---|---|
| Consumer → Store | CONSUME | convenience penalty `distance × distSens` inside utility; hard travel radius per profile (residents 10–11, tourists 6) |
| HQ → Store | SELL-IN (sales) | account load: stores beyond 9 tiles cost 1.5× sales account capacity — deep local vs stretched coverage |
| HQ → Store | SELL-IN (logistics) | range gate (`logistics.range`) + shipment cost `5 + 0.8/tile × cost_mult` |
| (future) Warehouse → Store | reserved | same three seams; adding warehouses = new origin points, no core rewrite |

## Company location (round-1 decision)

Four exclusive plots (setup + rent vs geometry) — see master foundation §3. Design rule:
**no hidden location bonuses**; value must be derivable from the map. Measured: near-HQ
beats identical far-HQ 3/4 seeds, far wins 1/4 (product/marketing can out-play location).

## Residential population

- **House** = 3 real residents, mix 67% budget / 33% mainstream → the west is a
  volume-and-price market (18 agents in 6 houses).
- **Condo** = 6–8 residents, mix 20% budget / 55% mainstream / 25% premium → central is
  the mixed battleground where mainstream anchors and premium niches coexist (21 agents).
- No family/daily-life simulation: agents exist economically (home, prefs, need cycle) and
  visually (walk events), nothing else.

## Hotel / tourist market

Hotels spawn **fresh tourist agents every round** (rotation = demand refresh, no loyalty
accumulation):

| Hotel | Spawns | Behavior |
|---|---|---|
| Budget hotel | 5 budget tourists | price-first (wPrice 0.52), bulk qty 3, radius 6 — a cheap-product volume opportunity next to the east stores |
| Premium hotel | 5 premium tourists | quality/brand-first (wQuality 0.45), qty 1, high spend at the mall — a margin opportunity |

Not a demand multiplier: each tourist is an agent whose purchases are individually logged.
Verified: economy stock at Beach Mart sells in bulk to budget tourists; premium at the
Grand Arcade sells to premium tourists (tests 13–14).

## Store catchment

A store's market = **the actual agents within their own travel radius of it** — never a
static assignment. One agent can reach several stores and chooses per round by utility
(distance is one term, not a lock: test 10 shows a brand+price advantage pulling a
consumer past a nearer store). `estimateDemand` — used by store shelf decisions — walks
the same catchment with the same utility math, so store expectations and consumer behavior
stay consistent by construction.

## Visual binding

Every spatial entity has a stable sim ID; the Three.js debug viewer renders buildings,
stores, HQs, and purchase walkers from `GameState` + `PurchaseEvent`s
(`consumerId/from/storeId`) — animation timing never affects outcomes.
