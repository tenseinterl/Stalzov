// STALZONE AI Entities, Detailed Blocky-Armored Stalkers/Mutants, Heightmap Physics, Campfire Flames & Emission
window.EntityManager = (function () {
  class Manager {
    constructor(world, engine) {
      this.world = world;
      this.engine = engine;
      this.enemies = [];
      this.lootBags = [];
      this.projectiles = [];
      this.tracers = [];
      this.particles = [];
      this.signalStash = null;
      this.signalScan = { active: false, progress: 0, targetX: 0, targetZ: 0 };

      this.emission = {
        phase: 'calm',
        timer: 320,
        intensity: 0,
        lightningFlash: 0,
        thunderTimer: 2
      };

      this.spawnAllSpots();
    }

    spawnAllSpots() {
      for (const spot of this.world.spots) this._populateSpot(spot);
    }

    _populateSpot(spot) {
      const alive = this.enemies.filter(e => e.spotId === spot.id && e.hp > 0).length;
      if (alive > 0) return;

      if (spot.kind === 'dogs') {
        for (let i = 0; i < 3; i++) {
          this._spawnEnemy('dog', spot.x + (Math.random() - 0.5) * 10, spot.z + (Math.random() - 0.5) * 10, spot.id, spot.tier);
        }
      } else if (spot.kind === 'boars') {
        for (let i = 0; i < 2; i++) {
          this._spawnEnemy('boar', spot.x + (Math.random() - 0.5) * 10, spot.z + (Math.random() - 0.5) * 10, spot.id, spot.tier);
        }
      } else if (spot.kind === 'bloodsucker') {
        this._spawnEnemy('bloodsucker', spot.x, spot.z, spot.id, spot.tier);
        this._spawnEnemy('dog', spot.x + 5, spot.z - 4, spot.id, spot.tier);
      } else if (spot.kind === 'bandits') {
        const count = spot.tier >= 3 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          this._spawnEnemy('bandit', spot.x + (Math.random() - 0.5) * 12, spot.z + (Math.random() - 0.5) * 12, spot.id, spot.tier);
        }
      }
    }

    _spawnEnemy(kind, x, z, spotId, tier = 1) {
      const cfg = {
        dog: { name: 'Слепой пёс', isHuman: false, hp: 65, speed: 6.8, dmg: 13, radius: 0.48, height: 0.85, range: 1.9, armor: 5 },
        boar: { name: 'Кабан-мутант', isHuman: false, hp: 140, speed: 5.6, dmg: 24, radius: 0.72, height: 1.25, range: 2.4, armor: 18 },
        bloodsucker: { name: 'Кровосос', isHuman: false, hp: 230, speed: 6.4, dmg: 30, radius: 0.52, height: 1.95, range: 2.4, armor: 22 },
        bandit: {
          name: tier >= 3 ? 'Наёмник Севера' : (tier === 2 ? 'Опытный Бандит' : 'Бандит-мародёр'),
          isHuman: true,
          hp: tier >= 3 ? 165 : (tier === 2 ? 120 : 95),
          speed: 3.9,
          dmg: tier >= 3 ? 16 : (tier === 2 ? 12 : 9),
          radius: 0.44, height: 1.88, range: 35,
          armor: tier >= 3 ? 42 : (tier === 2 ? 26 : 14)
        }
      }[kind];

      const gy = this.world.getHeight(x, z);
      this.enemies.push({
        id: 'en_' + Math.random().toString(36).slice(2, 9),
        kind, spotId, tier,
        name: cfg.name, isHuman: cfg.isHuman,
        x, y: gy, z,
        homeX: x, homeZ: z,
        yaw: Math.random() * 6.28,
        hp: cfg.hp, maxHp: cfg.hp,
        speed: cfg.speed, dmg: cfg.dmg,
        radius: cfg.radius, height: cfg.height,
        range: cfg.range, armor: cfg.armor,
        atkCd: 0, burstLeft: 0, burstPause: 0,
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        strafeTimer: 1.5, chargeTimer: 0, bleedTimer: 0,
        cloakAlpha: 1.0, animPhase: Math.random() * 6.28,
        hitFlash: 0, patrolTarget: null, lootedBag: []
      });
    }

    spawnLootBag(x, z, title, items, isPlayerBag = false) {
      if (!items || items.length === 0) return;
      this.lootBags.push({
        id: 'bag_' + Math.random().toString(36).slice(2, 9),
        x, y: this.world.getHeight(x, z), z,
        title,
        items: items.map(i => ({ id: i.id, count: i.count })),
        isPlayerBag
      });
    }

    throwBolt(ox, oy, oz, dx, dy, dz) {
      this.projectiles.push({
        kind: 'bolt', x: ox, y: oy, z: oz,
        vx: dx * 18, vy: dy * 18 + 3.2, vz: dz * 18,
        life: 4.5, bounced: false
      });
    }

    throwGrenade(ox, oy, oz, dx, dy, dz) {
      this.projectiles.push({
        kind: 'grenade', x: ox, y: oy, z: oz,
        vx: dx * 15, vy: dy * 15 + 4.2, vz: dz * 15,
        life: 2.6, bounced: false
      });
    }

    addTracer(x1, y1, z1, x2, y2, z2, color) {
      this.tracers.push({ x1, y1, z1, x2, y2, z2, color, life: 0.08, maxLife: 0.08 });
    }

    spawnParticles(x, y, z, count, color, speed = 3.5, life = 0.55, size = 0.14, gravity = 6) {
      for (let i = 0; i < count; i++) {
        if (this.particles.length > 290) this.particles.shift();
        this.particles.push({
          x, y, z,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() * 0.8 + 0.2) * speed,
          vz: (Math.random() - 0.5) * speed,
          color, size, life, maxLife: life, gravity
        });
      }
    }

    triggerEmissionNow(game) {
      if (this.emission.phase === 'calm') {
        this.emission.phase = 'warning';
        this.emission.timer = 18;
        window.SoundEngine.setEmissionSiren(true);
        game.toast('⚠ ВНИМАНИЕ! НАЧИНАЕТСЯ ВЫБРОС! Ищите крышу или Бар!', 'bad');
      }
    }

    startSignalScan(px, pz, game) {
      if (this.signalScan.active) return;
      let tx = px, tz = pz;
      for (let tries = 0; tries < 20; tries++) {
        const ang = Math.random() * Math.PI * 2;
        const d = 28 + Math.random() * 38;
        tx = Math.max(-135, Math.min(135, px + Math.cos(ang) * d));
        tz = Math.max(-135, Math.min(135, pz + Math.sin(ang) * d));
        if (!this.world.isSafeZone(tx, tz)) break;
      }
      this.signalScan = { active: true, progress: 0, targetX: tx, targetZ: tz };
      this.signalStash = null;
      game.toast('📡 САК: Частота поймана! Следуйте по шкале детектора.', 'good');
    }

    activateProtoAnomaly(proto, game) {
      if (proto.active || proto.cooldown > 0) return;
      proto.active = true;
      proto.progress = 0;
      proto.waveTimer = 1.5;
      game.toast('⚡ Протоаномалия активирована! Отразите волны мутантов!', 'good');
      window.SoundEngine.playAnomaly('electro');
    }

    update(dt, player, game) {
      this._updateEmission(dt, player, game);

      for (const spot of this.world.spots) {
        if (spot.clearedCooldown > 0) {
          spot.clearedCooldown -= dt;
          if (spot.clearedCooldown <= 0) this._populateSpot(spot);
        }
      }

      for (const proto of this.world.protoAnomalies) {
        if (proto.cooldown > 0) proto.cooldown -= dt;
        if (!proto.active) continue;
        const d = Math.hypot(player.x - proto.x, player.z - proto.z);
        if (d < 22) {
          proto.progress += dt * 4.8;
          proto.waveTimer -= dt;
          const py = this.world.getHeight(proto.x, proto.z);
          if (Math.random() < 0.38) {
            this.spawnParticles(proto.x + (Math.random() - 0.5) * 4, py + 1.8, proto.z + (Math.random() - 0.5) * 4, 2, [0.3, 0.9, 1, 1], 4, 0.4, 0.16, 0);
          }
          if (proto.waveTimer <= 0) {
            proto.waveTimer = 6.2;
            const kind = proto.tier >= 3 && Math.random() > 0.55 ? 'bloodsucker' : (Math.random() > 0.45 ? 'boar' : 'dog');
            const ang = Math.random() * 6.28;
            this._spawnEnemy(kind, proto.x + Math.cos(ang) * 14, proto.z + Math.sin(ang) * 14, null, proto.tier);
            window.SoundEngine.playAnomaly('electro');
          }
          if (proto.progress >= 100) {
            proto.active = false;
            proto.progress = 0;
            proto.cooldown = 120;
            const reward = proto.tier >= 3
              ? [{ id: 'res_data', count: 4 }, { id: 'res_radio', count: 3 }, { id: 'prism', count: 1 }]
              : [{ id: 'res_moss', count: 4 }, { id: 'res_radio', count: 3 }, { id: 'flash', count: 1 }];
            this.spawnLootBag(proto.x, proto.z, 'Лут Протоаномалии', reward, false);
            game.addMoney(proto.tier >= 3 ? 4500 : 2200);
            game.progressQuest('clear_proto', 1);
            game.toast('⚡ Протоаномалия заряжена! Заберите ценный лут!', 'good');
            window.SoundEngine.playExplosion();
          }
        }
      }

      if (this.signalScan.active && !this.signalStash) {
        const d = Math.hypot(player.x - this.signalScan.targetX, player.z - this.signalScan.targetZ);
        if (d < 10) {
          this.signalScan.active = false;
          this.signalStash = {
            x: this.signalScan.targetX,
            y: this.world.getHeight(this.signalScan.targetX, this.signalScan.targetZ),
            z: this.signalScan.targetZ,
            items: [
              { id: 'res_radio', count: 3 },
              { id: 'res_data', count: this.signalScan.targetZ < -20 ? 2 : 1 },
              { id: 'ammo_ap', count: 30 },
              { id: 'tools', count: 1 }
            ],
            money: 1800
          };
          game.toast('📡 Тайник сигнала обнаружен рядом! Обыщите [F].', 'good');
          window.SoundEngine.playRadarBeep();
        }
      }

      this._updateAnomalies(dt, player, game);
      this._updateProjectiles(dt, player, game);
      this._updateEnemies(dt, player, game);

      for (let i = this.tracers.length - 1; i >= 0; i--) {
        this.tracers[i].life -= dt;
        if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const gy = this.world.getHeight(p.x, p.z) + 0.05;
        if (p.y < gy) { p.y = gy; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
      }

      // Live campfire rising embers & flame sparks!
      for (const cf of this.world.campfires) {
        if (Math.hypot(player.x - cf.x, player.z - cf.z) < 38 && Math.random() < 0.55) {
          this.spawnParticles(cf.x + (Math.random() - 0.5) * 0.5, cf.y + 0.45, cf.z + (Math.random() - 0.5) * 0.5, 1, [1.0, 0.55 + Math.random() * 0.35, 0.12, 0.95], 1.4, 0.85, 0.09, -2.2);
        }
      }

      // Twilight rain streaks!
      if (this.world.weather === 'rain' || this.emission.phase === 'active') {
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            x: player.x + (Math.random() - 0.5) * 28,
            y: player.y + 11.5,
            z: player.z + (Math.random() - 0.5) * 28,
            vx: -1.4, vy: -20, vz: -0.7,
            color: this.emission.phase === 'active' ? [1.0, 0.35, 0.25, 0.6] : [0.72, 0.82, 0.86, 0.42],
            size: 0.05, life: 0.6, maxLife: 0.6, gravity: 0
          });
        }
      }
    }

    _updateEmission(dt, player, game) {
      const E = this.emission;
      E.lightningFlash = Math.max(0, E.lightningFlash - dt * 3.5);
      E.timer -= dt;

      if (E.phase === 'calm') {
        E.intensity = Math.max(0, E.intensity - dt * 0.5);
        if (E.timer <= 0) {
          E.phase = 'warning'; E.timer = 22;
          window.SoundEngine.setEmissionSiren(true);
          game.toast('⚠ СИРЕНА БАЗЫ! ПРИБЛИЖАЕТСЯ ВЫБРОС — УКРОЙТЕСЬ ПОД КРЫШЕЙ!', 'bad');
        }
      } else if (E.phase === 'warning') {
        E.intensity = Math.min(0.65, E.intensity + dt * 0.04);
        window.SoundEngine.updateEmissionSiren(performance.now() * 0.001);
        if (E.timer <= 0) {
          E.phase = 'active'; E.timer = 26;
          window.SoundEngine.playThunder();
          E.lightningFlash = 1.0;
          game.toast('☠ ВЫБРОС НАКРЫЛ ЗОНУ! ОСТАВАЙТЕСЬ В УКРЫТИИ!', 'bad');
        }
      } else if (E.phase === 'active') {
        E.intensity = Math.min(1.0, E.intensity + dt * 0.25);
        window.SoundEngine.updateEmissionSiren(performance.now() * 0.001);
        E.thunderTimer -= dt;
        if (E.thunderTimer <= 0) {
          E.thunderTimer = 2.8 + Math.random() * 3.5;
          E.lightningFlash = 1.0;
          window.SoundEngine.playThunder();
        }
        player.shake = Math.max(player.shake, 0.015);
        const sheltered = this.world.isSafeZone(player.x, player.z) ||
          this.engine.hasRoofCover(player.x, player.y + 1.5, player.z);
        if (!sheltered && player.hp > 0) {
          player.contam.psy = Math.min(100, player.contam.psy + dt * 16);
          player.contam.therm = Math.min(100, player.contam.therm + dt * 14);
          game.damagePlayer(dt * 14, 'Выброс (открытое пространство)', true);
        }
        if (E.timer <= 0) {
          E.phase = 'calm'; E.timer = 330;
          window.SoundEngine.setEmissionSiren(false);
          this.world.respawnAnomaliesAndArtifacts();
          game.profile.stats.emissionsSurvived++;
          game.save();
          game.toast('☀ Выброс закончился! Аномалии обновлены, появились свежие артефакты!', 'good');
        }
      }
    }

    _updateAnomalies(dt, player, game) {
      const now = performance.now() * 0.001;
      for (const a of this.world.anomalies) {
        a.pulse += dt * 3.0;
        if (a.cooldown > 0) a.cooldown -= dt;
        const discharged = now < a.dischargedUntil;
        const dPlayer = Math.hypot(player.x - a.x, player.z - a.z);
        const ay = this.world.getHeight(a.x, a.z);

        if (dPlayer < 40 && Math.random() < (discharged ? 0.02 : 0.2)) {
          const pCol = a.type === 'electro' ? [0.4, 0.9, 1.0, 0.95]
            : a.type === 'vortex' ? [0.75, 0.72, 0.62, 0.6]
            : a.type === 'springboard' ? [0.85, 0.95, 1.0, 0.5]
            : a.type === 'burner' ? [1.0, 0.52, 0.12, 0.95]
            : [0.35, 1.0, 0.45, 0.85];
          const ang = Math.random() * 6.28;
          this.spawnParticles(
            a.x + Math.cos(ang) * (a.radius * 0.42), ay + 0.35, a.z + Math.sin(ang) * (a.radius * 0.42),
            1, pCol, a.type === 'burner' ? 2.8 : 1.8, a.type === 'burner' ? 0.95 : 0.5, 0.16, a.type === 'burner' ? -5.5 : 1
          );
        }

        if (discharged) continue;

        if (dPlayer < a.radius) {
          if (a.type === 'vortex') {
            const pull = (1 - dPlayer / a.radius) * 11 * dt;
            const nx = (a.x - player.x) / Math.max(0.2, dPlayer);
            const nz = (a.z - player.z) / Math.max(0.2, dPlayer);
            player.x += nx * pull; player.z += nz * pull;
            if (dPlayer < 1.35 && a.cooldown <= 0) {
              a.cooldown = 2.2;
              window.SoundEngine.playAnomaly('vortex');
              this.spawnParticles(a.x, ay + 1.0, a.z, 18, [0.9, 0.25, 0.2, 0.9], 7, 0.6, 0.22, 4);
              game.damagePlayer(38, 'Аномалия «Воронка»', true);
            }
          } else if (a.type === 'electro' && a.cooldown <= 0) {
            a.cooldown = 2.6;
            window.SoundEngine.playAnomaly('electro');
            this.spawnParticles(a.x, ay + 1.2, a.z, 22, [0.5, 0.92, 1.0, 1], 8, 0.45, 0.18, 1);
            game.damagePlayer(34, 'Аномалия «Электра»', true);
          } else if (a.type === 'springboard' && a.cooldown <= 0) {
            a.cooldown = 2.4;
            window.SoundEngine.playAnomaly('springboard');
            player.vy = 13.5;
            this.spawnParticles(a.x, ay + 0.6, a.z, 16, [0.9, 0.96, 1.0, 0.8], 6, 0.5, 0.2, 1);
            game.damagePlayer(12, 'Аномалия «Батут»', true);
          } else if (a.type === 'burner' && a.cooldown <= 0) {
            a.cooldown = 1.6;
            window.SoundEngine.playAnomaly('burner');
            this.spawnParticles(a.x, ay + 1.5, a.z, 26, [1.0, 0.48, 0.08, 1], 7, 0.85, 0.28, -6);
            player.contam.therm = Math.min(100, player.contam.therm + 34);
            game.damagePlayer(26, 'Аномалия «Жарка»', true);
          } else if (a.type === 'acid') {
            player.contam.bio = Math.min(100, player.contam.bio + dt * 28);
            game.damagePlayer(dt * 16, 'Аномалия «Кисель»', true);
            if (a.cooldown <= 0) { a.cooldown = 0.8; window.SoundEngine.playAnomaly('acid'); }
          }
        }

        if (a.type === 'vortex' || a.type === 'electro') {
          for (const en of this.enemies) {
            if (en.hp <= 0) continue;
            const de = Math.hypot(en.x - a.x, en.z - a.z);
            if (de < a.radius) {
              if (a.type === 'vortex') { en.x += (a.x - en.x) * dt * 2.2; en.z += (a.z - en.z) * dt * 2.2; }
              if (de < 1.8 && a.cooldown <= 0) {
                a.cooldown = 2.0; en.hp -= 55;
                window.SoundEngine.playAnomaly(a.type);
                if (en.hp <= 0) this.onEnemyKilled(en, false, game, 'Аномалия');
              }
            }
          }
        }
      }
    }

    _updateProjectiles(dt, player, game) {
      const now = performance.now() * 0.001;
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.life -= dt;
        p.vy -= 14.5 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

        const gy = this.world.getHeight(p.x, p.z) + 0.12;
        if (p.y <= gy) {
          p.y = gy; p.vy = -p.vy * 0.35; p.vx *= 0.55; p.vz *= 0.55;
          if (!p.bounced) { p.bounced = true; window.SoundEngine.playBoltClang(); }
        }

        if (p.kind === 'bolt') {
          for (const a of this.world.anomalies) {
            if (Math.hypot(p.x - a.x, p.z - a.z) < a.radius && now >= a.dischargedUntil) {
              const ay = this.world.getHeight(a.x, a.z);
              window.SoundEngine.playAnomaly(a.type);
              if (a.type === 'electro') {
                a.dischargedUntil = now + 3.2;
                this.spawnParticles(a.x, ay + 1.1, a.z, 18, [0.45, 0.9, 1.0, 1], 7, 0.45, 0.18, 1);
                game.toast('⚡ «Электра» разряжена болтом (3 сек)!', 'good');
              } else {
                a.dischargedUntil = now + 1.8;
                this.spawnParticles(a.x, ay + 0.9, a.z, 14, [1.0, 0.6, 0.25, 0.9], 5, 0.45, 0.16, 2);
              }
              p.life = 0;
              break;
            }
          }
        }

        if (p.life <= 0) {
          if (p.kind === 'grenade') this._explodeGrenade(p.x, p.y, p.z, player, game);
          this.projectiles.splice(i, 1);
        }
      }
    }

    _explodeGrenade(gx, gy, gz, player, game) {
      window.SoundEngine.playExplosion();
      this.spawnParticles(gx, gy + 0.5, gz, 38, [1.0, 0.58, 0.14, 1], 11, 0.75, 0.28, 8);
      this.spawnParticles(gx, gy + 0.8, gz, 20, [0.35, 0.35, 0.35, 0.85], 6, 1.1, 0.36, -1);

      const dp = Math.hypot(player.x - gx, player.z - gz);
      if (dp < 8.5) {
        player.shake = Math.max(player.shake, 0.055 * (1 - dp / 8.5));
        if (!this.world.isSafeZone(player.x, player.z)) {
          game.damagePlayer((1 - dp / 8.5) * 65, 'Осколки РГД-5', false);
        }
      }
      for (const en of this.enemies) {
        if (en.hp <= 0) continue;
        const de = Math.hypot(en.x - gx, en.z - gz);
        if (de < 9.5) {
          en.hp -= (1 - de / 9.5) * 145;
          en.hitFlash = 0.2;
          if (en.hp <= 0) this.onEnemyKilled(en, false, game, 'РГД-5');
        }
      }
    }

    _updateEnemies(dt, player, game) {
      const playerSafe = this.world.isSafeZone(player.x, player.z);

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const en = this.enemies[i];
        if (en.hp <= 0) { this.enemies.splice(i, 1); continue; }
        en.y = this.world.getHeight(en.x, en.z);

        if (en.hitFlash > 0) en.hitFlash -= dt;
        if (en.atkCd > 0) en.atkCd -= dt;
        if (en.bleedTimer > 0) {
          en.bleedTimer -= dt; en.hp -= dt * 5.5;
          if (en.hp <= 0) { this.onEnemyKilled(en, false, game, 'Кровотечение'); continue; }
        }

        const dx = player.x - en.x, dz = player.z - en.z;
        const dist = Math.hypot(dx, dz);
        const aggroDist = en.isHuman ? 44 : 30;
        const canAggro = !playerSafe && dist < aggroDist && player.hp > 0;

        if (canAggro) {
          en.yaw = Math.atan2(dx, dz);
          en.animPhase += dt * (en.speed * 1.8);

          if (en.isHuman) {
            en.strafeTimer -= dt;
            if (en.strafeTimer <= 0) { en.strafeTimer = 1.2 + Math.random() * 1.4; en.strafeDir = -en.strafeDir; }
            let mx = 0, mz = 0;
            const fx = dx / Math.max(0.01, dist), fz = dz / Math.max(0.01, dist);
            if (dist > 22) { mx += fx; mz += fz; }
            else if (dist < 10) { mx -= fx; mz -= fz; }
            mx += -fz * en.strafeDir * 0.75; mz += fx * en.strafeDir * 0.75;
            this._moveEnemy(en, mx * en.speed * dt, mz * en.speed * dt);

            if (dist < en.range) {
              if (en.burstPause > 0) en.burstPause -= dt;
              else if (en.atkCd <= 0) {
                const ey = en.y + 1.5;
                const py = player.y + 1.4;
                const d3 = Math.hypot(dx, py - ey, dz);
                const los = this.engine.raycastWorld(en.x, ey, en.z, dx / d3, (py - ey) / d3, dz / d3, d3);
                if (los >= d3 - 1.2) {
                  en.atkCd = 0.16;
                  if (en.burstLeft <= 0) en.burstLeft = 3 + Math.floor(Math.random() * 3);
                  en.burstLeft--;
                  if (en.burstLeft <= 0) en.burstPause = 1.1 + Math.random() * 0.9;

                  window.SoundEngine.playEnemyShot(dist);
                  const spread = 0.08 + dist * 0.002;
                  const hit = Math.random() < Math.max(0.18, 0.55 - dist * 0.01);
                  const tx = player.x + (hit ? 0 : (Math.random() - 0.5) * spread * dist);
                  const tz = player.z + (hit ? 0 : (Math.random() - 0.5) * spread * dist);
                  this.addTracer(en.x, ey, en.z, tx, player.y + 1.35, tz, [1.0, 0.82, 0.32, 0.92]);
                  if (hit) game.damagePlayer(en.dmg, en.name, false);
                }
              }
            }
          } else {
            const fx = dx / Math.max(0.01, dist), fz = dz / Math.max(0.01, dist);
            let moveSpeed = en.speed;
            if (en.kind === 'bloodsucker') {
              en.cloakAlpha = (dist > 4.0 && en.hitFlash <= 0) ? 0.22 : 0.95;
            } else if (en.kind === 'boar') {
              en.chargeTimer += dt;
              if (dist < 14 && dist > 3 && Math.sin(en.chargeTimer * 1.4) > 0.35) {
                moveSpeed *= 1.55;
                if (Math.random() < 0.3) this.spawnParticles(en.x, en.y + 0.2, en.z, 1, [0.45, 0.4, 0.32, 0.6], 2, 0.4, 0.2, 2);
              }
            } else if (en.kind === 'dog') {
              const strafe = dist < 6 ? Math.sin(en.animPhase * 0.4) * 0.5 : 0;
              this._moveEnemy(en, (fx - fz * strafe) * moveSpeed * dt, (fz + fx * strafe) * moveSpeed * dt);
              moveSpeed = 0;
            }
            if (moveSpeed > 0 && dist > en.range * 0.85) this._moveEnemy(en, fx * moveSpeed * dt, fz * moveSpeed * dt);
            if (dist <= en.range && en.atkCd <= 0) {
              en.atkCd = en.kind === 'dog' ? 1.0 : (en.kind === 'boar' ? 1.5 : 1.25);
              window.SoundEngine.playMutantGrowl();
              game.damagePlayer(en.dmg, en.name, false);
              if (en.kind === 'bloodsucker' || Math.random() < 0.35) player.bleeding = Math.min(100, player.bleeding + 28);
            }
          }
        } else {
          en.cloakAlpha = 1.0;
          if (en.isHuman) {
            let targetBag = null;
            for (const b of this.lootBags) {
              if (Math.hypot(b.x - en.x, b.z - en.z) < 22 && !this.world.isSafeZone(b.x, b.z)) { targetBag = b; break; }
            }
            if (targetBag) {
              const bx = targetBag.x - en.x, bz = targetBag.z - en.z, bd = Math.hypot(bx, bz);
              en.yaw = Math.atan2(bx, bz);
              if (bd > 1.5) {
                this._moveEnemy(en, (bx / bd) * en.speed * 0.7 * dt, (bz / bd) * en.speed * 0.7 * dt);
                en.animPhase += dt * 4;
              } else {
                en.lootedBag.push(...targetBag.items);
                const bi = this.lootBags.indexOf(targetBag);
                if (bi >= 0) this.lootBags.splice(bi, 1);
                if (targetBag.isPlayerBag) game.toast('⚠ Бандит облутал вашу Сумку с хабаром! Убейте его!', 'bad');
              }
              continue;
            }
          }
          if (!en.patrolTarget || Math.hypot(en.patrolTarget.x - en.x, en.patrolTarget.z - en.z) < 1.5) {
            en.patrolTarget = { x: en.homeX + (Math.random() - 0.5) * 14, z: en.homeZ + (Math.random() - 0.5) * 14 };
          }
          const px = en.patrolTarget.x - en.x, pz = en.patrolTarget.z - en.z, pd = Math.hypot(px, pz);
          if (pd > 0.5) {
            en.yaw = Math.atan2(px, pz);
            this._moveEnemy(en, (px / pd) * en.speed * 0.35 * dt, (pz / pd) * en.speed * 0.35 * dt);
            en.animPhase += dt * 2.5;
          }
        }
      }
    }

    _moveEnemy(en, dx, dz) {
      if (this.world.isSafeZone(en.x + dx, en.z + dz)) return;
      const res = this.engine.moveWithCollisions(en.x, en.y, en.z, dx, 0, dz, en.radius, en.height);
      en.x = res.x; en.y = res.y; en.z = res.z;
    }

    onEnemyKilled(en, isHeadshot, game, weaponLabel) {
      if (en._dead) return;
      en._dead = true; en.hp = 0;
      this.spawnParticles(en.x, en.y + en.height * 0.6, en.z, 18, [0.78, 0.1, 0.1, 1], 4.5, 0.65, 0.16, 8);
      game.ui.pushKillfeed(`${en.name}${isHeadshot ? ' [ГОЛОВА]' : ''} (${weaponLabel})`, isHeadshot);

      if (en.isHuman) { game.profile.stats.killsHuman++; game.progressQuest('kill_human', 1); }
      else { game.profile.stats.killsMutant++; game.progressQuest('kill_mutant', 1); }
      if (isHeadshot) game.profile.stats.headshots++;

      const loot = [...en.lootedBag];
      if (en.isHuman) {
        loot.push({ id: 'ammo_fmj', count: 15 + Math.floor(Math.random() * 20) });
        if (Math.random() < 0.6) loot.push({ id: 'medkit', count: 1 });
        if (Math.random() < 0.55) loot.push({ id: 'loot_pda', count: 1 });
        loot.push({ id: en.tier >= 3 ? 'res_data' : 'res_radio', count: 1 + (en.tier >= 3 ? 2 : 1) });
        if (Math.random() < 0.35) loot.push({ id: 'tools', count: 1 });
        this.spawnLootBag(en.x, en.z, `Сумка: ${en.name}`, loot, false);
      } else {
        const partId = en.kind === 'dog' ? 'part_dog' : (en.kind === 'boar' ? 'part_boar' : 'part_blood');
        loot.push({ id: partId, count: 1 });
        if (Math.random() < 0.65) loot.push({ id: en.tier >= 3 ? 'res_data' : (Math.random() > 0.5 ? 'res_moss' : 'res_root'), count: 1 });
        this.spawnLootBag(en.x, en.z, `Трофей: ${en.name}`, loot, false);
      }

      if (en.spotId) {
        const remaining = this.enemies.filter(o => o.spotId === en.spotId && !o._dead && o.hp > 0).length;
        if (remaining === 0) {
          const spot = this.world.spots.find(s => s.id === en.spotId);
          if (spot) {
            spot.clearedCooldown = 90;
            const bonus = spot.tier * 950;
            const resId = spot.tier >= 3 ? 'res_data' : (spot.tier === 2 ? 'res_radio' : 'res_root');
            window.GameData.addItemToList(game.profile.backpack, resId, 2);
            game.addMoney(bonus);
            game.profile.reputation += spot.tier * 15;
            game.toast(`✔ Спот «${spot.name}» зачищен! +${bonus} ₽ и бартер!`, 'good');
            game.save();
          }
        }
      }
    }

    raycastEnemies(ox, oy, oz, dx, dy, dz, maxDist) {
      let bestHit = null;
      let bestT = maxDist;
      for (const en of this.enemies) {
        if (en.hp <= 0 || en._dead) continue;
        const headH = en.isHuman ? 0.40 : 0.38;
        const headBox = {
          minX: en.x - en.radius * 0.78, maxX: en.x + en.radius * 0.78,
          minY: en.y + en.height - headH, maxY: en.y + en.height + 0.1,
          minZ: en.z - en.radius * 0.78, maxZ: en.z + en.radius * 0.78
        };
        const th = this.engine.rayIntersectsBox(ox, oy, oz, dx, dy, dz, headBox, bestT);
        if (th > 0 && th < bestT) { bestT = th; bestHit = { enemy: en, dist: th, isHeadshot: true }; continue; }

        const bodyBox = {
          minX: en.x - en.radius, maxX: en.x + en.radius,
          minY: en.y, maxY: en.y + en.height - headH,
          minZ: en.z - en.radius, maxZ: en.z + en.radius
        };
        const tb = this.engine.rayIntersectsBox(ox, oy, oz, dx, dy, dz, bodyBox, bestT);
        if (tb > 0 && tb < bestT) { bestT = tb; bestHit = { enemy: en, dist: tb, isHeadshot: false }; }
      }
      return bestHit;
    }

    getDynamicPointLights(player, muzzleLight) {
      const lights = [];
      const now = performance.now() * 0.001;
      for (const L of this.world.staticLights) {
        const flick = L.flicker ? (0.82 + Math.sin(now * 13) * 0.12 + Math.cos(now * 23) * 0.08) : 1.0;
        lights.push({ x: L.x, y: L.y, z: L.z, r: L.r, cr: L.cr * flick, cg: L.cg * flick, cb: L.cb * flick });
      }
      if (muzzleLight > 0.01) {
        lights.push({ x: player.x, y: player.y + 1.5, z: player.z, r: 16, cr: 1.8 * muzzleLight, cg: 1.15 * muzzleLight, cb: 0.42 * muzzleLight });
      }
      for (const a of this.world.anomalies) {
        if (Math.hypot(a.x - player.x, a.z - player.z) < 32 && now >= a.dischargedUntil) {
          const ay = this.world.getHeight(a.x, a.z);
          const col = a.type === 'electro' ? [0.28, 0.78, 1.25]
            : a.type === 'burner' ? [1.5, 0.55, 0.12]
            : a.type === 'acid' ? [0.28, 1.05, 0.38] : [0.5, 0.45, 0.6];
          lights.push({ x: a.x, y: ay + 1.4, z: a.z, r: 11, cr: col[0], cg: col[1], cb: col[2] });
        }
      }
      lights.sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
      return lights.slice(0, 8);
    }

    // === ICONIC STALZONE BLOCKY-ARMORED CHARACTER RENDERER (Screenshot 1 Style!) ===
    _drawArmoredStalker(x, y, z, yaw, suitCol, visorCol, legSwing, flash, alpha = 1.0, hasRifle = true) {
      const E = this.engine;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const part = (lx, ly, lz, sx, syz, sz, rx, col, tex, em = 0, spec = 0.25) => {
        const wx = x + lx * cy + lz * sy;
        const wz = z - lx * sy + lz * cy;
        E.drawBox(wx, y + ly, wz, sx, syz, sz, yaw, rx, col, tex, em + flash, alpha > 0.8, spec);
      };

      const dark = [0.16, 0.18, 0.19, alpha];
      const gear = [0.24, 0.27, 0.24, alpha];

      // Heavy armored boots & knee pads + legs
      part(-0.17, 0.15, 0, 0.26, 0.30, 0.32, 0, dark, 'asphalt', 0, 0.3);
      part(0.17,  0.15, 0, 0.26, 0.30, 0.32, 0, dark, 'asphalt', 0, 0.3);
      part(-0.17, 0.54, 0, 0.25, 0.55, 0.26, legSwing, suitCol, 'camo_armor', 0, 0.18);
      part(0.17,  0.54, 0, 0.25, 0.55, 0.26, -legSwing, suitCol, 'camo_armor', 0, 0.18);
      // Knee pads
      part(-0.17, 0.46, 0.14, 0.20, 0.18, 0.08, legSwing, gear, 'gunmetal', 0, 0.45);
      part(0.17,  0.46, 0.14, 0.20, 0.18, 0.08, -legSwing, gear, 'gunmetal', 0, 0.45);

      // Armored Torso + Tactical Plate Carrier & Mag Pouches
      part(0, 1.12, 0, 0.62, 0.68, 0.38, 0, suitCol, 'camo_armor', 0, 0.22);
      part(0, 1.14, 0.20, 0.50, 0.48, 0.08, 0, gear, 'concrete', 0, 0.3);
      part(-0.15, 1.02, 0.25, 0.12, 0.18, 0.07, 0, dark, 'asphalt');
      part(0.0,   1.02, 0.25, 0.12, 0.18, 0.07, 0, dark, 'asphalt');
      part(0.15,  1.02, 0.25, 0.12, 0.18, 0.07, 0, dark, 'asphalt');

      // Backpack with rolled sleeping mat
      part(0, 1.16, -0.28, 0.46, 0.54, 0.22, 0, [0.32, 0.34, 0.25, alpha], 'crate', 0, 0.15);
      part(0, 1.46, -0.28, 0.50, 0.14, 0.14, 0, [0.46, 0.42, 0.3, alpha], 'wood');

      // Armored Shoulder Pauldrons & Arms
      part(-0.40, 1.32, 0, 0.24, 0.26, 0.30, 0, suitCol, 'camo_armor', 0, 0.28);
      part(0.40,  1.32, 0, 0.24, 0.26, 0.30, 0, suitCol, 'camo_armor', 0, 0.28);
      part(-0.38, 1.02, 0.12, 0.20, 0.46, 0.22, -0.5, suitCol, 'camo_armor');
      part(0.38,  1.02, 0.12, 0.20, 0.46, 0.22, -0.5, suitCol, 'camo_armor');

      // Armored Hood + Gas Mask with Twin Glowing/Tinted Goggles & Respirator Filter!
      part(0, 1.66, -0.02, 0.52, 0.48, 0.50, 0, suitCol, 'camo_armor', 0, 0.22); // Outer hood
      part(0, 1.64, 0.20, 0.36, 0.34, 0.14, 0, dark, 'asphalt', 0, 0.45);        // Mask rubber face
      // Twin tinted gas-mask visor lenses
      part(-0.09, 1.70, 0.27, 0.12, 0.10, 0.05, 0, visorCol, 'white', 0.55, 0.9);
      part(0.09,  1.70, 0.27, 0.12, 0.10, 0.05, 0, visorCol, 'white', 0.55, 0.9);
      // Respirator snout + side canister filter
      part(0, 1.56, 0.29, 0.14, 0.12, 0.12, 0, [0.22, 0.24, 0.24, alpha], 'gunmetal', 0, 0.55);
      part(0.16, 1.54, 0.24, 0.12, 0.14, 0.12, 0, [0.36, 0.42, 0.32, alpha], 'rust', 0, 0.5);

      // Detailed Assault Rifle held across chest/aimed
      if (hasRifle) {
        part(0.18, 1.08, 0.44, 0.09, 0.13, 0.72, 0, [0.24, 0.26, 0.28, alpha], 'gunmetal', 0, 0.65);
        part(0.18, 0.96, 0.52, 0.06, 0.18, 0.09, -0.2, dark, 'asphalt');
        part(0.18, 1.10, 0.88, 0.04, 0.04, 0.34, 0, dark, 'gunmetal', 0, 0.7);
      }
    }

    renderAll(nowSec, player) {
      const E = this.engine;

      // 1. Live Animated Campfire Flames!
      for (const cf of this.world.campfires) {
        const f1 = 0.85 + Math.sin(nowSec * 16 + cf.x) * 0.22;
        const f2 = 0.8 + Math.cos(nowSec * 21 + cf.z) * 0.25;
        E.drawBox(cf.x, cf.y + 0.52 * f1, cf.z, 0.46, 0.75 * f1, 0.46, nowSec * 1.4, 0, [1.0, 0.46, 0.08, 0.86], 'white', 1.8, false);
        E.drawBox(cf.x, cf.y + 0.42 * f2, cf.z, 0.28, 0.55 * f2, 0.28, -nowSec * 2.1, 0, [1.0, 0.88, 0.35, 0.92], 'white', 2.2, false);
      }

      // 2. Render Bar Stalker NPCs (Detailed Armored Stalkers facing player!)
      for (const n of this.world.npcs) {
        if (n.isBox) continue;
        const ny = this.world.getHeight(n.x, n.z);
        const lookYaw = Math.atan2(player.x - n.x, player.z - n.z);
        this._drawArmoredStalker(n.x, ny, n.z, lookYaw, n.color, n.visor || [0.95, 0.72, 0.22, 1], 0, 0, 1.0, n.id === 'fence');
        const bob = Math.sin(nowSec * 3 + n.x) * 0.06;
        E.drawBox(n.x, ny + 2.38 + bob, n.z, 0.18, 0.18, 0.18, nowSec * 2, 0, n.visor || n.color, 'white', 1.1);
      }

      // 3. Render Anomalies (including towering Burner fire columns like Screenshot 1!)
      for (const a of this.world.anomalies) {
        const discharged = nowSec < a.dischargedUntil;
        if (discharged) continue;
        const ay = this.world.getHeight(a.x, a.z);
        const p = 0.78 + Math.sin(a.pulse) * 0.22;
        if (a.type === 'acid') {
          E.drawBox(a.x, ay + 0.08, a.z, a.radius * 1.4, 0.08, a.radius * 1.4, 0, 0, [0.3, 0.98, 0.38, 0.68], 'swamp', 0.85, false, 0.7);
        } else if (a.type === 'electro') {
          E.drawBox(a.x, ay + 0.9 + Math.sin(a.pulse * 2) * 0.25, a.z, 0.65 * p, 0.65 * p, 0.65 * p, a.pulse, a.pulse * 0.5, [0.42, 0.92, 1.0, 0.68], 'white', 1.5, false);
        } else if (a.type === 'burner') {
          // Iconic tall flickering fire pillar from Screenshot 1!
          const pillarH = 3.2 + Math.sin(a.pulse * 3.4) * 1.1;
          E.drawBox(a.x, ay + 0.16, a.z, 1.9, 0.18, 1.9, 0, 0, [1.0, 0.35, 0.06, 0.72], 'white', 1.2, false);
          E.drawBox(a.x, ay + pillarH * 0.5, a.z, 0.75 * p, pillarH, 0.75 * p, a.pulse * 2, 0, [1.0, 0.52, 0.10, 0.62], 'white', 1.9, false);
          E.drawBox(a.x, ay + pillarH * 0.42, a.z, 0.36 * p, pillarH * 0.82, 0.36 * p, -a.pulse * 3, 0, [1.0, 0.92, 0.45, 0.78], 'white', 2.4, false);
        } else if (a.type === 'vortex') {
          E.drawBox(a.x, ay + 1.2, a.z, 0.95 * p, 2.0, 0.95 * p, a.pulse * 2.2, 0, [0.45, 0.44, 0.38, 0.38], 'white', 0.25, false);
        } else if (a.type === 'springboard') {
          E.drawBox(a.x, ay + 0.26, a.z, 2.2 * p, 0.14, 2.2 * p, a.pulse, 0, [0.85, 0.95, 1.0, 0.38], 'white', 0.55, false);
        }
      }

      // 4. Proto-Anomalies
      for (const pr of this.world.protoAnomalies) {
        const py = this.world.getHeight(pr.x, pr.z);
        const col = pr.active ? [0.25, 0.95, 1.0, 0.92] : (pr.cooldown > 0 ? [0.4, 0.45, 0.5, 0.4] : [0.95, 0.75, 0.25, 0.88]);
        E.drawBox(pr.x, py + 1.9 + Math.sin(nowSec * 3) * 0.2, pr.z, 1.15, 1.15, 1.15, nowSec * 1.6, nowSec, col, 'white', 1.3, false);
        E.drawBox(pr.x, py + 0.3, pr.z, 2.4, 0.5, 2.4, 0, 0, [0.35, 0.38, 0.4, 1], 'hazard');
      }

      // 5. Artifacts
      for (const art of this.world.artifacts) {
        if (art.collected) continue;
        const ay = this.world.getHeight(art.x, art.z);
        const def = window.GameData.ARTIFACTS[art.artId];
        const rgb = hexToRgb(def ? def.color : '#65e095');
        const alpha = art.revealed ? 0.96 : 0.14;
        const bob = ay + 0.65 + Math.sin(nowSec * 3.2 + art.bob) * 0.22;
        const sz = art.revealed ? 0.44 : 0.26;
        E.drawBox(art.x, bob, art.z, sz, sz, sz, nowSec * 2.1, nowSec * 1.4, [rgb[0], rgb[1], rgb[2], alpha], 'white', art.revealed ? 1.4 : 0.45, art.revealed);
      }

      // 6. Signal Stash & Loot Bags
      if (this.signalStash) {
        const s = this.signalStash;
        E.drawBox(s.x, s.y + 0.35, s.z, 0.95, 0.65, 0.65, 0.4, 0, [0.25, 0.85, 0.95, 1], 'crate', 0.55);
      }
      for (const b of this.lootBags) {
        const col = b.isPlayerBag ? [0.78, 0.35, 1.0, 1] : [0.76, 0.58, 0.32, 1];
        E.drawBox(b.x, b.y + 0.26, b.z, 0.68, 0.48, 0.46, 0.3, 0, col, 'crate', b.isPlayerBag ? 0.55 : 0.2);
        if (b.isPlayerBag) {
          E.drawBox(b.x, b.y + 5.0, b.z, 0.14, 10, 0.14, 0, 0, [0.78, 0.35, 1.0, 0.36], 'white', 1.2, false);
        }
      }

      // 7. Detailed Enemies (Armored Bandits/Mercs & Detailed Mutants)
      for (const en of this.enemies) {
        if (en.hp <= 0) continue;
        const flash = en.hitFlash > 0 ? 0.7 : 0;
        const legSwing = Math.sin(en.animPhase) * 0.34;
        const a = en.cloakAlpha;

        if (en.isHuman) {
          const suitCol = en.tier >= 3 ? [0.28, 0.34, 0.44, a] : (en.tier === 2 ? [0.42, 0.36, 0.28, a] : [0.26, 0.26, 0.28, a]);
          const visorCol = en.tier >= 3 ? [0.28, 0.85, 1.0, a] : [0.95, 0.36, 0.24, a];
          this._drawArmoredStalker(en.x, en.y, en.z, en.yaw, suitCol, visorCol, legSwing, flash, a, true);
        } else if (en.kind === 'dog') {
          const cy = Math.cos(en.yaw), sy = Math.sin(en.yaw);
          const p = (lx, ly, lz, sx, syz, sz, rx, col) => E.drawBox(en.x + lx * cy + lz * sy, en.y + ly, en.z - lx * sy + lz * cy, sx, syz, sz, en.yaw, rx, col, 'bark', flash);
          p(0, 0.48, 0, 0.38, 0.36, 0.86, 0, [0.46, 0.34, 0.26, a]);
          p(0, 0.62, 0.48, 0.30, 0.28, 0.36, 0.1, [0.54, 0.38, 0.30, a]);
          p(-0.14, 0.22, 0.30, 0.12, 0.42, 0.14, legSwing, [0.38, 0.28, 0.22, a]);
          p(0.14,  0.22, 0.30, 0.12, 0.42, 0.14, -legSwing, [0.38, 0.28, 0.22, a]);
          p(-0.14, 0.22, -0.30, 0.12, 0.42, 0.14, -legSwing, [0.38, 0.28, 0.22, a]);
          p(0.14,  0.22, -0.30, 0.12, 0.42, 0.14, legSwing, [0.38, 0.28, 0.22, a]);
        } else if (en.kind === 'boar') {
          // Massive hulking hunched Zone Boar / Bruiser (Screenshot 2 bottom-right vibe!)
          const cy = Math.cos(en.yaw), sy = Math.sin(en.yaw);
          const p = (lx, ly, lz, sx, syz, sz, rx, col, tex = 'bark') => E.drawBox(en.x + lx * cy + lz * sy, en.y + ly, en.z - lx * sy + lz * cy, sx, syz, sz, en.yaw, rx, col, tex, flash);
          p(0, 0.72, 0, 0.88, 0.78, 1.32, 0, [0.36, 0.26, 0.20, a]);
          p(0, 1.06, 0.24, 0.72, 0.38, 0.78, -0.15, [0.28, 0.22, 0.16, a]); // Hump
          p(0, 0.70, 0.74, 0.56, 0.50, 0.52, 0.1, [0.42, 0.30, 0.24, a]);   // Head
          p(-0.22, 0.58, 1.02, 0.08, 0.10, 0.28, -0.3, [0.92, 0.88, 0.76, a], 'white'); // Left Tusk
          p(0.22,  0.58, 1.02, 0.08, 0.10, 0.28, -0.3, [0.92, 0.88, 0.76, a], 'white'); // Right Tusk
          p(-0.34, 0.28, 0.42, 0.22, 0.56, 0.24, legSwing, [0.28, 0.20, 0.16, a]);
          p(0.34,  0.28, 0.42, 0.22, 0.56, 0.24, -legSwing, [0.28, 0.20, 0.16, a]);
          p(-0.34, 0.28, -0.42, 0.22, 0.56, 0.24, -legSwing, [0.28, 0.20, 0.16, a]);
          p(0.34,  0.28, -0.42, 0.22, 0.56, 0.24, legSwing, [0.28, 0.20, 0.16, a]);
        } else if (en.kind === 'bloodsucker') {
          const dw = a > 0.5;
          const cy = Math.cos(en.yaw), sy = Math.sin(en.yaw);
          const p = (lx, ly, lz, sx, syz, sz, rx, col, em = 0) => E.drawBox(en.x + lx * cy + lz * sy, en.y + ly, en.z - lx * sy + lz * cy, sx, syz, sz, en.yaw, rx, col, 'concrete', flash + em, dw);
          p(-0.16, 0.46, 0, 0.20, 0.92, 0.22, legSwing * 0.7, [0.38, 0.20, 0.22, a]);
          p(0.16,  0.46, 0, 0.20, 0.92, 0.22, -legSwing * 0.7, [0.38, 0.20, 0.22, a]);
          p(0, 1.24, 0.08, 0.58, 0.74, 0.34, 0.22, [0.46, 0.24, 0.26, a]);
          p(-0.38, 1.05, 0.28, 0.16, 0.72, 0.18, -0.6, [0.42, 0.22, 0.24, a]);
          p(0.38,  1.05, 0.28, 0.16, 0.72, 0.18, -0.6, [0.42, 0.22, 0.24, a]);
          p(0, 1.72, 0.22, 0.38, 0.40, 0.38, 0.15, [0.54, 0.28, 0.30, a]);
          // Glowing eerie Bloodsucker eyes & tentacles!
          p(-0.08, 1.78, 0.42, 0.07, 0.05, 0.05, 0, [1.0, 0.25, 0.2, Math.max(0.55, a)], 1.6);
          p(0.08,  1.78, 0.42, 0.07, 0.05, 0.05, 0, [1.0, 0.25, 0.2, Math.max(0.55, a)], 1.6);
          p(0, 1.50, 0.40, 0.24, 0.24, 0.12, 0, [0.48, 0.18, 0.22, a]);
        }
      }

      // 8. Projectiles, Tracers & Particles
      for (const p of this.projectiles) {
        if (p.kind === 'bolt') E.drawBox(p.x, p.y, p.z, 0.08, 0.08, 0.22, nowSec * 10, nowSec * 8, [0.82, 0.86, 0.9, 1], 'gunmetal', 0.25, true, 0.85);
        else E.drawBox(p.x, p.y, p.z, 0.18, 0.24, 0.18, nowSec * 6, nowSec * 4, [0.3, 0.44, 0.24, 1], 'concrete', 0.1);
      }
      for (const tr of this.tracers) {
        const mx = (tr.x1 + tr.x2) * 0.5, my = (tr.y1 + tr.y2) * 0.5, mz = (tr.z1 + tr.z2) * 0.5;
        const len = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1, tr.z2 - tr.z1);
        const yaw = Math.atan2(tr.x2 - tr.x1, tr.z2 - tr.z1);
        const pitch = -Math.asin((tr.y2 - tr.y1) / Math.max(0.001, len));
        E.drawBox(mx, my, mz, 0.04, 0.04, Math.min(len, 45), yaw, pitch, tr.color, 'white', 1.6, false);
      }
      for (const p of this.particles) {
        const k = Math.max(0.05, p.life / p.maxLife);
        E.drawBox(p.x, p.y, p.z, p.size, p.size, p.size, 0, 0, [p.color[0], p.color[1], p.color[2], p.color[3] * k], 'white', 0.85, false);
      }
    }
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  return { Manager };
})();
