# Company Economy — Master Game Foundation v1 (SUPERSEDED by v2)

> **SUPERSEDED:** `company-economy-master-foundation-v2.md` is the authoritative source of
> truth. v2 corrects the consumer model (real agents with homes, not aggregate pools with
> display-only walkers), makes the map a strategic board with an HQ-location opening
> decision, and adds the hotel/tourist market. Unchanged systems are re-confirmed in v2.

**The source of truth for Phase 0.** Working title: *Company Economy* — a 2.5D pixel-art
business strategy / company builder for 2–4 players (online-ready). Systems-level
inspiration from economic strategy games is acknowledged; **no system, name, content, or
implementation is copied from any existing game.**

Companion documents:
- `company-economy-system-map-v1.md` — system relationship map
- `company-economy-data-model-v1.md` — schema drafts
- `company-economy-vertical-slice-v1.md` — exact prototype scope
- `company-economy-decision-log.md` — decisions, alternatives, revisit triggers

Supersedes `company-economy-core-design-v1.md` (kept as a pointer stub).

---

## 1. Vision & Core Fantasy

> **You are the president of a small company with big ambitions. Read the market, build the
> organization that can win it, and out-position rival presidents for finite shelves and
> finite customers. Every hire is a strategy. Every store aisle is a battlefield.**

Start state: little cash, almost no staff, almost no market data, and a company that can
barely do anything. The defining player question every game:
**"What will MY company be good at, and how will it grow?"**

The heart is: **Organization Strategy + Market Analysis + Competitive Sales + Economic
Positioning.** The game must never become: an idle/clicker game, a spreadsheet simulator
without spatial play, a micromanagement RTS, or a worker-placement board-game clone.

## 2. Design Pillars

Every future feature must serve at least one pillar and violate none.

1. **Build the Company, Not Just the Product** — the org chart *is* the tech tree; hires
   unlock verbs, not percentages.
2. **Read the Market Before Spending** — information is a currency; the player who
   understands a zone beats the player who outspends in it.
3. **Every Advantage Decays** — awareness, relationships, shelf incumbency are stocks that
   leak; momentum must be re-earned, never banked.
4. **The City Is the Interface** — market state must be readable from the map (busy
   storefronts, walking customers, billboards), not only from panels.
5. **Compete Through the Market, Never Direct Attacks** — no sabotage verbs; all conflict
   flows through price, shelves, attention, and relationships.
6. **Growth Creates New Problems** — scale brings salaries, management complexity, and
   logistics burden; a bigger company is a different puzzle, not a solved one.

## 3. Core Game Loop

```
Analyze Market → Build Organization → Develop Product/Positioning → Market Product
→ Sales pitches stores → Logistics supplies stores → Consumers buy → Revenue/Profit
→ Reinvest → Competitors react → Market shifts → repeat
```

- **Player decisions** live in: hiring/skill builds (PLAN), positioning/pricing (POSITION),
  campaign targeting (MARKET), pitch/coverage/shipping allocation (SELL-IN).
- **Risk/reward**: every spend is cash-now for uncertain contested demand later; premium
  positioning risks small audiences for margin; wide distribution risks logistics overhead.
- **Information advantage**: research-gated data (§18) — the player who knows a zone's real
  segment mix prices and positions better than one guessing from the sidewalk.
- **Competitor interaction**: shelf contests, attention share, price undercuts, relationship
  races — resolved simultaneously each round (§13).
- **Economy feedback**: revenue → cash → org growth → more capability → more revenue; damped
  by pillar 6 costs and §17 anti-snowball so the loop tightens but never runs away.

**Loop cadences**

| Cadence | Experience |
|---|---|
| 30-second | pick one action (a hire, a price, a campaign target) and immediately see its cost and projected effect |
| 3-minute | one full round: plan all phases → watch resolution → watch customers walk (or not walk) into your store → read the finance line |
| Full round | PLAN → POSITION → MARKET → SELL-IN → CONSUME → FINANCE (§13) |
| Whole game | bootstrap org & first shelf (early) → specialize builds & contest zones (mid) → defend/flip shelves & race the revenue target into the final round (late) |

