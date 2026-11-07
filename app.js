'use strict';

(() => {
  const { beasts, items, families, recipes, stations, upgrades, itemId } = SALVAGE_DATA;
  const game = SALVAGE_GAME;
  const byId = id => document.getElementById(id);
  const disabled = blocked => blocked ? ' disabled' : '';
  const fmt = value => value.toLocaleString('ko-KR');
  const qty = id => game.count(state.stock, id);
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const artPath = id => 'assets/' + id + '.webp';
  const lastMarkup = new WeakMap();
  const descriptions = {
    inventory: '보관함', process: '재료 가공', craft: '완제품 제작',
    sell: '판매대', quests: '납품 게시판', upgrades: '장비 강화',
  };

  let tab = 'inventory';
  let processFilter = 'all';
  let selection = '';
  let currentSprite = -1;
  let pendingSave = 0;
  let toastTimer = 0;
  let mergeTimer = 0;
  let saveFailed = false;
  let refresh = true;

  function readSave() {
    try {
      return JSON.parse(localStorage.getItem(game.saveKey) || 'null');
    } catch {
      return null;
    }
  }

  const model = game.create({ raw: readSave(), emit: onEvent, changed: onChange });
  const state = model.state;
  const isReduced = () => state.settings.reduced || motionPreference.matches;
  const effects = SALVAGE_EFFECTS.create(byId('workshop'), isReduced);
  const { icon } = SALVAGE_EFFECTS;

  function setText(id, value) {
    const element = byId(id);
    if (element.textContent !== String(value)) element.textContent = value;
  }

  function save() {
    clearTimeout(pendingSave);
    pendingSave = 0;
    try {
      localStorage.setItem(game.saveKey, model.serialize());
      setText('save-status', '자동 저장됨');
      saveFailed = false;
    } catch {
      setText('save-status', '이 브라우저에서는 자동 저장을 사용할 수 없어요');
      saveFailed = true;
    }
  }

  function onChange() {
    refresh = true;
    if (!pendingSave && !saveFailed) pendingSave = setTimeout(save, 350);
  }

  function toast(message) {
    const node = byId('toast');
    node.hidden = false;
    node.textContent = message;
    node.classList.remove('rise');
    void node.offsetWidth;
    node.classList.add('rise');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2200);
  }

  function sound(type, tier) {
    if (state.settings.sound) effects.sound(type, tier);
  }

  function onEvent(event) {
    if (event.type === 'hit') {
      const part = beasts[state.beast].parts[event.index];
      const layer = byId('layer-' + event.index);
      if (layer && !isReduced()) {
        layer.classList.remove('flash');
        void layer.offsetWidth;
        layer.classList.add('flash');
      }
      effects.drop(event.drops, part.x / 100);
      if (!event.automatic || event.broken) sound(event.broken ? 'broken' : 'hit');
      if (event.broken) toast(part.name + ' 분리 완료');
    } else if (event.type === 'merge') {
      effects.merge(event.id, event.output);
      const item = items[event.output];
      sound('merge', item.tier);
      setText('merge-message', '✧ ' + item.name);
      clearTimeout(mergeTimer);
      mergeTimer = setTimeout(() => setText('merge-message', ''), 1000);
    } else if (event.type === 'collect') {
      effects.collect(event.moved);
    } else if (event.type === 'clear') {
      toast('해체 완료 · 수고비 +' + fmt(event.gold) + ' G');
      sound('quest');
    } else if (event.type === 'jobDone') {
      effects.drop(event.drops, 0.73);
      sound('job');
      toast(items[event.id].name + ' 완성');
    } else if (event.type === 'sale') {
      toast(items[event.id].name + ' ' + event.qty + '개 판매 · +' + fmt(event.gold) + ' G');
      sound('sale');
    } else if (event.type === 'quest') {
      toast('계약 완료 · +' + fmt(event.gold) + ' G · 해체 표식 +1' + (event.points ? ' · 강화 포인트 +1' : ''));
      sound('quest');
    } else if (event.type === 'delivery') {
      toast('부분 납품을 접수했어요');
      sound('job');
    } else if (event.type === 'unlock') {
      toast(event.name + ' 입고 허가');
      sound('quest');
    } else if (event.type === 'upgrade') {
      toast(event.name + ' 강화 완료');
      sound('job');
    }
  }

  function makeScene(beast) {
    const style = byId('scene').style;
    style.setProperty('--specimen-color', beast.color);
    byId('sprite-frame').innerHTML = beast.parts.map((part, index) => {
      const clip = part.polygon.map(([x, y]) => x + '% ' + y + '%').join(', ');
      return '<img id="layer-' + index + '" class="sprite-layer" src="' + artPath(beast.id) + '" alt="" draggable="false" style="clip-path:polygon(' + clip + ')">' +
        '<button type="button" class="hotspot" data-part="' + index + '" title="' + part.name + '" aria-label="' + part.name +
        ' 해체" style="left:' + part.x + '%;top:' + part.y + '%">0' + (index + 1) + '</button>';
    }).join('');
    byId('parts-bar').innerHTML = beast.parts.map((part, index) =>
      '<button type="button" class="part-control" data-part="' + index + '"><b>' + part.name +
      '</b><span></span><progress max="' + part.hp + '" aria-label="' + part.name + ' 내구도"></progress></button>').join('');
    setText('specimen', 'SPECIMEN / ' + String(state.beast + 1).padStart(2, '0'));
    setText('beast-name', beast.name);
    setText('beast-zone', '출처 · ' + beast.zone);
    currentSprite = state.beast;
  }

  function renderFloor() {
    const beast = beasts[state.beast];
    if (currentSprite !== state.beast) makeScene(beast);
    const hp = state.hp.reduce((total, part) => total + part, 0);
    const percent = Math.floor((1 - hp / game.totalHp(beast)) * 100);
    setText('salvage-percent', percent + '%');
    byId('salvage-progress').value = percent;
    byId('done-overlay').hidden = hp !== 0;
    const bars = byId('parts-bar').children;
    const hotspots = byId('sprite-frame').querySelectorAll('button');
    beast.parts.forEach((part, index) => {
      const value = state.hp[index];
      const bar = bars[index];
      const layer = byId('layer-' + index);
      const active = String(state.focus === index && value > 0);
      const ratio = value / part.hp;
      layer.classList.toggle('gone', !value);
      layer.classList.toggle('hurt', ratio <= .65 && ratio > .30);
      layer.classList.toggle('critical', ratio <= .30);
      bar.disabled = !value;
      bar.setAttribute('aria-pressed', active);
      bar.children[1].textContent = value;
      bar.children[2].value = value;
      hotspots[index].disabled = !value;
      hotspots[index].setAttribute('aria-pressed', active);
    });
    byId('auto-cut').checked = state.settings.auto;
    setText('auto-details', (game.autoInterval(state) / 1000).toFixed(1) + '초마다 ' + game.autoPower(state));
    setText('hit-power', '수동 타격 ' + game.hitPower(state));
    setText('floor-count', '바닥 ' + fmt(game.looseCount(state)));
    setText('collect-rate', '수거 약 ' + game.collectRate(state) + '개/초');
    byId('sort-button').hidden = !state.upgrades.sort;
    byId('sort-button').disabled = !game.looseCount(state) || game.storageUsed(state) >= game.capacity(state);
  }

  function empty(title, detail, glyph = '◇') {
    return '<div class="empty"><span class="empty-glyph" aria-hidden="true">' + glyph +
      '</span><strong>' + title + '</strong><span>' + detail + '</span></div>';
  }

  function deskHeader(detail) {
    return '<div class="desk-head"><h3>' + descriptions[tab] + '</h3><small>' + detail + '</small></div>';
  }

  function detailCard(id, forSale) {
    const item = items[id];
    const held = Math.min(qty(id), game.reserved(state, id));
    return '<div class="item-inspect">' + icon(id) + '<div><b>' + item.name + '</b><small>' +
      (item.family ? item.tier + '등급 · ' + item.rarity : item.kind) + ' · 개당 ' + fmt(item.value) +
      ' G · 보유 ' + fmt(qty(id)) + (held ? ' · 예약 ' + held : '') + '</small></div>' +
      (forSale ? '' : '<button type="button" class="secondary" data-action="go-sell">판매대</button>') + '</div>';
  }

  function inventory(forSale) {
    const ids = Object.keys(items).filter(id => qty(id));
    const header = deskHeader(forSale ? '왕국 교역상' : ids.length + '종 보유');
    if (!ids.length) {
      selection = '';
      return header + empty(forSale ? '판매할 품목이 없어요' : '보관함이 비어 있어요',
        forSale ? '수거된 재료가 이곳에 표시됩니다.' : '괴수의 번호나 부위 버튼을 누르면 재료가 떨어져요.', '▣');
    }
    if (!ids.includes(selection)) selection = ids[0];
    const tiles = ids.map(id => '<button type="button" class="item-tile" data-key="' + id +
      '" data-action="select-item" data-id="' + id + '" aria-pressed="' + (id === selection) + '">' +
      icon(id) + '<span>' + items[id].name + '</span><span class="item-count">' + fmt(qty(id)) + '</span></button>').join('');
    const available = game.availableToSell(state, selection);
    const buttons = [[1, '1개'], [10, '10개'], ['max', '최대']].map(([amount, label]) => {
      const units = Math.min(available, amount === 'max' ? Infinity : amount);
      return '<button type="button" class="primary" data-action="sell" data-id="' + selection +
        '" data-amount="' + amount + '"' + disabled(!units) + '>' + label + ' 판매' +
        '<strong>' + fmt(units * items[selection].value) + ' G</strong></button>';
    }).join('');
    return header + '<div class="item-grid">' + tiles + '</div>' + detailCard(selection, forSale) +
      (forSale ? '<p class="sale-note muted">판매 가능 ' + fmt(available) + '개' +
        (state.settings.protect ? ' · 의뢰 예약분 보호 중' : '') + '</p><div class="sell-buttons">' + buttons + '</div>' : '');
  }

  function stationSprite(id) {
    const index = stations[id].sprite;
    return '<span class="station-sprite" aria-hidden="true" style="background-position:' +
      ((index % 2) * 100) + '% ' + (Math.floor(index / 2) * 100) + '%"></span>';
  }

  function jobList(now) {
    if (!state.jobs.length) return '';
    return '<div class="job-list" aria-label="진행 중인 작업">' + state.jobs.map((job, index) => {
      const left = Math.max(0, job.end - now);
      const length = Math.max(1, job.end - job.start);
      return '<div class="job" data-key="job-' + job.id + '-' + index + '">' + stationSprite(recipes[job.id].station) +
        '<span>' + items[job.id].name + '</span><span>' + (left / 1000).toFixed(1) + '초</span>' +
        '<progress max="' + length + '" value="' + Math.min(length, Math.max(0, length - left)) +
        '" aria-label="' + items[job.id].name + ' 작업 진행률"></progress></div>';
    }).join('') + '</div>';
  }

  function sourceProblem(id) {
    const item = items[id];
    if (item.family) {
      const source = families[item.family].source;
      return source > state.unlocked ? beasts[source].name + ' 해금 필요' : '';
    }
    const recipe = recipes[id];
    if (state.stations[recipe.station] < recipe.level) return stations[recipe.station].name + ' Lv.' + recipe.level + ' 필요';
    for (const [input] of recipe.inputs) {
      const missing = sourceProblem(input);
      if (missing) return missing;
    }
    return '';
  }

  function workshop(forCraft, now) {
    const heading = deskHeader('가동 슬롯 ' + state.jobs.length + ' / ' + game.slots(state));
    const kind = forCraft ? '제작' : '가공';
    const selector = forCraft ? '' : '<div class="station-strip">' + Object.entries(stations).map(([id, station]) =>
      '<button type="button" data-action="station-filter" data-id="' + id + '" aria-pressed="' + (id === processFilter) +
      '">' + stationSprite(id) + station.name + '<small>Lv.' + state.stations[id] + '</small></button>').join('') + '</div>';
    const options = Object.values(recipes).filter(recipe => recipe.kind === kind &&
      (forCraft || processFilter === 'all' || recipe.station === processFilter));
    const list = options.map(recipe => {
      const item = items[recipe.id];
      const problem = sourceProblem(recipe.id);
      const detail = problem || stations[recipe.station].name + ' Lv.' + recipe.level + ' · ' +
        (game.jobTime(state, recipe.id) / 1000).toFixed(1) + '초';
      const inputs = recipe.inputs.map(([id, need]) => '<span class="chip' + (qty(id) >= need ? ' ready' : '') + '">' +
        icon(id) + items[id].name + ' ' + qty(id) + '/' + need + '</span>').join('');
      return '<article class="card' + (problem ? ' locked' : '') + '" data-key="' + recipe.id + '"><div class="card-top"><div class="card-title">' +
        icon(recipe.id) + '<div><h4>' + item.name + '</h4><small>' + detail + '</small></div></div>' +
        '<button type="button" class="card-action primary" data-action="start-job" data-id="' + recipe.id + '"' +
        disabled(!game.canStart(state, recipe.id)) + '>' + kind + ' 시작</button></div><div class="recipe-inputs">' + inputs + '</div></article>';
    }).join('');
    return heading + selector + jobList(now) + (list ? '<div class="cards">' + list + '</div>' :
      empty('이 설비의 작업은 제작 탭에 있어요', '설비 버튼을 다시 누르면 가공 목록 전체가 표시돼요.'));
  }

  function deliveries() {
    const header = deskHeader('완료 ' + state.fulfilled + '건');
    return header + '<div class="cards">' + state.quests.map(active => {
      const quest = game.questById[active.id];
      let canDeliver = false;
      const lines = quest.needs.map(([id, need]) => {
        const sent = game.count(active.delivered, id);
        const ready = sent < need && qty(id) > 0;
        canDeliver ||= ready;
        return '<div class="quest-line">' + icon(id) + '<span>' + items[id].name + ' <small>보유 ' + qty(id) +
          '</small></span><span class="ratio">' + sent + ' / ' + need +
          '</span><button type="button" data-action="deliver-one" data-id="' + quest.id + '" data-item="' + id + '"' +
          disabled(!ready) + '>1개 납품</button></div>';
      }).join('');
      return '<article class="card quest-card" data-key="' + quest.id + '"><div class="card-top"><div><small>' + quest.client +
        '</small><h4>' + quest.name + '</h4></div><b class="quest-reward">' + fmt(game.reward(quest)) + ' G</b></div>' +
        '<div class="quest-lines">' + lines + '</div><div class="quest-foot"><small>해체 표식 +1' +
        (quest.points ? ' · 강화 포인트 +1' : '') + '</small><button type="button" class="card-action primary" data-action="deliver-all" data-id="' +
        quest.id + '"' + disabled(!canDeliver) + '>가능한 만큼 납품</button></div></article>';
    }).join('') + '</div>';
  }

  function improvements() {
    const cards = Object.entries(upgrades).map(([id, upgrade]) => {
      const level = state.upgrades[id];
      const maxed = level >= upgrade.max;
      const cost = game.upgradeCost(id, level);
      const point = state.points > 0 && !maxed ? '<button type="button" class="card-action" data-action="buy-point" data-id="' + id +
        '" title="강화 포인트 1 사용">✦ 1</button>' : '';
      return '<article class="card" data-key="' + id + '"><div class="card-top"><div class="card-title"><div><h4>' + upgrade.name +
        ' · Lv.' + level + '</h4><small>' + upgrade.detail + '</small></div></div><div class="upgrade-action">' +
        '<button type="button" class="card-action primary" data-action="buy" data-id="' + id + '"' +
        disabled(maxed || state.gold < cost) + '>' + (maxed ? '완료' : fmt(cost) + ' G') + '</button>' + point + '</div></div></article>';
    }).join('');
    const machines = Object.entries(stations).map(([id, station]) => {
      const level = state.stations[id];
      const cost = game.stationCost(id, level);
      return '<article class="card" data-key="' + id + '"><div class="card-top"><div class="card-title">' + stationSprite(id) +
        '<div><h4>' + station.name + ' · Lv.' + level + '</h4><small>고급 레시피 사용 허가</small></div></div>' +
        '<button type="button" class="card-action primary" data-action="station-upgrade" data-id="' + id + '"' +
        disabled(level === 3 || state.gold < cost) + '>' + (level === 3 ? '완료' : fmt(cost) + ' G') + '</button></div></article>';
    }).join('');
    return deskHeader('강화 포인트 ✦ ' + state.points) + '<div class="cards">' + cards + '</div>' +
      '<div class="desk-head station-upgrade-head"><h3>가공 설비</h3></div><div class="cards">' + machines + '</div>';
  }

  function syncMarkup(parent, html) {
    if (lastMarkup.get(parent) === html) return;
    const template = document.createElement('template');
    template.innerHTML = html;
    // Keep buttons alive while autosalvage updates counts underneath a pointer.
    function reconcile(current, next) {
      const wanted = [...next.childNodes];
      let cursor = current.firstChild;
      for (const node of wanted) {
        const key = node.nodeType === 1 ? node.getAttribute('data-key') : null;
        if (key && cursor?.getAttribute?.('data-key') !== key) {
          const match = [...current.children].find(child => child.getAttribute('data-key') === key);
          if (match) current.insertBefore(match, cursor);
          else {
            current.insertBefore(node.cloneNode(true), cursor);
            continue;
          }
          cursor = match;
        }
        if (!cursor || cursor.nodeType !== node.nodeType || cursor.nodeName !== node.nodeName) {
          const newNode = node.cloneNode(true);
          current.insertBefore(newNode, cursor);
          if (cursor) cursor.remove();
          cursor = newNode.nextSibling;
          continue;
        }
        if (node.nodeType === 3) {
          if (cursor.nodeValue !== node.nodeValue) cursor.nodeValue = node.nodeValue;
        } else if (node.nodeType === 1) {
          for (const attribute of [...cursor.attributes]) {
            if (!node.hasAttribute(attribute.name)) cursor.removeAttribute(attribute.name);
          }
          for (const attribute of node.attributes) {
            if (cursor.getAttribute(attribute.name) !== attribute.value) cursor.setAttribute(attribute.name, attribute.value);
          }
          reconcile(cursor, node);
        }
        cursor = cursor.nextSibling;
      }
      while (cursor) {
        const nextSibling = cursor.nextSibling;
        cursor.remove();
        cursor = nextSibling;
      }
    }
    reconcile(parent, template.content);
    lastMarkup.set(parent, html);
  }

  function renderDesk(now) {
    const size = game.storageUsed(state);
    const max = game.capacity(state);
    setText('stock-space', fmt(size) + ' / ' + fmt(max));
    const meter = byId('stock-progress');
    meter.max = max;
    meter.value = size;
    const ready = state.quests.filter(active => game.questById[active.id].needs.some(([id, need]) =>
      game.count(active.delivered, id) < need && qty(id))).length;
    byId('quest-badge').hidden = !ready;
    setText('quest-badge', '●' + ready);
    for (const button of byId('tabs').querySelectorAll('[data-tab]')) button.setAttribute('aria-current', String(tab === button.dataset.tab));
    const views = {
      inventory: () => inventory(false), sell: () => inventory(true), process: () => workshop(false, now),
      craft: () => workshop(true, now), quests: deliveries, upgrades: improvements,
    };
    syncMarkup(byId('desk-content'), views[tab]());
  }

  function renderRegistry() {
    const vacant = !state.hp.some(Boolean);
    const list = beasts.map((beast, index) => {
      const status = game.gateStatus(state, index);
      const { gate, clears } = status;
      const unlocked = state.unlocked >= index;
      const metric = (value, need, label) => '<span class="' + (value >= need ? 'met' : '') + '">' +
        label + ' ' + fmt(value) + '/' + fmt(need) + '</span>';
      let summary = '<small>처리 ' + state.clears[index] + '회' + (!vacant && state.beast === index ? ' · 작업 중' : '') + '</small>';
      if (!unlocked) summary = '<small>' + [
        metric(state.gold, gate.gold, '골드'), metric(clears, gate.clears, '이전 괴수'), metric(state.seals, gate.seals, '표식'),
      ].join(' · ') + '</small>';
      return '<article class="card registry-card" data-key="' + beast.id + '"><img src="' + artPath(beast.id) + '" alt=""><div><h3>' + beast.name +
        '</h3><p>' + beast.zone + '</p>' + summary + '</div><button type="button" class="secondary" data-action="' +
        (unlocked ? 'intake' : 'unlock') + '" data-id="' + index + '"' + disabled(unlocked ? !vacant : !status.ready) +
        '>' + (unlocked ? '입고' : '해금') + '</button></article>';
    }).join('');
    syncMarkup(byId('registry-list'), '<p class="muted">' + (vacant ? '입고할 사체를 선택하세요.' : '현재 사체를 모두 해체하면 새 사체를 입고할 수 있어요.') + '</p>' + list);
  }

  function renderRules() {
    byId('rule-list').innerHTML = Object.values(families).filter(family => family.source <= state.unlocked).map(family => {
      const rule = state.rules[family.id];
      return '<div class="rule-row"><label><input type="checkbox" data-family="' + family.id + '" data-rule="enabled"' +
        (rule.enabled ? ' checked' : '') + '>' + icon(itemId(family.id)) + family.name + '</label>' +
        '<label>상한<select data-family="' + family.id + '" data-rule="cap" aria-label="' + family.name + ' 머지 상한">' +
        family.tiers.map((_, index) => '<option value="' + (index + 1) + '"' + (rule.cap === index + 1 ? ' selected' : '') +
          '>' + (index + 1) + '</option>').join('') + '</select></label><label>보존<input type="number" inputmode="numeric" min="0" max="999" value="' +
        rule.reserve + '" data-family="' + family.id + '" data-rule="reserve" aria-label="' + family.name + ' 1등급 보존 수량"></label></div>';
    }).join('');
  }

  function render(now = Date.now()) {
    setText('gold', fmt(state.gold));
    setText('seals', state.seals);
    document.body.classList.toggle('reduce-motion', isReduced());
    renderFloor();
    renderDesk(now);
    if (byId('registry-dialog').open) renderRegistry();
    refresh = false;
  }

  function chooseTab(id) {
    if (!Object.hasOwn(descriptions, id)) return;
    if (tab !== id) {
      byId('desk-content').replaceChildren();
      lastMarkup.delete(byId('desk-content'));
      byId('desk-content').scrollTop = 0;
    }
    tab = id;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (state.settings.sound) effects.arm();
    const { action, id, amount, item, part, tab: nextTab } = button.dataset;
    if (part !== undefined) model.strike(Number(part));
    else if (nextTab) chooseTab(nextTab);
    else if (Object.hasOwn(button.dataset, 'close')) button.closest('dialog').close();
    else if (button.id === 'intake-button') model.intake();
    else if (button.id === 'sort-button') model.sort();
    else if (button.id === 'registry-button') {
      renderRegistry();
      byId('registry-dialog').showModal();
    } else if (button.id === 'rules-button') {
      renderRules();
      byId('rules-dialog').showModal();
    } else if (button.id === 'settings-button') {
      byId('sound-toggle').checked = state.settings.sound;
      byId('motion-toggle').checked = state.settings.reduced;
      byId('protect-toggle').checked = state.settings.protect;
      byId('settings-dialog').showModal();
    } else if (button.id === 'reset-button') {
      if (!window.confirm('모든 해체 기록과 저장 데이터를 지우고 새 게임을 시작할까요?')) return;
      clearTimeout(pendingSave);
      try { localStorage.removeItem(game.saveKey); } catch { /* Storage is optional. */ }
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.location.reload();
      return;
    } else if (action === 'select-item') selection = id;
    else if (action === 'go-sell') chooseTab('sell');
    else if (action === 'station-filter') processFilter = processFilter === id ? 'all' : id;
    else if (action === 'sell') model.sell(id, amount === 'max' ? Infinity : Number(amount));
    else if (action === 'start-job') model.start(id);
    else if (action === 'deliver-one') model.deliver(id, item, 1);
    else if (action === 'deliver-all') model.deliver(id);
    else if (action === 'buy' || action === 'buy-point') model.buy(id, action === 'buy-point');
    else if (action === 'station-upgrade') model.improveStation(id);
    else if (action === 'unlock') model.unlock(Number(id));
    else if (action === 'intake' && model.intake(Number(id))) byId('registry-dialog').close();
    render();
  });

  document.addEventListener('change', event => {
    const input = event.target;
    const options = { 'auto-cut': 'auto', 'sound-toggle': 'sound', 'motion-toggle': 'reduced', 'protect-toggle': 'protect' };
    if (options[input.id]) {
      model.setOption(options[input.id], input.checked);
      if (input.id === 'sound-toggle' && input.checked) effects.arm();
    } else if (input.dataset.family) {
      const { family, rule } = input.dataset;
      model.setRule(family, rule, rule === 'enabled' ? input.checked : input.valueAsNumber ?? Number(input.value));
      if (rule === 'reserve') input.value = state.rules[family].reserve;
    }
    render();
  });

  function saveWhenHidden() {
    if (document.visibilityState === 'hidden') save();
  }
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', saveWhenHidden);
  motionPreference.addEventListener?.('change', () => render());

  model.tick();
  render();
  save();
  setInterval(() => {
    const now = Date.now();
    model.tick(now);
    if (refresh || (state.jobs.length && (tab === 'process' || tab === 'craft'))) render(now);
  }, 160);
})();
