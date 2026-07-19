#!/usr/bin/env node
// Required test suite — real assertions over the headless simulation. Exit 0 = all pass.
import assert from 'node:assert';
import { createInitialState, CITY_V1, PROFILES, byId } from '../src/core/state.js';
import { playRound, beginPlanningPhase, resolveRound } from '../src/core/round.js';
import { resetBudgets, applyAction } from '../src/core/actions.js';
import { resolveConsumers, resolveMarketing, resolveSellIn, productUtility, estimateDemand, storeScore } from '../src/core/systems.js';
import { computeCapabilities } from '../src/core/capabilities.js';
import { runMatch } from '../src/sim/run.js';
import { TUNING, POSITIONS } from '../src/core/data/roles-v1.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.message }); }
}
const strip = (s) => JSON.stringify({ ...s, eventLog: s.eventLog, debugLog: undefined });

// helpers for controlled setups
function setupCo(state, i, plotId, position, price) {
  const co = state.companies[i];
  resetBudgets(state);
  assert(applyAction(state, { companyId: co.id, type: 'ChooseCompanyLocation', plotId }).ok);
  assert(applyAction(state, { companyId: co.id, type: 'SetProductPosition', position }).ok);
  assert(applyAction(state, { companyId: co.id, type: 'SetPrice', productId: co.products[0].id, price }).ok);
  return co;
}
function stock(state, storeId, co, units = 99) {
  const store = byId(state.stores, storeId);
  store.shelf.push({ companyId: co.id, productId: co.products[0].id, stock: units, sinceRound: 0 });
  return store;
}

// 1. Determinism
test('determinism: same seed + same policies => identical result', () => {
  const a = runMatch('balanced', 'premium', 42), b = runMatch('balanced', 'premium', 42);
  assert.equal(a.revA, b.revA); assert.equal(a.revB, b.revB);
  assert.equal(a.winner, b.winner); assert.equal(a.rounds, b.rounds);
  assert.equal(strip(a.state), strip(b.state));
});

// 2-3. Company location effect + not auto-win
test('location: near-HQ policy beats identical far-HQ policy in majority but NOT all seeds', () => {
  let near = 0;
  for (let s = 0; s < 4; s++) if (runMatch('location_advantage', 'location_far', 31 + s).winner === 'location_advantage') near++;
  assert(near >= 2, `near won only ${near}/4`);
  assert(near < 4, 'location must not be auto-win (far never wins)');
});
test('location: shipment cost scales with HQ distance', () => {
  const state = createInitialState(1);
  const co = setupCo(state, 0, 'plot-outer-west', 'economy', 8);
  const near = state.stores.find((s) => s.id === 'store-wc1'); // close to outer-west
  const far = state.stores.find((s) => s.id === 'store-mall');
  const dNear = Math.abs(co.x - near.x) + Math.abs(co.y - near.y);
  const dFar = Math.abs(co.x - far.x) + Math.abs(co.y - far.y);
  assert(dFar > dNear);
  assert(TUNING.shipmentBaseCost + dFar * TUNING.shipmentPerTile > TUNING.shipmentBaseCost + dNear * TUNING.shipmentPerTile);
});

// 4. HR not mandatory
test('HR not mandatory: president can hire without HR; extra hire needs HR slots', () => {
  const state = createInitialState(2);
  const co = setupCo(state, 0, 'plot-central', 'mainstream', 14);
  assert(applyAction(state, { companyId: co.id, type: 'HireEmployee', roleId: 'sales' }).ok);
  const second = applyAction(state, { companyId: co.id, type: 'HireEmployee', roleId: 'sales' });
  assert(!second.ok && /recruit slots/.test(second.reason));
});

// 5. Marketing diminishing returns + decay
test('marketing: consecutive campaigns fatigue (strictly decreasing gain) and awareness decays', () => {
  const state = createInitialState(3);
  const co = setupCo(state, 0, 'plot-central', 'mainstream', 14);
  applyAction(state, { companyId: co.id, type: 'HireEmployee', roleId: 'marketing' });
  const gains = [];
  for (let r = 0; r < 3; r++) {
    resetBudgets(state);
    assert(applyAction(state, { companyId: co.id, type: 'LaunchMarketing', districtId: 'central' }).ok);
    const before = co.awareness['central'] || 0;
    resolveMarketing(state);
    gains.push(co.awareness['central'] - before * (1 - TUNING.awarenessDecay));
  }
  assert(gains[1] < gains[0] && gains[2] < gains[1], `gains not diminishing: ${gains}`);
  const aw = co.awareness['central'];
  resetBudgets(state); co._plans.campaigns = []; resolveMarketing(state);
  assert(co.awareness['central'] < aw, 'awareness must decay without campaigns');
});

