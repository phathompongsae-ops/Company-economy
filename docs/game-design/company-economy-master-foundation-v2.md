# Company Economy — Master Game Foundation v2

**Source of truth (supersedes v1).** The v2 revision implements the corrected vision:
the map is a **strategic board**, consumers are **real economic agents with homes**, and the
visible city IS the economy — not decoration, not a spreadsheet with fake walkers.

Companion documents (all part of the v2 set):
- `company-economy-spatial-economy-v1.md` — locations, distances, catchment, population, tourists
- `company-economy-consumer-model-v1.md` — consumer agents & purchase decision model
- `company-economy-simulation-v1.md` — implemented simulation architecture + how to run
- `company-economy-balance-report-v1.md` — real scenario-league results from the prototype
- `company-economy-decision-log.md` — decisions incl. the v1→v2 correction
- `company-economy-data-model-v1.md` — schemas (v2 notes inline where the model moved)

## What changed from v1 (the vision correction)

| Topic | v1 (superseded) | v2 (authoritative, implemented) |
|---|---|---|
| Consumers | aggregate zone pools; walkers were display-only fakes | **20–60 real consumer agents** with `home_building_id`, preferences, store access; every purchase is one agent's logged decision |
| Map | 3 abstract zones + 3 spatial numbers | authored city board: houses/condos/hotels/stores/HQ plots with authoritative tile positions; distance drives consumers, sales, and logistics **separately** |
| Company start | company exists, no placement | **round-1 HQ location choice** among tradeoff plots — a real strategic opener |
| Hotels/tourists | absent | hotels spawn **rotating tourist agents** (budget vs premium behavior) every round |
| Visual walkers | representation only, hard cap | visuals bind to **real consumer IDs and real purchase events** (`c_021 walked from condo-1 to store-cc1 and bought`), timing never decides outcomes |

Still true from v1 (revalidated, unchanged in spirit): design pillars, verbs-not-bonuses
organization, data-driven Modifier skills, Store Score with incumbent inertia, decaying
first-to-market ledgers, marketing saturation/fatigue/decay, hybrid simultaneous turn
structure, revenue-target victory with final-round equalizer, cash-only finance,
multiplayer-ready command/resolver/event architecture, non-goals list.

## 1. Vision

> You are the president of a small company in a small living city. Choose where to plant
> your HQ, build the organization that can win the streets around it, and out-position
> rival presidents for finite shelves and the real people who walk past them.

The heart: **Organization Strategy + Spatial Market Strategy + Consumer Analysis +
Competitive Retail Access + Business Growth.** Not an idle game, clicker, factory sim,
full city builder, stock sim, RTS, spreadsheet-only economy, or any clone.

## 2. The city is the board (implemented)

- Authored 20×18 tile city, `src/core/data/city-v1.js`: 6 houses (3 residents each),
  3 condos (6–8 residents), 2 hotels (5 rotating tourists each/round), 7 stores
  (4 convenience / 2 supermarkets / 1 mall), 4 HQ plots, 3 districts (west residential /
  central / hotel east).
- **All positions are simulation-authoritative data** — the headless sim runs the entire
  economy with zero Three.js. The debug viewer (`three/debug-viewer.html`) renders the same
  state and steps the same rounds; every mesh carries `userData.simId`.
- Distance metric: Manhattan tile distance (deterministic road-distance stand-in; real road
  graph is a future swap behind the same `dist()` seam).

## 3. Company location — the first strategic decision (implemented)

`ChooseCompanyLocation` (round 1, one plot per company, plots are exclusive):

| Plot | Setup | Rent/round | Character |
|---|---|---|---|
| Central Office | 150 | 25 | close to condos + supermarkets; expensive |
| Commercial East | 100 | 18 | premium/tourist play, mall access |
| Outer West | 40 | 8 | cheap; owns the budget west; far from east |
| South Edge | 60 | 10 | cheap-ish; supermarket logistics reach |

Location value comes **only from geometry + cost** (no hidden bonuses). Measured result
(balance report): identical policies from Central vs Outer-West → near wins 3/4 seeds,
far still wins 1/4 — advantage without auto-win, as required.

## 4. Population & consumers (implemented — see consumer-model doc)

Real agents: ~39 residents (houses skew budget 67/33; condos mix 20/55/25 budget/
mainstream/premium) + 10 tourists/round from hotels. Each agent: id, home building,
profile (4 preference axes: price / quality / brand / distance sensitivity), travel radius,
need cycle, quantity habits. Purchases resolve per agent in the CONSUME phase with a full
logged breakdown; tourists are real agents that rotate each round (budget tourists
bulk-buy cheap near the hotel; premium tourists buy high-margin at the mall).

