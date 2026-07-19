// Bot archetypes — pure data. Weights shape the same utility scorer for every bot; no
// archetype gets hidden bonuses, extra actions, or rule exceptions. Every knob here is a
// LEGAL preference a human player could also express through the identical action set.
//
// Counterplay by construction (see docs/game-design/company-economy-bot-design-v1.md):
//   price_leader   — economy volume; thin margins, weak brand => loses premium/tourist niches
//   brand_builder  — awareness/premium; expensive, saturates => outsold on volume if unchecked
//   retail_expansion — wide shelf/accounts; salary+logistics burden => deep rivals out-defend key stores
//   balanced_operator — no weakness but no spike; loses any single axis to a specialist

export const ARCHETYPES = {
  balanced_operator: {
    id: 'balanced_operator', label: 'Balanced Operator',
    position: 'mainstream',
    // fraction of the position price band to sit at (0 = floor, 1 = ceiling)
    priceBandPoint: 0.5,
    // hire order — attempted in sequence when cash/reserve allows and a bottleneck exists
    hirePriority: ['sales', 'marketing', 'logistics', 'manager', 'hr'],
    skillPriority: ['sales.pitch_capacity', 'marketing.awareness_gain', 'logistics.delivery_capacity'],
    campaignAppetite: 0.5,      // 0..1 — how eagerly campaign slots get used
    pitchAppetite: 0.6,         // fraction of pitch slots to actually spend per round
    speculativeShipments: 0,    // shipments allowed to stores where only a pitch is pending
    cashReserveRounds: 2,       // keep salaries+rent x N in reserve before discretionary spend
    hqPreference: { storeAccess: 1.0, population: 1.0, cost: 1.0, tourists: 0.5 },
  },
  price_leader: {
    id: 'price_leader', label: 'Price Leader',
    position: 'economy',
    priceBandPoint: 0.45,       // clearly cheapest in town, but priced to fund an org — not the dumping floor
    hirePriority: ['sales', 'logistics', 'manager', 'marketing', 'hr'],
    skillPriority: ['logistics.delivery_capacity', 'sales.pitch_capacity', 'logistics.range'],
    campaignAppetite: 0.2,
    pitchAppetite: 0.8,
    speculativeShipments: 1,
    cashReserveRounds: 1.5,     // runs leaner — volume needs stock on shelves
    hqPreference: { storeAccess: 0.9, population: 1.2, cost: 1.6, tourists: 0.3 },
  },
  brand_builder: {
    id: 'brand_builder', label: 'Brand Builder',
    position: 'premium',
    priceBandPoint: 0.5,     // $24 — premium-buyer ideal-price fit beats squeezing the ceiling
    hirePriority: ['marketing', 'sales', 'logistics', 'hr', 'manager'],
    skillPriority: ['marketing.awareness_gain', 'marketing.extra_campaign', 'sales.relationship'],
    campaignAppetite: 1.0,
    pitchAppetite: 0.5,
    speculativeShipments: 0,
    cashReserveRounds: 1.2,   // campaigns ARE this archetype's core spend — a fat reserve starves its engine
    hqPreference: { storeAccess: 0.8, population: 0.7, cost: 0.6, tourists: 1.4 },
  },
  retail_expansion: {
    id: 'retail_expansion', label: 'Retail Expansion',
    position: 'mainstream',
    priceBandPoint: 0.4,
    hirePriority: ['sales', 'logistics', 'sales', 'manager', 'marketing'],
    skillPriority: ['sales.pitch_capacity', 'logistics.delivery_capacity', 'logistics.range'],
    campaignAppetite: 0.35,
    pitchAppetite: 1.0,
    speculativeShipments: 1,
    cashReserveRounds: 2.2,   // widest org = biggest payroll — needs the deepest buffer
    hqPreference: { storeAccess: 1.5, population: 0.9, cost: 0.8, tourists: 0.6 },
  },
};

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);