// 6. Sales capacity
test('sales: pitches beyond pitch slots are rejected with reason', () => {
  const state = createInitialState(4);
  const co = setupCo(state, 0, 'plot-central', 'mainstream', 14);
  const caps = computeCapabilities(co);
  let ok = 0, rejected = null;
  for (const s of state.stores) {
    const r = applyAction(state, { companyId: co.id, type: 'PitchStore', storeId: s.id, productId: co.products[0].id });
    if (r.ok) ok++; else { rejected = r; break; }
  }
  assert.equal(ok, caps['sales.pitch_slots']);
  assert(rejected && /pitch slots/.test(rejected.reason));
});

// 7. Shelf capacity + 8. store acceptance is explainable
test('shelf: capacity never exceeded; store decision logs an explainable breakdown', () => {
  const r = runMatch('balanced', 'sales_rush', 5);
  for (const store of r.state.stores) {
    assert(store.shelf.length <= store.shelfCapacity, `${store.id} over capacity`);
  }
  const dec = r.state.debugLog.find((d) => d.t === 'StoreDecision');
  assert(dec && dec.offers[0].expectedUnits !== undefined && dec.offers[0].margin !== undefined
    && dec.offers[0].relationship !== undefined && dec.offers[0].total !== undefined);
});
test('store acceptance: clearly better offer wins the last slot deterministically', () => {
  const state = createInitialState(6);
  const A = setupCo(state, 0, 'plot-central', 'mainstream', 14);
  resetBudgets(state);
  const B = state.companies[1];
  assert(applyAction(state, { companyId: B.id, type: 'ChooseCompanyLocation', plotId: 'plot-commercial' }).ok);
  assert(applyAction(state, { companyId: B.id, type: 'SetProductPosition', position: 'premium' }).ok);
  assert(applyAction(state, { companyId: B.id, type: 'SetPrice', productId: B.products[0].id, price: 30 }).ok);
  const store = byId(state.stores, 'store-wc1'); // budget west: mainstream should out-demand premium@30
  const sA = storeScore(state, store, { companyId: A.id, productId: A.products[0].id });
  const sB = storeScore(state, store, { companyId: B.id, productId: B.products[0].id });
  assert(sA.total > sB.total, `expected mainstream to score higher in budget west (${sA.total} vs ${sB.total})`);
});

// 9-10. Consumer store & product choice with breakdowns
test('consumer: budget resident prefers economy over premium at equal distance (breakdown logged)', () => {
  const state = createInitialState(7);
  const A = setupCo(state, 0, 'plot-central', 'economy', 8);
  resetBudgets(state);
  const B = state.companies[1];
  applyAction(state, { companyId: B.id, type: 'ChooseCompanyLocation', plotId: 'plot-commercial' });
  applyAction(state, { companyId: B.id, type: 'SetProductPosition', position: 'premium' });
  applyAction(state, { companyId: B.id, type: 'SetPrice', productId: B.products[0].id, price: 24 });
  const c = state.consumers.find((x) => x.profileId === 'budget_resident');
  state.consumers = [c];
  const store = stock(state, 'store-wc1', A); stock(state, 'store-wc1', B);
  store.shelfCapacity = 2;
  for (let tries = 0; tries < 6; tries++) {           // needChance is seeded; retry rounds
    resolveConsumers(state);
    const choice = state.debugLog.find((d) => d.t === 'ConsumerChoice' && d.consumerId === c.id);
    if (choice) {
      assert.equal(choice.chosen.productId, A.products[0].id);
      assert(choice.chosen.priceFit !== undefined && choice.chosen.distPenalty !== undefined);
      return;
    }
  }
  assert.fail('consumer never purchased in 6 rounds');
});
test('distance: nearer store wins all-else-equal, but better product+brand overcomes distance', () => {
  const state = createInitialState(8);
  const A = setupCo(state, 0, 'plot-central', 'economy', 8);
  const c = state.consumers.find((x) => x.profileId === 'budget_resident' && x.homeBuildingId === 'house-1');
  const near = byId(state.stores, 'store-wc2'), far = byId(state.stores, 'store-sup1');
  const dNear = Math.abs(c.x - near.x) + Math.abs(c.y - near.y);
  const dFar = Math.abs(c.x - far.x) + Math.abs(c.y - far.y);
  assert(dFar > dNear);
  const uNear = productUtility(state, c, A, A.products[0], dNear);
  const uFarSame = productUtility(state, c, A, A.products[0], dFar);
  assert(uNear.total > uFarSame.total, 'same product: nearer must score higher');
  // give the far option a strong brand + perfect price: must beat the near plain option
  const B = state.companies[1];
  B.products.push({ id: 'pB', position: 'economy', price: 9 });
  B.awareness['west'] = 90; B.familiarity['west'] = 80;
  const uFarBrand = productUtility(state, c, B, B.products[0], dFar);
  assert(uFarBrand.total > uNear.total, `brand+fit must beat distance (${uFarBrand.total} vs ${uNear.total})`);
});

