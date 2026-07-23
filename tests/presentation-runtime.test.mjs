import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beginNextFloor, createGame, deserializeGame, serializeGame, tick } from '../src/core.js';

function finishFirstFloor(speed) {
  const game = createGame({ seed: 20260723, classes: ['guardian', 'warrior', 'ranger', 'priest'] });
  beginNextFloor(game);
  let frames = 0;
  while (game.status === 'combat' && frames++ < 20000) {
    const substeps = speed * 2;
    for (let step = 0; step < substeps && game.status === 'combat'; step++) tick(game, .0125);
  }
  return {
    status: game.status,
    heroes: game.heroes.map(hero => [hero.classId, hero.hp, hero.alive]),
    enemies: game.battle.enemies.map(enemy => [enemy.hp, enemy.alive]),
    stats: game.stats,
    events: game.battle.events.map(event => [event.type, event.source, event.target, event.value])
  };
}

test('x1, x2 and x4 grouping preserve identical combat truth', () => {
  const x1 = finishFirstFloor(1);
  assert.deepEqual(finishFirstFloor(2), x1);
  assert.deepEqual(finishFirstFloor(4), x1);
});

test('save/load preserves selected visual class mapping', () => {
  const classes = ['warrior', 'rogue', 'mage', 'priest'];
  const game = createGame({ seed: 44, classes });
  beginNextFloor(game);
  const loaded = deserializeGame(serializeGame(game));
  assert.deepEqual(loaded.heroes.map(hero => hero.classId), classes);
});

test('full and minimized combat share one canvas and one animation loop', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.equal((html.match(/id="battle-canvas"/g) || []).length, 1);
  assert.equal((app.match(/requestAnimationFrame\(loop\)/g) || []).length, 2, 'one initial schedule and one reschedule');
  assert.match(css, /\.combat-panel\.minimized #battle-canvas/);
  assert.doesNotMatch(css, /\.combat-panel\.minimized[^}]*display:\s*none[^}]*#battle-canvas/);
});
