'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const data = require('../data.js');
const game = require('../game.js');
const now = 100_000;
const { beasts, items, recipes, stations } = data;
const total = (model, id) => game.count(model.state.stock, id) + game.count(model.state.loose, id);
const fresh = (emit, random = () => 0) => game.create({ now, emit, random });

test('all 20 body parts take damage and have independent shared mana drops', () => {
  for (let index = 0; index < beasts.length; index += 1) {
    for (let body = 0; body < beasts[index].parts.length; body += 1) {
      const part = beasts[index].parts[body];
      const model = game.create({ raw: { version: 1, unlocked: index, beast: index }, now, random: () => 0.2 });
      assert.equal(model.strike(body), true);
      assert.equal(model.state.hp[body], part.hp - game.hitPower(model.state));
      assert.ok(total(model, 'mana:1') > 0);
      assert.ok(total(model, data.itemId(part.drops[0][0])) > 0);
      const dry = game.create({ raw: { version: 1, unlocked: index, beast: index }, now, random: () => 0.99 });
      assert.equal(dry.strike(body), true);
      assert.equal(total(dry, 'mana:1'), 0);
      while (dry.state.hp[body]) dry.strike(body);
      assert.ok(total(dry, 'mana:1') > 0, 'separation grants common mana even after unlucky rolls');
      assert.equal(dry.strike(body), false);
    }
  }
});

test('a carcass pays its bounty once and allows a fresh intake', () => {
  const events = [];
  const model = fresh(event => events.push(event));
  assert.equal(model.intake(), false);
  for (const index of model.state.hp.keys()) while (model.state.hp[index]) model.strike(index);
  assert.equal(model.state.clears[0], 1);
  assert.equal(model.state.gold, beasts[0].bounty);
  assert.equal(events.filter(event => event.type === 'clear').length, 1);
  assert.equal(model.intake(1), false);
  assert.equal(model.intake(), true);
  assert.deepEqual(model.state.hp, beasts[0].parts.map(part => part.hp));
});

test('3-to-1 merge operates across loose material and storage without loss', () => {
  const model = game.create({ raw: {
    version: 1, stock: { 'mana:1': 4 }, loose: { 'mana:1': 3 },
    rules: { mana: { enabled: true, cap: 2, reserve: 4 } }, settings: { auto: false, protect: false },
  }, now });
  model.tick(now + 800);
  assert.equal(total(model, 'mana:1'), 4);
  assert.equal(total(model, 'mana:2'), 1);
  assert.equal(total(model, 'mana:3'), 0);
  model.tick(now + 1900);
  assert.equal(total(model, 'mana:1'), 4);
  assert.equal(total(model, 'mana:2'), 1);
});

test('merge cap, disable switch and quest reservations preserve the correct tiers', () => {
  const model = game.create({ raw: {
    version: 1, stock: { 'slime:1': 12, 'mana:1': 20, 'mana:2': 3 },
    rules: { slime: { enabled: false, cap: 4, reserve: 0 }, mana: { enabled: true, cap: 2, reserve: 8 } },
    settings: { auto: false, protect: true },
  }, now });
  for (let time = now; time < now + 4000; time += 180) model.tick(time);
  assert.equal(total(model, 'slime:1'), 12);
  assert.equal(total(model, 'mana:1'), 8);
  assert.equal(total(model, 'mana:2'), 7);
  assert.equal(total(model, 'mana:3'), 0);
  assert.equal(model.setRule('mana', 'cap', 6), true);
  assert.equal(model.setRule('slime', 'enabled', true), true);
  for (let time = now + 4000; time < now + 8000; time += 180) model.tick(time);
  assert.equal(total(model, 'slime:1'), 6, 'active slime sample stays reserved');
  assert.equal(total(model, 'mana:2'), 4, 'required three shards plus remainder stay reserved');
  assert.equal(total(model, 'mana:3'), 1);
});