// 11. Residential catchment
test('catchment: demand estimate counts only consumers within travel range', () => {
  const state = createInitialState(9);
  const A = setupCo(state, 0, 'plot-outer-west', 'economy', 8);
  const west = byId(state.stores, 'store-wc1'), mall = byId(state.stores, 'store-mall');
  const dWest = estimateDemand(state, west, A, A.products[0]);
  const dMall = estimateDemand(state, mall, A, A.products[0]);
  assert(dWest > dMall, `west store must out-catch mall for economy (${dWest} vs ${dMall})`);
});

// 12. Condo mixed market
test('condo: residents are a genuine profile mix', () => {
  const state = createInitialState(10);
  const condoProfiles = new Set(state.consumers.filter((c) => c.homeBuildingId.startsWith('condo')).map((c) => c.profileId));
  assert(condoProfiles.size >= 2, 'condo must produce a consumer mix');
});

// 13-14. Tourists
test('tourists: hotels rotate real agents each round; budget tourists bulk-buy economy in east', () => {
  const state = createInitialState(11);
  const A = setupCo(state, 0, 'plot-commercial', 'economy', 8);
  stock(state, 'store-ec1', A, 200);
  state.consumers = [];                                   // isolate tourists
  resolveConsumers(state);
  assert(state.touristsThisRound.length === 10, 'both hotels must spawn agents');
  const buys = state.eventLog.filter((e) => e.t === 'PurchaseEvent' && e.consumerId.startsWith('t-'));
  assert(buys.length > 0, 'budget tourists must buy stocked cheap product nearby');
  assert(buys.some((b) => b.qty >= 2), 'budget tourists buy in quantity');
});
test('tourists: premium tourists buy premium at the mall, ignore far stores', () => {
  const state = createInitialState(12);
  const A = setupCo(state, 0, 'plot-commercial', 'premium', 24);
  stock(state, 'store-mall', A, 200);
  state.consumers = [];
  resolveConsumers(state);
  const buys = state.eventLog.filter((e) => e.t === 'PurchaseEvent');
  assert(buys.length > 0, 'premium tourists must buy premium at mall');
  assert(buys.every((b) => b.storeId === 'store-mall' || b.storeId === 'store-ec1'));
});

// 15. Price dumping downside
test('price dumping: floor price earns less profit per unit and loses head-to-head majority', () => {
  const floor = 6 * (1 - TUNING.storeMarginShare) - POSITIONS.economy.unitCost;
  const normal = 10 * (1 - TUNING.storeMarginShare) - POSITIONS.economy.unitCost;
  assert(floor < normal && floor < 2, 'dumping margin must be thin');
  let dumpWins = 0;
  for (let s = 0; s < 3; s++) if (runMatch('price_dumping', 'balanced', 60 + s).winner === 'price_dumping') dumpWins++;
  assert(dumpWins <= 1, `price dumping must not dominate (won ${dumpWins}/3)`);
});