## 4. Company Organization System

- A company = **Employees** in a reporting structure (every employee except the President
  has exactly one manager). The structure is **data, not a hardcoded tree** — any shape is
  legal if capability constraints hold, and all constraints come from the modifier system:
  `org.employee_capacity`, `<employee>.subordinate_capacity`, `org.max_rank_unlocked`.
- **Each role unlocks company verbs** (never just stat bonuses):

| Role (V1) | Unlocks (capability keys, examples) |
|---|---|
| President | baseline: 1 recruit/round, 1 pitch/round, 1 shipment/round, pricing |
| HR | `hr.recruit_capacity`, `hr.hiring_cost_mult`, `org.max_rank_unlocked`, employee development |
| Manager | `manager.subordinate_capacity`, `org.employee_capacity`, `manager.department_efficiency` |
| Marketing | `marketing.campaign_slots`, `marketing.awareness_gain`, `marketing.segment_precision` |
| Sales | `sales.pitch_capacity`, `sales.store_capacity`, `sales.relationship_gain` |
| Logistics | `logistics.delivery_capacity`, `logistics.range`, `logistics.cost_mult`, `logistics.reliability` |
| Market Research | `research.zone_visibility`, `research.forecast_depth`, `research.competitor_report` |

  (Operations/Finance roles: deliberately deferred — V1 must not bloat; see decision log.)
- Employee fields: role, **rank (1–3)**, salary, hiring cost, training cost, department,
  skill slots, experience. Higher rank → more slots + higher level caps + higher salary.
