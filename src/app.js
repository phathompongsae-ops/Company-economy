import {
  CLASS_DEFS, SECRET_CONTENT, TACTICS, beginNextFloor, chooseBlessing, createGame,
  deserializeGame, retreat, serializeGame, setFormation, spendSkillPoint, tick
} from './core.js';
import { PARTY_PRESETS } from './data.js';
import {
  HERO_FORMATION_ANCHORS, HERO_SPRITE_STANDARD, HERO_VISUALS, PROJECTILE_HERO_CLASSES,
  drawHero, drawHeroPortrait
} from './hero-visuals.js';

const SAVE_KEY = 'god-brave-save-v1';
const $ = selector => document.querySelector(selector);
const refs = {
  setup: $('#setup-screen'), game: $('#game-screen'), classGrid: $('#class-grid'),
  preset: $('#preset-select'), count: $('#party-count'), seed: $('#seed-input'),
  start: $('#start-button'), continue: $('#continue-button'), canvas: $('#battle-canvas'),
  combatPanel: $('#combat-panel'), tactic: $('#tactic-select'), tactical: $('#tactical-button'),
  autoRun: $('#autorun-toggle'), speed: $('#speed-select'), view: $('#view-button'),
  nextBattle: $('#next-battle-button'),
  floorLabel: $('#floor-label'), encounter: $('#encounter-label'), floorFill: $('#floor-fill'),
  breakCount: $('#break-count'), braveCount: $('#brave-count'), braveMeter: $('#brave-meter'),
  combatState: $('#combat-state'), battleLog: $('#battle-log'), partyList: $('#party-list'),
  lootList: $('#loot-list'), lootCount: $('#loot-count'), secretList: $('#secret-list'),
  secretCount: $('#secret-count'), save: $('#save-button'), retreat: $('#retreat-button'),
  checkpoint: $('#checkpoint-modal'), checkpointFloor: $('#checkpoint-floor'),
  blessingGrid: $('#blessing-grid'), skillGrid: $('#skill-grid'), nextFloor: $('#continue-floor-button'),
  result: $('#result-modal'), resultEmblem: $('#result-emblem'), resultKicker: $('#result-kicker'),
  resultTitle: $('#result-title'), resultText: $('#result-text'), resultStats: $('#result-stats'),
  resultParty: $('#result-party'), newRun: $('#new-run-button'), closeResult: $('#close-result-button'), toast: $('#toast')
};

let selected = new Set(PARTY_PRESETS[0].classes);
let game = null;
let lastTime = performance.now();
let transitionAt = 0;
let lastEventId = 0;
let effects = [];
let visualStates = new Map();
let resultShown = false;
const ctx = refs.canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function init() {
  refs.preset.innerHTML = PARTY_PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  refs.tactic.innerHTML = Object.values(TACTICS).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  renderClassGrid();
  refs.continue.hidden = !localStorage.getItem(SAVE_KEY);
  bindEvents();
  requestAnimationFrame(loop);
}

function renderClassGrid() {
  refs.classGrid.innerHTML = Object.values(CLASS_DEFS).map(def => `
    <label class="class-card ${selected.has(def.id) ? 'selected' : ''}" style="--class-color:${def.color}">
      <input type="checkbox" value="${def.id}" aria-label="เลือก${def.name}" ${selected.has(def.id) ? 'checked' : ''}>
      <span class="check-mark" aria-hidden="true">✓</span>
      <span class="class-portrait"><canvas width="84" height="98" data-hero-portrait="${def.id}" aria-hidden="true"></canvas></span>
      <span class="class-copy"><small>${def.role}</small><h3>${def.name}</h3><p>${HERO_VISUALS[def.id].identity}</p><em>${def.skill.name}</em></span>
    </label>`).join('');
  renderHeroCanvases(refs.classGrid);
  refs.count.textContent = `${selected.size}/4`;
  refs.start.disabled = selected.size !== 4;
  refs.classGrid.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    if (input.checked && selected.size >= 4) {
      input.checked = false;
      toast('เลือกสมาชิกได้สูงสุด 4 คน');
      return;
    }
    input.checked ? selected.add(input.value) : selected.delete(input.value);
    refs.preset.value = '';
    renderClassGrid();
  }));
}

