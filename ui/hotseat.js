// Company Economy — Full Playable Game v1 (browser UI)
//
// STRICT RULE: this file and Three.js NEVER decide an economic outcome. Every mutation goes
// through src/core/actions.js#applyAction (humans) or src/bots/bot.js#runBotTurn (bots —
// which itself only calls applyAction); every resolution goes through
// src/core/round.js#resolveRound. The selling-phase replay animates a deterministic
// timeline built AFTER resolution from real events (src/replay/timeline.js) — speed and
// skip only move a playback clock, never a result.
import * as THREE from 'three';
import { createInitialState, serializeState, deserializeState, CITY_V1, byId } from '../src/core/state.js';
import { beginPlanningPhase, resolveRound } from '../src/core/round.js';
import { applyAction, salesLoad } from '../src/core/actions.js';
import { computeCapabilities } from '../src/core/capabilities.js';
import { ROLES, SKILLS, POSITIONS, TUNING } from '../src/core/data/roles-v1.js';
import { runBotTurn } from '../src/bots/bot.js';
import { ARCHETYPES, ARCHETYPE_IDS } from '../src/bots/archetypes.js';
import { buildSellingTimeline } from '../src/replay/timeline.js';
import { summarizeRound } from '../src/replay/summary.js';
import * as PIX from './pixel-art.js';

// ============================================================================================
// Constants / labels
// ============================================================================================
const COMPANY_COLORS = [0xe0533f, 0x3f8fe0, 0xe6b23f, 0x43b06a];
const COMPANY_COLOR_CSS = ['#e0533f', '#3f8fe0', '#e6b23f', '#43b06a'];
const ROLE_LABELS = { president: 'President', hr: 'HR', manager: 'Manager', marketing: 'Marketing', sales: 'Sales', logistics: 'Logistics', analyst: 'Analyst' };
const DISTRICT_LABELS = Object.fromEntries(CITY_V1.districts.map((d) => [d.id, d.name]));
const POSITION_LABELS = { economy: 'Economy', mainstream: 'Mainstream', premium: 'Premium' };
const STORE_TYPE_LABELS = { convenience: 'Convenience Store', supermarket: 'Supermarket', mall: 'Mall Shop' };
const SAVE_KEY = 'company-economy-save-v1';

const CAP_LABEL = {
  'org.recruit_slots': (v) => `Recruit ${v} employee(s) per round`,
  'org.subordinate_capacity': (v) => `Organization capacity: ${v} employees`,
  'org.max_skill_level': (v) => `Train skills up to level ${v}`,
  'hiring.cost_mult': (v) => `Hiring cost x${v.toFixed(2)}`,
  'marketing.campaign_slots': (v) => `Launch ${v} campaign(s) per round`,
  'marketing.awareness_gain_mult': (v) => `Campaign awareness gain x${v.toFixed(2)}`,
  'sales.pitch_slots': (v) => `Pitch ${v} store(s) per round`,
  'sales.account_capacity': (v) => `Sales account capacity: ${v}`,
  'sales.relationship_gain': (v) => `+${v} relationship per assigned store/round`,
  'logistics.shipment_slots': (v) => `Ship to ${v} store(s) per round`,
  'logistics.range': (v) => `Delivery range: ${v} tiles from HQ`,
  'logistics.cost_mult': (v) => `Shipping cost x${v.toFixed(2)}`,
  'logistics.reliability': (v) => `${Math.round(v * 100)}% delivery reliability`,
  'research.zone_visibility': (v) => (v ? `Exact zone demand data unlocked` : null),
  'research.forecast_depth': (v) => (v ? `Deeper demand forecast unlocked` : null),
};
function capLine(key, v) { const f = CAP_LABEL[key]; if (!f) return null; return f(v); }

function buildingBlurb(b) {
  if (b.kind === 'house') return `${b.residents} residents — mostly budget-conscious households.`;
  if (b.kind === 'condo') return `${b.residents} residents — a mix of budget, mainstream, and premium-minded professionals.`;
  if (b.kind === 'hotel') return `${b.touristsPerRound} ${b.touristProfile === 'tourist_budget' ? 'budget-minded' : 'premium-minded'} tourists rotate through here every round.`;
  return '';
}

// ============================================================================================
// Game + UI state
// ============================================================================================
let game = null;
let matchConfig = null;   // { seed, slots: [{type:'human'|'bot', name, archetype}] }
let ui = {
  screen: 'setup',        // setup | transition | hq | planning | selling | summary | victory
  turnQueue: [],          // company indices in initiative order for the current round
  turnPos: 0,
  tab: 'overview',
  selection: null,
  devMode: false,
  speed: 1,
  autoObserver: false,
  toastTimer: null,
  summaryData: null,
};
let telemetry = null;
function resetTelemetry(n) {
  telemetry = { roundsPlayed: 0, actionsPerCompany: Array(n).fill(0), purchases: 0, noPurchases: 0, shelfChanges: 0 };
}

function activeCo() { return game.companies[ui.turnQueue[ui.turnPos]]; }
function activeIdx() { return ui.turnQueue[ui.turnPos]; }
function activeSlot() { return matchConfig.slots[activeIdx()]; }
function humanCount() { return matchConfig ? matchConfig.slots.filter((s) => s.type === 'human').length : 0; }

// ============================================================================================
// DOM helpers
// ============================================================================================
const $panels = document.getElementById('panels');
const $topbar = document.getElementById('topbar');
const $devToggle = document.getElementById('devToggle');
const $devPanel = document.getElementById('devPanel');

const BOOL_ATTRS = new Set(['disabled', 'checked', 'selected', 'readonly', 'required']);
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (BOOL_ATTRS.has(k)) { if (v) e.setAttribute(k, ''); }
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return e;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
let toastEl = null;
function toast(msg, ok = true) {
  if (toastEl) toastEl.remove();
  clearTimeout(ui.toastTimer);
  toastEl = el('div', { id: 'toast' }, msg);
  toastEl.style.borderColor = ok ? '#3d8f5a' : '#8a3a3a';
  document.body.appendChild(toastEl);
  ui.toastTimer = setTimeout(() => { toastEl?.remove(); toastEl = null; }, 2600);
}
function countUp(node, target, { prefix = '$', ms = 600 } = {}) {
  const t0 = performance.now();
  function tick(now) {
    const k = Math.min(1, (now - t0) / ms);
    node.textContent = prefix + Math.round(target * (k * (2 - k)));   // ease-out
    if (k < 1 && node.isConnected) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ============================================================================================
// Three.js scene — pixel-sprite city (presentation only; all positions come from CITY_V1)
// ============================================================================================
const viewportEl = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x232733);
const W = CITY_V1.grid.w, H = CITY_V1.grid.h;
let camSpan = 13;
const camTarget = new THREE.Vector3(W / 2, 0, H / 2);
const camera = new THREE.OrthographicCamera(-camSpan, camSpan, camSpan, -camSpan, 0.1, 100);
function applyCamera() {
  const aspect = innerWidth / Math.max(1, innerHeight);
  camera.left = -camSpan * aspect; camera.right = camSpan * aspect;
  camera.top = camSpan; camera.bottom = -camSpan;
  camera.position.set(camTarget.x + 14, 18, camTarget.z + 14);
  camera.lookAt(camTarget);
  camera.updateProjectionMatrix();
}
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
viewportEl.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffe6c0, 0.7); sun.position.set(6, 12, 4); scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, H + 6), new THREE.MeshLambertMaterial({ color: 0x3a4436 }));
ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -0.05, H / 2); scene.add(ground);
for (const [w, h, x, z] of [[W + 2, 1.6, W / 2, 10.5], [1.6, H + 2, 11, H / 2]]) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0x50555e }));
  road.rotation.x = -Math.PI / 2; road.position.set(x, 0.0, z); scene.add(road);
}
const DISTRICT_TINT = { west: 0x3a4a3a, central: 0x3a3a46, east: 0x463a46 };
const DISTRICT_BOUNDS = { west: [0, 0, 9, H], central: [9, 0, 14, H], east: [14, 0, W, H] };
const districtPlanes = {};
for (const d of CITY_V1.districts) {
  const [x0, y0, x1, y1] = DISTRICT_BOUNDS[d.id];
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshBasicMaterial({ color: DISTRICT_TINT[d.id], transparent: true, opacity: 0.35 }));
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, -0.03, (y0 + y1) / 2); scene.add(m);
  districtPlanes[d.id] = m;
}
const DISTRICT_ANCHOR = { west: { x: 2, y: 6 }, central: { x: 10, y: 3 }, east: { x: 15.4, y: 3.4 } };

