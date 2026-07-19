// Roles + skills v1 — every effect is a data-driven Modifier folded by capabilities.js.
// No resolver ever checks role names or skill levels directly.
// Capability keys (V1): org.recruit_slots, org.subordinate_capacity, org.max_skill_level,
//   hiring.cost_mult, marketing.campaign_slots, marketing.awareness_gain_mult,
//   sales.pitch_slots, sales.account_capacity, sales.relationship_gain,
//   logistics.shipment_slots, logistics.range, logistics.cost_mult, logistics.reliability,
//   research.zone_visibility (unlock)

export const ROLES = {
  president: {
    id: 'president', salary: 0, hiringCost: 0, skillSlots: 1,
    baseline: [ // the reason NO role (incl. HR) is mandatory: the president can always act
      { key: 'org.recruit_slots', op: 'add', value: 1 },
      { key: 'org.subordinate_capacity', op: 'add', value: 3 },
      { key: 'org.max_skill_level', op: 'add', value: 1 },
      { key: 'sales.pitch_slots', op: 'add', value: 1 },
      { key: 'sales.account_capacity', op: 'add', value: 2 },
      { key: 'sales.relationship_gain', op: 'add', value: 6 },
      { key: 'logistics.shipment_slots', op: 'add', value: 2 },
      { key: 'logistics.range', op: 'add', value: 10 },
      { key: 'logistics.reliability', op: 'add', value: 0.9 },
    ],
  },
  hr:        { id: 'hr', salary: 35, hiringCost: 80, skillSlots: 2, baseline: [
    { key: 'org.recruit_slots', op: 'add', value: 1 },
    { key: 'hiring.cost_mult', op: 'mult', value: -0.2 },
    { key: 'org.max_skill_level', op: 'add', value: 1 },
  ]},
  manager:   { id: 'manager', salary: 40, hiringCost: 90, skillSlots: 2, baseline: [
    { key: 'org.subordinate_capacity', op: 'add', value: 4 },
  ]},
  marketing: { id: 'marketing', salary: 45, hiringCost: 90, skillSlots: 2, baseline: [
    { key: 'marketing.campaign_slots', op: 'add', value: 1 }, // campaigns literally require the role
  ]},
  sales:     { id: 'sales', salary: 45, hiringCost: 90, skillSlots: 2, baseline: [
    { key: 'sales.pitch_slots', op: 'add', value: 2 },
    { key: 'sales.account_capacity', op: 'add', value: 3 },
    { key: 'sales.relationship_gain', op: 'add', value: 4 },
  ]},
  logistics: { id: 'logistics', salary: 45, hiringCost: 90, skillSlots: 2, baseline: [
    { key: 'logistics.shipment_slots', op: 'add', value: 3 },
    { key: 'logistics.range', op: 'add', value: 8 },
    { key: 'logistics.cost_mult', op: 'mult', value: -0.15 },
    { key: 'logistics.reliability', op: 'add', value: 0.08 },
  ]},
  analyst:   { id: 'analyst', salary: 30, hiringCost: 70, skillSlots: 1, baseline: [
    { key: 'research.zone_visibility', op: 'unlock', value: 1 },
  ]},
};

export const SKILLS = {
  'hr.recruit_capacity':      { role: 'hr', maxLevel: 2, costPerLevel: [50, 90], effects: [{ key: 'org.recruit_slots', op: 'add', value: 1 }] },
  'hr.hiring_efficiency':     { role: 'hr', maxLevel: 2, costPerLevel: [40, 80], effects: [{ key: 'hiring.cost_mult', op: 'mult', value: -0.1 }] },
  'manager.team_capacity':    { role: 'manager', maxLevel: 2, costPerLevel: [50, 90], effects: [{ key: 'org.subordinate_capacity', op: 'add', value: 2 }] },
  'marketing.awareness_gain': { role: 'marketing', maxLevel: 3, costPerLevel: [45, 75, 120], effects: [{ key: 'marketing.awareness_gain_mult', op: 'mult', value: 0.2 }] },
  'marketing.extra_campaign': { role: 'marketing', maxLevel: 1, costPerLevel: [90], effects: [{ key: 'marketing.campaign_slots', op: 'add', value: 1 }] },
  'sales.pitch_capacity':     { role: 'sales', maxLevel: 2, costPerLevel: [50, 90], effects: [{ key: 'sales.pitch_slots', op: 'add', value: 1 }] },
  'sales.relationship':       { role: 'sales', maxLevel: 2, costPerLevel: [45, 80], effects: [{ key: 'sales.relationship_gain', op: 'add', value: 3 }] },
  'logistics.delivery_capacity': { role: 'logistics', maxLevel: 2, costPerLevel: [50, 90], effects: [{ key: 'logistics.shipment_slots', op: 'add', value: 1 }] },
  'logistics.range':          { role: 'logistics', maxLevel: 2, costPerLevel: [40, 70], effects: [{ key: 'logistics.range', op: 'add', value: 4 }] },
  'logistics.reliability':    { role: 'logistics', maxLevel: 1, costPerLevel: [60], effects: [{ key: 'logistics.reliability', op: 'add', value: 0.05 }] },
  'research.info_accuracy':   { role: 'analyst', maxLevel: 1, costPerLevel: [50], effects: [{ key: 'research.forecast_depth', op: 'add', value: 1 }] },
};

// Product positions (1 category: beverage). Company revenue share = 75% of retail price
// (store keeps 25% as margin) — single-price V1 simplification, logged in decision log.
export const POSITIONS = {
  economy:    { unitCost: 3,  priceRange: [6, 12],  quality: 30 },
  mainstream: { unitCost: 5,  priceRange: [10, 18], quality: 60 },
  premium:    { unitCost: 9, priceRange: [18, 30], quality: 90 },
};

export const TUNING = {
  startingCash: 1000,
  storeMarginShare: 0.25,
  buyThreshold: 0.30,
  softmaxNoise: 0.04,          // tiny seeded per-decision noise; keeps determinism per seed
  awarenessDecay: 0.10,
  campaignCost: 60,
  campaignAwarenessGain: 22,
  campaignFatigue: 0.20,       // -20% effect per consecutive repeat on same district
  familiarityPerSale: 1.2, familiarityCap: 100, familiarityDecay: 0.05,
  relationshipCap: 100, relationshipDecayUnassigned: 5,
  incumbentHysteresis: 1.15,
  shipmentBaseCost: 5, shipmentPerTile: 0.8, shipmentMaxUnits: 30,
  salesFarDistance: 9, salesFarLoad: 1.5,    // far accounts consume 1.5 account capacity
  revenueTarget: 2400, maxRounds: 14,
  supplyCapacityPerRound: 90,
};
