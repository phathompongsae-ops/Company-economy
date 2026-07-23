import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_DEFS } from '../src/data.js';
import {
  HERO_ANIMATION_STATES, HERO_FORMATION_ANCHORS, HERO_SPRITE_STANDARD, HERO_VISUALS,
  PROJECTILE_HERO_CLASSES, animationPose, drawHero
} from '../src/hero-visuals.js';

test('six base classes map one-to-one to original hero visuals', () => {
  assert.deepEqual(Object.keys(HERO_VISUALS).sort(), Object.keys(CLASS_DEFS).sort());
  assert.equal(new Set(Object.values(HERO_VISUALS).map(hero => hero.weapon)).size, 6);
  for (const [id, hero] of Object.entries(HERO_VISUALS)) {
    assert.equal(hero.id, id);
    assert.equal(hero.color, CLASS_DEFS[id].color);
    assert.ok(hero.identity.length >= 12);
  }
});

test('shared sprite contract has stable anchors and mobile-readable dimensions', () => {
  assert.deepEqual(HERO_SPRITE_STANDARD.anchor, { x: 32, y: 70 });
  assert.equal(HERO_SPRITE_STANDARD.feetBaseline, 70);
  assert.equal(HERO_SPRITE_STANDARD.facing, 'right');
  assert.ok(HERO_SPRITE_STANDARD.mobileMinimumCssHeight >= 58);
  assert.ok(HERO_SPRITE_STANDARD.weaponBounds.right > 20);
});

test('formation anchors and ranged origins are explicit presentation data', () => {
  assert.equal(HERO_FORMATION_ANCHORS.front.length, 4);
  assert.equal(HERO_FORMATION_ANCHORS.back.length, 4);
  assert.ok(HERO_FORMATION_ANCHORS.front.every(([x]) => x > 300));
  assert.ok(HERO_FORMATION_ANCHORS.back.every(([x]) => x < 300));
  for (const row of Object.values(HERO_FORMATION_ANCHORS)) {
    const keys = row.map(([x, y]) => `${x}:${y}`);
    assert.equal(new Set(keys).size, 4);
  }
  assert.deepEqual(PROJECTILE_HERO_CLASSES, ['ranger', 'mage', 'priest']);
});

test('all required and forward-compatible animation states are valid', () => {
  for (const state of ['idle', 'attack', 'hurt', 'ko', 'skill', 'brave', 'victory']) {
    assert.ok(HERO_ANIMATION_STATES.includes(state));
  }
  for (const id of Object.keys(HERO_VISUALS)) {
    for (const state of HERO_ANIMATION_STATES) {
      const pose = animationPose(id, state, 0.5, 1.25);
      assert.ok(Object.values(pose).every(Number.isFinite), `${id}/${state} must produce a finite pose`);
    }
  }
});

test('renderer is safe for missing definitions and draws known heroes without DOM state', () => {
  const calls = [];
  const context = new Proxy({
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, closePath() {}, fill() {},
    moveTo() {}, lineTo() {}, fillRect(...args) { calls.push(args); }, globalAlpha: 1, fillStyle: ''
  }, { set(target, key, value) { target[key] = value; return true; } });
  assert.equal(drawHero(context, { classId: 'guardian' }), true);
  assert.ok(calls.length > 20, 'a hero should contain many deliberate pixel clusters');
  assert.equal(drawHero(context, { classId: 'missing' }), false);
});

test('Thai class names remain attached to all visual mappings', () => {
  assert.deepEqual(Object.values(CLASS_DEFS).map(hero => hero.name), [
    'ผู้พิทักษ์', 'นักรบ', 'เรนเจอร์', 'จอมโจร', 'จอมเวท', 'นักบวช'
  ]);
});