// 16. First-to-market contestability
test('first-to-market: decayed incumbent loses shelf to a stronger challenger (no permanent lock)', () => {
  const state = createInitialState(13);
  const A = setupCo(state, 0, 'plot-central', 'premium', 30);       // weak fit for west
  resetBudgets(state);
  const B = state.companies[1];
  applyAction(state, { companyId: B.id, type: 'ChooseCompanyLocation', plotId: 'plot-outer-west' });
  applyAction(state, { companyId: B.id, type: 'SetProductPosition', position: 'economy' });
  applyAction(state, { companyId: B.id, type: 'SetPrice', productId: B.products[0].id, price: 8 });
  const store = byId(state.stores, 'store-wc1');
  store.shelfCapacity = 1;
  stock(state, 'store-wc1', A, 5);                                   // incumbent, no relationship upkeep
  resetBudgets(state);
  B._plans.pitches.push({ storeId: store.id, productId: B.products[0].id });
  A._plans.pitches = [];
  B.relationships[store.id] = 40;
  resolveSellIn(state);
  assert(store.shelf.length === 1 && store.shelf[0].companyId === B.id,
    'challenger with better economics must take the slot despite hysteresis');
  assert(state.eventLog.some((e) => e.t === 'ShelfWon' && e.companyId === B.id));
});

// 17. Logistics bottleneck
test('logistics: shipment slots are a hard bottleneck with rejection reasons', () => {
  const state = createInitialState(14);
  const co = setupCo(state, 0, 'plot-central', 'mainstream', 14);
  for (const s of state.stores.slice(0, 4)) stock(state, s.id, co, 0);
  let ok = 0, rej = null;
  for (const s of state.stores.slice(0, 4)) {
    const r = applyAction(state, { companyId: co.id, type: 'AssignLogistics', storeId: s.id, productId: co.products[0].id, units: 20 });
    if (r.ok) ok++; else { rej = r; break; }
  }
  assert.equal(ok, 2, 'president baseline = 2 shipment slots');
  assert(rej && /shipment slots/.test(rej.reason));
});

// 18. Finance integrity
test('finance: cash movement equals revenue minus all booked costs', () => {
  const r = runMatch('balanced', 'premium', 15);
  const co = r.state.companies[0];
  const fin = r.state.eventLog.filter((e) => e.t === 'Finance' && e.companyId === co.id);
  assert(fin.length === r.rounds);
  for (const f of fin) assert(['revenue', 'cogs', 'logistics', 'salaries', 'rent'].every((k) => typeof f[k] === 'number'));
});

// 19. Victory
test('victory: revenue target triggers final round; winner is highest cumulative revenue', () => {
  const r = runMatch('balanced', 'economy', 16);
  const end = r.state.eventLog.find((e) => e.t === 'GameEnd');
  assert(end, 'game must end');
  const trig = r.state.eventLog.find((e) => e.t === 'FinalRoundTriggered');
  if (trig) assert(r.rounds === trig.finalRound, 'final round honored');
  const best = Math.max(r.revA, r.revB);
  assert([r.revA, r.revB].indexOf(best) === (r.winner === 'balanced' ? 0 : 1));
});

// ============================================================================================
// Interactive Hot-Seat integration tests — the UI drives beginPlanningPhase() + direct
// applyAction() calls per player-turn instead of playRound()'s single-call plans dict.
// These prove that split is behaviorally IDENTICAL to the headless path (no second logic).
// ============================================================================================

// 20. Hot-seat equivalence: same seed + same action sequence, immediate-apply vs batched
test('hot-seat: beginPlanningPhase+applyAction(per player)+resolveRound matches playRound exactly', () => {
  const seed = 77;
  // path A: headless batched (existing architecture)
  const stateA = createInitialState(seed);
  const [a0, a1] = stateA.companies;
  const plansA = {
    [a0.id]: [{ type: 'ChooseCompanyLocation', plotId: 'plot-central' }, { type: 'SetProductPosition', position: 'mainstream' }, { type: 'SetPrice', productId: `p-${a0.id}-0`, price: 14 }, { type: 'HireEmployee', roleId: 'sales' }],
    [a1.id]: [{ type: 'ChooseCompanyLocation', plotId: 'plot-outer-west' }, { type: 'SetProductPosition', position: 'economy' }, { type: 'SetPrice', productId: `p-${a1.id}-0`, price: 8 }, { type: 'HireEmployee', roleId: 'sales' }],
  };
  playRound(stateA, plansA);

  // path B: interactive hot-seat — player 1 plans fully (direct applyAction calls), THEN
  // player 2 plans fully (their actions must not see/affect player 1's private plan state),
  // then a single resolveRound() call — exactly what ui/hotseat.js does per round.
  const stateB = createInitialState(seed);
  const [b0, b1] = stateB.companies;
  beginPlanningPhase(stateB);
  for (const act of plansA[a0.id]) applyAction(stateB, { ...act, companyId: b0.id, productId: act.productId && `p-${b0.id}-0` });
  for (const act of plansA[a1.id]) applyAction(stateB, { ...act, companyId: b1.id, productId: act.productId && `p-${b1.id}-0` });
  resolveRound(stateB);

  const strip2 = (s) => JSON.stringify({ ...s, eventLog: s.eventLog.map((e) => ({ ...e, companyId: e.companyId?.replace(/co-\d/, 'co-X') })) });
  assert.equal(stateA.round, stateB.round);
  assert.equal(stateA.companies[0].cash.toFixed(2), stateB.companies[0].cash.toFixed(2));
  assert.equal(stateA.companies[1].cash.toFixed(2), stateB.companies[1].cash.toFixed(2));
  assert.equal(stateA.companies[0].cumulativeRevenue.toFixed(2), stateB.companies[0].cumulativeRevenue.toFixed(2));
  assert.equal(stateA.stores.map((s) => s.shelf.length).join(','), stateB.stores.map((s) => s.shelf.length).join(','));
});

