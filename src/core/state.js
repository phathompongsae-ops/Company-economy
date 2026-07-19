// GameState: pure serializable data. Positions, populations, shelves, ledgers — all
// authoritative here; Three.js renders from this and never owns any of it.
import { CITY_V1, PROFILES, BUILDING_MIX, dist } from './data/city-v1.js';
import { TUNING } from './data/roles-v1.js';
import { makeRng } from './rng.js';

let uid = 0;
const nid = (p) => `${p}-${(++uid).toString(36)}`;

// rulesOverrides exists for TEST/BALANCE-LAB CONFIG ONLY (e.g. a lower revenueTarget so an
// accelerated browser playtest reaches victory quickly). Production UI never passes it —
// the shipped balance always comes from TUNING.
export function createInitialState(seed, companyNames = ['Alpha', 'Bravo'], rulesOverrides = {}) {
  uid = 0;
  const rng = makeRng(seed);
  // Real resident consumer agents: every building spawns its population with a home.
  const consumers = [];
  for (const b of CITY_V1.buildings) {
    if (b.kind === 'hotel') continue;
    const mix = BUILDING_MIX[b.kind];
    for (let i = 0; i < b.residents; i++) {
      const roll = rng();
      let acc = 0, profileId = mix[mix.length - 1][0];
      for (const [pid, w] of mix) { acc += w; if (roll < acc) { profileId = pid; break; } }
      consumers.push({ id: nid('c'), homeBuildingId: b.id, profileId, tourist: false, x: b.x, y: b.y });
    }
  }
  const companies = companyNames.map((name, i) => ({
    id: `co-${i}`, name, cash: TUNING.startingCash, cumulativeRevenue: 0, unitsSoldTotal: 0,
    hqPlotId: null, x: null, y: null,
    employees: [{ id: nid('e'), roleId: 'president', skills: {} }],
    products: [],                       // { id, position, price }
    awareness: {},                      // districtId -> 0..100
    familiarity: {},                    // districtId -> 0..100
    relationships: {},                  // storeId -> 0..100
    campaignFatigue: {},                // districtId -> consecutive count
    salesAccounts: [],                  // storeIds maintained this round (assigned in PLAN)
    insolvent: false,
  }));
  const stores = CITY_V1.stores.map((s) => ({
    ...s,
    shelf: [],                          // { companyId, productId, stock, sinceRound }
    history: {},                        // productId -> { unitsLastRound, totalUnits, stockouts }
  }));
  return {
    seed, round: 0, phase: 'SETUP', rngCursor: Math.floor(rng() * 1e9),
    initiativeIndex: 0,
    rules: { revenueTarget: TUNING.revenueTarget, maxRounds: TUNING.maxRounds, ...rulesOverrides },
    companies, stores, consumers,
    touristsThisRound: [],
    eventLog: [], debugLog: [],
    finished: false, finalRound: null, winnerId: null,
  };
}

// ---- save/resume: GameState is pure JSON data, so (de)serialization is a straight
// round-trip. Scratch fields (_plans/_caps/_budget/_finance) are plain data too and are
// rebuilt by beginPlanningPhase anyway; round-boundary saves never depend on them.
export function serializeState(state) { return JSON.stringify(state); }
export function deserializeState(json) {
  const state = JSON.parse(json);
  if (!state.rules) state.rules = { revenueTarget: TUNING.revenueTarget, maxRounds: TUNING.maxRounds };
  return state;
}

export function rngFor(state) {
  const rng = makeRng(state.rngCursor);
  state.rngCursor = Math.floor(rng() * 1e9) + 1;
  return rng;
}

export const cityDist = dist;
export { CITY_V1, PROFILES, TUNING };
export const byId = (arr, id) => arr.find((o) => o.id === id);
export function hqPlot(id) { return CITY_V1.hqPlots.find((p) => p.id === id); }
export function storePos(store) { return { x: store.x, y: store.y }; }
export function snapshot(state) { return JSON.parse(JSON.stringify(state)); }
