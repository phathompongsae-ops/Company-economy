// Company Economy — Interactive Hot-Seat Vertical Slice v1
//
// STRICT RULE: this file and Three.js NEVER decide an economic outcome. Every mutation goes
// through src/core/actions.js#applyAction (the exact function the headless tests call); every
// resolution goes through src/core/round.js#resolveRound (the exact tail of playRound()).
// This file only reads GameState, calls those two functions, and renders/animates the result.
import * as THREE from 'three';
import { createInitialState, CITY_V1, PROFILES, byId } from '../src/core/state.js';
import { beginPlanningPhase, resolveRound } from '../src/core/round.js';
import { applyAction, salesLoad } from '../src/core/actions.js';
import { computeCapabilities } from '../src/core/capabilities.js';
import { ROLES, SKILLS, POSITIONS, TUNING } from '../src/core/data/roles-v1.js';

// ============================================================================================
// Constants / labels
// ============================================================================================
const COMPANY_COLORS = [0xe0533f, 0x3f8fe0];
const COMPANY_COLOR_CSS = ['#e0533f', '#3f8fe0'];
const ROLE_LABELS = { president: 'President', hr: 'HR', manager: 'Manager', marketing: 'Marketing', sales: 'Sales', logistics: 'Logistics', analyst: 'Analyst' };
const DISTRICT_LABELS = Object.fromEntries(CITY_V1.districts.map((d) => [d.id, d.name]));
const POSITION_LABELS = { economy: 'Economy', mainstream: 'Mainstream', premium: 'Premium' };
const STORE_TYPE_LABELS = { convenience: 'Convenience Store', supermarket: 'Supermarket', mall: 'Mall Shop' };

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
// Core game state + UI state
// ============================================================================================
let game = null;
let ui = {
  screen: 'setup',          // setup | transition | hq | planning | resolving | summary | victory
  activeIdx: 0,              // index of the company whose turn it is
  playerDone: [false, false],
  tab: 'overview',
  selection: null,           // { kind: 'store'|'building'|'plot', id }
  devMode: false,
  speed: 4,
  toastTimer: null,
};
const telemetry = {
  roundsPlayed: 0, actionsPerCompany: [0, 0], planningMsPerCompany: [0, 0],
  revenueProgression: [], shelfChanges: 0, marketingSpendPerCompany: [0, 0],
  missedShipmentOpportunities: 0, purchases: 0, noPurchases: 0, turnStartedAt: 0,
};

function activeCo() { return game.companies[ui.activeIdx]; }
function otherCo() { return game.companies[1 - ui.activeIdx]; }

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
    else if (BOOL_ATTRS.has(k)) { if (v) e.setAttribute(k, ''); } // presence-based: never write disabled="false"
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

// ============================================================================================
// Three.js scene (extends the debug-viewer approach: ortho 2.5D, sim-ID-tagged meshes)
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
scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const sun = new THREE.DirectionalLight(0xffe6c0, 0.9); sun.position.set(6, 12, 4); scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, H + 6), new THREE.MeshLambertMaterial({ color: 0x3a4436 }));
ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -0.05, H / 2); scene.add(ground);
for (const [w, h, x, z] of [[W + 2, 1.6, W / 2, 10.5], [1.6, H + 2, 11, H / 2]]) {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0x50555e }));
  road.rotation.x = -Math.PI / 2; road.position.set(x, 0.0, z); scene.add(road);
}
// district ground tint (helps read the map as a strategic board, not decoration)
const DISTRICT_TINT = { west: 0x3a4a3a, central: 0x3a3a46, east: 0x463a46 };
const DISTRICT_BOUNDS = { west: [0, 0, 9, H], central: [9, 0, 14, H], east: [14, 0, W, H] };
for (const d of CITY_V1.districts) {
  const [x0, y0, x1, y1] = DISTRICT_BOUNDS[d.id];
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshBasicMaterial({ color: DISTRICT_TINT[d.id], transparent: true, opacity: 0.35 }));
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, -0.03, (y0 + y1) / 2); scene.add(m);
}