test('processing survives serialization, produces an item once, then enables cross-family crafting and sale', () => {
  const model = game.create({ raw: {
    version: 1, stock: { 'slime:1': 6, 'mana:1': 6 }, settings: { auto: false },
  }, now });
  assert.equal(model.start('slimeGel', now), true);
  assert.equal(total(model, 'slime:1'), 2);
  assert.equal(model.start('slimeGel', now), false);
  const restored = game.create({ raw: JSON.parse(model.serialize(now + 100)), now: now + 5000 });
  restored.tick(now + 5000);
  assert.equal(restored.state.jobs.length, 0);
  assert.equal(total(restored, 'slimeGel'), 1);
  restored.tick(now + 5600);
  assert.equal(restored.start('adhesive', now + 5600), true);
  restored.tick(now + 10_000);
  assert.equal(total(restored, 'adhesive'), 1);
  assert.equal(total(restored, 'slimeGel'), 0);
  assert.equal(restored.sell('adhesive', 1), false, 'an active request protects finished stock');
  restored.setOption('protect', false);
  assert.equal(restored.sell('adhesive', 1), true);
  assert.equal(restored.state.gold, items.adhesive.value);
  assert.equal(total(restored, 'adhesive'), 0);
});

test('all 25 recipes have an acyclic, obtainable input graph and produce the specified output', () => {
  assert.equal(Object.keys(recipes).length, 25);
  assert.equal(Object.values(recipes).filter(recipe => recipe.kind === '제작').length, 15);
  for (const recipe of Object.values(recipes)) {
    const maxStations = Object.fromEntries(Object.keys(stations).map(id => [id, 3]));
    const stock = Object.fromEntries(recipe.inputs);
    const model = game.create({ raw: {
      version: 1, stock, unlocked: 4, stations: maxStations, settings: { auto: false },
    }, now });
    assert.ok(game.canSource(model.state, recipe.id), recipe.id);
    assert.equal(model.start(recipe.id, now), true);
    for (const [id] of recipe.inputs) assert.equal(total(model, id), 0);
    model.tick(now + recipe.time);
    assert.equal(total(model, recipe.id), recipe.output);
    assert.equal(model.state.jobs.length, 0);
  }
  const initial = fresh();
  assert.equal(game.canSource(initial.state, 'venomExtract'), false);
  assert.equal(game.canSource(initial.state, 'adhesive'), true);
});

test('three feasible contracts stay active and partial delivery persists without rewarding twice', () => {
  const events = [];
  const model = game.create({ raw: { version: 1, stock: { 'slime:1': 6, 'mana:2': 3, adhesive: 1 } }, now,
    emit: event => events.push(event) });
  const before = model.state.quests.map(quest => quest.id);
  assert.equal(before.length, 3);
  assert.equal(model.deliver('slimeSample', 'slime:1', 1), true);
  assert.equal(model.state.quests[0].delivered['slime:1'], 1);
  assert.equal(model.state.gold, 0);
  const restored = game.create({ raw: JSON.parse(model.serialize(now)), now });
  assert.equal(restored.state.quests[0].delivered['slime:1'], 1);
  assert.equal(restored.deliver('slimeSample'), true);
  assert.equal(restored.deliver('slimeSample'), false);
  assert.equal(restored.state.gold, game.reward(game.questById.slimeSample));
  assert.equal(restored.state.seals, 1);
  assert.equal(restored.state.quests.length, 3);
  assert.ok(restored.state.quests.some(quest => !before.includes(quest.id)));
  assert.ok(restored.state.quests.every(active => game.questById[active.id].needs.every(([id]) => game.canSource(restored.state, id))));
  assert.equal(events[0].type, 'delivery');
});

test('multi-item contracts pay gold and a special reward after the last line is delivered', () => {
  const model = game.create({ raw: {
    version: 1, stock: { sealKit: 1, adhesive: 1 }, quests: [{ id: 'campRepair' }],
  }, now });
  assert.equal(model.deliver('campRepair', 'sealKit'), true);
  assert.equal(model.state.fulfilled, 0);
  assert.equal(model.deliver('campRepair', 'adhesive'), true);
  assert.equal(model.state.fulfilled, 1);
  assert.equal(model.state.points, 1);
  assert.equal(model.state.quests.length, 3);
});

