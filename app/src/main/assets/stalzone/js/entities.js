// STALZONE AI Entities: Faction Warfare, Rebalanced Bots, High-Detail 3D Models, World Stashes, Flashlight & Multiplayer Hook
window.EntityManager = (function () {
  class Manager {
    constructor(world, engine) {
      this.world = world;
      this.engine = engine;
      this.enemies = [];
      this.remotePlayers = []; // Populated by online multiplayer bridge
      this.lootBags = [];
      this.projectiles = [];
      this.tracers = [];
      this.particles = [];
      this.signalStash = null;
      this.signalScan = { active: false, progress: 0, targetX: 0, targetZ: 0 };

      this.emission = {
        phase: 'calm',
        timer: 340,
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
        const count = spot.tier >= 2 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          this._spawnEnemy('bandit', spot.x + (Math.random() - 0.5) * 12, spot.z + (Math.random() - 0.5) * 12, spot.id, spot.tier);
        }
      } else if (spot.kind === 'stalkers') {
        const count = spot.tier >= 2 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          this._spawnEnemy('stalker', spot.x + (Math.random() - 0.5) * 12, spot.z + (Math.random() - 0.5) * 12, spot.id, spot.tier);
        }
      } else if (spot.kind === 'mercs') {
        const count = 3;
        for (let i = 0; i < count; i++) {
          this._spawnEnemy('merc', spot.x + (Math.random() - 0.5) * 14, spot.z + (Math.random() - 0.5) * 14, spot.id, spot.tier);
        }
      }
    }

    _spawnEnemy(kind, x, z, spotId, tier = 1) {
      // Fairly rebalanced bot stats (responsive, fun combat without unfair instant laser deaths)
      const cfg = {
        dog: {
          name: 'Слепой пёс', faction: 'mutant', isHuman: false,
          hp: 42, speed: 5.8, dmg: 7, radius: 0.48, height: 0.85, range: 1.9, armor: 3
        },
        boar: {
          name: 'Кабан-мутант', faction: 'mutant', isHuman: false,
          hp: 85, speed: 4.9, dmg: 14, radius: 0.72, height: 1.25, range: 2.3, armor: 10
        },
        bloodsucker: {
          name: 'Кровосос', faction: 'mutant', isHuman: false,
          hp: 135, speed: 5.7, dmg: 18, radius: 0.52, height: 1.95, range: 2.3, armor: 14
        },
        bandit: {
          name: tier >= 2 ? 'Матёрый Бандит' : 'Бандит-мародёр',
          faction: 'bandit', isHuman: true,
          hp: tier >= 2 ? 78 : 58, speed: 3.6,
          dmg: tier >= 2 ? 7.5 : 5.0,
          radius: 0.44, height: 1.88, range: 32,
          armor: tier >= 2 ? 15 : 8
        },
        stalker: {
          name: tier >= 2 ? 'Ветеран-Сталкер' : 'Сталкер-одиночка',
          faction: 'stalker', isHuman: true,
          hp: tier >= 2 ? 78 : 58, speed: 3.6,
          dmg: tier >= 2 ? 7.5 : 5.0,
          radius: 0.44, height: 1.88, range: 32,
          armor: tier >= 2 ? 15 : 8
        },
        merc: {
          name: 'Наёмник Севера',
          faction: 'merc', isHuman: true,
          hp: 105, speed: 3.8, dmg: 10.5,
          radius: 0.44, height: 1.88, range: 36, armor: 24
        }
      }[kind];

      const gy = this.world.getHeight(x, z);
      this.enemies.push({
        id: 'en_' + Math.random().toString(36).slice(2, 9),
        kind, faction: cfg.faction, spotId, tier,
        name: cfg.name, isHuman: cfg.isHuman,
        x, y: gy, z,
        homeX: x, homeZ: z,
        yaw: Math.random() * 6.28,
        hp: cfg.hp, maxHp: cfg.hp,
        speed: cfg.speed, dmg: cfg.dmg,
        radius: cfg.radius, height: cfg.height,
        range: cfg.range, armor: cfg.armor,
        atkCd: 0, reactDelay: 0.65, burstLeft: 0, burstPause: 0,
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        strafeTimer: 1.5, chargeTimer: 0, bleedTimer: 0,
        cloakAlpha: 1.0, animPhase: Math.random() * 6.28,
        hitFlash: 0, patrolTarget: null, lootedBag: []
      });
    }

    isHostileToPlayer(en, playerFaction) {
      if (en.faction === 'mutant' || en.faction === 'merc') return true;
      return en.faction !== playerFaction;
    }

    areEnemiesHostile(a, b) {
      if (a.faction === b.faction) return false;
      return true;
    }

    spawnLootBag(x, z, title, items, isPlayerBag = false) {
      if (!items || items.length === 0) return;
      const slotted = items.map(i => ({ id: i.id, count: i.count, slot: i.slot }));
      window.GameData.ensureSlots(slotted, 12);
      this.lootBags.push({
        id: 'bag_' + Math.random().toString(36).slice(2, 9),
        x, y: this.world.getHeight(x, z), z,
        title,
        items: slotted,
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
        game.toast('⚠ ВНИМАНИЕ! НАЧИНАЕТСЯ ВЫБРОС! Ищите крышу или базу!', 'bad');
      }
    }

    startSignalScan(px, pz, game) {
      if (this.signalScan.active) return;
      let tx = px, tz = pz;
      for (let tries = 0; tries < 25; tries++) {
        const ang = Math.random() * Math.PI * 2;
        const d = 32 + Math.random() * 48;
        tx = Math.max(-230, Math.min(230, px + Math.cos(ang) * d));
        tz = Math.max(-230, Math.min(230, pz + Math.sin(ang) * d));
        if (!this.world.isAnySafeZone(tx, tz)) break;
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
          proto.progress += dt * 5.2;
          proto.waveTimer -= dt;
          const py = this.world.getHeight(proto.x, proto.z);
          if (Math.random() < 0.35) {
            this.spawnParticles(proto.x + (Math.random() - 0.5) * 4, py + 1.8, proto.z + (Math.random() - 0.5) * 4, 2, [0.3, 0.9, 1, 1], 4, 0.4, 0.16, 0);
          }
          if (proto.waveTimer <= 0) {
            proto.waveTimer = 7.2;
            const kind = proto.tier >= 3 && Math.random() > 0.6 ? 'bloodsucker' : (Math.random() > 0.5 ? 'boar' : 'dog');
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
            game.toast('⚡ Протоаномалия заряжена! Обыщите сумку [F]!', 'good');
            window.SoundEngine.playExplosion();
          }
        }
      }

      if (this.signalScan.active && !this.signalStash) {
        const d = Math.hypot(player.x - this.signalScan.targetX, player.z - this.signalScan.targetZ);
        if (d < 10) {
          this.signalScan.active = false;
          const items = [
            { id: 'res_radio', count: 3 },
            { id: 'res_data', count: this.signalScan.targetZ < -20 ? 2 : 1 },
            { id: 'ammo_ap', count: 30 },
            { id: 'tools', count: 1 }
          ];
          window.GameData.ensureSlots(items, 12);
          this.signalStash = {
            x: this.signalScan.targetX,
            y: this.world.getHeight(this.signalScan.targetX, this.signalScan.targetZ),
            z: this.signalScan.targetZ,
            title: 'Тайник сигнала САК',
            items,
            money: 1800,
            moneyClaimed: false
          };
          game.toast('📡 Тайник сигнала обнаружен рядом! Обыщите [F].', 'good');
          window.SoundEngine.playRadarBeep();
        }
      }

      this._updateAnomalies(dt, player, game);
      this._updateProjectiles(dt, player, game);
      this._updateEnemies(dt, player, game);

      // Clean empty non-player loot bags
      for (let i = this.lootBags.length - 1; i >= 0; i--) {
        if (!this.lootBags[i].items || this.lootBags[i].items.length === 0) {
          this.lootBags.splice(i, 1);
        }
      }

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

      for (const cf of this.world.campfires) {
        if (Math.hypot(player.x - cf.x, player.z - cf.z) < 42 && Math.random() < 0.55) {
          this.spawnParticles(cf.x + (Math.random() - 0.5) * 0.5, cf.y + 0.45, cf.z + (Math.random() - 0.5) * 0.5, 1, [1.0, 0.55 + Math.random() * 0.35, 0.12, 0.95], 1.4, 0.85, 0.09, -2.2);
        }
      }

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
          E.phase = 'warning'; E.timer = 24;
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
        const sheltered = this.world.isAnySafeZone(player.x, player.z) ||
          this.engine.hasRoofCover(player.x, player.y + 1.5, player.z);
        if (!sheltered && player.hp > 0) {
          player.contam.psy = Math.min(100, player.contam.psy + dt * 15);
          player.contam.therm = Math.min(100, player.contam.therm + dt * 13);
          game.damagePlayer(dt * 12, 'Выброс (открытое пространство)', true);
        }
        if (E.timer <= 0) {
          E.phase = 'calm'; E.timer = 350;
          window.SoundEngine.setEmissionSiren(false);
          this.world.respawnAnomaliesAndArtifacts();
          this.world.refillWorldStashes();
          game.profile.stats.emissionsSurvived++;
          game.save();
          game.toast('☀ Выброс прошёл! Аномалии, артефакты и тайники обновлены!', 'good');
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

        if (dPlayer < 42 && Math.random() < (discharged ? 0.02 : 0.2)) {
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
            const pull = (1 - dPlayer / a.radius) * 10 * dt;
            const nx = (a.x - player.x) / Math.max(0.2, dPlayer);
            const nz = (a.z - player.z) / Math.max(0.2, dPlayer);
            player.x += nx * pull; player.z += nz * pull;
            if (dPlayer < 1.35 && a.cooldown <= 0) {
              a.cooldown = 2.4;
              window.SoundEngine.playAnomaly('vortex');
              this.spawnParticles(a.x, ay + 1.0, a.z, 18, [0.9, 0.25, 0.2, 0.9], 7, 0.6, 0.22, 4);
              game.damagePlayer(32, 'Аномалия «Воронка»', true);
            }
          } else if (a.type === 'electro' && a.cooldown <= 0) {
            a.cooldown = 2.6;
            window.SoundEngine.playAnomaly('electro');
            this.spawnParticles(a.x, ay + 1.2, a.z, 22, [0.5, 0.92, 1.0, 1], 8, 0.45, 0.18, 1);
            game.damagePlayer(28, 'Аномалия «Электра»', true);
          } else if (a.type === 'springboard' && a.cooldown <= 0) {
            a.cooldown = 2.4;
            window.SoundEngine.playAnomaly('springboard');
            player.vy = 13.5;
            this.spawnParticles(a.x, ay + 0.6, a.z, 16, [0.9, 0.96, 1.0, 0.8], 6, 0.5, 0.2, 1);
            game.damagePlayer(10, 'Аномалия «Батут»', true);
          } else if (a.type === 'burner' && a.cooldown <= 0) {
            a.cooldown = 1.7;
            window.SoundEngine.playAnomaly('burner');
            this.spawnParticles(a.x, ay + 1.5, a.z, 26, [1.0, 0.48, 0.08, 1], 7, 0.85, 0.28, -6);
            player.contam.therm = Math.min(100, player.contam.therm + 30);
            game.damagePlayer(22, 'Аномалия «Жарка»', true);
          } else if (a.type === 'acid') {
            player.contam.bio = Math.min(100, player.contam.bio + dt * 24);
            game.damagePlayer(dt * 13, 'Аномалия «Кисель»', true);
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
                a.dischargedUntil = now + 3.4;
                this.spawnParticles(a.x, ay + 1.1, a.z, 18, [0.45, 0.9, 1.0, 1], 7, 0.45, 0.18, 1);
                game.toast('⚡ «Электра» разряжена болтом (3 сек)!', 'good');
              } else {
                a.dischargedUntil = now + 2.0;
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
        if (!this.world.isSafeZone(player.x, player.z, game.profile.faction)) {
          game.damagePlayer((1 - dp / 8.5) * 60, 'Осколки РГД-5', false);
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
      const pFaction = game.profile.faction || 'stalker';
      const playerSafe = this.world.isSafeZone(player.x, player.z, pFaction);

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

        const dxP = player.x - en.x, dzP = player.z - en.z;
        const distP = Math.hypot(dxP, dzP);
        const aggroDist = en.isHuman ? 34 : 23;
        const hostileToPlayer = this.isHostileToPlayer(en, pFaction);

        // Pick target: either player (if hostile) OR closest rival faction/mutant NPC!
        let target = null;
        let targetIsPlayer = false;
        let bestDist = aggroDist;

        if (hostileToPlayer && !playerSafe && distP < bestDist && player.hp > 0) {
          target = player;
          targetIsPlayer = true;
          bestDist = distP;
        }

        // Check nearby rival faction NPCs / mutants for live Zone faction wars!
        for (const other of this.enemies) {
          if (other === en || other.hp <= 0 || other._dead) continue;
          if (!this.areEnemiesHostile(en, other)) continue;
          const dO = Math.hypot(other.x - en.x, other.z - en.z);
          if (dO < bestDist && dO < 28) {
            target = other;
            targetIsPlayer = false;
            bestDist = dO;
          }
        }

        if (target) {
          const dx = target.x - en.x, dz = target.z - en.z;
          const dist = Math.hypot(dx, dz);
          en.yaw = Math.atan2(dx, dz);
          en.animPhase += dt * (en.speed * 1.8);

          if (en.isHuman) {
            en.strafeTimer -= dt;
            if (en.strafeTimer <= 0) { en.strafeTimer = 1.3 + Math.random() * 1.5; en.strafeDir = -en.strafeDir; }
            let mx = 0, mz = 0;
            const fx = dx / Math.max(0.01, dist), fz = dz / Math.max(0.01, dist);
            if (dist > 20) { mx += fx; mz += fz; }
            else if (dist < 10) { mx -= fx; mz -= fz; }
            mx += -fz * en.strafeDir * 0.7; mz += fx * en.strafeDir * 0.7;
            this._moveEnemy(en, mx * en.speed * dt, mz * en.speed * dt);

            if (dist < en.range) {
              if (en.reactDelay > 0) {
                en.reactDelay -= dt;
              } else if (en.burstPause > 0) {
                en.burstPause -= dt;
              } else if (en.atkCd <= 0) {
                const ey = en.y + 1.5;
                const ty = target.y + (targetIsPlayer ? 1.4 : target.height * 0.65);
                const d3 = Math.hypot(dx, ty - ey, dz);
                const los = this.engine.raycastWorld(en.x, ey, en.z, dx / d3, (ty - ey) / d3, dz / d3, d3);
                if (los >= d3 - 1.2) {
                  en.atkCd = 0.28;
                  if (en.burstLeft <= 0) en.burstLeft = 2 + Math.floor(Math.random() * 2);
                  en.burstLeft--;
                  if (en.burstLeft <= 0) en.burstPause = 1.65 + Math.random() * 0.85;

                  if (distP < 55) window.SoundEngine.playEnemyShot(distP);
                  const spread = 0.14 + dist * 0.003;
                  const hitChance = Math.max(0.12, 0.36 - dist * 0.008);
                  const hit = Math.random() < hitChance;
                  const tx = target.x + (hit ? 0 : (Math.random() - 0.5) * spread * dist);
                  const tz = target.z + (hit ? 0 : (Math.random() - 0.5) * spread * dist);
                  const trCol = en.faction === 'stalker' ? [0.65, 1.0, 0.55, 0.9] : [1.0, 0.78, 0.30, 0.9];
                  this.addTracer(en.x, ey, en.z, tx, ty, tz, trCol);

                  if (hit) {
                    if (targetIsPlayer) {
                      game.damagePlayer(en.dmg, en.name, false);
                    } else {
                      target.hp -= en.dmg * 1.1;
                      target.hitFlash = 0.16;
                      if (target.hp <= 0) this.onEnemyKilled(target, false, game, en.name);
                    }
                  }
                }
              }
            }
          } else {
            const fx = dx / Math.max(0.01, dist), fz = dz / Math.max(0.01, dist);
            let moveSpeed = en.speed;
            if (en.kind === 'bloodsucker') {
              en.cloakAlpha = (dist > 4.2 && en.hitFlash <= 0) ? 0.26 : 0.95;
            } else if (en.kind === 'boar') {
              en.chargeTimer += dt;
              if (dist < 13 && dist > 3 && Math.sin(en.chargeTimer * 1.4) > 0.45) {
                moveSpeed *= 1.42;
                if (Math.random() < 0.28) this.spawnParticles(en.x, en.y + 0.2, en.z, 1, [0.45, 0.4, 0.32, 0.6], 2, 0.4, 0.2, 2);
              }
            } else if (en.kind === 'dog') {
              const strafe = dist < 6 ? Math.sin(en.animPhase * 0.4) * 0.45 : 0;
              this._moveEnemy(en, (fx - fz * strafe) * moveSpeed * dt, (fz + fx * strafe) * moveSpeed * dt);
              moveSpeed = 0;
            }
            if (moveSpeed > 0 && dist > en.range * 0.85) this._moveEnemy(en, fx * moveSpeed * dt, fz * moveSpeed * dt);
            if (dist <= en.range && en.atkCd <= 0) {
              en.atkCd = en.kind === 'dog' ? 1.25 : (en.kind === 'boar' ? 1.7 : 1.45);
              if (distP < 30) window.SoundEngine.playMutantGrowl();
              if (targetIsPlayer) {
                game.damagePlayer(en.dmg, en.name, false);
                if (en.kind === 'bloodsucker' || Math.random() < 0.24) player.bleeding = Math.min(100, player.bleeding + 18);
              } else {
                target.hp -= en.dmg;
                target.hitFlash = 0.16;
                if (target.hp <= 0) this.onEnemyKilled(target, false, game, en.name);
              }
            }
          }
        } else {
          en.cloakAlpha = 1.0;
          en.reactDelay = 0.65;
          if (!en.patrolTarget || Math.hypot(en.patrolTarget.x - en.x, en.patrolTarget.z - en.z) < 1.5) {
            en.patrolTarget = { x: en.homeX + (Math.random() - 0.5) * 16, z: en.homeZ + (Math.random() - 0.5) * 16 };
          }
          const px = en.patrolTarget.x - en.x, pz = en.patrolTarget.z - en.z, pd = Math.hypot(px, pz);
          if (pd > 0.5) {
            en.yaw = Math.atan2(px, pz);
            this._moveEnemy(en, (px / pd) * en.speed * 0.35 * dt, (pz / pd) * en.speed * 0.35 * dt);
            en.animPhase += dt * 2.4;
          }
        }
      }
    }

    _moveEnemy(en, dx, dz) {
      if (this.world.isAnySafeZone(en.x + dx, en.z + dz)) return;
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
        if (Math.random() < 0.65) loot.push({ id: 'medkit', count: 1 });
        if (Math.random() < 0.55) loot.push({ id: 'bandage', count: 2 });
        if (Math.random() < 0.55) loot.push({ id: 'loot_pda', count: 1 });
        loot.push({ id: en.tier >= 3 ? 'res_data' : 'res_radio', count: 1 + (en.tier >= 3 ? 2 : 1) });
        if (Math.random() < 0.4) loot.push({ id: 'tools', count: 1 });
        this.spawnLootBag(en.x, en.z, `Сумка: ${en.name}`, loot, false);
      } else {
        const partId = en.kind === 'dog' ? 'part_dog' : (en.kind === 'boar' ? 'part_boar' : 'part_blood');
        loot.push({ id: partId, count: 1 });
        if (Math.random() < 0.7) loot.push({ id: en.tier >= 3 ? 'res_data' : (Math.random() > 0.5 ? 'res_moss' : 'res_root'), count: 1 });
        this.spawnLootBag(en.x, en.z, `Трофей: ${en.name}`, loot, false);
      }

      if (en.spotId) {
        const remaining = this.enemies.filter(o => o.spotId === en.spotId && !o._dead && o.hp > 0).length;
        if (remaining === 0) {
          const spot = this.world.spots.find(s => s.id === en.spotId);
          if (spot) {
            spot.clearedCooldown = 95;
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

    raycastEnemies(ox, oy, oz, dx, dy, dz, maxDist, playerFaction = 'stalker') {
      let bestHit = null;
      let bestT = maxDist;
      for (const en of this.enemies) {
        if (en.hp <= 0 || en._dead) continue;
        // Do not hit allied faction patrols!
        if (!this.isHostileToPlayer(en, playerFaction)) continue;

        const headH = en.isHuman ? 0.42 : 0.38;
        const headBox = {
          minX: en.x - en.radius * 0.80, maxX: en.x + en.radius * 0.80,
          minY: en.y + en.height - headH, maxY: en.y + en.height + 0.1,
          minZ: en.z - en.radius * 0.80, maxZ: en.z + en.radius * 0.80
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

    raycastRemotePlayers(ox, oy, oz, dx, dy, dz, maxDist, playerFaction = 'stalker') {
      let bestHit = null;
      let bestT = maxDist;
      for (const rp of this.remotePlayers) {
        if (!rp || !rp.uid || (rp.hp !== undefined && rp.hp <= 0)) continue;
        // Friendly fire off between same faction; safe zone protected
        if ((rp.faction || 'stalker') === playerFaction) continue;
        if (this.world.isSafeZone(rp.x, rp.z, rp.faction || 'stalker')) continue;
        const rx = rp.rx ?? rp.x;
        const ry = rp.ry ?? rp.y;
        const rz = rp.rz ?? rp.z;
        const headBox = {
          minX: rx - 0.42, maxX: rx + 0.42,
          minY: ry + 1.38, maxY: ry + 1.92,
          minZ: rz - 0.42, maxZ: rz + 0.42
        };
        const th = this.engine.rayIntersectsBox(ox, oy, oz, dx, dy, dz, headBox, bestT);
        if (th > 0 && th < bestT) { bestT = th; bestHit = { remote: rp, dist: th, isHeadshot: true }; continue; }

        const bodyBox = {
          minX: rx - 0.50, maxX: rx + 0.50,
          minY: ry, maxY: ry + 1.38,
          minZ: rz - 0.50, maxZ: rz + 0.50
        };
        const tb = this.engine.rayIntersectsBox(ox, oy, oz, dx, dy, dz, bodyBox, bestT);
        if (tb > 0 && tb < bestT) { bestT = tb; bestHit = { remote: rp, dist: tb, isHeadshot: false }; }
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
      if (player.flashlightOn) {
        const fx = -Math.sin(player.yaw) * Math.cos(player.pitch);
        const fy = Math.sin(player.pitch);
        const fz = -Math.cos(player.yaw) * Math.cos(player.pitch);
        lights.push({
          x: player.x + fx * 6.5, y: Math.max(player.y + 0.6, player.y + 1.6 + fy * 6.5), z: player.z + fz * 6.5,
          r: 24, cr: 1.55, cg: 1.62, cb: 1.48
        });
      }
      if (muzzleLight > 0.01) {
        lights.push({ x: player.x, y: player.y + 1.5, z: player.z, r: 16, cr: 1.8 * muzzleLight, cg: 1.15 * muzzleLight, cb: 0.42 * muzzleLight });
      }
      for (const a of this.world.anomalies) {
        if (Math.hypot(a.x - player.x, a.z - player.z) < 34 && now >= a.dischargedUntil) {
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

    // === HIGH-DETAIL STALZONE ARMORED CHARACTER MODEL (Zero Coplanar Z-Fighting) ===
    _drawArmoredStalker(x, y, z, yaw, suitCol, visorCol, legSwing, flash, alpha = 1.0, hasRifle = true, faction = 'stalker') {
      const E = this.engine;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const part = (lx, ly, lz, sx, syz, sz, rx, col, tex, em = 0, spec = 0.25) => {
        const wx = x + lx * cy + lz * sy;
        const wz = z - lx * sy + lz * cy;
        E.drawBox(wx, y + ly, wz, sx, syz, sz, yaw, rx, col, tex, em + flash, alpha > 0.8, spec);
      };

      const dark = [0.15, 0.16, 0.17, alpha];
      const gear = [0.24, 0.26, 0.23, alpha];
      const strap = [0.18, 0.19, 0.16, alpha];
      const wood = [0.46, 0.28, 0.16, alpha];

      // 1. Tactical Combat Boots + Sole & Toe Caps
      part(-0.17, 0.12, 0.02, 0.24, 0.24, 0.32, 0, dark, 'asphalt', 0, 0.32);
      part(0.17,  0.12, 0.02, 0.24, 0.24, 0.32, 0, dark, 'asphalt', 0, 0.32);
      part(-0.17, 0.08, 0.18, 0.21, 0.14, 0.09, 0, [0.12, 0.13, 0.13, alpha], 'gunmetal', 0, 0.4);
      part(0.17,  0.08, 0.18, 0.21, 0.14, 0.09, 0, [0.12, 0.13, 0.13, alpha], 'gunmetal', 0, 0.4);

      // 2. Armored Legs + Thigh Holster + Sculpted Knee Guards
      part(-0.17, 0.54, 0, 0.25, 0.58, 0.26, legSwing, suitCol, 'camo_armor', 0, 0.18);
      part(0.17,  0.54, 0, 0.25, 0.58, 0.26, -legSwing, suitCol, 'camo_armor', 0, 0.18);
      part(-0.17, 0.47, 0.16, 0.19, 0.16, 0.06, legSwing, gear, 'gunmetal', 0, 0.48);
      part(0.17,  0.47, 0.16, 0.19, 0.16, 0.06, -legSwing, gear, 'gunmetal', 0, 0.48);
      part(0.31,  0.64, 0.02, 0.08, 0.20, 0.15, -legSwing * 0.5, dark, 'asphalt', 0, 0.3); // Side holster

      // 3. Utility Belt + Armored Torso + Multi-Layer Plate Carrier
      part(0, 0.85, 0, 0.64, 0.11, 0.42, 0, strap, 'asphalt', 0, 0.32);
      part(0, 1.18, 0, 0.60, 0.58, 0.37, 0, suitCol, 'camo_armor', 0, 0.2);
      part(0, 1.20, 0.21, 0.48, 0.44, 0.07, 0, gear, 'concrete', 0, 0.32);
      // 3 Ammo Pouches + Radio with Antenna on Left Collar
      part(-0.15, 1.04, 0.27, 0.11, 0.18, 0.06, 0, dark, 'asphalt');
      part(0.0,   1.04, 0.27, 0.11, 0.18, 0.06, 0, dark, 'asphalt');
      part(0.15,  1.04, 0.27, 0.11, 0.18, 0.06, 0, dark, 'asphalt');
      part(-0.22, 1.36, 0.25, 0.09, 0.14, 0.06, 0, [0.18, 0.22, 0.20, alpha], 'gunmetal', 0, 0.5);
      part(-0.24, 1.54, 0.25, 0.02, 0.24, 0.02, 0, dark, 'gunmetal'); // Radio antenna

      // 4. Tactical Field Backpack + Bedroll + Canteen
      part(0, 1.17, -0.29, 0.44, 0.50, 0.20, 0, [0.30, 0.33, 0.24, alpha], 'crate', 0, 0.16);
      part(0, 1.46, -0.29, 0.48, 0.13, 0.14, 0, [0.46, 0.41, 0.28, alpha], 'wood');
      part(0.24, 1.04, -0.27, 0.10, 0.16, 0.10, 0, [0.32, 0.38, 0.30, alpha], 'rust', 0, 0.4);

      // 5. Layered Shoulder Armor + Faction Armband + Arms & Gloves
      part(-0.41, 1.34, 0, 0.23, 0.24, 0.28, 0, suitCol, 'camo_armor', 0, 0.26);
      part(0.41,  1.34, 0, 0.23, 0.24, 0.28, 0, suitCol, 'camo_armor', 0, 0.26);
      const bandCol = faction === 'stalker' ? [0.35, 0.85, 0.45, alpha] : (faction === 'bandit' ? [0.95, 0.45, 0.22, alpha] : [0.3, 0.72, 0.98, alpha]);
      part(-0.43, 1.24, 0, 0.25, 0.08, 0.30, 0, bandCol, 'white', 0.25); // Faction armband
      part(-0.39, 1.02, 0.12, 0.19, 0.44, 0.20, -0.5, suitCol, 'camo_armor');
      part(0.39,  1.02, 0.12, 0.19, 0.44, 0.20, -0.5, suitCol, 'camo_armor');
      part(-0.34, 0.92, 0.30, 0.14, 0.13, 0.14, 0, dark, 'asphalt', 0, 0.35); // Tactical gloves
      part(0.34,  0.92, 0.30, 0.14, 0.13, 0.14, 0, dark, 'asphalt', 0, 0.35);

      // 6. Sculpted Armored Hood/Helmet + Gas Mask + Dual Filters + Glowing Lenses
      part(0, 1.67, -0.02, 0.50, 0.46, 0.48, 0, suitCol, 'camo_armor', 0, 0.24);
      part(0, 1.91, -0.01, 0.42, 0.08, 0.42, 0, gear, 'gunmetal', 0, 0.42); // Helmet crown cap
      part(0, 1.85, 0.23, 0.44, 0.06, 0.10, 0, gear, 'gunmetal', 0, 0.4);   // Hood visor lip
      part(0, 1.64, 0.23, 0.34, 0.32, 0.09, 0, dark, 'asphalt', 0, 0.45);  // Mask face
      part(-0.09, 1.71, 0.29, 0.12, 0.09, 0.04, 0, visorCol, 'white', 0.55, 0.9);
      part(0.09,  1.71, 0.29, 0.12, 0.09, 0.04, 0, visorCol, 'white', 0.55, 0.9);
      part(0, 1.56, 0.31, 0.12, 0.11, 0.11, 0, [0.22, 0.24, 0.25, alpha], 'gunmetal', 0, 0.6);
      part(0.15,  1.54, 0.27, 0.11, 0.13, 0.11, 0, [0.36, 0.42, 0.32, alpha], 'rust', 0, 0.5);
      part(-0.15, 1.54, 0.27, 0.11, 0.13, 0.11, 0, [0.36, 0.42, 0.32, alpha], 'rust', 0, 0.5);

      // 7. Detailed Assault Rifle (Stock, Receiver, Handguard, Magazine, Optic, Barrel)
      if (hasRifle) {
        part(0.18, 1.07, 0.14, 0.07, 0.11, 0.24, 0, wood, 'wood', 0, 0.2);               // Stock
        part(0.18, 1.08, 0.44, 0.085, 0.12, 0.38, 0, [0.22, 0.24, 0.26, alpha], 'gunmetal', 0, 0.7); // Receiver
        part(0.18, 1.08, 0.72, 0.075, 0.095, 0.22, 0, wood, 'wood', 0, 0.25);            // Handguard
        part(0.18, 1.17, 0.46, 0.05, 0.06, 0.12, 0, dark, 'gunmetal', 0, 0.8);           // Red-dot optic
        part(0.18, 0.94, 0.52, 0.055, 0.20, 0.085, -0.22, dark, 'asphalt');              // Curved magazine
        part(0.18, 1.10, 0.98, 0.036, 0.036, 0.34, 0, dark, 'gunmetal', 0, 0.78);        // Barrel + muzzle
      }
    }

    renderAll(nowSec, player) {
      const E = this.engine;

      // 1. Live Animated Campfire Flames
      for (const cf of this.world.campfires) {
        const f1 = 0.85 + Math.sin(nowSec * 16 + cf.x) * 0.22;
        const f2 = 0.8 + Math.cos(nowSec * 21 + cf.z) * 0.25;
        E.drawBox(cf.x, cf.y + 0.52 * f1, cf.z, 0.46, 0.75 * f1, 0.46, nowSec * 1.4, 0, [1.0, 0.46, 0.08, 0.86], 'white', 1.8, false);
        E.drawBox(cf.x, cf.y + 0.42 * f2, cf.z, 0.28, 0.55 * f2, 0.28, -nowSec * 2.1, 0, [1.0, 0.88, 0.35, 0.92], 'white', 2.2, false);
      }

      // 2. Render Base NPCs (Both Stalker Bar & Bandit Depot)
      for (const n of this.world.npcs) {
        if (n.isBox) continue;
        if (Math.hypot(player.x - n.x, player.z - n.z) > 130) continue;
        const ny = this.world.getHeight(n.x, n.z);
        const lookYaw = Math.atan2(player.x - n.x, player.z - n.z);
        this._drawArmoredStalker(n.x, ny, n.z, lookYaw, n.color, n.visor || [0.95, 0.72, 0.22, 1], 0, 0, 1.0, n.id === 'fence', n.faction);
        const bob = Math.sin(nowSec * 3 + n.x) * 0.06;
        E.drawBox(n.x, ny + 2.42 + bob, n.z, 0.16, 0.16, 0.16, nowSec * 2, 0, n.visor || n.color, 'white', 1.1);
      }

      // 3. Render Remote Online Players (interpolated in real time via Firestore bridge)
      for (const rp of this.remotePlayers) {
        if (rp.rx === undefined) { rp.rx = rp.x; rp.ry = rp.y; rp.rz = rp.z; rp.ryaw = rp.yaw || 0; rp.swing = 0; }
        rp.rx += (rp.x - rp.rx) * 0.22;
        rp.ry += (rp.y - rp.ry) * 0.22;
        rp.rz += (rp.z - rp.rz) * 0.22;
        rp.ryaw = rp.yaw || 0;
        rp.swing = rp.moving ? Math.sin(nowSec * 9.5) * 0.45 : (rp.swing * 0.85);
        const suitCol = rp.faction === 'bandit' ? [0.28, 0.25, 0.28, 1] : [0.42, 0.54, 0.38, 1];
        const visorCol = rp.faction === 'bandit' ? [1.0, 0.45, 0.22, 1] : [0.32, 0.95, 0.55, 1];
        const flash = rp.hitFlash > 0 ? 1.0 : 0;
        if (rp.hitFlash > 0) rp.hitFlash = Math.max(0, rp.hitFlash - 0.03);
        this._drawArmoredStalker(rp.rx, rp.ry, rp.rz, rp.ryaw, suitCol, visorCol, rp.swing, flash, 1.0, true, rp.faction || 'stalker');
        E.drawBox(rp.rx, rp.ry + 2.38 + Math.sin(nowSec * 3.5) * 0.04, rp.rz, 0.20, 0.20, 0.20, nowSec * 1.8, 0, visorCol, 'white', 1.35);
        if (rp.firing) {
          const fx = rp.rx - Math.sin(rp.ryaw) * 0.8;
          const fz = rp.rz - Math.cos(rp.ryaw) * 0.8;
          E.drawBox(fx, rp.ry + 1.28, fz, 0.24, 0.24, 0.24, nowSec * 22, 0, [1.0, 0.72, 0.22, 0.9], 'white', 2.4);
        }
      }

      // 4. Render World Stashes (12 Supply Crates across the 520m Zone)
      for (const st of this.world.worldStashes) {
        if (Math.hypot(player.x - st.x, player.z - st.z) > 130) continue;
        const hasLoot = st.items && st.items.length > 0;
        const col = hasLoot ? [0.74, 0.84, 0.62, 1] : [0.44, 0.46, 0.44, 1];
        E.drawBox(st.x, st.y + 0.34, st.z, 1.05, 0.64, 0.72, 0.2, 0, col, 'crate', hasLoot ? 0.22 : 0.0, true, 0.3);
        if (hasLoot) {
          E.drawBox(st.x, st.y + 0.72, st.z, 0.22, 0.08, 0.22, 0.2, 0, [0.95, 0.78, 0.28, 1], 'white', 1.1);
        }
      }

      // 5. Render Anomalies
      for (const a of this.world.anomalies) {
        const discharged = nowSec < a.dischargedUntil;
        if (discharged || Math.hypot(player.x - a.x, player.z - a.z) > 130) continue;
        const ay = this.world.getHeight(a.x, a.z);
        const p = 0.78 + Math.sin(a.pulse) * 0.22;
        if (a.type === 'acid') {
          E.drawBox(a.x, ay + 0.08, a.z, a.radius * 1.4, 0.08, a.radius * 1.4, 0, 0, [0.3, 0.98, 0.38, 0.68], 'swamp', 0.85, false, 0.7);
        } else if (a.type === 'electro') {
          E.drawBox(a.x, ay + 0.9 + Math.sin(a.pulse * 2) * 0.25, a.z, 0.65 * p, 0.65 * p, 0.65 * p, a.pulse, a.pulse * 0.5, [0.42, 0.92, 1.0, 0.68], 'white', 1.5, false);
        } else if (a.type === 'burner') {
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

      // 6. Proto-Anomalies
      for (const pr of this.world.protoAnomalies) {
        if (Math.hypot(player.x - pr.x, player.z - pr.z) > 150) continue;
        const py = this.world.getHeight(pr.x, pr.z);
        const col = pr.active ? [0.25, 0.95, 1.0, 0.92] : (pr.cooldown > 0 ? [0.4, 0.45, 0.5, 0.4] : [0.95, 0.75, 0.25, 0.88]);
        E.drawBox(pr.x, py + 1.9 + Math.sin(nowSec * 3) * 0.2, pr.z, 1.15, 1.15, 1.15, nowSec * 1.6, nowSec, col, 'white', 1.3, false);
        E.drawBox(pr.x, py + 0.3, pr.z, 2.4, 0.5, 2.4, 0, 0, [0.35, 0.38, 0.4, 1], 'hazard');
      }

      // 7. Artifacts
      for (const art of this.world.artifacts) {
        if (art.collected || Math.hypot(player.x - art.x, player.z - art.z) > 120) continue;
        const ay = this.world.getHeight(art.x, art.z);
        const def = window.GameData.ARTIFACTS[art.artId];
        const rgb = hexToRgb(def ? def.color : '#65e095');
        const alpha = art.revealed ? 0.96 : 0.14;
        const bob = ay + 0.65 + Math.sin(nowSec * 3.2 + art.bob) * 0.22;
        const sz = art.revealed ? 0.44 : 0.26;
        E.drawBox(art.x, bob, art.z, sz, sz, sz, nowSec * 2.1, nowSec * 1.4, [rgb[0], rgb[1], rgb[2], alpha], 'white', art.revealed ? 1.4 : 0.45, art.revealed);
      }

      // 8. Signal Stash & Loot Bags
      if (this.signalStash) {
        const s = this.signalStash;
        E.drawBox(s.x, s.y + 0.35, s.z, 0.95, 0.65, 0.65, 0.4, 0, [0.25, 0.85, 0.95, 1], 'crate', 0.55);
      }
      for (const b of this.lootBags) {
        const col = b.isPlayerBag ? [0.78, 0.35, 1.0, 1] : [0.80, 0.62, 0.34, 1];
        E.drawBox(b.x, b.y + 0.26, b.z, 0.72, 0.48, 0.48, 0.3, 0, col, 'crate', b.isPlayerBag ? 0.55 : 0.26);
        E.drawBox(b.x, b.y + 0.54, b.z, 0.28, 0.08, 0.22, 0.3, 0, [0.96, 0.78, 0.3, 1], 'white', 0.85);
        if (b.isPlayerBag) {
          E.drawBox(b.x, b.y + 5.0, b.z, 0.14, 10, 0.14, 0, 0, [0.78, 0.35, 1.0, 0.36], 'white', 1.2, false);
        }
      }

      // 9. Detailed Enemies (Stalkers, Bandits, Mercs & Upgraded Mutants)
      for (const en of this.enemies) {
        if (en.hp <= 0 || Math.hypot(player.x - en.x, player.z - en.z) > 135) continue;
        const flash = en.hitFlash > 0 ? 0.7 : 0;
        const legSwing = Math.sin(en.animPhase) * 0.34;
        const a = en.cloakAlpha;

        if (en.isHuman) {
          let suitCol, visorCol;
          if (en.faction === 'stalker') {
            suitCol = en.tier >= 2 ? [0.46, 0.58, 0.42, a] : [0.54, 0.58, 0.40, a];
            visorCol = [0.42, 0.95, 0.52, a];
          } else if (en.faction === 'merc') {
            suitCol = [0.28, 0.36, 0.48, a];
            visorCol = [0.28, 0.88, 1.0, a];
          } else {
            suitCol = en.tier >= 2 ? [0.36, 0.30, 0.28, a] : [0.25, 0.25, 0.28, a];
            visorCol = [0.98, 0.38, 0.22, a];
          }
          this._drawArmoredStalker(en.x, en.y, en.z, en.yaw, suitCol, visorCol, legSwing, flash, a, true, en.faction);
        } else if (en.kind === 'dog') {
          const cy = Math.cos(en.yaw), sy = Math.sin(en.yaw);
          const p = (lx, ly, lz, sx, syz, sz, rx, col, tex = 'bark') => E.drawBox(en.x + lx * cy + lz * sy, en.y + ly, en.z - lx * sy + lz * cy, sx, syz, sz, en.yaw, rx, col, tex, flash);
          p(0, 0.48, 0, 0.36, 0.34, 0.84, 0, [0.46, 0.34, 0.25, a]);
          p(0, 0.62, 0.46, 0.28, 0.26, 0.30, 0.08, [0.54, 0.38, 0.30, a]);       // Head
          p(0, 0.56, 0.66, 0.16, 0.14, 0.22, 0.05, [0.42, 0.30, 0.24, a]);       // Snout
          p(-0.12, 0.78, 0.40, 0.07, 0.14, 0.08, 0.2, [0.38, 0.26, 0.20, a]);    // Ears
          p(0.12,  0.78, 0.40, 0.07, 0.14, 0.08, 0.2, [0.38, 0.26, 0.20, a]);
          p(0, 0.54, -0.52, 0.08, 0.08, 0.32, -0.35, [0.40, 0.28, 0.22, a]);     // Tail
          p(-0.14, 0.22, 0.28, 0.11, 0.42, 0.13, legSwing, [0.36, 0.26, 0.20, a]);
          p(0.14,  0.22, 0.28, 0.11, 0.42, 0.13, -legSwing, [0.36, 0.26, 0.20, a]);
          p(-0.14, 0.22, -0.28, 0.11, 0.42, 0.13, -legSwing, [0.36, 0.26, 0.20, a]);
          p(0.14,  0.22, -0.28, 0.11, 0.42, 0.13, legSwing, [0.36, 0.26, 0.20, a]);
        } else if (en.kind === 'boar') {
          const cy = Math.cos(en.yaw), sy = Math.sin(en.yaw);
          const p = (lx, ly, lz, sx, syz, sz, rx, col, tex = 'bark') => E.drawBox(en.x + lx * cy + lz * sy, en.y + ly, en.z - lx * sy + lz * cy, sx, syz, sz, en.yaw, rx, col, tex, flash);
          p(0, 0.72, 0, 0.88, 0.76, 1.32, 0, [0.36, 0.26, 0.20, a]);
          p(0, 1.12, 0.22, 0.66, 0.32, 0.74, -0.15, [0.28, 0.21, 0.16, a]);       // Spine hump
          p(0, 0.70, 0.74, 0.54, 0.48, 0.48, 0.1, [0.42, 0.30, 0.24, a]);         // Head
          p(0, 0.60, 1.02, 0.28, 0.22, 0.20, 0, [0.56, 0.38, 0.32, a]);           // Snout
          p(-0.22, 0.58, 1.06, 0.07, 0.10, 0.30, -0.35, [0.92, 0.88, 0.76, a], 'white'); // Tusks
          p(0.22,  0.58, 1.06, 0.07, 0.10, 0.30, -0.35, [0.92, 0.88, 0.76, a], 'white');
          p(-0.34, 0.28, 0.42, 0.20, 0.54, 0.22, legSwing, [0.28, 0.20, 0.16, a]);
          p(0.34,  0.28, 0.42, 0.20, 0.54, 0.22, -legSwing, [0.28, 0.20, 0.16, a]);
          p(-0.34, 0.28, -0.42, 0.20, 0.54, 0.22, -legSwing, [0.28, 0.20, 0.16, a]);
          p(0.34,  0.28, -0.42, 0.20, 0.54, 0.22, legSwing, [0.28, 0.20, 0.16, a]);
        } else if (en.kind === 'bloodsucker') {
          const dw = a > 0.5;
          const cy = Math.cos(en.yaw), sy = Math.sin(en.yaw);
          const p = (lx, ly, lz, sx, syz, sz, rx, col, em = 0) => E.drawBox(en.x + lx * cy + lz * sy, en.y + ly, en.z - lx * sy + lz * cy, sx, syz, sz, en.yaw, rx, col, 'concrete', flash + em, dw);
          p(-0.16, 0.46, 0, 0.19, 0.90, 0.21, legSwing * 0.7, [0.38, 0.20, 0.22, a]);
          p(0.16,  0.46, 0, 0.19, 0.90, 0.21, -legSwing * 0.7, [0.38, 0.20, 0.22, a]);
          p(0, 1.24, 0.08, 0.54, 0.72, 0.32, 0.22, [0.46, 0.24, 0.26, a]);
          p(-0.38, 1.05, 0.28, 0.15, 0.74, 0.16, -0.6, [0.42, 0.22, 0.24, a]);
          p(0.38,  1.05, 0.28, 0.15, 0.74, 0.16, -0.6, [0.42, 0.22, 0.24, a]);
          p(-0.38, 0.80, 0.58, 0.09, 0.16, 0.24, -0.4, [0.22, 0.12, 0.14, a]);    // Claws
          p(0.38,  0.80, 0.58, 0.09, 0.16, 0.24, -0.4, [0.22, 0.12, 0.14, a]);
          p(0, 1.72, 0.22, 0.36, 0.38, 0.36, 0.15, [0.54, 0.28, 0.30, a]);
          p(-0.08, 1.78, 0.42, 0.07, 0.05, 0.04, 0, [1.0, 0.25, 0.2, Math.max(0.55, a)], 1.6);
          p(0.08,  1.78, 0.42, 0.07, 0.05, 0.04, 0, [1.0, 0.25, 0.2, Math.max(0.55, a)], 1.6);
          // 4 writhing face tentacles
          for (const tx of [-0.10, -0.035, 0.035, 0.10]) {
            p(tx, 1.50, 0.42, 0.045, 0.24, 0.055, Math.sin(nowSec * 6 + tx * 20) * 0.25, [0.48, 0.18, 0.22, a]);
          }
        }
      }

      // 10. Projectiles, Tracers & Particles
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