- **Meaningful branching, no mandatory opener** (see §26 + decision log): four openers are
  deliberately tuned to be viable — *HR Growth* (long game capacity), *Sales Rush*
  (President's own pitch + a cheap Sales hire monetizes immediately), *Marketing First*
  (demand before distribution), *Research-Driven* (spend less, aim better). The President's
  **baseline verbs are what prevent HR-first from being mandatory: you can hire one person
  per round and pitch stores without any HR at all** — HR accelerates and unranks, never
  gates the basics.
- Firing: allowed, small severance; orphans re-attach to the fired employee's manager.
- **No micromanagement rule**: employees are never moved on the map and take no per-tick
  orders; every employee is a per-round capability, so org size grows strategic width, not
  click count.

## 5. Employee Skill Framework

Schema-first (full schema in the data model doc). All effects are **data-driven Modifiers**
— no `if marketing_level == 3` anywhere.

```jsonc
Skill {
  id: "mkt.local_area_focus", roleRequirement: "marketing", rankRequirement: 1,
  maxLevel: 3, costPerLevel: [40, 80, 160], prerequisite: ["mkt.basics:1"],
  effects: [ // Modifier[]
    { key: "marketing.awareness_gain", op: "mult", valuePerLevel: 0.15, scope: "zone-targeted",
      stackingRule: "sum-then-multiply" }
  ]
}
```

- `op` ∈ `add` | `mult` | `unlock`; stacking: all `add` sum → all `mult` multiply → `unlock`
  is boolean OR. One **CapabilityResolver** folds baseline + roles + ranks + skills into a
  flat `CompanyCapabilities` sheet per round; every resolver reads only that sheet.
- **Specialization** emerges from slot scarcity (rank gives 1/2/3 slots; skills per role
  exceed slots): e.g., a Marketing rank-2 builds into *Brand Specialist*, *Price-Promotion
  Specialist*, or *Local-Area Specialist* — different companies, different capabilities.
- **Diminishing opportunity cost is structural**: training costs cash + a PLAN action, so
  deep vertical investment in one role is always paid for with breadth elsewhere.

## 6. Product System

Minimum Viable Attribute Set — exactly six, everything else deferred:
`category, position, price(wholesale + suggested retail), unitCost, quality, brand(derived per zone)`.

- V1: **one category** (beverage), 1–2 SKUs per company.
- **Positioning** (chosen at SKU creation; repositioning = costly re-launch):

| Position | Cost/unit | Quality band | Effect on demand/margin/stores |
|---|---|---|---|
| Economy | low | low | high volume in price-sensitive segments, thin margin, stores like turnover |
| Mainstream | mid | mid | broad fit, moderate everything, safest shelf case |
| Premium | high | high | small audience, high margin, needs brand + affluent zones; stores like margin |

- Positioning feeds the demand model as a **segment-fit term** and feeds store decisions via
  expected margin — so "what to sell, at what price, to whom, where" is one connected
  decision, and mismatch (Premium@100 in a Budget zone) fails through math, not rules.

## 7. Consumer System

- **Three segments** — Budget / Mainstream / Premium — each with exactly **three weights**:
  `priceSensitivity, qualityPreference, brandSensitivity` (sum = 1).
- *Convenience / Trend / Health / Luxury*: **wait.** The schema reserves the fields;
  three axes already create distinct zone strategies, and each extra axis multiplies the
  tuning surface before the loop is proven (decision log).
- Each **zone** has a segment mix + base demand pool (units/round):

| Zone (V1) | Budget | Mainstream | Premium | Character |
|---|---|---|---|---|
| Budget Residential | 70% | 20% | 10% | dense housing, small shops |
| Mixed / Business District | 20% | 50% | 30% | offices + convenience traffic |
| Affluent / Uptown | 10% | 30% | 60% | low volume, high willingness-to-pay |

- Demand model requirements met by design (§15): understandable, deterministic enough to
  plan around (all uncertainty from a seeded, replayable RNG cursor; V1 target ≈ ±10%
  noise max), CPU-light (aggregate math per zone, not per person), multiplayer-safe.
- **Aggregate Economic Demand + Representative Visual Customers** (§21): sales numbers come
  from the aggregate simulation only; map NPCs display traffic/demand/purchases/vitality
  and never feed anything back.

## 8. Map & Spatial Economy (Minimal Spatial Model)

Map contents: roads, 3 consumer zones, stores, one office per company, (warehouses deferred
— the office doubles as the shipping origin in V1).

Space matters through exactly **three numbers** — no more:

1. **Distance office→store** → logistics cost per shipment and range gating (§12).
2. **Store zone membership** → which segment mix and demand pool the store sells into.
3. **Store traffic multiplier** → main road / corner locations sell more (a static per-store
   value authored with the map, readable at a glance).

Pathfinding is presentation-only (walkers on the road grid). No economic agent moves along
roads; the economy uses straight-line distance and zone membership. This is deliberately the
smallest spatial model that still makes "where" a strategic question.

## 9. Store & Shelf System — the battlefield

`Store { type, zoneId, trafficMult, shelfCapacity(category): 2–4 brand slots, marginExpectation, history }`
Types V1: convenience (cap 2–3, high traffic), supermarket (cap 3–4), mall shop (cap 2,
affluent bias).

**Store Score Model v1** — deterministic, explainable, no opaque RNG:

```
StoreScore(offer) = ExpectedUnits(product, zone)        // shared demand model §15
                  × UnitMargin(retail − wholesale)
                  × (1 + Relationship / 200)             // 0..100 relationship → up to 1.5×
                  + PromoSupport                          // this round's committed support
```

- Each round the store ranks incumbents + new pitches and keeps the top `shelfCapacity`,
  **but replaces an incumbent only when `challenger > incumbent × 1.15`** (hysteresis:
  stores don't churn for marginal wins; also the natural shelf-stability half of
  first-to-market §14).
- **Diversification preference**: a store never allocates ALL its category slots to one
  company while a viable competitor offer exists (anti-monopoly pressure, §17).
- **Explainability requirement**: the UI must show the three factors per offer, so "why did
  the store take/drop us" is always answerable from visible numbers.
- All inputs are player levers: demand (marketing), margin (wholesale terms), relationship
  (sales assignment), promo support (cash), delivery reliability (a failed delivery zeroes
  ExpectedUnits next round and dents relationship).

## 10. Sales System

Active strategic system, not a stat:

- Verbs: **Pitch** (attempt a shelf slot), **Maintain** (assigned store accrues
  relationship), **Negotiate** (trade wholesale margin for score), **Defend** (commit promo
  support to an incumbent slot).
- `sales.store_capacity` = stores serviced; `sales.pitch_capacity` = new attempts/round.
  Growth forces the **Deep vs Wide** choice: few stores at high relationship vs many at
  shallow relationship (relationship gains are per-store per-round and capped; unattended
  relationships decay).
- Outcome inputs: sales skill (gain rate), brand strength, expected demand, commercial
  offer, existing relationship — all inside the Store Score, §9.
- **Sales-army counterplay** (systemic): linear salary overhead, `manager.subordinate_capacity`
  needed to even field them, relationships cap, shelves are finite, and shelf wins without
  marketing/logistics behind them produce stockouts and weak `ExpectedUnits`.

## 11. Marketing System

`Campaign { type, target(zone|segment|product), spend, duration }`, consumes campaign slots.

| Type (V1) | Target | Effect profile |
|---|---|---|
| Local campaign | zone | fast awareness burst, fast decay |
| Brand campaign | company (all zones, weak) / product | slow, durable brand strength |
| Price promotion | product+zone | temporary effective-price cut; boosts store PromoSupport |

- Effects write only to the **awareness/preference ledgers** used by demand math — never
  directly to sales.
- **Anti-spam is threefold**: saturating gain (`gain = k·spend/(spend+s0)`), awareness cap
  (100/zone) with **decay** (−10%/round toward baseline), and **campaign fatigue** — the
  same campaign type repeated in the same zone loses 20% effectiveness per consecutive
  round, resetting after a pause. Spend-more is never always-win.
- **Positioning interaction**: campaign effect on a segment is scaled by segment-fit — a
  premium brand campaign in a Budget zone reaches the 10% premium slice only.
  `marketing.segment_precision` skills reduce that spill waste — that's the Marketing
  specialist's identity.

## 12. Logistics System

Abstracted V1 (no factories, no warehouses, no per-unit trucks):

- **Company Supply Capacity per round** (production abstracted as capacity).
- **Delivery Assignment**: shipment = (product, store, units); consumes
  `logistics.delivery_capacity` slots; must be within `logistics.range` of the office;
  costs `base + distance × logistics.cost_mult`.
- **Store Stock**: delivered units sit on the shelf; CONSUME sells down stock; empty shelf =
  lost sales + relationship damage (the stockout is the teeth of the system).
- `logistics.reliability` (0–1): under-invested logistics risks a late delivery (drawn from
  the seeded RNG cursor — deterministic replay, no player-facing dice feel at high
  reliability).
- **Future-proof seam**: warehouses/production/inventory later = replacing "capacity per
  round" with a produced-inventory source; assignments, range, cost, and stock stay as-is —
  no core rewrite (decision log).

## 13. Turn / Phase Structure

Analysis of the three options:

| Model | Verdict |
|---|---|
| Sequential turns | rejected — downtime at 3–4 players, shelf-sniping by turn order, king-making late |
| Pure simultaneous (everything at once) | rejected — one giant resolution is opaque; players can't read cause→effect |
| **Hybrid: simultaneous submission + deterministic phased resolution** | **recommended** |

**The round**: all players plan **all phases in one planning window** (soft timer online;
hot-seat = plan privately in seat order, which changes nothing because resolution is
simultaneous). Then the server/engine resolves phases in fixed order:

`PLAN → POSITION → MARKET → SELL-IN → CONSUME → FINANCE`

**Conflict resolution (no first-click-wins, ever):**
- Contested shelf: all pitches for a store resolve together via Store Score (§9).
- Exact score ties: **rotating initiative token** (moves one seat left each round) breaks
  ties; nothing else does.
- Finite external resources contested in the same phase (e.g., last shelf slot in two
  stores) resolve store-by-store in fixed store-ID order — deterministic and known.

## 14. First-to-Market System (no permanent milestones)

Being first pays through four decaying, contestable ledgers — this is the whole model, kept
deliberately small:

| Ledger | Scope | Gained by | Decays / contested by |
|---|---|---|---|
| Awareness | company × zone | marketing, presence | −10%/round toward 0; rival campaigns take attention share |
| Familiarity | company × zone | actual purchases | slow decay; later entrants gain it faster per sale (pioneer paid category education) |
| Store relationship | company × store | assigned sales time | decays when unassigned; capped |
| Shelf stability | product × store | incumbency | only the ×1.15 hysteresis (§9) — beaten by better economics |

Historical sales data lives in store history and feeds `ExpectedUnits` — a real but
earnable-by-anyone advantage. **Every ledger leaks**; a first mover who stops investing is
overtaken by price, fit, marketing, sales, or logistics within a few rounds. No other
first-mover mechanism exists.

## 15. Economic Simulation Model v1

Per zone per round (aggregate, deterministic):

1. **Demand pool**: `baseDemand × seasonMult × (1 + categoryAwarenessBonus)` — marketing
   grows the pie slightly, mostly shifts share.
2. **Store traffic split**: pool distributes across the zone's stores by `trafficMult`
   (static) — consumers "arrive" at stores, then choose products on shelves there.
3. **Product utility per segment** — **additive weighted, not multiplicative** (analyzed:
   a multiplicative chain like `fit×price×quality×awareness` zeroes out any new entrant
   with 0 awareness and makes tuning opaque because factors interact; additive keeps new
   products viable, is explainable term-by-term, and each weight is a direct tuning knob):

```
U(product, segment) = wPrice·PriceAppeal + wQuality·QualityAppeal
                    + wBrand·(Awareness/100 · (0.5 + Familiarity/200))
                    + fitBonus(position, segment)
Availability is a hard gate: only products with stock on this store's shelf compete.
```

4. **Share allocation**: softmax over U within each segment at that store (temperature
   tuned: clear winners take strong-but-not-total share) → intended units.
5. **Fulfillment**: capped by shelf stock; unmet demand spills 50% to the next-best
   available product, 50% evaporates (stockouts hurt the whole category locally).
6. Outputs: per-store per-product units, revenue, stockouts → Finance, familiarity,
   store history, and the visual event stream (§21).

Properties: tune-friendly (per-term weights), debug-friendly (log U components per
product), explainable to players (research UI can show the same terms), deterministic.

## 16. Finance System

V1 keeps money brutally simple — one cash account per company:

`cash += revenue − salaries − hiring/training − marketing spend − logistics cost − promo support`

- **No debt/loans/stock/investors in V1** (decision log): they add bailout dynamics and UI
  before the core loop is proven. The schema reserves a `liabilities` field.
- Insolvency rule (no debt system needed): if cash can't cover salaries, unpaid employees
  leave at round end (auto-downsize) — harsh, visible, self-correcting.
- The five-way tradeoff that money must always force: hire vs market vs train vs expand
  distribution vs cut price. Tuning guardrail: **every strategy's core cost must scale with
  its core benefit** (salaries with org size, logistics with reach, marketing with
  attention).

## 17. Competitive Interaction & Anti-Snowball

**Interaction matrix (V1):**

| System | Player action | Opponent impact | Counterplay |
|---|---|---|---|
| Price | undercut a zone | rival share drops | reposition, promo, brand; undercutter bleeds margin |
| Shelf | pitch/defend slots | rival loses distribution | out-score via demand/margin/relationship; hysteresis protects |
| Attention | zone campaigns | rival awareness share shrinks | counter-campaign; fatigue punishes repetition |
| Relationships | assign sales | store harder to flip | build own relationship; relationship caps + decays |
| Coverage | expand range | rival's uncontested zones vanish | logistics overhead punishes overreach; defend locally |
| Timing | enter market first | ledger head starts (§14) | all four ledgers decay/contested |
| Talent | specialize skills | capability gap | different specialization; slots limit everyone equally |

No direct attack verbs exist (pillar 5) → no unmotivated player-targeting; softmax share
math means beating the leader helps *you*, limiting kingmaking.

**Anti-snowball (soft, systemic — no free catch-up bonus, no artificial rubber-band):**

| Snowball source | Damper |
|---|---|
| First-to-market | decaying ledgers §14 |
| Brand awareness | cap + decay + saturating spend + fatigue |
| Shelf ownership | hysteresis is finite; diversification preference §9 |
| Revenue lead | salary escalation: market salaries rise with company headcount tier; managerial complexity: headcount above managed capacity → `department_efficiency` penalty |
| Employee scaling | subordinate capacity forces mid-management overhead |
| Market data lead | research reveals state, not the future; state decays |
| Market saturation | zone pools are finite; leader's marginal spend meets diminishing share |
| New opportunities | mild seasonal demand shifts reopen contested windows late game |

## 18. Player Information Model

| Tier | Contents |
|---|---|
| **Public** (map-readable) | city layout, store shelves + retail prices (walk in and look), visible campaigns (billboards on map), rough busyness (walkers), rival office size (headcount tier), initiative |
| **Private** | cash, costs, wholesale terms, skills/builds, plans in the current window |
| **Research-gated** | exact zone segment mixes & demand pools, demand forecasts, competitor sales estimates, per-store score breakdown beyond your own offers |

Design intent: a player with zero research can play by *reading the city* (pillar 4) — the
sidewalk is a legitimate free information channel; research converts that intuition into
numbers. Hidden info is never guess-random: everything gated is *estimable* from public
signals, research buys precision.

## 19. UI / UX Information Architecture (no UI build yet)

- **Always visible (HUD)**: cash, round + phase, initiative holder, notifications.
- **Home screen = Map View** (pillar 4) with toggle **overlays**: awareness heatmap (own),
  logistics range, zone boundaries; research adds demand/competitor overlays.
- **Click-through panels**: Company/Org chart (hire/train here), Employee detail (skills),
  Market Insight (research outputs), Product & Pricing, Marketing (campaign placement),
  Sales/Store view (per-store score breakdown for own offers), Finance summary
  (per-line costs, round-over-round).
- **Overlay events**: store tooltips show shelf + last-round units (public tier).
- Mobile/tablet: bottom-sheet panels, ≥44px targets, one-hand phase confirm; map remains
  the home surface at all breakpoints.

## 20. Turn Structure × Multiplayer Architecture

Locked from day one (the things that are expensive to retrofit):

1. **State/Command/Resolver/Renderer separation** — GameState is pure serializable data;
   Commands are the only mutation path; Resolvers are pure `(state, commands) → state' +
   events`; Renderer reads state + events and never writes.
2. **Determinism**: all randomness through the seeded RNG cursor in GameState; same state +
   same commands ⇒ identical result on every machine.
3. **Command validation inside resolvers** (server-side later), never trust the UI.
4. **Event log** as the renderer contract → replay, spectate, reconnect for free.
5. **Snapshot = savegame = network state sync** (one format).

Future networking = wrap the identical command/resolve loop in a server-authoritative
service. Explicitly **not** now: ECS, distributed simulation, rollback netcode, backend,
online DB (see Non-Goals).

Core resolvers: `CapabilityResolver (Organization) · MarketingResolver · StoreResolver ·
ConsumerDemandResolver · SalesResolver · FinanceResolver` + `MarketResearchResolver`.
Presentation: `MapRenderer · CharacterRenderer · UIRenderer · VFX`.

## 21. Visual Simulation Principle

Pixel customers are **representative agents, never authoritative economic agents**.

- Engine says "Store A sold 20 units this round" → visual layer spawns 3–6 walkers
  (1 per N units, N zoom-tuned, hard cap ~60 concurrent city-wide), segment-styled,
  house→road→store→exit, brand-colored purchase pop.
- Visual event vocabulary (renderer contract): `CustomerVisitEvent, PurchaseEvent,
  StoreBusyEvent, DeliveryEvent, CampaignVisualEvent` — emitted by resolvers, consumed only
  by presentation. Deleting every walker changes zero economic outcomes; that invariant is
  the performance and multiplayer guarantee.

## 22. Victory Condition

| Model | Pros | Cons |
|---|---|---|
| A. Cumulative revenue target | readable race, matches fantasy, simple | ignores efficiency; can reward reckless spend |
| B. Company valuation target (cash+assets+brand−liabilities) | rewards healthy business | opaque math, anticlimax, horizon tuning |
| C. Hybrid business score (revenue + share + profit weights) | thematic completeness | multi-criteria confusion in V1 |

**Recommended V1: Model A + final-round equalizer.** First company to reach **$X cumulative
revenue** triggers endgame → current round completes **plus one full final round** (every
seat gets equal rounds — the anti-first-player mechanism). Winner: highest cumulative
revenue. **Tie-breakers in order**: (1) cash on hand, (2) total units sold, (3) rotating
initiative holder among tied players. Model B documented as a "long game" variant later.

## 23. Non-Goals (Version 1 is NOT)

Not a factory simulator · not a stock-market simulator · not a city builder · not an idle
game · not a life simulation · not an RTS combat game · not a clone of any board game ·
not a monetized live product. Any feature pitch that turns the game into one of these is
rejected by default, whatever its local appeal.

## 24. Balance Risk Analysis

| Strategy | Why it could dominate | Natural cost | Counterplay | Balance lever |
|---|---|---|---|---|
| HR-first every game | compounding capacity | HR earns no revenue; salary from round 1 | sales-rush out-cashflows it early | President baseline verbs; HR hire cost |
| Marketing spam | demand wins shelves | cash burn, no distribution | take the shelves they can't supply | saturation k/s0, cap, decay, fatigue % |
| Price dumping | share grab | margin →0 while salaries run; store margin term unimpressed by your losses | premium/mainstream repositioning, wait it out | store margin weight; unitCost floors |
| Sales army | shelf lock | linear salaries + manager capacity | demand starves their shelves; stockouts | relationship cap, store diversification |
| Premium only | high margin | 10–30% audience caps volume | volume plays outgrow it in budget zones | segment mixes, brand ramp time |
| Economy only | volume | thin margin, logistics-heavy | premium harvests affluent zones uncontested | unit cost curves, shelf margin expectation |
| First-to-market rush | ledger head start | spread thin early | focused later entry beats decayed presence | decay rates, hysteresis threshold |
| Single-zone monopoly | local dominance | one saturated pool caps revenue | others take two zones each | zone pool sizes, diversification preference |
| Wide expansion rush | presence everywhere | logistics cost/reliability, shallow relationships | deep local play flips their weak shelves | range costs, reliability curve |
| Vertical skill stacking | super-specialist | opportunity cost of slots/cash/actions | different specialization beats absent capability | slot counts, training cost curve |

Guardrail (repeat, because it is the rule): **core cost must scale with core benefit.**

## 25. Vertical Slice

Exact scope, Must/Should/Not-Yet, and the fun-proof success criteria live in
**`company-economy-vertical-slice-v1.md`**. Headline: 2 companies, hot-seat, 1 small map,
3 zones, 8 stores, 1 category × 3 positions, 6 roles + minimal Research, ~14 skills,
30–60 minute game, win at tuned $X with the final-round rule.

## 26. Consistency Review (performed on this document set)

- Marketing counterplay: saturation + cap + decay + fatigue + fit-scaling ✔ (§11)
- Sales cannot win by headcount alone: salary + manager capacity + relationship caps +
  demand-starved shelves ✔ (§10, §24)
- HR not mandatory: President baseline recruit/pitch/ship verbs; viable non-HR openers ✔ (§4)
- Logistics valuable, not micromanaged: per-round assignments only, no trucks to steer ✔ (§12)
- Research valuable, not oppressive: three-tier info model, public tier always playable ✔ (§18)
- Premium and Economy both viable: margin-vs-volume symmetry + zone mixes ✔ (§6, §24)
- First-to-market decays: four leaking ledgers, nothing permanent ✔ (§14)
- Store logic explainable: three-factor score surfaced in UI ✔ (§9, §19)
- Consumer logic tunable: additive weighted utility, per-term knobs ✔ (§15)
- Multiplayer without economy rewrite: command/resolver/event architecture locked ✔ (§20)
- Organization choices meaningful: verbs-not-bonuses + slot-scarce specialization ✔ (§4–5)

One inconsistency found and fixed during the pass: the previous draft deferred Market
Research entirely from the slice while also making information tiers a core identity —
resolved by including a minimal Analyst (one skill) in the slice as Should-Have
(vertical-slice doc, decision log).
