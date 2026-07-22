import {
  BLESSINGS, CLASS_DEFS, EQUIPMENT_TEMPLATES, SECRET_CONTENT, TACTICS,
  TIER_NAMES, encounterForFloor
} from './data.js';

export const SAVE_VERSION = 1;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(value) {
  const text = String(value || Date.now());
  if (/^\d{1,10}$/.test(text)) return Number(text) >>> 0;
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function validateParty(classIds) {
  if (!Array.isArray(classIds) || classIds.length !== 4) return false;
  return new Set(classIds).size === 4 && classIds.every(id => CLASS_DEFS[id]);
}

function baseHero(id, index) {
  const def = CLASS_DEFS[id];
  return {
    id: `${id}_${index}`, classId: id, name: def.name, role: def.role,
    row: def.row, level: 1, skillPoints: 0, skillRanks: { power: 0, guard: 0, tempo: 0 },
    equipment: { weapon: null, armor: null, rune: null },
    hp: def.hp, maxHp: def.hp, attack: def.attack, defense: def.defense,
    speed: def.speed, breakPower: def.breakPower, crit: def.crit,
    skillPower: 1, braveGain: 1, cooldown: 0, skillCooldown: 1.5, alive: true,
    shield: 0, evasion: id === 'rogue' ? 0.12 : 0.03,
    damageDone: 0, healingDone: 0
  };
}

export function createGame(options = {}) {
  const seed = normalizeSeed(options.seed ?? Date.now());
  const classes = options.classes || ['guardian', 'warrior', 'ranger', 'priest'];
  if (!validateParty(classes)) throw new Error('ต้องเลือกอาชีพไม่ซ้ำกัน 4 อาชีพ');
  const heroes = classes.map(baseHero);
  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    status: 'ready',
    floor: 0,
    highestFloor: 0,
    tactic: options.tactic || 'balanced',
    tacticalAuto: options.tacticalAuto !== false,
    autoRun: options.autoRun !== false,
    heroes,
    inventory: [],
    blessings: [],
    blessingChoices: [],
    battle: null,
    stats: {
      battles: 0, wins: 0, defeats: 0, retreats: 0, breaks: 0, braveArts: 0,
      damage: 0, healing: 0, loot: 0, checkpoints: 0, time: 0,
      finalBossesDefeated: []
    },
    unlocks: { classes: [], items: [], encounters: [] },
    log: [{ type: 'system', text: 'กองกล้าเตรียมเข้าสู่หอคอย' }]
  };
}

function nextRandom(game) {
  game.rngState = (Math.imul(game.rngState, 1664525) + 1013904223) >>> 0;
  return game.rngState / 4294967296;
}

function blessingMultiplier(game, stat) {
  return game.blessings
    .filter(b => b.stat === stat)
    .reduce((value, b) => value * (1 + b.value), 1);
}

function applyDerivedStats(game, hero) {
  const def = CLASS_DEFS[hero.classId];
  const levelScale = 1 + (hero.level - 1) * 0.055;
  hero.maxHp = Math.round(def.hp * levelScale * blessingMultiplier(game, 'hp'));
  hero.attack = Math.round(def.attack * levelScale * blessingMultiplier(game, 'attack'));
  hero.defense = Math.round(def.defense * levelScale * blessingMultiplier(game, 'defense'));
  hero.speed = def.speed * blessingMultiplier(game, 'speed');
  hero.breakPower = Math.round(def.breakPower * blessingMultiplier(game, 'breakPower'));
  hero.skillPower = 1 + hero.skillRanks.power * 0.12;
  hero.braveGain = blessingMultiplier(game, 'braveGain');
  hero.evasion = (hero.classId === 'rogue' ? 0.12 : 0.03) + hero.skillRanks.tempo * 0.025;
  for (const item of Object.values(hero.equipment)) {
    if (!item) continue;
    if (item.stat === 'hp') hero.maxHp += item.value;
    else if (item.stat === 'attack') hero.attack += item.value;
    else if (item.stat === 'defense') hero.defense += item.value;
    else if (item.stat === 'speed') hero.speed += item.value;
    else if (item.stat === 'breakPower') hero.breakPower += item.value;
    else if (item.stat === 'skillPower') hero.skillPower += item.value;
    else if (item.stat === 'braveGain') hero.braveGain += item.value;
  }
  hero.maxHp = Math.max(1, hero.maxHp);
  hero.hp = Math.min(hero.hp, hero.maxHp);
}