function renderHeroCanvases(root, state = 'idle') {
  root.querySelectorAll('[data-hero-portrait]').forEach((canvas, index) => {
    drawHeroPortrait(canvas, canvas.dataset.heroPortrait, { state, progress: .62, time: index * .47 });
  });
}

function bindEvents() {
  refs.preset.addEventListener('change', () => {
    const preset = PARTY_PRESETS.find(p => p.id === refs.preset.value);
    if (preset) { selected = new Set(preset.classes); renderClassGrid(); }
  });
  refs.start.addEventListener('click', () => startNewRun());
  refs.continue.addEventListener('click', loadGame);
  refs.tactic.addEventListener('change', () => { if (game) game.tactic = refs.tactic.value; });
  refs.tactical.addEventListener('click', () => {
    if (!game) return;
    game.tacticalAuto = !game.tacticalAuto;
    refs.tactical.classList.toggle('active', game.tacticalAuto);
    refs.tactical.setAttribute('aria-pressed', String(game.tacticalAuto));
    refs.tactical.textContent = game.tacticalAuto ? 'Tactical Auto' : 'Full Auto';
  });
  refs.autoRun.addEventListener('change', () => {
    if (!game) return;
    game.autoRun = refs.autoRun.checked;
    if (game.autoRun && game.status === 'won_floor') advanceFloor();
  });
  refs.nextBattle.addEventListener('click', advanceFloor);
  refs.view.addEventListener('click', () => {
    refs.combatPanel.classList.toggle('minimized');
    refs.view.textContent = refs.combatPanel.classList.contains('minimized') ? '□' : '▣';
  });
  refs.save.addEventListener('click', () => saveGame(true));
  refs.retreat.addEventListener('click', () => {
    if (game && confirm('ถอนตัวและจบการเดินทางครั้งนี้หรือไม่?')) { retreat(game); showResult('retreated'); }
  });
  refs.nextFloor.addEventListener('click', () => {
    refs.checkpoint.hidden = true;
    advanceFloor();
    saveGame(false);
  });
  refs.newRun.addEventListener('click', resetToSetup);
  refs.closeResult.addEventListener('click', () => { refs.result.hidden = true; });
}

function startNewRun() {
  game = createGame({ seed: refs.seed.value, classes: [...selected], tacticalAuto: true, autoRun: true });
  refs.setup.hidden = true;
  refs.game.hidden = false;
  resultShown = false;
  lastEventId = 0;
  effects = [];
  visualStates.clear();
  refs.tactic.value = game.tactic;
  refs.tactical.classList.add('active');
  refs.tactical.textContent = 'Tactical Auto';
  refs.autoRun.checked = true;
  advanceFloor();
  renderUI();
}

function loadGame() {
  try {
    game = deserializeGame(localStorage.getItem(SAVE_KEY));
    refs.setup.hidden = true;
    refs.game.hidden = false;
    refs.tactic.value = game.tactic;
    refs.autoRun.checked = game.autoRun;
    refs.tactical.classList.toggle('active', game.tacticalAuto);
    refs.tactical.textContent = game.tacticalAuto ? 'Tactical Auto' : 'Full Auto';
    resultShown = false;
    lastEventId = 0;
    effects = [];
    visualStates.clear();
    if (game.status === 'checkpoint') showCheckpoint();
    else if (['victory', 'defeat', 'retreated'].includes(game.status)) showResult(game.status);
    renderUI();
    toast('โหลดบันทึกเรียบร้อย');
  } catch (error) {
    toast(`โหลดไม่ได้: ${error.message}`);
  }
}

function saveGame(notify) {
  if (!game) return;
  localStorage.setItem(SAVE_KEY, serializeGame(game));
  refs.continue.hidden = false;
  if (notify) toast('บันทึกการเดินทางแล้ว');
}

function resetToSetup() {
  refs.result.hidden = true;
  refs.checkpoint.hidden = true;
  refs.game.hidden = true;
  refs.setup.hidden = false;
  game = null;
  refs.continue.hidden = !localStorage.getItem(SAVE_KEY);
}

function loop(now) {
  const realDt = Math.min(.05, (now - lastTime) / 1000);
  lastTime = now;
  if (game && game.status === 'combat') {
    const multiplier = Number(refs.speed.value);
    const substeps = multiplier * 2;
    for (let i = 0; i < substeps && game.status === 'combat'; i++) tick(game, realDt * multiplier / substeps);
    captureEvents();
    if (game.status !== 'combat') handleStatus(now);
  } else if (game?.status === 'won_floor' && game.autoRun && transitionAt && now >= transitionAt) {
    transitionAt = 0;
    advanceFloor();
  }
  updateEffects(realDt);
  if (game) {
    drawBattle(now / 1000);
    renderDynamic();
  }
  requestAnimationFrame(loop);
}

