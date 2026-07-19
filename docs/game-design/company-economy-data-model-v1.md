# Company Economy — Data Model Draft v1

Schema drafts for the master foundation (`company-economy-master-foundation-v1.md`).
Not production-complete — optimized for extendability, readability, debuggability.
Conventions: every entity has a string `id`; cross-references are always `<entity>Id`;
all state is JSON-serializable (GameState snapshot = savegame = future network sync).

## Modifier — the shared effect atom (everything data-driven hangs off this)

```jsonc
Modifier {
  key: "marketing.awareness_gain",   // namespaced capability key: <domain>.<name>
  op: "add" | "mult" | "unlock",
  value: 0.15,
  scope: "global" | "zone-targeted" | "store-targeted" | "self",
  stackingRule: "sum-then-multiply"  // default: all adds sum -> all mults multiply -> unlock = OR
}
```

## Role

```jsonc
Role {
  id: "marketing", name: "Marketing",
  department: "commercial",
  baseSalaryByRank:   [30, 55, 90],
  hiringCostByRank:   [60, 120, 220],
  trainingCostMult: 1.0,
  skillSlotsByRank:   [1, 2, 3],
  baselineEffects: [ Modifier ]      // what merely having this role unlocks
}
```

## Skill

```jsonc
Skill {
  id: "mkt.local_area_focus",
  roleRequirement: "marketing",
  rankRequirement: 1,
  category: "area",                  // build identity grouping
  maxLevel: 3,
  costPerLevel: [40, 80, 160],
  prerequisite: ["mkt.basics:1"],    // "skillId:minLevel"
  effects: [ Modifier ]              // applied per level
}
```

## Employee

```jsonc
Employee {
  id: "emp-007", companyId: "co-red",
  roleId: "marketing", rank: 2,
  managerId: "emp-002",              // null only for the President
  salary: 55,
  skills: { "mkt.local_area_focus": 2 },   // skillId -> level
  experience: 340, hiredRound: 3
}
```

## Company

```jsonc
Company {
  id: "co-red", name: "Redline Beverages", color: "#c0392b",
  presidentEmployeeId: "emp-001",
  cash: 500, cumulativeRevenue: 0, liabilities: 0,   // liabilities reserved, unused V1
  employeeIds: [ ... ], productIds: [ ... ],
  officeLocation: { x, y }, supplyCapacityPerRound: 120,
  capabilities: { /* DERIVED by CapabilityResolver each round; cached, never authored */ },
  relationships: { "store-05": 62 },        // storeId -> 0..100
  awareness:    { "zone-budget": 48 },      // zoneId  -> 0..100
  familiarity:  { "zone-budget": 31 }       // zoneId  -> 0..100
}
```

## Product

```jsonc
Product {
  id: "prod-red-cola", companyId: "co-red",
  category: "beverage",
  position: "economy" | "mainstream" | "premium",
  quality: 40,                        // 0..100, banded by position
  unitCost: 6, wholesalePrice: 10, suggestedRetail: 15,
  launchedRound: 2
}
```

## ConsumerSegment

```jsonc
ConsumerSegment {
  id: "budget",
  weights: { priceSensitivity: 0.60, qualityPreference: 0.15, brandSensitivity: 0.25 },
  budgetBand: [8, 18],                // acceptable retail range
  reserved: { convenience: null, trend: null, health: null, luxury: null }  // deferred axes
}
```

## Zone

```jsonc
Zone {
  id: "zone-budget", name: "Budget Residential",
  tiles: [ ... ],                     // map footprint (presentation + store membership)
  segmentMix: { budget: 0.7, mainstream: 0.2, premium: 0.1 },
  baseDemand: 120,                    // category units/round
  seasonProfile: "flat-v1",
  storeIds: [ "store-01", "store-02", "store-03" ]
}
```

## Store

```jsonc
Store {
  id: "store-01", zoneId: "zone-budget",
  type: "convenience" | "supermarket" | "mall",
  location: { x, y }, trafficMult: 1.2, marginExpectation: 0.25,
  shelf: {                            // per category
    "beverage": {
      capacity: 3,
      slots: [ { productId, stock: 24, retailPrice: 14, sinceRound: 4, promoSupport: 0 } ]
    }
  },
  history: { "prod-red-cola": { unitsLastRound: 18, stockouts: 0, totalUnits: 96 } }
}
```

## MarketingCampaign

```jsonc
MarketingCampaign {
  id: "camp-11", companyId: "co-red",
  type: "local" | "brand" | "price_promo",
  target: { kind: "zone" | "segment" | "product", ref: "zone-budget" },
  spend: 80, duration: 2, startedRound: 5,
  fatigueStack: 1                     // consecutive repeats of same type+target
}
```

## SalesAssignment

```jsonc
SalesAssignment {
  id: "sa-04", companyId: "co-red", employeeId: "emp-009",
  storeId: "store-05",
  mode: "maintain" | "pitch" | "defend" | "negotiate",
  offer: { productId, wholesalePrice, promoSupport }   // pitch/negotiate only
}
```

## LogisticsAssignment

```jsonc
LogisticsAssignment {
  id: "la-02", companyId: "co-red",
  productId: "prod-red-cola", storeId: "store-05", units: 30
  // cost + reliability outcome computed by resolver from capabilities + distance
}
```

## GameAction (the command envelope — the ONLY state-mutation path)

```jsonc
GameAction {
  id: "act-0042", round: 5, phase: "PLAN",
  companyId: "co-red",
  type: "HireEmployee" | "TrainEmployee" | "PromoteEmployee" | "FireEmployee"
      | "CreateSku" | "SetPrice" | "LaunchCampaign"
      | "AssignSales" | "PitchStore" | "AssignDistribution" | "EndPlanning",
  payload: { /* type-specific; validated inside resolvers, never trusted from UI */ }
}
```

## GameRound / GameState spine

```jsonc
GameRound {
  round: 5,
  phase: "PLAN" | "POSITION" | "MARKET" | "SELL-IN" | "CONSUME" | "FINANCE",
  initiativeCompanyId: "co-blue",     // rotates every round; only tie-breaker
  rngCursor: 918273,                  // seeded; sole randomness source
  pendingActions: [ GameAction ],
  eventLog: [ /* resolver-emitted events incl. visual events:
                 CustomerVisitEvent, PurchaseEvent, StoreBusyEvent,
                 DeliveryEvent, CampaignVisualEvent */ ]
}

GameState { config, round: GameRound, companies: [Company], employees: [Employee],
            products: [Product], zones: [Zone], stores: [Store],
            campaigns: [MarketingCampaign], salesAssignments: [...], logistics: [...] }
```

## Notes

- `capabilities` is the only derived-cache field in the model; everything else is
  authoritative state. Recomputing capabilities from scratch each round keeps skills/roles
  freely extendable.
- Renderer-only concepts (walkers, animations) have **no schema here** on purpose — they
  are ephemeral consumers of `eventLog` and never enter GameState.
