// Scripted strategy scenarios — deliberately simple policies (NOT AI). Each is a function
// (state, co, round) => Action[] used by the headless runner and the balance harness.
import { CITY_V1, byId } from '../core/state.js';
import { POSITIONS, TUNING } from '../core/data/roles-v1.js';

const d2 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function baseOps(state, co, { maxPitches = 2, maxShips = 99, storeFilter = null } = {}) {
  // shared operating plan: pitch best in-range stores, maintain accounts, restock shelves
  const acts = [];
  const caps = co._capsPreview || {};
  let stores = state.stores.filter((s) => d2(co, s) <= (caps['logistics.range'] ?? 18));
  if (storeFilter) stores = stores.filter(storeFilter);
  stores.sort((a, b) => d2(co, a) - d2(co, b));
  const onShelf = new Set();
  for (const s of state.stores) for (const slot of s.shelf) if (slot.companyId === co.id) onShelf.add(s.id);
  let pitches = 0;
  for (const s of stores) {
    if (!onShelf.has(s.id) && pitches < maxPitches && co.products[0]) {
      acts.push({ type: 'PitchStore', storeId: s.id, productId: co.products[0].id });
      pitches++;
    }
    acts.push({ type: 'AssignSales', storeId: s.id });
  }
  let ships = 0;
  for (const s of state.stores) {
    for (const slot of s.shelf) {
      if (slot.companyId === co.id && slot.stock < 12 && ships < maxShips) {
        acts.push({ type: 'AssignLogistics', storeId: s.id, productId: slot.productId, units: 24 });
        ships++;
      }
    }
  }
  return acts;
}

function setup(co, plotPref, position, price) {
  return [
    { type: 'ChooseCompanyLocation', plotId: plotPref },
    { type: 'SetProductPosition', position },
    { type: 'SetPrice', productId: `p-${co.id}-0`, price },
  ];
}