function handleStatus(now) {
  saveGame(false);
  if (game.status === 'checkpoint') showCheckpoint();
  else if (['victory', 'defeat'].includes(game.status)) showResult(game.status);
  else if (game.status === 'won_floor') transitionAt = game.autoRun ? now + 1050 : 0;
  renderUI();
}

function captureEvents() {
  if (!game?.battle) return;
  const fresh = game.battle.events.filter(event => event.id > lastEventId);
  for (const event of fresh) {
    lastEventId = Math.max(lastEventId, event.id);
    const sourceHero = game.heroes.find(hero => hero.id === event.source);
    const targetHero = game.heroes.find(hero => hero.id === event.target);
    if (sourceHero) {
      if (event.type === 'brave') setVisualState(sourceHero.id, 'brave', .9);
      else if (event.type === 'skill' || event.type === 'heal') setVisualState(sourceHero.id, 'skill', .58);
      else if (event.type === 'hit' || event.type === 'critical') setVisualState(sourceHero.id, 'attack', .36);
    }
    if (targetHero && event.type === 'enemyHit') setVisualState(targetHero.id, 'hurt', .32);
    if (sourceHero && event.target && PROJECTILE_HERO_CLASSES.includes(sourceHero.classId) && ['hit', 'critical', 'skill'].includes(event.type)) {
      const sourceIndex = game.heroes.findIndex(hero => hero.id === sourceHero.id);
      const from = heroPosition(sourceIndex, sourceHero.row);
      const to = positionForId(event.target);
      effects.push({
        type: 'heroProjectile', classId: sourceHero.classId,
        from: { x: from.x + 22, y: from.y - 38 }, to: { x: to.x - 8, y: to.y - 30 },
        life: .42, max: .42
      });
    }
    const pos = positionForId(event.target || event.source);
    if (['hit', 'critical', 'skill', 'brave', 'enemyHit', 'break', 'heal'].includes(event.type)) {
      effects.push({ ...pos, type: event.type, text: event.type === 'break' ? 'BREAK!' : event.type === 'critical' ? 'CRITICAL!' : event.type === 'heal' ? `+${event.value}` : `-${event.value || ''}`, life: event.type === 'brave' ? 1.1 : .65, max: event.type === 'brave' ? 1.1 : .65 });
    }
  }
}

function setVisualState(id, state, duration) {
  const priority = { idle: 0, hurt: 1, attack: 2, skill: 3, brave: 4 };
  const current = visualStates.get(id);
  if (current?.life > 0 && priority[current.state] > priority[state]) return;
  if (current?.state === state && current.life > duration * .42) return;
  visualStates.set(id, { state, life: duration, max: duration });
}

function visualStateFor(hero) {
  if (!hero.alive || hero.hp <= 0) return { state: 'ko', progress: 1 };
  const current = visualStates.get(hero.id);
  if (!current?.life) return { state: 'idle', progress: 0 };
  return { state: current.state, progress: 1 - current.life / current.max };
}

function renderUI() {
  if (!game) return;
  refs.floorLabel.textContent = `ชั้น ${game.floor || 1} / 20`;
  refs.encounter.textContent = game.battle?.encounter.name || statusText(game.status);
  refs.floorFill.style.width = `${Math.max(2, game.floor / 20 * 100)}%`;
  refs.breakCount.textContent = game.stats.breaks;
  refs.braveCount.textContent = game.stats.braveArts;
  renderParty();
  renderLoot();
  renderSecrets();
  renderLog();
}

function renderDynamic() {
  refs.floorLabel.textContent = `ชั้น ${game.floor || 1} / 20`;
  refs.floorFill.style.width = `${Math.max(2, game.floor / 20 * 100)}%`;
  refs.breakCount.textContent = game.stats.breaks;
  refs.braveCount.textContent = game.stats.braveArts;
  const brave = Math.round(game.battle?.brave || 0);
  refs.braveMeter.querySelector('i').style.width = `${brave}%`;
  refs.braveMeter.querySelector('b').textContent = `${brave}%`;
  refs.combatState.textContent = statusText(game.status);
  refs.nextBattle.hidden = game.status !== 'won_floor' || game.autoRun;
  if (game.status === 'combat') renderParty();
}