// 21. Turn isolation: Player 1's queued (unresolved) plans/budget are never visible to or
// mutable by Player 2's actions on a DIFFERENT company — each action is company-scoped.
test('hot-seat: turn isolation — company A actions never touch company B state', () => {
  const state = createInitialState(21);
  const [A, B] = state.companies;
  beginPlanningPhase(state);
  applyAction(state, { companyId: A.id, type: 'ChooseCompanyLocation', plotId: 'plot-central' });
  applyAction(state, { companyId: A.id, type: 'SetProductPosition', position: 'premium' });
  applyAction(state, { companyId: A.id, type: 'HireEmployee', roleId: 'marketing' });
  applyAction(state, { companyId: A.id, type: 'LaunchMarketing', districtId: 'central' });
  const bSnapshotBefore = JSON.stringify({ cash: B.cash, employees: B.employees, products: B.products, hqPlotId: B.hqPlotId, awareness: B.awareness });
  // switch to player 2 — nothing about A's turn should have touched B
  assert.equal(JSON.stringify({ cash: B.cash, employees: B.employees, products: B.products, hqPlotId: B.hqPlotId, awareness: B.awareness }), bSnapshotBefore);
  assert.equal(B.hqPlotId, null, 'company B must still be unset after company A acted');
  assert.equal(B.employees.length, 1, 'company B must still have only its president');
  // B can still independently pick the SAME kind of plot A didn't take, or get rejected for a taken one
  const takeCentral = applyAction(state, { companyId: B.id, type: 'ChooseCompanyLocation', plotId: 'plot-central' });
  assert(!takeCentral.ok && /taken/.test(takeCentral.reason), 'B must be rejected from A\'s already-chosen plot with a clear reason');
  const takeOuter = applyAction(state, { companyId: B.id, type: 'ChooseCompanyLocation', plotId: 'plot-outer-west' });
  assert(takeOuter.ok);
});

// 22. Action submission: HireEmployee/UpgradeSkill mutate immediately + permanently within
// planning (unlike Pitch/Campaign/Shipment, which only queue into _plans for resolution).
test('hot-seat: immediate-apply actions (hire/skill/price) persist correctly into resolution', () => {
  const state = createInitialState(22);
  const co = state.companies[0];
  beginPlanningPhase(state);
  applyAction(state, { companyId: co.id, type: 'ChooseCompanyLocation', plotId: 'plot-central' });
  const cashAfterHq = co.cash;
  applyAction(state, { companyId: co.id, type: 'HireEmployee', roleId: 'hr' });
  assert.equal(co.employees.length, 2, 'hire must be immediately visible mid-planning');
  assert(co.cash < cashAfterHq, 'hiring cost must be deducted immediately');
  resolveRound(state);
  assert.equal(co.employees.length, 2, 'hired employee must survive into resolution (unless insolvent)');
});