function createEnemy(game, encounter, index) {
  const floor = game.floor;
  const bossScale = encounter.boss ? (encounter.final ? 4.9 : 3.15) : 1;
  const hp = Math.round((128 + floor * 31 + floor * floor * 1.72) * bossScale / Math.max(1, encounter.count * 0.62));
  const attack = Math.round((23 + floor * 4.6) * (encounter.boss ? 1.2 : 1));
  const defense = Math.round(4 + floor * 1.05 + (encounter.trait === 'armored' || encounter.trait === 'fortify' ? 8 : 0));
  const breakMax = Math.round((85 + floor * 8) * (encounter.boss ? 1.55 : 0.75));
  return {
    id: `${encounter.id}_${index}`, name: encounter.name, color: encounter.color,
    boss: encounter.boss, final: encounter.final, trait: encounter.trait,
    hp, maxHp: hp, attack, defense, speed: 0.68 + floor * 0.008 + (index % 2) * 0.08,
    breakGauge: breakMax, breakMax, broken: 0, cooldown: 0.4 + index * 0.22,
    skillCooldown: encounter.boss ? 4.5 : 7, alive: true, index
  };
}

export function beginNextFloor(game) {
  if (!['ready', 'won_floor', 'checkpoint'].includes(game.status)) return false;
  if (game.floor >= 20) return false;
  game.floor += 1;
  game.highestFloor = Math.max(game.highestFloor, game.floor);
  const encounter = encounterForFloor(game.floor, () => nextRandom(game));
  game.heroes.forEach(hero => {
    applyDerivedStats(game, hero);
    if (hero.hp <= 0) hero.hp = Math.round(hero.maxHp * 0.42);
    else hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * 0.20));
    hero.alive = true;
    hero.cooldown = nextRandom(game) * 0.45;
    hero.skillCooldown = 0.8 + nextRandom(game) * 0.8;
    hero.shield = 0;
  });
  const enemies = Array.from({ length: encounter.count }, (_, index) => createEnemy(game, encounter, index));
  game.battle = {
    encounter,
    enemies,
    brave: 18,
    elapsed: 0,
    events: [],
    eventSeq: 0,
    totalDamage: 0,
    totalHealing: 0
  };
  game.status = 'combat';
  game.stats.battles += 1;
  addEvent(game, 'floor', `ชั้น ${game.floor}: ${encounter.name}`, { boss: encounter.boss });
  return true;
}

function addEvent(game, type, text, extra = {}) {
  const event = { id: ++game.battle.eventSeq, time: game.battle.elapsed, type, text, ...extra };
  game.battle.events.push(event);
  if (game.battle.events.length > 80) game.battle.events.shift();
  if (['break', 'brave', 'victory', 'defeat', 'loot', 'skill'].includes(type)) {
    game.log.push({ type, text, floor: game.floor });
    if (game.log.length > 100) game.log.shift();
  }
  return event;
}

function living(list) {
  return list.filter(unit => unit.alive && unit.hp > 0);
}

function pickEnemy(game, hero) {
  const enemies = living(game.battle.enemies);
  if (!enemies.length) return null;
  if (hero.classId === 'rogue') return [...enemies].sort((a, b) => a.hp - b.hp)[0];
  if (game.tactic === 'break') return [...enemies].sort((a, b) => a.breakGauge - b.breakGauge)[0];
  return enemies.find(e => !e.boss) || enemies[0];
}

function pickHero(game, enemy) {
  const heroes = living(game.heroes);
  if (!heroes.length) return null;
  const front = heroes.filter(h => h.row === 'front');
  if (enemy.trait === 'caster' || enemy.trait === 'curse') {
    const back = heroes.filter(h => h.row === 'back');
    if (back.length && nextRandom(game) < 0.42) return back[Math.floor(nextRandom(game) * back.length)];
  }
  const pool = front.length ? front : heroes;
  return pool[Math.floor(nextRandom(game) * pool.length)];
}

function grantBrave(game, amount) {
  game.battle.brave = Math.min(100, game.battle.brave + amount);
}

