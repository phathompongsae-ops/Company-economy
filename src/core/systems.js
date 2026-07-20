// Resolution systems — pure deterministic phase resolvers over GameState.
// Every important decision produces an explainable breakdown into state.debugLog.
import { CITY_V1, PROFILES, TUNING, byId, rngFor } from './state.js';
import { POSITIONS } from './data/roles-v1.js';

const dist2 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const ensureFinance = (co) => (co._finance ??= { revenue: 0, cogs: 0, logistics: 0, salaries: 0, rent: 0, marketing: 0, other: 0 });

// ---------- MARKET phase: campaigns write awareness ledgers (never sales) ----------
export function resolveMarketing(state) {
  for (const co of state.companies) {
    const seen = new Set();
    for (const c of co._plans.campaigns) {
      const fatigue = co.campaignFatigue[c.districtId] || 0;
      const gain = TUNING.campaignAwarenessGain
        * co._caps['marketing.awareness_gain_mult']
        * Math.max(0.2, 1 - TUNING.campaignFatigue * fatigue);
      co.awareness[c.districtId] = Math.min(100, (co.awareness[c.districtId] || 0) + gain);
      co.campaignFatigue[c.districtId] = fatigue + 1;
      seen.add(c.districtId);
      state.eventLog.push({ t: 'CampaignVisualEvent', round: state.round, companyId: co.id, districtId: c.districtId, gain: +gain.toFixed(1) });
    }
    for (const d of CITY_V1.districts) {
      if (!seen.has(d.id)) co.campaignFatigue[d.id] = 0;              // fatigue resets after a pause
      co.awareness[d.id] = Math.max(0, (co.awareness[d.id] || 0) * (1 - TUNING.awarenessDecay));
      co.familiarity[d.id] = Math.max(0, (co.familiarity[d.id] || 0) * (1 - TUNING.familiarityDecay));
    }
  }
}

// ---------- SELL-IN phase: relationships, store decisions (shelf), deliveries ----------
export function resolveSellIn(state) {
  const rng = rngFor(state);
  // 1) relationships from assigned accounts (distance-loaded), decay for unassigned
  for (const co of state.companies) {
    const assigned = new Set(co._plans.accounts.map((a) => a.storeId));
    for (const store of state.stores) {
      const cur = co.relationships[store.id] || 0;
      co.relationships[store.id] = assigned.has(store.id)
        ? Math.min(TUNING.relationshipCap, cur + co._caps['sales.relationship_gain'])
        : Math.max(0, cur - TUNING.relationshipDecayUnassigned);
    }
  }
  // 2) store decisions: incumbents + pitched offers scored; explainable; hysteresis; no RNG
  for (const store of state.stores) {
    const offers = [];
    for (const slot of store.shelf) {
      offers.push({ companyId: slot.companyId, productId: slot.productId, incumbent: true, slot });
    }
    for (const co of state.companies) {
      for (const p of co._plans.pitches.filter((p) => p.storeId === store.id)) {
        if (!offers.some((o) => o.companyId === co.id && o.productId === p.productId)) {
          offers.push({ companyId: co.id, productId: p.productId, incumbent: false });
        }
      }
    }
    if (!offers.length) continue;
    for (const o of offers) o.score = storeScore(state, store, o);
    // deterministic order: score desc, incumbents keep hysteresis edge, ties by initiative
    const initiative = state.companies[state.initiativeIndex].id;
    offers.sort((a, b) => {
      const ah = a.incumbent ? a.score.total * TUNING.incumbentHysteresis : a.score.total;
      const bh = b.incumbent ? b.score.total * TUNING.incumbentHysteresis : b.score.total;
      if (bh !== ah) return bh - ah;
      if (a.companyId !== b.companyId) return a.companyId === initiative ? -1 : b.companyId === initiative ? 1 : a.companyId < b.companyId ? -1 : 1;
      return a.productId < b.productId ? -1 : 1;
    });
    const kept = offers.slice(0, store.shelfCapacity);
    const dropped = store.shelf.filter((s) => !kept.some((k) => k.incumbent && k.slot === s));
    for (const d of dropped) state.eventLog.push({ t: 'ShelfDropped', round: state.round, storeId: store.id, companyId: d.companyId, productId: d.productId });
    store.shelf = kept.map((k) => k.incumbent
      ? k.slot
      : { companyId: k.companyId, productId: k.productId, stock: 0, sinceRound: state.round });
    for (const k of kept.filter((k) => !k.incumbent)) state.eventLog.push({ t: 'ShelfWon', round: state.round, storeId: store.id, companyId: k.companyId, productId: k.productId });
    state.debugLog.push({ t: 'StoreDecision', round: state.round, storeId: store.id,
      offers: offers.map((o) => ({ companyId: o.companyId, productId: o.productId, incumbent: o.incumbent, ...o.score })) });
  }
  // 3) deliveries: shipments fill shelf stock; reliability failures are seeded + logged
  for (const co of state.companies) {
    for (const sh of co._plans.shipments) {
      const store = byId(state.stores, sh.storeId);
      const slot = store.shelf.find((s) => s.companyId === co.id && s.productId === sh.productId);
      const cost = Math.round(TUNING.shipmentBaseCost + sh.dist * TUNING.shipmentPerTile * co._caps['logistics.cost_mult']);
      co.cash -= cost;
      ensureFinance(co).logistics += cost;
      if (!slot) { state.eventLog.push({ t: 'DeliveryWasted', round: state.round, companyId: co.id, storeId: store.id, reason: 'no shelf slot' }); continue; }
      if (rng() > co._caps['logistics.reliability']) {
        state.eventLog.push({ t: 'DeliveryFailed', round: state.round, companyId: co.id, storeId: store.id });
        co.relationships[store.id] = Math.max(0, (co.relationships[store.id] || 0) - 8);
        continue;
      }
      slot.stock += sh.units;
      // COGS is a REAL cash cost paid when goods ship (fix: it was ledger-only before,
      // which made production free in cash terms and broke every margin tradeoff)
      const goodsCost = sh.units * POSITIONS[byId(co.products, sh.productId).position].unitCost;
      co.cash -= goodsCost;
      ensureFinance(co).cogs += goodsCost;
      state.eventLog.push({ t: 'DeliveryEvent', round: state.round, companyId: co.id, storeId: store.id, units: sh.units });
    }
  }
}