// ---- static textures (created ONCE, reused for the app lifetime) ----
const TEX = {
  house: PIX.houseTexture(), condo: PIX.condoTexture(),
  hotelBudget: PIX.hotelTexture(false), hotelPremium: PIX.hotelTexture(true),
  store: { convenience: PIX.storeTexture('convenience'), supermarket: PIX.storeTexture('supermarket'), mall: PIX.storeTexture('mall') },
  hq: COMPANY_COLOR_CSS.map((c) => PIX.hqTexture(c)),
  plot: PIX.plotSignTexture(),
  van: COMPANY_COLOR_CSS.map((c) => PIX.vanTexture(c)),
  billboard: COMPANY_COLOR_CSS.map((c) => PIX.billboardTexture(c)),
  walker: Object.fromEntries(['budget_resident', 'mainstream_resident', 'premium_resident', 'tourist_budget', 'tourist_premium']
    .map((p) => [p, PIX.walkerFrames(p)])),
};
const WALKER_MATS = Object.fromEntries(Object.entries(TEX.walker)
  .map(([p, [a, b]]) => [p, [new THREE.SpriteMaterial({ map: a, transparent: true }), new THREE.SpriteMaterial({ map: b, transparent: true })]]));
const VAN_MATS = TEX.van.map((t) => new THREE.SpriteMaterial({ map: t, transparent: true }));
const BILLBOARD_MATS = TEX.billboard.map((t) => new THREE.SpriteMaterial({ map: t, transparent: true }));
const CHIP_MATS = COMPANY_COLORS.map((c) => new THREE.SpriteMaterial({ color: c }));

const pickables = [];
function addPickSprite(texture, worldH, x, y, pickType, simId) {
  const s = PIX.makeSprite(texture, worldH);
  s.position.set(x, worldH / 2 + 0.02, y);
  s.userData = { pickType, simId };
  scene.add(s); pickables.push(s);
  return s;
}
for (const b of CITY_V1.buildings) {
  const t = b.kind === 'house' ? TEX.house : b.kind === 'condo' ? TEX.condo : (b.touristProfile === 'tourist_premium' ? TEX.hotelPremium : TEX.hotelBudget);
  const hgt = b.kind === 'house' ? 1.1 : b.kind === 'condo' ? 2.2 : 2.5;
  addPickSprite(t, hgt, b.x, b.y, 'building', b.id);
}
const storeSprites = {};
for (const s of CITY_V1.stores) {
  const hgt = s.type === 'convenience' ? 1.2 : s.type === 'supermarket' ? 1.5 : 1.9;
  const sp = addPickSprite(TEX.store[s.type], hgt, s.x, s.y, 'store', s.id);
  sp.userData.baseScale = { x: sp.scale.x, y: sp.scale.y };
  storeSprites[s.id] = sp;
}
const plotSprites = {};
for (const p of CITY_V1.hqPlots) {
  const sp = addPickSprite(TEX.plot, 0.9, p.x, p.y, 'plot', p.id);
  sp.visible = false;
  plotSprites[p.id] = sp;
}
const hqSprites = {};          // companyId -> sprite
const shelfChips = [];         // pooled small colored chips above stores
const billboardSprites = [];   // active campaign markers { sprite, until }

const selectRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 20), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide }));
selectRing.rotation.x = -Math.PI / 2; selectRing.visible = false; scene.add(selectRing);

function syncHqSprites() {
  game.companies.forEach((co, i) => {
    if (co.hqPlotId && !hqSprites[co.id]) {
      const sp = addPickSprite(TEX.hq[i], 2.1, co.x, co.y, 'hq', co.id);
      hqSprites[co.id] = sp;
    }
  });
}
function clearHqSprites() {
  for (const sp of Object.values(hqSprites)) { scene.remove(sp); const i = pickables.indexOf(sp); if (i >= 0) pickables.splice(i, 1); }
  for (const k in hqSprites) delete hqSprites[k];
}
function syncShelfChips() {
  for (const c of shelfChips) c.visible = false;
  let used = 0;
  for (const s of CITY_V1.stores) {
    const store = byId(game.stores, s.id);
    store.shelf.forEach((sl, k) => {
      const ci = game.companies.findIndex((c) => c.id === sl.companyId);
      if (ci < 0) return;
      let chip = shelfChips[used];
      if (!chip) { chip = new THREE.Sprite(CHIP_MATS[0]); chip.scale.set(0.22, 0.22, 1); scene.add(chip); shelfChips.push(chip); }
      chip.material = CHIP_MATS[ci];
      chip.position.set(s.x - 0.3 + k * 0.3, (storeSprites[s.id].userData.baseScale.y) + 0.25, s.y);
      chip.visible = true;
      used++;
    });
  }
}

// ---- pan / zoom / picking ----
let dragging = false, dragStart = null, moved = 0, panStart = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true; moved = 0; dragStart = [e.clientX, e.clientY]; panStart = camTarget.clone();
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStart[0], dy = e.clientY - dragStart[1];
  moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
  if (moved > 4) {
    const scale = camSpan / innerHeight * 2.1;
    camTarget.copy(panStart).add(new THREE.Vector3(-(dx) * scale, 0, -(dy) * scale));
    camTarget.x = Math.max(-4, Math.min(W + 4, camTarget.x));
    camTarget.z = Math.max(-4, Math.min(H + 4, camTarget.z));
    applyCamera();
  }
});
window.addEventListener('pointerup', (e) => {
  if (dragging && moved <= 4) handlePick(e.clientX, e.clientY);
  dragging = false;
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  camSpan = Math.max(6, Math.min(24, camSpan * (e.deltaY > 0 ? 1.08 : 0.92)));
  applyCamera();
}, { passive: false });

const raycaster = new THREE.Raycaster();
function handlePick(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickables.filter((m) => m.visible !== false), false);
  if (!hits.length) return;
  const o = hits[0].object.userData;
  onWorldPick(o.pickType, o.simId);
}
function onWorldPick(kind, id) {
  if (ui.screen === 'hq' && kind === 'plot') { ui.selection = { kind: 'plot', id }; renderScreen(); return; }
  if (kind === 'store' || kind === 'building') { ui.selection = { kind, id }; renderInspector(); return; }
  if (kind === 'hq') { ui.selection = { kind: 'building_hq', id }; renderInspector(); return; }
}
function updateSelectRing() {
  if (!ui.selection) { selectRing.visible = false; return; }
  let pos = null;
  if (ui.selection.kind === 'store') pos = storeSprites[ui.selection.id]?.position;
  else if (ui.selection.kind === 'plot') pos = plotSprites[ui.selection.id]?.position;
  else if (ui.selection.kind === 'building') { const b = CITY_V1.buildings.find((x) => x.id === ui.selection.id); pos = b && new THREE.Vector3(b.x, 0, b.y); }
  if (pos) { selectRing.position.set(pos.x, 0.03, pos.z); selectRing.visible = true; } else selectRing.visible = false;
}

// ============================================================================================
// DOM feedback pops (purchases, deliveries, shelf events) — pooled, projected each frame
// ============================================================================================
const POP_POOL_MAX = 16;
const popPool = [];
function spawnPop(text, worldX, worldY, cls = '') {
  let p = popPool.find((x) => !x.active);
  if (!p) {
    if (popPool.length >= POP_POOL_MAX) return;
    p = { div: el('div', { class: 'world-pop' }), active: false, t: 0, wx: 0, wy: 0 };
    document.body.appendChild(p.div);
    popPool.push(p);
  }
  p.div.className = 'world-pop ' + cls;
  p.div.textContent = text;
  p.active = true; p.t = 0; p.wx = worldX; p.wy = worldY;
  p.div.style.display = 'block';
}
const _v3 = new THREE.Vector3();
function tickPops(dt) {
  for (const p of popPool) {
    if (!p.active) continue;
    p.t += dt;
    if (p.t > 1.3) { p.active = false; p.div.style.display = 'none'; continue; }
    _v3.set(p.wx, 0.8 + p.t * 0.7, p.wy).project(camera);
    p.div.style.left = `${(_v3.x * 0.5 + 0.5) * innerWidth}px`;
    p.div.style.top = `${(-_v3.y * 0.5 + 0.5) * innerHeight}px`;
    p.div.style.opacity = String(Math.max(0, 1 - p.t / 1.3));
  }
}

// ============================================================================================
// Selling-phase replay engine (fixed timeline -> pooled walkers/vans; clock-driven)
// ============================================================================================
const WALKER_POOL_MAX = 80, VAN_POOL_MAX = 14;
const walkerPool = [], vanPool = [];
let replay = null;   // { timeline, clock, nextItem, walkers:[], vans:[], done }

