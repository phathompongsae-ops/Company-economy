// Utility-based bot player. Fully deterministic (no RNG at all — identical state in,
// identical decisions out), fully legal (every decision goes through the same
// applyAction() validation humans use; rejections are logged, never bypassed), and
// fully explainable (every decision carries a human-readable reason string, logged
// into state.debugLog as BotDecision entries).
//
// FAIRNESS BOUNDARY: decide*() functions read ONLY the BotView built here. The view
// exposes exactly what a hot-seat human can see on screen: the public map/city, public
// store shelves (brands, positions, prices, stock), public company facts (cash/revenue
// are on the shared topbar, org headcount is in the overview panel), plus the bot's OWN
// full company state. It never exposes competitors' relationships, queued _plans, or
// any future RNG.
import { CITY_V1, PROFILES, byId } from '../core/state.js';
import { POSITIONS, TUNING, ROLES, SKILLS } from '../core/data/roles-v1.js';
import { estimateDemand } from '../core/systems.js';
import { applyAction, salesLoad } from '../core/actions.js';
import { computeCapabilities } from '../core/capabilities.js';
import { ARCHETYPES } from './archetypes.js';

const d2 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// ---------------------------------------------------------------------------------------
// BotView — the ONLY window bot logic gets into the game state.
// ---------------------------------------------------------------------------------------
export function buildBotView(state, co) {
  return {
    round: state.round,
    rules: state.rules || { revenueTarget: TUNING.revenueTarget, maxRounds: TUNING.maxRounds },
    self: co, // own company: full read access (same as a human seeing their own panels)
    competitors: state.companies.filter((c) => c.id !== co.id).map((c) => ({
      id: c.id, name: c.name,
      cash: Math.round(c.cash),                       // public: shared topbar
      cumulativeRevenue: Math.round(c.cumulativeRevenue), // public: standings
      employeeCount: c.employees.length,              // public: overview panel
      hqPlotId: c.hqPlotId,                           // public: visible on the map
      products: c.products.map((p) => ({ id: p.id, position: p.position, price: p.price })), // public: store shelves
    })),
    stores: state.stores.map((s) => ({
      id: s.id, name: s.name, type: s.type, district: s.district, x: s.x, y: s.y,
      shelfCapacity: s.shelfCapacity, trafficMult: s.trafficMult,
      shelf: s.shelf.map((sl) => ({ companyId: sl.companyId, productId: sl.productId, stock: sl.stock, sinceRound: sl.sinceRound })),
      ownHistory: Object.fromEntries(Object.entries(s.history).filter(([pid]) => co.products.some((p) => p.id === pid))),
    })),
    takenPlots: new Set(state.companies.map((c) => c.hqPlotId).filter(Boolean)),
    // demand estimator for the bot's OWN products only — the same public-math estimator
    // stores themselves use, so bots read the market exactly as well as the market does.
    estimateOwnDemand: (storeId, prod) => estimateDemand(state, byId(state.stores, storeId), co, prod),
  };
}

// ---------------------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------------------
function unitMargin(prod) {
  return prod.price * (1 - TUNING.storeMarginShare) - POSITIONS[prod.position].unitCost;
}
function bandPrice(position, point) {
  const [lo, hi] = POSITIONS[position].priceRange;
  return Math.round(lo + (hi - lo) * point);
}
function reserveFloor(co, arch) {
  const salaries = co.employees.reduce((s, e) => s + ROLES[e.roleId].salary, 0);
  const rent = co.hqPlotId ? CITY_V1.hqPlots.find((p) => p.id === co.hqPlotId).rentPerRound : 15;
  return (salaries + rent) * arch.cashReserveRounds;
}

export function scoreHqPlot(plot, arch) {
  const range = 10; // president baseline logistics range — what a fresh company can actually serve
  let storeAccess = 0, population = 0, tourists = 0;
  for (const s of CITY_V1.stores) {
    const d = d2(plot, s);
    if (d <= range) storeAccess += s.trafficMult * (1 - d / (range + 4));
  }
  for (const b of CITY_V1.buildings) {
    const d = d2(plot, b);
    if (b.kind === 'hotel') { if (d <= 7) tourists += b.touristsPerRound; }
    else if (d <= 9) population += b.residents;
  }
  const cost = plot.setupCost / 100 + plot.rentPerRound / 10;
  const w = arch.hqPreference;
  const total = storeAccess * 2.2 * w.storeAccess + population * 0.12 * w.population
    + tourists * 0.35 * w.tourists - cost * w.cost;
  return { storeAccess: +storeAccess.toFixed(2), population, tourists, cost: +cost.toFixed(2), total: +total.toFixed(2) };
}