function dealToEnemy(game, hero, enemy, power, breakPower, label = 'hit', aoe = false) {
  if (!enemy?.alive) return 0;
  const tactic = TACTICS[game.tactic] || TACTICS.balanced;
  const crit = nextRandom(game) < hero.crit;
  const variance = 0.9 + nextRandom(game) * 0.2;
  const brokenAmp = enemy.broken > 0 ? 1.5 : 1;
  const raw = hero.attack * power * hero.skillPower * tactic.damage * variance * (crit ? 1.55 : 1) * brokenAmp;
  const damage = Math.max(1, Math.round(raw * 100 / (100 + enemy.defense * 2.4)));
  enemy.hp = Math.max(0, enemy.hp - damage);
  hero.damageDone += damage;
  game.battle.totalDamage += damage;
  game.stats.damage += damage;
  const breakDamage = Math.max(1, Math.round(breakPower * tactic.break * (crit ? 1.2 : 1)));
  if (enemy.broken <= 0) {
    enemy.breakGauge = Math.max(0, enemy.breakGauge - breakDamage);
    if (enemy.breakGauge === 0) {
      enemy.broken = 3.1;
      game.stats.breaks += 1;
      grantBrave(game, 14);
      addEvent(game, 'break', `BREAK! ${enemy.name} เสียจังหวะ`, { target: enemy.id, value: breakDamage });
    }
  }
  let brave = hero.classId === 'warrior' ? 2.5 + breakDamage * 0.045 : 1.3;
  if (crit) brave += hero.classId === 'ranger' || hero.classId === 'rogue' ? 5 : 2;
  if (aoe && hero.classId === 'mage') brave += 2;
  grantBrave(game, brave * hero.braveGain);
  addEvent(game, crit ? 'critical' : label, `${hero.name} ทำ ${damage}${crit ? ' CRITICAL' : ''}`, {
    source: hero.id, target: enemy.id, value: damage, crit, aoe
  });
  if (enemy.hp <= 0) {
    enemy.alive = false;
    addEvent(game, 'ko', `${enemy.name} ถูกปราบ`, { target: enemy.id });
  }
  return damage;
}

function damageHero(game, enemy, hero, power = 1) {
  if (!hero?.alive) return 0;
  if (nextRandom(game) < hero.evasion) {
    if (hero.classId === 'rogue') grantBrave(game, 5 * hero.braveGain);
    addEvent(game, 'evade', `${hero.name} หลบได้`, { target: hero.id });
    return 0;
  }
  let raw = enemy.attack * power * (0.9 + nextRandom(game) * 0.2);
  if (hero.row === 'back') raw *= 0.9;
  let damage = Math.max(1, Math.round(raw * 100 / (100 + hero.defense * 3.1)));
  if (hero.shield > 0) {
    const absorbed = Math.min(hero.shield, damage);
    hero.shield -= absorbed;
    damage -= absorbed;
  }
  hero.hp = Math.max(0, hero.hp - damage);
  if (hero.classId === 'guardian') grantBrave(game, (3 + damage * 0.045) * hero.braveGain);
  addEvent(game, 'enemyHit', `${enemy.name} โจมตี ${hero.name} ${damage}`, {
    source: enemy.id, target: hero.id, value: damage
  });
  if (hero.hp <= 0) {
    hero.alive = false;
    addEvent(game, 'down', `${hero.name} หมดสติ`, { target: hero.id });
  }
  return damage;
}

function healParty(game, priest, power = 1) {
  const targets = living(game.heroes).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 2);
  let total = 0;
  for (const target of targets) {
    const amount = Math.round((42 + priest.attack * 0.72) * power * priest.skillPower);
    const actual = Math.min(amount, target.maxHp - target.hp);
    target.hp += actual;
    total += actual;
    addEvent(game, 'heal', `${priest.name} ฟื้นฟู ${target.name} +${actual}`, { source: priest.id, target: target.id, value: actual });
  }
  priest.healingDone += total;
  game.battle.totalHealing += total;
  game.stats.healing += total;
  grantBrave(game, (2 + total * 0.055) * priest.braveGain);
}

