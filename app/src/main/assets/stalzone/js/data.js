// STALZONE Game Database, Barter Trees, Upgrades & LocalStorage Persistence
window.GameData = (function () {
  const SAVE_KEY = 'stalzone_save_v1';

  const AMMO_TYPES = {
    fmj: { id: 'fmj', name: 'Обычные', short: 'ОБЫЧ', dmgMult: 1.0, apBonus: 0.0, mutantMult: 1.0, bleedChance: 0.12 },
    ap:  { id: 'ap',  name: 'Бронебойные (ББ)', short: 'ББ', dmgMult: 0.96, apBonus: 0.45, mutantMult: 0.9, bleedChance: 0.1 },
    exp: { id: 'exp', name: 'Экспансивные', short: 'ЭКСП', dmgMult: 1.05, apBonus: -0.15, mutantMult: 1.38, bleedChance: 0.48 }
  };

  const WEAPONS = {
    pm: {
      id: 'pm', name: 'ПМ (Макаров)', slot: 'secondary', tier: 1, weight: 0.8,
      damage: 24, rpm: 380, mag: 8, reloadTime: 1.45, spread: 0.022, adsSpread: 0.008,
      recoilV: 0.018, recoilH: 0.008, range: 65, pellets: 1, modes: ['semi'],
      caliber: '9x18', color: '#393e42', accent: '#6d3e24', integratedSup: false,
      integratedOptic: false, zoomFov: 56, price: 1200,
      desc: 'Надёжный пистолет 9x18 мм. Вспомогательное оружие для ближнего боя.'
    },
    ak74m: {
      id: 'ak74m', name: 'АК-74М', slot: 'primary', tier: 1, weight: 3.4,
      damage: 28, rpm: 600, mag: 30, reloadTime: 2.1, spread: 0.028, adsSpread: 0.007,
      recoilV: 0.022, recoilH: 0.011, range: 135, pellets: 1, modes: ['auto', 'semi'],
      caliber: '5.45x39', color: '#2b2f33', accent: '#4d3726', integratedSup: false,
      integratedOptic: false, zoomFov: 50, price: 4500,
      desc: 'Классический автомат Зоны. Универсален на ближней и средней дистанции.'
    },
    saiga12: {
      id: 'saiga12', name: 'Сайга-12К', slot: 'primary', tier: 2, weight: 3.6,
      damage: 17, rpm: 240, mag: 8, reloadTime: 2.35, spread: 0.068, adsSpread: 0.044,
      recoilV: 0.045, recoilH: 0.018, range: 48, pellets: 8, modes: ['semi'],
      caliber: '12x70', color: '#24292d', accent: '#1e2124', integratedSup: false,
      integratedOptic: false, zoomFov: 55, price: 8500,
      desc: 'Полуавтоматический дробовик 12 калибра. Идеален против мутантов.'
    },
    as_val: {
      id: 'as_val', name: 'АС «Вал»', slot: 'primary', tier: 3, weight: 2.6,
      damage: 35, rpm: 820, mag: 20, reloadTime: 2.0, spread: 0.024, adsSpread: 0.005,
      recoilV: 0.02, recoilH: 0.01, range: 120, pellets: 1, modes: ['auto', 'semi'],
      caliber: '9x39', color: '#20262a', accent: '#362d26', integratedSup: true,
      integratedOptic: false, zoomFov: 46, price: 18500,
      desc: 'Бесшумный штурмовой автомат с интегрированным глушителем и высокой пробиваемостью.'
    },
    vss: {
      id: 'vss', name: 'ВСС «Винторез»', slot: 'primary', tier: 3, weight: 2.8,
      damage: 46, rpm: 560, mag: 10, reloadTime: 2.15, spread: 0.025, adsSpread: 0.0025,
      recoilV: 0.024, recoilH: 0.008, range: 175, pellets: 1, modes: ['semi', 'auto'],
      caliber: '9x39', color: '#22282b', accent: '#6d4528', integratedSup: true,
      integratedOptic: true, zoomFov: 26, price: 24000,
      desc: 'Специальная снайперская винтовка с оптикой ПСО-1 и глушителем.'
    },
    svd: {
      id: 'svd', name: 'СВД', slot: 'primary', tier: 4, weight: 4.3,
      damage: 78, rpm: 150, mag: 10, reloadTime: 2.5, spread: 0.036, adsSpread: 0.0012,
      recoilV: 0.048, recoilH: 0.012, range: 240, pellets: 1, modes: ['semi'],
      caliber: '7.62x54R', color: '#282d30', accent: '#724628', integratedSup: false,
      integratedOptic: true, zoomFov: 20, price: 32000,
      desc: 'Снайперская винтовка Драгунова. Высочайший урон и дальность на Севере.'
    }
  };

  const ARMORS = {
    jacket: {
      id: 'jacket', name: 'Куртка новичка', branch: 'Комбинированная', tier: 1, weight: 3.5,
      bulletRes: 18, radProt: 1, bioProt: 1, thermProt: 0, psyProt: 0, carryBonus: 0, speedBonus: 0.03,
      desc: 'Простая сталкерская куртка. Защищает лишь от слабых окраинных заражений.'
    },
    // COMBAT BRANCH (Боевая)
    combat_1: {
      id: 'combat_1', name: 'Бронекостюм «Заря-Боец»', branch: 'Боевая', tier: 2, weight: 7.5,
      bulletRes: 42, radProt: 1, bioProt: 1, thermProt: 1, psyProt: 1, carryBonus: 6, speedBonus: -0.02,
      desc: 'Усиленные бронепластины для перестрелок с бандитами и защиты от мутантов.'
    },
    combat_2: {
      id: 'combat_2', name: 'Экзоброня «Центурион»', branch: 'Боевая', tier: 4, weight: 11.5,
      bulletRes: 68, radProt: 2, bioProt: 1, thermProt: 2, psyProt: 1, carryBonus: 18, speedBonus: -0.04,
      desc: 'Тяжёлая штурмовая броня Севера. Максимум пулестойкости, но слаба в сильных заражениях.'
    },
    // SCIENCE BRANCH (Научная)
    sci_1: {
      id: 'sci_1', name: 'Комбинезон «Эколог»', branch: 'Научная', tier: 2, weight: 5.5,
      bulletRes: 26, radProt: 3, bioProt: 3, thermProt: 2, psyProt: 2, carryBonus: 4, speedBonus: 0.0,
      desc: 'Замкнутый цикл дыхания для добычи артефактов и вылазок в заражённые зоны.'
    },
    sci_2: {
      id: 'sci_2', name: 'Скафандр «Сатурн»', branch: 'Научная', tier: 4, weight: 7.0,
      bulletRes: 40, radProt: 4, bioProt: 4, thermProt: 4, psyProt: 4, carryBonus: 10, speedBonus: 0.02,
      desc: 'Топовый научный скафандр. Полная защита от 3–4 уровней всех заражений Севера.'
    },
    // COMBO BRANCH (Комбинированная)
    combo_1: {
      id: 'combo_1', name: 'Комбинезон «Скат-9»', branch: 'Комбинированная', tier: 2, weight: 6.5,
      bulletRes: 36, radProt: 2, bioProt: 2, thermProt: 2, psyProt: 2, carryBonus: 8, speedBonus: 0.0,
      desc: 'Сбалансированный бронекостюм сталкера-ветерана для любых активностей.'
    },
    combo_2: {
      id: 'combo_2', name: 'Бронекостюм «Туз»', branch: 'Комбинированная', tier: 4, weight: 8.5,
      bulletRes: 54, radProt: 3, bioProt: 3, thermProt: 3, psyProt: 3, carryBonus: 15, speedBonus: 0.01,
      desc: 'Универсальный топовый костюм: достойная пулестойкость и проход почти во все зоны.'
    }
  };

  const CONTAINERS = {
    kzs2: { id: 'kzs2', name: 'Контейнер КЗС-2', slots: 2, protection: 0.55, weight: 1.8, tier: 1, desc: '2 слота под артефакты, гасит 55% их заражений.' },
    berloga3: { id: 'berloga3', name: 'Берлога-3', slots: 3, protection: 0.68, weight: 2.6, tier: 2, desc: '3 слота под артефакты, гасит 68% их дебаффов.' },
    berloga4: { id: 'berloga4', name: 'Берлога-4u', slots: 4, protection: 0.78, weight: 3.2, tier: 3, desc: '4 слота под артефакты, гасит 78% вредного излучения.' }
  };

  const DETECTORS = {
    sak1: { id: 'sak1', name: 'Детектор САК-1', range: 26, revealDist: 7.5, signalSpeed: 1.0, tier: 1, weight: 0.6, desc: 'Базовый детектор артефактов и сканер сигналов.' },
    buryat: { id: 'buryat', name: 'Детектор «Бурят»', range: 44, revealDist: 12.5, signalSpeed: 1.7, tier: 3, weight: 0.8, desc: 'Продвинутый детектор: дальний поиск артефактов и ускоренный скан сигналов.' }
  };

  const ARTIFACTS = {
    medusa: {
      id: 'medusa', name: 'Медуза', type: 'artifact', tier: 1, weight: 0.5, price: 2400, color: '#65e095',
      bonuses: { bulletRes: 5, hpRegen: 0.4 }, debuffs: { rad: 0.9 },
      desc: '+5 пулестойкости, +0.4 HP/с | +0.9 Рад/с'
    },
    stone_blood: {
      id: 'stone_blood', name: 'Кровь камня', type: 'artifact', tier: 1, weight: 0.6, price: 2800, color: '#e64d45',
      bonuses: { hpRegen: 1.1, carry: 3 }, debuffs: { bio: 1.0 },
      desc: '+1.1 HP/с, +3 кг веса | +1.0 Био/с'
    },
    flash: {
      id: 'flash', name: 'Вспышка', type: 'artifact', tier: 2, weight: 0.5, price: 4600, color: '#45d0ff',
      bonuses: { speed: 0.08, stamRegen: 6 }, debuffs: { rad: 1.4 },
      desc: '+8% скорости, +6 стамины/с | +1.4 Рад/с'
    },
    firefly: {
      id: 'firefly', name: 'Светляк', type: 'artifact', tier: 3, weight: 0.6, price: 7800, color: '#9eff45',
      bonuses: { hpRegen: 2.2, stamRegen: 5 }, debuffs: { bio: 1.6, rad: 0.7 },
      desc: '+2.2 HP/с, +5 стамины/с | +1.6 Био, +0.7 Рад/с'
    },
    prism: {
      id: 'prism', name: 'Призма', type: 'artifact', tier: 4, weight: 0.7, price: 12500, color: '#d473ff',
      bonuses: { bulletRes: 12, carry: 7 }, debuffs: { psy: 1.7, rad: 0.8 },
      desc: '+12 пулестойкости, +7 кг | +1.7 Пси, +0.8 Рад/с'
    },
    snowflake: {
      id: 'snowflake', name: 'Снежинка', type: 'artifact', tier: 3, weight: 0.5, price: 8900, color: '#a8f2ff',
      bonuses: { speed: 0.12, carry: 6, stamRegen: 9 }, debuffs: { rad: 1.8 },
      desc: '+12% скорости, +6 кг, +9 стамины/с | +1.8 Рад/с'
    }
  };

  const ITEMS = {
    // Consumables
    medkit:   { id: 'medkit', name: 'Аптечка АИ-2', type: 'consumable', weight: 0.4, price: 450, tier: 1, desc: 'Постепенно восстанавливает 55 HP за 5 сек.' },
    bandage:  { id: 'bandage', name: 'Бинт армейский', type: 'consumable', weight: 0.15, price: 200, tier: 1, desc: 'Мгновенно останавливает кровотечение и лечит 10 HP.' },
    antirad:  { id: 'antirad', name: 'Антирад', type: 'consumable', weight: 0.2, price: 380, tier: 1, desc: 'Снимает 65 ед. радиации и снижает биозаражение.' },
    energy:   { id: 'energy', name: 'Энергетик «Зона»', type: 'consumable', weight: 0.3, price: 260, tier: 1, desc: 'Восстанавливает стамину и ускоряет её реген на 25 сек.' },
    grenade:  { id: 'grenade', name: 'Граната РГД-5', type: 'consumable', weight: 0.35, price: 520, tier: 2, desc: 'Осколочная граната. Радиус поражения 9 м.' },

    // Ammo packs
    ammo_fmj: { id: 'ammo_fmj', name: 'Патроны (Обычные)', type: 'ammo', ammoType: 'fmj', weight: 0.015, price: 12, tier: 1, desc: 'Стандартные боеприпасы.' },
    ammo_ap:  { id: 'ammo_ap',  name: 'Патроны (ББ)', type: 'ammo', ammoType: 'ap', weight: 0.018, price: 24, tier: 2, desc: 'Бронебойные патроны: игнорируют 45% пулестойкости.' },
    ammo_exp: { id: 'ammo_exp', name: 'Патроны (Эксп.)', type: 'ammo', ammoType: 'exp', weight: 0.016, price: 20, tier: 2, desc: 'Экспансивные: +38% урона по мутантам и кровотечение.' },

    // Attachments
    att_optic: { id: 'att_optic', name: 'Коллиматор / Оптика', type: 'attachment', attKey: 'optic', weight: 0.35, price: 2200, tier: 2, desc: 'Улучшает точность в прицеле и добавляет оптический зум.' },
    att_sup:   { id: 'att_sup',   name: 'Глушитель ПБС', type: 'attachment', attKey: 'suppressor', weight: 0.4, price: 2600, tier: 2, desc: 'Снижает звук выстрела, вспышку и вертикальную отдачу.' },
    att_mag:   { id: 'att_mag',   name: 'Увеличенный магазин', type: 'attachment', attKey: 'extMag', weight: 0.3, price: 2000, tier: 2, desc: '+40% патронов в магазине.' },
    att_laser: { id: 'att_laser', name: 'ЛЦУ тактический', type: 'attachment', attKey: 'laser', weight: 0.2, price: 1800, tier: 2, desc: 'Снижает разброс от бедра на 35% и проецирует луч.' },

    // Upgrade tools
    tools:     { id: 'tools', name: 'Инструменты / Запаски', type: 'tool', weight: 0.6, price: 1400, tier: 2, desc: 'Используется у Механика для заточки оружия и брони (+1..+15).' },

    // Barter Resources
    res_moss:   { id: 'res_moss', name: 'Болотный мох', type: 'barter', weight: 0.25, price: 320, tier: 1, desc: 'Бартерный ресурс Южных болот.' },
    res_root:   { id: 'res_root', name: 'Корень-вонючка', type: 'barter', weight: 0.25, price: 360, tier: 1, desc: 'Бартерный ресурс с логов мутантов Окраин.' },
    res_radio:  { id: 'res_radio', name: 'Остатки радиопередатчика', type: 'barter', weight: 0.35, price: 680, tier: 2, desc: 'Технический бартер из сигналов САК и Промзоны.' },
    res_data:   { id: 'res_data', name: 'Фрагменты данных', type: 'barter', weight: 0.2, price: 1100, tier: 3, desc: 'Редкие данные из НИИ и Протоаномалий Севера.' },

    // Mutant parts & vendor loot
    part_dog:    { id: 'part_dog', name: 'Хвост слепого пса', type: 'sellable', weight: 0.3, price: 520, tier: 1, desc: 'Ценится Скупщиком в Баре.' },
    part_boar:   { id: 'part_boar', name: 'Копыто кабана', type: 'sellable', weight: 0.6, price: 880, tier: 2, desc: 'Трофей мутанта. Продайте Скупщику.' },
    part_blood:  { id: 'part_blood', name: 'Щупальца кровососа', type: 'sellable', weight: 0.5, price: 2400, tier: 3, desc: 'Редкий трофей Севера. Высокая цена у Скупщика.' },
    loot_pda:    { id: 'loot_pda', name: 'Зашифрованный ПДА', type: 'sellable', weight: 0.25, price: 1500, tier: 2, desc: 'Трофей с враждебного сталкера/бандита.' },

    ...ARTIFACTS
  };

  // Barter recipes at Barter NPC
  const BARTER_RECIPES = [
    // Weapons
    { id: 'b_saiga', resultType: 'weapon', resultId: 'saiga12', name: 'Сайга-12К', reqItem: 'ak74m', cost: 4500, reqRes: { res_moss: 4, res_root: 3 } },
    { id: 'b_val',   resultType: 'weapon', resultId: 'as_val',  name: 'АС «Вал»', reqItem: 'ak74m', cost: 11000, reqRes: { res_radio: 5, res_data: 3 } },
    { id: 'b_vss',   resultType: 'weapon', resultId: 'vss',     name: 'ВСС «Винторез»', reqItem: 'as_val', cost: 15000, reqRes: { res_radio: 6, res_data: 6 } },
    { id: 'b_svd',   resultType: 'weapon', resultId: 'svd',     name: 'СВД', reqItem: 'ak74m', cost: 21000, reqRes: { res_radio: 8, res_data: 8 } },
    // Armors
    { id: 'b_comb1', resultType: 'armor', resultId: 'combat_1', name: 'Заря-Боец (Боевая)', reqItem: 'jacket', cost: 4000, reqRes: { res_moss: 5, res_root: 4 } },
    { id: 'b_comb2', resultType: 'armor', resultId: 'combat_2', name: 'Центурион (Боевая)', reqItem: 'combat_1', cost: 19000, reqRes: { res_radio: 7, res_data: 8 } },
    { id: 'b_sci1',  resultType: 'armor', resultId: 'sci_1',    name: 'Эколог (Научная)', reqItem: 'jacket', cost: 4200, reqRes: { res_moss: 6, res_radio: 2 } },
    { id: 'b_sci2',  resultType: 'armor', resultId: 'sci_2',    name: 'Сатурн (Научная)', reqItem: 'sci_1', cost: 20000, reqRes: { res_radio: 6, res_data: 9 } },
    { id: 'b_cbo1',  resultType: 'armor', resultId: 'combo_1',  name: 'Скат-9 (Комбо)', reqItem: 'jacket', cost: 4800, reqRes: { res_moss: 4, res_root: 4, res_radio: 2 } },
    { id: 'b_cbo2',  resultType: 'armor', resultId: 'combo_2',  name: 'Туз (Комбо)', reqItem: 'combo_1', cost: 18500, reqRes: { res_radio: 7, res_data: 7 } },
    // Containers & Detectors
    { id: 'b_ber3',  resultType: 'container', resultId: 'berloga3', name: 'Контейнер Берлога-3', reqItem: 'kzs2', cost: 5500, reqRes: { res_moss: 4, res_radio: 3 } },
    { id: 'b_ber4',  resultType: 'container', resultId: 'berloga4', name: 'Контейнер Берлога-4u', reqItem: 'berloga3', cost: 14000, reqRes: { res_radio: 6, res_data: 5 } },
    { id: 'b_bur',   resultType: 'detector',  resultId: 'buryat',   name: 'Детектор «Бурят»', reqItem: 'sak1', cost: 9500, reqRes: { res_radio: 6, res_data: 4 } }
  ];

  const TRADER_CATALOG = [
    { itemId: 'medkit', count: 1, price: 450 },
    { itemId: 'bandage', count: 2, price: 360 },
    { itemId: 'antirad', count: 1, price: 380 },
    { itemId: 'energy', count: 1, price: 260 },
    { itemId: 'grenade', count: 1, price: 520 },
    { itemId: 'ammo_fmj', count: 30, price: 320 },
    { itemId: 'ammo_ap', count: 30, price: 690 },
    { itemId: 'ammo_exp', count: 30, price: 580 },
    { itemId: 'tools', count: 1, price: 1400 },
    { itemId: 'att_optic', count: 1, price: 2200 },
    { itemId: 'att_sup', count: 1, price: 2600 },
    { itemId: 'att_mag', count: 1, price: 2000 },
    { itemId: 'att_laser', count: 1, price: 1800 }
  ];

  const DEFAULT_QUESTS = [
    { id: 'q_dogs', title: 'Зачистка Южных болот', desc: 'Уничтожьте 4 мутантов на Окраинах', type: 'kill_mutant', target: 4, progress: 0, rewardMoney: 3500, rewardItem: 'res_moss', rewardCount: 4, claimed: false },
    { id: 'q_bandits', title: 'Охота на мародёров', desc: 'Ликвидируйте 3 враждебных бандитов/сталкеров', type: 'kill_human', target: 3, progress: 0, rewardMoney: 5500, rewardItem: 'res_radio', rewardCount: 3, claimed: false },
    { id: 'q_art', title: 'Дары Зоны', desc: 'Найдите детектором и подберите 2 артефакта', type: 'pickup_art', target: 2, progress: 0, rewardMoney: 6000, rewardItem: 'tools', rewardCount: 2, claimed: false },
    { id: 'q_signal', title: 'Перехват частоты', desc: 'Найдите 1 тайник через сканирование сигнала САК', type: 'find_signal', target: 1, progress: 0, rewardMoney: 5000, rewardItem: 'res_radio', rewardCount: 4, claimed: false },
    { id: 'q_proto', title: 'Разрядка Протоаномалии', desc: 'Завершите зарядку 1 Протоаномалии', type: 'clear_proto', target: 1, progress: 0, rewardMoney: 9500, rewardItem: 'res_data', rewardCount: 4, claimed: false }
  ];

  function createDefaultProfile() {
    return {
      money: 5000,
      reputation: 0,
      equipment: {
        primary: 'ak74m',
        secondary: 'pm',
        armor: 'jacket',
        container: 'kzs2',
        detector: 'sak1'
      },
      ownedGear: {
        weapons: ['ak74m', 'pm'],
        armors: ['jacket'],
        containers: ['kzs2'],
        detectors: ['sak1']
      },
      upgrades: {
        ak74m: 0, pm: 0, saiga12: 0, as_val: 0, vss: 0, svd: 0,
        jacket: 0, combat_1: 0, combat_2: 0, sci_1: 0, sci_2: 0, combo_1: 0, combo_2: 0
      },
      attachmentsOwned: { optic: false, suppressor: false, extMag: false, laser: false },
      attachmentsEnabled: { optic: false, suppressor: false, extMag: false, laser: false },
      containerArtifacts: ['medusa'],
      backpack: [
        { id: 'medkit', count: 3 },
        { id: 'bandage', count: 4 },
        { id: 'antirad', count: 2 },
        { id: 'energy', count: 2 },
        { id: 'grenade', count: 2 },
        { id: 'ammo_fmj', count: 120 },
        { id: 'ammo_ap', count: 30 },
        { id: 'ammo_exp', count: 30 },
        { id: 'tools', count: 1 }
      ],
      stash: [
        { id: 'medkit', count: 3 },
        { id: 'ammo_fmj', count: 90 },
        { id: 'res_moss', count: 2 }
      ],
      quests: JSON.parse(JSON.stringify(DEFAULT_QUESTS)),
      stats: {
        killsMutant: 0,
        killsHuman: 0,
        headshots: 0,
        artifactsFound: 0,
        emissionsSurvived: 0,
        deaths: 0
      },
      settings: {
        sensitivity: 1.0,
        volume: 0.75,
        touchControls: ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth <= 1024
      }
    };
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return createDefaultProfile();
      const parsed = JSON.parse(raw);
      const def = createDefaultProfile();
      return {
        ...def,
        ...parsed,
        equipment: { ...def.equipment, ...(parsed.equipment || {}) },
        ownedGear: { ...def.ownedGear, ...(parsed.ownedGear || {}) },
        upgrades: { ...def.upgrades, ...(parsed.upgrades || {}) },
        attachmentsOwned: { ...def.attachmentsOwned, ...(parsed.attachmentsOwned || {}) },
        attachmentsEnabled: { ...def.attachmentsEnabled, ...(parsed.attachmentsEnabled || {}) },
        stats: { ...def.stats, ...(parsed.stats || {}) },
        settings: { ...def.settings, ...(parsed.settings || {}) }
      };
    } catch (_) {
      return createDefaultProfile();
    }
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
    } catch (_) {}
  }

  function resetProfile() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
    return createDefaultProfile();
  }

  function addItemToList(list, itemId, count) {
    if (count <= 0) return;
    const existing = list.find(e => e.id === itemId);
    if (existing) existing.count += count;
    else list.push({ id: itemId, count });
  }

  function removeItemFromList(list, itemId, count) {
    const idx = list.findIndex(e => e.id === itemId);
    if (idx === -1) return false;
    if (list[idx].count < count) return false;
    list[idx].count -= count;
    if (list[idx].count <= 0) list.splice(idx, 1);
    return true;
  }

  function countItem(list, itemId) {
    const e = list.find(i => i.id === itemId);
    return e ? e.count : 0;
  }

  function getWeaponStats(profile, weaponId) {
    const base = WEAPONS[weaponId] || WEAPONS.ak74m;
    const lvl = (profile.upgrades && profile.upgrades[weaponId]) || 0;
    const att = profile.attachmentsEnabled || {};
    const hasSup = base.integratedSup || (att.suppressor && weaponId !== 'saiga12');
    const hasOptic = base.integratedOptic || att.optic;
    const hasExt = att.extMag;
    const hasLaser = att.laser;

    return {
      ...base,
      level: lvl,
      damage: base.damage * (1 + lvl * 0.045),
      mag: hasExt ? Math.round(base.mag * 1.4) : base.mag,
      spread: base.spread * (hasLaser ? 0.65 : 1.0),
      adsSpread: base.adsSpread * (hasOptic ? 0.72 : 1.0),
      recoilV: base.recoilV * (hasSup ? 0.82 : 1.0),
      suppressed: hasSup,
      hasOptic,
      hasLaser,
      zoomFov: base.integratedOptic ? base.zoomFov : (hasOptic ? 36 : base.zoomFov)
    };
  }

  function getPlayerDerivedStats(profile) {
    const armor = ARMORS[profile.equipment.armor] || ARMORS.jacket;
    const armorLvl = (profile.upgrades && profile.upgrades[armor.id]) || 0;
    const cont = CONTAINERS[profile.equipment.container] || CONTAINERS.kzs2;
    const protMult = 1 - cont.protection;

    let bulletRes = armor.bulletRes * (1 + armorLvl * 0.035);
    let maxWeight = 42 + armor.carryBonus;
    let speedMult = 1.0 + armor.speedBonus;
    let hpRegen = 0.0;
    let stamRegenBonus = 0.0;
    let artRad = 0, artBio = 0, artTherm = 0, artPsy = 0;

    for (const artId of (profile.containerArtifacts || [])) {
      const a = ARTIFACTS[artId];
      if (!a) continue;
      if (a.bonuses.bulletRes) bulletRes += a.bonuses.bulletRes;
      if (a.bonuses.carry) maxWeight += a.bonuses.carry;
      if (a.bonuses.speed) speedMult += a.bonuses.speed;
      if (a.bonuses.hpRegen) hpRegen += a.bonuses.hpRegen;
      if (a.bonuses.stamRegen) stamRegenBonus += a.bonuses.stamRegen;
      if (a.debuffs.rad) artRad += a.debuffs.rad * protMult;
      if (a.debuffs.bio) artBio += a.debuffs.bio * protMult;
      if (a.debuffs.therm) artTherm += a.debuffs.therm * protMult;
      if (a.debuffs.psy) artPsy += a.debuffs.psy * protMult;
    }

    // Current carried weight
    let weight = armor.weight + cont.weight;
    const pWpn = WEAPONS[profile.equipment.primary];
    const sWpn = WEAPONS[profile.equipment.secondary];
    const det = DETECTORS[profile.equipment.detector];
    if (pWpn) weight += pWpn.weight;
    if (sWpn) weight += sWpn.weight;
    if (det) weight += det.weight;
    for (const artId of (profile.containerArtifacts || [])) {
      if (ARTIFACTS[artId]) weight += ARTIFACTS[artId].weight;
    }
    for (const item of profile.backpack) {
      const def = ITEMS[item.id];
      if (def) weight += def.weight * item.count;
    }

    return {
      armor,
      armorLvl,
      container: cont,
      detector: det || DETECTORS.sak1,
      bulletRes: Math.min(85, bulletRes),
      radProt: armor.radProt,
      bioProt: armor.bioProt,
      thermProt: armor.thermProt,
      psyProt: armor.psyProt,
      maxWeight,
      weight,
      speedMult,
      hpRegen,
      stamRegenBonus,
      artDebuffs: { rad: artRad, bio: artBio, therm: artTherm, psy: artPsy }
    };
  }

  return {
    AMMO_TYPES, WEAPONS, ARMORS, CONTAINERS, DETECTORS, ARTIFACTS, ITEMS,
    BARTER_RECIPES, TRADER_CATALOG, DEFAULT_QUESTS,
    createDefaultProfile, loadProfile, saveProfile, resetProfile,
    addItemToList, removeItemFromList, countItem,
    getWeaponStats, getPlayerDerivedStats
  };
})();
