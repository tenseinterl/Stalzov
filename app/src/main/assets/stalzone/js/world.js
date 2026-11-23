// STALZONE Twilight Swamps World Generator (Heightmap Terrain, Camo-Net Bar Camp, ZIL Trucks, Gnarled Trees, Grass, Railways & Anomalies)
window.ZoneWorld = (function () {
  class World {
    constructor(engine) {
      this.engine = engine;
      this.safeCenter = { x: 0, z: 0, radius: 24 };
      this.npcs = [];
      this.staticLights = [];
      this.campfires = [];
      this.anomalies = [];
      this.artifacts = [];
      this.contamZones = [];
      this.spots = [];
      this.protoAnomalies = [];
      this.swampPools = [
        { x: -45, z: 58, w: 42, d: 36 },
        { x: -78, z: 96, w: 48, d: 38 },
        { x: -24, z: 108, w: 36, d: 30 },
        { x: 56, z: 112, w: 34, d: 28 },
        { x: 64, z: 36, w: 28, d: 24 }
      ];
      // Default Twilight Swamps atmosphere (dusk/overcast moody rain & dense fog)
      this.timeOfDay = 18.4;
      this.weather = 'rain';
      this.weatherTimer = 110;
      this.build();
    }

    // Smooth undulating 3D Heightmap Terrain (flat inside Bar & industrial pads, hills & swamp depressions outside!)
    getHeight(x, z) {
      const distBar = Math.hypot(x, z);
      // Smoothly flatten Bar compound (r < 27) & main North-South road corridor
      const barFlat = Math.max(0, Math.min(1, (distBar - 24) / 14));
      const roadFlat = Math.max(0, Math.min(1, (Math.abs(x) - 6.5) / 7.5));
      // Flatten North Industrial / NII pads
      const northPad = (z < -48 && z > -124 && Math.abs(x) < 74) ? 0.15 : 1.0;

      // Natural Chernobyl hills & embankments
      let h = (
        Math.sin(x * 0.042) * Math.cos(z * 0.038) * 2.4 +
        Math.sin(x * 0.095 + z * 0.07) * 0.95 +
        Math.cos(x * 0.025 - z * 0.05) * 1.6
      ) * barFlat * roadFlat * northPad;

      // Carve subtle swamp depressions so water pools gleam realistically
      for (const s of this.swampPools) {
        const dx = (x - s.x) / (s.w * 0.55);
        const dz = (z - s.z) / (s.d * 0.55);
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.2) {
          h = Math.min(h, -0.55 * (1 - d2 / 1.2));
        }
      }
      return h;
    }

    isSafeZone(x, z) {
      return (x * x + z * z) <= this.safeCenter.radius * this.safeCenter.radius;
    }

    getRegionName(x, z) {
      if (this.isSafeZone(x, z)) return 'БАР [СЕЙВ-ЗОНА]';
      if (z > 24) return x < -15 ? 'ЮГ • МРАЧНЫЕ БОЛОТА' : 'ЮГ • ЗАБРОШЕННАЯ ДЕРЕВНЯ';
      if (z < -24) return x > 18 ? 'СЕВЕР • НИИ «АГРОПРОМ»' : 'СЕВЕР • ПРОМЗОНА';
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

      // === 1. UNDULATING 3D HEIGHTMAP TERRAIN (320x320, 4m grid) ===
      E.addTerrainGrid(320, 4.0, (x, z) => this.getHeight(x, z), (x, y, z) => {
        if (Math.abs(x) < 5.5) return [0.58, 0.58, 0.56]; // Dark wet road center
        if (y < -0.12) return [0.46, 0.54, 0.44];         // Muddy bog shore
        if (y > 1.4) return [0.84, 0.72, 0.52];           // Autumn hill dry grass
        if (z < -30) return [0.64, 0.64, 0.60];           // Grim northern earth
        return [0.74, 0.72, 0.56];                        // Moody autumn-swamp grass
      });

      // Swamp reflective water sheets at y = -0.16
      for (const s of this.swampPools) {
        E.addStaticBox(s.x, -0.22, s.z, s.w, 0.12, s.d, 'swamp', {
          tile: 6, solid: false, tint: [0.65, 0.82, 0.74, 0.84], spec: 0.75, noAO: true
        });
      }

      // Main wet asphalt road & Bar concrete courtyard
      E.addStaticBox(0, 0.04, 0, 9.2, 0.08, 290, 'asphalt', { tile: 5, solid: false, spec: 0.42, noAO: true });
      E.addStaticBox(0, 0.06, 0, 44, 0.08, 44, 'concrete', { tile: 4, solid: false, spec: 0.25, noAO: true });

      // Railway tracks running East-West at Z = -36 (just like Screenshot 2!)
      this._buildRailway(-130, 130, -34);

      // Tall Power Pylons silhouetted in twilight fog
      this._buildPowerPylon(-48, -32);
      this._buildPowerPylon(58, -32);
      this._buildPowerPylon(-62, 42);
      this._buildPowerPylon(68, 78);

      // === 2. BASE "БАР" CAMP (WITH CAMO NETTING CANOPY, ZIL TRUCK, CRATES & CAMPFIRE!) ===
      this._buildBarBase();

      // === 3. SOUTH SWAMPS & VILLAGE (z > 28) ===
      this._buildHouse(34, 54, 12, 5.0, 10, 'brick', 'south');
      this._buildHouse(58, 66, 11, 4.8, 9, 'wood', 'west');
      this._buildHouse(42, 86, 13, 5.2, 10, 'brick', 'north');
      this._buildGarage(-22, 46, 9, 4.0, 12);
      this._buildGarage(-34, 46, 9, 4.0, 12);
      this._buildWatchtower(-14, 72);
      this._buildWatchtower(72, 46);
      this._buildDetailedTruck(12, 48, 0.35);
      this._buildDetailedBTR(-18, 86, -0.5);
      this._buildDetailedTruck(26, 105, 1.1);
      // Forward stalker campfire outpost in the swamps
      this._buildCampfire(-28, 60);

      // Concrete roadblocks, sandbags, tires & barbed wire
      for (let i = 0; i < 6; i++) {
        const bx = -14 + i * 6;
        const by = this.getHeight(bx, 32);
        E.addStaticBox(bx, by + 0.9, 32, 3.8, 1.8, 0.65, 'concrete', { tile: 2 });
      }
      this._buildBarbedWire(16, 66, 16);
      this._buildBarbedWire(-54, 44, 18);

      // === 4. NORTH INDUSTRIAL ZONE + НИИ (z < -28) ===
      this._buildIndustrialHall(-38, -78, 34, 9.5, 26);
      this._buildHouse(46, -78, 26, 7.8, 22, 'concrete', 'south');
      this._buildHouse(46, -108, 18, 6.8, 14, 'concrete', 'south');
      this._buildSilo(-64, -102, 10, 18);
      this._buildSilo(-48, -110, 8, 15);
      this._buildGarage(14, -52, 10, 4.4, 14);
      this._buildWatchtower(-12, -48);
      this._buildWatchtower(18, -96);
      this._buildDetailedBTR(-8, -66, 0.25);
      this._buildDetailedTruck(24, -76, -0.8);
      this._buildCampfire(16, -60);

      // Perimeter Zone boundary walls
      const B = 156;
      E.addStaticBox(0, 4, -B, 316, 10, 2, 'concrete', { tile: 4 });
      E.addStaticBox(0, 4, B, 316, 10, 2, 'concrete', { tile: 4 });
      E.addStaticBox(-B, 4, 0, 2, 10, 316, 'concrete', { tile: 4 });
      E.addStaticBox(B, 4, 0, 2, 10, 316, 'concrete', { tile: 4 });

      // === 5. GNARLED DEAD TREES & AUTUMN PINES (LIKE SCREENSHOTS 1 & 2) ===
      const treeCoords = [
        [-64, 24], [-82, 34], [-96, 62], [-66, 84], [-108, 104], [-42, 122],
        [24, 34], [74, 32], [88, 64], [94, 96], [68, 122], [18, 124],
        [-78, -22], [-96, -54], [-104, -88], [-86, -124], [-22, -126],
        [78, -32], [96, -64], [102, -102], [82, -130], [22, -132],
        [-36, 16], [42, 14], [-44, -22], [38, -26], [-84, 4], [84, -8],
        [108, 22], [-112, -18], [52, 134], [-58, 136], [-18, 66], [66, 88],
        [-28, 30], [28, -26], [-32, -46], [30, 42], [-50, 74], [48, 42],
        [-14, 118], [14, -124], [-68, -42], [72, -48], [-90, 14], [92, 24]
      ];
      for (let i = 0; i < treeCoords.length; i++) {
        this._buildGnarledTree(treeCoords[i][0], treeCoords[i][1], 5.8 + (i % 4) * 1.6, i % 3 === 0);
      }

      // Scattered tactical cover crates & concrete blocks
      const coverSpots = [
        [8, 36], [-8, 56], [7, 78], [-7, 98], [8, -42], [-8, -62], [8, -88], [-16, -98], [26, -58]
      ];
      for (const c of coverSpots) {
        const gy = this.getHeight(c[0], c[1]);
        E.addStaticBox(c[0], gy + 0.85, c[1], 3.2, 1.7, 1.0, 'concrete', { tile: 2 });
        E.addStaticBox(c[0] + 1.8, gy + 0.45, c[1] + 0.5, 0.9, 0.9, 0.9, 'crate', { tile: 1 });
      }

      // === 6. 550+ SWAYING SWAMP GRASS & REED CLUSTERS ===
      let seed = 1337;
      const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      for (let i = 0; i < 580; i++) {
        const gx = (rand() - 0.5) * 265;
        const gz = (rand() - 0.5) * 265;
        if (Math.hypot(gx, gz) < 22) continue; // Keep Bar concrete clear
        if (Math.abs(gx) < 5.8) continue;      // Keep road clear
        const gy = this.getHeight(gx, gz);
        if (gy < -0.25) continue;              // Deep water center
        const w = 1.1 + rand() * 1.1;
        const h = (gy < 0.1 ? 1.15 : 0.72) + rand() * 0.65; // Taller reeds near swamps!
        E.addGrassTuft(gx, gy, gz, w, h);
      }

      E.finishStaticBuild();

      this._initContaminationZones();
      this._initSpotsAndProto();
      this.respawnAnomaliesAndArtifacts();
    }

    _buildBarBase() {
      const E = this.engine;
      // Outer reinforced perimeter wall with North & South open gates
      E.addStaticBox(-13, 2.2, 22, 18, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(13, 2.2, 22, 18, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(-13, 2.2, -22, 18, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(13, 2.2, -22, 18, 4.4, 1.2, 'concrete', { tile: 3 });
      E.addStaticBox(-22, 2.2, 0, 1.2, 4.4, 44, 'concrete', { tile: 3 });
      E.addStaticBox(22, 2.2, 0, 1.2, 4.4, 44, 'concrete', { tile: 3 });
      E.addStaticBox(0, 4.5, 22, 10, 0.8, 1.5, 'hazard', { tile: 2 });
      E.addStaticBox(0, 4.5, -22, 10, 0.8, 1.5, 'hazard', { tile: 2 });

      // Main roofed BAR Bunker (West)
      this._buildHouse(-11, -3, 14, 5.2, 18, 'brick', 'east');

      // === CAMO NETTING CANOPY OVER CAMPFIRE AREA (JUST LIKE SCREENSHOT 1!) ===
      const posts = [[0.5, -5.5], [11.5, -5.5], [0.5, 6.5], [11.5, 6.5]];
      for (const p of posts) {
        E.addStaticBox(p[0], 2.1, p[1], 0.18, 4.2, 0.18, 'rust', { tile: 1, spec: 0.4 });
      }
      E.addStaticBox(6.0, 4.15, 0.5, 11.8, 0.08, 12.8, 'camo_net', {
        tile: 2.5, solid: false, isRoof: true, doubleSided: true, noAO: true
      });

      // Detailed ZIL-131 Rusted Military Truck parked right beside the Bar campfire (Screenshot 1 vibe!)
      this._buildDetailedTruck(11.2, 1.5, -0.35);

      // Military wooden crates & tire stacks around camp
      E.addStaticBox(2.2, 0.45, -1.6, 1.0, 0.9, 1.0, 'crate', { tile: 1, ry: 0.15 });
      E.addStaticBox(1.1, 0.45, -1.4, 0.9, 0.9, 0.9, 'crate', { tile: 1, ry: -0.1 });
      E.addStaticBox(1.8, 1.25, -1.5, 0.8, 0.7, 0.8, 'crate', { tile: 1, ry: 0.4 });
      E.addStaticBox(6.6, 0.35, 5.8, 1.1, 0.7, 1.1, 'asphalt', { tile: 1, tint: [0.22, 0.23, 0.24, 1] });

      // Campfire with warm orange point light & embers
      this._buildCampfire(4.6, 2.2);

      // Warm Base Lamps
      this.staticLights.push({ x: -10, y: 4.2, z: -3, r: 19, cr: 1.3, cg: 0.95, cb: 0.55 });
      this.staticLights.push({ x: 0, y: 4.3, z: -20, r: 17, cr: 1.0, cg: 0.86, cb: 0.48 });
      this.staticLights.push({ x: 0, y: 4.3, z: 20, r: 17, cr: 1.0, cg: 0.86, cb: 0.48 });

      // Personal Stash military footlocker
      E.addStaticBox(7.2, 0.55, -3.2, 1.5, 1.0, 0.95, 'crate', { tile: 1.2, tint: [0.62, 0.92, 0.62, 1], spec: 0.3 });
      E.addStaticBox(-14.5, 0.6, -3, 1.4, 1.2, 10, 'wood', { tile: 2 });

      // 4 Bar NPCs + Stash + Guard Stalker standing by the campfire (like Screenshot 1!)
      this.npcs = [
        { id: 'trader',   name: 'Торговец «Сидорыч»', role: 'Патроны, медицина, обвесы', x: -13.0, z: -6.5, color: [0.82, 0.68, 0.34, 1], visor: [0.95, 0.75, 0.25, 1] },
        { id: 'barter',   name: 'Бартерщик «Кузнец»', role: 'Ветки бартера брони и оружия', x: -13.0, z: -2.2, color: [0.36, 0.68, 0.44, 1], visor: [0.45, 0.95, 0.65, 1] },
        { id: 'mechanic', name: 'Механик «Азот»',     role: 'Заточка снаряжения (+1..+15)', x: -13.0, z: 2.2,  color: [0.38, 0.58, 0.75, 1], visor: [0.35, 0.85, 1.0, 1] },
        { id: 'fence',    name: 'Скупщик «Барыга»',   role: 'Скупка артефактов и трофеев', x: 3.2,   z: 4.2,  color: [0.64, 0.54, 0.40, 1], visor: [1.0, 0.68, 0.22, 1] },
        { id: 'stash',    name: 'Личный Схрон',       role: 'Безопасное хранилище', x: 7.2,   z: -3.2, color: [0.45, 0.95, 0.55, 1], isBox: true }
      ];
    }

    _buildCampfire(x, z) {
      const E = this.engine;
      const y = this.getHeight(x, z);
      // Stone ring + crossed charred logs
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
      // Chassis frame
      place(0, 0.68, 0, 2.2, 0.32, 6.2, 'rust', [0.42, 0.35, 0.3, 1], 0.45);
      // Hood (front +Z)
      place(0, 1.32, 2.25, 1.95, 0.95, 1.7, 'rust', oliveRust, 0.5);
      // Cab & Windshield
      place(0, 1.85, 0.85, 2.25, 1.55, 1.55, 'rust', oliveRust, 0.45);
      place(0, 2.02, 1.64, 1.9, 0.65, 0.08, 'gunmetal', [0.35, 0.44, 0.46, 0.85], 0.9, false);
      // Cargo Bed walls
      place(0, 1.55, -1.45, 2.45, 1.15, 3.3, 'wood', [0.68, 0.64, 0.5, 1], 0.15);
      // Headlights
      place(-0.7, 1.25, 3.12, 0.28, 0.28, 0.1, 'white', [0.95, 0.9, 0.72, 1], 0.8, false);
      place(0.7, 1.25, 3.12, 0.28, 0.28, 0.1, 'white', [0.95, 0.9, 0.72, 1], 0.8, false);
      // 6 Heavy off-road wheels
      const wheelZ = [2.1, -0.9, -2.2];
      for (const wz of wheelZ) {
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
      const armorCol = [0.46, 0.54, 0.42, 1];
      place(0, 1.15, 0, 2.9, 1.35, 6.6, 'rust', armorCol, 0.5);
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
      // Twisted trunk segments
      E.addStaticBox(cx, gy + h * 0.25, cz, 0.68, h * 0.55, 0.68, 'bark', { tile: 2 });
      E.addStaticBox(cx + 0.18, gy + h * 0.65, cz - 0.12, 0.5, h * 0.48, 0.5, 'bark', { tile: 2, ry: 0.3 });
      // Multi-branch gnarled limbs (Screenshot 1 & 2 signature twisted silhouettes!)
      const limbs = [
        [1.1, h * 0.72, 0.4, 2.2, 0.26, 0.28, 0.35],
        [-1.0, h * 0.82, -0.5, 2.0, 0.24, 0.26, -0.5],
        [0.4, h * 0.92, -1.0, 0.24, 0.24, 2.1, 0.2],
        [-0.5, h * 0.98, 0.9, 0.22, 0.22, 1.8, -0.3]
      ];
      for (const l of limbs) {
        E.addStaticBox(cx + l[0], gy + l[1], cz + l[2], l[3], l[4], l[5], 'bark', { tile: 1.5, ry: l[6], solid: false });
      }
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
      // Steel rails
      E.addStaticBox(cx, gy + 0.14, z - 0.75, len, 0.14, 0.12, 'gunmetal', { tile: 4, solid: false, spec: 0.75 });
      E.addStaticBox(cx, gy + 0.14, z + 0.75, len, 0.14, 0.12, 'gunmetal', { tile: 4, solid: false, spec: 0.75 });
      // Wooden sleepers
      for (let x = xStart; x <= xEnd; x += 2.2) {
        const ty = this.getHeight(x, z);
        E.addStaticBox(x, ty + 0.06, z, 0.35, 0.12, 2.3, 'wood', { tile: 1, solid: false });
      }
    }

    _buildPowerPylon(cx, cz) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      const pts = [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]];
      for (const p of pts) {
        E.addStaticBox(cx + p[0], gy + 9.0, cz + p[1], 0.34, 18, 0.34, 'rust', { tile: 3, spec: 0.4 });
      }
      // Crossarms at top
      E.addStaticBox(cx, gy + 14.5, cz, 9.5, 0.45, 0.45, 'rust', { tile: 2, solid: false });
      E.addStaticBox(cx, gy + 17.5, cz, 7.2, 0.45, 0.45, 'rust', { tile: 2, solid: false });
    }

    _buildBarbedWire(cx, cz, len) {
      const gy = this.getHeight(cx, cz);
      this.engine.addStaticBox(cx, gy + 1.1, cz, len, 2.2, 0.25, 'wire', { tile: 2, solid: true, doubleSided: true });
    }

    _buildHouse(cx, cz, w, h, d, wallTex, doorSide) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      const t = 0.6;
      const doorW = 3.2;
      // Foundation slab reaches underground so house never floats on hills
      E.addStaticBox(cx, gy - 0.6, cz, w + 0.6, 1.4, d + 0.6, 'concrete', { tile: 3, solid: false });
      E.addStaticBox(cx, gy + h + 0.3, cz, w + 0.9, 0.6, d + 0.9, 'roof', { tile: 3, isRoof: true, solid: true, spec: 0.3 });

      const buildWallWithDoor = (isX, pos, len) => {
        const seg = (len - doorW) * 0.5;
        if (isX) {
          E.addStaticBox(cx - (doorW + seg) * 0.5, gy + h * 0.5, pos, seg, h, t, wallTex, { tile: 3 });
          E.addStaticBox(cx + (doorW + seg) * 0.5, gy + h * 0.5, pos, seg, h, t, wallTex, { tile: 3 });
          E.addStaticBox(cx, gy + h - 0.85, pos, doorW, 1.7, t, wallTex, { tile: 3 });
        } else {
          E.addStaticBox(pos, gy + h * 0.5, cz - (doorW + seg) * 0.5, t, h, seg, wallTex, { tile: 3 });
          E.addStaticBox(pos, gy + h * 0.5, cz + (doorW + seg) * 0.5, t, h, seg, wallTex, { tile: 3 });
          E.addStaticBox(pos, gy + h - 0.85, cz, t, 1.7, doorW, wallTex, { tile: 3 });
        }
      };

      if (doorSide === 'north') buildWallWithDoor(true, cz - d * 0.5, w);
      else E.addStaticBox(cx, gy + h * 0.5, cz - d * 0.5, w, h, t, wallTex, { tile: 3 });
      if (doorSide === 'south') buildWallWithDoor(true, cz + d * 0.5, w);
      else E.addStaticBox(cx, gy + h * 0.5, cz + d * 0.5, w, h, t, wallTex, { tile: 3 });
      if (doorSide === 'east') buildWallWithDoor(false, cx + w * 0.5, d);
      else E.addStaticBox(cx + w * 0.5, gy + h * 0.5, cz, t, h, d, wallTex, { tile: 3 });
      if (doorSide === 'west') buildWallWithDoor(false, cx - w * 0.5, d);
      else E.addStaticBox(cx - w * 0.5, gy + h * 0.5, cz, t, h, d, wallTex, { tile: 3 });
    }

    _buildIndustrialHall(cx, cz, w, h, d) {
      this._buildHouse(cx, cz, w, h, d, 'concrete', 'south');
      const gy = this.getHeight(cx, cz);
      this.engine.addStaticBox(cx - 6, gy + h * 0.5, cz, 1.4, h, 1.4, 'rust', { tile: 2, spec: 0.4 });
      this.engine.addStaticBox(cx + 6, gy + h * 0.5, cz, 1.4, h, 1.4, 'rust', { tile: 2, spec: 0.4 });
      this.engine.addStaticBox(cx, gy + 1.1, cz - 4, 8, 2.2, 2.2, 'hazard', { tile: 2 });
      this.staticLights.push({ x: cx, y: gy + h - 1.5, z: cz, r: 24, cr: 0.85, cg: 0.96, cb: 0.98 });
    }

    _buildGarage(cx, cz, w, h, d) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      E.addStaticBox(cx, gy + h + 0.2, cz, w + 0.4, 0.4, d + 0.4, 'roof', { tile: 2.5, isRoof: true });
      E.addStaticBox(cx - w * 0.5, gy + h * 0.5, cz, 0.4, h, d, 'rust', { tile: 2.5, spec: 0.35 });
      E.addStaticBox(cx + w * 0.5, gy + h * 0.5, cz, 0.4, h, d, 'rust', { tile: 2.5, spec: 0.35 });
      E.addStaticBox(cx, gy + h * 0.5, cz - d * 0.5, w, h, 0.4, 'rust', { tile: 2.5, spec: 0.35 });
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

    _initContaminationZones() {
      this.contamZones = [
        { x: -46, z: 60, radius: 22, type: 'bio', level: 1, name: 'Болотная топь (Био 1)' },
        { x: -74, z: 98, radius: 26, type: 'bio', level: 2, name: 'Кислотное болото (Био 2)' },
        { x: 24,  z: 74, radius: 18, type: 'rad', level: 1, name: 'Фонящая техника (Рад 1)' },
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
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 34 + Math.random() * 98;
        clusters.push({
          x: Math.cos(ang) * dist, z: Math.sin(ang) * dist,
          type: types[Math.floor(Math.random() * types.length)],
          tier: Math.sin(ang) * dist < -24 ? 3 : 1
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
            x: Math.max(-145, Math.min(145, c.x + Math.cos(aAng) * aDist)),
            z: Math.max(-145, Math.min(145, c.z + Math.sin(aAng) * aDist)),
            revealed: false, collected: false, bob: Math.random() * 6.28
          });
        }
      });
    }

    updateAtmosphere(dt, emissionState) {
      // Slow atmospheric twilight cycle (lingers in moody dusk/overcast swamps!)
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
      // Moody twilight-swamp palette: cold slate-emerald zenith, hazy murky olive-teal horizon
      let zenR = 0.06 + dayWave * 0.12, zenG = 0.08 + dayWave * 0.14, zenB = 0.10 + dayWave * 0.14;
      let horR = 0.15 + dayWave * 0.18, horG = 0.19 + dayWave * 0.19, horB = 0.17 + dayWave * 0.16;
      let cldR = 0.11 + dayWave * 0.16, cldG = 0.14 + dayWave * 0.17, cldB = 0.14 + dayWave * 0.15;

      let fogD = this.weather === 'fog' ? 0.025 : (this.weather === 'rain' ? 0.020 : 0.016);
      let ambR = 0.22 + dayWave * 0.20, ambG = 0.25 + dayWave * 0.21, ambB = 0.24 + dayWave * 0.18;
      let sunR = 0.34 + dayWave * 0.44, sunG = 0.36 + dayWave * 0.42, sunB = 0.32 + dayWave * 0.36;

      let lightning = 0;
      if (emissionState.phase === 'warning' || emissionState.phase === 'active') {
        const k = emissionState.intensity;
        lightning = emissionState.lightningFlash || 0;
        zenR = zenR * (1 - k) + 0.38 * k; zenG = zenG * (1 - k) + 0.04 * k; zenB = zenB * (1 - k) + 0.05 * k;
        horR = horR * (1 - k) + 0.68 * k; horG = horG * (1 - k) + 0.11 * k; horB = horB * (1 - k) + 0.08 * k;
        cldR = cldR * (1 - k) + 0.52 * k; cldG = cldG * (1 - k) + 0.07 * k; cldB = cldB * (1 - k) + 0.06 * k;
        ambR = ambR * (1 - k) + 0.52 * k; ambG = ambG * (1 - k) + 0.14 * k; ambB = ambB * (1 - k) + 0.11 * k;
        fogD = Math.max(fogD, 0.022 + k * 0.014);
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
