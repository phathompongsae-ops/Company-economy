# Company Economy — System Map v1

How every system feeds the next. Companion to `company-economy-master-foundation-v1.md`
(section numbers in parentheses refer to that document's topics; the flow below is
President → Organization → Capabilities → Product Strategy → Marketing → Awareness/Demand
→ Sales → Store Access → Logistics → Availability → Consumer Purchase → Revenue →
Reinvestment → Company Growth).

## The engine loop

```mermaid
flowchart TD
  subgraph ORG [Organization §3-5]
    P[President] --> E[Employees<br/>roles · ranks · skills]
    E --> CAP[CompanyCapabilities<br/>derived sheet]
  end

  subgraph OFFER [Offer §6]
    CAP -->|create/position/price| PROD[Products<br/>position · price · quality]
  end

  subgraph ATTENTION [Attention §9,12]
    CAP -->|campaign slots| MKT[Marketing campaigns]
    MKT --> AW[Awareness / Familiarity<br/>per company × zone<br/>decaying ledgers]
  end

  subgraph ACCESS [Access §8,10,11]
    CAP -->|pitch slots · relationships| SALES[Sales pitches]
    CAP -->|range · shipments| LOG[Logistics deliveries]
    SALES --> SHELF[Store shelf slots<br/>2-4 brands · hysteresis]
    LOG -->|stock| SHELF
  end

  subgraph MARKET [Market §7,13]
    ZONE[Consumer zones<br/>segment mix · demand pool]
    AW --> UTIL[Utility per segment × product]
    PROD --> UTIL
    SHELF -->|availability| UTIL
    ZONE --> UTIL
    UTIL -->|softmax share × pool<br/>capped by stock| SOLD[Units sold per store]
  end

  SOLD --> REV[Revenue §15]
  SOLD -.->|events only| VIS[Visible customers<br/>representative agents §13]
  SOLD --> FAM[Familiarity gain] --> AW
  SOLD --> HIST[Store sales history] --> SHELF
  REV --> FIN[Finance phase<br/>− salaries − logistics − marketing]
  FIN -->|profit| CASH[Cash]
  CASH -->|hire · train · promote| E
  REV -->|cumulative| WIN[Victory check §15]
```

## Reading the map

- **Left-to-right is the player's build order**; the loop closes when profit re-enters the
  org. Growth is never free: every capability node a player strengthens (org, marketing,
  sales, logistics) adds recurring cost in the Finance node.
- **Three contested bottlenecks** decide the game — attention (awareness ledgers), access
  (shelf slots), and demand (zone pools). All three are shared/finite, so every improvement
  is implicitly *against* the other companies.
- **Dashed edge = render-only**: visible customers consume sales events and never feed
  anything back. Cutting that edge changes nothing economically — which is exactly why it is
  safe for performance and multiplayer.
- **Decay arrows keep it dynamic** (§12): Awareness/Familiarity/Relationships all leak each
  round, so first-to-market momentum must be re-earned, never banked permanently.

## Phase timing over the same graph

| Phase (§14) | Nodes written |
|---|---|
| PLAN | Employees, Capabilities |
| POSITION | Products |
| MARKET | Campaigns → Awareness |
| SELL-IN | Pitches → Shelf; Deliveries → Stock |
| CONSUME | Utility → Units sold → events (visual layer) |
| FINANCE | Revenue, Cash, Victory check |

## Competitive pressure points (where players collide)

1. **Shelf slots** — zero-sum per store; hysteresis ×1.15 protects incumbents (§8).
2. **Segment demand pools** — softmax share: your utility only matters relative to rivals (§13).
3. **Attention share** — awareness is per-company but purchase weighting normalizes across
   competitors present in the zone (§9).
4. **Store relationships** — capped, decaying, and only as wide as sales headcount (§10).
5. **Tie contention** — exact score ties resolve by rotating initiative (§14), never dice.