const pickables = [];
const KIND_STYLE = { house: [0.8, 0.6, 0x9c7b56], condo: [1.0, 2.2, 0x7b8aa0], hotel: [1.4, 2.8, 0xb08ac0] };
for (const b of CITY_V1.buildings) {
  const [w, h, color] = KIND_STYLE[b.kind];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshLambertMaterial({ color }));
  m.position.set(b.x, h / 2, b.y); m.userData = { pickType: 'building', simId: b.id }; scene.add(m); pickables.push(m);
}
const storeMeshes = {}, storeCapMarks = {};
for (const s of CITY_V1.stores) {
  const size = s.type === 'convenience' ? 1.1 : s.type === 'supermarket' ? 1.8 : 1.5;
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, 1, size), new THREE.MeshLambertMaterial({ color: 0xd8c26a }));
  m.position.set(s.x, 0.5, s.y); m.userData = { pickType: 'store', simId: s.id }; scene.add(m); pickables.push(m);
  storeMeshes[s.id] = m;
  const ring = new THREE.Mesh(new THREE.RingGeometry(size * 0.75, size * 0.9, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.02, s.y); scene.add(ring);
  storeCapMarks[s.id] = ring;
}
const plotMeshes = {};
for (const p of CITY_V1.hqPlots) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.25, 6), new THREE.MeshLambertMaterial({ color: 0x6a7a8a, transparent: true, opacity: 0.85 }));
  m.position.set(p.x, 0.13, p.y); m.userData = { pickType: 'plot', simId: p.id }; m.visible = false; scene.add(m); pickables.push(m);
  plotMeshes[p.id] = m;
}
const hqMeshes = {};        // companyId -> mesh, created once ChooseCompanyLocation resolves
const campaignMarks = {};   // districtId -> Group of small flags, rebuilt each round

// selection highlight ring
const selectRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 20), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide }));
selectRing.rotation.x = -Math.PI / 2; selectRing.visible = false; scene.add(selectRing);

function syncHqMeshes() {
  game.companies.forEach((co, i) => {
    if (co.hqPlotId && !hqMeshes[co.id]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 4), new THREE.MeshLambertMaterial({ color: COMPANY_COLORS[i] }));
      m.position.set(co.x, 0.8, co.y); m.userData = { pickType: 'hq', simId: co.id }; scene.add(m); pickables.push(m);
      hqMeshes[co.id] = m;
    }
  });
}
function syncShelfMarks() {
  for (const s of CITY_V1.stores) {
    const store = byId(game.stores, s.id);
    storeMeshes[s.id].material.color.set(store.shelf.length ? 0xd8c26a : 0x8a8a72);
    storeMeshes[s.id].scale.y = 1 + store.shelf.length * 0.15;
  }
}
const CAMPAIGN_FLAG_GEOMETRY = new THREE.ConeGeometry(0.35, 0.9, 4);
const CAMPAIGN_FLAG_MATERIALS = COMPANY_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c }));
function syncCampaignMarks() {
  for (const g of Object.values(campaignMarks)) scene.remove(g);
  for (const k in campaignMarks) delete campaignMarks[k];
  game.companies.forEach((co, i) => {
    for (const d of CITY_V1.districts) {
      if ((co.campaignFatigue[d.id] || 0) > 0 && co._plans?.campaigns?.some((c) => c.districtId === d.id)) {
        const [x0, y0, x1, y1] = DISTRICT_BOUNDS[d.id];
        const flag = new THREE.Mesh(CAMPAIGN_FLAG_GEOMETRY, CAMPAIGN_FLAG_MATERIALS[i] ?? CAMPAIGN_FLAG_MATERIALS[0]);
        flag.position.set(x0 + 1.2 + i * 0.8, 0.5, y0 + 1.2);
        scene.add(flag);
        campaignMarks[d.id + i] = flag;
      }
    }
  });
}

// ---- pan / zoom / click picking (click vs drag disambiguated by movement threshold) ----
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
  if (ui.selection.kind === 'store') pos = storeMeshes[ui.selection.id]?.position;
  else if (ui.selection.kind === 'plot') pos = plotMeshes[ui.selection.id]?.position;
  else if (ui.selection.kind === 'building') { const b = CITY_V1.buildings.find((x) => x.id === ui.selection.id); pos = b && new THREE.Vector3(b.x, 0, b.y); }
  if (pos) { selectRing.position.set(pos.x, 0.03, pos.z); selectRing.visible = true; } else selectRing.visible = false;
}

