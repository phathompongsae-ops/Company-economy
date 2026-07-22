import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_DEFS, SECRET_CONTENT, beginNextFloor, chooseBlessing, createGame,
  deserializeGame, retreat, runToEnd, serializeGame, spendSkillPoint, tick, validateParty
} from '../src/core.js';
import { FINAL_BOSSES } from '../src/data.js';
import { readFileSync } from 'node:fs';

test('party requires exactly four unique base classes', () => {
  assert.equal(Object.keys(CLASS_DEFS).length, 6);
  assert.equal(validateParty(['guardian', 'warrior', 'ranger', 'priest']), true);
  assert.equal(validateParty(['guardian', 'guardian', 'ranger', 'priest']), false);
  assert.throws(() => createGame({ classes: ['guardian', 'warrior'] }), /4 อาชีพ/);
});

test('a seeded run is deterministic and reaches no farther than floor 20', () => {
  const options = { seed: 4242, classes: ['guardian', 'warrior', 'ranger', 'priest'] };
  const a = runToEnd(options);
  const b = runToEnd(options);
  assert.equal(a.status, b.status);
  assert.equal(a.highestFloor, b.highestFloor);
  assert.equal(a.battle.encounter.id, b.battle.encounter.id);
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.highestFloor, 20);
});

test('twenty-floor dungeon provides checkpoints and controlled boss pool', () => {
  const seen = new Set();
  for (let seed = 10; seed < 30; seed++) {
    const game = runToEnd({ seed, classes: ['guardian', 'warrior', 'ranger', 'priest'] });
    assert.equal(game.highestFloor, 20);
    assert.equal(game.stats.checkpoints, 3);
    assert.equal(game.stats.battles, 20);
    seen.add(game.battle.encounter.id);
  }
  assert.ok(seen.size >= 2, 'multiple final bosses should appear across seeds');
  assert.ok([...seen].every(id => FINAL_BOSSES.some(boss => boss.id === id)));
});

test('break and Brave Arts both occur without break-lock loops', () => {
  const game = runToEnd({ seed: 99, classes: ['guardian', 'warrior', 'rogue', 'ranger'], tactic: 'break' });
  assert.ok(game.stats.breaks > 0);
  assert.ok(game.stats.braveArts > 0);
  assert.ok(game.stats.breaks < 80, 'break count should remain bounded');
  assert.ok(game.stats.braveArts < 45, 'Brave Arts should not fire continuously');
});

test('equipment, blessing and skill-point progression affect a run', () => {
  const game = createGame({ seed: 7 });
  for (let floor = 1; floor <= 5; floor++) {
    beginNextFloor(game);
    while (game.status === 'combat') tick(game, .2);
  }
  assert.equal(game.status, 'checkpoint');
  assert.ok(game.inventory.length >= 2 && game.inventory.length <= 5);
  assert.equal(game.blessingChoices.length, 3);
  const oldAttack = game.heroes[1].attack;
  const attackBlessing = game.blessingChoices.find(b => b.stat === 'attack') || game.blessingChoices[0];
  assert.equal(chooseBlessing(game, attackBlessing.id), true);
  assert.equal(game.blessings.length, 1);
  assert.ok(game.heroes.every(hero => hero.skillPoints === 1));
  assert.equal(spendSkillPoint(game, game.heroes[1].id, 'power'), true);
  assert.equal(game.heroes[1].skillRanks.power, 1);
  if (attackBlessing.stat === 'attack') assert.ok(game.heroes[1].attack > oldAttack);
});

test('save/load preserves an active deterministic battle', () => {
  const game = createGame({ seed: 888, classes: ['guardian', 'mage', 'ranger', 'priest'] });
  beginNextFloor(game);
  for (let i = 0; i < 20; i++) tick(game, .1);
  const loaded = deserializeGame(serializeGame(game));
  for (let i = 0; i < 1000 && game.status === 'combat'; i++) {
    tick(game, .1);
    tick(loaded, .1);
  }
  assert.equal(loaded.status, game.status);
  assert.deepEqual(loaded.heroes.map(h => h.hp), game.heroes.map(h => h.hp));
  assert.deepEqual(loaded.battle.enemies.map(e => e.hp), game.battle.enemies.map(e => e.hp));
});

test('victory, defeat and retreat are represented as distinct outcomes', () => {
  const victory = runToEnd({ seed: 4, classes: ['guardian', 'warrior', 'ranger', 'priest'] });
  assert.equal(victory.status, 'victory');
  const retreating = createGame({ seed: 5 });
  beginNextFloor(retreating);
  assert.equal(retreat(retreating), true);
  assert.equal(retreating.status, 'retreated');
  assert.equal(retreating.stats.retreats, 1);
  const defeated = createGame({ seed: 6 });
  beginNextFloor(defeated);
  defeated.heroes.forEach(hero => { hero.hp = 0; hero.alive = false; });
  tick(defeated, .1);
  assert.equal(defeated.status, 'defeat');
});

test('secret class, item and encounter architecture is data-driven and unlockable', () => {
  assert.ok(SECRET_CONTENT.classes.length >= 2);
  assert.ok(SECRET_CONTENT.items.length >= 1);
  assert.ok(SECRET_CONTENT.encounters.length >= 1);
  const game = runToEnd({ seed: 117, classes: ['guardian', 'warrior', 'rogue', 'ranger'], tactic: 'break' });
  assert.ok(game.unlocks.classes.includes('star_knight'));
  assert.ok(game.unlocks.encounters.includes('door_between'));
});

test('Tactical Auto and Full Auto both remain viable across representative parties', () => {
  const parties = [
    ['guardian', 'warrior', 'ranger', 'priest'],
    ['guardian', 'warrior', 'rogue', 'ranger'],
    ['guardian', 'mage', 'ranger', 'priest'],
    ['warrior', 'rogue', 'ranger', 'mage']
  ];
  for (const tacticalAuto of [true, false]) {
    const results = parties.map((classes, i) => runToEnd({ seed: 300 + i, classes, tacticalAuto }));
    assert.ok(results.filter(game => game.status === 'victory').length >= 3);
  }
});

test('browser shell is Thai-first, dependency-free and exposes required controls', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(html, /<html lang="th">/);
  for (const id of ['battle-canvas', 'tactic-select', 'tactical-button', 'autorun-toggle', 'view-button', 'checkpoint-modal', 'result-modal']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} should occur once`);
  }
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(app, /localStorage/);
  assert.match(app, /drawBattle/);
});
