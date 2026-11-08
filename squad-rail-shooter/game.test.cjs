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
  run.move(B.SUPPLY_X);
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
  run.move(B.SUPPLY_X);
  const s = run.state.soldiers[0];
  s.cooldown = 30;
  advance(run, 4);
  assert.equal(run.state.boxes.filter(box => box.active).length, 0);
  assert.equal(run.state.opened, 0);
  assert.equal(run.state.count, 1);
});

test('a player can lose a soldier, reach zero, and retry with a new squad', () => {
  const events = [];
  const run = B.create(0, {}, { random: () => .45, onEvent: event => events.push(event) });
  for (let i = 0; i < 1800 && run.state.status === 'play'; i++) {
    const nearest = run.state.enemies.filter(enemy => enemy.active).sort((a,b) => a.z - b.z)[0];
    run.move(nearest?.x ?? -2.3);
    run.step(dt);
  }
  assert.ok(events.includes('hurt'));
  assert.equal(run.state.count, 0);
  assert.equal(run.state.status, 'loss');
  assert.equal(B.create(0).state.count, 1);
});

test('the enemy feed stays continuous and the supply lane has its own targets', () => {
  const run = B.create(0, {}, { random: seeded(17) });
  run.move(B.SUPPLY_X);
  let previousSize = 0;
  let peak = 0;
  const arrivals = new Set();
  for (let second = 1; second <= 12; second++) {
    for (let i = 0; i < 60; i++) {
      run.step(dt);
      const enemies = run.state.enemies.filter(enemy => enemy.active);
      peak = Math.max(peak, enemies.length);
      for (const enemy of enemies) {
        assert.ok(enemy.x < B.DIVIDER);
        arrivals.add(enemy.id);
      }
      for (const box of run.state.boxes.filter(box => box.active)) assert.equal(box.x, B.SUPPLY_X);
    }
    assert.ok(arrivals.size > previousSize, 'new enemies in second ' + second);
    previousSize = arrivals.size;
  }
  assert.ok(peak >= 20);
  assert.ok(run.state.opened >= 2);
  assert.equal(run.state.killed, 0, 'supply fire does not also clear the battle side');
  advance(run, 8);
  assert.equal(run.state.defense, 0);
  assert.equal(run.state.status, 'loss');
  assert.ok(run.state.count > 0, 'a defense-line defeat is separate from squad defeat');
});

test('multiple separated enemy contacts can cost soldiers in one run', () => {
  const events = [];
  const run = B.create(0, { troops: 3 }, { random: seeded(17), onEvent: event => events.push(event) });
  const { state } = run;
  for (const s of state.soldiers) s.cooldown = 30;
  function collide(id) {
    const soldier = state.soldiers.find(s => s.active);
    const enemy = state.enemies.find(e => !e.active);
    Object.assign(enemy, { active: true, id, type: 'grunt', x: soldier.x, home: soldier.x,
      z: soldier.z + .4, hp: 3, maxHp: 3, radius: .43, speed: 6, hit: 1, phase: 0, flash: 0, knock: 0 });
    run.step(dt);
  }
  collide(1000);
  assert.equal(state.count, 3);
  advance(run, .65);
  collide(1001);
  assert.equal(state.count, 2);
  assert.equal(events.filter(event => event === 'hurt').length, 2);
});

test('switching lanes can clear all three stages while commanders and ordinary troops overlap', t => {
  const save = B.normalizeSave(null);
  for (let stage = 0; stage < B.STAGES.length; stage++) {
    const actions = [];
    const run = B.create(stage, {}, { random: seeded(17), onEvent: event => actions.push(event) });
    const s = run.state;
    let troopsAt20, peak = 1, overlap = false, frontFrames = 0, supplyFrames = 0;
    for (let tick = 0; tick < 5500 && s.status === 'play'; tick++) {
      const box = s.boxes.find(box => box.active);
      const enemy = s.enemies.filter(unit => unit.active).sort((a,b) => a.z - b.z)[0];
      const boss = s.bosses.find(boss => boss.active);
      let aim = box?.x ?? enemy?.x ?? boss?.x ?? -2;
      if (s.warning && Math.abs(aim - s.warning.x) < s.warning.width / 2 + .65) {
        aim = s.warning.x > 1 ? -2.6 : B.SUPPLY_X;
      }
      run.move(aim);
      run.step(dt);
      if (tick === 1199) troopsAt20 = s.count;
      peak = Math.max(peak, s.count);
      if (s.x > B.DIVIDER) supplyFrames++;
      else frontFrames++;
      overlap ||= Boolean(boss && enemy);
    }
    assert.ok(troopsAt20 >= 5 && troopsAt20 <= 14);
    assert.ok(peak >= 20 && peak <= B.LIMITS.soldiers);
    assert.equal(s.status, 'win');
    assert.ok(s.time >= 60 && s.time <= 90);
    assert.ok(frontFrames > 1200 && supplyFrames > 300);
    assert.equal(overlap, true);
    assert.ok(actions.includes('warn') && actions.includes('slam'));
    assert.equal(actions.filter(action => action === 'bossDown').length, s.stage.bosses.length);
    assert.ok(s.killed > 350 && s.opened > 4);
    assert.ok(s.bosses.every(boss => boss.hp === 0));
    assert.ok(B.finishRun(save, s) >= s.stage.reward);
    assert.equal(B.finishRun(save, s), 0);
    assert.equal(save.unlocked, Math.min(stage + 1, 2));
    t.diagnostic(s.stage.name + ' · ' + s.time.toFixed(1) + '초 · 지휘관 ' + s.bosses.length + '기 · 적 ' + s.killed + '기');
  }
  assert.equal(B.buy(save, 'troops'), true);
  save.sound = false;
  const loaded = B.normalizeSave(JSON.parse(JSON.stringify(save)));
  assert.equal(loaded.unlocked, 2);
  assert.equal(loaded.sound, false);
  assert.equal(B.create(2, loaded.upgrades).state.count, 2);
  assert.ok(loaded.best.every(record => record > 350));
});
