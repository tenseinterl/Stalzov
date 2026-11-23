// STALZONE Expanded 520x520m Twilight Swamps World (Stalker Bar, Bandit Depot, Junkyard, NII, Duga Radar & World Stashes)
window.ZoneWorld = (function () {
  class World {
    constructor(engine) {
      this.engine = engine;
      this.worldHalfSize = 256;
      this.safeZones = {
        stalker: { x: 0, z: 0, radius: 24, name: 'БАР [СЕЙВ-ЗОНА]' },
        bandit:  { x: -145, z: 78, radius: 24, name: 'ДЕПО [СЕЙВ-ЗОНА]' }
      };
      this.safeCenter = this.safeZones.stalker;
      this.npcs = [];
      this.staticLights = [];
      this.campfires = [];
      this.worldStashes = [];
      this.anomalies = [];
      this.artifacts = [];
      this.contamZones = [];
      this.spots = [];
      this.protoAnomalies = [];
      this.swampPools = [
        { x: -45, z: 58, w: 46, d: 38 },
        { x: -78, z: 112, w: 54, d: 42 },
        { x: -24, z: 148, w: 44, d: 36 },
        { x: 56, z: 122, w: 38, d: 32 },
        { x: 64, z: 36, w: 30, d: 26 },
        { x: -120, z: 175, w: 52, d: 40 },
        { x: 118, z: 162, w: 48, d: 36 },
        { x: -172, z: -22, w: 44, d: 34 }
      ];
      this.timeOfDay = 18.4;
      this.weather = 'rain';
      this.weatherTimer = 110;
      this.build();
    }

    getHeight(x, z) {
      const distBar = Math.hypot(x, z);
      const distDepot = Math.hypot(x + 145, z - 78);
      const barFlat = Math.max(0, Math.min(1, (distBar - 28) / 14));
      const depotFlat = Math.max(0, Math.min(1, (distDepot - 28) / 14));
      const roadFlat = Math.max(0, Math.min(1, (Math.abs(x) - 8.5) / 8.0));
      const northPad = (z < -48 && z > -145 && Math.abs(x) < 80) ? 0.14 : 1.0;
      const radarPad = (z < -175 && Math.abs(x) < 42) ? 0.12 : 1.0;

      let h = (
        Math.sin(x * 0.036) * Math.cos(z * 0.032) * 2.9 +
        Math.sin(x * 0.085 + z * 0.064) * 1.05 +
        Math.cos(x * 0.021 - z * 0.044) * 1.9
      ) * barFlat * depotFlat * roadFlat * northPad * radarPad;

      for (const s of this.swampPools) {
        const dx = (x - s.x) / (s.w * 0.55);
        const dz = (z - s.z) / (s.d * 0.55);
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.2) h = Math.min(h, -0.58 * (1 - d2 / 1.2));
      }
      return h;
    }

    isSafeZone(x, z, faction = null) {
      if (faction && this.safeZones[faction]) {
        const s = this.safeZones[faction];
        return Math.hypot(x - s.x, z - s.z) <= s.radius;
      }
      return this.isAnySafeZone(x, z);
    }

    isAnySafeZone(x, z) {
      const sb = this.safeZones.stalker;
      const bb = this.safeZones.bandit;
      return (Math.hypot(x - sb.x, z - sb.z) <= sb.radius) || (Math.hypot(x - bb.x, z - bb.z) <= bb.radius);
    }

    getRegionName(x, z, faction = 'stalker') {
      const sb = this.safeZones.stalker;
      const bb = this.safeZones.bandit;
      if (Math.hypot(x - sb.x, z - sb.z) <= sb.radius) {
        return faction === 'stalker' ? 'БАР [СЕЙВ-ЗОНА]' : 'БАР [ВРАЖ. БАЗА]';
      }
      if (Math.hypot(x - bb.x, z - bb.z) <= bb.radius) {
        return faction === 'bandit' ? 'ДЕПО [СЕЙВ-ЗОНА]' : 'ДЕПО [БАЗА БАНД.]';
      }
      if (z < -165) return 'ДАЛЬНИЙ СЕВЕР • РЛС «ДУГА»';
      if (z < -30) return x > 20 ? 'СЕВЕР • НИИ «АГРОПРОМ»' : 'СЕВЕР • ПРОМЗОНА';
      if (x > 90) return 'ВОСТОК • СВАЛКА ТЕХНИКИ';
      if (x < -95 && z > 20) return 'ЮГО-ЗАПАД • БОЛОТНОЕ ДЕПО';
      if (z > 130) return 'ЮГ • ЗАТОПЛЕННАЯ ДЕРЕВНЯ';
      if (z > 24) return x < -15 ? 'ЮГ • МРАЧНЫЕ БОЛОТА' : 'ЮГ • ОКРАИНЫ';
      return 'СУМЕРЕЧНЫЙ КОРДОН';
    }

    isInSwamp(x, z) {
      if (this.getHeight(x, z) < -0.18) return true;
      for (const s of this.swampPools) {
        if (Math.abs(x - s.x) < s.w * 0.5 && Math.abs(z - s.z) < s.d * 0.5) return true;
      }
      return false;
    }

    build() {
      const E = this.engine;
      E.beginStaticBuild();

      // === 1. EXPANDED 520x520m HEIGHTMAP TERRAIN ===
      E.addTerrainGrid(520, 6.5, (x, z) => this.getHeight(x, z), (x, y, z) => {
        if (Math.abs(x) < 5.5) return [0.56, 0.56, 0.54];
        if (y < -0.12) return [0.44, 0.53, 0.43];
        if (y > 1.7) return [0.84, 0.72, 0.52];
        if (z < -165) return [0.52, 0.54, 0.58];
        if (z < -30) return [0.62, 0.63, 0.59];
        if (x > 90) return [0.68, 0.62, 0.50];
        return [0.73, 0.71, 0.55];
      });

      for (const s of this.swampPools) {
        E.addStaticBox(s.x, -0.24, s.z, s.w, 0.08, s.d, 'swamp', {
          tile: 6, solid: false, tint: [0.64, 0.82, 0.74, 0.84], spec: 0.75, noAO: true, polyOffset: true
        });
      }

      // Split asphalt highway cleanly around Bar courtyard (zero slab overlap / Z-fighting!)
      E.addStaticBox(0, 0.06, -135, 9.0, 0.08, 224, 'asphalt', { tile: 5, solid: false, spec: 0.35, noAO: true, polyOffset: true });
      E.addStaticBox(0, 0.06,  135, 9.0, 0.08, 224, 'asphalt', { tile: 5, solid: false, spec: 0.35, noAO: true, polyOffset: true });
      E.addStaticBox(0, 0.08, 0, 43.2, 0.10, 43.2, 'concrete', { tile: 4, solid: false, spec: 0.22, noAO: true, polyOffset: true });
      E.addStaticBox(-145, 0.08, 78, 43.2, 0.10, 43.2, 'concrete', { tile: 4, solid: false, spec: 0.22, noAO: true, polyOffset: true });

      this._buildRailway(-235, 235, -34);
      this._buildRailway(-230, -10, 52);

      const pylons = [
        [-48, -32], [58, -32], [-62, 42], [68, 78], [-110, -32], [145, -32],
        [-160, 140], [150, 120], [-80, -155], [80, -155], [165, -90]
      ];
      for (const p of pylons) this._buildPowerPylon(p[0], p[1]);

      // === 2. BOTH FACTION BASES (STALKER BAR & BANDIT DEPOT) ===
      this._buildBarBase();
      this._buildBanditDepotBase();

      // === 3. SOUTH SWAMPS & FLOODED VILLAGE ===
      this._buildHouse(34, 54, 12, 5.0, 10, 'brick', 'south');
      this._buildHouse(58, 66, 11, 4.8, 9, 'wood', 'west');
      this._buildHouse(42, 86, 13, 5.2, 10, 'brick', 'north');
      this._buildHouse(-18, 168, 14, 5.5, 11, 'wood', 'north');
      this._buildHouse(24, 182, 12, 5.0, 10, 'brick', 'west');
      this._buildHouse(-66, 178, 15, 6.4, 12, 'brick', 'east');
      this._buildGarage(-22, 46, 9, 4.0, 12);
      this._buildGarage(-34, 46, 9, 4.0, 12);
      this._buildWatchtower(-14, 72);
      this._buildWatchtower(72, 46);
      this._buildWatchtower(-46, 148);
      this._buildWatchtower(44, 155);
      this._buildDetailedTruck(12, 48, 0.35);
      this._buildDetailedBTR(-18, 86, -0.5);
      this._buildDetailedTruck(26, 105, 1.1);
      this._buildDetailedTruck(-84, 142, 0.65);
      this._buildDetailedBTR(12, 158, -0.35);
      this._buildCampfire(-28, 60);
      this._buildCampfire(10, 172);

      // === 4. EAST VEHICLE JUNKYARD ===
      this._buildIndustrialHall(154, 24, 26, 8.2, 20);
      this._buildHouse(148, -18, 14, 5.2, 12, 'concrete', 'west');
      this._buildHouse(182, 86, 13, 5.0, 11, 'brick', 'west');
      this._buildWatchtower(112, 18);
      this._buildWatchtower(195, 42);
      this._buildDetailedBTR(124, 34, 0.7);
      this._buildDetailedBTR(138, 62, -0.4);
      this._buildDetailedTruck(166, -4, 1.2);
      this._buildDetailedTruck(132, 92, 0.2);
      this._buildDetailedTruck(198, -28, -0.8);
      this._buildCampfire(136, 14);

      // === 5. NORTH INDUSTRIAL + НИИ + FAR NORTH РЛС «ДУГА» ===
      this._buildIndustrialHall(-38, -78, 34, 9.5, 26);
      this._buildHouse(46, -78, 26, 7.8, 22, 'concrete', 'south');
      this._buildHouse(46, -108, 18, 6.8, 14, 'concrete', 'south');
      this._buildSilo(-64, -102, 10, 18);
      this._buildSilo(-48, -110, 8, 15);
      this._buildGarage(14, -52, 10, 4.4, 14);
      this._buildWatchtower(-12, -48);
      this._buildWatchtower(18, -96);
      this._buildWatchtower(-112, -88);
      this._buildWatchtower(128, -118);
      this._buildHouse(-134, -92, 18, 6.2, 14, 'concrete', 'east');
      this._buildDetailedBTR(-8, -66, 0.25);
      this._buildDetailedTruck(24, -76, -0.8);
      this._buildDetailedBTR(-96, -115, 0.5);
      this._buildCampfire(16, -60);

      this._buildDugaRadar(0, -206);
      this._buildHouse(-32, -184, 16, 5.6, 12, 'concrete', 'east');
      this._buildDetailedBTR(26, -182, -0.55);
      this._buildCampfire(-14, -176);

      for (let i = 0; i < 6; i++) {
        const bx = -14 + i * 6;
        E.addStaticBox(bx, this.getHeight(bx, 32) + 0.9, 32, 3.8, 1.8, 0.65, 'concrete', { tile: 2 });
      }
      this._buildBarbedWire(16, 66, 16);
      this._buildBarbedWire(-54, 44, 18);
      this._buildBarbedWire(112, 48, 22);
      this._buildBarbedWire(0, -158, 28);

      const B = this.worldHalfSize;
      E.addStaticBox(0, 4, -B, B * 2 + 4, 10, 2, 'concrete', { tile: 4 });
      E.addStaticBox(0, 4, B, B * 2 + 4, 10, 2, 'concrete', { tile: 4 });
      E.addStaticBox(-B, 4, 0, 2, 10, B * 2 + 4, 'concrete', { tile: 4 });
      E.addStaticBox(B, 4, 0, 2, 10, B * 2 + 4, 'concrete', { tile: 4 });

      // === 6. 78 GNARLED TREES ===
      let seed = 1337;
      const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      let placedTrees = 0;
      for (let tries = 0; tries < 240 && placedTrees < 78; tries++) {
        const tx = (rand() - 0.5) * 460;
        const tz = (rand() - 0.5) * 460;
        if (Math.hypot(tx, tz) < 30 || Math.hypot(tx + 145, tz - 78) < 30) continue;
        if (Math.abs(tx) < 11 || Math.abs(tz + 34) < 7) continue;
        if (tz < -172 && Math.abs(tx) < 42) continue;
        this._buildGnarledTree(tx, tz, 5.8 + (placedTrees % 4) * 1.6, placedTrees % 3 === 0);
        placedTrees++;
      }

      const coverSpots = [
        [8, 36], [-8, 56], [7, 78], [-7, 98], [8, -42], [-8, -62], [8, -88], [-16, -98],
        [26, -58], [104, 24], [-102, 78], [14, 142], [-18, -148], [62, -142], [-96, -42]
      ];
      for (const c of coverSpots) {
        const gy = this.getHeight(c[0], c[1]);
        E.addStaticBox(c[0], gy + 0.85, c[1], 3.2, 1.7, 1.0, 'concrete', { tile: 2 });
        E.addStaticBox(c[0] + 1.8, gy + 0.45, c[1] + 0.5, 0.9, 0.9, 0.9, 'crate', { tile: 1 });
      }

      // === 7. 1350 REALISTIC SWAYING GRASS TUFTS (Clustered naturally around swamps & meadows) ===
      for (let i = 0; i < 1350; i++) {
        const gx = (rand() - 0.5) * 470;
        const gz = (rand() - 0.5) * 470;
        if (Math.hypot(gx, gz) < 23.5 || Math.hypot(gx + 145, gz - 78) < 23.5) continue;
        if (Math.abs(gx) < 6.4) continue;
        const gy = this.getHeight(gx, gz);
        if (gy < -0.22) continue;
        const w = 1.2 + rand() * 1.1;
        const h = (gy < 0.15 ? 1.15 : 0.70) + rand() * 0.55;
        E.addGrassTuft(gx, gy, gz, w, h);
      }

      E.finishStaticBuild();

      this._initContaminationZones();
      this._initSpotsAndProto();
      this._initWorldStashes();
      this.respawnAnomaliesAndArtifacts();
    }

    _buildBarBase() {
      const E = this.engine;
      // Non-overlapping corner walls (side walls trimmed to 42.7m so zero corner Z-fighting!)
      E.addStaticBox(-13.3, 2.2, 22, 18.6, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(13.3,  2.2, 22, 18.6, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(-13.3, 2.2, -22, 18.6, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(13.3,  2.2, -22, 18.6, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(-22, 2.2, 0, 1.2, 4.4, 42.7, 'concrete', { tile: 3 });
      E.addStaticBox(22,  2.2, 0, 1.2, 4.4, 42.7, 'concrete', { tile: 3 });
      E.addStaticBox(0, 4.6, 22, 10, 0.75, 1.48, 'hazard', { tile: 2 });
      E.addStaticBox(0, 4.6, -22, 10, 0.75, 1.48, 'hazard', { tile: 2 });

      this._buildHouse(-11, -3, 14, 5.2, 18, 'brick', 'east');
      for (const p of [[0.5, -5.5], [11.5, -5.5], [0.5, 6.5], [11.5, 6.5]]) {
        E.addStaticBox(p[0], 2.1, p[1], 0.18, 4.2, 0.18, 'rust', { tile: 1, spec: 0.4 });
      }
      E.addStaticBox(6.0, 4.15, 0.5, 11.8, 0.08, 12.8, 'camo_net', {
        tile: 2.5, solid: false, isRoof: true, doubleSided: true, noAO: true
      });

      this._buildDetailedTruck(11.2, 1.5, -0.35);
      E.addStaticBox(2.2, 0.45, -1.6, 1.0, 0.9, 1.0, 'crate', { tile: 1, ry: 0.15 });
      E.addStaticBox(1.1, 0.45, -1.4, 0.9, 0.9, 0.9, 'crate', { tile: 1, ry: -0.1 });
      E.addStaticBox(1.8, 1.25, -1.5, 0.8, 0.7, 0.8, 'crate', { tile: 1, ry: 0.4 });
      E.addStaticBox(6.6, 0.35, 5.8, 1.1, 0.7, 1.1, 'asphalt', { tile: 1, tint: [0.22, 0.23, 0.24, 1] });

      this._buildCampfire(4.6, 2.2);
      this.staticLights.push({ x: -10, y: 4.2, z: -3, r: 19, cr: 1.3, cg: 0.95, cb: 0.55 });
      this.staticLights.push({ x: 0, y: 4.3, z: -20, r: 17, cr: 1.0, cg: 0.86, cb: 0.48 });
      this.staticLights.push({ x: 0, y: 4.3, z: 20, r: 17, cr: 1.0, cg: 0.86, cb: 0.48 });

      E.addStaticBox(7.2, 0.55, -3.2, 1.5, 1.0, 0.95, 'crate', { tile: 1.2, tint: [0.62, 0.92, 0.62, 1], spec: 0.3 });
      E.addStaticBox(-14.5, 0.6, -3, 1.4, 1.2, 10, 'wood', { tile: 2 });

      this.npcs.push(
        { id: 'trader',   faction: 'stalker', name: 'Торговец «Сидорыч»', role: 'Патроны, медицина, обвесы', x: -13.0, z: -6.5, color: [0.52, 0.62, 0.40, 1], visor: [0.55, 0.95, 0.55, 1] },
        { id: 'barter',   faction: 'stalker', name: 'Бартерщик «Кузнец»', role: 'Ветки бартера брони и оружия', x: -13.0, z: -2.2, color: [0.36, 0.62, 0.42, 1], visor: [0.45, 0.95, 0.65, 1] },
        { id: 'mechanic', faction: 'stalker', name: 'Механик «Азот»',     role: 'Заточка снаряжения (+1..+15)', x: -13.0, z: 2.2,  color: [0.38, 0.55, 0.68, 1], visor: [0.35, 0.85, 1.0, 1] },
        { id: 'fence',    faction: 'stalker', name: 'Скупщик «Барыга»',   role: 'Скупка артефактов и трофеев', x: 3.2,   z: 4.2,  color: [0.58, 0.52, 0.38, 1], visor: [1.0, 0.72, 0.25, 1] },
        { id: 'stash',    faction: 'stalker', name: 'Личный Схрон',       role: 'Безопасное хранилище', x: 7.2,   z: -3.2, color: [0.45, 0.95, 0.55, 1], isBox: true }
      );
    }

    _buildBanditDepotBase() {
      const E = this.engine;
      const cx = -145, cz = 78;
      E.addStaticBox(cx, 2.2, cz + 22, 45.2, 4.4, 1.2, 'rust', { tile: 3 });
      E.addStaticBox(cx - 22, 2.2, cz, 1.2, 4.4, 42.7, 'rust', { tile: 3 });
      E.addStaticBox(cx - 13.3, 2.2, cz - 22, 18.6, 4.4, 1.2, 'rust', { tile: 3 });
      E.addStaticBox(cx + 13.3, 2.2, cz - 22, 18.6, 4.4, 1.2, 'rust', { tile: 3 });
      E.addStaticBox(cx + 22, 2.2, cz - 13.0, 1.2, 4.4, 16.7, 'rust', { tile: 3 });
      E.addStaticBox(cx + 22, 2.2, cz + 13.0, 1.2, 4.4, 16.7, 'rust', { tile: 3 });
      E.addStaticBox(cx, 4.6, cz - 22, 10, 0.75, 1.48, 'hazard', { tile: 2 });
      E.addStaticBox(cx + 22, 4.6, cz, 1.48, 0.75, 10, 'hazard', { tile: 2 });

      this._buildHouse(cx - 10, cz - 2, 15, 5.8, 18, 'rust', 'east');
      for (const p of [[cx + 1, cz - 5], [cx + 11, cz - 5], [cx + 1, cz + 7], [cx + 11, cz + 7]]) {
        E.addStaticBox(p[0], 2.1, p[1], 0.18, 4.2, 0.18, 'rust', { tile: 1 });
      }
      E.addStaticBox(cx + 6, 4.15, cz + 1, 11, 0.08, 12.5, 'camo_net', {
        tile: 2.5, solid: false, isRoof: true, doubleSided: true, noAO: true
      });
      this._buildDetailedTruck(cx + 11.5, cz + 1.5, 0.25);
      this._buildCampfire(cx + 4.8, cz + 2.2);
      E.addStaticBox(cx + 7.2, 0.55, cz - 3.2, 1.5, 1.0, 0.95, 'crate', { tile: 1.2, tint: [0.95, 0.65, 0.42, 1] });
      this.staticLights.push({ x: cx - 10, y: 4.5, z: cz - 2, r: 20, cr: 1.4, cg: 0.72, cb: 0.35 });

      this.npcs.push(
        { id: 'trader',   faction: 'bandit', name: 'Торговец «Хмурый»',  role: 'Патроны, медицина, обвесы', x: cx - 12.5, z: cz - 6.2, color: [0.26, 0.26, 0.29, 1], visor: [1.0, 0.52, 0.22, 1] },
        { id: 'barter',   faction: 'bandit', name: 'Бартерщик «Лом»',    role: 'Ветки бартера брони и оружия', x: cx - 12.5, z: cz - 1.8, color: [0.30, 0.25, 0.25, 1], visor: [1.0, 0.42, 0.25, 1] },
        { id: 'mechanic', faction: 'bandit', name: 'Механик «Болт»',     role: 'Заточка снаряжения (+1..+15)', x: cx - 12.5, z: cz + 2.6, color: [0.24, 0.29, 0.34, 1], visor: [0.45, 0.85, 1.0, 1] },
        { id: 'fence',    faction: 'bandit', name: 'Скупщик «Фартовый»', role: 'Скупка артефактов и трофеев', x: cx + 3.0,  z: cz + 4.4, color: [0.32, 0.27, 0.24, 1], visor: [1.0, 0.72, 0.22, 1] },
        { id: 'stash',    faction: 'bandit', name: 'Личный Схрон',       role: 'Безопасное хранилище', x: cx + 7.2,  z: cz - 3.2, color: [0.95, 0.65, 0.35, 1], isBox: true }
      );
    }

    _buildDugaRadar(cx, cz) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      for (let x = -28; x <= 28; x += 14) {
        E.addStaticBox(cx + x, gy + 13, cz, 1.1, 26, 1.1, 'rust', { tile: 4, spec: 0.45 });
        E.addStaticBox(cx + x, gy + 13, cz - 4, 0.8, 26, 0.8, 'rust', { tile: 4 });
      }
      for (let h = 6; h <= 24; h += 6) {
        E.addStaticBox(cx, gy + h, cz, 58, 0.7, 0.7, 'rust', { tile: 6, solid: false, spec: 0.45 });
        E.addStaticBox(cx, gy + h, cz - 4, 58, 0.5, 0.5, 'rust', { tile: 6, solid: false });
      }
      E.addStaticBox(cx, gy + 1.4, cz + 6, 16, 2.8, 8, 'concrete', { tile: 3 });
      this.staticLights.push({ x: cx, y: gy + 26.5, z: cz, r: 34, cr: 1.8, cg: 0.25, cb: 0.22, flicker: true });
    }

    _buildCampfire(x, z) {
      const E = this.engine;
      const y = this.getHeight(x, z);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        E.addStaticBox(x + Math.cos(a) * 0.65, y + 0.14, z + Math.sin(a) * 0.65, 0.36, 0.28, 0.36, 'concrete', { tile: 1, ry: a });
      }
      E.addStaticBox(x, y + 0.2, z, 0.95, 0.22, 0.22, 'bark', { tile: 1, ry: 0.4 });
      E.addStaticBox(x, y + 0.24, z, 0.95, 0.22, 0.22, 'bark', { tile: 1, ry: -0.9 });
      E.addStaticBox(x, y + 0.16, z, 0.55, 0.18, 0.55, 'white', { tile: 1, tint: [1.0, 0.45, 0.08, 1], emissive: 1.4, solid: false });
      this.campfires.push({ x, y, z });
      this.staticLights.push({ x, y: y + 1.45, z, r: 22, cr: 1.9, cg: 0.88, cb: 0.28, flicker: true });
    }

    _buildDetailedTruck(cx, cz, ry = 0) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const place = (lx, ly, lz, sx, syz, sz, tex, tint, spec = 0.38, solid = true) => {
        const wx = cx + lx * cy + lz * sy;
        const wz = cz - lx * sy + lz * cy;
        E.addStaticBox(wx, gy + ly, wz, sx, syz, sz, tex, { tile: 2.2, tint, ry, spec, solid });
      };
      const oliveRust = [0.66, 0.62, 0.46, 1];
      const darkTire = [0.16, 0.17, 0.18, 1];
      place(0, 0.68, 0, 2.2, 0.32, 6.2, 'rust', [0.42, 0.35, 0.3, 1], 0.45);
      place(0, 1.32, 2.25, 1.95, 0.95, 1.7, 'rust', oliveRust, 0.5);
      place(0, 1.85, 0.85, 2.25, 1.55, 1.55, 'rust', oliveRust, 0.45);
      place(0, 2.02, 1.64, 1.9, 0.65, 0.08, 'gunmetal', [0.35, 0.44, 0.46, 0.85], 0.9, false);
      place(0, 1.55, -1.45, 2.45, 1.15, 3.3, 'wood', [0.68, 0.64, 0.5, 1], 0.15);
      place(-0.7, 1.25, 3.12, 0.28, 0.28, 0.1, 'white', [0.95, 0.9, 0.72, 1], 0.8, false);
      place(0.7, 1.25, 3.12, 0.28, 0.28, 0.1, 'white', [0.95, 0.9, 0.72, 1], 0.8, false);
      for (const wz of [2.1, -0.9, -2.2]) {
        place(-1.22, 0.58, wz, 0.44, 1.12, 1.12, 'asphalt', darkTire, 0.22);
        place(1.22, 0.58, wz, 0.44, 1.12, 1.12, 'asphalt', darkTire, 0.22);
      }
    }

    _buildDetailedBTR(cx, cz, ry = 0) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const place = (lx, ly, lz, sx, syz, sz, tex, tint, spec = 0.45) => {
        const wx = cx + lx * cy + lz * sy;
        const wz = cz - lx * sy + lz * cy;
        E.addStaticBox(wx, gy + ly, wz, sx, syz, sz, tex, { tile: 2.5, tint, ry, spec });
      };
      place(0, 1.15, 0, 2.9, 1.35, 6.6, 'rust', [0.46, 0.54, 0.42, 1], 0.5);
      place(0, 2.1, -0.5, 1.65, 0.75, 1.85, 'rust', [0.38, 0.46, 0.36, 1], 0.55);
      place(0, 2.15, 1.5, 0.18, 0.18, 2.5, 'gunmetal', [0.3, 0.32, 0.34, 1], 0.7);
      for (const wz of [2.1, 0.7, -0.8, -2.2]) {
        place(-1.5, 0.55, wz, 0.42, 1.05, 1.05, 'asphalt', [0.15, 0.16, 0.17, 1], 0.2);
        place(1.5, 0.55, wz, 0.42, 1.05, 1.05, 'asphalt', [0.15, 0.16, 0.17, 1], 0.2);
      }
    }

    _buildGnarledTree(cx, cz, h, isDead) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      E.addStaticBox(cx, gy + h * 0.25, cz, 0.68, h * 0.55, 0.68, 'bark', { tile: 2 });
      E.addStaticBox(cx + 0.18, gy + h * 0.65, cz - 0.12, 0.5, h * 0.48, 0.5, 'bark', { tile: 2, ry: 0.3 });
      const limbs = [
        [1.1, h * 0.72, 0.4, 2.2, 0.26, 0.28, 0.35],
        [-1.0, h * 0.82, -0.5, 2.0, 0.24, 0.26, -0.5],
        [0.4, h * 0.92, -1.0, 0.24, 0.24, 2.1, 0.2],
        [-0.5, h * 0.98, 0.9, 0.22, 0.22, 1.8, -0.3]
      ];
      for (const l of limbs) E.addStaticBox(cx + l[0], gy + l[1], cz + l[2], l[3], l[4], l[5], 'bark', { tile: 1.5, ry: l[6], solid: false });
      if (!isDead) {
        E.addStaticBox(cx + 0.6, gy + h * 0.88, cz + 0.2, 3.8, 2.5, 3.8, 'leaves', { tile: 1.5, solid: false, doubleSided: true, wind: 0.05 });
        E.addStaticBox(cx - 0.8, gy + h * 1.06, cz - 0.4, 3.0, 2.1, 3.0, 'leaves', { tile: 1.5, solid: false, doubleSided: true, wind: 0.06 });
      }
    }

    _buildRailway(xStart, xEnd, z) {
      const E = this.engine;
      const len = xEnd - xStart;
      const cx = (xStart + xEnd) * 0.5;
      const gy = this.getHeight(0, z);
      E.addStaticBox(cx, gy + 0.14, z - 0.75, len, 0.14, 0.12, 'gunmetal', { tile: 4, solid: false, spec: 0.75 });
      E.addStaticBox(cx, gy + 0.14, z + 0.75, len, 0.14, 0.12, 'gunmetal', { tile: 4, solid: false, spec: 0.75 });
      for (let x = xStart; x <= xEnd; x += 3.0) {
        E.addStaticBox(x, this.getHeight(x, z) + 0.06, z, 0.35, 0.12, 2.3, 'wood', { tile: 1, solid: false });
      }
    }

    _buildPowerPylon(cx, cz) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      for (const p of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
        E.addStaticBox(cx + p[0], gy + 9.0, cz + p[1], 0.34, 18, 0.34, 'rust', { tile: 3, spec: 0.4 });
      }
      E.addStaticBox(cx, gy + 14.5, cz, 9.5, 0.45, 0.45, 'rust', { tile: 2, solid: false });
      E.addStaticBox(cx, gy + 17.5, cz, 7.2, 0.45, 0.45, 'rust', { tile: 2, solid: false });
    }

    _buildBarbedWire(cx, cz, len) {
      this.engine.addStaticBox(cx, this.getHeight(cx, cz) + 1.1, cz, len, 2.2, 0.25, 'wire', { tile: 2, solid: true, doubleSided: true });
    }

    _buildHouse(cx, cz, w, h, d, wallTex, doorSide) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      const t = 0.6, doorW = 3.2;
      // Foundation sits cleanly below walls (no coplanar top overlap)
      E.addStaticBox(cx, gy - 0.68, cz, w + 0.7, 1.32, d + 0.7, 'concrete', { tile: 3, solid: false });
      // Roof rests cleanly on top of walls
      E.addStaticBox(cx, gy + h + 0.34, cz, w + 1.0, 0.64, d + 1.0, 'roof', { tile: 3, isRoof: true, solid: true, spec: 0.3 });

      // Inner trimmed length for E/W walls eliminates ALL corner Z-fighting!
      const innerD = Math.max(doorW + 0.8, d - t - 0.04);

      const buildWallWithDoor = (isX, pos, len) => {
        const seg = (len - doorW) * 0.5;
        if (isX) {
          E.addStaticBox(cx - (doorW + seg) * 0.5, gy + h * 0.5, pos, seg - 0.02, h, t, wallTex, { tile: 3 });
          E.addStaticBox(cx + (doorW + seg) * 0.5, gy + h * 0.5, pos, seg - 0.02, h, t, wallTex, { tile: 3 });
          E.addStaticBox(cx, gy + h - 0.85, pos, doorW, 1.68, t - 0.04, wallTex, { tile: 3 });
        } else {
          E.addStaticBox(pos, gy + h * 0.5, cz - (doorW + seg) * 0.5, t, h, seg - 0.02, wallTex, { tile: 3 });
          E.addStaticBox(pos, gy + h * 0.5, cz + (doorW + seg) * 0.5, t, h, seg - 0.02, wallTex, { tile: 3 });
          E.addStaticBox(pos, gy + h - 0.85, cz, t - 0.04, 1.68, doorW, wallTex, { tile: 3 });
        }
      };

      if (doorSide === 'north') buildWallWithDoor(true, cz - d * 0.5, w + t);
      else E.addStaticBox(cx, gy + h * 0.5, cz - d * 0.5, w + t, h, t, wallTex, { tile: 3 });
      if (doorSide === 'south') buildWallWithDoor(true, cz + d * 0.5, w + t);
      else E.addStaticBox(cx, gy + h * 0.5, cz + d * 0.5, w + t, h, t, wallTex, { tile: 3 });
      if (doorSide === 'east') buildWallWithDoor(false, cx + w * 0.5, innerD);
      else E.addStaticBox(cx + w * 0.5, gy + h * 0.5, cz, t, h, innerD, wallTex, { tile: 3 });
      if (doorSide === 'west') buildWallWithDoor(false, cx - w * 0.5, innerD);
      else E.addStaticBox(cx - w * 0.5, gy + h * 0.5, cz, t, h, innerD, wallTex, { tile: 3 });
    }

    _buildIndustrialHall(cx, cz, w, h, d) {
      this._buildHouse(cx, cz, w, h, d, 'concrete', 'south');
      const gy = this.getHeight(cx, cz);
      this.engine.addStaticBox(cx - 6, gy + h * 0.5, cz, 1.4, h - 0.06, 1.4, 'rust', { tile: 2, spec: 0.4 });
      this.engine.addStaticBox(cx + 6, gy + h * 0.5, cz, 1.4, h - 0.06, 1.4, 'rust', { tile: 2, spec: 0.4 });
      this.engine.addStaticBox(cx, gy + 1.1, cz - 4, 8, 2.2, 2.2, 'hazard', { tile: 2 });
      this.staticLights.push({ x: cx, y: gy + h - 1.5, z: cz, r: 24, cr: 0.85, cg: 0.96, cb: 0.98 });
    }

    _buildGarage(cx, cz, w, h, d) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      E.addStaticBox(cx, gy + h + 0.24, cz, w + 0.5, 0.42, d + 0.5, 'roof', { tile: 2.5, isRoof: true });
      E.addStaticBox(cx - w * 0.5, gy + h * 0.5, cz + 0.22, 0.4, h, d - 0.44, 'rust', { tile: 2.5, spec: 0.35 });
      E.addStaticBox(cx + w * 0.5, gy + h * 0.5, cz + 0.22, 0.4, h, d - 0.44, 'rust', { tile: 2.5, spec: 0.35 });
      E.addStaticBox(cx, gy + h * 0.5, cz - d * 0.5, w + 0.4, h, 0.4, 'rust', { tile: 2.5, spec: 0.35 });
    }

    _buildWatchtower(cx, cz) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      for (const p of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
        E.addStaticBox(cx + p[0], gy + 4.0, cz + p[1], 0.42, 8.0, 0.42, 'wood', { tile: 2 });
      }
      E.addStaticBox(cx, gy + 6.2, cz, 4.2, 0.4, 4.2, 'wood', { tile: 2 });
      E.addStaticBox(cx, gy + 8.2, cz, 4.6, 0.35, 4.6, 'roof', { tile: 2, isRoof: true });
    }

    _buildSilo(cx, cz, w, h) {
      const gy = this.getHeight(cx, cz);
      this.engine.addStaticBox(cx, gy + h * 0.5, cz, w, h, w, 'rust', { tile: 4, spec: 0.35 });
      this.engine.addStaticBox(cx, gy + h + 0.4, cz, w + 0.8, 0.8, w + 0.8, 'concrete', { tile: 3 });
    }

    _initWorldStashes() {
      const stashDefs = [
        { id: 'st_1', title: 'Ящик в деревне', x: 35, z: 54, tier: 1 },
        { id: 'st_2', title: 'Тайник у гаражей', x: -23, z: 45, tier: 1 },
        { id: 'st_3', title: 'Схрон на болотах', x: -65, z: 178, tier: 1 },
        { id: 'st_4', title: 'Сумка в затопленном доме', x: -17, z: 168, tier: 2 },
        { id: 'st_5', title: 'Военный ящик Свалки', x: 152, z: 22, tier: 2 },
        { id: 'st_6', title: 'Тайник БТР (Восток)', x: 127, z: 36, tier: 2 },
        { id: 'st_7', title: 'Сейф Промзоны', x: -38, z: -76, tier: 2 },
        { id: 'st_8', title: 'Контейнер НИИ', x: 46, z: -78, tier: 3 },
        { id: 'st_9', title: 'Армейский ящик НИИ', x: 46, z: -108, tier: 3 },
        { id: 'st_10', title: 'Секретный ящик РЛС «Дуга»', x: -31, z: -184, tier: 3 },
        { id: 'st_11', title: 'Ящик под антенной «Дуги»', x: 2, z: -199, tier: 3 },
        { id: 'st_12', title: 'Схрон Западной заставы', x: -133, z: -92, tier: 2 }
      ];
      this.worldStashes = stashDefs.map(d => ({
        ...d,
        y: this.getHeight(d.x, d.z),
        items: this._rollStashItems(d.tier)
      }));
    }

    _rollStashItems(tier) {
      const items = [];
      if (tier === 1) {
        items.push({ id: 'ammo_fmj', count: 30, slot: 0 }, { id: 'medkit', count: 1, slot: 1 }, { id: 'res_moss', count: 2, slot: 2 });
        if (Math.random() < 0.6) items.push({ id: 'bandage', count: 2, slot: 3 });
        if (Math.random() < 0.45) items.push({ id: 'res_root', count: 2, slot: 4 });
      } else if (tier === 2) {
        items.push({ id: 'ammo_ap', count: 30, slot: 0 }, { id: 'medkit', count: 2, slot: 1 }, { id: 'res_radio', count: 2, slot: 2 });
        if (Math.random() < 0.55) items.push({ id: 'tools', count: 1, slot: 3 });
        if (Math.random() < 0.5) items.push({ id: 'grenade', count: 2, slot: 4 });
      } else {
        items.push({ id: 'ammo_ap', count: 45, slot: 0 }, { id: 'res_data', count: 3, slot: 1 }, { id: 'tools', count: 1, slot: 2 });
        items.push({ id: 'medkit', count: 2, slot: 3 });
        if (Math.random() < 0.45) items.push({ id: Math.random() > 0.5 ? 'firefly' : 'flash', count: 1, slot: 4 });
      }
      return items;
    }

    refillWorldStashes() {
      for (const st of this.worldStashes) {
        if (st.items.length === 0) st.items = this._rollStashItems(st.tier);
      }
    }

    _initContaminationZones() {
      this.contamZones = [
        { x: -46, z: 60, radius: 22, type: 'bio', level: 1, name: 'Болотная топь (Био 1)' },
        { x: -78, z: 112, radius: 28, type: 'bio', level: 2, name: 'Кислотное болото (Био 2)' },
        { x: 24,  z: 74, radius: 18, type: 'rad', level: 1, name: 'Фонящая техника (Рад 1)' },
        { x: 138, z: 54, radius: 26, type: 'rad', level: 2, name: 'Могильник Свалки (Рад 2)' },
        { x: -56, z: -102, radius: 28, type: 'rad', level: 3, name: 'Могильник Промзоны (Рад 3)' },
        { x: -24, z: -64,  radius: 18, type: 'therm', level: 2, name: 'Термальный разлом (Термо 2)' },
        { x: 46,  z: -106, radius: 26, type: 'psy', level: 3, name: 'Антенна НИИ (Пси 3)' },
        { x: 74,  z: -66,  radius: 22, type: 'bio', level: 3, name: 'Хим-сброс НИИ (Био 3)' },
        { x: 0,   z: -206, radius: 34, type: 'psy', level: 3, name: 'Излучение РЛС «Дуга» (Пси 3)' }
      ];
    }

    _initSpotsAndProto() {
      this.spots = [
        { id: 'spot_s1', name: 'Логово псов (Болота)', x: -26, z: 64, tier: 1, kind: 'dogs', clearedCooldown: 0 },
        { id: 'spot_s2', name: 'Лежбище кабанов (Деревня)', x: 52, z: 96, tier: 1, kind: 'boars', clearedCooldown: 0 },
        { id: 'spot_s3', name: 'Застава бандитов (Болота)', x: -64, z: 78, tier: 1, kind: 'bandits', clearedCooldown: 0 },
        { id: 'spot_s4', name: 'Патруль сталкеров (Юг)', x: 24, z: 66, tier: 1, kind: 'stalkers', clearedCooldown: 0 },
        { id: 'spot_s5', name: 'Затопленная деревня (Псы)', x: -12, z: 162, tier: 1, kind: 'dogs', clearedCooldown: 0 },
        { id: 'spot_s6', name: 'Лагерь бандитов (Церковь)', x: -86, z: 165, tier: 2, kind: 'bandits', clearedCooldown: 0 },
        { id: 'spot_e1', name: 'Свалка: отряд сталкеров', x: 132, z: 22, tier: 2, kind: 'stalkers', clearedCooldown: 0 },
        { id: 'spot_e2', name: 'Свалка: налёт бандитов', x: 168, z: 48, tier: 2, kind: 'bandits', clearedCooldown: 0 },
        { id: 'spot_e3', name: 'Кабаны у Свалки', x: 135, z: 108, tier: 2, kind: 'boars', clearedCooldown: 0 },
        { id: 'spot_n1', name: 'Блокпост Севера (Бандиты)', x: -16, z: -56, tier: 2, kind: 'bandits', clearedCooldown: 0 },
        { id: 'spot_n2', name: 'Дозор сталкеров (НИИ)', x: 32, z: -64, tier: 2, kind: 'stalkers', clearedCooldown: 0 },
        { id: 'spot_n3', name: 'Охотничьи угодья Кровососа', x: 72, z: -96, tier: 3, kind: 'bloodsucker', clearedCooldown: 0 },
        { id: 'spot_n4', name: 'Отряд наёмников НИИ', x: 24, z: -122, tier: 3, kind: 'mercs', clearedCooldown: 0 },
        { id: 'spot_n5', name: 'Гарнизон РЛС «Дуга»', x: 8, z: -186, tier: 3, kind: 'mercs', clearedCooldown: 0 }
      ];
      this.protoAnomalies = [
        { id: 'proto_south', name: 'Протоаномалия (Южные болота)', x: -8, z: 122, tier: 1, active: false, progress: 0, cooldown: 0 },
        { id: 'proto_east',  name: 'Протоаномалия (Свалка)', x: 158, z: -48, tier: 2, active: false, progress: 0, cooldown: 0 },
        { id: 'proto_north', name: 'Протоаномалия (РЛС «Дуга»)', x: 12, z: -166, tier: 3, active: false, progress: 0, cooldown: 0 }
      ];
    }

    respawnAnomaliesAndArtifacts() {
      this.anomalies = [];
      this.artifacts = [];
      const types = ['electro', 'vortex', 'springboard', 'burner', 'acid'];
      const clusters = [
        { x: -18, z: 40, type: 'electro', tier: 1 },
        { x: 18,  z: 44, type: 'springboard', tier: 1 },
        { x: -40, z: 54, type: 'acid', tier: 1 },
        { x: 30,  z: 74, type: 'vortex', tier: 1 },
        { x: -12, z: 88, type: 'burner', tier: 1 },
        { x: -66, z: 108, type: 'acid', tier: 2 },
        { x: 64,  z: 102, type: 'electro', tier: 2 },
        { x: 122, z: 68, type: 'burner', tier: 2 },
        { x: 162, z: 12, type: 'electro', tier: 2 },
        { x: -20, z: -42, type: 'electro', tier: 2 },
        { x: 24,  z: -48, type: 'vortex', tier: 2 },
        { x: -24, z: -64, type: 'burner', tier: 3 },
        { x: -62, z: -78, type: 'vortex', tier: 3 },
        { x: 68,  z: -62, type: 'acid', tier: 3 },
        { x: 16,  z: -92, type: 'springboard', tier: 3 },
        { x: -16, z: -136, type: 'electro', tier: 3 },
        { x: 46,  z: -146, type: 'burner', tier: 3 },
        { x: -12, z: -194, type: 'electro', tier: 3 },
        { x: 26,  z: -202, type: 'vortex', tier: 3 }
      ];
      for (let i = 0; i < 25; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 36 + Math.random() * 190;
        const ax = Math.cos(ang) * dist, az = Math.sin(ang) * dist;
        if (this.isAnySafeZone(ax, az)) continue;
        clusters.push({
          x: ax, z: az,
          type: types[Math.floor(Math.random() * types.length)],
          tier: az < -30 ? 3 : (ax > 90 ? 2 : 1)
        });
      }
      const southArts = ['medusa', 'stone_blood', 'flash'];
      const northArts = ['flash', 'firefly', 'prism', 'snowflake'];

      clusters.forEach((c, idx) => {
        this.anomalies.push({
          id: 'anom_' + idx, x: c.x, z: c.z, type: c.type,
          radius: c.type === 'vortex' ? 4.4 : 3.2,
          cooldown: 0, dischargedUntil: 0, pulse: Math.random() * 6.28
        });
        if (idx % 2 === 0 || c.tier >= 3) {
          const pool = c.tier >= 3 ? northArts : southArts;
          const artId = pool[Math.floor(Math.random() * pool.length)];
          const aAng = Math.random() * Math.PI * 2;
          const aDist = 4.2 + Math.random() * 4.5;
          this.artifacts.push({
            id: 'art_' + idx + '_' + Math.floor(Math.random() * 9999),
            artId,
            x: Math.max(-240, Math.min(240, c.x + Math.cos(aAng) * aDist)),
            z: Math.max(-240, Math.min(240, c.z + Math.sin(aAng) * aDist)),
            revealed: false, collected: false, bob: Math.random() * 6.28
          });
        }
      });
    }

    updateAtmosphere(dt, emissionState) {
      this.timeOfDay = (this.timeOfDay + dt / 36) % 24;
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const w = ['rain', 'fog', 'rain', 'overcast'];
        this.weather = w[Math.floor(Math.random() * w.length)];
        this.weatherTimer = 65 + Math.random() * 65;
      }

      window.SoundEngine.setRainLevel(
        emissionState.phase === 'active' ? 0.085 : (this.weather === 'rain' ? 0.042 : 0.012)
      );

      const dayWave = Math.max(0, Math.sin((this.timeOfDay - 6) / 24 * Math.PI * 2));
      let zenR = 0.06 + dayWave * 0.12, zenG = 0.08 + dayWave * 0.14, zenB = 0.10 + dayWave * 0.14;
      let horR = 0.15 + dayWave * 0.18, horG = 0.19 + dayWave * 0.19, horB = 0.17 + dayWave * 0.16;
      let cldR = 0.11 + dayWave * 0.16, cldG = 0.14 + dayWave * 0.17, cldB = 0.14 + dayWave * 0.15;

      let fogD = this.weather === 'fog' ? 0.022 : (this.weather === 'rain' ? 0.018 : 0.014);
      let ambR = 0.24 + dayWave * 0.20, ambG = 0.27 + dayWave * 0.21, ambB = 0.26 + dayWave * 0.18;
      let sunR = 0.36 + dayWave * 0.44, sunG = 0.38 + dayWave * 0.42, sunB = 0.34 + dayWave * 0.36;

      let lightning = 0;
      if (emissionState.phase === 'warning' || emissionState.phase === 'active') {
        const k = emissionState.intensity;
        lightning = emissionState.lightningFlash || 0;
        zenR = zenR * (1 - k) + 0.38 * k; zenG = zenG * (1 - k) + 0.04 * k; zenB = zenB * (1 - k) + 0.05 * k;
        horR = horR * (1 - k) + 0.68 * k; horG = horG * (1 - k) + 0.11 * k; horB = horB * (1 - k) + 0.08 * k;
        cldR = cldR * (1 - k) + 0.52 * k; cldG = cldG * (1 - k) + 0.07 * k; cldB = cldB * (1 - k) + 0.06 * k;
        ambR = ambR * (1 - k) + 0.52 * k; ambG = ambG * (1 - k) + 0.14 * k; ambB = ambB * (1 - k) + 0.11 * k;
        fogD = Math.max(fogD, 0.021 + k * 0.013);
      }

      this.engine.skyZenith = [zenR, zenG, zenB];
      this.engine.skyHorizon = [horR, horG, horB];
      this.engine.skyClouds = [cldR, cldG, cldB];
      this.engine.fogColor = [horR * 0.92, horG * 0.94, horB * 0.92];
      this.engine.fogDensity = fogD;
      this.engine.lightning = lightning;
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
      return 'СУМЕРКИ';
    }
  }

  return { World };
})();
