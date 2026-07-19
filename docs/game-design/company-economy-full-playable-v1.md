# Company Economy — Full Playable Game v1 (As-Built)

Status: implemented and validated (39/39 automated tests; browser playtests via Playwright:
Human-vs-Bot full match, 1 Human + 3 Bots full match, 2-human hot-seat flow, 4-bot observer
match, save/resume across reload, mobile-like viewport smoke — see balance report v2 for the
simulation evidence).

Entry point: `index.html` (redirects to `ui/hotseat.html`). Serve the repo statically
(`npm run serve`) and open it — the whole match is playable through the UI with no console
and no manual state edits.

## 1. Final core loop

```
Setup (2–4 companies; each slot Human or Bot archetype; seed)
  → per company, round 1: HQ placement (4 plots with real tradeoffs)
  → Planning Phase (tabbed dock: Overview/Hire/Skills/Product/Marketing/Sales/Logistics)
      · humans plan in initiative order with Pass-Device privacy screens
      · bots plan inline at their initiative position via the same applyAction path
  → Submit review (queued plans + spend) → all submitted
  → resolveRound(): MARKET → SELL-IN → CONSUME → FINANCE  (economy fully decided HERE)
  → Selling Phase (~20s replay of the resolved events; x1/x2/x4/Skip — playback only)
  → Round Summary (management-style: revenue, all cost lines, profit, share, notes)
  → next round … → revenue target triggers a final full round → Victory screen
```

## 2. Player modes

- 2–4 companies total; every slot independently Human or Bot.
- Verified: 1H+1B, 1H+3B, 2H hot-seat, 4-bot observer (auto-advance optional).
- Hot-seat privacy: planning screens are per-company with a pass-device screen between
  human turns; queued plans (`_plans`) are never rendered for a non-active company.
- Architecture note for future online play: the core is headless and event-sourced
  (actions in, deterministic resolution out) — a server could own `GameState` and run the
  identical pipeline; the UI already only talks to it through `applyAction`/`resolveRound`.

## 3. Bots

See `company-economy-bot-design-v1.md`. Summary: deterministic utility planners (no RNG),
4 archetypes (Balanced Operator, Price Leader, Brand Builder, Retail Expansion), same
action validation as humans, explainable decisions logged as `BotDecision` entries.

## 4. Economy (v1, post-COGS fix)

- **Real COGS**: goods are paid in cash when shipped (was ledger-only — fixed in this
  package after a cash-conservation test exposed it). Working capital now matters:
  overstocking dead stores strands cash; stockouts on hot stores waste demand.
- Positions: economy ($2 cost, $5–12), mainstream ($3, $10–18), premium ($6, $18–30);
  store keeps 25% of retail price.
- Starting cash 1300; salaries 30–45/round; campaigns $60 with fatigue + decay; shipments
  cost base + per-tile; HQ rent per plot.
- Victory: first to $2400 cumulative revenue triggers one final full round for everyone;
  round cap 14. Tie-breaks: cash, then units, then initiative.
- Typical match: most bot matches run the full 14 rounds; a human match at a relaxed pace
  runs ~40–70 minutes (2–4 min planning + ~20s selling + summary per round).

## 5. Anti-inflation

Validated over 440-match batches (see balance report v2): median end cash ≈ 0–80 vs 1300
starting (money is consumed by real tradeoffs, not accumulated), late-game cash growth
≤ ~13/round, max end cash < 800. Inflation warning metrics are built into the lab
(`analyzeInflation`) and asserted by automated test 38.

## 6. Counterplay (verified in the lab)

- Low price: volume + bulk buyers, but thin margins fund a smaller org; loses premium
  niches. Strongest when demand splits 4 ways (40% win in 4-company), weak head-to-head.
- Premium/brand: highest revenue per unit, needs awareness spend and the east/central
  niche; campaign fatigue + decay cap the spam.
- Retail width: strongest in 2-company (54%), suffers when 3 orgs contest every shelf.
- Balanced: no spike, no weakness — 50% overall but rarely dominates any single suite.
- First-to-market: incumbency + hysteresis + relationship decay = a lead you must keep
  paying for; challengers with better economics displace decayed incumbents (test 16),
  and 13% of lab matches are comebacks (mid-match leader ≠ winner).
- No plot auto-wins (test 2/3); price dumping loses the majority head-to-head (test 15).

## 7. Selling Phase (~20s)

The identity beat. `resolveRound()` finishes BEFORE any animation; `src/replay/timeline.js`
builds a deterministic schedule from the round's real events: campaign pulses → shelf
decisions → delivery vans (HQ→store, fail/wasted feedback) → consumers walking
origin→store (every walker IS a `PurchaseEvent` with consumerId/origin/store/company/qty;
zero fake purchases; residents/tourists get segment-readable outfits) → purchase pops and
store busy pulses. Speeds x1/x2/x4 and Skip only move the playback clock (test 32/33).

## 8. Round Summary

Per-company management report from `src/replay/summary.js`: revenue (count-up), units,
round market share, best store, full cost lines (COGS, salaries, rent, logistics,
marketing, hiring/training/setup), profit, cash, shelf +/-, and tone-tagged notes
("sold out — ship more", "lost shelf", "payroll exceeded cash"). A player can answer
"why did I make/lose money this round" from one screen.

## 9. Victory

Winner banner, full standings (with bot archetype labels), tie-break note, telemetry
export, New Match. Final-round trigger is announced in the summary header and topbar.

## 10. Save / resume

LocalStorage save at every round boundary (post-resolution). Setup screen offers Resume;
resuming restores the exact serialized state (test 36 proves save+resume == continuous
play). Cleared on victory or New Match.

## 11. Known simplifications (v1)

- One product category (beverage), max 2 SKUs, single price per SKU.
- Manhattan distance stands in for road pathing (walkers render L-shaped street paths).
- Logistics is slots/range/reliability abstraction — no warehouse/production chain.
- Hotel tourists are per-round agents (no multi-day stays).
- All-bot observer mode is instant-plan (no fake "thinking" delay).
- Audio: none in v1 (non-blocking by spec).
- Mobile: interaction is tap-friendly and a phone-landscape viewport renders, but NO
  real-device validation was performed (browser viewport emulation only).
