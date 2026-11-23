// STALZONE Main Game Loop, FPS Controller, Ballistics, 3D Viewmodels & Extraction Logic
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

      this.player = {
        x: 0, y: 0, z: 8,
        vy: 0, onGround: true,
        yaw: 0, pitch: 0,
        hp: 100, stamina: 100, bleeding: 0,
        contam: { rad: 0, bio: 0, therm: 0, psy: 0 },
        healOverTime: 0, healTimer: 0,
        energyBuffTimer: 0,
        activeSlot: 'primary',
        ammoType: 'fmj',
        fireMode: 'auto',
        mags: { ak74m: 30, pm: 8, saiga12: 8, as_val: 20, vss: 10, svd: 10 },
        fireCd: 0, reloadTimer: 0, triggerWasDown: false,
        adsBlend: 0, recoilKick: 0, muzzleFlash: 0,
        boltThrowAnim: 0, holdingDetector: false,
        bobPhase: 0, stepTimer: 0,
        currentSpread: 0.02,
        damageFlash: 0, shake: 0,
        dead: false
      };

      this.ui.applySettingsUI();
      window.addEventListener('resize', () => this.engine.resize());

      // Expose AndroidBridge hooks
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
    }

    toast(msg, kind) {
      this.ui.toast(msg, kind);
    }

    addMoney(amount) {
      this.profile.money += Math.round(amount);
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
      const id = this.profile.equipment[this.player.activeSlot] || this.profile.equipment.primary;
      return window.GameData.getWeaponStats(this.profile, id);
    }

    selectWeaponSlot(slot) {
      if (this.player.reloadTimer > 0) this.player.reloadTimer = 0;
      this.player.holdingDetector = false;
      this.player.activeSlot = slot;
      const wpn = this.getActiveWeaponStats();
      if (!wpn.modes.includes(this.player.fireMode)) this.player.fireMode = wpn.modes[0];
      if (this.player.mags[wpn.id] === undefined) this.player.mags[wpn.id] = wpn.mag;
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
      if (p.holdingDetector || p.reloadTimer > 0) return;
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
        if (this.world.isSafeZone(this.player.x, this.player.z)) {
          this.toast('В Баре запрещено использовать оружие и гранаты!', 'bad');
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
      if (itemId === 'medkit') {
        p.healOverTime = 55;
        p.healTimer = 5.0;
        this.toast('✚ Применена аптечка АИ-2 (+55 HP за 5с)', 'good');
      } else if (itemId === 'bandage') {
        p.bleeding = 0;
        p.hp = Math.min(100, p.hp + 12);
        this.toast('🩹 Кровотечение остановлено', 'good');
      } else if (itemId === 'antirad') {
        p.contam.rad = Math.max(0, p.contam.rad - 68);
        p.contam.bio = Math.max(0, p.contam.bio - 22);
        this.toast('💊 Антирад вывел радиацию', 'good');
      } else if (itemId === 'energy') {
        p.stamina = 100;
        p.energyBuffTimer = 25;
        this.toast('⚡ Энергетик: ускоренный реген стамины 25с', 'good');
      }
    }

    getLookDirection() {
      const p = this.player;
      const cp = Math.cos(p.pitch);
      return {
        x: -Math.sin(p.yaw) * cp,
        y: Math.sin(p.pitch),
        z: -Math.cos(p.yaw) * cp
      };
    }

    damagePlayer(rawDmg, source, ignoreArmor = false) {
      const p = this.player;
      if (p.dead) return;
      if (this.world.isSafeZone(p.x, p.z)) return;
      const derived = window.GameData.getPlayerDerivedStats(this.profile);
      const mult = ignoreArmor ? 1.0 : (1 - derived.bulletRes / 120);
      const dmg = rawDmg * mult;
      p.hp -= dmg;
      if (dmg > 2.5) {
        p.damageFlash = Math.min(1.0, p.damageFlash + 0.55);
        p.shake = Math.max(p.shake, 0.025);
        window.SoundEngine.playHurt();
      }
      if (p.hp <= 0) {
        p.hp = 0;
        this._handlePlayerDeath(source);
      }
    }

    _handlePlayerDeath(reason) {
      const p = this.player;
      p.dead = true;
      this.profile.stats.deaths++;

      // Extraction loop without wipes:
      // Equipped gear (armor, weapons, detector, container + equipped artifacts) stays SAFE!
      // Backpack loot drops into a visible "Сумка с хабаром" on the ground!
      if (this.profile.backpack.length > 0 && !this.world.isSafeZone(p.x, p.z)) {
        this.entities.spawnLootBag(p.x, p.z, 'Ваша Сумка с хабаром', this.profile.backpack, true);
        this.profile.backpack = [
          { id: 'medkit', count: 1 },
          { id: 'bandage', count: 2 },
          { id: 'ammo_fmj', count: 60 }
        ];
      }
      this.save();
      this.ui.showDeathModal(reason);
    }

    respawnAtBar(keepPos = false) {
      const p = this.player;
      if (!keepPos) {
        p.x = 0; p.y = 0; p.z = 8; p.yaw = 0; p.pitch = 0;
      }
      p.vy = 0;
      p.hp = 100;
      p.stamina = 100;
      p.bleeding = 0;
      p.contam = { rad: 0, bio: 0, therm: 0, psy: 0 };
      p.healOverTime = 0; p.healTimer = 0;
      p.dead = false;
      p.reloadTimer = 0;
      this.ui.input.fire = false;
      this.ui.input.ads = false;
    }

    // Find closest interactable (NPC, Stash, Loot Bag, Revealed Artifact, Signal Stash, Proto-Anomaly)
    _findInteractTarget() {
      const p = this.player;
      let best = null;
      let bestD = 3.8;

      for (const n of this.world.npcs) {
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'npc', obj: n, label: `${n.name} — ${n.role}`, shortLabel: n.isBox ? 'СХРОН' : 'ГОВОРИТЬ' };
        }
      }
      for (const b of this.entities.lootBags) {
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'bag', obj: b, label: `Забрать: ${b.title} (${b.items.length} шт.)`, shortLabel: 'ЛУТ' };
        }
      }
      for (const art of this.world.artifacts) {
        if (art.collected || !art.revealed) continue;
        const d = Math.hypot(art.x - p.x, art.z - p.z);
        if (d < bestD) {
          bestD = d;
          const def = window.GameData.ARTIFACTS[art.artId];
          best = { kind: 'artifact', obj: art, label: `Подобрать артефакт «${def.name}»`, shortLabel: 'АРТЕФАКТ' };
        }
      }
      if (this.entities.signalStash) {
        const s = this.entities.signalStash;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'signal', obj: s, label: 'Обыскать тайник сигнала САК', shortLabel: 'ТАЙНИК' };
        }
      }
      for (const pr of this.world.protoAnomalies) {
        if (pr.active || pr.cooldown > 0) continue;
        const d = Math.hypot(pr.x - p.x, pr.z - p.z);
        if (d < 4.5) {
          best = { kind: 'proto', obj: pr, label: `Активировать ${pr.name}`, shortLabel: 'ПРОТО' };
        }
      }
      return best;
    }

    interact() {
      const t = this.currentInteractTarget;
      if (!t) return;
      if (t.kind === 'npc') {
        window.SoundEngine.playUI();
        this.ui.openNpcModal(t.obj.id);
      } else if (t.kind === 'bag') {
        for (const it of t.obj.items) {
          window.GameData.addItemToList(this.profile.backpack, it.id, it.count);
        }
        const idx = this.entities.lootBags.indexOf(t.obj);
        if (idx >= 0) this.entities.lootBags.splice(idx, 1);
        window.SoundEngine.playHeal();
        this.toast(`✔ Подобран хабар (${t.obj.title})!`, 'good');
        this.save();
      } else if (t.kind === 'artifact') {
        t.obj.collected = true;
        window.GameData.addItemToList(this.profile.backpack, t.obj.artId, 1);
        this.profile.stats.artifactsFound++;
        this.progressQuest('pickup_art', 1);
        window.SoundEngine.playHeal();
        const def = window.GameData.ARTIFACTS[t.obj.artId];
        this.toast(`✨ Найден артефакт «${def.name}»! Поместите в контейнер [Tab].`, 'good');
        this.save();
      } else if (t.kind === 'signal') {
        for (const it of t.obj.items) {
          window.GameData.addItemToList(this.profile.backpack, it.id, it.count);
        }
        this.addMoney(t.obj.money);
        this.entities.signalStash = null;
        this.progressQuest('find_signal', 1);
        window.SoundEngine.playHeal();
        this.toast(`📡 Тайник сигнала обыскан! +${t.obj.money} ₽ и редкий бартер!`, 'good');
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

      // Apply camera look
      p.yaw -= inp.lookDX;
      p.pitch = Math.max(-1.42, Math.min(1.42, p.pitch - inp.lookDY));
      inp.lookDX = 0;
      inp.lookDY = 0;

      // Movement & Weight/Stamina math
      const overloaded = derived.weight > derived.maxWeight;
      const isMoving = Math.hypot(inp.moveX, inp.moveZ) > 0.08;
      const canSprint = inp.sprint && isMoving && !inp.ads && !inp.crouch && p.stamina > 4 && !overloaded;

      let speed = 5.4 * derived.speedMult;
      if (overloaded) speed *= 0.62;
      if (this.world.isInSwamp(p.x, p.z)) speed *= 0.72;
      if (inp.crouch) speed *= 0.54;
      else if (inp.ads) speed *= 0.62;
      else if (canSprint) speed *= 1.56;

      if (canSprint) {
        p.stamina = Math.max(0, p.stamina - (16 + Math.max(0, derived.weight - 20) * 0.25) * dt);
      } else {
        const regen = (13 + derived.stamRegenBonus + (p.energyBuffTimer > 0 ? 18 : 0)) * (isMoving ? 0.65 : 1.0);
        p.stamina = Math.min(100, p.stamina + regen * dt);
      }
      if (p.energyBuffTimer > 0) p.energyBuffTimer -= dt;

      // Forward/Right vectors from yaw
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const dx = (fx * inp.moveZ + rx * inp.moveX) * speed * dt;
      const dz = (fz * inp.moveZ + rz * inp.moveX) * speed * dt;

      // Jump & Gravity
      if (inp.jump && p.onGround && p.stamina >= 10) {
        p.vy = 6.7;
        p.onGround = false;
        p.stamina = Math.max(0, p.stamina - 10);
      }
      inp.jump = false;

      const prevVy = p.vy;
      p.vy -= 18.5 * dt;
      const eyeStand = inp.crouch ? 1.15 : 1.72;
      const res = this.engine.moveWithCollisions(p.x, p.y, p.z, dx, p.vy * dt, dz, 0.42, eyeStand);
      p.x = res.x; p.y = res.y; p.z = res.z;

      // Fall damage (e.g., after Springboard anomaly launch!)
      if (res.onGround && !p.onGround && prevVy < -10.5) {
        const fallDmg = Math.min(65, (-prevVy - 9.5) * 6.5);
        this.damagePlayer(fallDmg, 'Падение с высоты', true);
      }
      p.onGround = res.onGround;
      if (p.onGround && p.vy < 0) p.vy = 0;

      // Footsteps & Headbob
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

      // Smooth ADS & Recoil recovery
      const targetAds = (inp.ads && !p.holdingDetector && p.reloadTimer <= 0) ? 1 : 0;
      p.adsBlend += (targetAds - p.adsBlend) * Math.min(1, dt * 13);
      p.recoilKick = Math.max(0, p.recoilKick - dt * 7);
      p.muzzleFlash = Math.max(0, p.muzzleFlash - dt * 16);
      p.boltThrowAnim = Math.max(0, p.boltThrowAnim - dt);
      p.damageFlash = Math.max(0, p.damageFlash - dt * 2.4);
      p.shake = Math.max(0, p.shake - dt * 0.08);

      // Spread calculation
      const baseSpread = wpn.spread * (1 - p.adsBlend) + wpn.adsSpread * p.adsBlend;
      p.currentSpread = baseSpread * (isMoving ? (canSprint ? 1.85 : 1.35) : 1.0) * (inp.crouch ? 0.78 : 1.0);

      // Reload timer
      if (p.reloadTimer > 0) {
        p.reloadTimer -= dt;
        if (p.reloadTimer <= 0) {
          const cur = p.mags[wpn.id] ?? 0;
          const need = wpn.mag - cur;
          const ammoId = 'ammo_' + p.ammoType;
          const avail = window.GameData.countItem(this.profile.backpack, ammoId);
          const load = Math.min(need, avail);
          if (load > 0) {
            window.GameData.removeItemFromList(this.profile.backpack, ammoId, load);
            p.mags[wpn.id] = cur + load;
            window.SoundEngine.playReload('end');
          }
        }
      }

      // Firing logic
      if (p.fireCd > 0) p.fireCd -= dt;
      const firePressed = inp.fire;
      if (firePressed && !p.holdingDetector && p.reloadTimer <= 0 && p.fireCd <= 0) {
        const allowShot = (p.fireMode === 'auto') || !p.triggerWasDown;
        if (allowShot) {
          if (this.world.isSafeZone(p.x, p.z)) {
            if (!p.triggerWasDown) this.toast('Стрельба запрещена в сейв-зоне «Бар»!', 'bad');
          } else {
            this._fireWeapon(wpn);
          }
        }
      }
      p.triggerWasDown = firePressed;

      // Contaminations (4 scales vs armor protection) & Artifacts debuffs
      this._updateContaminationsAndVitals(dt, derived);

      // Detector artifact revealing & beeping
      this._updateDetector(dt, derived);

      // Interact prompt scan
      this.currentInteractTarget = this._findInteractTarget();
    }

    _fireWeapon(wpn) {
      const p = this.player;
      const curMag = p.mags[wpn.id] ?? wpn.mag;
      if (curMag <= 0) {
        this.startReload();
        return;
      }

      p.mags[wpn.id] = curMag - 1;
      p.fireCd = 60 / wpn.rpm;
      p.recoilKick = Math.min(1.0, p.recoilKick + 0.55);
      p.muzzleFlash = wpn.suppressed ? 0.25 : 1.0;

      // Apply camera recoil (vertical + horizontal)
      p.pitch = Math.min(1.42, p.pitch + wpn.recoilV * (1 - p.adsBlend * 0.3));
      p.yaw += (Math.random() - 0.5) * wpn.recoilH * 2;
      window.SoundEngine.playShot(wpn.id, wpn.suppressed);

      const ammoCfg = window.GameData.AMMO_TYPES[p.ammoType];
      const eyeY = p.y + (this.ui.input.crouch ? 1.05 : 1.56);
      const baseDir = this.getLookDirection();

      let anyHit = false, anyHead = false;
      for (let pel = 0; pel < wpn.pellets; pel++) {
        const sx = (Math.random() - 0.5) * p.currentSpread * 2;
        const sy = (Math.random() - 0.5) * p.currentSpread * 2;
        const sz = (Math.random() - 0.5) * p.currentSpread * 2;
        const dx = baseDir.x + sx, dy = baseDir.y + sy, dz = baseDir.z + sz;
        const len = Math.hypot(dx, dy, dz);
        const ndx = dx / len, ndy = dy / len, ndz = dz / len;

        const wallT = this.engine.raycastWorld(p.x, eyeY, p.z, ndx, ndy, ndz, wpn.range);
        const hit = this.entities.raycastEnemies(p.x, eyeY, p.z, ndx, ndy, ndz, wallT);
        const endDist = hit ? hit.dist : wallT;

        this.entities.addTracer(
          p.x + ndx * 0.6, eyeY - 0.08 + ndy * 0.6, p.z + ndz * 0.6,
          p.x + ndx * endDist, eyeY + ndy * endDist, p.z + ndz * endDist,
          wpn.suppressed ? [0.7, 0.9, 1.0, 0.55] : [1.0, 0.88, 0.45, 0.85]
        );

        if (hit) {
          anyHit = true;
          const en = hit.enemy;
          const hsMult = hit.isHeadshot ? 1.75 : 1.0;
          if (hit.isHeadshot) anyHead = true;

          // Effective armor reduction with AP ammo penetration
          const effArmor = Math.max(0, en.armor * (1 - ammoCfg.apBonus));
          const armorMult = 1 - effArmor / 130;
          const mutantMult = en.isHuman ? 1.0 : ammoCfg.mutantMult;
          const finalDmg = wpn.damage * ammoCfg.dmgMult * hsMult * armorMult * mutantMult;

          en.hp -= finalDmg;
          en.hitFlash = 0.16;
          if (Math.random() < ammoCfg.bleedChance) en.bleedTimer = Math.max(en.bleedTimer, 4.5);

          this.entities.spawnParticles(
            p.x + ndx * hit.dist, eyeY + ndy * hit.dist, p.z + ndz * hit.dist,
            hit.isHeadshot ? 10 : 5, [0.85, 0.12, 0.12, 1], 3.5, 0.4, 0.11, 8
          );
          if (en.hp <= 0) {
            this.entities.onEnemyKilled(en, hit.isHeadshot, this, wpn.name);
          }
        } else if (wallT < wpn.range) {
          this.entities.spawnParticles(
            p.x + ndx * wallT, eyeY + ndy * wallT, p.z + ndz * wallT,
            4, [0.85, 0.82, 0.72, 0.9], 2.5, 0.35, 0.08, 7
          );
        }
      }

      if (anyHit) {
        window.SoundEngine.playHitmarker(anyHead);
        this.ui.triggerHitmarker(anyHead);
      }
      if (p.mags[wpn.id] === 0) this.startReload();
    }

    _updateContaminationsAndVitals(dt, derived) {
      const p = this.player;
      const inSafe = this.world.isSafeZone(p.x, p.z);

      // Safe zone rapidly heals & clears contaminations
      if (inSafe) {
        p.hp = Math.min(100, p.hp + dt * 12);
        p.bleeding = Math.max(0, p.bleeding - dt * 20);
        for (const k of ['rad', 'bio', 'therm', 'psy']) {
          p.contam[k] = Math.max(0, p.contam[k] - dt * 22);
        }
        return;
      }

      // Environmental contamination fields vs armor protection (1..4)
      const envGain = { rad: 0, bio: 0, therm: 0, psy: 0 };
      const protMap = { rad: derived.radProt, bio: derived.bioProt, therm: derived.thermProt, psy: derived.psyProt };
      for (const z of this.world.contamZones) {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (d < z.radius) {
          const excess = z.level - protMap[z.type];
          if (excess > 0) {
            envGain[z.type] += excess * 7.5 * (1 - d / (z.radius * 1.25));
          }
        }
      }

      // Apply container-filtered artifact debuffs + natural decay
      for (const k of ['rad', 'bio', 'therm', 'psy']) {
        const net = envGain[k] + derived.artDebuffs[k];
        if (net > 0.05) {
          p.contam[k] = Math.min(100, p.contam[k] + net * dt);
        } else {
          const decay = k === 'therm' ? 9 : (k === 'psy' ? 6 : 2.2);
          p.contam[k] = Math.max(0, p.contam[k] - decay * dt);
        }
      }

      // Geiger counter crackle sound when Radiation > 8
      if (p.contam.rad > 8) {
        this.geigerTimer -= dt;
        if (this.geigerTimer <= 0) {
          this.geigerTimer = Math.max(0.06, 0.52 - (p.contam.rad / 100) * 0.45);
          window.SoundEngine.playGeigerClick();
        }
      }

      // Psy-radiation camera sway/tremor at high levels
      if (p.contam.psy > 35) {
        const psi = (p.contam.psy - 35) / 65;
        p.shake = Math.max(p.shake, psi * 0.014);
        p.yaw += Math.sin(performance.now() * 0.005) * psi * 0.004;
      }

      // Contamination & Bleeding DOT
      if (p.contam.rad > 20) this.damagePlayer(((p.contam.rad - 20) / 80) * 5.5 * dt, 'Лучевая болезнь (Радиация)', true);
      if (p.contam.bio > 20) this.damagePlayer(((p.contam.bio - 20) / 80) * 6.0 * dt, 'Биозаражение', true);
      if (p.contam.therm > 15) this.damagePlayer(((p.contam.therm - 15) / 85) * 11.5 * dt, 'Термические ожоги', true);
      if (p.contam.psy > 25) this.damagePlayer(((p.contam.psy - 25) / 75) * 8.0 * dt, 'Пси-выжигание', true);

      if (p.bleeding > 0) {
        this.damagePlayer((p.bleeding / 100) * 5.2 * dt, 'Потеря крови', true);
        p.bleeding = Math.max(0, p.bleeding - dt * 1.4);
      }

      // Healing over time (Medkit + Artifact regen, reduced by Bio contamination!)
      const bioDebuff = p.contam.bio > 15 ? 0.5 : 1.0;
      if (p.healTimer > 0) {
        const rate = (p.healOverTime / 5.0) * bioDebuff;
        p.hp = Math.min(100, p.hp + rate * dt);
        p.healTimer -= dt;
      }
      if (derived.hpRegen > 0 && p.hp > 0 && p.hp < 100) {
        p.hp = Math.min(100, p.hp + derived.hpRegen * bioDebuff * dt);
      }
    }

    _updateDetector(dt, derived) {
      const p = this.player;
      const det = derived.detector;
      let maxSig = 0;

      if (p.holdingDetector) {
        // Signal Scan proximity
        if (this.entities.signalScan.active) {
          const ds = Math.hypot(p.x - this.entities.signalScan.targetX, p.z - this.entities.signalScan.targetZ);
          maxSig = Math.max(maxSig, Math.max(0, 1 - ds / 70));
        }
        // Artifact detection & manifesting
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

    // Detailed First-Person 3D Voxel Weapon / Detector / Bolt Viewmodel Renderer
    _renderViewmodel(fovDeg) {
      const p = this.player;
      const wpn = this.getActiveWeaponStats();
      if (p.adsBlend > 0.72 && wpn.hasOptic && !p.holdingDetector) return; // Hidden inside sniper scope overlay

      const E = this.engine;
      E.beginViewmodelPass(Math.max(45, fovDeg));

      const bobX = Math.cos(p.bobPhase * 0.5) * 0.015 * (1 - p.adsBlend * 0.8);
      const bobY = Math.abs(Math.sin(p.bobPhase)) * 0.018 * (1 - p.adsBlend * 0.8);

      // Bolt throw hand animation
      if (p.boltThrowAnim > 0) {
        const k = p.boltThrowAnim / 0.4;
        E.drawViewPart(-0.18 + (1 - k) * 0.16, -0.18 + k * 0.1, -0.45 - (1 - k) * 0.25, 0.05, 0.05, 0.14, k * 2, k, [0.78, 0.82, 0.86, 1], 'white', 0.2);
      }

      if (p.holdingDetector) {
        // 3D SAK / Buryat Detector device in hand
        const dx = 0.22 + bobX, dy = -0.22 - bobY, dz = -0.48;
        E.drawViewPart(dx, dy, dz, 0.15, 0.22, 0.06, -0.2, 0.18, [0.22, 0.27, 0.24, 1], 'concrete');
        // Glowing radar screen on detector
        const sig = this.detectorSignalStrength;
        E.drawViewPart(dx, dy + 0.03, dz + 0.032, 0.11, 0.1, 0.01, -0.2, 0.18, [0.12 + sig * 0.8, 0.82, 0.55, 1], 'white', 0.9);
        // Antenna
        E.drawViewPart(dx + 0.05, dy + 0.16, dz, 0.016, 0.14, 0.016, 0, 0, [0.4, 0.42, 0.45, 1], 'white');
        return;
      }

      // Smooth hipfire -> ADS interpolation + recoil kick + reload tilt
      const reloadDrop = p.reloadTimer > 0 ? Math.sin((p.reloadTimer / wpn.reloadTime) * Math.PI) * 0.18 : 0;
      const baseX = (0.24 * (1 - p.adsBlend)) + bobX;
      const baseY = (-0.21 * (1 - p.adsBlend) - 0.135 * p.adsBlend) - bobY - reloadDrop;
      const baseZ = -0.52 + p.recoilKick * 0.09 + p.adsBlend * 0.08;
      const tiltX = p.recoilKick * 0.14 - reloadDrop * 1.4;

      const metal = [0.22, 0.25, 0.27, 1];
      const darkMetal = [0.13, 0.15, 0.16, 1];
      const wood = wpn.id === 'svd' || wpn.id === 'vss' ? [0.46, 0.28, 0.16, 1] : (wpn.id === 'ak74m' ? [0.34, 0.24, 0.16, 1] : [0.18, 0.2, 0.21, 1]);

      if (wpn.id === 'pm') {
        // Makarov Pistol
        E.drawViewPart(baseX, baseY + 0.04, baseZ, 0.055, 0.065, 0.24, 0, tiltX, metal, 'asphalt');
        E.drawViewPart(baseX, baseY - 0.04, baseZ + 0.07, 0.048, 0.12, 0.075, 0, tiltX + 0.2, [0.42, 0.22, 0.14, 1], 'wood');
      } else {
        // Rifle/Shotgun Receiver + Stock + Handguard + Magazine + Barrel
        const barrelLen = wpn.id === 'svd' ? 0.55 : (wpn.id === 'saiga12' ? 0.42 : 0.36);
        // Receiver
        E.drawViewPart(baseX, baseY + 0.02, baseZ + 0.05, 0.075, 0.095, 0.34, 0, tiltX, metal, 'asphalt');
        // Handguard
        E.drawViewPart(baseX, baseY + 0.015, baseZ - 0.18, 0.068, 0.078, 0.24, 0, tiltX, wood, 'wood');
        // Barrel
        E.drawViewPart(baseX, baseY + 0.045, baseZ - 0.25 - barrelLen * 0.35, 0.032, 0.032, barrelLen, 0, tiltX, darkMetal, 'white');
        // Magazine (taller if Extended Mag)
        const magH = this.profile.attachmentsEnabled.extMag ? 0.22 : 0.15;
        E.drawViewPart(baseX, baseY - 0.09, baseZ - 0.03, 0.05, magH, 0.085, 0, tiltX - 0.18, darkMetal, 'asphalt');
        // Front sight post
        E.drawViewPart(baseX, baseY + 0.08, baseZ - 0.36, 0.012, 0.045, 0.015, 0, tiltX, darkMetal, 'white');
      }

      // Attachments rendered directly on 3D weapon!
      if (wpn.suppressed) {
        E.drawViewPart(baseX, baseY + 0.045, baseZ - 0.56, 0.048, 0.048, 0.24, 0, tiltX, [0.12, 0.14, 0.15, 1], 'concrete');
      }
      if (wpn.hasOptic) {
        E.drawViewPart(baseX, baseY + 0.095, baseZ + 0.04, 0.052, 0.052, 0.14, 0, tiltX, darkMetal, 'white');
        // Glowing red collimator dot!
        E.drawViewPart(baseX, baseY + 0.098, baseZ + 0.04, 0.01, 0.01, 0.01, 0, 0, [1.0, 0.22, 0.18, 1], 'white', 2.0);
      }
      if (wpn.hasLaser) {
        E.drawViewPart(baseX + 0.046, baseY + 0.02, baseZ - 0.18, 0.025, 0.025, 0.09, 0, tiltX, [0.16, 0.18, 0.18, 1], 'white');
        E.drawViewPart(baseX + 0.046, baseY + 0.02, baseZ - 1.8, 0.006, 0.006, 3.2, 0, tiltX, [0.2, 1.0, 0.35, 0.55], 'white', 1.8);
      }
      if (p.muzzleFlash > 0.15) {
        const ms = 0.08 + p.muzzleFlash * 0.1;
        E.drawViewPart(baseX, baseY + 0.045, baseZ - (wpn.suppressed ? 0.72 : 0.56), ms, ms, ms, p.bobPhase * 5, 0, [1.0, 0.78, 0.25, 0.9], 'white', 2.2);
      }
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.lastTime) * 0.001);
      this.lastTime = now;

      if (this.started && !this.ui.openModal && !this.player.dead) {
        this.ui.pollKeyboardInput();
        this._updatePlayer(dt);
        this.entities.update(dt, this.player, this);
        this.autosaveTimer -= dt;
        if (this.autosaveTimer <= 0) {
          this.autosaveTimer = 18;
          this.save();
        }
      }

      // Always keep atmosphere & world rendered smoothly (even behind start screen!)
      this.world.updateAtmosphere(dt, this.entities.emission);

      const p = this.player;
      const wpn = this.getActiveWeaponStats();
      const baseFov = 72;
      const fov = baseFov * (1 - p.adsBlend) + wpn.zoomFov * p.adsBlend;
      const eyeH = (this.ui.input.crouch ? 1.05 : 1.56) + Math.sin(p.bobPhase) * 0.045;
      const shakeX = (Math.random() - 0.5) * p.shake;
      const shakeY = (Math.random() - 0.5) * p.shake;

      const camYaw = this.started ? p.yaw + shakeX : (now * 0.00018);
      const camPitch = this.started ? p.pitch + shakeY : -0.1;
      const camX = this.started ? p.x : Math.sin(now * 0.00018) * 14;
      const camY = this.started ? (p.y + eyeH) : 3.2;
      const camZ = this.started ? p.z : Math.cos(now * 0.00018) * 14;

      const lights = this.entities.getDynamicPointLights(p, p.muzzleFlash);
      this.engine.beginFrame(camX, camY, camZ, camYaw, camPitch, fov, lights);
      this.entities.renderAll(now * 0.001);

      if (this.started && !p.dead) {
        this._renderViewmodel(fov);
        this.ui.updateHUD(dt);
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
