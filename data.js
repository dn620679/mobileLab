'use strict';

const SALVAGE_DATA = (() => {
  const families = {};
  const items = {};
  const rarityNames = ['일반', '정제', '희귀', '특급', '전설', '순수'];
  const tierValues = [1, 3.45, 12, 41.5, 144, 500];
  const familyRows = [
    ['slime', '점액', 0, 3, '#a6db68', 'drop', 0],
    ['membrane', '탄성막', 0, 5, '#d5e590', 'hide'],
    ['slimeCore', '슬라임 핵', 0, 9, '#b8f358', 'core'],
    ['silk', '거미줄', 1, 5, '#c0bfd8', 'coil', 2],
    ['chitin', '외골격', 1, 7, '#9b91c4', 'plate', 8],
    ['venom', '독샘', 1, 12, '#bf8be6', 'drop'],
    ['fang', '송곳니', 1, 9, '#e1caad', 'fang', 10],
    ['shell', '갑각', 2, 8, '#ee9162', 'plate'],
    ['claw', '집게', 2, 11, '#cb6d48', 'fang'],
    ['pearl', '진주', 2, 17, '#f7d3ac', 'core', 15],
    ['fiber', '근육섬유', 2, 7, '#d48d78', 'coil', 9],
    ['scale', '비늘', 3, 11, '#df765f', 'plate', 11],
    ['bone', '용골', 3, 13, '#e0c5a8', 'fang'],
    ['horn', '뿔', 3, 17, '#c89275', 'fang', 12],
    ['wing', '피막', 3, 12, '#d58b79', 'hide'],
    ['heart', '심장', 3, 23, '#ff8c6e', 'core'],
    ['blubber', '지방', 4, 12, '#9bbeb0', 'drop'],
    ['baleen', '수염', 4, 14, '#a3bfdf', 'coil', 13],
    ['organ', '마력기관', 4, 29, '#7bf0e4', 'core', 14],
    ['tissue', '심해 조직', 4, 17, '#61bed3', 'hide'],
    ['mana', '마정석', 0, 3, '#91e7f6', 'crystal', null,
      ['마력 결정 가루', '마정석 결정 조각', '마정석', '응축 마정석', '마력 핵', '순수 마력 결정체']],
  ];

  function itemId(family, tier = 1) {
    return family + ':' + tier;
  }

  for (const [id, name, source, price, color, shape, sprite, names] of familyRows) {
    const tiers = names || [name, '정제 ' + name, '상급 ' + name, '완전한 ' + name];
    families[id] = { id, name, source, color, tiers };
    tiers.forEach((label, index) => {
      const tier = index + 1;
      const key = itemId(id, tier);
      items[key] = {
        id: key, name: label, family: id, tier, value: Math.ceil(price * tierValues[index]),
        color, shape, sprite: tier === 1 ? sprite : null, rarity: rarityNames[index],
      };
    });
  }

  const stations = {
    grinder: { name: '분쇄기', glyph: '▥', sprite: 0, baseCost: 150 },
    furnace: { name: '용광로', glyph: '♨', sprite: 1, baseCost: 170 },
    extractor: { name: '추출기', glyph: '◈', sprite: 2, baseCost: 145 },
    bench: { name: '직조·조립대', glyph: '✣', sprite: 3, baseCost: 160 },
  };

  const recipes = {};
  const recipeRows = [
    ['slimeGel', '점액 농축액', 'extractor', 1, 3200, '가공', 25, '#a6db68', 'flask', 0, [['slime:1', 4]]],
    ['manaFlux', '마력 정제제', 'furnace', 1, 4500, '가공', 35, '#94deed', 'flask', null, [['mana:2', 2]]],
    ['chitinDust', '외골격 가루', 'grinder', 1, 4300, '가공', 33, '#c2a7e4', 'powder', 4, [['chitin:1', 3]]],
    ['venomExtract', '독 추출물', 'extractor', 1, 4800, '가공', 48, '#bf8be6', 'flask', 1, [['venom:1', 2], ['mana:1', 2]]],
    ['temperedShell', '정제 갑각판', 'furnace', 2, 5700, '가공', 77, '#ef9468', 'plate', 8, [['shell:1', 3], ['manaFlux', 1]]],
    ['pearlPowder', '진주 가루', 'grinder', 2, 5100, '가공', 55, '#f3dfc9', 'powder', null, [['pearl:1', 2]]],
    ['boneDust', '가공 용골', 'grinder', 2, 6500, '가공', 122, '#e6cfac', 'powder', 4, [['bone:2', 2]]],
    ['scaleAlloy', '용비늘 합금', 'furnace', 2, 6900, '가공', 124, '#ec805f', 'plate', 11, [['scale:1', 4], ['manaFlux', 1]]],
    ['whaleOil', '심해 고래유', 'extractor', 2, 7100, '가공', 84, '#a3d4b7', 'flask', null, [['blubber:1', 4]]],
    ['abyssExtract', '심연 추출액', 'extractor', 3, 9000, '가공', 175, '#7bf0e4', 'flask', 14, [['organ:1', 3], ['tissue:1', 2]]],
    ['adhesive', '탄성 접착제', 'bench', 1, 4000, '제작', 40, '#b6d35d', 'flask', null, [['slimeGel', 1], ['mana:1', 2]]],
    ['sealKit', '밀폐 수리 키트', 'bench', 1, 4500, '제작', 65, '#c4cf86', 'kit', null, [['adhesive', 1], ['membrane:1', 2]]],
    ['signalFlare', '작업장 신호탄', 'bench', 1, 4600, '제작', 65, '#eeb568', 'can', null, [['slimeCore:1', 2], ['manaFlux', 1]]],
    ['poisonCoat', '독성 코팅제', 'bench', 1, 5000, '제작', 75, '#c898db', 'flask', 1, [['venomExtract', 1], ['slime:1', 3]]],
    ['rope', '강화 로프', 'bench', 1, 4800, '제작', 53, '#d3b588', 'coil', 2, [['silk:1', 4], ['membrane:1', 2]]],
    ['fangHook', '송곳니 인양 갈고리', 'bench', 1, 5300, '제작', 76, '#cebbad', 'fang', null, [['fang:1', 3], ['chitinDust', 1]]],
    ['shield', '갑각 방패', 'bench', 2, 6500, '제작', 139, '#df996f', 'shield', 3, [['temperedShell', 1], ['fiber:1', 4]]],
    ['pearlLamp', '진주 탐조등', 'bench', 2, 6300, '제작', 143, '#ffda9b', 'lamp', null, [['pearlPowder', 1], ['mana:3', 2]]],
    ['crabWinch', '집게 견인기', 'bench', 2, 6900, '제작', 123, '#da8f65', 'kit', null, [['claw:1', 3], ['rope', 1]]],
    ['dagger', '용골 단검', 'bench', 2, 7700, '제작', 370, '#e3c8a7', 'blade', 6, [['boneDust', 1], ['mana:4', 1]]],
    ['glider', '용막 활공구', 'bench', 2, 7500, '제작', 190, '#df8a6c', 'wing', null, [['wing:1', 4], ['scaleAlloy', 1]]],
    ['emberRelay', '용심 열중계기', 'bench', 2, 8800, '제작', 198, '#f4a46d', 'core', null, [['heart:1', 2], ['horn:1', 2], ['mana:3', 2]]],
    ['deepFuel', '심해 마력 연료', 'bench', 3, 9600, '제작', 630, '#75e5df', 'can', 7, [['whaleOil', 1], ['mana:5', 1]]],
    ['sonar', '심연 탐지기', 'bench', 3, 10300, '제작', 330, '#8ddced', 'lamp', null, [['abyssExtract', 1], ['baleen:1', 4], ['mana:3', 1]]],
    ['divingSuit', '심해 잠수복', 'bench', 3, 11200, '제작', 354, '#7ba7b2', 'shield', null, [['tissue:1', 4], ['sealKit', 1], ['pearlLamp', 1]]],
  ];
  for (const [id, name, station, level, time, kind, value, color, shape, sprite, inputs] of recipeRows) {
    items[id] = { id, name, value, color, shape, sprite, kind };
    recipes[id] = { id, station, level, time, kind, inputs, output: 1 };
  }

  function part(name, hp, x, y, w, h, common, uncommon, rare, polygon) {
    return { name, hp, x, y, w, h, polygon,
      drops: [[common, 1], [uncommon, 0.32], [rare, 0.12]] };
  }

  const beasts = [
    { id: 'slime', name: '거대 슬라임', zone: '이끼굴', color: '#a7da73', volume: 3, bounty: 35,
      gate: { gold: 0, clears: 0, seals: 0 },
      parts: [
        part('점액 두부', 34, 29, 38, 23, 32, 'slime', 'membrane', 'slimeCore', [[5,53],[14,30],[35,18],[40,50],[24,70]]),
        part('중심핵', 50, 51, 49, 23, 32, 'slime', 'slimeCore', 'membrane', [[35,18],[64,20],[70,62],[53,76],[40,50]]),
        part('탄성막', 35, 73, 34, 23, 31, 'membrane', 'slime', 'slimeCore', [[64,20],[82,30],[96,63],[70,62]]),
        part('하부 점액', 33, 59, 77, 31, 29, 'slime', 'membrane', 'slimeCore', [[5,53],[24,70],[40,50],[53,76],[70,62],[96,63],[97,92],[6,93]]),
      ] },
    { id: 'spider', name: '거대 거미', zone: '침묵의 수갱', color: '#b39ade', volume: 4, bounty: 75,
      gate: { gold: 950, clears: 10, seals: 7 },
      parts: [
        part('송곳니', 45, 25, 53, 22, 32, 'fang', 'venom', 'chitin', [[3,27],[38,33],[42,73],[12,79]]),
        part('외골격', 63, 52, 38, 22, 32, 'chitin', 'silk', 'fang', [[24,5],[71,7],[72,44],[38,33],[3,27]]),
        part('독샘', 50, 76, 53, 23, 35, 'venom', 'silk', 'chitin', [[71,7],[97,19],[98,80],[72,75],[72,44]]),
        part('방적돌기', 56, 54, 77, 27, 30, 'silk', 'chitin', 'venom', [[38,33],[72,44],[72,75],[98,80],[97,96],[12,96],[12,79],[42,73]]),
      ] },
    { id: 'crab', name: '거대 갑각수', zone: '녹슨 조간대', color: '#e8a26e', volume: 4, bounty: 125,
      gate: { gold: 1800, clears: 5, seals: 9 },
      parts: [
        part('거대 집게', 66, 23, 58, 24, 33, 'claw', 'shell', 'pearl', [[1,29],[35,38],[40,74],[12,92],[1,77]]),
        part('등갑', 94, 49, 33, 26, 33, 'shell', 'fiber', 'pearl', [[15,10],[72,10],[72,48],[35,38],[1,29]]),
        part('진주낭', 71, 75, 50, 23, 33, 'pearl', 'shell', 'fiber', [[72,10],[95,25],[99,77],[68,75],[72,48]]),
        part('보행근', 65, 52, 76, 27, 29, 'fiber', 'shell', 'claw', [[35,38],[72,48],[68,75],[99,77],[98,95],[12,96],[12,92],[40,74]]),
      ] },
    { id: 'dragon', name: '고대 드래곤', zone: '잿빛 산맥', color: '#e78670', volume: 5, bounty: 230,
      gate: { gold: 4400, clears: 5, seals: 15 },
      parts: [
        part('용두와 뿔', 103, 22, 55, 24, 35, 'horn', 'bone', 'scale', [[1,24],[29,22],[39,59],[29,90],[2,88]]),
        part('날개 피막', 126, 51, 26, 29, 31, 'wing', 'scale', 'bone', [[20,3],[75,4],[81,43],[61,48],[39,59],[29,22]]),
        part('심장과 흉갑', 158, 53, 62, 25, 34, 'scale', 'heart', 'bone', [[39,59],[61,48],[75,70],[68,95],[29,95],[29,90]]),
        part('꼬리 용골', 115, 78, 71, 22, 32, 'bone', 'scale', 'heart', [[75,4],[96,12],[98,94],[68,95],[75,70],[61,48],[81,43]]),
      ] },
    { id: 'whale', name: '심연의 고래', zone: '무광 해구', color: '#76d9d5', volume: 6, bounty: 390,
      gate: { gold: 9300, clears: 5, seals: 22 },
      parts: [
        part('수염과 턱', 164, 22, 54, 25, 37, 'baleen', 'blubber', 'organ', [[2,21],[31,17],[36,65],[29,90],[2,88]]),
        part('두꺼운 지방층', 201, 53, 33, 29, 32, 'blubber', 'tissue', 'organ', [[31,17],[70,13],[76,50],[59,60],[36,65]]),
        part('마력기관', 223, 51, 72, 26, 32, 'organ', 'tissue', 'blubber', [[36,65],[59,60],[76,50],[72,94],[29,90]]),
        part('꼬리 심해 조직', 177, 80, 58, 25, 36, 'tissue', 'blubber', 'organ', [[70,13],[97,10],[98,89],[72,94],[76,50]]),
      ] },
  ];

  const upgrades = {
    power: { name: '해체 해머', detail: '클릭 해체력 +2', base: 70, max: 18 },
    auto: { name: '자동 절단기', detail: '자동 해체 간격 감소 · 해체력 증가', base: 90, max: 12 },
    drops: { name: '분리 집게', detail: '타격당 기본 부산물 +1', base: 135, max: 8 },
    rare: { name: '정밀 탐침', detail: '희귀 부산물과 마정석 드롭 확률 증가', base: 165, max: 10 },
    merge: { name: '융합 자석', detail: '자동 머지 속도 증가', base: 110, max: 10 },
    capacity: { name: '적재 선반', detail: '보관함 용량 +100', base: 100, max: 16 },
    collect: { name: '수거 컨베이어', detail: '초당 자동 수거량 증가', base: 105, max: 10 },
    sort: { name: '일괄 정리기', detail: '빈 보관함으로 작업장 재료를 즉시 수거', base: 115, max: 1 },
    process: { name: '동력 증폭기', detail: '가공·제작 시간 단축', base: 155, max: 10 },
    slots: { name: '보조 작업대', detail: '동시 작업 슬롯 +1', base: 190, max: 4 },
  };

  const quests = [
    ['slimeSample', '연금술사 길드', '생점액 표본', 30, [['slime:1', 6]]],
    ['cutCrystal', '마도구 공방', '조명석 교체', 35, [['mana:2', 3]]],
    ['sticky', '왕국 기사단', '접착제 보급', 45, [['adhesive', 1]]],
    ['membraneSample', '왕립 학술원', '탄성막 시험', 36, [['membrane:1', 6]]],
    ['gelOrder', '연금술사 길드', '농축액 주문', 37, [['slimeGel', 2]]],
    ['campRepair', '왕국 기사단', '야영지 보수', 45, [['sealKit', 1], ['adhesive', 1]]],
    ['coreSample', '왕립 학술원', '핵의 구조', 44, [['slimeCore:2', 2]]],
    ['fluxOrder', '마도구 공방', '용접 보조제', 52, [['manaFlux', 1], ['mana:1', 3]]],
    ['flareOrder', '왕국 기사단', '야간 작업 신호', 50, [['signalFlare', 1]]],
    ['chitinSample', '왕립 학술원', '외골격 분류', 49, [['chitinDust', 2], ['fang:1', 4]]],
    ['ropeOrder', '왕국 기사단', '수갱용 밧줄', 65, [['rope', 2]]],
    ['venomOrder', '연금술사 길드', '독성 코팅 검사', 72, [['poisonCoat', 1], ['venomExtract', 1]]],
    ['hookOrder', '왕국 기사단', '수갱 인양 장비', 72, [['fangHook', 1], ['rope', 1]]],
    ['pearls', '마도구 공방', '광원 시제품', 90, [['pearlLamp', 1], ['pearl:1', 3]]],
    ['shellGear', '왕국 기사단', '갑각 장비 조달', 95, [['shield', 2], ['temperedShell', 1]]],
    ['winchOrder', '마도구 공방', '조간대 견인 시험', 95, [['crabWinch', 1]]],
    ['scaleSample', '왕립 학술원', '비늘의 온도', 100, [['scaleAlloy', 1], ['scale:2', 2]]],
    ['dragonGear', '왕국 기사단', '산맥 원정 장비', 150, [['dagger', 1], ['glider', 1]]],
    ['relayOrder', '마도구 공방', '용심 발열 실험', 130, [['emberRelay', 1]]],
    ['oilOrder', '연금술사 길드', '심해 정제 시료', 180, [['whaleOil', 2], ['abyssExtract', 1]]],
    ['deepOrder', '마도구 공방', '해구 관측소 재가동', 240, [['deepFuel', 1], ['sonar', 1]]],
    ['suitOrder', '왕립 학술원', '유인 잠수 조사', 220, [['divingSuit', 1], ['whaleOil', 1]]],
  ].map(([id, client, name, bonus, needs], index) => ({
    id, client, name, needs, bonus, seals: 1, points: index % 3 === 2 ? 1 : 0,
  }));

  return { families, items, recipes, beasts, stations, upgrades, quests, itemId };
})();

if (typeof module === 'object' && module.exports) module.exports = SALVAGE_DATA;