function advanceFloor() {
  if (game && beginNextFloor(game)) {
    lastEventId = 0;
    effects = [];
    visualStates.clear();
    transitionAt = 0;
    renderUI();
  }
}

function statusText(status) {
  return ({ ready: 'เตรียมพร้อม', combat: 'กำลังต่อสู้', won_floor: 'ชนะแล้ว', checkpoint: 'จุดวางแผน', victory: 'พิชิตหอคอย', defeat: 'พ่ายแพ้', retreated: 'ถอนตัวแล้ว' })[status] || status;
}

function renderParty() {
  refs.partyList.innerHTML = game.heroes.map(hero => {
    const def = CLASS_DEFS[hero.classId];
    const hp = Math.max(0, Math.round(hero.hp / hero.maxHp * 100));
    const equips = Object.values(hero.equipment).map(item => `<span class="${item ? 'filled' : ''}" title="${item?.name || 'ว่าง'}"></span>`).join('');
    return `<article class="party-unit ${hero.alive ? '' : 'down'}" style="--class-color:${def.color}">
      <div class="party-unit-head"><b>${hero.name} <small>Lv.${hero.level}</small></b><span>${Math.round(hero.hp)}/${hero.maxHp}</span></div>
      <div class="bar"><i style="width:${hp}%"></i></div>
      <div class="party-meta"><span>${hero.row === 'front' ? 'แนวหน้า' : 'แนวหลัง'} · SP ${hero.skillPoints}</span><span class="equipment-dots">${equips}</span></div>
    </article>`;
  }).join('');
}

function renderLoot() {
  refs.lootCount.textContent = `${game.inventory.length} ชิ้น`;
  if (!game.inventory.length) { refs.lootList.innerHTML = '<p class="muted">ยังไม่พบอุปกรณ์</p>'; return; }
  refs.lootList.innerHTML = [...game.inventory].reverse().slice(0, 12).map(item => `
    <article class="loot-item" style="--tier-color:${['#747986','#66b882','#638fe6','#d38adf'][item.tier]}">
      <span class="loot-icon">${item.slot === 'weapon' ? '⚔' : item.slot === 'armor' ? '◆' : '✦'}</span>
      <span><b>${item.name}</b><small>${statName(item.stat)} +${item.value} · ชั้น ${item.floor}</small></span>
    </article>`).join('');
}

function statName(stat) {
  return ({ hp: 'HP', attack: 'โจมตี', defense: 'เกราะ', speed: 'ความเร็ว', breakPower: 'เบรก', skillPower: 'พลังสกิล', braveGain: 'Brave' })[stat] || stat;
}

function allSecrets() {
  return [
    ...SECRET_CONTENT.classes.map(x => ({ ...x, type: 'classes' })),
    ...SECRET_CONTENT.items.map(x => ({ ...x, type: 'items' })),
    ...SECRET_CONTENT.encounters.map(x => ({ ...x, type: 'encounters' }))
  ];
}

function renderSecrets() {
  const entries = allSecrets();
  const unlocked = entries.filter(s => game.unlocks[s.type].includes(s.id)).length;
  refs.secretCount.textContent = `${unlocked}/${entries.length}`;
  refs.secretList.innerHTML = entries.map(secret => {
    const open = game.unlocks[secret.type].includes(secret.id);
    return `<div class="secret-entry ${open ? 'unlocked' : ''}"><span>${open ? '✦' : '◇'}</span><span><b>${open ? secret.name : '???'}</b><br><small>${secret.condition}</small></span></div>`;
  }).join('');
}

function renderLog() {
  const events = game.battle?.events || [];
  refs.battleLog.innerHTML = [...events].reverse().slice(0, 6).map(event => `<span class="log-pill ${event.type}">${event.text}</span>`).join('');
}

function showCheckpoint() {
  refs.checkpointFloor.textContent = game.floor;
  refs.checkpoint.hidden = false;
  refs.nextFloor.disabled = game.blessingChoices.length > 0;
  refs.blessingGrid.innerHTML = game.blessingChoices.map(b => `<button class="blessing-card" data-id="${b.id}"><b>${b.name}</b><span>${b.description}</span></button>`).join('') || '<p>เลือกพรแล้ว</p>';
  refs.blessingGrid.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    if (chooseBlessing(game, button.dataset.id)) {
      refs.blessingGrid.querySelectorAll('button').forEach(b => b.disabled = true);
      button.classList.add('selected');
      refs.nextFloor.disabled = false;
      renderSkillGrid();
      saveGame(false);
    }
  }));
  renderSkillGrid();
}