// Store Score v1 — explainable: demand x margin x relationship (+history, +reliability).
export function storeScore(state, store, offer) {
  const co = byId(state.companies, offer.companyId);
  const prod = byId(co.products, offer.productId);
  const expectedUnits = estimateDemand(state, store, co, prod);
  const margin = prod.price * TUNING.storeMarginShare;
  const rel = co.relationships[store.id] || 0;
  const hist = store.history[offer.productId];
  const histBonus = hist ? Math.min(10, hist.unitsLastRound * 0.5) : 0;
  const reliab = co._caps['logistics.reliability'];
  const total = expectedUnits * margin * (1 + rel / 200) * (0.7 + 0.3 * reliab) + histBonus;
  return { expectedUnits: +expectedUnits.toFixed(1), margin: +margin.toFixed(1), relationship: rel, histBonus, reliability: +reliab.toFixed(2), total: +total.toFixed(1) };
}

// Demand estimate = walk the store's real catchment (actual consumer agents in range) and
// count plausible buyers of this product. Same utility math the consumers use — store
// expectations and consumer behavior can never drift apart.
export function estimateDemand(state, store, co, prod) {
  let est = 0;
  for (const c of allConsumers(state)) {
    const d = dist2(c, store);
    if (d > PROFILES[c.profileId].maxTravel) continue;
    const u = productUtility(state, c, co, prod, d);
    if (u.total > TUNING.buyThreshold * 0.85) est += PROFILES[c.profileId].qty * 0.7;
  }
  return est * store.trafficMult;
}