test('upgrades spend gold or points, and sequential unlocks survive a reload', () => {
  const model = game.create({ raw: { version: 1, gold: 1800, clears: [10, 0, 0, 0, 0], seals: 7, points: 1 }, now });
  assert.equal(model.buy('power'), true);
  assert.equal(game.hitPower(model.state), 6);
  assert.equal(model.buy('capacity', true), true);
  assert.equal(game.capacity(model.state), 240);
  assert.equal(model.state.points, 0);
  assert.equal(model.improveStation('furnace'), true);
  assert.equal(model.state.stations.furnace, 2);
  assert.equal(model.unlock(2), false);
  assert.equal(model.unlock(1), true);
  assert.equal(model.unlock(1), false);
  const restored = game.create({ raw: JSON.parse(model.serialize(now)), now });
  assert.equal(restored.state.unlocked, 1);
  assert.equal(restored.state.stations.furnace, 2);
  assert.equal(restored.state.upgrades.power, 1);
  assert.equal(restored.state.upgrades.capacity, 1);
});

test('auto-cut targets a living part and stops while toggled off', () => {
  const model = fresh();
  model.tick(now + game.autoInterval(model.state));
  assert.equal(model.state.hp[0], beasts[0].parts[0].hp - 1);
  model.setOption('auto', false);
  model.tick(now + 15_000);
  assert.equal(model.state.hp[0], beasts[0].parts[0].hp - 1);
});

test('a saturated warehouse preserves overflow through reload and batch collection', () => {
  const model = game.create({ raw: {
    version: 1, stock: { 'slime:1': 140 }, loose: { 'membrane:1': 47 }, upgrades: { sort: 1 },
    rules: { slime: { enabled: false }, membrane: { enabled: false } }, settings: { auto: false, protect: false },
  }, now });
  model.tick(now + 1000);
  assert.equal(model.sort(), false);
  assert.equal(total(model, 'membrane:1'), 47);
  const restored = game.create({ raw: JSON.parse(model.serialize(now)), now });
  assert.equal(restored.sell('slime:1', 10), true);
  assert.equal(restored.sell('slime:1', 1), true);
  assert.equal(restored.sort(), true);
  assert.equal(game.storageUsed(restored.state), 140);
  assert.equal(total(restored, 'membrane:1'), 47);
  assert.equal(restored.sell('slime:1', Infinity), true);
  assert.equal(restored.sort(), true);
  assert.equal(game.looseCount(restored.state), 0);
});

test('large output bursts, merges, and collection conserve base-tier material units', () => {
  const initial = { version: 1, unlocked: 4, beast: 4, upgrades: { drops: 8, merge: 10, collect: 10 },
    settings: { auto: false, protect: false }, rules: {} };
  const emitted = {};
  const model = game.create({ raw: initial, now, random: () => 0, emit: event => {
    if (event.type !== 'hit') return;
    for (const [id, amount] of Object.entries(event.drops)) {
      const { family, tier } = items[id];
      emitted[family] = (emitted[family] || 0) + amount * 3 ** (tier - 1);
    }
  } });
  let time = now;
  for (let round = 0; round < 4; round += 1) {
    for (const part of model.state.hp.keys()) {
      while (model.state.hp[part]) {
        model.strike(part);
        model.tick(time += 60);
      }
    }
    model.intake(4);
  }
  for (let index = 0; index < 500; index += 1) model.tick(time += 160);
  assert.ok(Object.values(emitted).reduce((a, b) => a + b) > 10_000);
  for (const family of Object.values(data.families)) {
    const actual = family.tiers.reduce((sum, _, index) => sum +
      total(model, data.itemId(family.id, index + 1)) * 3 ** index, 0);
    assert.equal(actual, emitted[family.id] || 0, family.id);
  }
  assert.ok(game.storageUsed(model.state) <= game.capacity(model.state));
});

