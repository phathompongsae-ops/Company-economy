// Authored small-city map v1 — the strategic board. Positions are AUTHORITATIVE simulation
// data (tile coordinates on a 20x18 grid); Three.js only renders them. Distance metric:
// Manhattan tile distance (deterministic, pathfinding-free stand-in for road distance).
//
// Layout intent: three readable districts with different consumer character —
//   west  = budget residential cluster (houses)
//   central = condo / office-worker cluster
//   east  = hotel & tourism strip
// Stores sit so that NO single HQ plot dominates every store (see plots below).

export const CITY_V1 = {
  grid: { w: 20, h: 18 },
  districts: [
    { id: 'west', name: 'West Residential' },
    { id: 'central', name: 'Central District' },
    { id: 'east', name: 'Hotel East' },
  ],
  buildings: [
    // Houses (~3 residents each; profile skews budget)
    { id: 'house-1', kind: 'house', district: 'west', x: 3, y: 10, residents: 3 },
    { id: 'house-2', kind: 'house', district: 'west', x: 4, y: 12, residents: 3 },
    { id: 'house-3', kind: 'house', district: 'west', x: 5, y: 14, residents: 3 },
    { id: 'house-4', kind: 'house', district: 'west', x: 6, y: 11, residents: 3 },
    { id: 'house-5', kind: 'house', district: 'west', x: 3, y: 13, residents: 3 },
    { id: 'house-6', kind: 'house', district: 'west', x: 6, y: 9, residents: 3 },
    // Condos (5-10 residents; mixed office-worker profile)
    { id: 'condo-1', kind: 'condo', district: 'central', x: 10, y: 5, residents: 7 },
    { id: 'condo-2', kind: 'condo', district: 'central', x: 12, y: 5, residents: 6 },
    { id: 'condo-3', kind: 'condo', district: 'central', x: 11, y: 7, residents: 8 },
    // Hotels (rotating tourists per round, not permanent residents)
    { id: 'hotel-budget', kind: 'hotel', district: 'east', x: 17, y: 9, touristsPerRound: 5, touristProfile: 'tourist_budget' },
    { id: 'hotel-premium', kind: 'hotel', district: 'east', x: 17, y: 5, touristsPerRound: 5, touristProfile: 'tourist_premium' },
  ],
  stores: [
    { id: 'store-wc1', name: 'West Corner', type: 'convenience', district: 'west', x: 5, y: 12, shelfCapacity: 2, trafficMult: 1.0 },
    { id: 'store-wc2', name: 'Old Town Mart', type: 'convenience', district: 'west', x: 4, y: 8, shelfCapacity: 2, trafficMult: 0.9 },
    { id: 'store-cc1', name: 'Condo Corner', type: 'convenience', district: 'central', x: 11, y: 6, shelfCapacity: 2, trafficMult: 1.1 },
    { id: 'store-sup1', name: 'Central Super', type: 'supermarket', district: 'central', x: 10, y: 10, shelfCapacity: 3, trafficMult: 1.2 },
    { id: 'store-sup2', name: 'South Super', type: 'supermarket', district: 'central', x: 12, y: 14, shelfCapacity: 3, trafficMult: 1.0 },
    { id: 'store-ec1', name: 'Beach Mart', type: 'convenience', district: 'east', x: 16, y: 8, shelfCapacity: 2, trafficMult: 1.0 },
    { id: 'store-mall', name: 'Grand Arcade', type: 'mall', district: 'east', x: 17, y: 7, shelfCapacity: 2, trafficMult: 1.1 },
  ],
  // HQ plots — the round-0 strategic choice. Value comes from geometry + cost only
  // (no hidden special-case bonuses), so no plot should dominate: central is close to
  // everything but expensive; outer-west is cheap and owns the west; commercial-east is
  // premium/tourist play; edge-south is cheap-ish with supermarket access.
  hqPlots: [
    { id: 'plot-central', name: 'Central Office', x: 11, y: 10, setupCost: 150, rentPerRound: 25 },
    { id: 'plot-commercial', name: 'Commercial East', x: 14, y: 7, setupCost: 100, rentPerRound: 18 },
    { id: 'plot-outer-west', name: 'Outer West', x: 4, y: 15, setupCost: 40, rentPerRound: 8 },
    { id: 'plot-edge-south', name: 'South Edge', x: 14, y: 15, setupCost: 60, rentPerRound: 10 },
  ],
};

export function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

// Consumer profiles: minimal 4-axis preferences (price / quality / brand / distance).
// House residents skew budget; condos are a mix; tourists are hotel-spawned per round.
export const PROFILES = {
  budget_resident:   { wPrice: 0.50, wQuality: 0.10, wBrand: 0.20, distSens: 0.045, idealPrice: 9,  maxTravel: 10, needChance: 0.80, qty: 2 },
  mainstream_resident:{ wPrice: 0.30, wQuality: 0.25, wBrand: 0.25, distSens: 0.035, idealPrice: 14, maxTravel: 10, needChance: 0.75, qty: 1 },
  premium_resident:  { wPrice: 0.12, wQuality: 0.42, wBrand: 0.26, distSens: 0.030, idealPrice: 22, maxTravel: 11, needChance: 0.70, qty: 1 },
  tourist_budget:    { wPrice: 0.52, wQuality: 0.08, wBrand: 0.15, distSens: 0.070, idealPrice: 8,  maxTravel: 6,  needChance: 0.95, qty: 3 },
  tourist_premium:   { wPrice: 0.10, wQuality: 0.45, wBrand: 0.30, distSens: 0.060, idealPrice: 24, maxTravel: 6,  needChance: 0.90, qty: 1 },
};

// Building kind -> resident profile mix (kept deliberately simple; no demographics sim).
export const BUILDING_MIX = {
  house: [['budget_resident', 0.67], ['mainstream_resident', 0.33]],
  condo: [['budget_resident', 0.2], ['mainstream_resident', 0.55], ['premium_resident', 0.25]],
};