## 5. Organization / skills (implemented, carried from v1)

President baseline verbs (1 recruit, 1 pitch, 2 shipments, range 10…) mean **no role is a
mandatory opener**; HR/Manager/Marketing/Sales/Logistics/Analyst each unlock capability
keys via the Modifier system (`src/core/data/roles-v1.js`, folded by
`src/core/capabilities.js`). 12 skills shipped (1–3 per role). Verified in tests: hiring
works with zero HR; extra hires need HR; campaigns require Marketing; pitch/shipment slots
are hard caps with explained rejections.

## 6. Stores & shelves (implemented)

Shelf capacity 2–3 per store. Store Score v1 (per offer, fully logged):
`expectedUnits × margin × (1 + relationship/200) × (0.7 + 0.3·reliability) + historyBonus`
— where `expectedUnits` walks the store's **real catchment agents** with the same utility
math consumers use (store expectations can never drift from actual behavior). Incumbent
inertia ×1.15; initiative rotation breaks exact ties; capacity never exceeded (tested).

## 7. Marketing / Sales / Logistics (implemented)

- **Marketing** (requires the role): district campaigns → awareness ledger only; saturation
  cap 100, −10%/round decay, −20% per consecutive-repeat fatigue (tested: strictly
  diminishing). Awareness reaches consumers through their home district — area/segment fit
  is inherent (west campaigns don't reach hotel tourists).
- **Sales**: pitch slots + account capacity; far stores consume 1.5 account load (HQ
  distance matters for sales separately from logistics); relationships grow when assigned,
  decay when not, cap at 100. Sales cannot create demand — it only opens shelves; the
  agents still decide with their own preferences (tested: premium@30 pitched into the
  budget west scores below mainstream and loses).
- **Logistics**: shipment slots, range gate from HQ, cost = base + per-tile, reliability
  (seeded failures dent relationships), stock on shelf sells down; stockout = lost sales.
  8-store coverage with 5 shipment slots forces priority choices (tested bottleneck).

## 8. Turn structure & multiplayer (implemented shape)

Hybrid: **simultaneous plan submission → deterministic phased resolution**
(`PLAN → MARKET → SELL-IN → CONSUME → FINANCE`), initiative token rotates each round and is
the only tie-breaker; no first-click/submit-order/network-latency effects anywhere
(contested shelf test is deterministic). GameState is fully serializable; commands
validate-with-reasons; event log carries visual events (`PurchaseEvent, DeliveryEvent,
CampaignVisualEvent, ShelfWon/Dropped…`) — the future server wraps `playRound` unchanged.

## 9. Finance & victory (implemented)

Cash only; every round books revenue (company keeps 75% of retail; store margin 25%),
COGS, logistics, salaries, rent — all in explainable Finance events. Insolvency =
unpaid employees leave. Victory: first to **2,400 cumulative revenue** triggers one full
final round for everyone; tie-breakers cash → units sold → initiative. Cap 14 rounds.

## 10. Anti-snowball & first-to-market (implemented, carried from v1)

Awareness/familiarity/relationship ledgers all decay; shelf inertia is the only incumbency
shield and is finite (tested: a decayed premium incumbent loses the west slot to a
better-fit economy challenger). Salary overhead scales with org size; campaign fatigue
punishes repetition; price floors keep dumping margins thin (tested: dumping loses the
head-to-head majority while still selling volume).

## 11. Vertical slice status

The prototype implements the full loop end-to-end (location → org → position/price →
marketing → pitches → logistics → agent purchases → finance → reinvest → victory) as a
**headless playable simulation** with 11 scripted strategy scenarios and a Three.js debug
viewer. What it is not yet: an interactive human UI (planned next phase — see final
report's recommended next task).

## 12. Consistency review v2 (all verified against the running prototype)

Map/location/distance meaningful (tests 2–3, 10–11) ✔ · house/condo/hotel populations real
(tests 12–14) ✔ · consumer agents in the economy with light AI (discrete per-round choice,
no per-frame think) ✔ · catchment meaningful (test 11) ✔ · sales≠marketing separation
(campaign slots vs pitch slots; sales opens shelves, marketing moves awareness) ✔ ·
sales can't create demand (test 8) ✔ · logistics bottleneck (test 17) ✔ · first-mover
contestable (test 16) ✔ · HR not mandatory (test 4) ✔ · dumping not dominant (test 15) ✔ ·
premium viable / economy viable (league: 48% / 67%) ✔ · location not auto-win (test 2) ✔ ·
Three.js fully separated (all 19 tests + league run headless) ✔ · multiplayer-ready
(determinism test 1; command/event model) ✔
