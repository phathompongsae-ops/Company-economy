# Company Economy — Core Design Foundation v1

Phase 0 source of truth. Working title: **Company Economy** — a 2.5D pixel-art business
strategy / company-builder for 2–4 players (online-ready), inspired at the *systems* level by
economic engine games (incl. Food Chain Magnate) but **not a clone**: no copied mechanics,
names, or specific structures — the differentiators here are the org-skill build system, the
natural first-to-market model (no permanent milestones), and the visible-customer map.

Status: design only. No engine code, no assets, no networking in this phase.

---

## 1. Core Game Loop

Each **round** (one in-game quarter), every player runs their company through the same phase
cycle:

```
PLAN (hire/train/structure) → POSITION (research/price/product) → MARKET (campaigns)
→ SELL-IN (pitch stores, logistics) → CONSUME (customers buy — the visible phase)
→ FINANCE (revenue, salaries, costs, profit) → next round
```

The engine the player is really building is **organizational capability**: employees unlock
verbs; verbs move product; product on shelves meets demand; demand converts to revenue;
revenue funds a bigger org. Competition is for **finite shelf space and finite consumer
demand**, so every gain is contested.

## 2. Player Fantasy

You are the **President** of a startup company in a small city. At the start you can barely
do anything: no marketing reach, one delivery route, no market data. Every hire visibly
changes what your company *can do* — and on the map you literally watch your product travel
to stores and customers walk in and buy it (or walk into your competitor's aisle instead).

## 3. Organization System

- A company is a set of **Employees** arranged in a reporting structure (DAG-ish tree:
  every employee except the President has exactly one manager).
- The structure is **data, not hardcoded**: any shape is legal if it satisfies capability
  constraints, all of which come from the effect system (§5):
  - `org.employee_capacity` — total headcount cap (raised by HR/Manager skills)
  - `<employee>.subordinate_capacity` — how many directs a given employee can manage
  - `org.max_rank_unlocked` — highest hireable rank (raised by HR)
- **Roles are not passive bonuses — each role unlocks company verbs**:

| Role | Unlocks (capability keys, examples) |
|---|---|
| President | baseline: 1 pitch/round, 1 shipment/round, local pricing |
| HR | `hr.recruit_slots`, `hr.hiring_cost_mult`, `org.max_rank_unlocked` |
| Manager | `manager.subordinate_capacity`, `org.employee_capacity`, late: `org.automation.*` |
| Marketing | `marketing.campaign_slots`, `marketing.area_awareness_mult`, segment targeting |
| Sales | `sales.pitch_slots`, `sales.store_capacity`, `sales.relationship_gain_mult` |
| Logistics | `logistics.delivery_range`, `logistics.shipment_slots`, `logistics.cost_mult`, `logistics.reliability` |
| Market Research | `research.zone_visibility`, `research.demand_forecast`, `research.competitor_report` |

- Without the role, the verb simply does not exist (e.g., no Market Research → zone demand
  numbers are hidden; you see only the visual map).
- New roles later = new capability keys + skills; no resolver rewrites.

## 4. Hiring & Employee Hierarchy

- Hiring consumes an **HR recruit slot** (President alone has 1/round) and cash
  (`hiringCost × hr.hiring_cost_mult`), and requires: open headcount, a manager with free
  subordinate capacity, and rank ≤ `org.max_rank_unlocked`.
- Every employee has a recurring **salary** (Finance phase) — headcount is the core overhead
  pressure that punishes bloated orgs.
- **Rank** (1–3 in V1): higher rank → higher salary/hiring cost, more **skill slots**, higher
  skill level caps. Promotion = training cost + HR capability, keeps the person and their
  skills.
- Firing: allowed, small severance cost, subordinates re-attach to the fired employee's
  manager (no orphan micro-management).

## 5. Employee Skill Framework

Schema-first; V1 ships 1–3 skills per role (§17 slice). All effects are **data-driven
modifiers** — no `if employee == marketing_level_3` logic anywhere.

```jsonc
Skill {
  id: "mkt.local_area_focus",
  role: "marketing",            // which role may learn it
  category: "area",             // grouping for UI/build identity
  maxLevel: 3,
  minRank: 1,                   // employee rank gate
  costPerLevel: [40, 80, 160],  // training cost (cash + a PLAN action)
  prereq: ["mkt.basics:1"],     // skillId:level pairs
  effects: [                    // applied per level
    { key: "marketing.area_awareness_mult", op: "add", valuePerLevel: 0.15, scope: "zone-targeted" },
    { key: "marketing.campaign_cost_mult", op: "add", valuePerLevel: -0.05 }
  ]
}
```

- `op` ∈ `add` | `mult` | `unlock` (unlock grants a verb/flag, e.g. digital campaigns).
- A **CapabilityResolver** folds President baseline + every employee's role/rank/skills into
  one flat `CompanyCapabilities` sheet each round; resolvers read only that sheet. This is
  the single seam that makes roles/skills extensible.
- **Specialized builds** emerge from slot scarcity: a rank-2 Marketing employee has 3 slots —
  filling them from `brand.*` vs `promo.*` vs `area.*` categories yields a Brand
  Specialist / Price-Promotion Specialist / Local-Area Specialist with genuinely different
  company capabilities. Slots are always scarcer than skills.

## 6. Product System

- V1: **one category** (bottled drinks), each company sells 1–2 SKUs.
- A Product = `position` + `price` + `quality` + accumulated `brand` (per zone, from §12):

| Position | Base cost/unit | Quality band | Natural audience |
|---|---|---|---|
| Economy | low | low | price-sensitive |
| Mainstream | mid | mid | mainstream |
| Premium | high | high | premium |

- Player decisions each round: which SKU(s) to produce, **wholesale price** (to stores) and
  **suggested retail price**, which zones/stores to push (via Sales/Logistics).
- Position is chosen at SKU creation; repositioning = a re-launch (costly), so the choice is
  strategic, not a dial.
- Mismatch is punished by the demand model, not by rules: Premium@100 in a Budget zone
  scores terribly on price sensitivity; Economy@35 scores well — unless a competitor sells
  at 30 with higher awareness (§13 utility math decides).

## 7. Consumer Segment Model (Minimal Viable)

**Three segments** (Budget / Mainstream / Premium) × **three preference weights** each:

```
Segment { priceSensitivity, qualityPreference, brandAffinity }   // weights sum to 1
```

- Deliberately minimal: loyalty, trend, health, convenience, luxury are all *deferred*
  attributes — the schema (§17) reserves the field, V1 does not use them. Rationale: three
  weights already produce distinct zone strategies and readable outcomes; more axes multiply
  balance surface before the loop is proven.
- Each **zone** holds a segment mix + a base demand pool (units/round) for the category:

| Zone (V1) | Budget | Mainstream | Premium |
|---|---|---|---|
| Budget Residential | 70% | 20% | 10% |
| Business District | 20% | 50% | 30% |
| Uptown | 10% | 30% | 60% |

## 8. Store & Shelf Competition

- Stores are placed in zones; each has a **shelf capacity for the category (2–4 brand
  slots)** and a store type (convenience / supermarket / mall — differing capacity, traffic
  multiplier, and margin expectations).
- Getting on a shelf requires a **pitch** (a Sales verb) plus the ability to actually
  deliver (Logistics range/slots).
- **Store decision is deterministic economics, never pure RNG.** Each round, for the offers
  it holds (incumbents + new pitches), the store scores:

```
storeScore = expectedUnits(product, zone)        // from the shared demand model (§13)
           × unitMargin(retail − wholesale)
           × relationshipMult(company, store)     // grown by Sales history, capped
           + promoSupport                         // this round's committed support
```

- Keep the top `shelfCapacity` offers, **but an incumbent is only replaced when the
  challenger beats it by a hysteresis threshold** (`challengerScore > incumbentScore × 1.15`
  in V1) — stores don't churn shelves for marginal wins, which both feels real and gives
  first-movers their natural (but breakable) edge.
- All inputs are player-influenceable: demand (marketing), margin (wholesale deal), promo
  support, relationship (sales assignment over time) — exactly the §4-of-the-brief levers.

## 9. Marketing System

Campaign = `{ type, target, spend, duration }`, consuming `marketing.campaign_slots`.

| Type (V1) | Target | Effect |
|---|---|---|
| Local promotion | zone | short awareness burst + price-perception bonus |
| Billboard | zone | slow, durable awareness |
| Brand campaign | company-wide | brand affinity gain, expensive |
| Discount campaign | product+zone | temporary effective-price cut without repricing |
| Digital campaign (unlock) | segment across zones | targeted preference shift |

- Effects land on the **(company, zone) awareness/preference ledgers** used by demand math —
  never directly on sales numbers.
- **Diminishing returns**: awareness gain per spend follows a saturating curve
  (`gain = k × spend / (spend + s0)`) and awareness itself caps at 100 per zone;
  **decay** each round (−10% toward baseline) means dominance must be maintained, and
  competitor campaigns push shared attention share (softmax over awareness) — every
  campaign is implicitly counterable.

## 10. Sales System

- Sales employees hold `sales.store_capacity` (how many stores serviced) and
  `sales.pitch_slots` (new-shelf attempts/round).
- An **assigned** store accrues relationship (+ per round, skill-scaled, capped) which
  multiplies store scoring (§8) and unlocks better wholesale terms; unassigned relationships
  decay. Big sales teams = wide coverage but heavy salary overhead (§18).
- Pitch resolution happens simultaneously for all companies in the SELL-IN phase, resolved
  by the deterministic store score with **initiative rotation** breaking exact ties (§14).

## 11. Logistics

- A shipment moves units from company warehouse to a store: consumes `shipment_slots`,
  costs `distance × logistics.cost_mult`, must be within `delivery_range` of the
  warehouse/office.
- `logistics.reliability` (0–1): under-invested logistics occasionally delivers late
  (seeded, deterministic per state hash — not per-player dice), causing empty shelf =
  lost sales + relationship damage. Reliability skills remove this risk.
- Shelf presence requires **stock**: winning a shelf then failing to supply it is the
  natural counter to over-extended distribution.

## 12. First-to-Market System (no milestones)

There are **no permanent first-achiever bonuses**. Being first pays through the natural
state ledgers, all of which decay or can be out-competed:

- **Awareness** (company×zone): first marketer accrues early, but decays and saturates.
- **Familiarity** (company×zone): grows from actual purchases; newer entrants grow it faster
  per sale when the category is already educated (the pioneer paid the education cost).
- **Shelf incumbency**: hysteresis (§8) protects the sitting brand — until a challenger's
  economics beat it by the threshold.
- **Relationships**: accrue with time but cap and decay when unattended.

Every advantage is therefore a *stock that leaks*: price, quality, marketing, distribution,
sales relationships, and promo support are all sufficient levers to displace an incumbent.
This replaces milestone snowballs with contestable momentum.

## 13. Economic Simulation (demand → sales)

Aggregated, deterministic, per zone per round:

1. **Zone demand pool**: `baseDemand × seasonMult × (1 + categoryAwarenessBonus)` — marketing
   grows the pie a little, not just share.
2. **Availability**: only products actually stocked on that zone's shelves compete.
3. **Utility per segment × product**:
   `U = wPrice × priceScore(price vs segment budget) + wQuality × qualityScore + wBrand × (awareness × familiarity)`
   (+ small position–segment match term).
4. **Share allocation**: softmax over U within each segment (temperature tuned so clear
   winners take strong-but-not-total share); shares × segment pool = intended units.
5. **Fulfillment**: capped by stock on shelf (logistics!); unmet demand partially spills to
   the next-best available product, partially evaporates.
6. Outputs per store per product: units sold, revenue, stockouts — these feed Finance,
   familiarity, store history, and the **visual customer layer**.

**Visible Customer Simulation** (the signature feature) is *representation, not simulation*:
the renderer receives per-store sales events and spawns **representative agents** —
1 walker per N units (N tuned per zoom, hard cap ~60 concurrent), colored/dressed by
segment, pathing house→store→exit on the road grid, with brand-colored purchase pops.
Market share must be readable from the sidewalk: a busy storefront IS the data. Zero
gameplay reads back from walkers, so performance and multiplayer sync never depend on them.

## 14. Turn / Phase Structure — decision

**Recommendation: simultaneous planning, deterministic phase resolution** (not sequential
turns).

- *For*: no downtime at 2–4 players; hidden simultaneous plans create the poker of
  positioning; maps directly to online (collect command sets → resolve server-side); economic
  engines suffer badly from sequential king-making and turn-order shelf sniping.
- *Against (managed)*: contested actions need fair resolution → all contests resolve by
  deterministic scores; exact ties break by an **initiative token that rotates every round**;
  planning gets a soft timer online.
- Phases per round: `PLAN → POSITION → MARKET → SELL-IN → CONSUME → FINANCE` (§1). Players
  submit all phase commands in one planning window (V1 hot-seat/local: players plan on one
  screen sequentially, resolution stays simultaneous — architecture identical to online).

## 15. Victory Condition — models compared

| Model | Pros | Cons |
|---|---|---|
| A. Cumulative revenue target | readable, race tension, matches "sell more" fantasy | ignores efficiency; can reward reckless spend |
| B. Company valuation at fixed horizon (cash + assets + brand − debt) | rewards healthy business | opaque math, anticlimax, needs tuned horizon |
| C. Market dominance + revenue combo | thematic | multi-criteria confusion in V1 |

**Recommended: Model A with a final-round equalizer** — first company to reach
**$X cumulative revenue** triggers the endgame; the current round completes **plus one full
final round** so every seat gets equal rounds; winner = highest cumulative revenue
(tiebreak: cash on hand). Keeps the race readable, blunts trigger-timing advantage, and
leaves Model B as a documented "long game" variant for later.

## 16. Multiplayer-ready Architecture

```
GameState (pure serializable data)
 ├ CompanyState[] (cash, employees, skills, products, relationships)
 ├ EmployeeState / ProductState / StoreState (shelf slots, stock, history)
 ├ ConsumerZoneState (segment mix, demand pool, awareness/familiarity ledgers)
 └ MarketState (round, phase, initiative, seeded RNG cursor)

Commands (player intents; the ONLY way state changes)
 HireEmployee · TrainEmployee · PromoteEmployee · FireEmployee · SetPrice · CreateSku
 LaunchCampaign · AssignSales · PitchStore · AssignDelivery · EndPlanning

Resolvers (pure functions: (state, commands|phase) → state' + events)
 CapabilityResolver · MarketResearchResolver · MarketingResolver · StoreDecisionResolver
 · ConsumerDemandResolver · SalesResolver · FinanceResolver

Renderer (reads state + events; never writes)
 MapRenderer (iso city) · CharacterRenderer (rep agents §13) · UIRenderer
```

Rules that keep this server-authoritative-ready without networking now:

1. Resolvers are deterministic: same state + same command set ⇒ same result (all randomness
   from the seeded RNG cursor inside GameState).
2. Renderer consumes an **event log**, never computes economy; events are replayable →
   spectating/reconnect for free later.
3. Commands are validated against capabilities *inside* resolvers (server-side later),
   never by the UI alone.
4. GameState is JSON-serializable end-to-end (savegame = network snapshot).

Going online later = wrapping the same command/resolve loop in a server; core economy
unchanged.

## 17. Vertical Slice Scope (first playable)

- 2 companies (hot-seat, shared screen), 1 small city map
- 8 stores (5 convenience / 2 supermarket / 1 mall), 3 consumer zones (§7 table)
- 1 product category, 3 positions (Economy / Mainstream / Premium)
- Roles: President, HR, Manager, Marketing, Sales, Logistics (Market Research deferred to
  slice+1 — V1 shows everyone coarse info; hiding info needs the role to exist first, which
  is a fast follow)
- 1–3 skills per role (~12 skills total), rank cap 2
- Win: $X cumulative revenue (tune X ≈ 8–12 rounds of play)
- Success criterion: two humans finish a game in <45 min and can articulate *why* they won
  from the map alone.

## 18. Major Balance Risks & Counterplay

| Degenerate strategy | Natural counter (systemic, not rule-patch) |
|---|---|
| Marketing spam | saturating gain curve + awareness cap + decay + spend is cash not revenue |
| Price dumping | margin math: store score uses *store* margin, not your volume; your unit margin →0 while salaries continue |
| "Always hire HR first" | HR unlocks capacity but earns nothing; a lean org selling early out-cashflows an org chart |
| One giant Sales team | salary overhead scales linearly; relationships cap; shelves are finite |
| First-to-market snowball | every advantage ledger decays/saturates; hysteresis is finite (×1.15) |
| Wide distribution rush | per-shipment logistics cost + reliability risk + stockout relationship damage |
| Premium-only | 10–30% audience caps volume; brand takes rounds to build |

Balance guardrail for all tuning: **every strategy's core cost must scale with its core
benefit** (salaries with org size, logistics with reach, marketing with attention). If a
tune breaks that rule, the tune is wrong.

## Data Model Draft (schemas)

```jsonc
Role {
  id: "marketing", name, baseSalaryByRank: [30, 55, 90], baseHiringCostByRank: [60, 120, 220],
  skillSlotsByRank: [1, 2, 3], baselineEffects: [{ key: "marketing.campaign_slots", op: "add", value: 1 }]
}

Employee {
  id, roleId, rank: 1, managerId: "emp-president", salary,
  skills: { "mkt.local_area_focus": 2 },          // skillId -> level
  skillPointsSpent, hiredRound
}

Skill { /* §5 schema */ }

Company {
  id, name, color, cash, cumulativeRevenue,
  employees: [Employee], products: [ProductRef],
  capabilities: { /* derived each round by CapabilityResolver — cached, not authored */ },
  relationships: { storeId: 0..100 },
  awareness: { zoneId: 0..100 }, familiarity: { zoneId: 0..100 }
}

Product {
  id, companyId, category: "drink", position: "economy"|"mainstream"|"premium",
  quality: 0..100, wholesalePrice, suggestedRetail, unitCost,
  launchedRound
}

ConsumerSegment {
  id: "budget", weights: { priceSensitivity: 0.6, qualityPreference: 0.15, brandAffinity: 0.25 },
  budgetBand: [min, max],
  reserved: { loyalty: null, trend: null, convenience: null }   // deferred axes (§7)
}

Zone {
  id, name, polygon/tiles, segmentMix: { budget: 0.7, mainstream: 0.2, premium: 0.1 },
  baseDemand: 120, roadNodes: [...], storeIds: [...]
}

Store {
  id, zoneId, type: "convenience"|"supermarket"|"mall",
  shelfCapacity: 3, trafficMult: 1.0, marginExpectation: 0.25,
  shelf: [{ productId, stock, retailPrice, sinceRound }],
  history: { productId: { unitsLastRound, stockouts } }
}
```

---

*Companion document:* `company-economy-system-map-v1.md` (system relationship map).
*All numbers above are V1 tuning seeds, not commitments.*
