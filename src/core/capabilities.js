// CapabilityResolver: folds president baseline + every employee's role baseline + skills
// into one flat capability sheet per company. The ONLY seam between org data and systems.
// Stacking rule: numeric keys = sum of all `add` effects; *_mult keys = 1 + sum of `mult`
// deltas; `unlock` keys = boolean OR (represented as >=1).
import { ROLES, SKILLS } from './data/roles-v1.js';

const NUMERIC_KEYS = [
  'org.recruit_slots', 'org.subordinate_capacity', 'org.max_skill_level',
  'marketing.campaign_slots', 'sales.pitch_slots', 'sales.account_capacity',
  'sales.relationship_gain', 'logistics.shipment_slots', 'logistics.range',
  'logistics.reliability', 'research.zone_visibility', 'research.forecast_depth',
];
const MULT_KEYS = ['hiring.cost_mult', 'marketing.awareness_gain_mult', 'logistics.cost_mult'];

export function computeCapabilities(company) {
  const adds = {}, mults = {}, unlocks = {};
  const apply = (m, times = 1) => {
    if (m.op === 'add') adds[m.key] = (adds[m.key] || 0) + m.value * times;
    else if (m.op === 'mult') mults[m.key] = (mults[m.key] || 0) + m.value * times;
    else if (m.op === 'unlock') unlocks[m.key] = 1;
  };
  for (const emp of company.employees) {
    for (const m of ROLES[emp.roleId].baseline) apply(m);
    for (const [skillId, level] of Object.entries(emp.skills)) {
      for (const m of SKILLS[skillId].effects) apply(m, level);
    }
  }
  const out = {};
  for (const k of NUMERIC_KEYS) out[k] = (adds[k] || 0) + (unlocks[k] ? 1 : 0);
  for (const k of MULT_KEYS) out[k] = 1 + (mults[k] || 0);
  out['logistics.reliability'] = Math.min(1, out['logistics.reliability']);
  return out;
}