function walkerProfileFor(consumerId) {
  // tourists have per-round generated ids: t-<round>-<hotelId>-<i>
  if (consumerId.startsWith('t-')) return consumerId.includes('premium') ? 'tourist_premium' : 'tourist_budget';
  const c = game.consumers.find((x) => x.id === consumerId);
  return c ? c.profileId : 'mainstream_resident';
}
function getWalker() {
  let w = walkerPool.find((x) => !x.active);
  if (!w) {
    if (walkerPool.length >= WALKER_POOL_MAX) return null;
    const sprite = new THREE.Sprite(WALKER_MATS.mainstream_resident[0]);
    sprite.scale.set(0.5, 0.7, 1);
    sprite.visible = false; scene.add(sprite);
    w = { sprite, active: false };
    walkerPool.push(w);
  }
  return w;
}
function getVan() {
  let v = vanPool.find((x) => !x.active);
  if (!v) {
    if (vanPool.length >= VAN_POOL_MAX) return null;
    const sprite = new THREE.Sprite(VAN_MATS[0]);
    sprite.scale.set(0.8, 0.5, 1);
    sprite.visible = false; scene.add(sprite);
    v = { sprite, active: false };
    vanPool.push(v);
  }
  return v;
}
// L-shaped street path (x first, then y) — matches the Manhattan distance the economy uses
function lPath(from, to, k) {
  const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
  const total = dx + dy || 1;
  const walked = k * total;
  if (walked <= dx) return { x: from.x + Math.sign(to.x - from.x) * walked, y: from.y };
  return { x: to.x, y: from.y + Math.sign(to.y - from.y) * (walked - dx) };
}

function startReplay(roundEvents) {
  const ctx = {
    companyPos: Object.fromEntries(game.companies.map((c) => [c.id, { x: c.x, y: c.y }])),
    storePos: Object.fromEntries(CITY_V1.stores.map((s) => [s.id, { x: s.x, y: s.y }])),
    buildingPos: Object.fromEntries(CITY_V1.buildings.map((b) => [b.id, { x: b.x, y: b.y }])),
  };
  replay = { timeline: buildSellingTimeline(roundEvents, ctx), clock: 0, nextItem: 0, walkers: [], vans: [], done: false };
}
function applyReplayItem(it, instant) {
  const ci = game.companies.findIndex((c) => c.id === it.companyId);
  if (it.kind === 'campaign') {
    if (!instant) {
      const a = DISTRICT_ANCHOR[it.districtId];
      const sp = new THREE.Sprite(BILLBOARD_MATS[ci] ?? BILLBOARD_MATS[0]);
      sp.scale.set(0.9, 1.2, 1);
      sp.position.set(a.x + ci * 0.8, 0.65, a.y);
      scene.add(sp);
      billboardSprites.push({ sprite: sp, until: replay.clock + 4.5 });
      const plane = districtPlanes[it.districtId];
      plane.material.opacity = 0.55;                      // flash; decays in tickReplay
      spawnPop(`${game.companies[ci]?.name}: campaign +${it.gain} awareness`, a.x + 1.5, a.y, 'pop-campaign');
    }
  } else if (it.kind === 'shelfWon' || it.kind === 'shelfDropped') {
    const s = CITY_V1.stores.find((x) => x.id === it.storeId);
    if (!instant) spawnPop(`${game.companies[ci]?.name} ${it.kind === 'shelfWon' ? 'won shelf!' : 'lost shelf'}`, s.x, s.y, it.kind === 'shelfWon' ? 'pop-good' : 'pop-bad');
  } else if (it.kind === 'delivery' || it.kind === 'deliveryFailed' || it.kind === 'deliveryWasted') {
    if (!instant && it.from && it.to) {
      const v = getVan();
      if (v) {
        v.active = true; v.item = it; v.t0 = it.t;
        v.sprite.material = VAN_MATS[ci] ?? VAN_MATS[0];
        v.sprite.visible = true;
        replay.vans.push(v);
      }
    }
  } else if (it.kind === 'purchase') {
    if (!instant) {
      const w = getWalker();
      if (w) {
        const prof = walkerProfileFor(it.consumerId);
        w.active = true; w.item = it; w.prof = prof;
        w.sprite.visible = true;
        replay.walkers.push(w);
      }
    }
  }
}
function tickReplay(dt) {
  if (!replay || replay.done) return;
  replay.clock += dt * ui.speed;
  const items = replay.timeline.items;
  while (replay.nextItem < items.length && items[replay.nextItem].t <= replay.clock) {
    applyReplayItem(items[replay.nextItem], false);
    replay.nextItem++;
  }
  // walkers
  for (const w of replay.walkers) {
    if (!w.active) continue;
    const it = w.item;
    const k = (replay.clock - it.t) / it.walkDur;
    if (k >= 1) {
      w.active = false; w.sprite.visible = false;
      spawnPop(`+$${it.revenue.toFixed(0)} ×${it.qty}`, it.toPos.x, it.toPos.y, 'pop-buy');
      const sp = storeSprites[it.storeId];
      if (sp) sp.userData.pulse = 0.35;
    } else if (k >= 0) {
      const p = lPath(it.fromPos, it.toPos, k);
      w.sprite.position.set(p.x, 0.38, p.y);
      const frame = Math.floor(replay.clock * 6) % 2;
      w.sprite.material = WALKER_MATS[w.prof][frame];
    }
  }
  // vans
  for (const v of replay.vans) {
    if (!v.active) continue;
    const it = v.item;
    const k = (replay.clock - it.t) / it.travel;
    if (k >= 1) {
      v.active = false; v.sprite.visible = false;
      const s = CITY_V1.stores.find((x) => x.id === it.storeId);
      if (it.kind === 'delivery') spawnPop(`+${it.units} units`, s.x, s.y, 'pop-deliver');
      else spawnPop(it.kind === 'deliveryFailed' ? 'delivery FAILED' : 'shipment wasted', s.x, s.y, 'pop-bad');
    } else if (k >= 0) {
      const p = lPath(it.from, it.to, k);
      v.sprite.position.set(p.x, 0.34, p.y);
    }
  }
  // billboards expiry + district flash decay
  for (let i = billboardSprites.length - 1; i >= 0; i--) {
    if (replay.clock > billboardSprites[i].until) { scene.remove(billboardSprites[i].sprite); billboardSprites.splice(i, 1); }
  }
  for (const d of CITY_V1.districts) {
    const m = districtPlanes[d.id];
    if (m.material.opacity > 0.35) m.material.opacity = Math.max(0.35, m.material.opacity - dt * 0.1);
  }
  // store pulses
  for (const sp of Object.values(storeSprites)) {
    if (sp.userData.pulse > 0) {
      sp.userData.pulse = Math.max(0, sp.userData.pulse - dt * 1.2);
      const b = sp.userData.baseScale, k = 1 + sp.userData.pulse * 0.35;
      sp.scale.set(b.x * k, b.y * k, 1);
    }
  }
  const bar = document.getElementById('replayProgress');
  if (bar) bar.style.width = `${Math.min(100, (replay.clock / replay.timeline.duration) * 100)}%`;
  const lbl = document.getElementById('replayPhaseLabel');
  if (lbl) lbl.textContent = replayPhaseLabel();
  if (replay.clock >= replay.timeline.duration) finishReplay();
}
function replayPhaseLabel() {
  const c = replay.clock;
  if (c < 3) return 'Marketing hits the streets…';
  if (c < 5) return 'Stores decide their shelves…';
  if (c < 8) return 'Deliveries roll out…';
  if (c < replay.timeline.duration - 1.5) return 'The city goes shopping…';
  return 'Closing the books…';
}
function finishReplay() {
  if (replay.done) return;
  replay.done = true;
  for (const w of replay.walkers) { w.active = false; w.sprite.visible = false; }
  for (const v of replay.vans) { v.active = false; v.sprite.visible = false; }
  for (const b of billboardSprites) scene.remove(b.sprite);
  billboardSprites.length = 0;
  const btn = document.getElementById('replayContinueBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Continue to Round Summary'; }
  if (humanCount() === 0 && ui.autoObserver) setTimeout(() => { if (ui.screen === 'selling') goToSummary(); }, 700);
}
function skipReplay() {
  if (!replay) return;
  const items = replay.timeline.items;
  while (replay.nextItem < items.length) { applyReplayItem(items[replay.nextItem], true); replay.nextItem++; }
  replay.clock = replay.timeline.duration;
  finishReplay();
}