// ============================================================================================
// Walkers (representative purchase agents — real consumerId/home/store, per PurchaseEvent)
// ============================================================================================
let walkers = [];
// Shared geometry/materials across all walkers/rounds so clearWalkers() never leaks GPU
// objects — walker meshes are recreated every round (fresh PurchaseEvents), but the
// underlying geometry/material are allocated once and reused, not disposed-and-rebuilt.
const WALKER_GEOMETRY = new THREE.SphereGeometry(0.16, 6, 6);
const WALKER_MATERIALS = COMPANY_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
function clearWalkers() { for (const w of walkers) scene.remove(w.mesh); walkers = []; }
function spawnWalkersFromEvents(events) {
  clearWalkers();
  const purchases = events.filter((e) => e.t === 'PurchaseEvent').slice(0, 40); // perf cap
  purchases.forEach((p, i) => {
    const home = CITY_V1.buildings.find((b) => b.id === p.from);
    const store = CITY_V1.stores.find((s) => s.id === p.storeId);
    if (!home || !store) return;
    const ci = game.companies.findIndex((c) => c.id === p.companyId);
    const mesh = new THREE.Mesh(WALKER_GEOMETRY, WALKER_MATERIALS[ci] ?? WALKER_MATERIALS[0]);
    mesh.userData = { pickType: 'walker', purchase: p };
    scene.add(mesh);
    walkers.push({ mesh, from: home, to: store, t: -i * 0.03, done: false });
  });
}
let replaySpeedMul = 4;
function tickWalkers(dtSeconds) {
  for (const w of walkers) {
    if (w.t < 0) { w.t += dtSeconds * replaySpeedMul * 0.4; continue; }
    w.t += dtSeconds * replaySpeedMul * 0.35;
    const k = Math.min(1, w.t);
    w.mesh.position.set(w.from.x + (w.to.x - w.from.x) * k, 0.3, w.from.y + (w.to.y - w.from.y) * k);
    w.mesh.visible = true;
    if (k >= 1) w.done = true;
  }
}
function allWalkersDone() { return walkers.every((w) => w.done); }
function finishWalkersInstantly() { for (const w of walkers) { w.t = 1; w.mesh.position.set(w.to.x, 0.3, w.to.y); w.done = true; } }

let lastTime = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - lastTime) / 1000); lastTime = now;
  if (ui.screen === 'resolving') tickWalkers(dt);
  updateSelectRing();
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight - 0); applyCamera(); });
renderer.setSize(innerWidth, innerHeight);
applyCamera();

// ============================================================================================
// Screen: SETUP
// ============================================================================================
function renderSetup() {
  clear($panels); $topbar.className = 'hidden';
  const nameA = el('input', { type: 'text', value: 'Alpha Co.' });
  const nameB = el('input', { type: 'text', value: 'Bravo Inc.' });
  const seedInput = el('input', { type: 'number', value: String(Math.floor(Math.random() * 1e6)) });
  const card = el('div', { class: 'card' }, [
    el('h2', {}, 'Company Economy — Hot-Seat'),
    el('p', { class: 'small' }, '2 players, one screen, one city. Choose your HQ, build your organization, and out-compete the other company for shelves and customers.'),
    el('h3', {}, 'Company A'),
    el('div', { class: 'row' }, [el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[0]}` }), nameA]),
    el('h3', {}, 'Company B'),
    el('div', { class: 'row' }, [el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[1]}` }), nameB]),
    el('h3', {}, 'Match Seed (same seed = same city outcomes for identical decisions)'),
    seedInput,
    el('div', { class: 'row', style: 'margin-top:16px' }, [
      el('button', { class: 'primary', onclick: () => startMatch(nameA.value || 'Alpha', nameB.value || 'Bravo', parseInt(seedInput.value, 10) || 1) }, 'Start Match'),
    ]),
  ]);
  $panels.appendChild(el('div', { class: 'overlay' }, card));
}

function startMatch(nA, nB, seed) {
  game = createInitialState(seed, [nA, nB]);
  telemetry.roundsPlayed = 0; telemetry.actionsPerCompany = [0, 0]; telemetry.planningMsPerCompany = [0, 0];
  telemetry.revenueProgression = []; telemetry.shelfChanges = 0; telemetry.marketingSpendPerCompany = [0, 0];
  telemetry.missedShipmentOpportunities = 0; telemetry.purchases = 0; telemetry.noPurchases = 0;
  for (const m of Object.values(hqMeshes)) scene.remove(m);
  for (const k in hqMeshes) delete hqMeshes[k];
  clearWalkers();
  startRound();
}

// ============================================================================================
// Round lifecycle
// ============================================================================================
function startRound() {
  beginPlanningPhase(game);
  ui.playerDone = [false, false];
  ui.activeIdx = game.initiativeIndex; // vary who plans first; resolution is simultaneous regardless
  goToTransition();
}

