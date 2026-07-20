// Round-summary builder — pure, renderer-free computation from the round's real events
// and post-resolution state. The UI renders exactly this; tests assert on it directly.
export function summarizeRound(state, roundEvents) {
  const round = state.round;
  const totalUnitsRound = roundEvents.filter((e) => e.t === 'PurchaseEvent').reduce((s, e) => s + e.qty, 0);
  return state.companies.map((co) => {
    const fin = [...roundEvents].reverse().find((e) => e.t === 'Finance' && e.companyId === co.id) || {};
    const buys = roundEvents.filter((e) => e.t === 'PurchaseEvent' && e.companyId === co.id);
    const units = buys.reduce((s, e) => s + e.qty, 0);
    const byStore = {};
    for (const b of buys) byStore[b.storeId] = (byStore[b.storeId] || 0) + b.revenue;
    const bestStoreId = Object.keys(byStore).sort((a, b) => byStore[b] - byStore[a] || (a < b ? -1 : 1))[0] || null;
    const shelfWon = roundEvents.filter((e) => e.t === 'ShelfWon' && e.companyId === co.id).length;
    const shelfLost = roundEvents.filter((e) => e.t === 'ShelfDropped' && e.companyId === co.id).length;
    const deliveriesFailed = roundEvents.filter((e) => e.t === 'DeliveryFailed' && e.companyId === co.id).length;
    const deliveriesWasted = roundEvents.filter((e) => e.t === 'DeliveryWasted' && e.companyId === co.id).length;
    const costs = (fin.cogs || 0) + (fin.salaries || 0) + (fin.rent || 0) + (fin.logistics || 0) + (fin.marketing || 0) + (fin.other || 0);
    const profit = (fin.revenue || 0) - costs;
    // sold-out own slots right now (post-resolution) — a "ship more" signal
    let soldOutSlots = 0, ownSlots = 0;
    for (const s of state.stores) for (const sl of s.shelf) {
      if (sl.companyId !== co.id) continue;
      ownSlots++;
      if (sl.stock === 0) soldOutSlots++;
    }
    const notes = [];
    if (ownSlots === 0) notes.push({ tone: 'warn', text: 'ยังไม่ได้ขึ้นชั้นวางร้านไหนเลย — เข้าเสนอขายร้านค้าเพื่อเริ่มขาย' });
    if (soldOutSlots > 0 && units > 0) notes.push({ tone: 'good', text: `ของหมดที่ชั้นวาง ${soldOutSlots} จุด — ความต้องการสูงกว่าสินค้าที่ส่งไป ลองส่งเพิ่ม` });
    if (deliveriesFailed > 0) notes.push({ tone: 'warn', text: `การจัดส่งล้มเหลว ${deliveriesFailed} ครั้ง — กระทบความน่าเชื่อถือและความสัมพันธ์กับร้านค้า` });
    if (deliveriesWasted > 0) notes.push({ tone: 'warn', text: `การจัดส่งเสียเปล่า ${deliveriesWasted} ครั้ง — ปลายทางไม่มีพื้นที่ชั้นวาง` });
    if (shelfLost > 0) notes.push({ tone: 'warn', text: `เสียพื้นที่ชั้นวางให้คู่แข่ง ${shelfLost} จุด` });
    if (shelfWon > 0) notes.push({ tone: 'good', text: `ได้พื้นที่ชั้นวางใหม่ ${shelfWon} จุด` });
    if (co.insolvent) notes.push({ tone: 'bad', text: 'เงินสดไม่พอจ่ายเงินเดือน — พนักงานลาออกหนึ่งคน รีบสะสมเงินสดสำรองใหม่' });
    if ((fin.revenue || 0) === 0 && round > 1) notes.push({ tone: 'warn', text: 'รอบนี้ไม่มีรายได้เลย — ตรวจดูชั้นวาง สต็อก ราคา และระยะการขาย' });
    return {
      companyId: co.id, name: co.name, round,
      revenue: +(fin.revenue || 0).toFixed(1), units,
      marketShare: totalUnitsRound ? +(units / totalUnitsRound).toFixed(3) : 0,
      cogs: +(fin.cogs || 0).toFixed(1), salaries: +(fin.salaries || 0).toFixed(1),
      rent: +(fin.rent || 0).toFixed(1), logistics: +(fin.logistics || 0).toFixed(1),
      marketing: +(fin.marketing || 0).toFixed(1), other: +(fin.other || 0).toFixed(1),
      profit: +profit.toFixed(1), cash: +co.cash.toFixed(1),
      cumulativeRevenue: +co.cumulativeRevenue.toFixed(1),
      bestStoreId, shelfWon, shelfLost, deliveriesFailed, soldOutSlots, ownSlots,
      notes,
    };
  });
}