function renderSkillGrid() {
  refs.skillGrid.innerHTML = game.heroes.map(hero => `
    <article class="skill-row">
      <div><b>${hero.name}</b><span>แต้มสกิล ${hero.skillPoints}</span></div>
      <div class="skill-actions">
        <button data-hero="${hero.id}" data-branch="power" ${hero.skillPoints < 1 || hero.skillRanks.power >= 3 ? 'disabled' : ''}>พลัง ${hero.skillRanks.power}/3</button>
        <button data-hero="${hero.id}" data-branch="guard" ${hero.skillPoints < 1 || hero.skillRanks.guard >= 3 ? 'disabled' : ''}>คุ้มกัน ${hero.skillRanks.guard}/3</button>
        <button data-hero="${hero.id}" data-branch="tempo" ${hero.skillPoints < 1 || hero.skillRanks.tempo >= 3 ? 'disabled' : ''}>จังหวะ ${hero.skillRanks.tempo}/3</button>
      </div>
      <div class="row-actions">
        <button data-row="front" data-hero="${hero.id}" class="${hero.row === 'front' ? 'active' : ''}">แนวหน้า</button>
        <button data-row="back" data-hero="${hero.id}" class="${hero.row === 'back' ? 'active' : ''}">แนวหลัง</button>
      </div>
    </article>`).join('');
  refs.skillGrid.querySelectorAll('[data-branch]').forEach(button => button.addEventListener('click', () => {
    spendSkillPoint(game, button.dataset.hero, button.dataset.branch);
    renderSkillGrid(); renderParty(); saveGame(false);
  }));
  refs.skillGrid.querySelectorAll('[data-row]').forEach(button => button.addEventListener('click', () => {
    setFormation(game, button.dataset.hero, button.dataset.row);
    renderSkillGrid(); renderParty();
  }));
}

function showResult(status) {
  if (resultShown && !refs.result.hidden) return;
  resultShown = true;
  refs.result.hidden = false;
  const victory = status === 'victory';
  refs.resultEmblem.textContent = victory ? '✦' : status === 'defeat' ? '×' : '↩';
  refs.resultKicker.textContent = victory ? 'TOWER CONQUERED' : status === 'defeat' ? 'RUN ENDED' : 'SAFE RETURN';
  refs.resultTitle.textContent = victory ? 'ตำนานผู้กล้าถือกำเนิด' : status === 'defeat' ? 'กองกล้าพ่ายแพ้' : 'ถอนตัวสำเร็จ';
  refs.resultText.textContent = victory ? `คุณพิชิต ${game.battle.encounter.name} และผ่านครบ 20 ชั้น` : `การเดินทางสิ้นสุดที่ชั้น ${game.floor} ลองปรับปาร์ตี้ อุปกรณ์ และแผนใหม่`;
  const values = [
    [game.highestFloor, 'ชั้นสูงสุด'], [game.stats.breaks, 'BREAK'],
    [game.stats.braveArts, 'BRAVE ARTS'], [game.stats.loot, 'อุปกรณ์']
  ];
  refs.resultStats.innerHTML = values.map(([value, label]) => `<div><b>${value}</b><small>${label}</small></div>`).join('');
  refs.resultParty.innerHTML = game.heroes.map(hero => `
    <span style="--class-color:${CLASS_DEFS[hero.classId].color}">
      <canvas width="72" height="86" data-hero-portrait="${hero.classId}" aria-hidden="true"></canvas>
      <b>${hero.name}</b>
    </span>`).join('');
  renderHeroCanvases(refs.resultParty, victory ? 'victory' : 'ko');
  saveGame(false);
}

function toast(text) {
  refs.toast.textContent = text;
  refs.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => refs.toast.classList.remove('show'), 1800);
}

function positionForId(id) {
  const heroes = game?.heroes || [];
  const heroIndex = heroes.findIndex(h => h.id === id);
  if (heroIndex >= 0) return heroPosition(heroIndex, heroes[heroIndex].row);
  const enemies = game?.battle?.enemies || [];
  const enemyIndex = enemies.findIndex(e => e.id === id);
  return enemyPosition(enemyIndex, enemies.length);
}