// ============================================================================================
// Animation loop
// ============================================================================================
let lastTime = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - lastTime) / 1000); lastTime = now;
  if (ui.screen === 'selling') tickReplay(dt);
  tickPops(dt);
  updateSelectRing();
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); applyCamera(); });
renderer.setSize(innerWidth, innerHeight);
applyCamera();

// ============================================================================================
// Save / resume (round-boundary saves; deterministic resume from serialized state)
// ============================================================================================
function saveMatch() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, config: matchConfig, state: serializeState(game) }));
  } catch { /* storage full/blocked — saving is best-effort, never gameplay-critical */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.v !== 1 || !data.config || !data.state) return null;
    return data;
  } catch { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

// ============================================================================================
// Screen: SETUP (match config: 2-4 companies, each Human or Bot)
// ============================================================================================
let setupSlots = [
  { type: 'human', name: 'Alpha Co.', archetype: 'balanced_operator' },
  { type: 'bot', name: 'Bravo Inc.', archetype: 'balanced_operator' },
];
function renderSetup() {
  clear($panels); $topbar.className = 'hidden';
  const save = loadSave();
  const seedInput = el('input', { type: 'number', value: String(Math.floor(Math.random() * 1e6)) });
  const slotsBox = el('div', { class: 'stack' });

  function redrawSlots() {
    clear(slotsBox);
    setupSlots.forEach((slot, i) => {
      const nameInput = el('input', { type: 'text', value: slot.name, style: 'flex:1', oninput: (e) => { slot.name = e.target.value; } });
      const typeSel = el('select', { style: 'width:110px', onchange: (e) => { slot.type = e.target.value; redrawSlots(); } },
        [el('option', { value: 'human', selected: slot.type === 'human' }, 'Human'),
         el('option', { value: 'bot', selected: slot.type === 'bot' }, 'Bot')]);
      const archSel = el('select', { style: 'width:150px', onchange: (e) => { slot.archetype = e.target.value; } },
        ARCHETYPE_IDS.map((a) => el('option', { value: a, selected: slot.archetype === a }, ARCHETYPES[a].label)));
      archSel.style.visibility = slot.type === 'bot' ? 'visible' : 'hidden';
      const removeBtn = el('button', { class: 'danger', disabled: setupSlots.length <= 2, onclick: () => { setupSlots.splice(i, 1); redrawSlots(); } }, '✕');
      slotsBox.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[i]}` }),
        nameInput, typeSel, archSel, removeBtn,
      ]));
    });
    if (setupSlots.length < 4) {
      slotsBox.appendChild(el('button', { onclick: () => {
        const defaults = ['Alpha Co.', 'Bravo Inc.', 'Cobalt Ltd.', 'Dorado LLC'];
        setupSlots.push({ type: 'bot', name: defaults[setupSlots.length] || `Company ${setupSlots.length + 1}`, archetype: ARCHETYPE_IDS[setupSlots.length % ARCHETYPE_IDS.length] });
        redrawSlots();
      } }, '+ Add Company (up to 4)'));
    }
  }
  redrawSlots();

  const card = el('div', { class: 'card' }, [
    el('h2', {}, 'Company Economy'),
    el('p', { class: 'small' }, 'A competitive business strategy game on one small city. 2–4 companies — humans and bots — fight for shelves, customers, and revenue. Choose your HQ, build your organization, read the market, and out-compete everyone.'),
    el('p', { class: 'small', style: 'color:#7fe0a0' }, 'Recommended first test: keep the defaults below (you vs 1 bot) and press Start Match.'),
    save ? el('div', { class: 'employee-row', style: 'border-color:#3f6fe0' }, [
      el('div', { class: 'row between' }, [
        el('b', {}, `Saved match — round ${JSON.parse(save.state).round}, ${save.config.slots.length} companies`),
        el('button', { class: 'primary', onclick: () => resumeMatch(save) }, 'Resume'),
      ]),
    ]) : null,
    el('h3', {}, 'Companies (2–4; each slot Human or Bot)'),
    slotsBox,
    el('h3', {}, 'Match Seed (same seed + same decisions = same outcomes)'),
    seedInput,
    el('div', { class: 'row', style: 'margin-top:16px' }, [
      el('button', { class: 'primary', style: 'flex:1', onclick: () => {
        const seed = parseInt(seedInput.value, 10) || 1;
        startMatch({ seed, slots: setupSlots.map((s) => ({ ...s, name: s.name.trim() || 'Company' })) });
      } }, 'Start Match'),
    ]),
    humanCountOf(setupSlots) === 0 ? el('p', { class: 'small', style: 'color:#e0a35f' }, 'All-bot match: you will observe the competition round by round.') : null,
  ]);
  $panels.appendChild(el('div', { class: 'overlay' }, card));
}
function humanCountOf(slots) { return slots.filter((s) => s.type === 'human').length; }

function startMatch(config) {
  matchConfig = config;
  game = createInitialState(config.seed, config.slots.map((s) => s.name));
  resetTelemetry(config.slots.length);
  clearHqSprites();
  syncShelfChips();
  clearSave();
  ui.autoObserver = humanCount() === 0;
  startRound();
}
function resumeMatch(save) {
  matchConfig = save.config;
  game = deserializeState(save.state);
  resetTelemetry(matchConfig.slots.length);
  clearHqSprites();
  syncHqSprites();
  syncShelfChips();
  if (game.finished) { ui.screen = 'victory'; renderScreen(); return; }
  ui.autoObserver = humanCount() === 0;
  startRound();
}

// ============================================================================================
// Round lifecycle — turn queue in initiative order; humans get screens, bots plan inline
// ============================================================================================
function startRound() {
  beginPlanningPhase(game);
  const n = game.companies.length;
  ui.turnQueue = game.companies.map((_, i) => (game.initiativeIndex + i) % n);
  ui.turnPos = 0;
  advanceTurn();
}
function advanceTurn() {
  if (ui.turnPos >= ui.turnQueue.length) { startResolution(); return; }
  const slot = activeSlot();
  if (slot.type === 'bot') {
    const co = activeCo();
    runBotTurn(game, co, slot.archetype);
    syncHqSprites();
    ui.turnPos++;
    advanceTurn();
    return;
  }
  ui.selection = null;
  ui.screen = 'transition';
  renderScreen();
}
function beginHumanTurn() {
  const co = activeCo();
  ui.screen = co.hqPlotId ? 'planning' : 'hq';
  ui.tab = 'overview';
  ui.selection = null;
  renderScreen();
}
function endActiveTurn() {
  applyAction(game, { companyId: activeCo().id, type: 'SubmitTurn' });
  ui.turnPos++;
  advanceTurn();
}

let resolveEventStart = 0;
function startResolution() {
  resolveEventStart = game.eventLog.length;
  resolveRound(game);
  const roundEvents = game.eventLog.slice(resolveEventStart);
  telemetry.roundsPlayed = game.round;
  telemetry.purchases += roundEvents.filter((e) => e.t === 'PurchaseEvent').length;
  telemetry.shelfChanges += roundEvents.filter((e) => e.t === 'ShelfWon' || e.t === 'ShelfDropped').length;
  ui.summaryData = summarizeRound(game, roundEvents);
  syncHqSprites(); syncShelfChips();
  saveMatch();
  startReplay(roundEvents);
  ui.screen = 'selling';
  ui.speed = 1;
  renderScreen();
}
function goToSummary() { ui.screen = 'summary'; renderScreen(); }
function proceedAfterSummary() {
  if (game.finished) { clearSave(); ui.screen = 'victory'; renderScreen(); return; }
  startRound();
}

// ============================================================================================
// Screen: TRANSITION (pass-device privacy)
// ============================================================================================
function renderTransition() {
  clear($panels); renderTopbar();
  const co = activeCo();
  const i = activeIdx();
  const card = el('div', { class: 'card' }, [
    el('h2', { style: `color:${COMPANY_COLOR_CSS[i]}` }, `Pass the device to ${co.name}`),
    el('p', { class: 'small' }, 'Other companies\' plans stay private until resolution. Make sure no one else is looking at the screen.'),
    el('p', {}, `Round ${game.round} — ${co.hqPlotId ? 'Planning Phase' : 'Choose your HQ first'}`),
    el('button', { class: 'primary', style: 'margin-top:10px', onclick: beginHumanTurn }, `I'm ${co.name} — Begin Turn`),
  ]);
  $panels.appendChild(el('div', { class: 'overlay' }, card));
}

// ============================================================================================
// Screen: HQ PLACEMENT
// ============================================================================================
function renderHq() {
  clear($panels); renderTopbar();
  for (const p of CITY_V1.hqPlots) {
    const taken = game.companies.some((c) => c.hqPlotId === p.id);
    plotSprites[p.id].visible = !taken;
  }
  const co = activeCo();
  const list = el('div', { class: 'stack' });
  for (const p of CITY_V1.hqPlots) {
    const taken = game.companies.some((c) => c.hqPlotId === p.id);
    const takenBy = game.companies.find((c) => c.hqPlotId === p.id);
    const nearbyStores = CITY_V1.stores.filter((s) => Math.abs(s.x - p.x) + Math.abs(s.y - p.y) <= 8).length;
    const nearbyPop = CITY_V1.buildings.filter((b) => b.kind !== 'hotel' && Math.abs(b.x - p.x) + Math.abs(b.y - p.y) <= 8).reduce((s, b) => s + b.residents, 0);
    const selected = ui.selection?.kind === 'plot' && ui.selection.id === p.id;
    list.appendChild(el('div', { class: 'card', style: `position:static; border-color:${selected ? '#ffe066' : '#2c3038'}; ${taken ? 'opacity:.4' : ''}`, onclick: () => { if (!taken) { ui.selection = { kind: 'plot', id: p.id }; renderScreen(); } } }, [
      el('div', { class: 'row between' }, [el('b', {}, p.name), taken ? el('span', { class: 'pill bad' }, `Taken — ${takenBy.name}`) : el('span', { class: 'pill' }, `$${p.setupCost} setup`)]),
      el('p', { class: 'small' }, `Rent $${p.rentPerRound}/round — ${nearbyStores} store(s) in easy range, ~${nearbyPop} nearby residents.`),
    ]));
  }
  const confirm = el('button', { class: 'primary', disabled: !ui.selection || ui.selection.kind !== 'plot', onclick: () => {
    const r = applyAction(game, { companyId: co.id, type: 'ChooseCompanyLocation', plotId: ui.selection.id });
    if (r.ok) {
      telemetry.actionsPerCompany[activeIdx()]++;
      syncHqSprites();
      toast(`${co.name} set up at ${CITY_V1.hqPlots.find((x) => x.id === ui.selection.id).name}`);
      ui.selection = null; ui.screen = 'planning'; ui.tab = 'overview';
      renderScreen();
    } else toast('Cannot place HQ: ' + r.reason, false);
  } }, 'Confirm HQ Location');
  $panels.appendChild(el('div', { class: 'card', style: 'left:12px; top:58px; bottom:12px; width:340px; overflow-y:auto;' }, [
    el('h2', {}, `${co.name} — Choose HQ Location`),
    el('p', { class: 'small' }, 'Click a plot sign on the map or a card below. Location shapes sales reach, delivery cost/range, and rent — not a guaranteed win.'),
    list, confirm,
  ]));
}

// ============================================================================================
// Screen: PLANNING (tabs + submit review)
// ============================================================================================
const TABS = [
  ['overview', 'Overview'], ['hire', 'Hire'], ['skills', 'Skills'], ['product', 'Product'],
  ['marketing', 'Marketing'], ['sales', 'Sales'], ['logistics', 'Logistics'],
];
function renderPlanning() {
  for (const id in plotSprites) plotSprites[id].visible = false;
  clear($panels); renderTopbar();
  const co = activeCo();
  const dock = el('div', { id: 'planDock' });
  const tabs = el('div', { class: 'tabs' });
  for (const [id, label] of TABS) tabs.appendChild(el('button', { class: ui.tab === id ? 'active' : '', onclick: () => { ui.tab = id; renderScreen(); } }, label));
  const body = el('div', { class: 'tabbody' });
  body.appendChild(TAB_RENDERERS[ui.tab](co));
  dock.appendChild(tabs); dock.appendChild(body);
  const humansLeft = ui.turnQueue.slice(ui.turnPos + 1).filter((i) => matchConfig.slots[i].type === 'human').length;
  dock.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [
    el('button', { class: 'primary', style: 'width:100%', onclick: () => openSubmitReview(co, humansLeft) },
      humansLeft > 0 ? 'Review & Pass to Next Company' : 'Review & Resolve Round'),
  ]));
  $panels.appendChild(dock);
  renderInspector();
}
function openSubmitReview(co, humansLeft) {
  const fin = co._finance || {};
  const spent = (fin.marketing || 0) + (fin.other || 0);
  const plans = co._plans || { campaigns: [], pitches: [], shipments: [], accounts: [] };
  const rows = [
    `Campaigns queued: ${plans.campaigns.length}`,
    `Store pitches queued: ${plans.pitches.length}`,
    `Shipments queued: ${plans.shipments.length}`,
    `Sales coverage assigned: ${plans.accounts.length} store(s)`,
    `Spent so far this round (hires/training/campaigns/setup): $${Math.round(spent)}`,
    `Cash remaining: $${Math.round(co.cash)}`,
  ];
  const overlay = el('div', { class: 'overlay' }, el('div', { class: 'card' }, [
    el('h2', {}, `${co.name} — Confirm your round plan`),
    ...rows.map((r) => el('p', { class: 'small' }, r)),
    plans.shipments.length === 0 && game.stores.some((s) => s.shelf.some((sl) => sl.companyId === co.id))
      ? el('p', { class: 'small', style: 'color:#e0a35f' }, 'Heads up: no shipments queued — shelves without stock sell nothing.') : null,
    el('div', { class: 'row', style: 'margin-top:12px' }, [
      el('button', { onclick: () => { overlay.remove(); } }, 'Back to Planning'),
      el('button', { class: 'primary', style: 'flex:1', onclick: () => { overlay.remove(); endActiveTurn(); } },
        humansLeft > 0 ? 'Submit & Pass Device' : 'Submit & Resolve'),
    ]),
  ]));
  document.body.appendChild(overlay);
}

