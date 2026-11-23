// STALZONE Main Game Loop: Heightmap FPS Controller, Gloved Tactical 3D Weapons, Holo Collimator, Tactical Knife [3] & Extraction
(function () {
  class StalzoneGame {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.profile = window.GameData.loadProfile();
      this.engine = new window.Engine3D.Engine(this.canvas);
      this.world = new window.ZoneWorld.World(this.engine);
      this.entities = new window.EntityManager.Manager(this.world, this.engine);
      this.ui = new window.GameUI.UI(this);

      this.started = false;
      this.detectorSignalStrength = 0;
      this.detectorBeepTimer = 0;
      this.geigerTimer = 0;
      this.currentInteractTarget = null;
      this.autosaveTimer = 15;

      const fac = window.GameData.FACTIONS[this.profile.faction] || window.GameData.FACTIONS.stalker;
      this.player = {
        x: fac.spawnX, y: this.world.getHeight(fac.spawnX, fac.spawnZ), z: fac.spawnZ,
        vy: 0, onGround: true,
        yaw: fac.spawnYaw, pitch: -0.04,
        hp: 100, stamina: 100, bleeding: 0,
        contam: { rad: 0, bio: 0, therm: 0, psy: 0 },
        healOverTime: 0, healTimer: 0,
        energyBuffTimer: 0,
        flashlightOn: false,
        nearCampfire: false,
        activeSlot: 'primary', // 'primary' | 'secondary' | 'melee'
        ammoType: 'fmj',
        fireMode: 'auto',
        mags: { ak74m: 30, pm: 8, saiga12: 8, as_val: 20, vss: 10, svd: 10 },
        fireCd: 0, reloadTimer: 0, triggerWasDown: false,
        adsBlend: 0, recoilKick: 0, muzzleFlash: 0,
        knifeSwing: 0, boltThrowAnim: 0, holdingDetector: false,
        swayX: 0, swayY: 0,
        bobPhase: 0, stepTimer: 0,
        currentSpread: 0.02,
        damageFlash: 0, shake: 0,
        dead: false
      };

      this.onlineMeta = { uid: '', callsign: 'Сталкер', sectorId: 'zone_1', onlineCount: 1 };
      this.chatMessages = [];
      this.onlineSyncTimer = 0.2;

      window.STALZONE_REMOTE_PLAYERS = (list) => {
        if (!this.entities) return;
        const incoming = Array.isArray(list) ? list : [];
        const prevMap = new Map((this.entities.remotePlayers || []).map(r => [r.uid, r]));
        this.entities.remotePlayers = incoming.map(np => {
          const old = prevMap.get(np.uid);
          if (old) {
            return { ...np, rx: old.rx ?? np.x, ry: old.ry ?? np.y, rz: old.rz ?? np.z, ryaw: old.ryaw ?? np.yaw, swing: old.swing ?? 0, hitFlash: old.hitFlash ?? 0 };
          }
          return { ...np, rx: np.x, ry: np.y, rz: np.z, ryaw: np.yaw, swing: 0, hitFlash: 0 };
        });
      };

      window.STALZONE_ONLINE_META = (meta) => {
        if (!meta) return;
        this.onlineMeta = { ...this.onlineMeta, ...meta };
        if (this.ui && this.ui.updateOnlineBadges) this.ui.updateOnlineBadges();
      };

      window.STALZONE_CHAT_UPDATE = (msgs) => {
        this.chatMessages = Array.isArray(msgs) ? msgs : [];
        if (this.ui && this.ui.renderRadioChat) this.ui.renderRadioChat();
      };

      window.STALZONE_PVP_HIT = (hit) => {
        if (!hit || this.player.dead) return;
        if (this.world.isSafeZone(this.player.x, this.player.z, this.profile.faction)) return;
        const dmg = Math.max(1, Math.min(120, Number(hit.damage) || 12));
        this.damagePlayer(dmg, 'bullet', `Игрок ${hit.attackerName || 'Сталкер'} (${hit.weapon || 'оружие'})`);
        this.ui.addKillfeed(`⚔ ${hit.attackerName || 'Игрок'} попал по вам${hit.headshot ? ' [ГОЛОВА]' : ''} (-${dmg} HP)`);
      };

      window.STALZONE_CLOUD_PROFILE = (cp) => {
        if (!cp) return;
        if (typeof cp.money === 'number' && cp.money > this.profile.money) this.profile.money = cp.money;
        if (cp.faction === 'stalker' || cp.faction === 'bandit') this.profile.faction = cp.faction;
        if (typeof cp.kills === 'number' && cp.kills > (this.profile.stats.killsHuman + this.profile.stats.killsMutant)) {
          this.profile.stats.killsHuman = cp.kills;
        }
        if (typeof cp.artifactsFound === 'number' && cp.artifactsFound > this.profile.stats.artifactsFound) {
          this.profile.stats.artifactsFound = cp.artifactsFound;
        }
        window.GameData.saveProfile(this.profile);
      };

      this.ui.applySettingsUI();
      window.addEventListener('resize', () => this.engine.resize());

      window.STALZONE_SAVE = () => this.save();
      window.STALZONE_BACK = () => {
        if (this.ui.openModal) {
          if (this.ui.openModal !== 'modal-death') this.ui.closeAllModals();
          return 'handled';
        }
        return 'exit';
      };

      if (window.AndroidBridge && window.AndroidBridge.onGameReady) {
        try { window.AndroidBridge.onGameReady(); } catch (_) {}
      }

      this.lastTime = performance.now();
      requestAnimationFrame(t => this.loop(t));
    }

    save() {
      window.GameData.saveProfile(this.profile);
      if (window.AndroidBridge && window.AndroidBridge.saveCloudProfile) {
        try {
          const st = this.profile.stats || {};
          window.AndroidBridge.saveCloudProfile(
            this.profile.faction || 'stalker',
            Math.max(0, Math.round(this.profile.money || 0)),
            Math.max(0, Math.round((st.killsHuman || 0) + (st.killsMutant || 0))),
            Math.max(0, Math.round(st.deaths || 0)),
            Math.max(0, Math.round(st.artifactsFound || 0)),
            this.profile.equipment?.primary || 'ak74m',
            this.profile.equipment?.secondary || 'pm',
            this.profile.equipment?.armor || 'leather'
          );
        } catch (_) {}
      }
    }
    toast(msg, kind) { this.ui.toast(msg, kind); }
    addMoney(amount) { this.profile.money += Math.round(amount); }

    setFaction(factionId) {
      if (!window.GameData.FACTIONS[factionId]) return;
      this.profile.faction = factionId;
      this.respawnAtBar(false);
      this.save();
    }

    toggleFlashlight() {
      this.player.flashlightOn = !this.player.flashlightOn;
      window.SoundEngine.playUI();
      this.toast(this.player.flashlightOn ? '🔦 Фонарик включён' : '🔦 Фонарик выключен', '');
    }

    progressQuest(type, amount) {
      for (const q of this.profile.quests) {
        if (q.type === type && !q.claimed && q.progress < q.target) {
          q.progress = Math.min(q.target, q.progress + amount);
          if (q.progress >= q.target) {
            this.toast(`✔ Задание «${q.title}» выполнено! Заберите награду в ПДА [M].`, 'good');
          }
        }
      }
    }

    getActiveWeaponStats() {
      if (this.player.activeSlot === 'melee') {
        return {
          id: 'knife', name: 'Тактический нож', slot: 'melee', level: 0,
          damage: 48, rpm: 130, mag: 0, reloadTime: 0.5, spread: 0.01, adsSpread: 0.01,
          recoilV: 0, recoilH: 0, range: 2.8, pellets: 1, modes: ['semi'],
          suppressed: true, hasOptic: false, hasLaser: false, zoomFov: 68
        };
      }
      const id = this.profile.equipment[this.player.activeSlot] || this.profile.equipment.primary;
      return window.GameData.getWeaponStats(this.profile, id);
    }

    selectWeaponSlot(slot) {
      if (this.player.reloadTimer > 0) this.player.reloadTimer = 0;
      this.player.holdingDetector = false;
      this.player.activeSlot = slot;
      if (slot === 'melee') {
        this.ui.input.ads = false;
      } else {
        const wpn = this.getActiveWeaponStats();
        if (!wpn.modes.includes(this.player.fireMode)) this.player.fireMode = wpn.modes[0];
        if (this.player.mags[wpn.id] === undefined) this.player.mags[wpn.id] = wpn.mag;
      }
      window.SoundEngine.playUI();
    }

    toggleDetector() {
      this.player.holdingDetector = !this.player.holdingDetector;
      if (this.player.holdingDetector) {
        this.ui.input.ads = false;
        this.player.reloadTimer = 0;
      }
      window.SoundEngine.playUI();
    }

    toggleFireMode() {
      const wpn = this.getActiveWeaponStats();
      if (wpn.modes.length < 2) return;
      const idx = wpn.modes.indexOf(this.player.fireMode);
      this.player.fireMode = wpn.modes[(idx + 1) % wpn.modes.length];
      window.SoundEngine.playUI();
    }

    cycleAmmoType() {
      const order = ['fmj', 'ap', 'exp'];
      const idx = order.indexOf(this.player.ammoType);
      this.player.ammoType = order[(idx + 1) % order.length];
      window.SoundEngine.playUI();
      this.toast(`Патроны: ${window.GameData.AMMO_TYPES[this.player.ammoType].name}`, '');
    }

    startReload() {
      const p = this.player;
      if (p.holdingDetector || p.activeSlot === 'melee' || p.reloadTimer > 0) return;
      const wpn = this.getActiveWeaponStats();
      const cur = p.mags[wpn.id] ?? wpn.mag;
      if (cur >= wpn.mag) return;
      const res = window.GameData.countItem(this.profile.backpack, 'ammo_' + p.ammoType);
      if (res <= 0) {
        this.toast('Нет патронов выбранного типа! Смените тип [T] или купите в Баре.', 'bad');
        return;
      }
      p.reloadTimer = wpn.reloadTime;
      window.SoundEngine.playReload('start');
    }

    throwBoltAction() {
      const p = this.player;
      p.boltThrowAnim = 0.4;
      const dir = this.getLookDirection();
      this.entities.throwBolt(p.x, p.y + 1.48, p.z, dir.x, dir.y, dir.z);
      window.SoundEngine.playUI();
    }

    useQuickSlot(slotNum) {
      const map = { 5: 'medkit', 6: 'bandage', 7: 'antirad', 8: 'energy', 9: 'grenade' };
      const itemId = map[slotNum];
      if (!itemId) return;
      if (itemId === 'grenade') {
        if (this.world.isSafeZone(this.player.x, this.player.z, this.profile.faction)) {
          this.toast('На базе запрещено использовать оружие и гранаты!', 'bad');
          return;
        }
        if (!window.GameData.removeItemFromList(this.profile.backpack, 'grenade', 1)) {
          this.toast('Нет гранат РГД-5!', 'bad');
          return;
        }
        const dir = this.getLookDirection();
        this.entities.throwGrenade(this.player.x, this.player.y + 1.5, this.player.z, dir.x, dir.y, dir.z);
        this.toast('💣 Брошена граната РГД-5!', '');
        return;
      }
      this.consumeItem(itemId);
    }

    consumeItem(itemId) {
      const p = this.player;
      if (!window.GameData.removeItemFromList(this.profile.backpack, itemId, 1)) {
        this.toast('Предмет закончился!', 'bad');
        return;
      }
      window.SoundEngine.playHeal();
      if (itemId === 'medkit') { p.healOverTime = 55; p.healTimer = 5.0; this.toast('✚ Аптечка АИ-2 (+55 HP)', 'good'); }
      else if (itemId === 'bandage') { p.bleeding = 0; p.hp = Math.min(100, p.hp + 12); this.toast('🩹 Кровотечение остановлено', 'good'); }
      else if (itemId === 'antirad') { p.contam.rad = Math.max(0, p.contam.rad - 68); p.contam.bio = Math.max(0, p.contam.bio - 22); this.toast('💊 Антирад вывел радиацию', 'good'); }
      else if (itemId === 'energy') { p.stamina = 100; p.energyBuffTimer = 25; this.toast('⚡ Энергетик: реген стамины 25с', 'good'); }
    }

    getLookDirection() {
      const p = this.player;
      const cp = Math.cos(p.pitch);
      return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    }

    damagePlayer(rawDmg, source, ignoreArmor = false) {
      const p = this.player;
      if (p.dead || this.world.isSafeZone(p.x, p.z, this.profile.faction)) return;
      const derived = window.GameData.getPlayerDerivedStats(this.profile);
      const mult = ignoreArmor ? 1.0 : (1 - derived.bulletRes / 120);
      const dmg = rawDmg * mult;
      p.hp -= dmg;
      if (dmg > 2.5) {
        p.damageFlash = Math.min(1.0, p.damageFlash + 0.55);
        p.shake = Math.max(p.shake, 0.025);
        window.SoundEngine.playHurt();
      }
      if (p.hp <= 0) { p.hp = 0; this._handlePlayerDeath(source); }
    }

    _handlePlayerDeath(reason) {
      const p = this.player;
      p.dead = true;
      this.profile.stats.deaths++;
      if (this.profile.backpack.length > 0 && !this.world.isSafeZone(p.x, p.z, this.profile.faction)) {
        this.entities.spawnLootBag(p.x, p.z, 'Ваша Сумка с хабаром', this.profile.backpack, true);
        this.profile.backpack = [
          { id: 'medkit', count: 1, slot: 0 },
          { id: 'bandage', count: 2, slot: 1 },
          { id: 'ammo_fmj', count: 60, slot: 2 }
        ];
      }
      this.save();
      this.ui.showDeathModal(reason);
    }

    respawnAtBar(keepPos = false) {
      const p = this.player;
      const fac = window.GameData.FACTIONS[this.profile.faction] || window.GameData.FACTIONS.stalker;
      if (!keepPos) {
        p.x = fac.spawnX; p.z = fac.spawnZ; p.y = this.world.getHeight(fac.spawnX, fac.spawnZ);
        p.yaw = fac.spawnYaw; p.pitch = -0.04;
      }
      p.vy = 0; p.hp = 100; p.stamina = 100; p.bleeding = 0;
      p.contam = { rad: 0, bio: 0, therm: 0, psy: 0 };
      p.healOverTime = 0; p.healTimer = 0; p.dead = false; p.reloadTimer = 0;
      this.ui.input.fire = false; this.ui.input.ads = false;
    }

    _findInteractTarget() {
      const p = this.player;
      let best = null, bestD = 3.9;
      for (const n of this.world.npcs) {
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d < bestD) { bestD = d; best = { kind: 'npc', obj: n, label: `${n.name} — ${n.role}`, shortLabel: n.isBox ? 'СХРОН' : 'ГОВОРИТЬ' }; }
      }
      for (const b of this.entities.lootBags) {
        if (!b.items || b.items.length === 0) continue;
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < bestD) { bestD = d; best = { kind: 'bag', obj: b, label: `Обыскать: ${b.title} (${b.items.length})`, shortLabel: 'ОБЫСКАТЬ' }; }
      }
      for (const st of this.world.worldStashes) {
        const d = Math.hypot(st.x - p.x, st.z - p.z);
        if (d < bestD) { bestD = d; best = { kind: 'world_stash', obj: st, label: `Тайник: ${st.title} (${st.items.length})`, shortLabel: 'ТАЙНИК' }; }
      }
      for (const art of this.world.artifacts) {
        if (art.collected || !art.revealed) continue;
        const d = Math.hypot(art.x - p.x, art.z - p.z);
        if (d < bestD) { bestD = d; const def = window.GameData.ARTIFACTS[art.artId]; best = { kind: 'artifact', obj: art, label: `Подобрать артефакт «${def.name}»`, shortLabel: 'АРТ' }; }
      }
      if (this.entities.signalStash) {
        const s = this.entities.signalStash;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) { bestD = d; best = { kind: 'signal', obj: s, label: 'Обыскать тайник сигнала САК', shortLabel: 'СИГНАЛ' }; }
      }
      for (const pr of this.world.protoAnomalies) {
        if (pr.active || pr.cooldown > 0) continue;
        if (Math.hypot(pr.x - p.x, pr.z - p.z) < 4.5) best = { kind: 'proto', obj: pr, label: `Активировать ${pr.name}`, shortLabel: 'ПРОТО' };
      }
      return best;
    }

    interact() {
      const t = this.currentInteractTarget;
      if (!t) return;
      if (t.kind === 'npc') { window.SoundEngine.playUI(); this.ui.openNpcModal(t.obj.id); }
      else if (t.kind === 'bag' || t.kind === 'world_stash') {
        window.SoundEngine.playUI();
        window.GameData.ensureSlots(t.obj.items, 12);
        this.ui.openLootModal(t.obj, t.kind);
      } else if (t.kind === 'signal') {
        window.SoundEngine.playUI();
        if (!t.obj.moneyClaimed && t.obj.money > 0) {
          t.obj.moneyClaimed = true;
          this.addMoney(t.obj.money);
          this.progressQuest('find_signal', 1);
          this.toast(`📡 Найдено +${t.obj.money} ₽ в тайнике сигнала!`, 'good');
        }
        window.GameData.ensureSlots(t.obj.items, 12);
        this.ui.openLootModal(t.obj, 'signal');
      } else if (t.kind === 'artifact') {
        t.obj.collected = true;
        window.GameData.addItemToList(this.profile.backpack, t.obj.artId, 1);
        this.profile.stats.artifactsFound++;
        this.progressQuest('pickup_art', 1);
        window.SoundEngine.playHeal();
        this.toast(`✨ Артефакт «${window.GameData.ARTIFACTS[t.obj.artId].name}» в рюкзаке!`, 'good');
        this.save();
      } else if (t.kind === 'proto') {
        this.entities.activateProtoAnomaly(t.obj, this);
      }
    }

    _updatePlayer(dt) {
      const p = this.player;
      const inp = this.ui.input;
      const derived = window.GameData.getPlayerDerivedStats(this.profile);
      const wpn = this.getActiveWeaponStats();

      // Smooth weapon inertia sway from turning!
      p.swayX += (Math.max(-0.04, Math.min(0.04, -inp.lookDX * 0.45)) - p.swayX) * Math.min(1, dt * 11);
      p.swayY += (Math.max(-0.03, Math.min(0.03, inp.lookDY * 0.45)) - p.swayY) * Math.min(1, dt * 11);

      p.yaw -= inp.lookDX;
      p.pitch = Math.max(-1.42, Math.min(1.42, p.pitch - inp.lookDY));
      inp.lookDX = 0; inp.lookDY = 0;

      const overloaded = derived.weight > derived.maxWeight;
      const isMoving = Math.hypot(inp.moveX, inp.moveZ) > 0.08;
      const canSprint = inp.sprint && isMoving && !inp.ads && !inp.crouch && p.stamina > 4 && !overloaded;

      let speed = 5.4 * derived.speedMult;
      if (p.activeSlot === 'melee') speed *= 1.12; // Faster movement with Knife out!
      if (overloaded) speed *= 0.62;
      if (this.world.isInSwamp(p.x, p.z)) speed *= 0.72;
      if (inp.crouch) speed *= 0.54;
      else if (inp.ads) speed *= 0.62;
      else if (canSprint) speed *= 1.56;

      if (canSprint) p.stamina = Math.max(0, p.stamina - (16 + Math.max(0, derived.weight - 20) * 0.25) * dt);
      else p.stamina = Math.min(100, p.stamina + (13 + derived.stamRegenBonus + (p.energyBuffTimer > 0 ? 18 : 0)) * (isMoving ? 0.65 : 1.0) * dt);
      if (p.energyBuffTimer > 0) p.energyBuffTimer -= dt;

      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const dx = (fx * inp.moveZ + rx * inp.moveX) * speed * dt;
      const dz = (fz * inp.moveZ + rz * inp.moveX) * speed * dt;

      if (inp.jump && p.onGround && p.stamina >= 10) { p.vy = 6.7; p.onGround = false; p.stamina = Math.max(0, p.stamina - 10); }
      inp.jump = false;

      const prevVy = p.vy;
      p.vy -= 18.5 * dt;
      const eyeStand = inp.crouch ? 1.15 : 1.72;
      const res = this.engine.moveWithCollisions(p.x, p.y, p.z, dx, p.vy * dt, dz, 0.42, eyeStand);
      p.x = res.x; p.y = res.y; p.z = res.z;

      if (res.onGround && !p.onGround && prevVy < -10.5) {
        this.damagePlayer(Math.min(65, (-prevVy - 9.5) * 6.5), 'Падение с высоты', true);
      }
      p.onGround = res.onGround;
      if (p.onGround && p.vy < 0) p.vy = 0;

      if (isMoving && p.onGround) {
        p.bobPhase += dt * (canSprint ? 13 : 8.5);
        p.stepTimer -= dt;
        if (p.stepTimer <= 0) {
          p.stepTimer = canSprint ? 0.31 : 0.46;
          const surf = this.world.isInSwamp(p.x, p.z) ? 'water' : (Math.abs(p.x) < 10 || this.world.isSafeZone(p.x, p.z) ? 'concrete' : 'grass');
          window.SoundEngine.playFootstep(surf);
        }
      } else {
        p.bobPhase = 0;
      }

      const targetAds = (inp.ads && !p.holdingDetector && p.activeSlot !== 'melee' && p.reloadTimer <= 0) ? 1 : 0;
      p.adsBlend += (targetAds - p.adsBlend) * Math.min(1, dt * 14);
      p.recoilKick = Math.max(0, p.recoilKick - dt * 7);
      p.muzzleFlash = Math.max(0, p.muzzleFlash - dt * 16);
      p.knifeSwing = Math.max(0, p.knifeSwing - dt * 3.4);
      p.boltThrowAnim = Math.max(0, p.boltThrowAnim - dt);
      p.damageFlash = Math.max(0, p.damageFlash - dt * 2.4);
      p.shake = Math.max(0, p.shake - dt * 0.08);

      const baseSpread = wpn.spread * (1 - p.adsBlend) + wpn.adsSpread * p.adsBlend;
      p.currentSpread = baseSpread * (isMoving ? (canSprint ? 1.85 : 1.35) : 1.0) * (inp.crouch ? 0.78 : 1.0);

      if (p.reloadTimer > 0) {
        p.reloadTimer -= dt;
        if (p.reloadTimer <= 0) {
          const cur = p.mags[wpn.id] ?? 0;
          const need = wpn.mag - cur;
          const ammoId = 'ammo_' + p.ammoType;
          const load = Math.min(need, window.GameData.countItem(this.profile.backpack, ammoId));
          if (load > 0) {
            window.GameData.removeItemFromList(this.profile.backpack, ammoId, load);
            p.mags[wpn.id] = cur + load;
            window.SoundEngine.playReload('end');
          }
        }
      }

      if (p.fireCd > 0) p.fireCd -= dt;
      const firePressed = inp.fire;
      if (firePressed && !p.holdingDetector && p.reloadTimer <= 0 && p.fireCd <= 0) {
        const allowShot = (p.fireMode === 'auto' && p.activeSlot !== 'melee') || !p.triggerWasDown;
        if (allowShot) {
          if (p.activeSlot === 'melee') {
            this._slashKnife();
          } else if (this.world.isSafeZone(p.x, p.z, this.profile.faction)) {
            if (!p.triggerWasDown) this.toast('Стрельба запрещена в своей сейв-зоне!', 'bad');
          } else {
            this._fireWeapon(wpn);
          }
        }
      }
      p.triggerWasDown = firePressed;

      this._updateContaminationsAndVitals(dt, derived);
      this._updateDetector(dt, derived);
      this.currentInteractTarget = this._findInteractTarget();

      // Sync real-time online presence to Firestore via AndroidBridge
      this.onlineSyncTimer -= dt;
      if (this.onlineSyncTimer <= 0 && window.AndroidBridge && window.AndroidBridge.syncOnlineState) {
        this.onlineSyncTimer = 0.45;
        try {
          window.AndroidBridge.syncOnlineState(
            this.profile.faction || 'stalker',
            p.x, p.y, p.z, p.yaw,
            Math.max(0, Math.round(p.hp)),
            wpn.id || 'ak74m',
            isMoving,
            p.muzzleFlash > 0.05
          );
        } catch (_) {}
      }
    }

    _slashKnife() {
      const p = this.player;
      p.fireCd = 0.42;
      p.knifeSwing = 1.0;
      const dir = this.getLookDirection();
      const eyeY = p.y + (this.ui.input.crouch ? 1.05 : 1.56);
      const hit = this.entities.raycastEnemies(p.x, eyeY, p.z, dir.x, dir.y, dir.z, 2.9, this.profile.faction);
      const pvpHit = this.entities.raycastRemotePlayers(p.x, eyeY, p.z, dir.x, dir.y, dir.z, hit ? hit.dist : 2.9, this.profile.faction);
      window.SoundEngine.playKnifeSlash(!!(hit || pvpHit));
      if (!this.world.isSafeZone(p.x, p.z, this.profile.faction)) {
        if (pvpHit) {
          const dmg = pvpHit.isHeadshot ? 78 : 44;
          pvpHit.remote.hitFlash = 0.25;
          this.entities.spawnParticles(p.x + dir.x * pvpHit.dist, eyeY + dir.y * pvpHit.dist, p.z + dir.z * pvpHit.dist, 12, [0.85, 0.1, 0.1, 1], 4, 0.45, 0.12, 8);
          window.SoundEngine.playHitmarker(pvpHit.isHeadshot);
          this.ui.triggerHitmarker(pvpHit.isHeadshot);
          if (window.AndroidBridge && window.AndroidBridge.sendPvpHit) {
            try { window.AndroidBridge.sendPvpHit(this.profile.faction || 'stalker', pvpHit.remote.uid, dmg, !!pvpHit.isHeadshot, 'Нож'); } catch (_) {}
          }
        } else if (hit && hit.enemy) {
          const dmg = hit.isHeadshot ? 84 : 48;
          hit.enemy.hp -= dmg;
          hit.enemy.hitFlash = 0.2;
          hit.enemy.bleedTimer = 4.0;
          this.entities.spawnParticles(p.x + dir.x * hit.dist, eyeY + dir.y * hit.dist, p.z + dir.z * hit.dist, 12, [0.85, 0.1, 0.1, 1], 4, 0.45, 0.12, 8);
          window.SoundEngine.playHitmarker(hit.isHeadshot);
          this.ui.triggerHitmarker(hit.isHeadshot);
          if (hit.enemy.hp <= 0) this.entities.onEnemyKilled(hit.enemy, hit.isHeadshot, this, 'Нож');
        }
      }
    }

    _fireWeapon(wpn) {
      const p = this.player;
      const curMag = p.mags[wpn.id] ?? wpn.mag;
      if (curMag <= 0) { this.startReload(); return; }

      p.mags[wpn.id] = curMag - 1;
      p.fireCd = 60 / wpn.rpm;
      p.recoilKick = Math.min(1.0, p.recoilKick + 0.58);
      p.muzzleFlash = wpn.suppressed ? 0.35 : 1.0;

      p.pitch = Math.min(1.42, p.pitch + wpn.recoilV * (1 - p.adsBlend * 0.3));
      p.yaw += (Math.random() - 0.5) * wpn.recoilH * 2;
      window.SoundEngine.playShot(wpn.id, wpn.suppressed);

      // Eject brass shell casing to the right!
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      this.entities.particles.push({
        x: p.x + rx * 0.32, y: p.y + 1.42, z: p.z + rz * 0.32,
        vx: rx * (2.4 + Math.random()), vy: 1.6 + Math.random() * 0.8, vz: rz * (2.4 + Math.random()),
        color: [0.95, 0.78, 0.32, 1], size: 0.045, life: 0.9, maxLife: 0.9, gravity: 11
      });

      const ammoCfg = window.GameData.AMMO_TYPES[p.ammoType];
      const eyeY = p.y + (this.ui.input.crouch ? 1.05 : 1.56);
      const baseDir = this.getLookDirection();

      let anyHit = false, anyHead = false;
      for (let pel = 0; pel < wpn.pellets; pel++) {
        const dx = baseDir.x + (Math.random() - 0.5) * p.currentSpread * 2;
        const dy = baseDir.y + (Math.random() - 0.5) * p.currentSpread * 2;
        const dz = baseDir.z + (Math.random() - 0.5) * p.currentSpread * 2;
        const len = Math.hypot(dx, dy, dz);
        const ndx = dx / len, ndy = dy / len, ndz = dz / len;

        const wallT = this.engine.raycastWorld(p.x, eyeY, p.z, ndx, ndy, ndz, wpn.range);
        const hit = this.entities.raycastEnemies(p.x, eyeY, p.z, ndx, ndy, ndz, wallT, this.profile.faction);
        const pvpHit = this.entities.raycastRemotePlayers(p.x, eyeY, p.z, ndx, ndy, ndz, hit ? hit.dist : wallT, this.profile.faction);
        const endDist = pvpHit ? pvpHit.dist : (hit ? hit.dist : wallT);

        this.entities.addTracer(
          p.x + ndx * 0.65, eyeY - 0.08 + ndy * 0.65, p.z + ndz * 0.65,
          p.x + ndx * endDist, eyeY + ndy * endDist, p.z + ndz * endDist,
          wpn.suppressed ? [0.7, 0.9, 1.0, 0.55] : [1.0, 0.86, 0.42, 0.9]
        );

        if (pvpHit) {
          anyHit = true;
          if (pvpHit.isHeadshot) anyHead = true;
          pvpHit.remote.hitFlash = 0.25;
          const hsMult = pvpHit.isHeadshot ? 1.65 : 1.0;
          const pvpDmg = Math.max(4, Math.min(110, Math.round(wpn.damage * ammoCfg.dmgMult * hsMult * 0.72)));
          this.entities.spawnParticles(p.x + ndx * pvpHit.dist, eyeY + ndy * pvpHit.dist, p.z + ndz * pvpHit.dist, pvpHit.isHeadshot ? 10 : 5, [0.92, 0.14, 0.14, 1], 3.5, 0.4, 0.11, 8);
          if (window.AndroidBridge && window.AndroidBridge.sendPvpHit) {
            try {
              window.AndroidBridge.sendPvpHit(
                this.profile.faction || 'stalker',
                pvpHit.remote.uid,
                pvpDmg,
                !!pvpHit.isHeadshot,
                wpn.name || wpn.id
              );
            } catch (_) {}
          }
          if (pel === 0) {
            this.ui.addKillfeed(`🎯 Попадание по ${pvpHit.remote.name || 'Игроку'}${pvpHit.isHeadshot ? ' [ГОЛОВА]' : ''} (-${pvpDmg})`);
          }
        } else if (hit) {
          anyHit = true;
          const en = hit.enemy;
          const hsMult = hit.isHeadshot ? 1.75 : 1.0;
          if (hit.isHeadshot) anyHead = true;

          const effArmor = Math.max(0, en.armor * (1 - ammoCfg.apBonus));
          const finalDmg = wpn.damage * ammoCfg.dmgMult * hsMult * (1 - effArmor / 130) * (en.isHuman ? 1.0 : ammoCfg.mutantMult);
          en.hp -= finalDmg; en.hitFlash = 0.16;
          if (Math.random() < ammoCfg.bleedChance) en.bleedTimer = Math.max(en.bleedTimer, 4.5);

          this.entities.spawnParticles(p.x + ndx * hit.dist, eyeY + ndy * hit.dist, p.z + ndz * hit.dist, hit.isHeadshot ? 10 : 5, [0.85, 0.12, 0.12, 1], 3.5, 0.4, 0.11, 8);
          if (en.hp <= 0) this.entities.onEnemyKilled(en, hit.isHeadshot, this, wpn.name);
        } else if (wallT < wpn.range) {
          this.entities.spawnParticles(p.x + ndx * wallT, eyeY + ndy * wallT, p.z + ndz * wallT, 4, [0.85, 0.82, 0.72, 0.9], 2.5, 0.35, 0.08, 7);
        }
      }

      if (anyHit) { window.SoundEngine.playHitmarker(anyHead); this.ui.triggerHitmarker(anyHead); }
      if (p.mags[wpn.id] === 0) this.startReload();
    }

    _updateContaminationsAndVitals(dt, derived) {
      const p = this.player;
      // Campfire warming & healing aura anywhere in the Zone!
      p.nearCampfire = false;
      for (const cf of this.world.campfires) {
        if (Math.hypot(p.x - cf.x, p.z - cf.z) < 6.2) { p.nearCampfire = true; break; }
      }
      if (p.nearCampfire) {
        p.hp = Math.min(100, p.hp + dt * 3.8);
        p.stamina = Math.min(100, p.stamina + dt * 15);
        p.contam.rad = Math.max(0, p.contam.rad - dt * 4.5);
        p.contam.bio = Math.max(0, p.contam.bio - dt * 4.5);
      }

      if (this.world.isSafeZone(p.x, p.z, this.profile.faction)) {
        p.hp = Math.min(100, p.hp + dt * 12);
        p.bleeding = Math.max(0, p.bleeding - dt * 20);
        for (const k of ['rad', 'bio', 'therm', 'psy']) p.contam[k] = Math.max(0, p.contam[k] - dt * 22);
        return;
      }

      const envGain = { rad: 0, bio: 0, therm: 0, psy: 0 };
      const protMap = { rad: derived.radProt, bio: derived.bioProt, therm: derived.thermProt, psy: derived.psyProt };
      for (const z of this.world.contamZones) {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (d < z.radius) {
          const excess = z.level - protMap[z.type];
          if (excess > 0) envGain[z.type] += excess * 7.5 * (1 - d / (z.radius * 1.25));
        }
      }
      for (const k of ['rad', 'bio', 'therm', 'psy']) {
        const net = envGain[k] + derived.artDebuffs[k];
        if (net > 0.05) p.contam[k] = Math.min(100, p.contam[k] + net * dt);
        else p.contam[k] = Math.max(0, p.contam[k] - (k === 'therm' ? 9 : (k === 'psy' ? 6 : 2.2)) * dt);
      }

      if (p.contam.rad > 8) {
        this.geigerTimer -= dt;
        if (this.geigerTimer <= 0) {
          this.geigerTimer = Math.max(0.06, 0.52 - (p.contam.rad / 100) * 0.45);
          window.SoundEngine.playGeigerClick();
        }
      }
      if (p.contam.psy > 35) {
        const psi = (p.contam.psy - 35) / 65;
        p.shake = Math.max(p.shake, psi * 0.014);
        p.yaw += Math.sin(performance.now() * 0.005) * psi * 0.004;
      }

      if (p.contam.rad > 20) this.damagePlayer(((p.contam.rad - 20) / 80) * 5.5 * dt, 'Лучевая болезнь', true);
      if (p.contam.bio > 20) this.damagePlayer(((p.contam.bio - 20) / 80) * 6.0 * dt, 'Биозаражение', true);
      if (p.contam.therm > 15) this.damagePlayer(((p.contam.therm - 15) / 85) * 11.5 * dt, 'Термические ожоги', true);
      if (p.contam.psy > 25) this.damagePlayer(((p.contam.psy - 25) / 75) * 8.0 * dt, 'Пси-выжигание', true);
      if (p.bleeding > 0) { this.damagePlayer((p.bleeding / 100) * 5.2 * dt, 'Потеря крови', true); p.bleeding = Math.max(0, p.bleeding - dt * 1.4); }

      const bioDebuff = p.contam.bio > 15 ? 0.5 : 1.0;
      if (p.healTimer > 0) { p.hp = Math.min(100, p.hp + (p.healOverTime / 5.0) * bioDebuff * dt); p.healTimer -= dt; }
      if (derived.hpRegen > 0 && p.hp > 0 && p.hp < 100) p.hp = Math.min(100, p.hp + derived.hpRegen * bioDebuff * dt);
    }

    _updateDetector(dt, derived) {
      const p = this.player;
      const det = derived.detector;
      let maxSig = 0;
      if (p.holdingDetector) {
        if (this.entities.signalScan.active) {
          const ds = Math.hypot(p.x - this.entities.signalScan.targetX, p.z - this.entities.signalScan.targetZ);
          maxSig = Math.max(maxSig, Math.max(0, 1 - ds / 70));
        }
        for (const art of this.world.artifacts) {
          if (art.collected) continue;
          const d = Math.hypot(p.x - art.x, p.z - art.z);
          if (d < det.range) {
            const sig = 1 - d / det.range;
            if (sig > maxSig) maxSig = sig;
            if (d < det.revealDist && !art.revealed) {
              art.revealed = true;
              window.SoundEngine.playRadarBeep();
              this.toast('✨ Детектор проявил скрытый артефакт рядом!', 'good');
            }
          }
        }
        if (maxSig > 0.08) {
          this.detectorBeepTimer -= dt;
          if (this.detectorBeepTimer <= 0) {
            this.detectorBeepTimer = Math.max(0.12, 0.95 - maxSig * 0.82);
            window.SoundEngine.playDetectorPing(maxSig);
          }
        }
      }
      this.detectorSignalStrength = maxSig;
    }

    // === HIGH-DETAIL GLOVED HANDS + SPECULAR 3D WEAPONS + HOLO SIGHT + TACTICAL KNIFE ===
    _renderViewmodel(fovDeg, nowSec) {
      const p = this.player;
      const wpn = this.getActiveWeaponStats();
      if (p.adsBlend > 0.72 && wpn.hasOptic && wpn.id !== 'ak74m' && !p.holdingDetector) return;

      const E = this.engine;
      E.beginViewmodelPass(Math.max(46, fovDeg), p.muzzleFlash);

      const breath = Math.sin(nowSec * 2.1) * 0.004;
      const bobX = Math.cos(p.bobPhase * 0.5) * 0.015 * (1 - p.adsBlend * 0.82) + p.swayX;
      const bobY = Math.abs(Math.sin(p.bobPhase)) * 0.018 * (1 - p.adsBlend * 0.82) + breath + p.swayY;

      const gloveCol = [0.24, 0.26, 0.25, 1];
      const knuckleCol = [0.34, 0.36, 0.35, 1];
      const sleeveCol = [0.46, 0.48, 0.38, 1];

      // Bolt throw animation
      if (p.boltThrowAnim > 0) {
        const k = p.boltThrowAnim / 0.4;
        E.drawViewPart(-0.18 + (1 - k) * 0.16, -0.18 + k * 0.1, -0.45 - (1 - k) * 0.25, 0.05, 0.05, 0.14, k * 2, k, [0.85, 0.88, 0.92, 1], 'gunmetal', 0.15, 0.9);
      }

      // === 1. DETECTOR IN GLOVED HAND ===
      if (p.holdingDetector) {
        const dx = 0.22 + bobX, dy = -0.22 - bobY, dz = -0.48;
        E.drawViewPart(dx + 0.04, dy - 0.12, dz + 0.14, 0.11, 0.12, 0.26, -0.2, 0.2, sleeveCol, 'camo_armor', 0, 0.15);
        E.drawViewPart(dx, dy - 0.06, dz + 0.04, 0.10, 0.10, 0.10, -0.2, 0.15, gloveCol, 'asphalt', 0, 0.35);
        E.drawViewPart(dx, dy, dz, 0.16, 0.23, 0.06, -0.2, 0.18, [0.32, 0.38, 0.34, 1], 'gunmetal', 0, 0.5);
        const sig = this.detectorSignalStrength;
        E.drawViewPart(dx, dy + 0.03, dz + 0.032, 0.12, 0.10, 0.01, -0.2, 0.18, [0.12 + sig * 0.85, 0.88, 0.55, 1], 'white', 1.1, 0.8);
        E.drawViewPart(dx + 0.055, dy + 0.17, dz, 0.018, 0.16, 0.018, 0, 0, [0.5, 0.54, 0.58, 1], 'gunmetal', 0, 0.8);
        return;
      }

      // === 2. TACTICAL COMBAT KNIFE [3] (Screenshot 1 Hero Blade!) ===
      if (p.activeSlot === 'melee') {
        const sw = Math.sin(p.knifeSwing * Math.PI);
        const kx = 0.23 + bobX - sw * 0.28;
        const ky = -0.20 - bobY + sw * 0.06;
        const kz = -0.44 - sw * 0.18;
        const kRotY = -0.28 + sw * 1.15;
        const kRotX = 0.22 - sw * 0.72;
        // Gloved right hand & camo forearm gripping knife
        E.drawViewPart(kx + 0.08, ky - 0.16, kz + 0.16, 0.11, 0.12, 0.28, kRotY, kRotX + 0.2, sleeveCol, 'camo_armor', 0, 0.15);
        E.drawViewPart(kx + 0.02, ky - 0.07, kz + 0.03, 0.09, 0.11, 0.10, kRotY, kRotX, gloveCol, 'asphalt', 0, 0.38);
        E.drawViewPart(kx + 0.02, ky - 0.04, kz - 0.01, 0.095, 0.035, 0.06, kRotY, kRotX, knuckleCol, 'gunmetal', 0, 0.55);
        // Ribbed tactical handle + crossguard
        E.drawViewPart(kx, ky - 0.04, kz, 0.036, 0.13, 0.046, kRotY, kRotX, [0.18, 0.20, 0.22, 1], 'asphalt', 0, 0.4);
        E.drawViewPart(kx, ky + 0.03, kz - 0.01, 0.09, 0.02, 0.035, kRotY, kRotX, [0.35, 0.38, 0.40, 1], 'gunmetal', 0, 0.75);
        // Dark carbon-steel blade + sharpened gleaming silver bevel edge + fuller groove!
        E.drawViewPart(kx, ky + 0.15, kz - 0.03, 0.016, 0.23, 0.056, kRotY, kRotX, [0.38, 0.44, 0.50, 1], 'gunmetal', 0.04, 0.95);
        E.drawViewPart(kx - 0.002, ky + 0.15, kz - 0.056, 0.008, 0.22, 0.014, kRotY, kRotX, [0.85, 0.90, 0.95, 1], 'white', 0.12, 1.0);
        // Spear-point tip
        E.drawViewPart(kx, ky + 0.28, kz - 0.042, 0.012, 0.06, 0.032, kRotY, kRotX + 0.2, [0.68, 0.74, 0.80, 1], 'gunmetal', 0.08, 0.95);
        return;
      }

      // === 3. DETAILED FIREARMS WITH PROPERLY ALIGNED GLOVED HANDS & SLEEVES ===
      const reloadDrop = p.reloadTimer > 0 ? Math.sin((p.reloadTimer / wpn.reloadTime) * Math.PI) * 0.22 : 0;
      const bx = (0.22 * (1 - p.adsBlend)) + bobX;
      const by = (-0.205 * (1 - p.adsBlend) - 0.122 * p.adsBlend) - bobY - reloadDrop;
      const bz = -0.49 + p.recoilKick * 0.08 + p.adsBlend * 0.085;
      const tx = p.recoilKick * 0.13 - reloadDrop * 1.25;

      const steel = [0.44, 0.48, 0.52, 1];
      const darkSteel = [0.26, 0.29, 0.32, 1];
      const railCol = [0.56, 0.60, 0.64, 1];
      const cuffCol = [0.18, 0.20, 0.19, 1];
      const wood = (wpn.id === 'svd' || wpn.id === 'vss') ? [0.64, 0.38, 0.22, 1]
        : (wpn.id === 'ak74m' ? [0.50, 0.32, 0.19, 1] : [0.28, 0.30, 0.32, 1]);

      if (wpn.id === 'pm') {
        // Makarov Pistol: Two-handed tactical grip (right trigger hand + left support palm)
        // Right forearm angled inward from bottom-right to pistol grip
        E.drawViewPart(bx + 0.055, by - 0.115, bz + 0.185, 0.086, 0.086, 0.22, 0.42, tx + 0.38, sleeveCol, 'camo_armor', 0, 0.18);
        E.drawViewPart(bx + 0.018, by - 0.072, bz + 0.110, 0.074, 0.074, 0.055, 0.22, tx + 0.25, cuffCol, 'asphalt', 0, 0.32);
        E.drawViewPart(bx + 0.004, by - 0.052, bz + 0.080, 0.068, 0.082, 0.078, 0.0, tx + 0.14, gloveCol, 'asphalt', 0, 0.40);
        // Left support forearm angled inward from bottom-left cupping right hand
        E.drawViewPart(bx - 0.082, by - 0.120, bz + 0.165, 0.084, 0.084, 0.22, -0.58, tx + 0.38, sleeveCol, 'camo_armor', 0, 0.18);
        E.drawViewPart(bx - 0.028, by - 0.056, bz + 0.072, 0.052, 0.074, 0.072, -0.25, tx + 0.12, gloveCol, 'asphalt', 0, 0.40);
        E.drawViewPart(bx - 0.022, by - 0.048, bz + 0.042, 0.062, 0.048, 0.032, 0.0, tx, knuckleCol, 'gunmetal', 0, 0.55);

        // Detailed Makarov Pistol (slide, frame, bakelite brown grip, tritium sight)
        E.drawViewPart(bx, by + 0.045, bz, 0.052, 0.062, 0.26, 0, tx, steel, 'gunmetal', 0.03, 0.85);
        E.drawViewPart(bx, by + 0.01, bz + 0.01, 0.046, 0.025, 0.22, 0, tx, darkSteel, 'gunmetal', 0, 0.7);
        E.drawViewPart(bx, by - 0.045, bz + 0.08, 0.048, 0.12, 0.075, 0, tx + 0.22, [0.58, 0.28, 0.16, 1], 'wood', 0, 0.35);
        E.drawViewPart(bx, by + 0.082, bz - 0.11, 0.01, 0.012, 0.012, 0, tx, [0.4, 1.0, 0.45, 1], 'white', 1.4);
      } else {
        // Right Trigger Hand + Forearm (connected seamlessly to pistol grip!)
        E.drawViewPart(bx + 0.062, by - 0.118, bz + 0.212, 0.088, 0.088, 0.22, 0.50, tx + 0.40, sleeveCol, 'camo_armor', 0, 0.18);
        E.drawViewPart(bx + 0.022, by - 0.080, bz + 0.145, 0.076, 0.076, 0.052, 0.28, tx + 0.28, cuffCol, 'asphalt', 0, 0.32);
        E.drawViewPart(bx + 0.008, by - 0.064, bz + 0.118, 0.068, 0.082, 0.074, 0.05, tx + 0.18, gloveCol, 'asphalt', 0, 0.40);
        // Right thumb & fingers wrapping pistol grip
        E.drawViewPart(bx - 0.026, by - 0.045, bz + 0.105, 0.024, 0.032, 0.052, -0.2, tx, knuckleCol, 'gunmetal', 0, 0.52);

        // Left Support Hand + Forearm (angled INWARD from bottom-left directly under handguard!)
        E.drawViewPart(bx - 0.095, by - 0.095, bz - 0.105, 0.084, 0.084, 0.24, -0.66, tx + 0.44, sleeveCol, 'camo_armor', 0, 0.18);
        E.drawViewPart(bx - 0.034, by - 0.046, bz - 0.180, 0.074, 0.070, 0.054, -0.42, tx + 0.24, cuffCol, 'asphalt', 0, 0.32);
        // Gloved palm cradling bottom of handguard + thumb & fingers gripping sides
        E.drawViewPart(bx - 0.006, by - 0.030, bz - 0.205, 0.076, 0.056, 0.088, -0.08, tx, gloveCol, 'asphalt', 0, 0.40);
        E.drawViewPart(bx - 0.042, by + 0.002, bz - 0.202, 0.024, 0.052, 0.076, 0.0, tx, knuckleCol, 'gunmetal', 0, 0.54);
        E.drawViewPart(bx + 0.034, by - 0.004, bz - 0.206, 0.020, 0.044, 0.068, 0.0, tx, gloveCol, 'asphalt', 0, 0.42);

        const barrelLen = wpn.id === 'svd' ? 0.56 : (wpn.id === 'saiga12' ? 0.42 : 0.36);
        // Stamped Metal Receiver + Ribbed Top Dust Cover + Picatinny Rail
        E.drawViewPart(bx, by + 0.02, bz + 0.05, 0.074, 0.088, 0.35, 0, tx, steel, 'gunmetal', 0.03, 0.82);
        E.drawViewPart(bx, by + 0.068, bz + 0.04, 0.054, 0.024, 0.31, 0, tx, darkSteel, 'gunmetal', 0.02, 0.9);
        E.drawViewPart(bx, by + 0.084, bz + 0.04, 0.036, 0.012, 0.24, 0, tx, railCol, 'gunmetal', 0.04, 0.95);
        // Side charging handle
        E.drawViewPart(bx + 0.048, by + 0.045, bz - 0.02, 0.032, 0.018, 0.022, 0, tx, railCol, 'gunmetal', 0.05, 0.95);
        // Wood / Polymer Handguard & Gas Tube
        E.drawViewPart(bx, by + 0.015, bz - 0.19, 0.068, 0.072, 0.24, 0, tx, wood, 'wood', 0, 0.32);
        E.drawViewPart(bx, by + 0.060, bz - 0.19, 0.036, 0.030, 0.22, 0, tx, darkSteel, 'gunmetal', 0.02, 0.78);
        // Barrel & Front Sight Block
        E.drawViewPart(bx, by + 0.042, bz - 0.26 - barrelLen * 0.34, 0.030, 0.030, barrelLen, 0, tx, darkSteel, 'gunmetal', 0.02, 0.88);
        E.drawViewPart(bx, by + 0.078, bz - 0.36, 0.014, 0.046, 0.020, 0, tx, darkSteel, 'gunmetal', 0, 0.7);
        // Pistol Grip & Curved Magazine
        E.drawViewPart(bx, by - 0.07, bz + 0.13, 0.046, 0.12, 0.062, 0, tx + 0.26, wood, 'wood', 0, 0.25);
        const magH = this.profile.attachmentsEnabled.extMag ? 0.23 : 0.155;
        E.drawViewPart(bx, by - 0.085, bz - 0.035, 0.048, magH, 0.082, 0, tx - 0.20, wpn.id === 'ak74m' ? [0.56, 0.30, 0.18, 1] : darkSteel, 'gunmetal', 0, 0.45);
      }

      // === ATTACHMENTS: SUPPRESSOR, TRANSLUCENT EOTECH HOLO COLLIMATOR, LASER ===
      if (wpn.suppressed) {
        E.drawViewPart(bx, by + 0.042, bz - 0.56, 0.052, 0.052, 0.26, 0, tx, [0.24, 0.26, 0.28, 1], 'gunmetal', 0.02, 0.75);
      }
      if (wpn.hasOptic) {
        E.drawViewPart(bx, by + 0.095, bz + 0.04, 0.056, 0.018, 0.12, 0, tx, darkSteel, 'gunmetal', 0, 0.75);
        E.drawViewPart(bx - 0.026, by + 0.122, bz + 0.04, 0.008, 0.048, 0.075, 0, tx, darkSteel, 'gunmetal', 0, 0.8);
        E.drawViewPart(bx + 0.026, by + 0.122, bz + 0.04, 0.008, 0.048, 0.075, 0, tx, darkSteel, 'gunmetal', 0, 0.8);
        E.drawViewPart(bx, by + 0.146, bz + 0.04, 0.060, 0.008, 0.078, 0, tx, darkSteel, 'gunmetal', 0, 0.85);
        E.drawViewPart(bx, by + 0.122, bz + 0.04, 0.044, 0.040, 0.005, 0, tx, [0.4, 0.75, 0.78, 0.24], 'white', 0.2, 0.9, false);
        E.drawViewPart(bx, by + 0.122, bz + 0.036, 0.007, 0.007, 0.004, 0, tx, [1.0, 0.18, 0.14, 0.95], 'white', 2.8, 0, false);
      }
      if (wpn.hasLaser) {
        E.drawViewPart(bx + 0.046, by + 0.02, bz - 0.18, 0.026, 0.026, 0.09, 0, tx, darkSteel, 'gunmetal', 0, 0.7);
        E.drawViewPart(bx + 0.046, by + 0.02, bz - 1.9, 0.006, 0.006, 3.4, 0, tx, [0.22, 1.0, 0.36, 0.58], 'white', 2.0, 0, false);
      }

      // Fiery multi-layer Muzzle Flame Cone
      if (p.muzzleFlash > 0.12) {
        const mz = bz - (wpn.suppressed ? 0.73 : 0.56);
        const s = (0.09 + p.muzzleFlash * 0.13) * (wpn.suppressed ? 0.55 : 1.0);
        E.drawViewPart(bx, by + 0.042, mz, s * 1.4, s * 1.4, s * 1.9, nowSec * 40, 0, [1.0, 0.56, 0.12, 0.85], 'white', 2.6, 0, false);
        E.drawViewPart(bx, by + 0.042, mz - 0.04, s * 0.8, s * 0.8, s * 2.4, -nowSec * 30, 0, [1.0, 0.95, 0.55, 0.95], 'white', 3.0, 0, false);
      }
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.lastTime) * 0.001);
      const nowSec = now * 0.001;
      this.lastTime = now;

      if (this.started && !this.ui.openModal && !this.player.dead) {
        this.ui.pollKeyboardInput();
        this._updatePlayer(dt);
        this.entities.update(dt, this.player, this);
        this.autosaveTimer -= dt;
        if (this.autosaveTimer <= 0) { this.autosaveTimer = 18; this.save(); }
      }

      this.world.updateAtmosphere(dt, this.entities.emission);

      const p = this.player;
      const wpn = this.getActiveWeaponStats();
      const baseFov = 72;
      const fov = baseFov * (1 - p.adsBlend) + wpn.zoomFov * p.adsBlend;
      const eyeH = (this.ui.input.crouch ? 1.05 : 1.56) + Math.sin(p.bobPhase) * 0.045;
      const shakeX = (Math.random() - 0.5) * p.shake;
      const shakeY = (Math.random() - 0.5) * p.shake;

      // Cinematic orbit over active faction base campfire behind the Start overlay
      const fac = window.GameData.FACTIONS[this.profile.faction] || window.GameData.FACTIONS.stalker;
      const orbX = fac.id === 'bandit' ? -140.2 : 4.6;
      const orbZ = fac.id === 'bandit' ? 80.2 : 2.2;
      const camYaw = this.started ? p.yaw + shakeX : (nowSec * 0.16);
      const camPitch = this.started ? p.pitch + shakeY : -0.14;
      const camX = this.started ? p.x : orbX + Math.sin(nowSec * 0.16) * 11;
      const camY = this.started ? (p.y + eyeH) : 3.2;
      const camZ = this.started ? p.z : orbZ + Math.cos(nowSec * 0.16) * 11;

      const lights = this.entities.getDynamicPointLights(p, p.muzzleFlash);
      this.engine.beginFrame(camX, camY, camZ, camYaw, camPitch, fov, lights, nowSec);
      this.entities.renderAll(nowSec, p);

      if (this.started && !p.dead) {
        this._renderViewmodel(fov, nowSec);
        this.ui.updateHUD(dt);
        this.ui.renderWorldMarkers(nowSec);
      } else {
        this.ui.clearWorldMarkers();
      }

      requestAnimationFrame(t => this.loop(t));
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      window.STALZONE = new StalzoneGame();
    } catch (err) {
      document.body.innerHTML = `<div style="padding:24px;color:#ff8070;font-family:monospace">STALZONE WebGL Init Error: ${err.message}</div>`;
    }
  });
})();