// ---------------------------------------------------------------------------------------
// The planner: BotView + archetype -> ordered [{action, reason}] for one planning phase.
// Tracks its own budget copy so it rarely over-plans (rejections stay legal but rare).
// ---------------------------------------------------------------------------------------
export function decideBotActions(view, arch) {
  const co = view.self;
  const out = [];
  const say = (action, reason) => out.push({ action, reason });

  const budget = {
    recruits: co._budget?.recruits ?? 0,
    campaigns: co._budget?.campaigns ?? 0,
    pitches: co._budget?.pitches ?? 0,
    shipments: co._budget?.shipments ?? 0,
    accountCapacity: co._budget?.accountCapacity ?? 0,
    cash: co.cash,
  };
  const reserve = reserveFloor(co, arch);
  const caps = co._caps || computeCapabilities(co);
  // Emergency brake: cash near/below obligations => stop ALL discretionary spending and
  // sell from what already works. Prevents the hire->salary->insolvency death spiral.
  const emergency = budget.cash < reserve * 0.6;

  // ---- Round 1: HQ + product + price ----
  if (!co.hqPlotId) {
    const ranked = CITY_V1.hqPlots
      .filter((p) => !view.takenPlots.has(p.id))
      .map((p) => ({ p, s: scoreHqPlot(p, arch) }))
      .sort((a, b) => b.s.total - a.s.total || (a.p.id < b.p.id ? -1 : 1));
    if (ranked.length) {
      const { p, s } = ranked[0];
      say({ type: 'ChooseCompanyLocation', plotId: p.id },
        `HQ ${p.name}: access ${s.storeAccess}, pop ${s.population}, tourists ${s.tourists}, cost ${s.cost} (weights: ${arch.id})`);
      budget.cash -= p.setupCost;
    }
  }
  if (!co.products.length) {
    say({ type: 'SetProductPosition', position: arch.position }, `${arch.label} positions as ${arch.position}`);
    const price = bandPrice(arch.position, arch.priceBandPoint);
    say({ type: 'SetPrice', productId: `p-${co.id}-0`, price }, `open at band point ${arch.priceBandPoint}`);
  }

  const prod = co.products[0] || { id: `p-${co.id}-0`, position: arch.position, price: bandPrice(arch.position, arch.priceBandPoint) };

  // ---- Price adaptation (existing product only) ----
  if (co.products.length) {
    const p = co.products[0];
    const [lo, hi] = POSITIONS[p.position].priceRange;
    let target = p.price, why = null;
    const rivalPrices = view.competitors.flatMap((c) => c.products.filter((x) => x.position === p.position).map((x) => x.price));
    if (arch.id === 'price_leader' && rivalPrices.length) {
      const under = Math.min(...rivalPrices) - 1;
      target = Math.max(lo + 1, Math.min(under, bandPrice(p.position, arch.priceBandPoint)));
      why = `undercut rival ${Math.min(...rivalPrices)} while keeping margin`;
      if (target * (1 - TUNING.storeMarginShare) - POSITIONS[p.position].unitCost < 1.2) { target = p.price; why = null; }
    } else {
      // demand signal from own shelf history: everywhere sold out => raise; nothing sold => trim
      let soldOut = 0, slots = 0, sold = 0;
      for (const s of view.stores) {
        for (const sl of s.shelf) {
          if (sl.companyId !== co.id) continue;
          slots++;
          if (sl.stock === 0) soldOut++;
          sold += s.ownHistory[sl.productId]?.unitsLastRound || 0;
        }
      }
      if (slots > 0 && soldOut === slots && sold > 0 && p.price < hi) { target = p.price + 1; why = 'sold out everywhere — price up'; }
      else if (slots > 0 && sold === 0 && view.round > 2 && p.price > lo + 1) { target = p.price - 1; why = 'no sales — price down'; }
    }
    if (why && target !== p.price) say({ type: 'SetPrice', productId: p.id, price: target }, why);
  }

  // ---- Hiring (bottleneck-driven, reserve-guarded) ----
  const roleCount = (roleId) => co.employees.filter((e) => e.roleId === roleId).length;
  const shelvesOwned = view.stores.reduce((n, s) => n + s.shelf.filter((sl) => sl.companyId === co.id).length, 0);
  const offShelfStores = view.stores.filter((s) => !s.shelf.some((sl) => sl.companyId === co.id)).length;
  const needRole = {
    sales: () => (offShelfStores > 0 && caps['sales.pitch_slots'] < 3) || caps['sales.account_capacity'] < shelvesOwned + 2,
    marketing: () => caps['marketing.campaign_slots'] === 0 && arch.campaignAppetite > 0.15,
    logistics: () => caps['logistics.shipment_slots'] < shelvesOwned + (arch.speculativeShipments ? 1 : 0) || (arch.id === 'retail_expansion' && caps['logistics.shipment_slots'] < 5),
    manager: () => co.employees.length - 1 >= caps['org.subordinate_capacity'] - 1,
    hr: () => budget.cash > reserve + 400 && caps['org.recruit_slots'] < 2,
  };
  for (const roleId of arch.hirePriority) {
    if (emergency) break;
    if (budget.recruits <= 0) break;
    if (roleId !== 'sales' && roleCount(roleId) >= 1) continue; // one of each support role is plenty in v1
    if (roleId === 'sales' && roleCount('sales') >= 2) continue;
    if (!needRole[roleId]()) continue;
    const cost = Math.round(ROLES[roleId].hiringCost * caps['hiring.cost_mult']);
    // the new hire's salary runs every round from now on — cover it over the same
    // horizon the reserve covers, or the hire itself causes the insolvency spiral
    const salaryDrag = ROLES[roleId].salary * (arch.cashReserveRounds + 1);
    if (budget.cash - cost - salaryDrag < reserve) continue;
    say({ type: 'HireEmployee', roleId }, `bottleneck: ${roleId} (cash ${Math.round(budget.cash)} > reserve ${Math.round(reserve)})`);
    budget.cash -= cost; budget.recruits--;
  }

  // ---- Skill training (cash-rich only) ----
  if (!emergency && budget.cash > reserve + 250) {
    outer: for (const skillId of arch.skillPriority) {
      const def = SKILLS[skillId];
      for (const emp of co.employees) {
        if (emp.roleId !== def.role) continue;
        const lvl = emp.skills[skillId] || 0;
        if (lvl >= def.maxLevel) continue;
        if (lvl + 1 > caps['org.max_skill_level']) continue;
        if (Object.keys(emp.skills).length >= ROLES[emp.roleId].skillSlots && !emp.skills[skillId]) continue;
        const cost = def.costPerLevel[lvl];
        if (budget.cash - cost < reserve + 150) continue;
        say({ type: 'UpgradeSkill', employeeId: emp.id, skillId }, `invest surplus in ${skillId}`);
        budget.cash -= cost;
        break outer;
      }
    }
  }

  // ---- Pitches: best off-shelf stores in logistics range ----
  const range = caps['logistics.range'];
  const pitchCandidates = view.stores
    .filter((s) => d2(co, s) <= range && !s.shelf.some((sl) => sl.companyId === co.id))
    .map((s) => {
      const demand = view.estimateOwnDemand(s.id, prod);
      const crowd = s.shelf.length / s.shelfCapacity;
      const score = demand * Math.max(0.5, unitMargin(prod)) * (1 - 0.35 * crowd);
      return { s, demand: +demand.toFixed(1), score: +score.toFixed(1) };
    })
    .sort((a, b) => b.score - a.score || (a.s.id < b.s.id ? -1 : 1));
  const pitchTarget = Math.max(1, Math.ceil(budget.pitches * arch.pitchAppetite));
  const pitched = [];
  for (const c of pitchCandidates.slice(0, Math.min(pitchTarget, budget.pitches))) {
    if (c.score <= 0) break;
    say({ type: 'PitchStore', storeId: c.s.id, productId: prod.id },
      `pitch ${c.s.name}: est demand ${c.demand}, crowd ${c.s.shelf.length}/${c.s.shelfCapacity}, score ${c.score}`);
    pitched.push(c.s);
    budget.pitches--;
  }

  // ---- Sales coverage: defend owned shelves first, then support pitches ----
  let load = 0;
  const coverageTargets = [
    ...view.stores.filter((s) => s.shelf.some((sl) => sl.companyId === co.id)).map((s) => ({ s, why: 'defend shelf' })),
    ...pitched.map((s) => ({ s, why: 'support pitch' })),
  ];
  const covered = new Set();
  for (const { s, why } of coverageTargets) {
    if (covered.has(s.id)) continue;
    const l = co.hqPlotId ? salesLoad(co, s) : 1;
    if (load + l > budget.accountCapacity) continue;
    say({ type: 'AssignSales', storeId: s.id }, `${why} at ${s.name}`);
    covered.add(s.id); load += l;
  }

  // ---- Shipments: restock owned shelves by expected sales, then speculative to pitches ----
  const owned = [];
  for (const s of view.stores) {
    for (const sl of s.shelf) {
      if (sl.companyId !== co.id) continue;
      const last = s.ownHistory[sl.productId]?.unitsLastRound || 0;
      // dead store: still has stock but sold nothing last round — don't throw more units at it
      if (view.round > 2 && last === 0 && sl.stock > 0) continue;
      const expected = Math.max(last * 1.3, view.estimateOwnDemand(s.id, prod) * 0.5, 6);
      owned.push({ s, sl, expected, deficit: expected - sl.stock });
    }
  }
  owned.sort((a, b) => b.deficit - a.deficit || (a.s.id < b.s.id ? -1 : 1));
  // emergency: only feed proven sellers (top 3 by last-round units) — cheapest path back to solvency
  const restockList = emergency
    ? owned.filter((o) => (o.s.ownHistory[o.sl.productId]?.unitsLastRound || 0) > 0)
        .sort((a, b) => (b.s.ownHistory[b.sl.productId]?.unitsLastRound || 0) - (a.s.ownHistory[a.sl.productId]?.unitsLastRound || 0) || (a.s.id < b.s.id ? -1 : 1))
        .slice(0, 3)
    : owned;
  for (const o of restockList) {
    if (budget.shipments <= 0) break;
    if (o.deficit <= 2) continue;
    const units = Math.min(TUNING.shipmentMaxUnits, Math.max(10, Math.ceil(o.expected)));
    say({ type: 'AssignLogistics', storeId: o.s.id, productId: o.sl.productId, units },
      `${emergency ? 'EMERGENCY restock proven seller' : 'restock'} ${o.s.name}: stock ${o.sl.stock} < expected ${Math.round(o.expected)}`);
    budget.shipments--;
  }
  const specAllowed = emergency ? 0 : view.round === 1 ? Math.min(2, budget.shipments) : arch.speculativeShipments;
  for (const s of pitched.slice(0, specAllowed)) {
    if (budget.shipments <= 0) break;
    say({ type: 'AssignLogistics', storeId: s.id, productId: prod.id, units: 18 },
      `speculative stock for pitched ${s.name} (${view.round === 1 ? 'round-1 land grab' : 'archetype appetite'})`);
    budget.shipments--;
  }

  // ---- Campaigns: highest-opportunity districts ----
  // high-appetite archetypes run leaner for their core engine: a Brand Builder that
  // never campaigns isn't playing its strategy, it's just a worse Balanced Operator
  const campaignBudgetOk = () => !emergency && budget.cash - TUNING.campaignCost >= reserve * (1 - 0.5 * arch.campaignAppetite);
  const wanted = Math.round(budget.campaigns * arch.campaignAppetite);
  if (wanted > 0 && campaignBudgetOk()) {
    // awareness only converts where we can actually be bought — weight districts by our
    // real shelf presence there, so campaigns compound around our market instead of
    // being sprayed evenly and decaying to nothing
    const presence = new Set();
    for (const s of view.stores) if (s.shelf.some((sl) => sl.companyId === co.id)) presence.add(s.district);
    for (const s of pitched) presence.add(s.district);
    const distScore = CITY_V1.districts.map((d) => {
      let pop = 0;
      for (const b of CITY_V1.buildings) {
        if (b.kind === 'hotel') { if (b.district === d.id) pop += b.touristsPerRound * 2; }
        else if (b.district === d.id) pop += b.residents;
      }
      const gap = 1 - (co.awareness[d.id] || 0) / 100;
      const fat = Math.max(0.2, 1 - TUNING.campaignFatigue * (co.campaignFatigue[d.id] || 0));
      const rel = presence.has(d.id) ? 1 : 0.35;
      return { d, score: +(pop * gap * fat * rel).toFixed(1) };
    }).sort((a, b) => b.score - a.score || (a.d.id < b.d.id ? -1 : 1));
    for (const { d, score } of distScore.slice(0, wanted)) {
      if (!campaignBudgetOk() || budget.campaigns <= 0) break;
      say({ type: 'LaunchMarketing', districtId: d.id }, `campaign ${d.name}: opportunity ${score}`);
      budget.cash -= TUNING.campaignCost; budget.campaigns--;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------------------
// Driver: plan + apply + submit one bot turn. Same applyAction pipeline as human clicks.
// ---------------------------------------------------------------------------------------
export function runBotTurn(state, co, archetypeId) {
  const arch = ARCHETYPES[archetypeId];
  if (!arch) throw new Error(`unknown archetype ${archetypeId}`);
  const view = buildBotView(state, co);
  const decisions = decideBotActions(view, arch);
  const applied = [];
  for (const { action, reason } of decisions) {
    const r = applyAction(state, { ...action, companyId: co.id });
    applied.push({ action: action.type, ok: r.ok, reason, rejection: r.ok ? undefined : r.reason });
  }
  applyAction(state, { companyId: co.id, type: 'SubmitTurn' });
  state.debugLog.push({ t: 'BotDecision', round: state.round, companyId: co.id, archetype: archetypeId, decisions: applied });
  return applied;
}
