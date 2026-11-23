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
      this.timeOfDay = 9.5;
      this.weather = 'clear';
      this.weatherTimer = 95;
      this.artifactsSpawnedByEmission = false;
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

      // Freight railcars along railway tracks
      this._buildRailcar(-76, -34);
      this._buildRailcar(92, -34);
      this._buildRailcar(-168, -34);
      this._buildRailcar(-108, 52);

      const pylons = [
        [-48, -32], [58, -32], [-62, 42], [68, 78], [-110, -32], [145, -32],
        [-160, 140], [150, 120], [-80, -155], [80, -155], [165, -90]
      ];
      for (const p of pylons) this._buildPowerPylon(p[0], p[1]);

      // === 2. BOTH FACTION BASES (STALKER BAR & BANDIT DEPOT) ===
      this._buildBarBase();
      this._buildBanditDepotBase();

      // === 2B. FORTIFIED CHECKPOINTS (БЛОКПОСТЫ) & HIGHWAY GAS STATION ===
      this._buildCheckpoint(-64, 78, 0.35, 'bandit');
      this._buildCheckpoint(24, 66, -0.25, 'stalker');
      this._buildCheckpoint(-16, -56, 0.0, 'bandit');
      this._buildCheckpoint(132, 22, 1.57, 'stalker');
      this._buildCheckpoint(-128, -92, 1.57, 'bandit');
      this._buildCheckpoint(8, -184, 0.0, 'merc');
      this._buildGasStation(24, 118);

      // Swamp wooden boardwalks across murky pools
      this._buildBoardwalk(-45, 58, 34, 0.25);
      this._buildBoardwalk(-78, 112, 38, -0.35);
      this._buildBoardwalk(-24, 148, 30, 0.15);

      // PO-2 Soviet concrete perimeter fences along highway & industrial zones
      this._buildPO2FenceLine(-24, 32, -8, 32);
      this._buildPO2FenceLine(8, 32, 28, 32);
      this._buildPO2FenceLine(-58, -56, -24, -56);
      this._buildPO2FenceLine(12, -56, 48, -56);
      this._buildPO2FenceLine(116, -12, 116, 12);

      // === 3. SOUTH SWAMPS & FLOODED VILLAGE ===
      this._buildHouse(34, 54, 12, 5.0, 10, 'brick', 'south');
      this._buildHouse(58, 66, 11, 4.8, 9, 'wood', 'west');
      this._buildHouse(42, 86, 13, 5.2, 10, 'brick', 'north');
      this._buildHouse(-18, 168, 14, 5.5, 11, 'wood', 'north');
      this._buildHouse(24, 182, 12, 5.0, 10, 'brick', 'west');
      this._buildHouse(-66, 178, 15, 6.4, 12, 'brick', 'east');
      this._buildHouse(-86, 158, 12, 5.0, 10, 'wood', 'south');
      this._buildGarage(-22, 46, 9, 4.0, 12);
      this._buildGarage(-34, 46, 9, 4.0, 12);
      this._buildGarage(72, 92, 9, 4.0, 11);
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
      this._buildCampfire(52, 94);

      // === 4. EAST VEHICLE JUNKYARD ===
      this._buildIndustrialHall(154, 24, 26, 8.2, 20);
      this._buildHouse(148, -18, 14, 5.2, 12, 'concrete', 'west');
      this._buildHouse(182, 86, 13, 5.0, 11, 'brick', 'west');
      this._buildGarage(174, 48, 11, 4.4, 14);
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

      this._buildBarbedWire(16, 66, 16);
      this._buildBarbedWire(-54, 44, 18);
      this._buildBarbedWire(112, 48, 22);
      this._buildBarbedWire(0, -158, 28);

      const B = this.worldHalfSize;
      E.addStaticBox(0, 4, -B, B * 2 + 4, 10, 2, 'concrete', { tile: 4 });
      E.addStaticBox(0, 4, B, B * 2 + 4, 10, 2, 'concrete', { tile: 4 });
      E.addStaticBox(-B, 4, 0, 2, 10, B * 2 + 4, 'concrete', { tile: 4 });
      E.addStaticBox(B, 4, 0, 2, 10, B * 2 + 4, 'concrete', { tile: 4 });

      // === 6. DENSE FOREST GROVES, SOLID CONIFERS, BROADLEAF TREES & BUSHES ===
      let seed = 1337;
      const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

      const blockedCenters = [
        [0, 0, 32], [-145, 78, 32], [-64, 78, 16], [24, 66, 16], [-16, -56, 16],
        [132, 22, 16], [-128, -92, 18], [8, -184, 16], [24, 118, 16],
        [34, 54, 12], [58, 66, 11], [42, 86, 12], [-18, 168, 12], [24, 182, 12],
        [-66, 178, 14], [154, 24, 22], [-38, -78, 24], [46, -78, 20], [46, -108, 16],
        [0, -206, 36]
      ];
      const canPlaceFoliage = (x, z, pad = 0) => {
        if (Math.abs(x) < 10.5 || Math.abs(z + 34) < 7.5) return false;
        if (x < -8 && Math.abs(z - 52) < 6.5) return false;
        if (Math.abs(x) > 236 || Math.abs(z) > 236) return false;
        for (let i = 0; i < blockedCenters.length; i++) {
          const bc = blockedCenters[i];
          if (Math.hypot(x - bc[0], z - bc[1]) < bc[2] + pad) return false;
        }
        return true;
      };

      // Named woodland groves around the Zone so the map feels lush & alive
      const groves = [
        { x: -38, z: 22, r: 22, count: 10 },
        { x: 46, z: 18, r: 26, count: 12 },
        { x: 88, z: 58, r: 28, count: 12 },
        { x: 84, z: -24, r: 28, count: 12 },
        { x: -92, z: -12, r: 30, count: 12 },
        { x: -96, z: 126, r: 28, count: 10 },
        { x: 76, z: 158, r: 30, count: 11 },
        { x: -82, z: -152, r: 32, count: 12 },
        { x: 96, z: -144, r: 32, count: 12 },
        { x: 186, z: -64, r: 30, count: 10 },
        { x: -186, z: 16, r: 28, count: 10 }
      ];
      let placedTrees = 0;
      for (const gr of groves) {
        for (let k = 0; k < gr.count * 2 && placedTrees < 175; k++) {
          const a = rand() * Math.PI * 2;
          const d = Math.sqrt(rand()) * gr.r;
          const tx = gr.x + Math.cos(a) * d;
          const tz = gr.z + Math.sin(a) * d;
          if (!canPlaceFoliage(tx, tz, 2)) continue;
          const gy = this.getHeight(tx, tz);
          if (gy < -0.18) continue;
          const roll = rand();
          const style = roll < 0.58 ? 'pine' : (roll < 0.92 ? 'broadleaf' : 'dead');
          this._buildTree(tx, tz, 6.2 + rand() * 4.4, style);
          placedTrees++;
          if (k >= gr.count) break;
        }
      }
      // Scatter additional trees across open hills & roadsides
      for (let tries = 0; tries < 260 && placedTrees < 168; tries++) {
        const tx = (rand() - 0.5) * 462;
        const tz = (rand() - 0.5) * 462;
        if (!canPlaceFoliage(tx, tz, 1)) continue;
        const gy = this.getHeight(tx, tz);
        if (gy < -0.15) continue;
        const roll = rand();
        const style = roll < 0.55 ? 'pine' : (roll < 0.88 ? 'broadleaf' : 'dead');
        this._buildTree(tx, tz, 5.8 + rand() * 4.2, style);
        placedTrees++;
      }

      // 130 dense solid voxel bushes along roadsides, hills & forest edges
      let placedBushes = 0;
      for (let tries = 0; tries < 280 && placedBushes < 130; tries++) {
        const bx = (rand() - 0.5) * 462;
        const bz = (rand() - 0.5) * 462;
        if (!canPlaceFoliage(bx, bz, -3)) continue;
        const gy = this.getHeight(bx, bz);
        if (gy < -0.18) continue;
        this._buildBush(bx, bz, 0.95 + rand() * 0.9, rand() < 0.45);
        placedBushes++;
      }

      // Tactical roadside cover, sandbag nests, crates & mossy boulders
      const coverSpots = [
        [8, 36], [-8, 56], [7, 78], [-7, 98], [8, 134], [-9, 132], [8, -42], [-8, -62],
        [8, -88], [-16, -98], [26, -58], [104, 24], [-102, 78], [14, 142], [-18, -148],
        [62, -142], [-96, -42], [-34, 14], [34, 28], [68, 14], [-58, 18], [102, -48],
        [-72, -118], [44, -158], [-44, 118], [94, 114], [148, 66], [-134, 128]
      ];
      for (let i = 0; i < coverSpots.length; i++) {
        const c = coverSpots[i];
        const gy = this.getHeight(c[0], c[1]);
        if (i % 3 === 0) {
          E.addStaticBox(c[0], gy + 0.62, c[1], 3.2, 1.24, 0.95, 'sandbag', { tile: 2.2, ry: (i % 5) * 0.25 });
          E.addStaticBox(c[0] + 1.6, gy + 0.45, c[1] + 0.6, 0.9, 0.9, 0.9, 'crate', { tile: 1 });
        } else if (i % 3 === 1) {
          E.addStaticBox(c[0], gy + 0.85, c[1], 3.2, 1.7, 1.0, 'concrete', { tile: 2 });
          E.addStaticBox(c[0] + 1.8, gy + 0.45, c[1] + 0.5, 0.9, 0.9, 0.9, 'crate', { tile: 1 });
        } else {
          // Natural mossy boulders
          E.addStaticBox(c[0], gy + 0.85, c[1], 2.8, 1.8, 2.3, 'concrete', { tile: 2, ry: 0.4, tint: [0.58, 0.60, 0.56, 1] });
          E.addStaticBox(c[0] + 1.5, gy + 0.55, c[1] + 0.9, 1.6, 1.1, 1.5, 'concrete', { tile: 1.5, ry: -0.3, tint: [0.52, 0.56, 0.50, 1] });
        }
      }

      // === 7. 1800 REALISTIC SWAYING GRASS TUFTS ===
      for (let i = 0; i < 1800; i++) {
        const gx = (rand() - 0.5) * 474;
        const gz = (rand() - 0.5) * 474;
        if (Math.hypot(gx, gz) < 23.5 || Math.hypot(gx + 145, gz - 78) < 23.5) continue;
        if (Math.abs(gx) < 6.4) continue;
        const gy = this.getHeight(gx, gz);
        if (gy < -0.22) continue;
        const w = 1.2 + rand() * 1.1;
        const h = (gy < 0.15 ? 1.15 : 0.72) + rand() * 0.55;
        E.addGrassTuft(gx, gy, gz, w, h);
      }

      E.finishStaticBuild();

      this._initContaminationZones();
      this._initSpotsAndProto();
      this._initWorldStashes();
      // Artifacts spawn ONLY after an Emission passes!
      this.respawnAnomaliesAndArtifacts(false);
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

    _buildTree(cx, cz, h, style = 'pine') {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);

      if (style === 'pine') {
        // Lush layered voxel conifer (solid opaque pine needle tiers — zero alpha glitches!)
        E.addStaticBox(cx, gy + h * 0.42, cz, 0.56, h * 0.84, 0.56, 'bark', { tile: 2.2 });
        const tiers = [
          { y: 0.34, w: 3.6, th: 1.55, wind: 0.015 },
          { y: 0.52, w: 3.0, th: 1.45, wind: 0.024 },
          { y: 0.69, w: 2.35, th: 1.35, wind: 0.032 },
          { y: 0.85, w: 1.60, th: 1.25, wind: 0.040 },
          { y: 0.99, w: 0.88, th: 1.05, wind: 0.048 }
        ];
        const shade = 0.88 + ((Math.abs(Math.floor(cx * 3 + cz)) % 5) * 0.05);
        const tint = [shade * 0.94, shade * 1.04, shade * 0.92, 1];
        for (let i = 0; i < tiers.length; i++) {
          const t = tiers[i];
          E.addStaticBox(cx, gy + h * t.y, cz, t.w, t.th, t.w, 'pine', {
            tile: 1.8, solid: false, tint, wind: t.wind, ry: (i % 2) * 0.25
          });
        }
        return;
      }

      if (style === 'broadleaf') {
        // Sturdy deciduous Zone tree with dense clustered solid foliage canopy
        E.addStaticBox(cx, gy + h * 0.32, cz, 0.66, h * 0.64, 0.66, 'bark', { tile: 2.2 });
        E.addStaticBox(cx + 0.1, gy + h * 0.62, cz - 0.08, 0.48, h * 0.28, 0.48, 'bark', { tile: 1.6, solid: false });
        const shade = 0.86 + ((Math.abs(Math.floor(cx + cz * 2)) % 6) * 0.045);
        const autumn = (Math.abs(Math.floor(cx * 7 - cz * 3)) % 4) === 0;
        const tint = autumn
          ? [shade * 1.15, shade * 0.96, shade * 0.64, 1]
          : [shade * 0.92, shade * 1.06, shade * 0.82, 1];
        const blobs = [
          [0.0,  h * 0.78,  0.0,  3.5, 2.2, 3.5, 0.025],
          [1.25, h * 0.72,  0.65, 2.3, 1.8, 2.3, 0.032],
          [-1.2, h * 0.75, -0.60, 2.4, 1.8, 2.4, 0.032],
          [0.35, h * 0.74, -1.15, 2.2, 1.7, 2.2, 0.030],
          [-0.4, h * 0.71,  1.15, 2.2, 1.7, 2.2, 0.030],
          [0.0,  h * 0.98,  0.0,  2.4, 1.6, 2.4, 0.042]
        ];
        for (const b of blobs) {
          E.addStaticBox(cx + b[0], gy + b[1], cz + b[2], b[3], b[4], b[5], 'leaves', {
            tile: 1.6, solid: false, tint, wind: b[6]
          });
        }
        return;
      }

      // Rare dead marsh tree (clean silhouette without buggy foliage)
      E.addStaticBox(cx, gy + h * 0.30, cz, 0.62, h * 0.60, 0.62, 'bark', { tile: 2 });
      E.addStaticBox(cx + 0.14, gy + h * 0.68, cz - 0.10, 0.44, h * 0.42, 0.44, 'bark', { tile: 2, ry: 0.25 });
      E.addStaticBox(cx + 0.85, gy + h * 0.74, cz + 0.25, 1.65, 0.24, 0.24, 'bark', { tile: 1.2, ry: 0.3, solid: false });
      E.addStaticBox(cx - 0.75, gy + h * 0.84, cz - 0.35, 1.45, 0.22, 0.22, 'bark', { tile: 1.2, ry: -0.45, solid: false });
    }

    _buildBush(cx, cz, scale = 1.1, isPine = false) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      const tex = isPine ? 'pine' : 'leaves';
      const tint = isPine ? [0.85, 0.96, 0.82, 1] : [0.88, 0.98, 0.76, 1];
      E.addStaticBox(cx, gy + 0.46 * scale, cz, 1.65 * scale, 0.95 * scale, 1.65 * scale, tex, {
        tile: 1.2, solid: false, tint, wind: 0.03
      });
      E.addStaticBox(cx + 0.42 * scale, gy + 0.62 * scale, cz - 0.30 * scale, 1.1 * scale, 0.82 * scale, 1.1 * scale, tex, {
        tile: 1.1, solid: false, tint, wind: 0.038, ry: 0.45
      });
    }

    _buildCheckpoint(cx, cz, ry = 0, style = 'bandit') {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const place = (lx, ly, lz, sx, syz, sz, tex, opts = {}) => {
        const wx = cx + lx * cy + lz * sy;
        const wz = cz - lx * sy + lz * cy;
        E.addStaticBox(wx, gy + ly, wz, sx, syz, sz, tex, { ...opts, ry: ry + (opts.ry || 0) });
      };

      // Guardhouse booth (with solid roof for Emission shelter!)
      const wallTex = style === 'stalker' ? 'brick' : (style === 'merc' ? 'concrete' : 'rust');
      place(-5.5, 1.55, -2.5, 4.2, 3.1, 0.45, wallTex, { tile: 2.2 });
      place(-7.5, 1.55,  0.0, 0.45, 3.1, 4.6, wallTex, { tile: 2.2 });
      place(-3.5, 1.55,  0.0, 0.45, 3.1, 4.6, wallTex, { tile: 2.2 });
      place(-5.5, 3.25,  0.0, 5.2, 0.42, 5.6, 'roof', { tile: 2.2, isRoof: true, solid: true });
      place(-5.5, 0.08,  0.0, 4.6, 0.16, 5.0, 'concrete', { tile: 2, solid: false, polyOffset: true });

      // Sandbag defensive firing bunkers flanking the road/approach
      place( 4.6, 0.65,  4.2, 4.8, 1.3, 1.1, 'sandbag', { tile: 2.4 });
      place( 6.6, 0.65,  1.8, 1.1, 1.3, 4.2, 'sandbag', { tile: 2.4 });
      place(-4.6, 0.65,  4.8, 4.2, 1.3, 1.1, 'sandbag', { tile: 2.4 });
      place( 5.0, 0.65, -4.6, 4.4, 1.3, 1.1, 'sandbag', { tile: 2.4 });

      // PO-2 concrete perimeter slabs at rear
      place(-1.2, 1.3, -6.2, 4.2, 2.6, 0.45, 'fence_po2', { tile: 1.5 });
      place( 3.2, 1.3, -6.2, 4.2, 2.6, 0.45, 'fence_po2', { tile: 1.5 });

      // Road barrier gate posts + yellow-black hazard boom
      place(-2.4, 1.1,  3.8, 0.42, 2.2, 0.42, 'concrete', { tile: 1 });
      place( 2.4, 1.1,  3.8, 0.42, 2.2, 0.42, 'concrete', { tile: 1 });
      place( 0.0, 1.25, 3.8, 5.0, 0.22, 0.22, 'hazard', { tile: 2.5, solid: false });

      // Supply crates & fuel barrels
      place( 3.8, 0.48, -2.2, 1.0, 0.96, 1.0, 'crate', { tile: 1, ry: 0.2 });
      place( 4.9, 0.48, -1.9, 0.9, 0.96, 0.9, 'crate', { tile: 1, ry: -0.15 });
      place( 4.3, 1.35, -2.0, 0.82, 0.78, 0.82, 'crate', { tile: 1, ry: 0.35 });
      place(-2.2, 0.62, -2.8, 0.75, 1.24, 0.75, 'rust', { tile: 1.2, tint: [0.78, 0.32, 0.22, 1] });

      // Floodlight pole + warm or red outpost light
      place(6.2, 2.8, -3.5, 0.26, 5.6, 0.26, 'rust', { tile: 2 });
      const lx = cx + 6.2 * cy - 3.5 * sy;
      const lz = cz - 6.2 * sy - 3.5 * cy;
      E.addStaticBox(lx, gy + 5.7, lz, 0.65, 0.32, 0.65, 'white', {
        tile: 1, tint: style === 'stalker' ? [0.92, 0.98, 0.72, 1] : [1.0, 0.56, 0.34, 1], emissive: 1.8, solid: false
      });
      this.staticLights.push({
        x: lx, y: gy + 5.4, z: lz, r: 22,
        cr: style === 'stalker' ? 1.1 : 1.4,
        cg: style === 'stalker' ? 1.15 : 0.62,
        cb: style === 'stalker' ? 0.75 : 0.36
      });

      // Checkpoint campfire
      const fx = cx + 1.2 * cy - 1.2 * sy;
      const fz = cz - 1.2 * sy - 1.2 * cy;
      this._buildCampfire(fx, fz);
    }

    _buildGasStation(cx, cz) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      // Concrete forecourt pad
      E.addStaticBox(cx, gy + 0.08, cz, 20, 0.16, 16, 'concrete', { tile: 3.5, solid: false, polyOffset: true });
      // Canopy roof + 4 rusty steel pillars
      for (const p of [[-7, -4.5], [7, -4.5], [-7, 4.5], [7, 4.5]]) {
        E.addStaticBox(cx + p[0], gy + 2.5, cz + p[1], 0.42, 5.0, 0.42, 'rust', { tile: 2 });
      }
      E.addStaticBox(cx, gy + 5.15, cz, 16.5, 0.65, 11.5, 'roof', { tile: 3, isRoof: true, solid: true });
      E.addStaticBox(cx, gy + 5.15, cz + 5.8, 16.6, 0.75, 0.18, 'hazard', { tile: 4, solid: false });
      // Two fuel islands & rusted Soviet fuel pumps
      for (const px of [-3.2, 3.2]) {
        E.addStaticBox(cx + px, gy + 0.25, cz, 1.5, 0.35, 5.4, 'concrete', { tile: 1.5 });
        E.addStaticBox(cx + px, gy + 1.15, cz - 1.2, 0.78, 1.6, 0.65, 'rust', { tile: 1.2, tint: [0.85, 0.42, 0.24, 1] });
        E.addStaticBox(cx + px, gy + 1.15, cz + 1.2, 0.78, 1.6, 0.65, 'rust', { tile: 1.2, tint: [0.85, 0.42, 0.24, 1] });
      }
      // Small brick cashier building next to canopy
      this._buildHouse(cx + 12.5, cz - 2, 7.5, 4.2, 9.0, 'brick', 'west');
      this.staticLights.push({ x: cx, y: gy + 4.5, z: cz, r: 22, cr: 1.2, cg: 1.05, cb: 0.72 });
    }

    _buildRailcar(cx, cz) {
      const E = this.engine;
      const gy = this.getHeight(cx, cz);
      // Iron underframe & bogies
      E.addStaticBox(cx, gy + 0.75, cz, 13.5, 0.45, 2.7, 'gunmetal', { tile: 3, spec: 0.45 });
      for (const wx of [-4.6, -3.2, 3.2, 4.6]) {
        E.addStaticBox(cx + wx, gy + 0.45, cz - 0.9, 0.85, 0.85, 0.32, 'asphalt', { tile: 1 });
        E.addStaticBox(cx + wx, gy + 0.45, cz + 0.9, 0.85, 0.85, 0.32, 'asphalt', { tile: 1 });
      }
      // Rusted boxcar body (walk-through side doorway or solid bunker cover)
      E.addStaticBox(cx, gy + 2.45, cz - 1.32, 13.4, 2.95, 0.25, 'rust', { tile: 3.5, tint: [0.72, 0.44, 0.34, 1] });
      E.addStaticBox(cx - 4.1, gy + 2.45, cz + 1.32, 5.2, 2.95, 0.25, 'rust', { tile: 2.2, tint: [0.72, 0.44, 0.34, 1] });
      E.addStaticBox(cx + 4.1, gy + 2.45, cz + 1.32, 5.2, 2.95, 0.25, 'rust', { tile: 2.2, tint: [0.72, 0.44, 0.34, 1] });
      E.addStaticBox(cx - 6.6, gy + 2.45, cz, 0.25, 2.95, 2.55, 'rust', { tile: 2, tint: [0.72, 0.44, 0.34, 1] });
      E.addStaticBox(cx + 6.6, gy + 2.45, cz, 0.25, 2.95, 2.55, 'rust', { tile: 2, tint: [0.72, 0.44, 0.34, 1] });
      E.addStaticBox(cx, gy + 4.02, cz, 13.7, 0.28, 2.95, 'roof', { tile: 3, isRoof: true, solid: true });
    }

    _buildPO2FenceLine(x1, z1, x2, z2) {
      const E = this.engine;
      const dist = Math.hypot(x2 - x1, z2 - z1);
      const count = Math.max(1, Math.round(dist / 3.8));
      const ry = Math.atan2(x2 - x1, z2 - z1) - Math.PI * 0.5;
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const x = x1 + (x2 - x1) * t;
        const z = z1 + (z2 - z1) * t;
        const gy = this.getHeight(x, z);
        E.addStaticBox(x, gy + 1.35, z, 3.7, 2.7, 0.42, 'fence_po2', { tile: 1.4, ry });
      }
    }

    _buildBoardwalk(cx, cz, length = 30, ry = 0) {
      const E = this.engine;
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const segs = Math.floor(length / 3.0);
      for (let i = 0; i < segs; i++) {
        const off = (i - (segs - 1) * 0.5) * 3.0;
        const wx = cx + off * cy;
        const wz = cz - off * sy;
        const y = Math.max(-0.08, this.getHeight(wx, wz) + 0.14);
        E.addStaticBox(wx, y, wz, 2.95, 0.14, 1.9, 'wood', { tile: 1.5, ry, solid: false });
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

    respawnAnomaliesAndArtifacts(spawnArtifacts = false) {
      this.anomalies = [];
      this.artifacts = [];
      if (spawnArtifacts) this.artifactsSpawnedByEmission = true;
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
        if (spawnArtifacts && (idx % 2 === 0 || c.tier >= 3)) {
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
      // Smooth 24-hour Day/Night cycle (~7.2 real minutes per full Zone day)
      this.timeOfDay = (this.timeOfDay + dt / 18) % 24;
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const w = ['clear', 'overcast', 'clear', 'rain', 'fog'];
        this.weather = w[Math.floor(Math.random() * w.length)];
        this.weatherTimer = 75 + Math.random() * 65;
      }

      window.SoundEngine.setRainLevel(
        emissionState.phase === 'active' ? 0.085 : (this.weather === 'rain' ? 0.040 : 0.006)
      );

      const sunAngle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
      const sunElev = Math.sin(sunAngle);
      const sunHoriz = Math.cos(sunAngle);
      this.engine.sunDir = [sunHoriz * 0.86, Math.max(-0.35, sunElev), -0.46];

      const dayT = Math.max(0, Math.min(1, (sunElev + 0.10) / 0.55));
      const nightFactor = Math.max(0, Math.min(1, (-sunElev + 0.06) / 0.34));
      const twilight = Math.max(0, 1 - Math.abs(sunElev - 0.03) * 4.2);

      // Base Day <-> Night sky & lighting palette
      let zenR = 0.025 + dayT * 0.23 + twilight * 0.10;
      let zenG = 0.040 + dayT * 0.42 + twilight * 0.04;
      let zenB = 0.085 + dayT * 0.62 + twilight * 0.02;

      let horR = 0.055 + dayT * 0.54 + twilight * 0.36;
      let horG = 0.075 + dayT * 0.62 + twilight * 0.14;
      let horB = 0.125 + dayT * 0.66 - twilight * 0.06;

      let cldR = 0.070 + dayT * 0.72 + twilight * 0.24;
      let cldG = 0.090 + dayT * 0.75 + twilight * 0.08;
      let cldB = 0.130 + dayT * 0.76 - twilight * 0.04;

      let ambR = 0.15 + dayT * 0.31 + twilight * 0.06;
      let ambG = 0.18 + dayT * 0.32 + twilight * 0.02;
      let ambB = 0.24 + dayT * 0.28 - twilight * 0.02;

      let sunR = 0.22 + dayT * 0.88 + twilight * 0.28;
      let sunG = 0.28 + dayT * 0.76 + twilight * 0.06;
      let sunB = 0.42 + dayT * 0.52 - twilight * 0.14;

      let fogD = 0.0085 + nightFactor * 0.0045;

      // Weather adjustments
      if (this.weather === 'overcast') {
        const g = 0.55;
        zenR = zenR * (1 - g) + (zenR + zenG + zenB) * 0.33 * g;
        zenG = zenG * (1 - g) + (zenR + zenG + zenB) * 0.33 * g;
        zenB = zenB * (1 - g) + (zenR + zenG + zenB) * 0.33 * g;
        sunR *= 0.75; sunG *= 0.78; sunB *= 0.82;
        fogD += 0.0035;
      } else if (this.weather === 'rain') {
        zenR *= 0.62; zenG *= 0.68; zenB *= 0.74;
        horR *= 0.68; horG *= 0.74; horB *= 0.78;
        sunR *= 0.55; sunG *= 0.60; sunB *= 0.66;
        fogD += 0.0075;
      } else if (this.weather === 'fog') {
        horR = horR * 0.7 + 0.22 * (0.3 + dayT * 0.7);
        horG = horG * 0.7 + 0.24 * (0.3 + dayT * 0.7);
        horB = horB * 0.7 + 0.23 * (0.3 + dayT * 0.7);
        sunR *= 0.62; sunG *= 0.64; sunB *= 0.65;
        fogD += 0.0115;
      }

      let lightning = 0;
      if (emissionState.phase === 'warning' || emissionState.phase === 'active') {
        const k = emissionState.intensity;
        lightning = emissionState.lightningFlash || 0;
        zenR = zenR * (1 - k) + 0.42 * k; zenG = zenG * (1 - k) + 0.04 * k; zenB = zenB * (1 - k) + 0.05 * k;
        horR = horR * (1 - k) + 0.74 * k; horG = horG * (1 - k) + 0.11 * k; horB = horB * (1 - k) + 0.08 * k;
        cldR = cldR * (1 - k) + 0.56 * k; cldG = cldG * (1 - k) + 0.07 * k; cldB = cldB * (1 - k) + 0.06 * k;
        ambR = ambR * (1 - k) + 0.54 * k; ambG = ambG * (1 - k) + 0.14 * k; ambB = ambB * (1 - k) + 0.11 * k;
        fogD = Math.max(fogD, 0.020 + k * 0.014);
      }

      this.engine.skyZenith = [Math.max(0.01, zenR), Math.max(0.01, zenG), Math.max(0.02, zenB)];
      this.engine.skyHorizon = [Math.max(0.02, horR), Math.max(0.02, horG), Math.max(0.03, horB)];
      this.engine.skyClouds = [Math.max(0.03, cldR), Math.max(0.03, cldG), Math.max(0.04, cldB)];
      this.engine.fogColor = [horR * 0.90, horG * 0.92, horB * 0.94];
      this.engine.fogDensity = fogD;
      this.engine.nightFactor = emissionState.phase === 'active' ? 0.0 : nightFactor;
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
      if (this.timeOfDay < 5.0 || this.timeOfDay >= 21.0) return 'НОЧЬ';
      if (this.timeOfDay < 7.5) return 'РАССВЕТ';
      if (this.timeOfDay >= 17.5) return 'ЗАКАТ';
      if (this.weather === 'overcast') return 'ОБЛАЧНО';
      return 'ЯСНО';
    }
  }

  return { World };
})();
