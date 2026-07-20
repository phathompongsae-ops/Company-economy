// Selling-phase timeline builder — PURE presentation scheduling over already-resolved
// economic events. The economy is fully decided by resolveRound() BEFORE this runs;
// nothing here can change a result, and the same events always produce the same
// timeline (deterministic, no RNG, no Date/now). Speed/skip in the renderer only move
// the playback clock over this fixed schedule.
//
// Nominal duration ~20s at x1: campaigns open the round, store/shelf decisions follow,
// deliveries roll out, then the city walks to the stores (every walker IS a real
// PurchaseEvent with consumerId/origin/store/company/qty), and the round closes.

const WINDOW = {
  campaignStart: 0.5, campaignEnd: 3.0,
  shelfStart: 2.0, shelfEnd: 5.0,
  deliveryStart: 3.0, deliveryEnd: 8.0, deliveryTravel: 1.6,
  purchaseStart: 5.0, purchaseDepartEnd: 15.5,
  walkSecPerTile: 0.28, walkMin: 2.0, walkMax: 4.5,
  tail: 1.0,
};

function spread(i, n, start, end) {
  if (n <= 1) return start;
  return start + ((end - start) * i) / (n - 1);
}

// ctx: { companyPos: {companyId:{x,y}}, storePos: {storeId:{x,y}}, buildingPos: {buildingId:{x,y}} }
export function buildSellingTimeline(roundEvents, ctx) {
  const items = [];

  const campaigns = roundEvents.filter((e) => e.t === 'CampaignVisualEvent');
  campaigns.forEach((e, i) => {
    items.push({ t: +spread(i, campaigns.length, WINDOW.campaignStart, WINDOW.campaignEnd).toFixed(2),
      kind: 'campaign', companyId: e.companyId, districtId: e.districtId, gain: e.gain });
  });

  const shelf = roundEvents.filter((e) => e.t === 'ShelfWon' || e.t === 'ShelfDropped');
  shelf.forEach((e, i) => {
    items.push({ t: +spread(i, shelf.length, WINDOW.shelfStart, WINDOW.shelfEnd).toFixed(2),
      kind: e.t === 'ShelfWon' ? 'shelfWon' : 'shelfDropped', companyId: e.companyId, storeId: e.storeId, productId: e.productId });
  });

  const deliveries = roundEvents.filter((e) => e.t === 'DeliveryEvent' || e.t === 'DeliveryFailed' || e.t === 'DeliveryWasted');
  deliveries.forEach((e, i) => {
    const from = ctx.companyPos[e.companyId];
    const to = ctx.storePos[e.storeId];
    items.push({ t: +spread(i, deliveries.length, WINDOW.deliveryStart, WINDOW.deliveryEnd).toFixed(2),
      kind: e.t === 'DeliveryEvent' ? 'delivery' : e.t === 'DeliveryFailed' ? 'deliveryFailed' : 'deliveryWasted',
      companyId: e.companyId, storeId: e.storeId, units: e.units,
      from, to, travel: WINDOW.deliveryTravel });
  });

  const purchases = roundEvents.filter((e) => e.t === 'PurchaseEvent');
  purchases.forEach((e, i) => {
    const from = ctx.buildingPos[e.from];
    const to = ctx.storePos[e.storeId];
    if (!from || !to) return;
    const eventId = e.eventId || `purchase-${e.consumerId}-${e.storeId}-${i}`;
    const dist = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    const walkDur = +Math.min(WINDOW.walkMax, Math.max(WINDOW.walkMin, dist * WINDOW.walkSecPerTile)).toFixed(2);
    items.push({ t: +spread(i, purchases.length, WINDOW.purchaseStart, WINDOW.purchaseDepartEnd).toFixed(2),
      kind: 'purchase', eventId, visualId: `walker-${eventId}`,
      consumerId: e.consumerId, from: e.from, storeId: e.storeId,
      companyId: e.companyId, productId: e.productId, qty: e.qty, revenue: e.revenue,
      fromPos: from, toPos: to, walkDur });
  });

  items.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  let end = 0;
  for (const it of items) {
    const itemEnd = it.kind === 'purchase' ? it.t + it.walkDur : it.kind.startsWith('delivery') ? it.t + (it.travel || 0) : it.t;
    if (itemEnd > end) end = itemEnd;
  }
  return { duration: +(Math.max(6, end + WINDOW.tail)).toFixed(2), items };
}
