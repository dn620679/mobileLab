'use strict';

const SALVAGE_GAME = (() => {
  const data = typeof SALVAGE_DATA === 'undefined' ? require('./data.js') : SALVAGE_DATA;
  const { beasts, items, families, recipes, quests, upgrades, stations, itemId } = data;
  const saveVersion = 1;
  const saveKey = 'mobileLab.salvage';
  const safeLimit = 1_000_000_000;
  const sum = values => values.reduce((total, value) => total + value, 0);
  const count = (record, id) => record[id] || 0;
  const number = (value, fallback = 0, max = safeLimit) =>
    Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;
  const questById = Object.fromEntries(quests.map(quest => [quest.id, quest]));
  const capacity = state => 140 + 100 * state.upgrades.capacity;
  const slots = state => 1 + state.upgrades.slots;
  const hitPower = state => 4 + 2 * state.upgrades.power;
  const autoInterval = state => Math.max(480, Math.round(2300 * 0.87 ** state.upgrades.auto));
  const autoPower = state => 1 + state.upgrades.auto;
  const mergeInterval = state => Math.max(110, Math.round(640 * 0.82 ** state.upgrades.merge));
  const collectRate = state => 6 + 4 * state.upgrades.collect;
  const jobTime = (state, id) => Math.max(900, Math.round(recipes[id].time * 0.87 ** state.upgrades.process));
  const upgradeCost = (id, level) => Math.round(upgrades[id].base * 1.56 ** level);
  const stationCost = (id, level) => Math.round(stations[id].baseCost * 2.25 ** (level - 1));
  const reward = quest => quest.bonus + sum(quest.needs.map(([id, qty]) => Math.ceil(items[id].value * qty * 1.7)));
  const storageUsed = state => sum(Object.values(state.stock));
  const looseCount = state => sum(Object.values(state.loose));
  const totalHp = beast => sum(beast.parts.map(part => part.hp));

  function initialState(now = Date.now()) {
    return {
      version: saveVersion, savedAt: now, gold: 0, stock: {}, loose: {}, unlocked: 0, beast: 0,
      hp: beasts[0].parts.map(part => part.hp), clears: beasts.map(() => 0), focus: 0,
      upgrades: Object.fromEntries(Object.keys(upgrades).map(id => [id, 0])),
      stations: Object.fromEntries(Object.keys(stations).map(id => [id, 1])),
      rules: Object.fromEntries(Object.values(families).map(family => [family.id, {
        enabled: true, cap: family.tiers.length,
        reserve: family.id === 'slime' || family.id === 'membrane' ? 6 : 4,
      }])),
      jobs: [], quests: [], questCursor: 0, seals: 0, points: 0, fulfilled: 0,
      settings: { auto: true, sound: true, reduced: false, protect: true },
    };
  }

  function canSource(state, id, ancestors = new Set()) {
    const item = items[id];
    if (!item || ancestors.has(id)) return false;
    if (item.family) return families[item.family].source <= state.unlocked;
    const recipe = recipes[id];
    if (!recipe || state.stations[recipe.station] < recipe.level) return false;
    const path = new Set(ancestors).add(id);
    return recipe.inputs.every(([material]) => canSource(state, material, path));
  }

  function fillQuests(state) {
    const eligible = quests.filter(quest => quest.needs.every(([id]) => canSource(state, id)));
    while (state.quests.length < 3 && state.quests.length < eligible.length) {
      for (let offset = 0; offset < quests.length; offset += 1) {
        const index = (state.questCursor + offset) % quests.length;
        const quest = quests[index];
        if (!eligible.includes(quest) || state.quests.some(active => active.id === quest.id)) continue;
        state.quests.push({ id: quest.id, delivered: {} });
        state.questCursor = (index + 1) % quests.length;
        break;
      }
    }
  }

  function restore(raw, now = Date.now()) {
    const state = initialState(now);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== saveVersion) {
      fillQuests(state);
      return state;
    }
    for (const key of ['gold', 'seals', 'points', 'fulfilled']) state[key] = number(raw[key]);
    state.questCursor = number(raw.questCursor, 0, quests.length - 1);
    state.unlocked = number(raw.unlocked, 0, beasts.length - 1);
    state.beast = number(raw.beast, 0, state.unlocked);
    state.hp = beasts[state.beast].parts.map((part, index) => number(raw.hp?.[index], part.hp, part.hp));
    state.focus = number(raw.focus, 0, state.hp.length - 1);
    state.clears = beasts.map((_, index) => number(raw.clears?.[index]));
    for (const key of ['stock', 'loose']) {
      for (const id of Object.keys(items)) {
        const qty = number(raw[key]?.[id]);
        if (qty) state[key][id] = qty;
      }
    }
    for (const [id, upgrade] of Object.entries(upgrades)) state.upgrades[id] = number(raw.upgrades?.[id], 0, upgrade.max);
    for (const id of Object.keys(stations)) state.stations[id] = Math.max(1, number(raw.stations?.[id], 1, 3));
    for (const [id, rule] of Object.entries(state.rules)) {
      const saved = raw.rules?.[id];
      rule.enabled = typeof saved?.enabled === 'boolean' ? saved.enabled : rule.enabled;
      rule.cap = Math.max(1, number(saved?.cap, rule.cap, families[id].tiers.length));
      rule.reserve = number(saved?.reserve, rule.reserve, 999);
    }
    for (const key of Object.keys(state.settings)) {
      if (typeof raw.settings?.[key] === 'boolean') state.settings[key] = raw.settings[key];
    }
    if (Array.isArray(raw.jobs)) {
      for (const job of raw.jobs.slice(0, slots(state))) {
        if (!Object.hasOwn(recipes, job?.id) || !Number.isFinite(job.end)) continue;
        const duration = jobTime(state, job.id);
        const end = Math.min(now + duration, Math.max(0, job.end));
        const start = Number.isFinite(job.start) && job.start < end ? Math.max(end - recipes[job.id].time, job.start) : end - duration;
        state.jobs.push({ id: job.id, start, end });
      }
    }
    if (Array.isArray(raw.quests)) {
      for (const active of raw.quests) {
        const quest = Object.hasOwn(questById, active?.id) ? questById[active.id] : null;
        if (!quest || state.quests.some(entry => entry.id === quest.id) || state.quests.length >= 3) continue;
        if (!quest.needs.every(([id]) => canSource(state, id))) continue;
        const delivered = Object.fromEntries(quest.needs.map(([id, qty]) => [id, number(active.delivered?.[id], 0, qty)]));
        state.quests.push({ id: quest.id, delivered });
      }
    }
    state.savedAt = number(raw.savedAt, now, now);
    fillQuests(state);
    return state;
  }

  function reserved(state, id) {
    if (!state.settings.protect) return 0;
    return sum(state.quests.map(active => {
      const need = questById[active.id].needs.find(([item]) => item === id);
      return need ? Math.max(0, need[1] - count(active.delivered, id)) : 0;
    }));
  }

  function availableToSell(state, id) {
    return Math.max(0, count(state.stock, id) - reserved(state, id));
  }

  function canStart(state, id) {
    const recipe = Object.hasOwn(recipes, id) ? recipes[id] : null;
    return !!recipe && canSource(state, id) && state.jobs.length < slots(state)
      && recipe.inputs.every(([material, qty]) => count(state.stock, material) >= qty);
  }

  function gateStatus(state, index) {
    const beast = beasts[index];
    if (!beast) return null;
    const gate = beast.gate;
    const clears = index > 0 ? state.clears[index - 1] : 0;
    return { gate, clears, ready: index === state.unlocked + 1 && state.gold >= gate.gold && clears >= gate.clears && state.seals >= gate.seals };
  }

  function create({ raw, now = Date.now(), random = Math.random, emit = () => {}, changed = () => {} } = {}) {
    const state = restore(raw, now);
    let nextAuto = now + autoInterval(state);
    let nextMerge = now + 440;
    let nextCollect = now + 330;
    let mergeCursor = 0;
    let collectCursor = 0;

    function add(record, id, qty) {
      const updated = count(record, id) + qty;
      if (updated > 0) record[id] = updated;
      else delete record[id];
    }

    function deposit(drops, event) {
      for (const [id, qty] of Object.entries(drops)) add(state.loose, id, qty);
      if (event) emit({ ...event, drops });
    }

    function strike(index, automatic = false) {
      const beast = beasts[state.beast];
      const part = beast.parts[index];
      if (!part || !state.hp[index]) return false;
      const damage = automatic ? autoPower(state) : hitPower(state);
      state.hp[index] = Math.max(0, state.hp[index] - damage);
      state.focus = index;
      const broken = state.hp[index] === 0;
      const drops = {};
      const amount = automatic ? Math.max(1, Math.floor((beast.volume + state.upgrades.drops) / 2)) : beast.volume + state.upgrades.drops;
      const rarity = state.upgrades.rare * 0.025;
      for (const [family, chance] of part.drops) {
        if (chance < 1 && random() >= chance + rarity) continue;
        const qty = chance === 1 ? amount + Math.floor(random() * 2) : 1 + Math.floor(amount / 4);
        add(drops, itemId(family), qty);
      }
      if (random() < 0.55 + rarity) add(drops, itemId('mana'), 1 + Math.floor(amount / 3));
      if (random() < 0.045 + rarity / 3) add(drops, itemId('mana', 2), 1);
      if (broken) {
        add(drops, itemId(part.drops[0][0]), 10 + beast.volume + state.upgrades.drops);
        add(drops, itemId(part.drops[1][0]), 3 + Math.floor(beast.volume / 2));
        add(drops, itemId(part.drops[2][0]), 1);
        add(drops, itemId('mana'), 4 + beast.volume);
      }
      deposit(drops, { type: 'hit', index, automatic, broken, damage });
      if (!state.hp.some(Boolean)) {
        state.clears[state.beast] += 1;
        state.gold += beast.bounty;
        emit({ type: 'clear', gold: beast.bounty });
      }
      changed();
      return true;
    }

    function intake(index = state.beast) {
      if (index < 0 || index > state.unlocked || !beasts[index] || state.hp.some(Boolean)) return false;
      state.beast = index;
      state.hp = beasts[index].parts.map(part => part.hp);
      state.focus = 0;
      emit({ type: 'intake' });
      changed();
      return true;
    }

    function unlock(index) {
      if (!gateStatus(state, index)?.ready) return false;
      state.gold -= beasts[index].gate.gold;
      state.unlocked = index;
      fillQuests(state);
      emit({ type: 'unlock', name: beasts[index].name });
      changed();
      return true;
    }

    function merge(id) {
      const item = items[id];
      const rule = state.rules[item?.family];
      if (!rule?.enabled || item.tier >= rule.cap) return false;
      const hold = Math.max(item.tier === 1 ? rule.reserve : 0, reserved(state, id));
      const loose = count(state.loose, id);
      if (count(state.stock, id) + loose < hold + 3) return false;
      const fromFloor = Math.min(loose, 3);
      add(state.loose, id, -fromFloor);
      add(state.stock, id, fromFloor - 3);
      const output = itemId(item.family, item.tier + 1);
      add(state.loose, output, 1);
      emit({ type: 'merge', id, output, loose: fromFloor });
      return true;
    }

    function autoMerge() {
      const candidates = Object.keys(state.loose).concat(Object.keys(state.stock).filter(id => !count(state.loose, id)));
      if (!candidates.length) return false;
      for (let offset = 0; offset < candidates.length; offset += 1) {
        const index = (mergeCursor + offset) % candidates.length;
        if (!merge(candidates[index])) continue;
        mergeCursor = index + 1;
        return true;
      }
      return false;
    }

    function collect(limit) {
      let room = Math.min(limit, capacity(state) - storageUsed(state));
      const ids = Object.keys(state.loose);
      if (room <= 0 || !ids.length) return false;
      const moved = {};
      for (let offset = 0; offset < ids.length && room > 0; offset += 1) {
        const index = (collectCursor + offset) % ids.length;
        const id = ids[index];
        const quota = limit === Infinity ? room : Math.ceil(room / (ids.length - offset));
        const qty = Math.min(count(state.loose, id), quota);
        add(state.loose, id, -qty);
        add(state.stock, id, qty);
        moved[id] = qty;
        room -= qty;
      }
      collectCursor = (collectCursor + 1) % ids.length;
      emit({ type: 'collect', moved });
      return true;
    }

    function sort() {
      if (!state.upgrades.sort || !collect(Infinity)) return false;
      changed();
      return true;
    }

    function start(id, time = Date.now()) {
      if (!canStart(state, id)) return false;
      for (const [material, qty] of recipes[id].inputs) add(state.stock, material, -qty);
      state.jobs.push({ id, start: time, end: time + jobTime(state, id) });
      emit({ type: 'jobStart', id });
      changed();
      return true;
    }

    function finish(time) {
      const done = state.jobs.filter(job => job.end <= time);
      if (!done.length) return false;
      state.jobs = state.jobs.filter(job => job.end > time);
      for (const job of done) deposit({ [job.id]: recipes[job.id].output }, { type: 'jobDone', id: job.id });
      return true;
    }

    function sell(id, requested) {
      if (!Object.hasOwn(items, id) || (requested !== Infinity && !Number.isSafeInteger(requested))) return false;
      const qty = Math.min(requested, availableToSell(state, id));
      if (qty <= 0) return false;
      const gold = qty * items[id].value;
      add(state.stock, id, -qty);
      state.gold += gold;
      emit({ type: 'sale', id, qty, gold });
      changed();
      return true;
    }

    function deliver(questId, item = null, requested = Infinity) {
      const active = state.quests.find(entry => entry.id === questId);
      if (!active || (requested !== Infinity && (!Number.isSafeInteger(requested) || requested < 1))) return false;
      const quest = questById[questId];
      let delivered = false;
      for (const [id, need] of quest.needs) {
        if (item !== null && id !== item) continue;
        const qty = Math.min(need - count(active.delivered, id), count(state.stock, id), requested);
        if (qty <= 0) continue;
        add(state.stock, id, -qty);
        add(active.delivered, id, qty);
        delivered = true;
      }
      if (quest.needs.every(([id, need]) => count(active.delivered, id) === need)) {
        state.quests = state.quests.filter(entry => entry !== active);
        const gold = reward(quest);
        state.gold += gold;
        state.seals += quest.seals;
        state.points += quest.points;
        state.fulfilled += 1;
        fillQuests(state);
        emit({ type: 'quest', id: questId, gold, points: quest.points });
        delivered = true;
      } else if (delivered) {
        emit({ type: 'delivery' });
      }
      if (delivered) changed();
      return delivered;
    }

    function buy(id, usePoint = false) {
      if (!Object.hasOwn(upgrades, id)) return false;
      const level = state.upgrades[id];
      const cost = upgradeCost(id, level);
      if (level >= upgrades[id].max || (usePoint ? !state.points : state.gold < cost)) return false;
      if (usePoint) state.points -= 1;
      else state.gold -= cost;
      state.upgrades[id] += 1;
      emit({ type: 'upgrade', name: upgrades[id].name });
      changed();
      return true;
    }

    function improveStation(id) {
      if (!Object.hasOwn(stations, id)) return false;
      const level = state.stations[id];
      const cost = stationCost(id, level);
      if (level >= 3 || state.gold < cost) return false;
      state.gold -= cost;
      state.stations[id] += 1;
      fillQuests(state);
      emit({ type: 'upgrade', name: stations[id].name });
      changed();
      return true;
    }

    function setRule(id, key, value) {
      if (!Object.hasOwn(state.rules, id)) return false;
      const rule = state.rules[id];
      if (key === 'enabled') rule.enabled = !!value;
      else if (key === 'cap') rule.cap = Math.max(1, number(value, rule.cap, families[id].tiers.length));
      else if (key === 'reserve') rule.reserve = number(value, rule.reserve, 999);
      else return false;
      changed();
      return true;
    }

    function setOption(key, value) {
      if (!Object.hasOwn(state.settings, key)) return false;
      state.settings[key] = !!value;
      changed();
      return true;
    }

    function tick(time = Date.now()) {
      let dirty = finish(time);
      if (time >= nextAuto) {
        nextAuto = time + autoInterval(state);
        const target = state.hp[state.focus] ? state.focus : state.hp.findIndex(Boolean);
        if (state.settings.auto && target >= 0) strike(target, true);
      }
      if (time >= nextMerge) {
        nextMerge = time + mergeInterval(state);
        // Several families can be active at once. Limit the work per tick.
        for (let batch = 0; batch < 3 && autoMerge(); batch += 1) dirty = true;
      }
      if (time >= nextCollect) {
        nextCollect = time + 500;
        dirty = collect(Math.ceil(collectRate(state) / 2)) || dirty;
      }
      if (dirty) changed();
    }

    function serialize(time = Date.now()) {
      state.savedAt = time;
      return JSON.stringify(state);
    }

    return { state, strike, intake, unlock, tick, sort, start, sell, deliver, buy, improveStation, setRule, setOption, serialize };
  }

  return { create, saveKey, saveVersion, capacity, slots, hitPower, autoInterval, autoPower, mergeInterval, collectRate,
    jobTime, upgradeCost, stationCost, storageUsed, looseCount, totalHp, canSource, canStart, reserved, availableToSell,
    gateStatus, reward, questById, count };
})();

if (typeof module === 'object' && module.exports) module.exports = SALVAGE_GAME;