function useSkill(game, hero) {
  const def = CLASS_DEFS[hero.classId];
  const enemies = living(game.battle.enemies);
  const target = pickEnemy(game, hero);
  if (!target) return;
  addEvent(game, 'skill', `${hero.name} ใช้ ${def.skill.name}`, { source: hero.id, skill: def.skill.kind });
  switch (def.skill.kind) {
    case 'guard':
      living(game.heroes).forEach(ally => { ally.shield += Math.round(30 + hero.defense * 1.4 + hero.skillRanks.guard * 10); });
      grantBrave(game, 5 * hero.braveGain);
      break;
    case 'heavy': dealToEnemy(game, hero, target, 1.7, hero.breakPower * 2.2, 'skill'); break;
    case 'volley': enemies.slice(0, 3).forEach(enemy => dealToEnemy(game, hero, enemy, 0.74, hero.breakPower * 0.72, 'skill', true)); break;
    case 'ambush': dealToEnemy(game, hero, [...enemies].sort((a, b) => a.hp - b.hp)[0], 1.85, hero.breakPower * 1.2, 'skill'); break;
    case 'nova': enemies.forEach(enemy => dealToEnemy(game, hero, enemy, 0.83, hero.breakPower * 0.65, 'skill', true)); break;
    case 'heal': healParty(game, hero, 1); break;
  }
  hero.skillCooldown = Math.max(2.6, def.skill.cooldown - hero.skillRanks.tempo * 0.45);
}

function shouldUseSkill(game, hero) {
  if (!game.tacticalAuto) return true;
  const tactic = TACTICS[game.tactic] || TACTICS.balanced;
  if (hero.classId === 'priest') {
    return living(game.heroes).some(h => h.hp / h.maxHp < tactic.healAt);
  }
  if (hero.classId === 'guardian') {
    return living(game.heroes).some(h => h.hp / h.maxHp < 0.76) || game.battle.encounter.boss;
  }
  return true;
}

function useBraveArt(game) {
  if (game.battle.brave < 100) return false;
  const livingHeroes = living(game.heroes);
  const enemies = living(game.battle.enemies);
  if (!livingHeroes.length || !enemies.length) return false;
  const tactic = TACTICS[game.tactic] || TACTICS.balanced;
  const broken = enemies.some(e => e.broken > 0);
  if (game.tacticalAuto && tactic.brave === 'onBreak' && !broken && enemies.some(e => e.breakGauge / e.breakMax < 0.72)) return false;
  if (game.tacticalAuto && tactic.brave === 'smart' && !broken && enemies.some(e => e.boss && e.breakGauge / e.breakMax < 0.48)) return false;
  let hero;
  if (livingHeroes.some(h => h.hp / h.maxHp < 0.36)) hero = livingHeroes.find(h => h.classId === 'priest') || livingHeroes.find(h => h.classId === 'guardian');
  if (!hero) hero = livingHeroes.find(h => h.classId === (broken ? 'mage' : 'warrior')) || livingHeroes.sort((a, b) => b.attack - a.attack)[0];
  const def = CLASS_DEFS[hero.classId];
  game.battle.brave = 0;
  game.stats.braveArts += 1;
  addEvent(game, 'brave', `BRAVE ARTS — ${def.brave.name}`, { source: hero.id, brave: def.brave.kind });
  if (def.brave.kind === 'aegis') {
    livingHeroes.forEach(h => { h.shield += Math.round(h.maxHp * 0.32); });
  } else if (def.brave.kind === 'dawn') {
    livingHeroes.forEach(h => { h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.46)); });
  } else if (def.brave.kind === 'earthsplit') {
    dealToEnemy(game, hero, pickEnemy(game, hero), 3.25, hero.breakPower * 3.2, 'brave');
  } else if (def.brave.kind === 'nightfall') {
    enemies.slice(0, 2).forEach(e => dealToEnemy(game, hero, e, 2.05, hero.breakPower * 1.5, 'brave', true));
  } else {
    enemies.forEach(e => dealToEnemy(game, hero, e, def.brave.kind === 'starfall' ? 1.65 : 1.45, hero.breakPower, 'brave', true));
  }
  return true;
}

function updateHero(game, hero, dt) {
  if (!hero.alive) return;
  hero.cooldown -= dt;
  hero.skillCooldown -= dt;
  if (hero.skillCooldown <= 0 && shouldUseSkill(game, hero)) useSkill(game, hero);
  if (hero.cooldown <= 0) {
    const target = pickEnemy(game, hero);
    if (target) dealToEnemy(game, hero, target, 1, hero.breakPower, 'hit');
    hero.cooldown += Math.max(0.35, 1.72 / hero.speed);
  }
}