function capabilitiesPreview(co, extraEmployeeRoleId, extraSkill) {
  const before = computeCapabilities(co);
  const clone = { employees: JSON.parse(JSON.stringify(co.employees)) };
  if (extraEmployeeRoleId) clone.employees.push({ id: 'preview', roleId: extraEmployeeRoleId, skills: {} });
  if (extraSkill) { const e = clone.employees.find((x) => x.id === extraSkill.employeeId); if (e) e.skills[extraSkill.skillId] = (e.skills[extraSkill.skillId] || 0) + 1; }
  const after = computeCapabilities(clone);
  const diffs = [];
  for (const k of Object.keys(after)) {
    if (after[k] !== before[k]) { const line = capLine(k, after[k]); if (line) diffs.push(line); }
  }
  return diffs;
}

const TAB_RENDERERS = {
  overview(co) {
    const caps = computeCapabilities(co);
    return el('div', { class: 'card', style: 'position:static' }, [
      el('h2', {}, co.name),
      el('p', {}, [el('b', {}, `$${Math.round(co.cash)}`), ' cash']),
      el('p', { class: 'small' }, `Cumulative revenue: $${Math.round(co.cumulativeRevenue)} / target $${(game.rules || TUNING).revenueTarget} · Units sold: ${co.unitsSoldTotal}`),
      el('p', { class: 'small' }, `HQ: ${co.hqPlotId ? CITY_V1.hqPlots.find((p) => p.id === co.hqPlotId).name : 'not set'}`),
      el('h3', {}, 'What your organization can do this round'),
      ...['org.recruit_slots', 'sales.pitch_slots', 'sales.account_capacity', 'marketing.campaign_slots', 'logistics.shipment_slots', 'logistics.range', 'logistics.reliability']
        .map((k) => el('p', { class: 'cap-line' }, capLine(k, caps[k]))),
      el('h3', {}, 'Employees'),
      ...co.employees.map((e) => el('div', { class: 'employee-row' }, [
        el('div', { class: 'row between' }, [el('b', {}, ROLE_LABELS[e.roleId]), el('span', { class: 'small' }, e.roleId === 'president' ? 'no salary' : `$${ROLES[e.roleId].salary}/round`)]),
        Object.keys(e.skills).length ? el('p', { class: 'tiny' }, 'Skills: ' + Object.entries(e.skills).map(([s, l]) => `${s} Lv${l}`).join(', ')) : null,
      ])),
      el('h3', {}, 'Competitors (public info only)'),
      ...game.companies.filter((c) => c.id !== co.id).map((c) => {
        const i = game.companies.indexOf(c);
        return el('p', { class: 'small' }, [
          el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[i]}` }),
          `${c.name}${matchConfig.slots[i].type === 'bot' ? ` (Bot — ${ARCHETYPES[matchConfig.slots[i].archetype].label})` : ''}: $${Math.round(c.cash)} cash, $${Math.round(c.cumulativeRevenue)} revenue, ${c.employees.length} employee(s), HQ ${c.hqPlotId ? 'set' : 'not set'}.`,
        ]);
      }),
    ]);
  },
  hire(co) {
    const wrap = el('div', { class: 'card', style: 'position:static' }, [el('h2', {}, 'Hire'), el('p', { class: 'small' }, `Recruit slots remaining this round: ${co._budget.recruits}`)]);
    for (const roleId of Object.keys(ROLES)) {
      if (roleId === 'president') continue;
      const role = ROLES[roleId];
      const caps = computeCapabilities(co);
      const cost = Math.round(role.hiringCost * caps['hiring.cost_mult']);
      const diffs = capabilitiesPreview(co, roleId);
      wrap.appendChild(el('div', { class: 'employee-row' }, [
        el('div', { class: 'row between' }, [el('b', {}, ROLE_LABELS[roleId]), el('span', {}, `$${cost} + $${role.salary}/round`)]),
        ...diffs.map((d) => el('p', { class: 'cap-line' }, '+ ' + d)),
        el('button', { onclick: () => {
          const r = applyAction(game, { companyId: co.id, type: 'HireEmployee', roleId });
          if (r.ok) { telemetry.actionsPerCompany[activeIdx()]++; toast(`Hired ${ROLE_LABELS[roleId]} for $${r.cost}`); } else toast('Cannot hire: ' + r.reason, false);
          renderScreen();
        } }, 'Hire'),
      ]));
    }
    return wrap;
  },
  skills(co) {
    const wrap = el('div', { class: 'card', style: 'position:static' }, [el('h2', {}, 'Skills')]);
    const trainable = co.employees.filter((e) => e.roleId !== 'president');
    if (!trainable.length) wrap.appendChild(el('p', { class: 'small' }, 'Hire a role-specific employee first.'));
    for (const emp of trainable) {
      const roleSkills = Object.entries(SKILLS).filter(([, s]) => s.role === emp.roleId);
      const block = el('div', { class: 'employee-row' }, [el('b', {}, `${ROLE_LABELS[emp.roleId]} — ${Object.keys(emp.skills).length}/${ROLES[emp.roleId].skillSlots} slots used`)]);
      for (const [skillId, skill] of roleSkills) {
        const level = emp.skills[skillId] || 0;
        const maxed = level >= skill.maxLevel;
        const cost = maxed ? null : skill.costPerLevel[level];
        const diffs = maxed ? [] : capabilitiesPreview(co, null, { employeeId: emp.id, skillId });
        block.appendChild(el('div', { class: 'row between', style: 'margin-top:6px' }, [
          el('span', { class: 'small' }, `${skillId} (Lv ${level}/${skill.maxLevel})`),
          maxed ? el('span', { class: 'pill' }, 'MAX') : el('button', { onclick: () => {
            const r = applyAction(game, { companyId: co.id, type: 'UpgradeSkill', employeeId: emp.id, skillId });
            if (r.ok) { telemetry.actionsPerCompany[activeIdx()]++; toast(`Trained ${skillId} to Lv${level + 1}`); } else toast('Cannot train: ' + r.reason, false);
            renderScreen();
          } }, `Train $${cost}`),
        ]));
        for (const d of diffs) block.appendChild(el('p', { class: 'cap-line' }, '+ ' + d));
      }
      wrap.appendChild(block);
    }
    return wrap;
  },
  product(co) {
    const wrap = el('div', { class: 'card', style: 'position:static' }, [el('h2', {}, 'Product & Pricing'), el('p', { class: 'small' }, '1 category (beverage). Positioning changes cost, quality, and who wants it.')]);
    const prod = co.products[0];
    for (const posId of Object.keys(POSITIONS)) {
      const pos = POSITIONS[posId];
      const active = prod?.position === posId;
      wrap.appendChild(el('div', { class: 'employee-row', style: active ? 'border-color:#4f7ff0' : '' }, [
        el('div', { class: 'row between' }, [el('b', {}, POSITION_LABELS[posId]), active ? el('span', { class: 'pill ok' }, 'Active') : null]),
        el('p', { class: 'tiny' }, `Unit cost $${pos.unitCost} · price band $${pos.priceRange[0]}–$${pos.priceRange[1]} · quality ${pos.quality}/100`),
        el('button', { disabled: active, onclick: () => {
          const r = applyAction(game, { companyId: co.id, type: 'SetProductPosition', productId: prod?.id, position: posId });
          if (r.ok) toast(`Positioned as ${POSITION_LABELS[posId]}`); else toast('Cannot reposition: ' + r.reason, false);
          renderScreen();
        } }, active ? 'Current' : 'Set Position'),
      ]));
    }
    if (prod) {
      const [lo, hi] = POSITIONS[prod.position].priceRange;
      const priceInput = el('input', { type: 'number', min: lo, max: hi, value: prod.price });
      wrap.appendChild(el('div', { class: 'employee-row' }, [
        el('p', {}, `Current price: $${prod.price} (band $${lo}–$${hi})`),
        el('p', { class: 'tiny' }, `Estimated margin per unit: $${(prod.price * (1 - TUNING.storeMarginShare) - POSITIONS[prod.position].unitCost).toFixed(1)}`),
        el('div', { class: 'row' }, [priceInput, el('button', { onclick: () => {
          const r = applyAction(game, { companyId: co.id, type: 'SetPrice', productId: prod.id, price: Number(priceInput.value) });
          if (r.ok) toast(`Price set to $${priceInput.value}`); else toast('Cannot set price: ' + r.reason, false);
          renderScreen();
        } }, 'Set Price')]),
      ]));
    }
    return wrap;
  },
  marketing(co) {
    const wrap = el('div', { class: 'card', style: 'position:static' }, [el('h2', {}, 'Marketing'), el('p', { class: 'small' }, `Campaign slots remaining: ${co._budget?.campaigns ?? 0} · Cost $${TUNING.campaignCost} each`)]);
    const unlockedCap = computeCapabilities(co)['marketing.campaign_slots'];
    if (unlockedCap === 0) wrap.appendChild(el('p', { class: 'small' }, 'Hire a Marketing employee to unlock campaigns.'));
    else if ((co._budget?.campaigns ?? 0) === 0) wrap.appendChild(el('p', { class: 'small', style: 'color:#e0a35f' }, 'A role hired this round activates its capacity next round — no campaign slots yet.'));
    for (const d of CITY_V1.districts) {
      const aw = Math.round(co.awareness[d.id] || 0);
      const fatigue = co.campaignFatigue[d.id] || 0;
      const queued = (co._plans?.campaigns || []).filter((c) => c.districtId === d.id).length;
      wrap.appendChild(el('div', { class: 'employee-row' }, [
        el('div', { class: 'row between' }, [el('b', {}, d.name), el('span', { class: 'small' }, `Awareness ${aw}/100`)]),
        fatigue > 0 ? el('p', { class: 'tiny', style: 'color:#e0a35f' }, `Diminishing returns: ${fatigue} consecutive campaign(s) here already.`) : null,
        queued ? el('p', { class: 'tiny' }, `${queued} campaign(s) queued this round`) : null,
        el('button', { disabled: (co._budget?.campaigns ?? 0) <= 0, onclick: () => {
          const r = applyAction(game, { companyId: co.id, type: 'LaunchMarketing', districtId: d.id });
          if (r.ok) { telemetry.actionsPerCompany[activeIdx()]++; toast(`Campaign launched in ${d.name}`); } else toast('Cannot launch: ' + r.reason, false);
          renderScreen();
        } }, 'Launch Campaign — awareness, not guaranteed sales'),
      ]));
    }
    return wrap;
  },
  sales(co) {
    const wrap = el('div', { class: 'card', style: 'position:static' }, [el('h2', {}, 'Sales'), el('p', { class: 'small' }, `Pitch slots left: ${co._budget?.pitches ?? 0} · Account load used: ${(co._plans?.accounts || []).reduce((s, a) => s + a.load, 0)}/${co._budget?.accountCapacity ?? 0}`)]);
    const prod = co.products[0];
    for (const s of CITY_V1.stores) {
      const store = byId(game.stores, s.id);
      const d = (co.x != null) ? Math.abs(co.x - s.x) + Math.abs(co.y - s.y) : null;
      const load = co.x != null ? salesLoad(co, s) : null;
      const rel = Math.round(co.relationships[s.id] || 0);
      const onShelf = store.shelf.some((sl) => sl.companyId === co.id);
      const assignedNow = (co._plans?.accounts || []).some((a) => a.storeId === s.id);
      const pitchedNow = (co._plans?.pitches || []).some((p) => p.storeId === s.id);
      wrap.appendChild(el('div', { class: 'employee-row' }, [
        el('div', { class: 'row between' }, [el('b', {}, s.name), el('span', { class: 'small' }, d != null ? `${d} tiles away` : '—')]),
        el('p', { class: 'tiny' }, `${STORE_TYPE_LABELS[s.type]} · relationship ${rel}/100 · ${onShelf ? 'you are on the shelf' : 'not on shelf'}${d != null && d > TUNING.salesFarDistance ? ' · far account (load ' + load + ')' : ''}`),
        el('div', { class: 'row' }, [
          el('button', { disabled: assignedNow, onclick: () => {
            const r = applyAction(game, { companyId: co.id, type: 'AssignSales', storeId: s.id });
            if (r.ok) { telemetry.actionsPerCompany[activeIdx()]++; toast(`Sales coverage assigned to ${s.name}`); } else toast('Cannot assign: ' + r.reason, false);
            renderScreen();
          } }, assignedNow ? 'Coverage queued' : 'Assign Coverage'),
          el('button', { disabled: !prod || onShelf || pitchedNow, onclick: () => {
            const r = applyAction(game, { companyId: co.id, type: 'PitchStore', storeId: s.id, productId: prod.id });
            if (r.ok) { telemetry.actionsPerCompany[activeIdx()]++; toast(`Pitch queued for ${s.name} — acceptance is not guaranteed`); } else toast('Cannot pitch: ' + r.reason, false);
            renderScreen();
          } }, pitchedNow ? 'Pitch queued' : !prod ? 'Need a product first' : 'Pitch This Store'),
        ]),
      ]));
    }
    return wrap;
  },
  logistics(co) {
    const wrap = el('div', { class: 'card', style: 'position:static' }, [el('h2', {}, 'Logistics'), el('p', { class: 'small' }, `Shipment slots left: ${co._budget?.shipments ?? 0} · Range ${co._caps?.['logistics.range'] ?? 0} tiles`)]);
    const prod = co.products[0];
    if (!co.hqPlotId) { wrap.appendChild(el('p', { class: 'small' }, 'Choose your HQ before assigning shipments.')); return wrap; }
    for (const s of CITY_V1.stores) {
      const store = byId(game.stores, s.id);
      const d = Math.abs(co.x - s.x) + Math.abs(co.y - s.y);
      const inRange = d <= (co._caps?.['logistics.range'] ?? 0);
      const slot = store.shelf.find((sl) => sl.companyId === co.id);
      const pitchedOnly = !slot && (co._plans?.pitches || []).some((p) => p.storeId === s.id);
      const queued = (co._plans?.shipments || []).filter((sh) => sh.storeId === s.id).length;
      const estCost = Math.round(TUNING.shipmentBaseCost + d * TUNING.shipmentPerTile * (co._caps?.['logistics.cost_mult'] ?? 1));
      if (!slot && !pitchedOnly) continue;
      wrap.appendChild(el('div', { class: 'employee-row' }, [
        el('div', { class: 'row between' }, [el('b', {}, s.name), el('span', { class: 'small' }, `${d} tiles · $${estCost} est.`)]),
        slot ? el('p', { class: 'tiny' }, `Current stock: ${slot.stock} units`) : el('p', { class: 'tiny', style: 'color:#e0a35f' }, 'Pending pitch — shipment is wasted if the pitch fails this round.'),
        !inRange ? el('p', { class: 'tiny', style: 'color:#e08f7f' }, 'Out of delivery range.') : null,
        el('button', { disabled: !inRange || !prod || (co._budget?.shipments ?? 0) <= 0, onclick: () => {
          const r = applyAction(game, { companyId: co.id, type: 'AssignLogistics', storeId: s.id, productId: prod.id, units: 24 });
          if (r.ok) { telemetry.actionsPerCompany[activeIdx()]++; toast(`Shipment queued to ${s.name}`); } else toast('Cannot ship: ' + r.reason, false);
          renderScreen();
        } }, queued ? `Queued (${queued}) — Ship More` : 'Assign Shipment'),
      ]));
    }
    return wrap;
  },
};

// ============================================================================================
// Inspector (map selection info — public data only)
// ============================================================================================
function renderInspector() {
  const old = document.getElementById('inspector'); if (old) old.remove();
  if (!ui.selection || ui.screen !== 'planning') return;
  const box = el('div', { id: 'inspector', class: 'card' });
  if (ui.selection.kind === 'store') {
    const s = CITY_V1.stores.find((x) => x.id === ui.selection.id);
    const store = byId(game.stores, s.id);
    box.appendChild(el('h2', {}, s.name));
    box.appendChild(el('p', { class: 'small' }, `${STORE_TYPE_LABELS[s.type]} · ${DISTRICT_LABELS[s.district]} · shelf ${store.shelf.length}/${store.shelfCapacity}`));
    box.appendChild(el('p', { class: 'small' }, `Traffic: ${s.trafficMult >= 1.1 ? 'High' : s.trafficMult >= 1.0 ? 'Medium' : 'Low'}`));
    box.appendChild(el('h3', {}, 'On shelf'));
    if (!store.shelf.length) box.appendChild(el('p', { class: 'tiny' }, 'No brands yet — an open opportunity.'));
    for (const sl of store.shelf) {
      const c = byId(game.companies, sl.companyId), ci = game.companies.indexOf(c);
      const prod = byId(c.products, sl.productId);
      box.appendChild(el('div', { class: 'storechip' }, [el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[ci]}` }), `${c.name} — ${POSITION_LABELS[prod?.position] || '?'} $${prod?.price ?? '?'} (${sl.stock} in stock)`]));
    }
    const nearbyPop = CITY_V1.buildings.filter((b) => b.kind !== 'hotel' && Math.abs(b.x - s.x) + Math.abs(b.y - s.y) <= 10).reduce((sum, b) => sum + b.residents, 0);
    box.appendChild(el('h3', {}, 'Broad market'));
    box.appendChild(el('p', { class: 'tiny' }, `~${nearbyPop} residents live within easy reach.`));
  } else if (ui.selection.kind === 'building') {
    const b = CITY_V1.buildings.find((x) => x.id === ui.selection.id);
    box.appendChild(el('h2', {}, b.kind === 'hotel' ? (b.touristProfile === 'tourist_budget' ? 'Budget Hotel' : 'Premium Hotel') : b.kind[0].toUpperCase() + b.kind.slice(1)));
    box.appendChild(el('p', { class: 'small' }, DISTRICT_LABELS[b.district]));
    box.appendChild(el('p', {}, buildingBlurb(b)));
  } else if (ui.selection.kind === 'building_hq') {
    const c = byId(game.companies, ui.selection.id);
    box.appendChild(el('h2', {}, c.name + "'s HQ"));
    box.appendChild(el('p', { class: 'small' }, CITY_V1.hqPlots.find((p) => p.id === c.hqPlotId)?.name || ''));
  }
  $panels.appendChild(box);
}