test('invalid saves are sanitized, and all referenced offline entry resources exist', () => {
  const invalid = game.create({ raw: { version: 1, unlocked: 900, beast: 0, stock: { 'mana:1': -50, garbage: 5 },
    gold: -10, hp: [500, -9], rules: { mana: { cap: 60, reserve: -3 } }, jobs: [{ id: '__proto__', end: 4 }],
    quests: [{ id: 'nonsense' }] }, now });
  assert.equal(invalid.state.gold, 0);
  assert.deepEqual(invalid.state.stock, {});
  assert.equal(invalid.state.hp[0], beasts[0].parts[0].hp);
  assert.equal(invalid.state.hp[1], 0);
  assert.equal(invalid.state.rules.mana.cap, 6);
  assert.equal(invalid.state.jobs.length, 0);
  assert.equal(invalid.state.quests.length, 3);
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:)?\/\//);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, match[1])));
  for (const beast of beasts) assert.ok(fs.existsSync(path.join(root, 'assets', beast.id + '.webp')));
  for (const file of ['hangar.jpg', 'icons.png', 'stations.png']) assert.ok(fs.existsSync(path.join(root, 'assets', file)));
});

test('a fresh yard can finance and earn the first permit through ordinary play', t => {
  let seed = 31;
  let time = now;
  let firstMerge;
  let firstJob;
  let firstContract;
  let readyForIntake = 0;
  let nextClick = now;
  let nextTrade = now;
  let nextDelivery = now;
  const model = game.create({ now, random: () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32),
    emit: event => {
      if (event.type === 'merge') firstMerge ??= time;
      if (event.type === 'jobDone') firstJob ??= time;
      if (event.type === 'quest') firstContract ??= time;
      if (event.type === 'clear') readyForIntake = time + 3000;
    } });
  const { state } = model;
  function make(id) {
    const recipe = recipes[id];
    if (!recipe || state.jobs.some(job => job.id === id)) return false;
    if (model.start(id, time)) return true;
    return recipe.inputs.some(([input, need]) => game.count(state.stock, input) < need && make(input));
  }

  for (; time - now <= 600_000; time += 160) {
    model.tick(time);
    if (time >= nextClick) {
      nextClick = time + 1250;
      if (readyForIntake && time >= readyForIntake && !state.hp.some(Boolean)) {
        model.intake();
        readyForIntake = 0;
      }
      model.strike(state.hp.findIndex(Boolean));
    }
    if (time >= nextTrade) {
      nextTrade = time + 22_000;
      for (const [id, qty] of Object.entries(state.stock)) {
        const item = items[id];
        if (!item.family || item.tier === 1) continue;
        const amount = qty - Math.max(game.reserved(state, id), id === 'mana:2' ? 2 : 0);
        if (amount > 0) model.sell(id, amount);
      }
      if (!state.upgrades.power) model.buy('power');
      if (!state.upgrades.collect && game.looseCount(state) > 70) model.buy('collect');
    }
    if (time >= nextDelivery) {
      nextDelivery = time + 5000;
      for (const active of [...state.quests]) {
        model.deliver(active.id);
        for (const [id, need] of game.questById[active.id].needs) {
          if (game.count(active.delivered, id) < need) make(id);
        }
      }
    }
    if (model.unlock(1)) break;
  }
  const elapsed = (time - now) / 1000;
  assert.ok(firstMerge - now < 30_000);
  assert.ok(firstJob - now < 180_000);
  assert.ok(firstContract - now < 180_000);
  assert.equal(state.unlocked, 1);
  assert.ok(elapsed >= 300 && elapsed <= 600, 'normal simulated play should unlock the spider in 5–10 minutes');
  t.diagnostic('Merge ' + ((firstMerge - now) / 1000) + 's, processing ' + ((firstJob - now) / 1000) +
    's, delivery ' + ((firstContract - now) / 1000) + 's, spider ' + elapsed + 's.');
});