// ---------- CONSUME phase: real consumer agents choose store+product ----------
export function resolveConsumers(state) {
  const rng = rngFor(state);
  // deterministic per-round sequence so every PurchaseEvent has a unique, stable id the
  // replay layer can hang visuals on (same seed -> same ids, across save/resume too)
  let purchaseSeq = 0;
  // hotels rotate a fresh batch of tourist agents every round (temporary economic entities)
  state.touristsThisRound = [];
  for (const b of CITY_V1.buildings.filter((b) => b.kind === 'hotel')) {
    for (let i = 0; i < b.touristsPerRound; i++) {
      state.touristsThisRound.push({ id: `t-${state.round}-${b.id}-${i}`, homeBuildingId: b.id, profileId: b.touristProfile, tourist: true, x: b.x, y: b.y });
    }
  }
  for (const consumer of allConsumers(state)) {
    const prof = PROFILES[consumer.profileId];
    if (rng() > prof.needChance) continue;                     // no need this round
    // evaluate every (store-in-range, shelf slot with stock) pair
    const options = [];
    for (const store of state.stores) {
      const d = dist2(consumer, store);
      if (d > prof.maxTravel) continue;
      for (const slot of store.shelf) {
        if (slot.stock <= 0) continue;
        const co = byId(state.companies, slot.companyId);
        const prod = byId(co.products, slot.productId);
        const u = productUtility(state, consumer, co, prod, d, rng);
        options.push({ store, slot, co, prod, u, d });
      }
    }
    options.sort((a, b) => b.u.total - a.u.total || (a.store.id < b.store.id ? -1 : 1));
    const best = options[0];
    if (!best || best.u.total < TUNING.buyThreshold) {
      state.debugLog.push({ t: 'NoPurchase', round: state.round, consumerId: consumer.id, best: best ? { store: best.store.id, product: best.prod.id, ...best.u } : null });
      continue;
    }
    const qty = Math.min(prof.qty, best.slot.stock);
    best.slot.stock -= qty;
    const revenue = +(qty * best.prod.price * (1 - TUNING.storeMarginShare)).toFixed(2);
    best.co.cash += revenue;
    best.co.cumulativeRevenue += revenue;
    best.co.unitsSoldTotal += qty;
    ensureFinance(best.co).revenue += revenue;
    const district = best.store.district;
    best.co.familiarity[district] = Math.min(TUNING.familiarityCap, (best.co.familiarity[district] || 0) + TUNING.familiarityPerSale * qty);
    const h = best.store.history[best.prod.id] || (best.store.history[best.prod.id] = { unitsLastRound: 0, totalUnits: 0, stockouts: 0 });
    h._thisRound = (h._thisRound || 0) + qty;
    state.eventLog.push({ t: 'PurchaseEvent', eventId: `pe-r${state.round}-${purchaseSeq++}`, round: state.round, consumerId: consumer.id, from: consumer.homeBuildingId, storeId: best.store.id, companyId: best.co.id, productId: best.prod.id, qty, revenue });
    state.debugLog.push({ t: 'ConsumerChoice', round: state.round, consumerId: consumer.id, profile: consumer.profileId,
      chosen: { storeId: best.store.id, productId: best.prod.id, dist: best.d, ...best.u },
      alternatives: options.slice(1, 4).map((o) => ({ storeId: o.store.id, productId: o.prod.id, dist: o.d, total: o.u.total })) });
  }
  // stockout accounting + history roll
  for (const store of state.stores) {
    for (const slot of store.shelf) {
      if (slot.stock === 0) {
        const h = store.history[slot.productId];
        if (h && h._thisRound) h.stockouts++;
      }
    }
    for (const h of Object.values(store.history)) {
      h.unitsLastRound = h._thisRound || 0;
      h.totalUnits += h.unitsLastRound;
      delete h._thisRound;
    }
  }
}

// Consumer product utility — additive, per-term, explainable. Distance shapes but never
// hard-decides ("nearest always wins" is impossible: brand/price/quality can outweigh it).
export function productUtility(state, consumer, co, prod, d, rng) {
  const prof = PROFILES[consumer.profileId];
  const pos = POSITIONS[prod.position];
  const priceFit = Math.max(0, 1 - Math.abs(prod.price - prof.idealPrice) / (prof.idealPrice * 1.2));
  const qualityFit = pos.quality / 100;
  const homeDistrict = CITY_V1.buildings.find((b) => b.id === consumer.homeBuildingId).district;
  const aw = (co.awareness[homeDistrict] || 0) / 100;
  const fam = (co.familiarity[homeDistrict] || 0) / 100;
  const brand = aw * (0.6 + 0.4 * fam);
  const distPenalty = d * prof.distSens;
  const noise = rng ? (rng() - 0.5) * 2 * TUNING.softmaxNoise : 0;
  const total = +(prof.wPrice * priceFit + prof.wQuality * qualityFit + prof.wBrand * brand - distPenalty + noise).toFixed(4);
  return { priceFit: +priceFit.toFixed(3), qualityFit, brand: +brand.toFixed(3), distPenalty: +distPenalty.toFixed(3), noise: +noise.toFixed(3), total };
}

export function allConsumers(state) { return state.consumers.concat(state.touristsThisRound); }

// ---------- FINANCE phase ----------
export function resolveFinance(state) {
  for (const co of state.companies) {
    ensureFinance(co); const salaries = co.employees.reduce((s, e) => s + (e.roleId === 'president' ? 0 : roleSalary(e.roleId)), 0);
    const rent = co.hqPlotId ? CITY_V1.hqPlots.find((p) => p.id === co.hqPlotId).rentPerRound : 0;
    co.cash -= salaries + rent;
    co._finance.salaries = salaries; co._finance.rent = rent;
    state.eventLog.push({ t: 'Finance', round: state.round, companyId: co.id, ...co._finance, cash: +co.cash.toFixed(1) });
    if (co.cash < 0 && co.employees.length > 1) {           // insolvency: unpaid staff leave
      co.employees.pop();
      co.insolvent = true;
      state.eventLog.push({ t: 'InsolvencyDownsize', round: state.round, companyId: co.id });
    }
  }
}

import { ROLES } from './data/roles-v1.js';
function roleSalary(roleId) { return ROLES[roleId].salary; }
