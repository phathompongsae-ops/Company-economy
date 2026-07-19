// Action model: validate -> apply -> log, or reject with a reason. The only mutation path.
// Replay-friendly: every accepted action is appended to state.eventLog.
import { ROLES, SKILLS, POSITIONS, TUNING } from './data/roles-v1.js';
import { computeCapabilities } from './capabilities.js';
import { CITY_V1, hqPlot, byId } from './state.js';

function reject(state, action, reason) {
  state.eventLog.push({ t: 'ActionRejected', round: state.round, action: action.type, companyId: action.companyId, reason });
  return { ok: false, reason };
}
function accept(state, action, extra = {}) {
  state.eventLog.push({ t: 'Action', round: state.round, ...action, ...extra });
  return { ok: true };
}

// Per-round action budgets are tracked on a scratch object reset each PLAN phase.
export function resetBudgets(state) {
  for (const co of state.companies) {
    const caps = computeCapabilities(co);
    co._caps = caps;
    co._budget = {
      recruits: caps['org.recruit_slots'],
      campaigns: caps['marketing.campaign_slots'],
      pitches: caps['sales.pitch_slots'],
      shipments: caps['logistics.shipment_slots'],
      accountCapacity: caps['sales.account_capacity'],
    };
    co._plans = { campaigns: [], pitches: [], shipments: [], accounts: [] };
  }
}

export function applyAction(state, action) {
  const co = byId(state.companies, action.companyId);
  if (!co) return reject(state, action, 'unknown company');
  const caps = co._caps || computeCapabilities(co);

  switch (action.type) {
    case 'ChooseCompanyLocation': {
      if (co.hqPlotId) return reject(state, action, 'HQ already chosen');
      const plot = hqPlot(action.plotId);
      if (!plot) return reject(state, action, 'unknown plot');
      if (state.companies.some((c) => c.hqPlotId === action.plotId)) return reject(state, action, 'plot taken');
      if (co.cash < plot.setupCost) return reject(state, action, 'insufficient cash for setup');
      co.cash -= plot.setupCost;
      co.hqPlotId = plot.id; co.x = plot.x; co.y = plot.y;
      return accept(state, action);
    }
    case 'HireEmployee': {
      const role = ROLES[action.roleId];
      if (!role || action.roleId === 'president') return reject(state, action, 'invalid role');
      if (co._budget.recruits <= 0) return reject(state, action, 'no recruit slots left this round');
      const cost = Math.round(role.hiringCost * caps['hiring.cost_mult']);
      if (co.cash < cost) return reject(state, action, 'insufficient cash to hire');
      const headcount = co.employees.length - 1;
      if (headcount + 1 > caps['org.subordinate_capacity']) return reject(state, action, 'organization capacity full (need managers)');
      co.cash -= cost;
      co.employees.push({ id: `e-${co.id}-${co.employees.length}`, roleId: action.roleId, skills: {} });
      co._budget.recruits--;
      resetCompanyCaps(co);
      return accept(state, action, { cost });
    }
    case 'UpgradeSkill': {
      const emp = co.employees.find((e) => e.id === action.employeeId);
      if (!emp) return reject(state, action, 'unknown employee');
      const skill = SKILLS[action.skillId];
      if (!skill || skill.role !== emp.roleId) return reject(state, action, 'skill not available for role');
      const cur = emp.skills[action.skillId] || 0;
      if (cur >= skill.maxLevel) return reject(state, action, 'skill at max level');
      if (cur + 1 > computeCapabilities(co)['org.max_skill_level']) return reject(state, action, 'skill level gated (HR unlocks higher levels)');
      if (Object.keys(emp.skills).length >= ROLES[emp.roleId].skillSlots && !emp.skills[action.skillId]) return reject(state, action, 'no free skill slot');
      const cost = skill.costPerLevel[cur];
      if (co.cash < cost) return reject(state, action, 'insufficient cash to train');
      co.cash -= cost;
      emp.skills[action.skillId] = cur + 1;
      resetCompanyCaps(co);
      return accept(state, action, { cost });
    }
    case 'SetProductPosition': {
      if (co.products.length >= 2 && !co.products.some((p) => p.id === action.productId)) return reject(state, action, 'max 2 SKUs');
      const pos = POSITIONS[action.position];
      if (!pos) return reject(state, action, 'unknown position');
      let prod = co.products.find((p) => p.id === action.productId);
      if (!prod) { prod = { id: action.productId || `p-${co.id}-${co.products.length}`, position: action.position, price: pos.priceRange[0] }; co.products.push(prod); }
      else prod.position = action.position;
      return accept(state, action, { productId: prod.id });
    }
    case 'SetPrice': {
      const prod = co.products.find((p) => p.id === action.productId);
      if (!prod) return reject(state, action, 'unknown product');
      const [lo, hi] = POSITIONS[prod.position].priceRange;
      if (action.price < lo || action.price > hi) return reject(state, action, `price outside ${prod.position} band [${lo},${hi}]`);
      prod.price = action.price;
      return accept(state, action);
    }
    case 'LaunchMarketing': {
      if (co._budget.campaigns <= 0) return reject(state, action, 'no campaign slots (hire marketing)');
      if (!CITY_V1.districts.some((d) => d.id === action.districtId)) return reject(state, action, 'unknown district');
      if (co.cash < TUNING.campaignCost) return reject(state, action, 'insufficient cash for campaign');
      co.cash -= TUNING.campaignCost;
      co._budget.campaigns--;
      co._plans.campaigns.push({ districtId: action.districtId });
      return accept(state, action);
    }
    case 'AssignSales': {
      const store = byId(state.stores, action.storeId);
      if (!store) return reject(state, action, 'unknown store');
      const load = salesLoad(co, store);
      const used = co._plans.accounts.reduce((s, a) => s + a.load, 0);
      if (used + load > co._budget.accountCapacity) return reject(state, action, 'sales account capacity exceeded');
      co._plans.accounts.push({ storeId: store.id, load });
      return accept(state, action, { load });
    }
    case 'PitchStore': {
      if (co._budget.pitches <= 0) return reject(state, action, 'no pitch slots left');
      const store = byId(state.stores, action.storeId);
      const prod = co.products.find((p) => p.id === action.productId);
      if (!store || !prod) return reject(state, action, 'unknown store or product');
      co._budget.pitches--;
      co._plans.pitches.push({ storeId: store.id, productId: prod.id });
      return accept(state, action);
    }
    case 'AssignLogistics': {
      if (co._budget.shipments <= 0) return reject(state, action, 'no shipment slots left');
      const store = byId(state.stores, action.storeId);
      const prod = co.products.find((p) => p.id === action.productId);
      if (!store || !prod) return reject(state, action, 'unknown store or product');
      const d = Math.abs(co.x - store.x) + Math.abs(co.y - store.y);
      if (d > co._caps['logistics.range']) return reject(state, action, `store beyond logistics range (${d} > ${co._caps['logistics.range']})`);
      co._budget.shipments--;
      co._plans.shipments.push({ storeId: store.id, productId: prod.id, units: Math.min(action.units || TUNING.shipmentMaxUnits, TUNING.shipmentMaxUnits), dist: d });
      return accept(state, action, { dist: d });
    }
    case 'SubmitTurn':
      return accept(state, action);
    default:
      return reject(state, action, 'unknown action type');
  }
}

function resetCompanyCaps(co) {
  co._caps = computeCapabilities(co);
}

export function salesLoad(co, store) {
  const d = Math.abs(co.x - store.x) + Math.abs(co.y - store.y);
  return d > TUNING.salesFarDistance ? TUNING.salesFarLoad : 1;
}