function heroPosition(index, row) {
  const positions = HERO_FORMATION_ANCHORS[row] || HERO_FORMATION_ANCHORS.back;
  return { x: positions[index % 4][0], y: positions[index % 4][1] };
}

function enemyPosition(index, count) {
  const spread = count === 1 ? [0] : count === 2 ? [-65, 65] : count === 3 ? [-90, 0, 90] : [-105, -35, 35, 105];
  return { x: 720 + (index % 2) * 58, y: 338 + (spread[index] || 0) };
}

function updateEffects(dt) {
  effects.forEach(effect => effect.life -= dt);
  effects = effects.filter(effect => effect.life > 0);
  visualStates.forEach((visual, id) => {
    visual.life -= dt;
    if (visual.life <= 0) visualStates.delete(id);
  });
}

function drawBattle(time) {
  const c = ctx;
  const shake = effects.some(e => e.type === 'brave') ? Math.sin(time * 65) * 5 : effects.some(e => e.type === 'break') ? Math.sin(time * 80) * 3 : 0;
  c.save(); c.translate(shake, 0);
  const grad = c.createLinearGradient(0, 0, 0, 500);
  grad.addColorStop(0, '#161936'); grad.addColorStop(.55, '#272443'); grad.addColorStop(1, '#171420');
  c.fillStyle = grad; c.fillRect(-10, 0, 980, 500);
  drawDungeon(c, time);
  if (game?.battle) {
    game.heroes.forEach((hero, i) => drawUnit(c, hero, heroPosition(i, hero.row), false, time));
    game.battle.enemies.forEach((enemy, i) => drawUnit(c, enemy, enemyPosition(i, game.battle.enemies.length), true, time));
  }
  effects.forEach(effect => drawEffect(c, effect));
  c.restore();
}

function drawDungeon(c, time) {
  c.fillStyle = '#34304d'; c.fillRect(0, 318, 960, 182);
  c.fillStyle = '#252238';
  for (let x = 0; x < 960; x += 64) for (let y = 330; y < 500; y += 32) c.fillRect(x + (y % 64), y, 58, 27);
  c.fillStyle = '#22223c';
  for (let x = 30; x < 960; x += 155) { c.fillRect(x, 80, 58, 238); c.fillStyle = '#191a30'; c.fillRect(x + 8, 80, 8, 238); c.fillStyle = '#22223c'; }
  c.fillStyle = '#e98d50';
  for (let x = 112; x < 960; x += 310) {
    const flicker = Math.round(Math.sin(time * 7 + x) * 3);
    c.fillRect(x, 210 - flicker, 12, 20 + flicker); c.fillStyle = 'rgba(238,125,63,.12)'; c.fillRect(x - 42, 170, 96, 100); c.fillStyle = '#e98d50';
  }
  c.fillStyle = 'rgba(10,8,20,.28)'; c.fillRect(0, 0, 960, 70); c.fillRect(0, 470, 960, 30);
}