export const SCENARIOS = {
  balanced: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-central', 'mainstream', 14), { type: 'HireEmployee', roleId: 'sales' }];
    const acts = [];
    if (r === 2) acts.push({ type: 'HireEmployee', roleId: 'marketing' });
    if (r === 3) acts.push({ type: 'HireEmployee', roleId: 'logistics' });
    if (r >= 3 && r % 2 === 1) acts.push({ type: 'LaunchMarketing', districtId: 'central' });
    return [...acts, ...baseOps(state, co, { maxPitches: 2 })];
  },
  hr_growth: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-central', 'mainstream', 14), { type: 'HireEmployee', roleId: 'hr' }];
    const acts = [];
    if (r === 2) acts.push({ type: 'HireEmployee', roleId: 'manager' }, { type: 'HireEmployee', roleId: 'sales' });
    if (r === 3) acts.push({ type: 'HireEmployee', roleId: 'marketing' }, { type: 'HireEmployee', roleId: 'logistics' });
    if (r === 4) acts.push({ type: 'HireEmployee', roleId: 'sales' });
    if (r >= 4 && r % 2 === 0) acts.push({ type: 'LaunchMarketing', districtId: 'central' });
    return [...acts, ...baseOps(state, co, { maxPitches: 3 })];
  },
  sales_rush: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-central', 'mainstream', 13), { type: 'HireEmployee', roleId: 'sales' }];
    const acts = [];
    if (r === 2) acts.push({ type: 'HireEmployee', roleId: 'sales' });
    if (r === 4) acts.push({ type: 'HireEmployee', roleId: 'logistics' });
    return [...acts, ...baseOps(state, co, { maxPitches: 4 })];
  },
  marketing_heavy: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-central', 'mainstream', 15), { type: 'HireEmployee', roleId: 'marketing' }];
    const acts = [];
    if (r === 2) acts.push({ type: 'HireEmployee', roleId: 'marketing' });
    for (const d of ['central', 'west', 'east']) acts.push({ type: 'LaunchMarketing', districtId: d });
    if (r === 3) acts.push({ type: 'HireEmployee', roleId: 'sales' });
    return [...acts, ...baseOps(state, co, { maxPitches: 2 })];
  },
  price_dumping: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-outer-west', 'economy', 7), { type: 'HireEmployee', roleId: 'sales' }];
    const acts = [];
    if (r === 3) acts.push({ type: 'HireEmployee', roleId: 'logistics' });
    return [...acts, ...baseOps(state, co, { maxPitches: 3 })];
  },
  premium: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-commercial', 'premium', 24), { type: 'HireEmployee', roleId: 'marketing' }];
    const acts = [];
    if (r === 2) acts.push({ type: 'HireEmployee', roleId: 'sales' });
    if (r >= 2) acts.push({ type: 'LaunchMarketing', districtId: 'east' });
    if (r === 4) acts.push({ type: 'HireEmployee', roleId: 'logistics' });
    return [...acts, ...baseOps(state, co, { storeFilter: (s) => s.district !== 'west', maxPitches: 2 })];
  },
  economy: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-outer-west', 'economy', 8), { type: 'HireEmployee', roleId: 'sales' }];
    const acts = [];
    if (r === 3) acts.push({ type: 'HireEmployee', roleId: 'logistics' });
    if (r === 5) acts.push({ type: 'HireEmployee', roleId: 'marketing' });
    if (r >= 5 && r % 2 === 1) acts.push({ type: 'LaunchMarketing', districtId: 'west' });
    return [...acts, ...baseOps(state, co, { maxPitches: 3 })];
  },
  ftm_rush: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-central', 'mainstream', 12), { type: 'HireEmployee', roleId: 'sales' }];
    const acts = [];
    if (r === 2) acts.push({ type: 'HireEmployee', roleId: 'marketing' });
    if (r === 2 || r === 3) acts.push({ type: 'LaunchMarketing', districtId: 'central' }, { type: 'LaunchMarketing', districtId: 'west' });
    return [...acts, ...baseOps(state, co, { maxPitches: 4 })];
  },
  location_advantage: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-central', 'mainstream', 14), { type: 'HireEmployee', roleId: 'sales' }];
    const acts = [];
    if (r === 3) acts.push({ type: 'HireEmployee', roleId: 'logistics' });
    return [...acts, ...baseOps(state, co, { maxPitches: 3 })];
  },
  tourist_focus: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-commercial', 'premium', 22), { type: 'HireEmployee', roleId: 'marketing' }];
    const acts = [];
    if (r >= 2) acts.push({ type: 'LaunchMarketing', districtId: 'east' });
    if (r === 2) acts.push({ type: 'HireEmployee', roleId: 'sales' });
    return [...acts, ...baseOps(state, co, { storeFilter: (s) => s.district === 'east' || s.type === 'supermarket', maxPitches: 2 })];
  },
  // degenerate-location test policy: far plot + otherwise identical to location_advantage
  location_far: (state, co, r) => {
    if (r === 1) return [...setup(co, 'plot-outer-west', 'mainstream', 14), { type: 'HireEmployee', roleId: 'sales' }];
    const acts = [];
    if (r === 3) acts.push({ type: 'HireEmployee', roleId: 'logistics' });
    return [...acts, ...baseOps(state, co, { maxPitches: 3 })];
  },
};

// second-choice plots so two same-plot scenarios never dead-lock on round 1
export function withPlotFallback(state, co, acts) {
  return acts.map((a) => {
    if (a.type !== 'ChooseCompanyLocation') return a;
    if (!state.companies.some((c) => c.id !== co.id && c.hqPlotId === a.plotId)) return a;
    const taken = new Set(state.companies.map((c) => c.hqPlotId).filter(Boolean));
    const free = CITY_V1.hqPlots.find((p) => !taken.has(p.id));
    return { ...a, plotId: free.id };
  });
}