function updateEnemy(game, enemy, dt) {
  if (!enemy.alive) return;
  if (enemy.broken > 0) {
    enemy.broken -= dt;
    if (enemy.broken <= 0) enemy.breakGauge = enemy.breakMax;
    return;
  }
  enemy.cooldown -= dt;
  enemy.skillCooldown -= dt;
  if (enemy.cooldown <= 0) {
    const target = pickHero(game, enemy);
    const special = enemy.boss && enemy.skillCooldown <= 0;
    if (special) {
      addEvent(game, 'enemySkill', `${enemy.name} ปลดปล่อยพลัง`, { source: enemy.id });
      const targets = enemy.trait === 'fury' || enemy.trait === 'curse' ? living(game.heroes) : [target];
      targets.forEach(hero => damageHero(game, enemy, hero, targets.length > 1 ? 0.72 : 1.65));
      enemy.skillCooldown = 5.3;
    } else {
      damageHero(game, enemy, target, 1);
    }
    enemy.cooldown += Math.max(0.55, 1.95 / enemy.speed);
  }
}

function generateLoot(game) {
  const tier = Math.min(3, Math.floor((game.floor - 1) / 6) + (nextRandom(game) < 0.16 ? 1 : 0));
  const template = EQUIPMENT_TEMPLATES[Math.floor(nextRandom(game) * EQUIPMENT_TEMPLATES.length)];
  const scale = 1 + tier * 0.72;
  const item = {
    uid: `${template.id}_${game.floor}_${game.rngState}`,
    id: template.id,
    name: `${template.name} · ${TIER_NAMES[tier]}`,
    slot: template.slot,
    stat: template.stat,
    value: Number((template.base * scale).toFixed(template.base < 1 ? 2 : 0)),
    tier,
    floor: game.floor
  };
  game.inventory.push(item);
  game.stats.loot += 1;
  autoEquip(game, item);
  addEvent(game, 'loot', `ได้รับ ${item.name}`, { item: clone(item) });
  return item;
}

function itemScore(item, hero) {
  if (!item) return 0;
  let score = item.tier * 10 + item.value;
  if (item.stat === 'hp' && hero.classId === 'guardian') score *= 1.5;
  if (item.stat === 'breakPower' && hero.classId === 'warrior') score *= 1.45;
  if (item.stat === 'speed' && ['rogue', 'ranger'].includes(hero.classId)) score *= 1.4;
  if (item.stat === 'skillPower' && ['mage', 'priest'].includes(hero.classId)) score *= 1.5;
  return score;
}

export function autoEquip(game, item) {
  const candidates = game.heroes
    .map(hero => ({ hero, gain: itemScore(item, hero) - itemScore(hero.equipment[item.slot], hero) }))
    .sort((a, b) => b.gain - a.gain);
  if (candidates[0]?.gain > 0) {
    candidates[0].hero.equipment[item.slot] = clone(item);
    applyDerivedStats(game, candidates[0].hero);
    return candidates[0].hero.id;
  }
  return null;
}

function finishBattle(game, victory) {
  if (victory) {
    game.stats.wins += 1;
    game.status = 'won_floor';
    game.heroes.forEach(hero => {
      hero.level += game.floor % 2 === 0 ? 1 : 0;
      if (game.floor % 5 === 0) hero.skillPoints += 1;
    });
    const loot = game.battle.encounter.boss || nextRandom(game) < 0.7 ? generateLoot(game) : null;
    addEvent(game, 'victory', loot ? `ชนะชั้น ${game.floor} — ${loot.name}` : `ชนะชั้น ${game.floor}`);
    if (game.battle.encounter.final) {
      game.status = 'victory';
      const id = game.battle.encounter.id;
      if (!game.stats.finalBossesDefeated.includes(id)) game.stats.finalBossesDefeated.push(id);
      evaluateUnlocks(game);
    } else if (game.floor % 5 === 0) {
      game.status = 'checkpoint';
      game.stats.checkpoints += 1;
      game.blessingChoices = rollBlessings(game);
      game.heroes.forEach(hero => {
        hero.hp = Math.max(hero.hp, Math.round(hero.maxHp * 0.66));
        hero.alive = true;
      });
    }
  } else {
    game.stats.defeats += 1;
    game.status = 'defeat';
    addEvent(game, 'defeat', `พ่ายแพ้ที่ชั้น ${game.floor}`);
  }
}