// ============================================================================================
// Screen: SELLING (the ~20s market phase — the identity beat of the game)
// ============================================================================================
function renderSelling() {
  clear($panels); renderTopbar();
  const speedRow = el('div', { class: 'row' }, [1, 2, 4].map((s) => el('button', { class: s === ui.speed ? 'primary' : '', onclick: () => { ui.speed = s; renderScreen(); } }, `x${s}`)).concat([
    el('button', { onclick: skipReplay }, 'Skip'),
  ]));
  const card = el('div', { class: 'card', id: 'sellingHud' }, [
    el('div', { class: 'row between' }, [
      el('h2', { style: 'margin:0' }, `Round ${game.round} — Selling Phase`),
      speedRow,
    ]),
    el('p', { class: 'small', id: 'replayPhaseLabel' }, 'Marketing hits the streets…'),
    el('div', { class: 'progress-outer' }, el('div', { class: 'progress-inner', id: 'replayProgress' })),
    el('button', { class: 'primary', id: 'replayContinueBtn', style: 'margin-top:8px; width:100%', disabled: !replay?.done, onclick: goToSummary },
      replay?.done ? 'Continue to Round Summary' : 'Selling in progress…'),
  ]);
  $panels.appendChild(card);
}

// ============================================================================================
// Screen: SUMMARY (management-game round report)
// ============================================================================================
function renderSummary() {
  clear($panels); renderTopbar();
  const data = ui.summaryData || [];
  const cards = data.map((d) => {
    const i = game.companies.findIndex((c) => c.id === d.companyId);
    const revEl = el('b', {}, '$0');
    countUp(revEl, d.revenue);
    const profitEl = el('b', { style: `color:${d.profit >= 0 ? '#7fe0a0' : '#e08f7f'}` }, '$0');
    countUp(profitEl, Math.abs(d.profit), { prefix: d.profit >= 0 ? '+$' : '-$' });
    const bestStore = d.bestStoreId ? CITY_V1.stores.find((s) => s.id === d.bestStoreId)?.name : null;
    return el('div', { class: 'card summary-card', style: 'position:static;' }, [
      el('h2', { style: `color:${COMPANY_COLOR_CSS[i]}; margin-bottom:4px` }, d.name),
      el('div', { class: 'row between' }, [el('span', {}, ['Revenue ', revEl]), el('span', {}, `Units ${d.units}`)]),
      el('p', { class: 'small' }, `Market share this round: ${(d.marketShare * 100).toFixed(0)}%${bestStore ? ` · Best store: ${bestStore}` : ''}`),
      el('div', { class: 'finline' }, [
        finRow('COGS', d.cogs), finRow('Salaries', d.salaries), finRow('Rent', d.rent),
        finRow('Logistics', d.logistics), finRow('Marketing', d.marketing), finRow('Hiring/Training/Setup', d.other),
      ]),
      el('div', { class: 'row between', style: 'margin-top:6px' }, [el('span', {}, ['Profit: ', profitEl]), el('span', {}, `Cash $${Math.round(d.cash)}`)]),
      (d.shelfWon || d.shelfLost) ? el('p', { class: 'small' }, `Shelf: ${d.shelfWon ? `+${d.shelfWon} won ` : ''}${d.shelfLost ? `−${d.shelfLost} lost` : ''}`) : null,
      ...d.notes.map((n) => el('p', { class: 'small', style: `color:${n.tone === 'good' ? '#7fe0a0' : n.tone === 'bad' ? '#e08f7f' : '#e0a35f'}` }, n.text)),
    ]);
  });
  function finRow(label, v) {
    return el('div', { class: 'row between finrow' }, [el('span', { class: 'tiny' }, label), el('span', { class: 'tiny' }, `-$${Math.round(v)}`)]);
  }
  const grid = el('div', { class: data.length > 2 ? 'grid2' : 'row', style: 'align-items:stretch; gap:10px' }, cards);
  const autoRow = humanCount() === 0 ? el('label', { class: 'row small', style: 'gap:6px; justify-content:center' }, [
    el('input', { type: 'checkbox', checked: ui.autoObserver, onchange: (e) => { ui.autoObserver = e.target.checked; } }),
    'Auto-advance rounds (observer)',
  ]) : null;
  const card = el('div', { class: 'card', style: 'width:min(860px,96vw); max-height:88vh; overflow-y:auto' }, [
    el('h2', {}, `Round ${game.round} Summary${game.finalRound === game.round ? ' — FINAL ROUND' : game.finalRound ? ` (final round: ${game.finalRound})` : ''}`),
    grid, autoRow,
    el('button', { class: 'primary', style: 'margin-top:14px; width:100%', onclick: proceedAfterSummary }, game.finished ? 'See Match Results' : 'Next Round'),
  ]);
  $panels.appendChild(el('div', { class: 'overlay' }, card));
  if (humanCount() === 0 && ui.autoObserver && !game.finished) setTimeout(() => { if (ui.screen === 'summary') proceedAfterSummary(); }, 1600);
}