function goToTransition() {
  ui.screen = 'transition';
  telemetry.turnStartedAt = performance.now();
  renderScreen();
}

function endActiveTurn() {
  applyAction(game, { companyId: activeCo().id, type: 'SubmitTurn' });
  telemetry.planningMsPerCompany[ui.activeIdx] += performance.now() - telemetry.turnStartedAt;
  ui.playerDone[ui.activeIdx] = true;
  if (ui.playerDone[0] && ui.playerDone[1]) { startResolution(); return; }
  ui.activeIdx = 1 - ui.activeIdx;
  ui.selection = null;
  goToTransition();
}

let resolveEventStart = 0, resolveDebugStart = 0;
function startResolution() {
  resolveEventStart = game.eventLog.length;
  resolveDebugStart = game.debugLog.length;
  resolveRound(game);
  const newEvents = game.eventLog.slice(resolveEventStart);
  telemetry.roundsPlayed = game.round;
  telemetry.shelfChanges += newEvents.filter((e) => e.t === 'ShelfWon' || e.t === 'ShelfDropped').length;
  telemetry.missedShipmentOpportunities += newEvents.filter((e) => e.t === 'DeliveryWasted' || e.t === 'DeliveryFailed').length;
  telemetry.purchases += newEvents.filter((e) => e.t === 'PurchaseEvent').length;
  telemetry.noPurchases += game.debugLog.slice(resolveDebugStart).filter((d) => d.t === 'NoPurchase').length;
  telemetry.revenueProgression.push({ round: game.round, revA: +game.companies[0].cumulativeRevenue.toFixed(0), revB: +game.companies[1].cumulativeRevenue.toFixed(0) });
  syncHqMeshes(); syncShelfMarks();
  ui.screen = 'resolving';
  ui.resolveEvents = newEvents;
  spawnWalkersFromEvents(newEvents);
  renderScreen();
}

function proceedAfterSummary() {
  clearWalkers();
  if (game.finished) { ui.screen = 'victory'; renderScreen(); return; }
  startRound();
}

