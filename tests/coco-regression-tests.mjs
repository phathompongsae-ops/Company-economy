#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createInitialState, byId, CITY_V1 } from '../src/core/state.js';
import { beginPlanningPhase, resolveRound } from '../src/core/round.js';
import { applyAction } from '../src/core/actions.js';
import { TUNING } from '../src/core/data/roles-v1.js';
import { runMatch } from '../src/sim/run.js';
import { buildSellingTimeline } from '../src/replay/timeline.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.stack || String(error) }); }
}
function setupCompany(seed = 701) {
  const state = createInitialState(seed, ['A', 'B']);
  beginPlanningPhase(state);
  const company = state.companies[0];
  assert.equal(applyAction(state, { companyId: company.id, type: 'ChooseCompanyLocation', plotId: 'plot-central' }).ok, true);
  assert.equal(applyAction(state, { companyId: company.id, type: 'SetProductPosition', position: 'economy' }).ok, true);
  return { state, company };
}

test('action validation: non-finite prices are rejected without corrupting product state', () => {
  for (const badPrice of [NaN, Infinity, -Infinity]) {
    const { state, company } = setupCompany();
    const product = company.products[0];
    const before = product.price;
    const result = applyAction(state, { companyId: company.id, type: 'SetPrice', productId: product.id, price: badPrice });
    assert.equal(result.ok, false);
    assert.match(result.reason, /finite number/);
    assert.equal(product.price, before);
    assert.equal(Number.isFinite(product.price), true);
  }
});

test('action validation: shipment quantities must be positive whole units and rejection preserves the slot', () => {
  for (const badUnits of [-100, -1, 0, 1.5, NaN, Infinity]) {
    const { state, company } = setupCompany();
    const product = company.products[0];
    const beforeSlots = company._budget.shipments;
    const result = applyAction(state, { companyId: company.id, type: 'AssignLogistics', storeId: 'store-mall', productId: product.id, units: badUnits });
    assert.equal(result.ok, false, `units ${String(badUnits)} should be rejected`);
    assert.match(result.reason, /positive integer/);
    assert.equal(company._budget.shipments, beforeSlots, 'invalid quantity must not consume a shipment slot');
    assert.equal(company._plans.shipments.length, 0);
  }
});

test('action validation: legal shipments remain capped and cannot create negative stock or COGS', () => {
  const { state, company } = setupCompany();
  const product = company.products[0];
  const store = byId(state.stores, 'store-mall');
  store.shelf.push({ companyId: company.id, productId: product.id, stock: 0, sinceRound: 0 });
  const queued = applyAction(state, { companyId: company.id, type: 'AssignLogistics', storeId: store.id, productId: product.id, units: TUNING.shipmentMaxUnits + 100 });
  assert.equal(queued.ok, true);
  assert.equal(company._plans.shipments[0].units, TUNING.shipmentMaxUnits);
  resolveRound(state);
  assert(store.shelf[0].stock >= 0);
  assert(company._finance.cogs >= 0);
  assert(state.eventLog.filter((event) => event.t === 'DeliveryEvent').every((event) => event.units > 0));
});

test('victory tie-break: exact ties follow the complete rotating initiative order for 2–4 companies', () => {
  for (const count of [2, 3, 4]) {
    for (let initiativeIndex = 0; initiativeIndex < count; initiativeIndex++) {
      const names = ['A', 'B', 'C', 'D'].slice(0, count);
      const state = createInitialState(800 + count * 10 + initiativeIndex, names, { revenueTarget: 999999, maxRounds: 1 });
      state.initiativeIndex = initiativeIndex;
      const expected = Array.from({ length: count }, (_, offset) => state.companies[(initiativeIndex + offset) % count].id);
      beginPlanningPhase(state);
      resolveRound(state);
      const gameEnd = state.eventLog.find((event) => event.t === 'GameEnd');
      assert(gameEnd, 'max-round tie must end the game');
      assert.equal(state.winnerId, expected[0]);
      assert.deepEqual(gameEnd.standings.map((entry) => entry.id), expected);
    }
  }
});

test('replay truth linkage: every purchase walker carries a stable authoritative event and visual ID', () => {
  const { state } = runMatch('balanced', 'premium', 909);
  const purchases = state.eventLog.filter((event) => event.t === 'PurchaseEvent');
  assert(purchases.length > 0, 'fixture match must produce purchases');
  assert.equal(new Set(purchases.map((event) => event.eventId)).size, purchases.length, 'purchase event IDs must be unique');
  assert(purchases.every((event) => typeof event.eventId === 'string' && event.eventId.startsWith(`purchase-r${event.round}-`)));
  const ctx = {
    companyPos: Object.fromEntries(state.companies.map((company) => [company.id, { x: company.x, y: company.y }])),
    storePos: Object.fromEntries(CITY_V1.stores.map((store) => [store.id, { x: store.x, y: store.y }])),
    buildingPos: Object.fromEntries(CITY_V1.buildings.map((building) => [building.id, { x: building.x, y: building.y }])),
  };
  const timeline = buildSellingTimeline(purchases, ctx);
  const walkers = timeline.items.filter((item) => item.kind === 'purchase');
  assert.equal(walkers.length, purchases.length);
  const sourceById = new Map(purchases.map((event) => [event.eventId, event]));
  for (const walker of walkers) {
    const source = sourceById.get(walker.eventId);
    assert(source, `missing source event for ${walker.eventId}`);
    assert.equal(walker.visualId, `walker-${walker.eventId}`);
    assert.equal(walker.consumerId, source.consumerId);
    assert.equal(walker.from, source.from);
    assert.equal(walker.storeId, source.storeId);
    assert.equal(walker.companyId, source.companyId);
    assert.equal(walker.productId, source.productId);
    assert.equal(walker.qty, source.qty);
    assert(CITY_V1.buildings.some((building) => building.id === walker.from), 'walker origin must be a real house/condo/hotel');
    assert(CITY_V1.stores.some((store) => store.id === walker.storeId), 'walker destination must be a real store');
  }
});

let passed = 0;
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? '' : `\n${result.error}`}`);
  if (result.ok) passed++;
}
console.log(`\n${passed}/${results.length} independent regression tests passed`);
process.exit(passed === results.length ? 0 : 1);