// ============================================================================================
// Screen: VICTORY
// ============================================================================================
function renderVictory() {
  clear($panels); $topbar.className = 'hidden';
  const winner = byId(game.companies, game.winnerId);
  const ranked = [...game.companies].sort((a, b) => b.cumulativeRevenue - a.cumulativeRevenue || b.cash - a.cash || b.unitsSoldTotal - a.unitsSoldTotal);
  let tieNote = '';
  if (ranked[1] && ranked[0].cumulativeRevenue === ranked[1].cumulativeRevenue) tieNote = ranked[0].cash !== ranked[1].cash ? 'Tie-break: cash on hand.' : 'Tie-break: total units sold.';
  const telemetryJson = JSON.stringify(telemetry, null, 1);
  const card = el('div', { class: 'card' }, [
    el('h2', { style: `color:${COMPANY_COLOR_CSS[game.companies.indexOf(winner)]}` }, `🏆 ${winner.name} Wins!`),
    el('p', { class: 'small' }, tieNote || `Match decided after ${game.round} rounds.`),
    el('h3', {}, 'Final Standings'),
    ...ranked.map((c, i) => {
      const ci = game.companies.indexOf(c);
      const slot = matchConfig.slots[ci];
      return el('p', {}, [
        el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[ci]}` }),
        `${i + 1}. ${c.name}${slot.type === 'bot' ? ` (Bot — ${ARCHETYPES[slot.archetype].label})` : ''} — $${Math.round(c.cumulativeRevenue)} revenue, $${Math.round(c.cash)} cash, ${c.unitsSoldTotal} units`,
      ]);
    }),
    el('h3', {}, 'Playtest Telemetry'),
    el('pre', { style: 'font-size:11px; max-height:150px; overflow:auto; background:#0d0f14; padding:8px; border-radius:6px;' }, telemetryJson),
    el('div', { class: 'row', style: 'margin-top:10px' }, [
      el('button', { onclick: () => { const blob = new Blob([telemetryJson], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'company-economy-telemetry.json'; a.click(); } }, 'Export Telemetry'),
      el('button', { class: 'primary', style: 'flex:1', onclick: () => { clearSave(); location.reload(); } }, 'New Match'),
    ]),
  ]);
  $panels.appendChild(el('div', { class: 'overlay' }, card));
}

// ============================================================================================
// Topbar / Dev panel / dispatch
// ============================================================================================
function renderTopbar() {
  $topbar.className = '';
  clear($topbar);
  game.companies.forEach((co, i) => {
    const isActive = ui.screen === 'planning' || ui.screen === 'hq' || ui.screen === 'transition' ? activeIdx() === i : false;
    $topbar.appendChild(el('span', { class: isActive ? 'tb-active' : '' }, [
      el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[i]}` }),
      `${co.name}: $${Math.round(co.cash)}`,
    ]));
    if (i < game.companies.length - 1) $topbar.appendChild(el('span', { class: 'tb-sep' }, '|'));
  });
  $topbar.appendChild(el('span', { class: 'tb-sep' }, '|'));
  $topbar.appendChild(el('span', {}, `Round ${game.round} / target $${(game.rules || TUNING).revenueTarget}${game.finalRound ? ' (final!)' : ''}`));
  $topbar.appendChild(el('span', { class: 'tb-sep' }, '|'));
  $topbar.appendChild(el('span', {}, ui.screen === 'selling' ? 'Selling Phase' : `Phase: ${game.phase}`));
}