// ============================================================================================
// Screen: TRANSITION (privacy pass-device screen)
// ============================================================================================
function renderTransition() {
  clear($panels); renderTopbar();
  const co = activeCo();
  const card = el('div', { class: 'card' }, [
    el('h2', { style: `color:${COMPANY_COLOR_CSS[ui.activeIdx]}` }, `Pass the device to ${co.name}`),
    el('p', { class: 'small' }, 'The other company\'s plans stay private until resolution. Make sure no one else is looking at the screen.'),
    el('p', {}, `Round ${game.round} — ${co.hqPlotId ? 'Planning Phase' : 'Choose your HQ first'}`),
    el('button', { class: 'primary', style: 'margin-top:10px', onclick: () => { ui.screen = co.hqPlotId ? 'planning' : 'hq'; ui.tab = 'overview'; ui.selection = null; renderScreen(); } }, `I'm ${co.name} — Begin Turn`),
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
    plotMeshes[p.id].visible = true;
    plotMeshes[p.id].material.color.set(taken ? 0x444444 : (ui.selection?.id === p.id ? 0xffe066 : 0x6a7a8a));
  }
  const co = activeCo();
  const list = el('div', { class: 'stack' });
  for (const p of CITY_V1.hqPlots) {
    const taken = game.companies.some((c) => c.hqPlotId === p.id);
    const nearbyStores = CITY_V1.stores.filter((s) => Math.abs(s.x - p.x) + Math.abs(s.y - p.y) <= 8).length;
    const nearbyPop = CITY_V1.buildings.filter((b) => b.kind !== 'hotel' && Math.abs(b.x - p.x) + Math.abs(b.y - p.y) <= 8).reduce((s, b) => s + b.residents, 0);
    const selected = ui.selection?.kind === 'plot' && ui.selection.id === p.id;
    const row = el('div', { class: 'card', style: `position:static; border-color:${selected ? '#ffe066' : '#2c3038'}; ${taken ? 'opacity:.4' : ''}`, onclick: () => { if (!taken) { ui.selection = { kind: 'plot', id: p.id }; renderScreen(); } } }, [
      el('div', { class: 'row between' }, [el('b', {}, p.name), taken ? el('span', { class: 'pill bad' }, 'Taken') : el('span', { class: 'pill' }, `$${p.setupCost} setup`)]),
      el('p', { class: 'small' }, `Rent $${p.rentPerRound}/round — ${nearbyStores} store(s) within logistics-friendly range, ~${nearbyPop} nearby residents.`),
    ]);
    list.appendChild(row);
  }
  const confirm = el('button', { class: 'primary', disabled: !ui.selection || ui.selection.kind !== 'plot', onclick: () => {
    const r = applyAction(game, { companyId: co.id, type: 'ChooseCompanyLocation', plotId: ui.selection.id });
    if (r.ok) { telemetry.actionsPerCompany[ui.activeIdx]++; syncHqMeshes(); toast(`${co.name} set up at ${CITY_V1.hqPlots.find((x) => x.id === ui.selection.id).name}`); ui.selection = null; ui.screen = 'planning'; ui.tab = 'overview'; renderScreen(); }
    else toast('Cannot place HQ: ' + r.reason, false);
  } }, 'Confirm HQ Location');
  const card = el('div', { class: 'card', style: 'left:12px; top:58px; bottom:12px; width:340px; overflow-y:auto;' }, [
    el('h2', {}, `${co.name} — Choose HQ Location`),
    el('p', { class: 'small' }, 'Click a plot marker on the map or a card below. Location shapes sales reach, delivery cost/range, and rent — not a guaranteed win.'),
    list, confirm,
  ]);
  $panels.appendChild(card);
}

// ============================================================================================
// Screen: PLANNING (tabs)
// ============================================================================================
const TABS = [
  ['overview', 'Overview'], ['hire', 'Hire'], ['skills', 'Skills'], ['product', 'Product'],
  ['marketing', 'Marketing'], ['sales', 'Sales'], ['logistics', 'Logistics'],
];
function renderPlanning() {
  for (const id in plotMeshes) plotMeshes[id].visible = false;
  clear($panels); renderTopbar();
  const co = activeCo();
  const dock = el('div', { id: 'planDock' });
  const tabs = el('div', { class: 'tabs' });
  for (const [id, label] of TABS) tabs.appendChild(el('button', { class: ui.tab === id ? 'active' : '', onclick: () => { ui.tab = id; renderScreen(); } }, label));
  const body = el('div', { class: 'tabbody' });
  body.appendChild(TAB_RENDERERS[ui.tab](co));
  dock.appendChild(tabs); dock.appendChild(body);
  dock.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [
    el('button', { class: 'primary', style: 'width:100%', onclick: endActiveTurn }, ui.playerDone[1 - ui.activeIdx] ? 'Submit & Resolve Round' : 'Submit & Pass to Other Company'),
  ]));
  $panels.appendChild(dock);
  renderInspector();
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
    const wrap = el('div', { class: 'card', style: 'position:static' }, [
      el('h2', {}, co.name),
      el('p', {}, [el('b', {}, `$${Math.round(co.cash)}`), ' cash']),
      el('p', { class: 'small' }, `Cumulative revenue: $${Math.round(co.cumulativeRevenue)} · Units sold: ${co.unitsSoldTotal}`),
      el('p', { class: 'small' }, `HQ: ${co.hqPlotId ? CITY_V1.hqPlots.find((p) => p.id === co.hqPlotId).name : 'not set'}`),
      el('h3', {}, 'What your organization can do this round'),
      ...['org.recruit_slots', 'sales.pitch_slots', 'sales.account_capacity', 'marketing.campaign_slots', 'logistics.shipment_slots', 'logistics.range', 'logistics.reliability']
        .map((k) => el('p', { class: 'cap-line' }, capLine(k, caps[k]))),
      el('h3', {}, 'Employees'),
      ...co.employees.map((e) => el('div', { class: 'employee-row' }, [
        el('div', { class: 'row between' }, [el('b', {}, ROLE_LABELS[e.roleId]), el('span', { class: 'small' }, e.roleId === 'president' ? 'no salary' : `$${ROLES[e.roleId].salary}/round`)]),
        Object.keys(e.skills).length ? el('p', { class: 'tiny' }, 'Skills: ' + Object.entries(e.skills).map(([s, l]) => `${s} Lv${l}`).join(', ')) : null,
      ])),
      el('h3', {}, 'Opponent (public info only)'),
      el('p', { class: 'small' }, `${otherCo().name}: ${otherCo().employees.length} employee(s), HQ ${otherCo().hqPlotId ? 'set' : 'not set'}.`),
    ]);
    return wrap;
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
          if (r.ok) { telemetry.actionsPerCompany[ui.activeIdx]++; toast(`Hired ${ROLE_LABELS[roleId]} for $${r.cost}`); } else toast('Cannot hire: ' + r.reason, false);
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
            if (r.ok) { telemetry.actionsPerCompany[ui.activeIdx]++; toast(`Trained ${skillId} to Lv${level + 1}`); } else toast('Cannot train: ' + r.reason, false);
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
        el('p', { class: 'tiny' }, `Estimated margin per unit at store: $${(prod.price * (1 - TUNING.storeMarginShare) - POSITIONS[prod.position].unitCost).toFixed(1)}`),
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
    if (!co._budget || co._budget.campaigns === undefined || unlockedCap === 0) wrap.appendChild(el('p', { class: 'small' }, 'Hire a Marketing employee to unlock campaigns.'));
    else if (co._budget.campaigns === 0 && unlockedCap > 0) wrap.appendChild(el('p', { class: 'small', style: 'color:#e0a35f' }, 'A role hired this round activates its capacity next round — no campaign slots yet.'));
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
          if (r.ok) { telemetry.actionsPerCompany[ui.activeIdx]++; telemetry.marketingSpendPerCompany[ui.activeIdx] += TUNING.campaignCost; toast(`Campaign launched in ${d.name}`); syncCampaignMarks(); }
          else toast('Cannot launch: ' + r.reason, false);
          renderScreen();
        } }, 'Launch Campaign — not a guaranteed sales boost'),
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
            if (r.ok) { telemetry.actionsPerCompany[ui.activeIdx]++; toast(`Sales coverage assigned to ${s.name}`); } else toast('Cannot assign: ' + r.reason, false);
            renderScreen();
          } }, assignedNow ? 'Coverage queued' : 'Assign Coverage'),
          el('button', { disabled: !prod || onShelf || pitchedNow, onclick: () => {
            const r = applyAction(game, { companyId: co.id, type: 'PitchStore', storeId: s.id, productId: prod.id });
            if (r.ok) { telemetry.actionsPerCompany[ui.activeIdx]++; toast(`Pitch queued for ${s.name} — acceptance is not guaranteed`); } else toast('Cannot pitch: ' + r.reason, false);
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
      if (!slot && !pitchedOnly) continue; // not relevant to logistics this round
      wrap.appendChild(el('div', { class: 'employee-row' }, [
        el('div', { class: 'row between' }, [el('b', {}, s.name), el('span', { class: 'small' }, `${d} tiles · $${estCost} est.`)]),
        slot ? el('p', { class: 'tiny' }, `Current stock: ${slot.stock} units`) : el('p', { class: 'tiny', style: 'color:#e0a35f' }, 'Pending pitch — shipment is wasted if the pitch fails this round.'),
        !inRange ? el('p', { class: 'tiny', style: 'color:#e08f7f' }, 'Out of delivery range.') : null,
        el('button', { disabled: !inRange || !prod || (co._budget?.shipments ?? 0) <= 0, onclick: () => {
          const r = applyAction(game, { companyId: co.id, type: 'AssignLogistics', storeId: s.id, productId: prod.id, units: 24 });
          if (r.ok) { telemetry.actionsPerCompany[ui.activeIdx]++; toast(`Shipment queued to ${s.name}`); } else toast('Cannot ship: ' + r.reason, false);
          renderScreen();
        } }, queued ? `Queued (${queued}) — Ship More` : 'Assign Shipment'),
      ]));
    }
    return wrap;
  },
};