function drawUnit(c, unit, pos, enemy, time) {
  const alive = unit.alive && unit.hp > 0;
  if (!enemy && HERO_VISUALS[unit.classId]) {
    const visual = visualStateFor(unit);
    drawHero(c, {
      classId: unit.classId, x: pos.x, y: pos.y,
      scale: HERO_SPRITE_STANDARD.combatScale, facing: 1,
      state: visual.state, progress: visual.progress, time,
      alpha: alive ? 1 : .48
    });
  } else {
    const bounce = alive ? Math.sin(time * 4.5 + pos.x) * 2 : 10;
    c.save(); c.translate(pos.x, pos.y + bounce); if (!alive) { c.globalAlpha = .35; c.rotate(Math.PI / 2); }
    const scale = unit.boss ? 1.55 : 1;
    c.scale(enemy ? -scale : scale, scale);
    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-24, 31, 53, 8);
    c.fillStyle = unit.color || '#aaa';
    c.fillRect(-18, -10, 36, 39); c.fillRect(-24, 3, 8, 24); c.fillRect(16, 3, 8, 24);
    c.fillStyle = '#b7a0a0'; c.fillRect(-15, -34, 30, 27);
    c.fillStyle = unit.color || '#aaa'; c.fillRect(-18, -40, 36, 11);
    c.fillStyle = '#191523'; c.fillRect(-9, -22, 4, 4); c.fillRect(6, -22, 4, 4);
    c.fillStyle = '#222339'; c.fillRect(-15, 29, 11, 9); c.fillRect(5, 29, 11, 9);
    if (unit.broken > 0) { c.strokeStyle = '#ffe06d'; c.lineWidth = 3; c.strokeRect(-25, -45, 50, 82); }
    c.restore();
  }
  if (!alive) return;
  const width = unit.boss ? 100 : 70;
  const ratio = Math.max(0, unit.hp / unit.maxHp);
  const hpY = pos.y - (unit.boss ? 94 : enemy ? 61 : 82);
  c.fillStyle = '#0c0d16'; c.fillRect(pos.x - width / 2, hpY, width, 7);
  c.fillStyle = enemy ? '#e15b61' : '#68c77b'; c.fillRect(pos.x - width / 2 + 1, hpY + 1, (width - 2) * ratio, 5);
  if (enemy && unit.breakMax) {
    c.fillStyle = '#0c0d16'; c.fillRect(pos.x - width / 2, pos.y - (unit.boss ? 83 : 51), width, 5);
    c.fillStyle = '#55c8df'; c.fillRect(pos.x - width / 2 + 1, pos.y - (unit.boss ? 82 : 50), (width - 2) * unit.breakGauge / unit.breakMax, 3);
  }
}

function drawEffect(c, effect) {
  const progress = 1 - effect.life / effect.max;
  c.save(); c.globalAlpha = Math.max(0, 1 - progress);
  if (effect.type === 'heroProjectile') {
    const eased = 1 - Math.pow(1 - progress, 2);
    const x = effect.from.x + (effect.to.x - effect.from.x) * eased;
    const y = effect.from.y + (effect.to.y - effect.from.y) * eased - Math.sin(Math.PI * progress) * 9;
    if (effect.classId === 'ranger') {
      c.strokeStyle = '#f6ead0'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 15, y + 2); c.lineTo(x + 9, y - 2); c.stroke();
      c.fillStyle = '#bde58b'; c.fillRect(x + 7, y - 5, 7, 6); c.fillRect(x - 15, y - 1, 5, 5);
    } else if (effect.classId === 'mage') {
      c.fillStyle = 'rgba(112,226,228,.22)'; c.fillRect(x - 12, y - 12, 24, 24);
      c.fillStyle = '#70e2e4'; c.fillRect(x - 7, y - 7, 14, 14);
      c.fillStyle = '#e9ffff'; c.fillRect(x - 3, y - 3, 6, 6);
    } else {
      c.fillStyle = 'rgba(255,224,132,.24)'; c.fillRect(x - 11, y - 11, 22, 22);
      c.fillStyle = '#ffe084'; c.fillRect(x - 3, y - 10, 6, 20); c.fillRect(x - 10, y - 3, 20, 6);
      c.fillStyle = '#fff8df'; c.fillRect(x - 3, y - 3, 6, 6);
    }
    c.restore();
    return;
  }
  if (effect.type === 'hit' || effect.type === 'critical' || effect.type === 'skill') {
    c.strokeStyle = effect.type === 'critical' ? '#ffe26d' : '#f7f0df'; c.lineWidth = effect.type === 'critical' ? 8 : 5;
    c.beginPath(); c.arc(effect.x, effect.y - 12, 24 + progress * 20, -1.2, .8); c.stroke();
  }
  if (effect.type === 'break' || effect.type === 'brave') {
    c.strokeStyle = effect.type === 'break' ? '#66e5f4' : '#ffd85b'; c.lineWidth = 7 * (1 - progress);
    c.beginPath(); c.arc(effect.x, effect.y, 30 + progress * 85, 0, Math.PI * 2); c.stroke();
  }
  c.font = `900 ${effect.type === 'break' || effect.type === 'critical' ? 24 : 16}px sans-serif`;
  c.textAlign = 'center'; c.fillStyle = effect.type === 'heal' ? '#8bed98' : effect.type === 'break' ? '#7cecff' : '#ffe681';
  c.strokeStyle = '#17101f'; c.lineWidth = 5;
  c.strokeText(effect.text, effect.x, effect.y - 55 - progress * 28); c.fillText(effect.text, effect.x, effect.y - 55 - progress * 28);
  c.restore();
}

init();
