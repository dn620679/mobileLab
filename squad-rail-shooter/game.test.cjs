'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const [, script] = html.match(/<script>([\s\S]+)<\/script>/);
const engine = script.slice(0, script.indexOf('function createRenderer'));
const B = vm.runInNewContext(engine + '\nBreakline;');
const dt = 1 / 60;
function advance(run, seconds) {
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) run.step(dt);
}
function seeded(seed) { return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32); }

test('the complete page parses with inline code and no runtime asset dependencies', () => {
  assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotMatch(html.slice(0, html.indexOf('<script>')), /<(?:script|link|img)\b[^>]*(?:src|href)=/i);
  assert.match(script, /getContext\('webgl'/);
});

test('start with one active soldier and move left and right within the roadway', () => {
  const run = B.create(0);
  assert.equal(run.state.soldiers.filter(s => s.active).length, 1);
  run.move(-40); advance(run, .6);
  assert.ok(run.state.x < -4.9 && run.state.x >= -5);
  run.move(40); advance(run, .6);
  assert.ok(run.state.x > 4.9 && run.state.x <= 5);
  assert.equal(run.state.count, 1);
});

test('a real projectile lowers crate HP and opens it to add three active shooters', () => {
  const actions = [];
  const run = B.create(0, {}, { random: seeded(17), onEvent: event => actions.push(event) });
  let sawPartial = false;
  for (let i = 0; i < 300; i++) {
    run.step(dt);
    const box = run.state.boxes.find(b => b.active);
    if (box && box.hp < box.maxHp) sawPartial = true;
  }
  assert.equal(sawPartial, true);
  assert.equal(run.state.opened, 1);
  assert.equal(run.state.count, 4);
  const allies = run.state.soldiers.filter(s => s.active);
  assert.equal(allies.length, 4);
  assert.ok(new Set(allies.map(s => s.x.toFixed(2))).size >= 3);
  assert.ok(actions.includes('shot') && actions.includes('crate'));
});

test('crossing an intact crate does not grant its contents', () => {
  const run = B.create(0);
  // Keep fire paused to isolate contact behavior.
  const s = run.state.soldiers[0];
  s.cooldown = 30;
  advance(run, 6);
  assert.equal(run.state.boxes.filter(box => box.active).length, 0);
  assert.equal(run.state.opened, 0);
  assert.equal(run.state.count, 1);
});

test('a player can lose a soldier, reach zero, and retry with a new squad', () => {
  const events = [];
  const run = B.create(0, {}, { random: () => .45, onEvent: event => events.push(event) });
  run.move(3.7);
  advance(run, 30);
  assert.ok(events.includes('hurt'));
  assert.equal(run.state.count, 0);
  assert.equal(run.state.status, 'loss');
  assert.equal(B.create(0).state.count, 1);
});

test('all three stages support early growth, boss attacks, victory and progression', t => {
  const save = B.normalizeSave(null);
  for (let stage = 0; stage < B.STAGES.length; stage++) {
    const actions = [];
    const run = B.create(stage, {}, { random: seeded(17), onEvent: event => actions.push(event) });
    const s = run.state;
    let troopsAt20, peak = 1;
    for (let tick = 0; tick < 5400 && s.status === 'play'; tick++) {
      const boxValue = box => box.z - (box.kind === 'troops' ? 12 : 0);
      const box = s.boxes.filter(box => box.active).sort((a,b) => boxValue(a) - boxValue(b))[0];
      const enemy = s.enemies.filter(unit => unit.active).sort((a,b) => a.z - b.z)[0];
      run.move(s.warning ? (s.warning.x > 0 ? -4.3 : 4.3) : box?.x ?? s.boss?.x ?? enemy?.x ?? 0);
      run.step(dt);
      if (tick === 1199) troopsAt20 = s.count;
      peak = Math.max(peak, s.count);
    }
    assert.ok(troopsAt20 >= 5 && troopsAt20 <= 10);
    assert.ok(peak >= 20 && peak <= B.LIMITS.soldiers);
    assert.equal(s.status, 'win');
    assert.ok(s.time >= 60 && s.time <= 90);
    assert.ok(actions.includes('warn') && actions.includes('slam'));
    assert.ok(s.killed > 40 && s.opened > 4);
    assert.equal(s.boss.hp, 0);
    assert.ok(B.finishRun(save, s) >= s.stage.reward);
    assert.equal(B.finishRun(save, s), 0);
    assert.equal(save.unlocked, Math.min(stage + 1, 2));
    t.diagnostic(s.stage.name + ' · ' + s.time.toFixed(1) + '초 · 최대 ' + peak + '명 · 적 ' + s.killed + '기');
  }
  assert.equal(B.buy(save, 'troops'), true);
  save.sound = false;
  const loaded = B.normalizeSave(JSON.parse(JSON.stringify(save)));
  assert.equal(loaded.unlocked, 2);
  assert.equal(loaded.sound, false);
  assert.equal(B.create(2, loaded.upgrades).state.count, 2);
  assert.ok(loaded.best.every(record => record > 40));
});