const SCREEN_RENDERERS = { setup: renderSetup, transition: renderTransition, hq: renderHq, planning: renderPlanning, selling: renderSelling, summary: renderSummary, victory: renderVictory };
function renderScreen() {
  SCREEN_RENDERERS[ui.screen]();
  renderDevPanel();
}

$devToggle.addEventListener('click', () => { ui.devMode = !ui.devMode; $devToggle.textContent = `Dev Mode: ${ui.devMode ? 'ON' : 'OFF'}`; $devPanel.className = ui.devMode ? 'dev-panel' : 'dev-panel hidden'; renderDevPanel(); });
function renderDevPanel() {
  if (!ui.devMode || !game) return;
  const lastStoreDecisions = game.debugLog.filter((d) => d.t === 'StoreDecision').slice(-1);
  const lastBotDecisions = game.debugLog.filter((d) => d.t === 'BotDecision').slice(-1);
  $devPanel.textContent = JSON.stringify({ seed: game.seed, round: game.round, phase: game.phase, screen: ui.screen,
    turnQueue: ui.turnQueue, turnPos: ui.turnPos, lastStoreDecisions, lastBotDecisions }, null, 1);
}

// ============================================================================================
// Automated-playtest hook (drives the SAME functions the buttons call — no separate logic)
// ============================================================================================
window.__ceTest = {
  get game() { return game; },
  get ui() { return ui; },
  startMatch, beginHumanTurn, endActiveTurn, skipReplay, goToSummary, proceedAfterSummary,
  applyFor: (companyId, action) => applyAction(game, { ...action, companyId }),
  chooseHq: (plotId) => { ui.selection = { kind: 'plot', id: plotId }; const co = activeCo(); const r = applyAction(game, { companyId: co.id, type: 'ChooseCompanyLocation', plotId }); if (r.ok) { syncHqSprites(); ui.screen = 'planning'; renderScreen(); } return r; },
  setSpeed: (s) => { ui.speed = s; },
  renderScreen,
};

renderScreen();
