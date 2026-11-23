// STALZONE Seamless Chernobyl Exclusion Zone World Generator
window.ZoneWorld = (function () {
  class World {
    constructor(engine) {
      this.engine = engine;
      this.safeCenter = { x: 0, z: 0, radius: 24 };
      this.npcs = [];
      this.staticLights = [];
      this.anomalies = [];
      this.artifacts = [];
      this.contamZones = []; // { x, z, radius, type: 'rad'|'bio'|'therm'|'psy', level: 1..4 }
      this.spots = [];       // Mutant dens & patrol landmarks
      this.protoAnomalies = [];
      this.swampPools = [];
      this.timeOfDay = 10.5; // 0..24h
      this.weather = 'overcast'; // 'overcast' | 'rain' | 'fog'
      this.weatherTimer = 95;
      this.build();
    }

    isSafeZone(x, z) {
      const dx = x - this.safeCenter.x;
      const dz = z - this.safeCenter.z;
      return (dx * dx + dz * dz) <= this.safeCenter.radius * this.safeCenter.radius;
    }

    getRegionName(x, z) {
      if (this.isSafeZone(x, z)) return 'БАР [СЕЙВ-ЗОНА]';
      if (z > 24) return x < -20 ? 'ЮГ • БОЛОТА' : 'ЮГ • ОКРАИНЫ / ДЕРЕВНЯ';
      if (z < -24) return x > 18 ? 'СЕВЕР • НИИ «АГРОПРОМ»' : 'СЕВЕР • ПРОМЗОНА';
      return 'БУФЕРНАЯ ПОЛОСА';
    }

    isInSwamp(x, z) {
      for (const s of this.swampPools) {
        if (Math.abs(x - s.x) < s.w * 0.5 && Math.abs(z - s.z) < s.d * 0.5) return true;
      }
      return false;
    }

    build() {
      const E = this.engine;
      E.beginStaticBuild();

      // === 1. SEAMLESS GROUND BIOMES (320x320) ===
      // Main Zone grass base
      E.addStaticBox(0, -0.5, 0, 320, 1, 320, 'grass', { tile: 8, solid: false });
      // Central asphalt road running North-South + Bar Courtyard
      E.addStaticBox(0, 0.02, 0, 10, 0.06, 300, 'asphalt', { tile: 5, solid: false });
      E.addStaticBox(0, 0.03, 0, 44, 0.06, 44, 'concrete', { tile: 4, solid: false });
      // Industrial concrete pad North
      E.addStaticBox(-32, 0.02, -84, 72, 0.06, 76, 'concrete', { tile: 6, solid: false });
      E.addStaticBox(44, 0.02, -86, 68, 0.06, 74, 'asphalt', { tile: 6, solid: false });

      // South Swamp water pools
      const swamps = [
        { x: -45, z: 58, w: 38, d: 34 },
        { x: -78, z: 96, w: 46, d: 36 },
        { x: -24, z: 108, w: 34, d: 28 },
        { x: 56, z: 112, w: 32, d: 26 }
      ];
      this.swampPools = swamps;
      for (const s of swamps) {
        E.addStaticBox(s.x, 0.04, s.z, s.w, 0.06, s.d, 'swamp', { tile: 5, solid: false, tint: [0.82, 0.95, 0.85, 0.92] });
      }

      // === 2. SAFE ZONE: BASE "БАР" (CENTER 0,0) ===
      this._buildBarBase();

      // === 3. SOUTH / OUTSKIRTS (z > 28): VILLAGE, GARAGES, TOWERS, TRUCKS, TREES ===
      this._buildHouse(34, 54, 12, 5.2, 10, 'brick', 'south');
      this._buildHouse(58, 66, 11, 5.0, 9, 'wood', 'west');
      this._buildHouse(42, 86, 13, 5.4, 10, 'brick', 'north');
      this._buildGarage(-22, 46, 9, 4.0, 12);
      this._buildGarage(-34, 46, 9, 4.0, 12);
      this._buildWatchtower(-14, 72);
      this._buildWatchtower(72, 46);
      this._buildVehicle(12, 48, 'truck');
      this._buildVehicle(-18, 86, 'btr');
      this._buildVehicle(26, 105, 'truck');

      // Concrete slabs & barbed wire barricades in South
      for (let i = 0; i < 6; i++) {
        E.addStaticBox(-10 + i * 7, 1.0, 34, 4.5, 2.0, 0.6, 'concrete', { tile: 2 });
      }
      E.addStaticBox(16, 1.1, 66, 16, 2.2, 0.25, 'wire', { tile: 2, solid: true });
      E.addStaticBox(-54, 1.1, 44, 18, 2.2, 0.25, 'wire', { tile: 2, solid: true });

      // === 4. NORTH / CENTER (z < -28): INDUSTRIAL ZONE + RESEARCH INSTITUTE НИИ ===
      // Massive Industrial Factory Hall (West North) with roof shelter & doors
      this._buildIndustrialHall(-38, -78, 34, 9.5, 26);
      // Research Institute НИИ (East North) multi-wing complex with roof shelter
      this._buildHouse(46, -78, 26, 8.0, 22, 'concrete', 'south');
      this._buildHouse(46, -108, 18, 7.0, 14, 'concrete', 'south');
      // Industrial silos & cooling drums
      this._buildSilo(-64, -102, 10, 18);
      this._buildSilo(-48, -110, 8, 15);
      // Rusted garages & checkpoints
      this._buildGarage(14, -52, 10, 4.4, 14);
      this._buildWatchtower(-12, -48);
      this._buildWatchtower(18, -96);
      this._buildVehicle(-8, -66, 'btr');
      this._buildVehicle(24, -76, 'truck');

      // Perimeter concrete walls at Zone edges
      const B = 156;
      E.addStaticBox(0, 4, -B, 316, 8, 2, 'concrete', { tile: 4 });
      E.addStaticBox(0, 4, B, 316, 8, 2, 'concrete', { tile: 4 });
      E.addStaticBox(-B, 4, 0, 2, 8, 316, 'concrete', { tile: 4 });
      E.addStaticBox(B, 4, 0, 2, 8, 316, 'concrete', { tile: 4 });

      // === 5. VOXEL TREES & COVER SLABS ===
      const treeCoords = [
        [-64, 24], [-82, 34], [-96, 62], [-66, 84], [-108, 104], [-42, 122],
        [24, 34], [74, 32], [88, 64], [94, 96], [68, 122], [18, 124],
        [-78, -22], [-96, -54], [-104, -88], [-86, -124], [-22, -126],
        [78, -32], [96, -64], [102, -102], [82, -130], [22, -132],
        [-36, 16], [42, 14], [-44, -22], [38, -26], [-84, 4], [84, -8],
        [108, 22], [-112, -18], [52, 134], [-58, 136], [-18, 66], [66, 88]
      ];
      for (let i = 0; i < treeCoords.length; i++) {
        this._buildTree(treeCoords[i][0], treeCoords[i][1], 5.5 + (i % 4) * 1.4);
      }

      // Scattered concrete cover blocks along roads for tactical PvP gunfights
      const coverSpots = [
        [8, 36], [-8, 56], [7, 78], [-7, 98], [8, -42], [-8, -62], [8, -88], [-16, -98], [26, -58]
      ];
      for (const c of coverSpots) {
        E.addStaticBox(c[0], 0.85, c[1], 3.4, 1.7, 1.1, 'concrete', { tile: 2 });
      }

      E.finishStaticBuild();

      // === 6. POPULATE CONTAMINATION ZONES, SPOTS, ANOMALIES, ARTIFACTS, PROTO ===
      this._initContaminationZones();
      this._initSpotsAndProto();
      this.respawnAnomaliesAndArtifacts();
    }

    _buildBarBase() {
      const E = this.engine;
      // Outer compound concrete wall with North & South open gates
      E.addStaticBox(-13, 2.2, 22, 18, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(13, 2.2, 22, 18, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(-13, 2.2, -22, 18, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(13, 2.2, -22, 18, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(-22, 2.2, 0, 1.2, 4.4, 44, 'concrete', { tile: 3 });
      E.addStaticBox(22, 2.2, 0, 1.2, 4.4, 44, 'concrete', { tile: 3 });
      // Hazard arches over North & South gates
      E.addStaticBox(0, 4.6, 22, 10, 0.9, 1.6, 'hazard', { tile: 2 });
      E.addStaticBox(0, 4.6, -22, 10, 0.9, 1.6, 'hazard', { tile: 2 });

      // Main roofed BAR Bunker on West side (emission-safe roof!)
      this._buildHouse(-11, -3, 14, 5.2, 18, 'brick', 'east');

      // Campfire pit in center-east courtyard
      E.addStaticBox(4, 0.25, 2, 1.6, 0.5, 1.6, 'brick', { tile: 1 });
      E.addStaticBox(4, 0.65, 2, 0.7, 0.5, 0.7, 'wood', { tile: 1, tint: [1.0, 0.55, 0.15, 1], emissive: 0.9 });
      this.staticLights.push({ x: 4, y: 2.0, z: 2, r: 19, cr: 1.4, cg: 0.72, cb: 0.25, flicker: true });
      // Warm lamps inside Bar & at gates
      this.staticLights.push({ x: -10, y: 4.2, z: -3, r: 18, cr: 1.1, cg: 0.92, cb: 0.62 });
      this.staticLights.push({ x: 0, y: 4.3, z: -20, r: 16, cr: 0.9, cg: 0.85, cb: 0.55 });
      this.staticLights.push({ x: 0, y: 4.3, z: 20, r: 16, cr: 0.9, cg: 0.85, cb: 0.55 });

      // Personal Stash crate near campfire
      E.addStaticBox(8.5, 0.65, -2.5, 1.5, 1.2, 1.0, 'rust', { tile: 1.5, tint: [0.55, 0.85, 0.55, 1] });
      // Counter tables inside Bar
      E.addStaticBox(-14.5, 0.6, -3, 1.4, 1.2, 10, 'wood', { tile: 2 });

      // 4 Bar NPCs + Personal Stash interactables
      this.npcs = [
        { id: 'trader',   name: 'Торговец «Сидорыч»', role: 'Патроны, медицина, обвесы', x: -13.0, z: -6.5, color: [0.85, 0.72, 0.35, 1] },
        { id: 'barter',   name: 'Бартерщик «Кузнец»', role: 'Ветки бартера брони и оружия', x: -13.0, z: -2.2, color: [0.35, 0.82, 0.52, 1] },
        { id: 'mechanic', name: 'Механик «Азот»',     role: 'Заточка снаряжения (+1..+15)', x: -13.0, z: 2.2,  color: [0.42, 0.75, 0.95, 1] },
        { id: 'fence',    name: 'Скупщик «Барыга»',   role: 'Скупка артефактов и трофеев', x: 7.5,   z: 5.5,  color: [0.92, 0.48, 0.35, 1] },
        { id: 'stash',    name: 'Личный Схрон',       role: 'Безопасное хранилище', x: 8.5,   z: -2.5, color: [0.45, 0.95, 0.55, 1], isBox: true }
      ];
    }

    _buildHouse(cx, cz, w, h, d, wallTex, doorSide) {
      const E = this.engine;
      const t = 0.6;
      const doorW = 3.2;
      // Floor
      E.addStaticBox(cx, 0.08, cz, w, 0.16, d, 'concrete', { tile: 3, solid: false });
      // Roof (marked isRoof = true for Emission upward raycast!)
      E.addStaticBox(cx, h + 0.3, cz, w + 0.8, 0.6, d + 0.8, 'roof', { tile: 3, isRoof: true, solid: true });

      const buildWallWithDoor = (isX, pos, len) => {
        const seg = (len - doorW) * 0.5;
        if (isX) {
          E.addStaticBox(cx - (doorW + seg) * 0.5, h * 0.5, pos, seg, h, t, wallTex, { tile: 3 });
          E.addStaticBox(cx + (doorW + seg) * 0.5, h * 0.5, pos, seg, h, t, wallTex, { tile: 3 });
          E.addStaticBox(cx, h - 0.85, pos, doorW, 1.7, t, wallTex, { tile: 3 });
        } else {
          E.addStaticBox(pos, h * 0.5, cz - (doorW + seg) * 0.5, t, h, seg, wallTex, { tile: 3 });
          E.addStaticBox(pos, h * 0.5, cz + (doorW + seg) * 0.5, t, h, seg, wallTex, { tile: 3 });
          E.addStaticBox(pos, h - 0.85, cz, t, 1.7, doorW, wallTex, { tile: 3 });
        }
      };

      // North (-Z)
      if (doorSide === 'north') buildWallWithDoor(true, cz - d * 0.5, w);
      else E.addStaticBox(cx, h * 0.5, cz - d * 0.5, w, h, t, wallTex, { tile: 3 });
      // South (+Z)
      if (doorSide === 'south') buildWallWithDoor(true, cz + d * 0.5, w);
      else E.addStaticBox(cx, h * 0.5, cz + d * 0.5, w, h, t, wallTex, { tile: 3 });
      // East (+X)
      if (doorSide === 'east') buildWallWithDoor(false, cx + w * 0.5, d);
      else E.addStaticBox(cx + w * 0.5, h * 0.5, cz, t, h, d, wallTex, { tile: 3 });
      // West (-X)
      if (doorSide === 'west') buildWallWithDoor(false, cx - w * 0.5, d);
      else E.addStaticBox(cx - w * 0.5, h * 0.5, cz, t, h, d, wallTex, { tile: 3 });
    }

    _buildIndustrialHall(cx, cz, w, h, d) {
      this._buildHouse(cx, cz, w, h, d, 'concrete', 'south');
      // Add extra side entrance & interior pillars + glowing work lamp
      this.engine.addStaticBox(cx - 6, h * 0.5, cz, 1.4, h, 1.4, 'rust', { tile: 2 });
      this.engine.addStaticBox(cx + 6, h * 0.5, cz, 1.4, h, 1.4, 'rust', { tile: 2 });
      this.engine.addStaticBox(cx, 1.1, cz - 4, 8, 2.2, 2.2, 'hazard', { tile: 2 });
      this.staticLights.push({ x: cx, y: h - 1.5, z: cz, r: 22, cr: 0.75, cg: 0.92, cb: 0.95 });
    }

    _buildGarage(cx, cz, w, h, d) {
      const E = this.engine;
      E.addStaticBox(cx, h + 0.2, cz, w + 0.4, 0.4, d + 0.4, 'roof', { tile: 2.5, isRoof: true });
      E.addStaticBox(cx - w * 0.5, h * 0.5, cz, 0.4, h, d, 'rust', { tile: 2.5 });
      E.addStaticBox(cx + w * 0.5, h * 0.5, cz, 0.4, h, d, 'rust', { tile: 2.5 });
      E.addStaticBox(cx, h * 0.5, cz - d * 0.5, w, h, 0.4, 'rust', { tile: 2.5 });
    }

    _buildWatchtower(cx, cz) {
      const E = this.engine;
      const posts = [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]];
      for (const p of posts) {
        E.addStaticBox(cx + p[0], 4.0, cz + p[1], 0.45, 8.0, 0.45, 'wood', { tile: 2 });
      }
      E.addStaticBox(cx, 6.2, cz, 4.2, 0.4, 4.2, 'wood', { tile: 2 });
      E.addStaticBox(cx, 8.2, cz, 4.6, 0.35, 4.6, 'roof', { tile: 2, isRoof: true });
    }

    _buildSilo(cx, cz, w, h) {
      this.engine.addStaticBox(cx, h * 0.5, cz, w, h, w, 'rust', { tile: 4 });
      this.engine.addStaticBox(cx, h + 0.4, cz, w + 0.8, 0.8, w + 0.8, 'concrete', { tile: 3 });
    }

    _buildVehicle(cx, cz, kind) {
      const E = this.engine;
      if (kind === 'btr') {
        E.addStaticBox(cx, 1.15, cz, 3.2, 1.5, 6.6, 'rust', { tile: 2.5, tint: [0.46, 0.56, 0.44, 1] });
        E.addStaticBox(cx, 2.2, cz - 0.6, 1.8, 0.8, 2.0, 'rust', { tile: 2, tint: [0.4, 0.5, 0.38, 1] });
        E.addStaticBox(cx, 2.2, cz + 1.5, 0.25, 0.25, 2.6, 'asphalt', { tile: 1 });
      } else {
        E.addStaticBox(cx, 1.2, cz + 1.8, 2.6, 1.8, 2.2, 'rust', { tile: 2, tint: [0.5, 0.58, 0.42, 1] });
        E.addStaticBox(cx, 1.45, cz - 1.4, 2.8, 2.1, 4.4, 'wood', { tile: 2.2, tint: [0.55, 0.58, 0.44, 1] });
      }
    }

    _buildTree(cx, cz, h) {
      const E = this.engine;
      E.addStaticBox(cx, h * 0.45, cz, 0.75, h * 0.9, 0.75, 'bark', { tile: 2 });
      E.addStaticBox(cx, h * 0.85, cz, 3.8, 2.6, 3.8, 'leaves', { tile: 2.5, solid: false });
      E.addStaticBox(cx, h * 1.12, cz, 2.4, 1.9, 2.4, 'leaves', { tile: 2.5, solid: false });
    }

    _initContaminationZones() {
      this.contamZones = [
        // South (Level 1-2)
        { x: -46, z: 60, radius: 22, type: 'bio', level: 1, name: 'Болотная топь (Био 1)' },
        { x: -74, z: 98, radius: 26, type: 'bio', level: 2, name: 'Кислотное болото (Био 2)' },
        { x: 24,  z: 74, radius: 18, type: 'rad', level: 1, name: 'Фонящая техника (Рад 1)' },
        // North (Level 2-3)
        { x: -56, z: -102, radius: 28, type: 'rad', level: 3, name: 'Могильник Промзоны (Рад 3)' },
        { x: -24, z: -64,  radius: 18, type: 'therm', level: 2, name: 'Термальный разлом (Термо 2)' },
        { x: 46,  z: -106, radius: 26, type: 'psy', level: 3, name: 'Антенна НИИ (Пси 3)' },
        { x: 74,  z: -66,  radius: 22, type: 'bio', level: 3, name: 'Хим-сброс НИИ (Био 3)' }
      ];
    }

    _initSpotsAndProto() {
      this.spots = [
        { id: 'spot_s1', name: 'Логово псов (Болота)', x: -26, z: 64, tier: 1, kind: 'dogs', clearedCooldown: 0 },
        { id: 'spot_s2', name: 'Лежбище кабанов (Деревня)', x: 52, z: 96, tier: 1, kind: 'boars', clearedCooldown: 0 },
        { id: 'spot_s3', name: 'Лагерь бандитов (Окраины)', x: -58, z: 76, tier: 1, kind: 'bandits', clearedCooldown: 0 },
        { id: 'spot_n1', name: 'Блокпост Севера', x: -16, z: -56, tier: 2, kind: 'bandits', clearedCooldown: 0 },
        { id: 'spot_n2', name: 'Охотничьи угодья Кровососа', x: 72, z: -86, tier: 3, kind: 'bloodsucker', clearedCooldown: 0 },
        { id: 'spot_n3', name: 'Отряд наёмников НИИ', x: 24, z: -112, tier: 3, kind: 'bandits', clearedCooldown: 0 }
      ];

      this.protoAnomalies = [
        { id: 'proto_south', name: 'Протоаномалия (Юг)', x: -8, z: 102, tier: 1, active: false, progress: 0, cooldown: 0 },
        { id: 'proto_north', name: 'Протоаномалия (Север)', x: 8, z: -96, tier: 3, active: false, progress: 0, cooldown: 0 }
      ];
    }

    respawnAnomaliesAndArtifacts() {
      this.anomalies = [];
      this.artifacts = [];
      const types = ['electro', 'vortex', 'springboard', 'burner', 'acid'];

      // Curated + random clusters outside Safe Zone
      const clusters = [
        { x: -18, z: 40, type: 'electro', tier: 1 },
        { x: 18,  z: 44, type: 'springboard', tier: 1 },
        { x: -40, z: 54, type: 'acid', tier: 1 },
        { x: 30,  z: 74, type: 'vortex', tier: 1 },
        { x: -12, z: 88, type: 'burner', tier: 1 },
        { x: -66, z: 90, type: 'acid', tier: 2 },
        { x: 64,  z: 84, type: 'electro', tier: 2 },
        { x: -20, z: -42, type: 'electro', tier: 2 },
        { x: 24,  z: -48, type: 'vortex', tier: 2 },
        { x: -24, z: -64, type: 'burner', tier: 3 },
        { x: -62, z: -78, type: 'vortex', tier: 3 },
        { x: 68,  z: -62, type: 'acid', tier: 3 },
        { x: 16,  z: -86, type: 'springboard', tier: 3 },
        { x: -16, z: -116, type: 'electro', tier: 3 },
        { x: 46,  z: -126, type: 'burner', tier: 3 }
      ];

      // Add extra procedural anomalies
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 34 + Math.random() * 98;
        const ax = Math.cos(ang) * dist;
        const az = Math.sin(ang) * dist;
        clusters.push({
          x: ax, z: az,
          type: types[Math.floor(Math.random() * types.length)],
          tier: az < -24 ? 3 : 1
        });
      }

      const southArts = ['medusa', 'stone_blood', 'flash'];
      const northArts = ['flash', 'firefly', 'prism', 'snowflake'];

      clusters.forEach((c, idx) => {
        this.anomalies.push({
          id: 'anom_' + idx,
          x: c.x, z: c.z,
          type: c.type,
          radius: c.type === 'vortex' ? 4.4 : 3.2,
          cooldown: 0,
          dischargedUntil: 0,
          pulse: Math.random() * 6.28
        });

        // Spawn artifact near ~55% of anomalies
        if (idx % 2 === 0 || c.tier >= 3) {
          const pool = c.tier >= 3 ? northArts : southArts;
          const artId = pool[Math.floor(Math.random() * pool.length)];
          const aAng = Math.random() * Math.PI * 2;
          const aDist = 4.2 + Math.random() * 4.5;
          this.artifacts.push({
            id: 'art_' + idx + '_' + Math.floor(Math.random() * 9999),
            artId,
            x: Math.max(-145, Math.min(145, c.x + Math.cos(aAng) * aDist)),
            z: Math.max(-145, Math.min(145, c.z + Math.sin(aAng) * aDist)),
            revealed: false,
            collected: false,
            bob: Math.random() * 6.28
          });
        }
      });
    }

    updateAtmosphere(dt, emissionState) {
      // Dynamic Day/Night cycle (1 game hour = ~22 real seconds)
      this.timeOfDay = (this.timeOfDay + dt / 22) % 24;
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const w = ['overcast', 'rain', 'fog'];
        this.weather = w[Math.floor(Math.random() * w.length)];
        this.weatherTimer = 70 + Math.random() * 70;
      }

      const dayPhase = Math.max(0, Math.sin((this.timeOfDay - 6) / 24 * Math.PI * 2));
      const sunAngle = (this.timeOfDay / 24) * Math.PI * 2 - Math.PI * 0.5;
      this.engine.sunDir = [Math.cos(sunAngle) * 0.6, Math.max(0.25, Math.sin(sunAngle)), 0.35];

      // Base gloomy Chernobyl palette
      let skyR = 0.08 + dayPhase * 0.24;
      let skyG = 0.10 + dayPhase * 0.28;
      let skyB = 0.11 + dayPhase * 0.26;
      let fogD = this.weather === 'fog' ? 0.024 : (this.weather === 'rain' ? 0.019 : 0.0135);

      let ambR = 0.16 + dayPhase * 0.30;
      let ambG = 0.18 + dayPhase * 0.32;
      let ambB = 0.20 + dayPhase * 0.30;
      let sunR = 0.15 + dayPhase * 0.72;
      let sunG = 0.16 + dayPhase * 0.70;
      let sunB = 0.18 + dayPhase * 0.62;

      // Emission crimson storm override!
      if (emissionState.phase === 'warning' || emissionState.phase === 'active') {
        const k = emissionState.intensity;
        const flash = emissionState.lightningFlash || 0;
        skyR = skyR * (1 - k) + (0.62 + flash * 0.35) * k;
        skyG = skyG * (1 - k) + (0.08 + flash * 0.25) * k;
        skyB = skyB * (1 - k) + (0.07 + flash * 0.2) * k;
        ambR = ambR * (1 - k) + 0.58 * k;
        ambG = ambG * (1 - k) + 0.14 * k;
        ambB = ambB * (1 - k) + 0.12 * k;
        fogD = Math.max(fogD, 0.018 + k * 0.016);
      }

      this.engine.skyColor = [skyR, skyG, skyB];
      this.engine.fogColor = [skyR, skyG, skyB];
      this.engine.fogDensity = fogD;
      this.engine.ambient = [ambR, ambG, ambB];
      this.engine.sunColor = [sunR, sunG, sunB];
    }

    getFormattedClock() {
      const h = Math.floor(this.timeOfDay);
      const m = Math.floor((this.timeOfDay - h) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    getWeatherLabel(emissionPhase) {
      if (emissionPhase === 'active') return 'ВЫБРОС!';
      if (emissionPhase === 'warning') return 'ШТОРМ';
      if (this.weather === 'rain') return 'ДОЖДЬ';
      if (this.weather === 'fog') return 'ТУМАН';
      return 'ПАСМУРНО';
    }
  }

  return { World };
})();