export function tick(game, dt = 0.1) {
  if (game.status !== 'combat' || !game.battle) return game.status;
  const step = Math.min(0.25, Math.max(0.001, dt));
  game.battle.elapsed += step;
  game.stats.time += step;
  living(game.heroes).forEach(hero => updateHero(game, hero, step));
  useBraveArt(game);
  living(game.battle.enemies).forEach(enemy => updateEnemy(game, enemy, step));
  if (!living(game.battle.enemies).length) finishBattle(game, true);
  else if (!living(game.heroes).length || game.battle.elapsed > 95) finishBattle(game, false);
  return game.status;
}

export function rollBlessings(game) {
  const pool = [...BLESSINGS];
  const choices = [];
  while (choices.length < 3 && pool.length) {
    const index = Math.floor(nextRandom(game) * pool.length);
    choices.push(clone(pool.splice(index, 1)[0]));
  }
  return choices;
}

export function chooseBlessing(game, blessingId) {
  if (game.status !== 'checkpoint') return false;
  const blessing = game.blessingChoices.find(item => item.id === blessingId);
  if (!blessing) return false;
  game.blessings.push(clone(blessing));
  game.blessingChoices = [];
  game.heroes.forEach(hero => applyDerivedStats(game, hero));
  game.log.push({ type: 'blessing', text: `เลือก ${blessing.name}`, floor: game.floor });
  return true;
}

export function spendSkillPoint(game, heroId, branch) {
  const hero = game.heroes.find(item => item.id === heroId);
  if (!hero || hero.skillPoints <= 0 || !['power', 'guard', 'tempo'].includes(branch)) return false;
  if (hero.skillRanks[branch] >= 3) return false;
  hero.skillPoints -= 1;
  hero.skillRanks[branch] += 1;
  applyDerivedStats(game, hero);
  return true;
}

export function setFormation(game, heroId, row) {
  const hero = game.heroes.find(item => item.id === heroId);
  if (!hero || !['front', 'back'].includes(row) || game.status === 'combat') return false;
  hero.row = row;
  return true;
}

export function retreat(game) {
  if (!['combat', 'checkpoint', 'won_floor'].includes(game.status)) return false;
  game.status = 'retreated';
  game.stats.retreats += 1;
  game.log.push({ type: 'retreat', text: `ถอนตัวจากชั้น ${game.floor}`, floor: game.floor });
  return true;
}

function evaluateUnlocks(game) {
  if (game.stats.breaks >= 12 && !game.unlocks.classes.includes('star_knight')) game.unlocks.classes.push('star_knight');
  if (game.heroes.every(hero => hero.hp > 0) && game.highestFloor >= 15 && !game.unlocks.classes.includes('spirit_weaver')) game.unlocks.classes.push('spirit_weaver');
  if (game.stats.finalBossesDefeated.length >= 3 && !game.unlocks.items.includes('nameless_crown')) game.unlocks.items.push('nameless_crown');
  if (String(game.seed).endsWith('7') && game.highestFloor >= 12 && !game.unlocks.encounters.includes('door_between')) game.unlocks.encounters.push('door_between');
}

export function serializeGame(game) {
  return JSON.stringify({ ...game, savedAt: new Date().toISOString() });
}

export function deserializeGame(serialized) {
  const game = typeof serialized === 'string' ? JSON.parse(serialized) : clone(serialized);
  if (game.version !== SAVE_VERSION) throw new Error('ไฟล์บันทึกคนละเวอร์ชัน');
  if (!validateParty(game.heroes.map(hero => hero.classId))) throw new Error('ข้อมูลปาร์ตี้ไม่ถูกต้อง');
  return game;
}

export function runToEnd(options = {}) {
  const game = createGame(options);
  const maxTicks = options.maxTicks || 60000;
  let ticks = 0;
  while (!['victory', 'defeat', 'retreated'].includes(game.status) && ticks < maxTicks) {
    if (['ready', 'won_floor'].includes(game.status)) beginNextFloor(game);
    else if (game.status === 'checkpoint') {
      const preferred = game.blessingChoices.find(b => b.stat === (options.preferredBlessing || 'attack')) || game.blessingChoices[0];
      chooseBlessing(game, preferred.id);
      game.heroes.forEach(hero => {
        if (hero.skillPoints) spendSkillPoint(game, hero.id, options.skillBranch || (hero.classId === 'guardian' ? 'guard' : 'power'));
      });
      beginNextFloor(game);
    } else tick(game, 0.2);
    ticks += 1;
  }
  return game;
}

export { CLASS_DEFS, SECRET_CONTENT, TACTICS };