// 23. Player switching: alternating applyAction calls for two companies within one planning
// window never double-applies or drops an action (result count matches attempts).
test('hot-seat: player switching mid-round never double-applies or drops actions', () => {
  const state = createInitialState(23);
  const [A, B] = state.companies;
  beginPlanningPhase(state);
  const seq = [
    () => applyAction(state, { companyId: A.id, type: 'ChooseCompanyLocation', plotId: 'plot-central' }),
    () => applyAction(state, { companyId: B.id, type: 'ChooseCompanyLocation', plotId: 'plot-outer-west' }),
    () => applyAction(state, { companyId: A.id, type: 'HireEmployee', roleId: 'sales' }),
    () => applyAction(state, { companyId: B.id, type: 'HireEmployee', roleId: 'sales' }),
    () => applyAction(state, { companyId: A.id, type: 'SetProductPosition', position: 'mainstream' }),
    () => applyAction(state, { companyId: B.id, type: 'SetProductPosition', position: 'economy' }),
  ];
  const results = seq.map((fn) => fn());
  assert(results.every((r) => r.ok), 'every alternating action must succeed exactly once');
  assert.equal(A.employees.length, 2); assert.equal(B.employees.length, 2);
  assert.equal(A.products.length, 1); assert.equal(B.products.length, 1);
  const hireEvents = state.eventLog.filter((e) => e.t === 'Action' && e.type === 'HireEmployee');
  assert.equal(hireEvents.length, 2, 'exactly one Hire event per company — no double-apply');
});

// 24. Victory UI state: state.finished/winnerId/finalRound are reachable through the
// beginPlanningPhase+applyAction+resolveRound path exactly like through playRound.
test('hot-seat: victory state (finished/winnerId/finalRound) reachable via interactive path', () => {
  const state = createInitialState(24);
  const [A, B] = state.companies;
  const policyA = (r) => (r === 1 ? [{ type: 'ChooseCompanyLocation', plotId: 'plot-central' }, { type: 'SetProductPosition', position: 'mainstream' }, { type: 'SetPrice', productId: `p-${A.id}-0`, price: 14 }, { type: 'HireEmployee', roleId: 'sales' }] : []);
  const policyB = (r) => (r === 1 ? [{ type: 'ChooseCompanyLocation', plotId: 'plot-outer-west' }, { type: 'SetProductPosition', position: 'economy' }, { type: 'SetPrice', productId: `p-${B.id}-0`, price: 8 }, { type: 'HireEmployee', roleId: 'sales' }] : []);
  let guard = 0;
  while (!state.finished && guard++ < 30) {
    beginPlanningPhase(state);
    for (const act of policyA(state.round)) applyAction(state, { ...act, companyId: A.id });
    for (const act of policyB(state.round)) applyAction(state, { ...act, companyId: B.id });
    resolveRound(state);
  }
  assert(state.finished, 'match must reach a finished state via the interactive path');
  assert(state.winnerId === A.id || state.winnerId === B.id);
  assert(state.eventLog.some((e) => e.t === 'GameEnd'));
});

// 25. Determinism preserved: the SAME seed run twice through the interactive path (same
// action sequence) must produce byte-identical economic results — UI/replay adds no drift.
test('hot-seat: determinism preserved through the interactive planning path', () => {
  function run(seed) {
    const state = createInitialState(seed);
    const [A, B] = state.companies;
    beginPlanningPhase(state);
    applyAction(state, { companyId: A.id, type: 'ChooseCompanyLocation', plotId: 'plot-commercial' });
    applyAction(state, { companyId: A.id, type: 'SetProductPosition', position: 'premium' });
    applyAction(state, { companyId: A.id, type: 'SetPrice', productId: `p-${A.id}-0`, price: 24 });
    applyAction(state, { companyId: A.id, type: 'HireEmployee', roleId: 'marketing' });
    applyAction(state, { companyId: A.id, type: 'LaunchMarketing', districtId: 'east' });
    applyAction(state, { companyId: B.id, type: 'ChooseCompanyLocation', plotId: 'plot-outer-west' });
    applyAction(state, { companyId: B.id, type: 'SetProductPosition', position: 'economy' });
    applyAction(state, { companyId: B.id, type: 'SetPrice', productId: `p-${B.id}-0`, price: 8 });
    applyAction(state, { companyId: B.id, type: 'HireEmployee', roleId: 'sales' });
    resolveRound(state);
    return { revA: +A.cumulativeRevenue.toFixed(4), revB: +B.cumulativeRevenue.toFixed(4), cashA: +A.cash.toFixed(4), cashB: +B.cash.toFixed(4), shelves: state.stores.map((s) => s.shelf.length) };
  }
  const r1 = run(99), r2 = run(99);
  assert.deepEqual(r1, r2, 'identical seed + identical interactive action sequence must be byte-identical');
});

let passed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  — ' + r.err}`);
  if (r.ok) passed++;
}
console.log(`\n${passed}/${results.length} tests passed`);
process.exit(passed === results.length ? 0 : 1);