// ============================================================================================
// Inspector (right dock: public info about whatever is selected on the map)
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
      box.appendChild(el('div', { class: 'storechip' }, [el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[ci]}` }), `${c.name} — ${POSITION_LABELS[prod?.position] || '?'} (${sl.stock} in stock)`]));
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
// Screen: RESOLVING (replay) + SUMMARY
// ============================================================================================
function renderResolving() {
  clear($panels); renderTopbar();
  const speedRow = el('div', { class: 'row' }, ['x1', 'x2', 'x4'].map((s, i) => el('button', { class: [1, 2, 4][i] === ui.speed ? 'primary' : '', onclick: () => { ui.speed = [1, 2, 4][i]; replaySpeedMul = ui.speed; renderScreen(); } }, s)).concat([
    el('button', { onclick: () => { finishWalkersInstantly(); checkResolvingDone(true); } }, 'Skip'),
  ]));
  const order = ['Marketing', 'Sales / Store Decisions', 'Logistics / Deliveries', 'Consumer Purchases', 'Finance'];
  const card = el('div', { class: 'card' }, [
    el('h2', {}, `Round ${game.round} — Resolving`),
    el('p', { class: 'small' }, 'Resolution order: ' + order.join(' → ')),
    speedRow,
    el('div', { id: 'resolveLog', class: 'stack', style: 'margin-top:10px; max-height:40vh; overflow-y:auto;' }, ui.resolveEvents.filter((e) => ['ShelfWon', 'ShelfDropped', 'DeliveryFailed', 'DeliveryWasted', 'CampaignVisualEvent'].includes(e.t)).slice(0, 20).map((e) => resolveEventLine(e))),
    el('button', { class: 'primary', style: 'margin-top:10px', onclick: () => goToSummary() }, 'Continue to Summary'),
  ]);
  $panels.appendChild(el('div', { class: 'overlay' }, card));
  replaySpeedMul = ui.speed;
}
function resolveEventLine(e) {
  const co = e.companyId ? byId(game.companies, e.companyId) : null;
  const store = e.storeId ? CITY_V1.stores.find((s) => s.id === e.storeId) : null;
  const text = e.t === 'ShelfWon' ? `${co?.name} won a shelf slot at ${store?.name}`
    : e.t === 'ShelfDropped' ? `${co?.name} lost their shelf slot at ${store?.name}`
    : e.t === 'DeliveryFailed' ? `${co?.name}'s delivery to ${store?.name} failed (reliability)`
    : e.t === 'DeliveryWasted' ? `${co?.name}'s shipment to ${store?.name} was wasted — no shelf slot`
    : e.t === 'CampaignVisualEvent' ? `${co?.name} ran a campaign in ${DISTRICT_LABELS[e.districtId]} (+${e.gain} awareness)`
    : e.t;
  return el('div', { class: 'action-log-line' }, text);
}
function checkResolvingDone() { /* speed/skip only affects animation; summary button always available */ }

function goToSummary() { ui.screen = 'summary'; renderScreen(); }
function renderSummary() {
  clear($panels); renderTopbar();
  const round = game.round;
  const cards = game.companies.map((co, i) => {
    const fin = [...game.eventLog].reverse().find((e) => e.t === 'Finance' && e.companyId === co.id && e.round === round);
    const unitsThisRound = game.eventLog.filter((e) => e.t === 'PurchaseEvent' && e.companyId === co.id && e.round === round).reduce((s, e) => s + e.qty, 0);
    const won = game.eventLog.filter((e) => e.t === 'ShelfWon' && e.companyId === co.id && e.round === round).length;
    const lost = game.eventLog.filter((e) => e.t === 'ShelfDropped' && e.companyId === co.id && e.round === round).length;
    const profit = fin ? fin.revenue - fin.cogs - fin.salaries - fin.rent - fin.logistics : 0;
    return el('div', { class: 'card', style: 'position:static; flex:1;' }, [
      el('h2', { style: `color:${COMPANY_COLOR_CSS[i]}` }, co.name),
      el('p', {}, `Revenue $${fin?.revenue.toFixed(0) ?? 0}  ·  Units sold ${unitsThisRound}`),
      el('h3', {}, 'Finance breakdown'),
      el('p', { class: 'small' }, `COGS: -$${fin?.cogs.toFixed(0) ?? 0}`),
      el('p', { class: 'small' }, `Salaries: -$${fin?.salaries.toFixed(0) ?? 0}`),
      el('p', { class: 'small' }, `Rent: -$${fin?.rent.toFixed(0) ?? 0}`),
      el('p', { class: 'small' }, `Logistics: -$${fin?.logistics.toFixed(0) ?? 0}`),
      el('p', {}, [el('b', {}, `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(0)}`)]),
      el('p', {}, `Cash on hand: $${Math.round(co.cash)}`),
      (won || lost) ? el('p', { class: 'small' }, `Shelf: +${won} won, -${lost} lost`) : null,
      co.insolvent ? el('p', { class: 'small', style: 'color:#e08f7f' }, 'An employee left — payroll exceeded cash last round.') : null,
    ]);
  });
  const card = el('div', { class: 'card', style: 'width:min(760px,94vw)' }, [
    el('h2', {}, `Round ${round} Summary`),
    el('div', { class: 'row', style: 'align-items:stretch' }, cards),
    el('button', { class: 'primary', style: 'margin-top:14px', onclick: proceedAfterSummary }, game.finished ? 'See Match Results' : 'Next Round'),
  ]);
  $panels.appendChild(el('div', { class: 'overlay' }, card));
}

// ============================================================================================
// Screen: VICTORY
// ============================================================================================
function renderVictory() {
  clear($panels); $topbar.className = 'hidden';
  const winner = byId(game.companies, game.winnerId);
  const ranked = [...game.companies].sort((a, b) => b.cumulativeRevenue - a.cumulativeRevenue || b.cash - a.cash || b.unitsSoldTotal - a.unitsSoldTotal);
  let tieNote = '';
  if (ranked[0].cumulativeRevenue === ranked[1]?.cumulativeRevenue) tieNote = ranked[0].cash !== ranked[1].cash ? 'Tie-break: cash on hand.' : 'Tie-break: total units sold.';
  const telemetryJson = JSON.stringify(telemetry, null, 1);
  const card = el('div', { class: 'card' }, [
    el('h2', { style: `color:${COMPANY_COLOR_CSS[game.companies.indexOf(winner)]}` }, `🏆 ${winner.name} Wins!`),
    el('p', { class: 'small' }, tieNote || `Reached the match target after ${game.round} rounds.`),
    el('h3', {}, 'Final Standings'),
    ...ranked.map((c, i) => el('p', {}, `${i + 1}. ${c.name} — $${Math.round(c.cumulativeRevenue)} revenue, $${Math.round(c.cash)} cash`)),
    el('h3', {}, 'Playtest Telemetry'),
    el('pre', { style: 'font-size:11px; max-height:180px; overflow:auto; background:#0d0f14; padding:8px; border-radius:6px;' }, telemetryJson),
    el('div', { class: 'row', style: 'margin-top:10px' }, [
      el('button', { onclick: () => { const blob = new Blob([telemetryJson], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'company-economy-telemetry.json'; a.click(); } }, 'Export Telemetry JSON'),
      el('button', { class: 'primary', onclick: () => location.reload() }, 'New Match'),
    ]),
  ]);
  $panels.appendChild(el('div', { class: 'overlay' }, card));
}

// ============================================================================================
// Topbar / Dev panel / screen dispatch
// ============================================================================================
function renderTopbar() {
  $topbar.className = '';
  clear($topbar);
  const co0 = game.companies[0], co1 = game.companies[1];
  $topbar.appendChild(el('span', {}, [el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[0]}` }), `${co0.name}: $${Math.round(co0.cash)}`]));
  $topbar.appendChild(el('span', { class: 'tb-sep' }, '|'));
  $topbar.appendChild(el('span', {}, [el('span', { class: 'swatch', style: `background:${COMPANY_COLOR_CSS[1]}` }), `${co1.name}: $${Math.round(co1.cash)}`]));
  $topbar.appendChild(el('span', { class: 'tb-sep' }, '|'));
  $topbar.appendChild(el('span', {}, `Round ${game.round} / target $${TUNING.revenueTarget}${game.finalRound ? ' (final round!)' : ''}`));
  $topbar.appendChild(el('span', { class: 'tb-sep' }, '|'));
  $topbar.appendChild(el('span', {}, `Phase: ${game.phase}`));
}

const SCREEN_RENDERERS = { setup: renderSetup, transition: renderTransition, hq: renderHq, planning: renderPlanning, resolving: renderResolving, summary: renderSummary, victory: renderVictory };
function renderScreen() {
  SCREEN_RENDERERS[ui.screen]();
  renderDevPanel();
}

$devToggle.addEventListener('click', () => { ui.devMode = !ui.devMode; $devToggle.textContent = `Dev Mode: ${ui.devMode ? 'ON' : 'OFF'}`; $devPanel.className = ui.devMode ? 'dev-panel' : 'dev-panel hidden'; renderDevPanel(); });
function renderDevPanel() {
  if (!ui.devMode || !game) return;
  const lastStoreDecisions = game.debugLog.filter((d) => d.t === 'StoreDecision').slice(-2);
  const lastConsumerChoices = game.debugLog.filter((d) => d.t === 'ConsumerChoice' || d.t === 'NoPurchase').slice(-4);
  $devPanel.textContent = JSON.stringify({ seed: game.seed, round: game.round, phase: game.phase, initiative: game.initiativeIndex,
    selection: ui.selection, lastStoreDecisions, lastConsumerChoices }, null, 1);
}

renderScreen();
