// STALZONE Tactical HUD, Radar, PDA, Inventory, Bar NPCs & Mobile/Desktop Input Controller
window.GameUI = (function () {
  const $ = id => document.getElementById(id);

  class UI {
    constructor(game) {
      this.game = game;
      this.openModal = null;
      this.activeNpcId = null;
      this.activeLoot = null;     // { obj, kind }
      this.mcHand = null;         // { zone: 'loot'|'bag'|'stash', list, slot }
      this.lastTapInfo = { key: '', time: 0 };
      this.selectedBagSlot = null;
      this.selectedBagId = null;
      this.prevHumanCount = 0;
      this.hitmarkerTimer = 0;
      this.radarCtx = $('radar-canvas').getContext('2d');
      this.pdaCtx = $('pda-map-canvas').getContext('2d');
      this.markerCanvas = $('world-markers-canvas');
      this.markerCtx = this.markerCanvas ? this.markerCanvas.getContext('2d') : null;
      this._resizeMarkerCanvas();
      window.addEventListener('resize', () => this._resizeMarkerCanvas());

      // Unified input state (populated by both Keyboard/Mouse and Mobile Touch!)
      this.input = {
        moveX: 0, moveZ: 0,
        sprint: false, crouch: false, jump: false,
        fire: false, ads: false,
        lookDX: 0, lookDY: 0
      };
      this.keys = {};
      this.touchState = { joyId: null, joyOx: 0, joyOy: 0, lookId: null, lookX: 0, lookY: 0, fireId: null, fireX: 0, fireY: 0 };

      this._bindDOM();
      this._bindDesktopControls();
      this._bindTouchControls();
    }

    _resizeMarkerCanvas() {
      if (!this.markerCanvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.markerCanvas.width = Math.max(1, Math.floor(w * dpr));
      this.markerCanvas.height = Math.max(1, Math.floor(h * dpr));
      this.markerW = w;
      this.markerH = h;
      this.markerDpr = dpr;
    }

    resetTouchControls() {
      this.touchState.joyId = null;
      this.touchState.lookId = null;
      this.touchState.fireId = null;
      this.input.moveX = 0;
      this.input.moveZ = 0;
      this.input.sprint = false;
      this.input.fire = false;
      this.input.ads = false;
      this.input.jump = false;
      const joyBase = $('joystick-base');
      const joyKnob = $('joystick-knob');
      const sprintInd = $('sprint-indicator');
      const fireBtn = $('tbtn-fire');
      const adsBtn = $('tbtn-ads');
      if (joyKnob) joyKnob.style.transform = 'translate(0px, 0px)';
      if (joyBase) {
        joyBase.classList.add('idle');
        joyBase.style.left = '';
        joyBase.style.top = '';
        joyBase.style.bottom = '';
      }
      if (sprintInd) sprintInd.classList.remove('active');
      if (fireBtn) fireBtn.classList.remove('active');
      if (adsBtn) adsBtn.classList.remove('active');
    }

    _bindDOM() {
      const syncFactionCards = () => {
        const f = this.game.profile.faction || 'stalker';
        document.querySelectorAll('.faction-card').forEach(c => {
          c.classList.toggle('active', c.dataset.faction === f);
        });
      };
      syncFactionCards();
      document.querySelectorAll('.faction-card').forEach(card => {
        card.onclick = () => {
          window.SoundEngine.ensure();
          window.SoundEngine.playUI();
          this.game.setFaction(card.dataset.faction);
          syncFactionCards();
        };
      });

      $('btn-deploy').onclick = () => {
        window.SoundEngine.ensure();
        window.SoundEngine.playUI();
        $('start-overlay').classList.add('hidden');
        $('hud').classList.remove('hidden');
        this.game.started = true;
        this.applySettingsUI();
        const fac = window.GameData.FACTIONS[this.game.profile.faction] || window.GameData.FACTIONS.stalker;
        this.game.toast(`Вы в Зоне за «${fac.name}»! База: ${fac.baseName}.`, 'good');
      };

      $('btn-reset-save').onclick = () => {
        if (confirm('Сбросить весь прогресс, схрон и снаряжение?')) {
          this.game.profile = window.GameData.resetProfile();
          this.game.respawnAtBar(false);
          syncFactionCards();
          this.game.toast('Прогресс сброшен.', 'good');
        }
      };

      $('btn-loot-take-all').onclick = () => this._lootTakeAll();
      $('btn-loot-drop-hand').onclick = () => { this.mcHand = null; this.renderLootModal(); };
      $('btn-inv-cancel-hand').onclick = () => { this.mcHand = null; this.renderInventory(); };

      $('btn-hud-pda').onclick = () => this.toggleModal('modal-pda');
      $('btn-hud-inv').onclick = () => this.toggleModal('modal-inventory');
      $('btn-hud-menu').onclick = () => this.toggleModal('modal-settings');

      document.querySelectorAll('.btn-close-modal').forEach(b => {
        b.onclick = () => this.closeAllModals();
      });

      document.querySelectorAll('.pda-tab').forEach(btn => {
        btn.onclick = () => {
          window.SoundEngine.playUI();
          document.querySelectorAll('.pda-tab').forEach(x => x.classList.remove('active'));
          btn.classList.add('active');
          const tab = btn.dataset.pda;
          $('pda-tab-map').classList.toggle('hidden', tab !== 'map');
          $('pda-tab-radio').classList.toggle('hidden', tab !== 'radio');
          $('pda-tab-quests').classList.toggle('hidden', tab !== 'quests');
          $('pda-tab-stats').classList.toggle('hidden', tab !== 'stats');
          this.renderPDA();
        };
      });

      const switchSector = (sec) => {
        window.SoundEngine.playUI();
        this.game.onlineMeta.sectorId = sec;
        if (window.AndroidBridge && window.AndroidBridge.setOnlineSector) {
          try { window.AndroidBridge.setOnlineSector(sec); } catch (_) {}
        }
        this.updateOnlineBadges();
        this.renderRadioChat();
        this.game.toast(`Переключено на ${sec === 'zone_2' ? 'СЕКТОР 2' : 'СЕКТОР 1'}`, 'good');
      };
      if ($('btn-sector-1')) $('btn-sector-1').onclick = () => switchSector('zone_1');
      if ($('btn-sector-2')) $('btn-sector-2').onclick = () => switchSector('zone_2');

      const sendRadio = () => {
        const inp = $('radio-chat-input');
        if (!inp) return;
        const txt = inp.value.trim();
        if (!txt) return;
        if (window.AndroidBridge && window.AndroidBridge.sendChatMessage) {
          try { window.AndroidBridge.sendChatMessage(this.game.profile.faction || 'stalker', txt); } catch (_) {}
        }
        inp.value = '';
        window.SoundEngine.playUI();
      };
      if ($('btn-radio-send')) $('btn-radio-send').onclick = sendRadio;
      if ($('radio-chat-input')) {
        $('radio-chat-input').addEventListener('keydown', e => {
          e.stopPropagation();
          if (e.key === 'Enter') sendRadio();
        });
      }

      $('btn-trigger-emission').onclick = () => {
        this.closeAllModals();
        this.game.entities.triggerEmissionNow(this.game);
      };

      $('btn-ammo-type').onclick = () => this.game.cycleAmmoType();
      $('btn-fire-mode').onclick = () => this.game.toggleFireMode();
      $('btn-signal-scan').onclick = () => this.game.entities.startSignalScan(this.game.player.x, this.game.player.z, this.game);
      $('interact-prompt').onclick = () => this.game.interact();

      document.querySelectorAll('.q-slot').forEach(btn => {
        btn.onclick = () => this.game.useQuickSlot(Number(btn.dataset.slot));
      });

      // Settings controls
      $('set-sens').oninput = e => {
        this.game.profile.settings.sensitivity = parseFloat(e.target.value);
        $('sens-val').textContent = this.game.profile.settings.sensitivity.toFixed(1);
        this.game.save();
      };
      $('set-vol').oninput = e => {
        const v = parseFloat(e.target.value);
        this.game.profile.settings.volume = v;
        $('vol-val').textContent = Math.round(v * 100) + '%';
        window.SoundEngine.setVolume(v);
        this.game.save();
      };
      $('set-touch').onchange = e => {
        this.game.profile.settings.touchControls = e.target.checked;
        this.applySettingsUI();
        this.game.save();
      };
      $('btn-save-now').onclick = () => {
        this.game.save();
        this.game.toast('✔ Прогресс сохранён в профиль!', 'good');
      };
      if ($('btn-sign-out')) {
        $('btn-sign-out').onclick = () => {
          this.game.save();
          if (window.AndroidBridge && window.AndroidBridge.requestSignOut) {
            window.AndroidBridge.requestSignOut();
          }
        };
      }
      $('btn-switch-faction').onclick = () => {
        const next = (this.game.profile.faction === 'bandit') ? 'stalker' : 'bandit';
        this.game.setFaction(next);
        this.closeAllModals();
        const fac = window.GameData.FACTIONS[next];
        this.game.toast(`Фракция изменена: «${fac.name}» (${fac.baseName})!`, 'good');
      };
      $('btn-respawn-bar').onclick = () => {
        this.closeAllModals();
        this.game.respawnAtBar(false);
        const fac = window.GameData.FACTIONS[this.game.profile.faction] || window.GameData.FACTIONS.stalker;
        this.game.toast(`Вы вернулись на базу «${fac.baseName}».`, 'good');
      };
      $('btn-exit-game').onclick = () => {
        this.game.save();
        if (window.AndroidBridge && window.AndroidBridge.requestExit) {
          window.AndroidBridge.requestExit();
        } else {
          this.closeAllModals();
        }
      };
      $('btn-respawn').onclick = () => {
        this.closeAllModals();
        this.game.respawnAtBar(false);
      };
    }

    applySettingsUI() {
      const s = this.game.profile.settings;
      $('set-sens').value = s.sensitivity;
      $('sens-val').textContent = s.sensitivity.toFixed(1);
      $('set-vol').value = s.volume;
      $('vol-val').textContent = Math.round(s.volume * 100) + '%';
      $('set-touch').checked = !!s.touchControls;
      window.SoundEngine.setVolume(s.volume);
      $('touch-controls').classList.toggle('hidden', !s.touchControls);
    }

    _bindDesktopControls() {
      window.addEventListener('keydown', e => {
        if (!this.game.started) return;
        const code = e.code;
        if (code === 'Tab') { e.preventDefault(); this.toggleModal('modal-inventory'); return; }
        if (code === 'KeyM') { e.preventDefault(); this.toggleModal('modal-pda'); return; }
        if (code === 'Escape') {
          if (this.openModal) this.closeAllModals();
          else this.toggleModal('modal-settings');
          return;
        }
        if (this.openModal) return;

        this.keys[code] = true;
        if (code === 'KeyR') this.game.startReload();
        if (code === 'KeyF') this.game.interact();
        if (code === 'KeyB' || code === 'Digit4') this.game.throwBoltAction();
        if (code === 'KeyG') this.game.toggleDetector();
        if (code === 'KeyL') this.game.toggleFlashlight();
        if (code === 'KeyX' && this.game.player.holdingDetector) {
          this.game.entities.startSignalScan(this.game.player.x, this.game.player.z, this.game);
        }
        if (code === 'KeyV') this.game.toggleFireMode();
        if (code === 'KeyT') this.game.cycleAmmoType();
        if (code === 'Digit1') this.game.selectWeaponSlot('primary');
        if (code === 'Digit2') this.game.selectWeaponSlot('secondary');
        if (code === 'Digit3') this.game.selectWeaponSlot('melee');
        if (code === 'Digit5') this.game.useQuickSlot(5);
        if (code === 'Digit6') this.game.useQuickSlot(6);
        if (code === 'Digit7') this.game.useQuickSlot(7);
        if (code === 'Digit8') this.game.useQuickSlot(8);
        if (code === 'Digit9') this.game.useQuickSlot(9);
        if (code === 'KeyC' || code === 'ControlLeft') this.input.crouch = !this.input.crouch;
      });

      window.addEventListener('keyup', e => {
        this.keys[e.code] = false;
      });

      const canvas = $('game-canvas');
      canvas.addEventListener('mousedown', e => {
        if (!this.game.started || this.openModal) return;
        window.SoundEngine.ensure();
        if (!this.game.profile.settings.touchControls && document.pointerLockElement !== canvas) {
          canvas.requestPointerLock?.();
        }
        if (e.button === 0) this.input.fire = true;
        if (e.button === 2) this.input.ads = true;
      });
      window.addEventListener('mouseup', e => {
        if (e.button === 0) this.input.fire = false;
        if (e.button === 2) this.input.ads = false;
      });
      window.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('mousemove', e => {
        if (document.pointerLockElement === canvas && !this.openModal) {
          const sens = 0.0022 * this.game.profile.settings.sensitivity;
          this.input.lookDX += e.movementX * sens;
          this.input.lookDY += e.movementY * sens;
        }
      });
    }

    _bindTouchControls() {
      const leftZone = $('touch-left-zone');
      const joyBase = $('joystick-base');
      const joyKnob = $('joystick-knob');
      const sprintInd = $('sprint-indicator');
      const lookZone = $('touch-look-zone');
      const fireBtn = $('tbtn-fire');

      const resetJoyOnly = () => {
        this.touchState.joyId = null;
        this.input.moveX = 0;
        this.input.moveZ = 0;
        this.input.sprint = false;
        joyKnob.style.transform = 'translate(0px, 0px)';
        joyBase.classList.add('idle');
        joyBase.style.left = '';
        joyBase.style.top = '';
        joyBase.style.bottom = '';
        sprintInd.classList.remove('active');
      };

      // Left floating joystick with sprint push-forward zone
      leftZone.addEventListener('touchstart', e => {
        if (this.openModal || !this.game.started) return;
        e.preventDefault();
        window.SoundEngine.ensure();
        for (const t of e.changedTouches) {
          if (this.touchState.joyId === null) {
            this.touchState.joyId = t.identifier;
            const rect = leftZone.getBoundingClientRect();
            const bx = Math.max(54, Math.min(rect.width - 54, t.clientX - rect.left));
            const by = Math.max(54, Math.min(rect.height - 54, t.clientY - rect.top));
            this.touchState.joyOx = t.clientX;
            this.touchState.joyOy = t.clientY;
            joyBase.classList.remove('idle');
            joyBase.style.left = (bx - 48) + 'px';
            joyBase.style.top = (by - 48) + 'px';
            joyBase.style.bottom = 'auto';
            joyKnob.style.transform = 'translate(0px, 0px)';
          }
        }
      }, { passive: false });

      // Right drag-to-look surface
      lookZone.addEventListener('touchstart', e => {
        if (this.openModal || !this.game.started) return;
        e.preventDefault();
        window.SoundEngine.ensure();
        for (const t of e.changedTouches) {
          if (this.touchState.lookId === null) {
            this.touchState.lookId = t.identifier;
            this.touchState.lookX = t.clientX;
            this.touchState.lookY = t.clientY;
          }
        }
      }, { passive: false });

      // FIRE button (supports drag-to-aim while firing — essential for mobile FPS!)
      fireBtn.addEventListener('touchstart', e => {
        if (this.openModal || !this.game.started) return;
        e.preventDefault(); e.stopPropagation();
        window.SoundEngine.ensure();
        const t = e.changedTouches[0];
        this.touchState.fireId = t.identifier;
        this.touchState.fireX = t.clientX;
        this.touchState.fireY = t.clientY;
        this.input.fire = true;
        fireBtn.classList.add('active');
      }, { passive: false });

      // Global window-level touch tracking guarantees joystick/look/fire NEVER get stuck!
      // IMPORTANT: Only calls preventDefault() when a gameplay touch is active and no modal is open,
      // so native scrolling inside Trader/Fence/Inventory/PDA modals ALWAYS works smoothly.
      window.addEventListener('touchmove', e => {
        if (this.openModal || !this.game.started) return;
        const ts = this.touchState;
        if (ts.joyId === null && ts.lookId === null && ts.fireId === null) return;

        let handled = false;
        let joyAlive = false, lookAlive = false, fireAlive = false;
        for (let i = 0; i < e.touches.length; i++) {
          const id = e.touches[i].identifier;
          if (id === ts.joyId) joyAlive = true;
          if (id === ts.lookId) lookAlive = true;
          if (id === ts.fireId) fireAlive = true;
        }
        if (ts.joyId !== null && !joyAlive) resetJoyOnly();
        if (ts.lookId !== null && !lookAlive) ts.lookId = null;
        if (ts.fireId !== null && !fireAlive) {
          ts.fireId = null;
          this.input.fire = false;
          fireBtn.classList.remove('active');
        }

        const sensLook = 0.0046 * this.game.profile.settings.sensitivity * (this.input.ads ? 0.52 : 1.0);
        const sensFire = 0.0042 * this.game.profile.settings.sensitivity * (this.input.ads ? 0.52 : 1.0);

        for (const t of e.changedTouches) {
          if (t.identifier === ts.joyId) {
            handled = true;
            const dx = t.clientX - ts.joyOx;
            const dy = t.clientY - ts.joyOy;
            const maxR = 44;
            const dist = Math.hypot(dx, dy);
            const cl = Math.min(maxR, dist);
            const ang = Math.atan2(dy, dx);
            const kx = Math.cos(ang) * cl;
            const ky = Math.sin(ang) * cl;
            joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
            this.input.moveX = kx / maxR;
            this.input.moveZ = -ky / maxR;
            const sprinting = (-dy > 54 && Math.abs(dx) < 42);
            this.input.sprint = sprinting;
            sprintInd.classList.toggle('active', sprinting);
          } else if (t.identifier === ts.lookId) {
            handled = true;
            this.input.lookDX += (t.clientX - ts.lookX) * sensLook;
            this.input.lookDY += (t.clientY - ts.lookY) * sensLook;
            ts.lookX = t.clientX;
            ts.lookY = t.clientY;
          } else if (t.identifier === ts.fireId) {
            handled = true;
            this.input.lookDX += (t.clientX - ts.fireX) * sensFire;
            this.input.lookDY += (t.clientY - ts.fireY) * sensFire;
            ts.fireX = t.clientX;
            ts.fireY = t.clientY;
          }
        }
        if (handled) e.preventDefault();
      }, { passive: false });

      const endAnyTouch = e => {
        const ts = this.touchState;
        for (const t of e.changedTouches) {
          if (t.identifier === ts.joyId) resetJoyOnly();
          if (t.identifier === ts.lookId) ts.lookId = null;
          if (t.identifier === ts.fireId) {
            ts.fireId = null;
            this.input.fire = false;
            fireBtn.classList.remove('active');
          }
        }
        // Double-check against active e.touches list in case Android dropped a touchcancel
        if (e.touches.length === 0) {
          if (ts.joyId !== null) resetJoyOnly();
          ts.lookId = null;
          if (ts.fireId !== null) {
            ts.fireId = null;
            this.input.fire = false;
            fireBtn.classList.remove('active');
          }
        }
      };
      window.addEventListener('touchend', endAnyTouch, { passive: true });
      window.addEventListener('touchcancel', endAnyTouch, { passive: true });
      window.addEventListener('blur', () => this.resetTouchControls());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.resetTouchControls();
      });

      // ADS toggle button
      $('tbtn-ads').addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        this.input.ads = !this.input.ads;
        $('tbtn-ads').classList.toggle('active', this.input.ads);
        window.SoundEngine.playUI();
      }, { passive: false });

      $('tbtn-reload').addEventListener('touchstart', e => { e.preventDefault(); this.game.startReload(); }, { passive: false });
      $('tbtn-jump').addEventListener('touchstart', e => { e.preventDefault(); this.input.jump = true; }, { passive: false });
      $('tbtn-crouch').addEventListener('touchstart', e => {
        e.preventDefault();
        this.input.crouch = !this.input.crouch;
        $('tbtn-crouch').classList.toggle('active', this.input.crouch);
      }, { passive: false });
      $('tbtn-interact').addEventListener('touchstart', e => { e.preventDefault(); this.game.interact(); }, { passive: false });

      $('tbtn-wpn1').onclick = () => this.game.selectWeaponSlot('primary');
      $('tbtn-wpn2').onclick = () => this.game.selectWeaponSlot('secondary');
      $('tbtn-knife').onclick = () => this.game.selectWeaponSlot('melee');
      $('tbtn-bolt').onclick = () => this.game.throwBoltAction();
      $('tbtn-det').onclick = () => this.game.toggleDetector();
      $('tbtn-light').onclick = () => this.game.toggleFlashlight();
    }

    pollKeyboardInput() {
      if (this.touchState.joyId === null) {
        let mx = 0, mz = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) mz += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) mz -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx -= 1;
        const len = Math.hypot(mx, mz);
        this.input.moveX = len > 0 ? mx / len : 0;
        this.input.moveZ = len > 0 ? mz / len : 0;
        this.input.sprint = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
      }
      if (this.keys['Space']) this.input.jump = true;
    }

    toggleModal(modalId) {
      window.SoundEngine.playUI();
      if (this.openModal === modalId) {
        this.closeAllModals();
        return;
      }
      this.closeAllModals();
      this.resetTouchControls();
      this.openModal = modalId;
      $(modalId).classList.remove('hidden');
      document.exitPointerLock?.();

      if (modalId === 'modal-inventory') this.renderInventory();
      if (modalId === 'modal-pda') this.renderPDA();
    }

    openNpcModal(npcId) {
      this.activeNpcId = npcId;
      this.closeAllModals();
      this.resetTouchControls();
      this.openModal = 'modal-npc';
      $('modal-npc').classList.remove('hidden');
      document.exitPointerLock?.();
      this.renderNpcModal();
    }

    openLootModal(obj, kind) {
      this.closeAllModals();
      this.resetTouchControls();
      this.activeLoot = { obj, kind };
      this.mcHand = null;
      this.openModal = 'modal-loot';
      $('modal-loot').classList.remove('hidden');
      document.exitPointerLock?.();
      this.renderLootModal();
    }

    showDeathModal(reason) {
      this.closeAllModals();
      this.resetTouchControls();
      this.openModal = 'modal-death';
      $('death-reason').textContent = 'Причина: ' + reason;
      const fac = window.GameData.FACTIONS[this.game.profile.faction] || window.GameData.FACTIONS.stalker;
      $('btn-respawn').textContent = `ВОЗРОДИТЬСЯ НА БАЗЕ «${fac.baseName.toUpperCase()}»`;
      $('modal-death').classList.remove('hidden');
      document.exitPointerLock?.();
    }

    closeAllModals() {
      ['modal-inventory', 'modal-loot', 'modal-pda', 'modal-npc', 'modal-settings', 'modal-death'].forEach(id => {
        const el = $(id);
        if (el) el.classList.add('hidden');
      });
      if (this.activeLoot && this.activeLoot.kind === 'signal' && this.activeLoot.obj.items.length === 0) {
        this.game.entities.signalStash = null;
      }
      this.activeLoot = null;
      this.mcHand = null;
      this.openModal = null;
      this.resetTouchControls();
    }

    // === MINECRAFT-STYLE SLOT GRID RENDERER (Tap-Pick, Tap-Place/Swap/Stack, Double-Tap Quick-Transfer, Drag & Drop) ===
    _renderMcGrid(container, zoneKey, list, slotCount, opts = {}) {
      const GD = window.GameData;
      GD.ensureSlots(list, slotCount);
      const bySlot = new Array(slotCount).fill(null);
      for (const it of list) {
        if (it.slot >= 0 && it.slot < slotCount) bySlot[it.slot] = it;
      }

      container.innerHTML = '';
      for (let s = 0; s < slotCount; s++) {
        const entry = bySlot[s];
        const def = entry ? GD.ITEMS[entry.id] : null;
        const cell = document.createElement('div');
        const isPicked = this.mcHand && this.mcHand.zone === zoneKey && this.mcHand.slot === s;
        const isSel = opts.selectedSlot === s && !!entry;
        cell.className = 'mc-slot'
          + (def ? ` filled tier-${def.tier || 1}` : '')
          + (isPicked ? ' picked' : '')
          + (isSel ? ' selected' : '');
        cell.draggable = !!entry;

        if (def) {
          cell.innerHTML = `
            <span class="mc-ico">${def.icon || '📦'}</span>
            <span class="mc-short">${def.short || def.name.slice(0, 7)}</span>
            <span class="mc-cnt">${entry.count > 1 ? entry.count : ''}</span>
          `;
          cell.title = `${def.name} (x${entry.count})`;
        }

        // Desktop Drag & Drop
        cell.ondragstart = e => {
          if (!entry) { e.preventDefault(); return; }
          this.mcHand = { zone: zoneKey, list, slot: s, slotCount };
          e.dataTransfer.setData('text/plain', `${zoneKey}:${s}`);
        };
        cell.ondragover = e => e.preventDefault();
        cell.ondrop = e => {
          e.preventDefault();
          if (this.mcHand) {
            this._completeMcMove(list, s, slotCount, opts.onChange);
          }
        };

        // Tap / Click (Minecraft pick-up -> tap destination to place/stack/swap; Double-tap = Quick Transfer!)
        cell.onclick = () => {
          const now = performance.now();
          const tapKey = `${zoneKey}:${s}`;
          const isDoubleTap = (this.lastTapInfo.key === tapKey && (now - this.lastTapInfo.time) < 340);
          this.lastTapInfo = { key: tapKey, time: now };

          if (opts.onInspect && entry) opts.onInspect(entry, s);

          // Double-tap quick shift between containers (like Shift+Click in Minecraft!)
          if (isDoubleTap && entry && opts.quickTargetList) {
            this.mcHand = null;
            const taken = GD.addItemToList(opts.quickTargetList, entry.id, entry.count, opts.quickTargetSlots || 24);
            if (taken) {
              const idx = list.indexOf(entry);
              if (idx >= 0) list.splice(idx, 1);
              window.SoundEngine.playUI();
              this.game.save();
              if (opts.onChange) opts.onChange();
            } else {
              this.game.toast('Нет свободных слотов!', 'bad');
            }
            return;
          }

          if (!this.mcHand) {
            if (!entry) return;
            this.mcHand = { zone: zoneKey, list, slot: s, slotCount };
            window.SoundEngine.playUI();
            if (opts.onChange) opts.onChange();
          } else if (this.mcHand.zone === zoneKey && this.mcHand.slot === s) {
            this.mcHand = null;
            window.SoundEngine.playUI();
            if (opts.onChange) opts.onChange();
          } else {
            this._completeMcMove(list, s, slotCount, opts.onChange);
          }
        };

        container.appendChild(cell);
      }
    }

    _completeMcMove(dstList, dstSlot, dstMaxSlots, onChange) {
      const h = this.mcHand;
      if (!h) return;
      window.GameData.moveBetweenSlots(h.list, h.slot, dstList, dstSlot, dstMaxSlots);
      this.mcHand = null;
      window.SoundEngine.playUI();
      this.game.save();
      if (onChange) onChange();
    }

    renderLootModal() {
      if (!this.activeLoot) return;
      const g = this.game;
      const prof = g.profile;
      const src = this.activeLoot.obj;
      const derived = window.GameData.getPlayerDerivedStats(prof);

      $('loot-modal-title').textContent = (src.title || 'СУМКА С ХАБАРОМ').toUpperCase();
      $('loot-src-heading').textContent = `${src.title || 'СУМКА'} (12 СЛОТОВ)`;
      $('loot-src-count').textContent = `${src.items.length} слот.`;
      $('loot-bag-weight').textContent = `${derived.weight.toFixed(1)} / ${derived.maxWeight.toFixed(0)} кг`;

      const handBar = $('loot-hand-bar');
      const dropBtn = $('btn-loot-drop-hand');
      if (this.mcHand) {
        const it = this.mcHand.list.find(x => x.slot === this.mcHand.slot);
        const def = it ? window.GameData.ITEMS[it.id] : null;
        if (def) {
          handBar.classList.add('holding');
          $('loot-hand-text').textContent = `✋ В руке: ${def.icon || ''} ${def.name} x${it.count} — нажмите на любую ячейку чтобы положить`;
          dropBtn.classList.remove('hidden');
        } else {
          this.mcHand = null;
        }
      }
      if (!this.mcHand) {
        handBar.classList.remove('holding');
        $('loot-hand-text').textContent = 'Нажмите на предмет, затем на пустую или занятую ячейку • Двойной тап — быстро перенести';
        dropBtn.classList.add('hidden');
      }

      this._renderMcGrid($('loot-source-grid'), 'loot', src.items, 12, {
        quickTargetList: prof.backpack,
        quickTargetSlots: window.GameData.BACKPACK_SLOTS,
        onChange: () => this.renderLootModal()
      });
      this._renderMcGrid($('loot-backpack-grid'), 'bag', prof.backpack, window.GameData.BACKPACK_SLOTS, {
        quickTargetList: src.items,
        quickTargetSlots: 12,
        onChange: () => this.renderLootModal()
      });
    }

    _lootTakeAll() {
      if (!this.activeLoot) return;
      const src = this.activeLoot.obj;
      const prof = this.game.profile;
      let moved = 0;
      for (let i = src.items.length - 1; i >= 0; i--) {
        const it = src.items[i];
        if (window.GameData.addItemToList(prof.backpack, it.id, it.count, window.GameData.BACKPACK_SLOTS)) {
          src.items.splice(i, 1);
          moved++;
        }
      }
      if (moved > 0) {
        window.SoundEngine.playHeal();
        this.game.toast(`✔ Забрано слотов: ${moved}`, 'good');
      } else {
        this.game.toast('Рюкзак полон или сумка пуста!', 'bad');
      }
      this.game.save();
      if (src.items.length === 0) this.closeAllModals();
      else this.renderLootModal();
    }

    triggerHitmarker(isHeadshot) {
      const hm = $('hitmarker');
      hm.classList.remove('hidden');
      hm.classList.toggle('crit', !!isHeadshot);
      this.hitmarkerTimer = isHeadshot ? 0.24 : 0.14;
    }

    pushKillfeed(text, isHeadshot) {
      const kf = $('killfeed');
      const div = document.createElement('div');
      div.className = 'kf-row' + (isHeadshot ? ' hs' : '');
      div.textContent = text;
      kf.prepend(div);
      while (kf.children.length > 4) kf.lastChild.remove();
      setTimeout(() => div.remove(), 5500);
    }

    toast(msg, kind = '') {
      const c = $('toast-container');
      const div = document.createElement('div');
      div.className = 'toast-msg ' + kind;
      div.textContent = msg;
      c.appendChild(div);
      while (c.children.length > 3) c.firstChild.remove();
      setTimeout(() => div.remove(), 3600);
    }

    // === REAL-TIME HUD + RADAR UPDATE ===
    updateHUD(dt) {
      const g = this.game;
      const p = g.player;
      const derived = window.GameData.getPlayerDerivedStats(g.profile);
      const wpn = g.getActiveWeaponStats();

      if (this.hitmarkerTimer > 0) {
        this.hitmarkerTimer -= dt;
        if (this.hitmarkerTimer <= 0) $('hitmarker').classList.add('hidden');
      }

      // Vitals
      $('bar-hp').style.width = Math.max(0, Math.min(100, p.hp)) + '%';
      $('val-hp').textContent = Math.ceil(p.hp);
      $('bar-stam').style.width = Math.max(0, Math.min(100, p.stamina)) + '%';
      $('icon-bleed').classList.toggle('hidden', p.bleeding <= 1);

      const wOver = derived.weight > derived.maxWeight;
      $('val-weight').textContent = `${derived.weight.toFixed(1)}/${derived.maxWeight.toFixed(0)} кг`;
      $('val-weight').classList.toggle('over', wOver);

      // 4 Contaminations (auto-dim when 0)
      const keys = ['rad', 'bio', 'therm', 'psy'];
      for (const k of keys) {
        const v = Math.round(p.contam[k]);
        $('bar-' + k).style.width = Math.min(100, v) + '%';
        $('val-' + k).textContent = v;
        $('chip-' + k).classList.toggle('active', v > 0);
      }

      // Screen-space contamination & status FX
      $('fx-bleed').style.opacity = Math.min(0.85, (p.bleeding / 100) * (0.6 + Math.sin(performance.now() * 0.008) * 0.35));
      $('fx-rad').style.opacity = Math.min(0.75, p.contam.rad / 110);
      $('fx-bio').style.opacity = Math.min(0.7, p.contam.bio / 110);
      $('fx-therm').style.opacity = Math.min(0.75, p.contam.therm / 100);
      $('fx-psy').style.opacity = Math.min(0.8, p.contam.psy / 100);
      $('fx-damage').style.opacity = Math.min(0.85, p.damageFlash);
      $('fx-emission').style.opacity = g.entities.emission.phase === 'active'
        ? (0.35 + Math.sin(performance.now() * 0.01) * 0.15) : 0;

      // Weapon panel
      const isMelee = !p.holdingDetector && p.activeSlot === 'melee';
      const magState = p.mags[wpn.id] ?? wpn.mag;
      const ammoItemId = 'ammo_' + p.ammoType;
      const reserve = window.GameData.countItem(g.profile.backpack, ammoItemId);
      $('hud-wpn-name').textContent = p.holdingDetector ? derived.detector.name : wpn.name;
      $('hud-wpn-tier').textContent = isMelee ? 'БЛИЖ' : (p.holdingDetector ? 'САК' : ('+' + (wpn.level || 0)));
      $('hud-ammo-mag').textContent = isMelee || p.holdingDetector ? '—' : magState;
      $('hud-ammo-res').textContent = isMelee || p.holdingDetector ? '∞' : reserve;
      $('btn-ammo-type').textContent = isMelee ? 'НОЖ' : window.GameData.AMMO_TYPES[p.ammoType].short;
      $('btn-fire-mode').textContent = isMelee ? 'УДАР' : (p.fireMode === 'auto' ? 'АВТО' : 'ОДИН');

      // Quick slot counts
      $('q-medkit').textContent = window.GameData.countItem(g.profile.backpack, 'medkit');
      $('q-bandage').textContent = window.GameData.countItem(g.profile.backpack, 'bandage');
      $('q-antirad').textContent = window.GameData.countItem(g.profile.backpack, 'antirad');
      $('q-energy').textContent = window.GameData.countItem(g.profile.backpack, 'energy');
      $('q-grenade').textContent = window.GameData.countItem(g.profile.backpack, 'grenade');

      // Utility & ADS active states
      $('tbtn-wpn1').classList.toggle('active', !p.holdingDetector && p.activeSlot === 'primary');
      $('tbtn-wpn2').classList.toggle('active', !p.holdingDetector && p.activeSlot === 'secondary');
      $('tbtn-knife').classList.toggle('active', isMelee);
      $('tbtn-det').classList.toggle('active', p.holdingDetector);
      $('tbtn-light').classList.toggle('active', !!p.flashlightOn);
      $('tbtn-ads').classList.toggle('active', this.input.ads);

      // Clock, Weather, Money, Region, Faction & Campfire pills
      $('hud-clock').textContent = g.world.getFormattedClock();
      $('hud-weather').textContent = g.world.getWeatherLabel(g.entities.emission.phase);
      $('hud-money').textContent = g.profile.money.toLocaleString('ru-RU') + ' ₽';
      const pFac = g.profile.faction || 'stalker';
      $('radar-zone-tag').textContent = g.world.getRegionName(p.x, p.z, pFac);

      const facBadge = $('faction-badge');
      if (facBadge) {
        facBadge.textContent = pFac === 'bandit' ? 'БАНДИТЫ' : 'СТАЛКЕРЫ';
        facBadge.className = 'status-pill ' + (pFac === 'bandit' ? 'faction-bandit' : 'faction-stalker');
      }
      const fireBadge = $('fire-badge');
      if (fireBadge) fireBadge.classList.toggle('hidden', !p.nearCampfire);

      const inSafe = g.world.isSafeZone(p.x, p.z, pFac);
      const hasRoof = inSafe || g.engine.hasRoofCover(p.x, p.y + 1.5, p.z);
      $('safe-badge').classList.toggle('hidden', !inSafe);
      $('roof-badge').classList.toggle('hidden', inSafe || !hasRoof);

      // Emission banner
      const em = g.entities.emission;
      const emBan = $('emission-banner');
      if (em.phase === 'warning' || em.phase === 'active') {
        emBan.classList.remove('hidden');
        $('emission-sub').textContent = hasRoof
          ? `✔ ВЫ В УКРЫТИИ (${Math.ceil(em.timer)} с)`
          : `⚠ СРОЧНО ПОД КРЫШУ! (${Math.ceil(em.timer)} с)`;
      } else {
        emBan.classList.add('hidden');
      }

      // Proto-Anomaly progress banner
      const actProto = g.world.protoAnomalies.find(pr => pr.active);
      $('proto-banner').classList.toggle('hidden', !actProto);
      if (actProto) $('proto-bar-fill').style.width = Math.min(100, actProto.progress) + '%';

      // Compass heading
      const deg = (((-p.yaw * 180 / Math.PI) % 360) + 360) % 360;
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      $('compass-bar').textContent = dirs[Math.round(deg / 45) % 8] + ' ' + String(Math.round(deg)).padStart(3, '0') + '°';

      // Crosshair spread & ADS optic scope (AK-74M uses 3D translucent EOTech holo sight!)
      const showScope = p.adsBlend > 0.72 && wpn.hasOptic && wpn.id !== 'ak74m' && !p.holdingDetector;
      $('scope-overlay').classList.toggle('hidden', !showScope);
      $('crosshair').classList.toggle('hidden', p.adsBlend > 0.4 || p.holdingDetector);
      const spreadPx = Math.round(6 + p.currentSpread * 420);
      document.querySelector('.ch-top').style.bottom = spreadPx + 'px';
      document.querySelector('.ch-bottom').style.top = spreadPx + 'px';
      document.querySelector('.ch-left').style.right = spreadPx + 'px';
      document.querySelector('.ch-right').style.left = spreadPx + 'px';

      // Reload bar
      if (p.reloadTimer > 0) {
        $('reload-bar-wrap').classList.remove('hidden');
        const pct = Math.max(0, Math.min(100, (1 - p.reloadTimer / wpn.reloadTime) * 100));
        $('reload-fill').style.width = pct + '%';
      } else {
        $('reload-bar-wrap').classList.add('hidden');
      }

      // Detector HUD
      $('detector-hud').classList.toggle('hidden', !p.holdingDetector);
      if (p.holdingDetector) {
        $('det-name').textContent = derived.detector.name;
        const leds = document.querySelectorAll('#detector-hud .det-led');
        const sig = g.detectorSignalStrength;
        const litCount = Math.round(sig * leds.length);
        leds.forEach((el, i) => {
          el.classList.toggle('on', i < litCount && litCount < 5);
          el.classList.toggle('hot', i < litCount && litCount >= 5);
        });
        if (g.entities.signalScan.active) {
          $('det-mode').textContent = 'СИГНАЛ САК';
          const dSig = Math.hypot(p.x - g.entities.signalScan.targetX, p.z - g.entities.signalScan.targetZ);
          $('det-text').textContent = `ЧАСТОТА: ~${Math.round(dSig)} м`;
        } else {
          $('det-mode').textContent = 'АРТЕФАКТЫ';
          const hasArts = g.world.artifacts.some(a => !a.collected);
          $('det-text').textContent = sig > 0.08
            ? `ОТКЛИК: ${Math.round(sig * 100)}%`
            : (hasArts ? 'ЧИСТО В РАДИУСЕ' : 'ЖДИТЕ ВЫБРОСА (АРТЫ ПОСЛЕ ВЫБРОСА)');
        }
      }

      // Interact prompt + contextual mobile F button
      const target = g.currentInteractTarget;
      const tInteract = $('tbtn-interact');
      if (target) {
        $('interact-prompt').classList.remove('hidden');
        $('interact-text').textContent = target.label;
        tInteract.classList.remove('hidden');
        tInteract.textContent = 'F • ' + target.shortLabel;
      } else {
        $('interact-prompt').classList.add('hidden');
        tInteract.classList.add('hidden');
      }

      // === RADAR RENDER + 50m HUMAN COUNTER & ICONIC BEEP ===
      this._renderRadar();
    }

    clearWorldMarkers() {
      if (!this.markerCtx || !this.markerCanvas) return;
      this.markerCtx.clearRect(0, 0, this.markerCanvas.width, this.markerCanvas.height);
    }

    // === 3D WORLD-SPACE STALCRAFT-STYLE HEXAGONAL SPOT MARKERS (DOGS/MUTANTS & CHECKPOINTS) ===
    renderWorldMarkers(nowSec) {
      const ctx = this.markerCtx;
      if (!ctx || !this.markerCanvas) return;
      const dpr = this.markerDpr || 1;
      const W = this.markerW || window.innerWidth;
      const H = this.markerH || window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (this.openModal) return;

      const g = this.game;
      const p = g.player;
      const pFac = g.profile.faction || 'stalker';
      const pulse = 0.88 + Math.sin(nowSec * 3.4) * 0.12;

      for (const sp of g.world.spots) {
        const alive = g.entities.getAliveCountForSpot(sp.id);
        if (alive <= 0) continue;

        const dist = Math.hypot(sp.x - p.x, sp.z - p.z);
        if (dist > 230 || dist < 5) continue;

        const isMutant = (sp.kind === 'dogs' || sp.kind === 'boars' || sp.kind === 'bloodsucker');
        const isFriendly = (!isMutant && sp.kind === (pFac === 'bandit' ? 'bandits' : 'stalkers'));
        const gy = g.world.getHeight(sp.x, sp.z);
        const floatY = gy + (isMutant ? 4.4 : 6.4) + Math.sin(nowSec * 2.1 + sp.x) * 0.18;

        const proj = g.engine.projectToScreen(sp.x, floatY, sp.z, W, H);
        if (!proj || !proj.inView) continue;

        // Distance-scaled crisp size
        const sc = Math.max(0.68, Math.min(1.12, 1.18 - dist / 260));
        const R = 16 * sc; // Hexagon outer radius
        const strokeCol = isFriendly ? '#5be07d' : '#ff5436';
        const glowCol = isFriendly ? 'rgba(91, 224, 125, 0.55)' : 'rgba(255, 84, 54, 0.62)';
        const fillCol = isFriendly ? 'rgba(10, 28, 16, 0.72)' : 'rgba(28, 11, 8, 0.74)';

        ctx.save();
        ctx.translate(proj.x, proj.y);

        // 1. Soft dark backdrop + Glowing pointy-top Hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 3;
          const hx = Math.cos(a) * R;
          const hy = Math.sin(a) * R;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fillStyle = fillCol;
        ctx.fill();

        ctx.shadowColor = glowCol;
        ctx.shadowBlur = 10 * pulse;
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = Math.max(1.8, 2.2 * sc);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 2. Crisp 4 outer off-white/cream corner brackets (exact photo style!)
        const brX = R * 1.18;
        const brY = R * 1.14;
        const brL = 4.8 * sc;
        ctx.strokeStyle = 'rgba(245, 240, 228, 0.90)';
        ctx.lineWidth = Math.max(1.4, 1.7 * sc);
        const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const [cx, cy] of corners) {
          ctx.beginPath();
          ctx.moveTo(cx * brX, cy * (brY - brL));
          ctx.lineTo(cx * brX, cy * brY);
          ctx.lineTo(cx * (brX - brL), cy * brY);
          ctx.stroke();
        }

        // 3. Center icon: Paw print for dogs/mutants, Outpost Shield/Fort for Checkpoints!
        ctx.fillStyle = strokeCol;
        ctx.strokeStyle = strokeCol;
        if (isMutant) {
          // Paw main pad
          ctx.beginPath();
          ctx.ellipse(0, 2.8 * sc, 4.4 * sc, 3.6 * sc, 0, 0, Math.PI * 2);
          ctx.fill();
          // 4 toe pads arched above
          const toes = [
            [-5.0, -2.0, -0.35],
            [-1.9, -4.6, -0.12],
            [ 1.9, -4.6,  0.12],
            [ 5.0, -2.0,  0.35]
          ];
          for (const [tx, ty, rot] of toes) {
            ctx.beginPath();
            ctx.ellipse(tx * sc, ty * sc, 1.85 * sc, 2.55 * sc, rot, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Fortified Checkpoint / Outpost shield emblem + roof chevron
          ctx.beginPath();
          ctx.moveTo(0, -6.8 * sc);
          ctx.lineTo(6.2 * sc, -3.6 * sc);
          ctx.lineTo(5.4 * sc, 2.4 * sc);
          ctx.lineTo(0, 7.2 * sc);
          ctx.lineTo(-5.4 * sc, 2.4 * sc);
          ctx.lineTo(-6.2 * sc, -3.6 * sc);
          ctx.closePath();
          ctx.lineWidth = Math.max(1.5, 1.8 * sc);
          ctx.stroke();
          // Inner outpost cross / turret tower silhouette
          ctx.fillRect(-2.6 * sc, -2.0 * sc, 5.2 * sc, 4.8 * sc);
          ctx.fillRect(-3.6 * sc, -4.0 * sc, 2.0 * sc, 2.2 * sc);
          ctx.fillRect( 1.6 * sc, -4.0 * sc, 2.0 * sc, 2.2 * sc);
        }

        // 4. Compact distance & short type label below marker
        const tag = sp.kind === 'dogs' ? 'ПСЫ'
          : sp.kind === 'boars' ? 'КАБАНЫ'
          : sp.kind === 'bloodsucker' ? 'КРОВОСОС'
          : (isFriendly ? 'КПП СОЮЗ' : 'БЛОКПОСТ');
        ctx.font = `700 ${Math.round(9.5 * sc)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = `${tag} ${Math.round(dist)}м`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        const tw = ctx.measureText(label).width;
        ctx.fillRect(-tw * 0.5 - 3, brY + 3, tw + 6, 12 * sc);
        ctx.fillStyle = isFriendly ? '#9ff5b3' : '#ffd2c8';
        ctx.fillText(label, 0, brY + 4);

        ctx.restore();
      }
    }

    _renderRadar() {
      const g = this.game;
      const p = g.player;
      const ctx = this.radarCtx;
      const W = 128, H = 128, CX = 64, CY = 64;
      const RANGE = 55;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#09100d';
      ctx.fillRect(0, 0, W, H);

      // Radar rings & crosshair
      ctx.strokeStyle = 'rgba(110, 165, 130, 0.22)';
      ctx.lineWidth = 1;
      for (const r of [20, 40, 58]) {
        ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(CX, 4); ctx.lineTo(CX, H - 4); ctx.moveTo(4, CY); ctx.lineTo(W - 4, CY); ctx.stroke();

      // View cone
      ctx.fillStyle = 'rgba(229, 169, 59, 0.09)';
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, 58, -Math.PI * 0.5 - 0.45, -Math.PI * 0.5 + 0.45);
      ctx.closePath();
      ctx.fill();

      const cosY = Math.cos(p.yaw);
      const sinY = Math.sin(p.yaw);
      const worldToRadar = (wx, wz) => {
        const dx = wx - p.x;
        const dz = wz - p.z;
        // Rotate by player yaw so player forward is always UP on radar!
        const rx = dx * cosY - dz * sinY;
        const ry = dx * sinY + dz * cosY;
        return {
          x: CX + (rx / RANGE) * 56,
          y: CY + (ry / RANGE) * 56,
          dist: Math.hypot(dx, dz)
        };
      };

      const plot = (wx, wz, color, size, clampEdge = false) => {
        const pt = worldToRadar(wx, wz);
        let x = pt.x, y = pt.y;
        const d = Math.hypot(x - CX, y - CY);
        if (d > 56) {
          if (!clampEdge) return;
          x = CX + ((x - CX) / d) * 56;
          y = CY + ((y - CY) / d) * 56;
        }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      };

      // Both Faction Base markers on radar
      plot(0, 0, '#5be07d', 4, true);
      plot(-145, 78, '#ff8c30', 4, true);

      // Active spots, World Stashes & Proto-anomalies
      for (const sp of g.world.spots) plot(sp.x, sp.z, 'rgba(255, 140, 48, 0.72)', 2.5, false);
      for (const st of g.world.worldStashes) {
        if (st.items.length > 0) plot(st.x, st.z, '#f2d96b', 2.4, false);
      }
      for (const pr of g.world.protoAnomalies) plot(pr.x, pr.z, '#3ec8e8', 3.4, true);

      if (g.entities.signalScan.active) {
        plot(g.entities.signalScan.targetX, g.entities.signalScan.targetZ, '#3ec8e8', 4, true);
      }

      for (const b of g.entities.lootBags) {
        plot(b.x, b.z, b.isPlayerBag ? '#c77dff' : '#e5a93b', b.isPlayerBag ? 4.2 : 2.8, b.isPlayerBag);
      }

      // Remote online players on radar
      for (const rp of g.entities.remotePlayers) {
        plot(rp.x, rp.z, rp.faction === 'bandit' ? '#ff7c32' : '#5be07d', 3.4, false);
      }

      // Count humans within 50m radius!
      let humanCount50m = 0;
      for (const en of g.entities.enemies) {
        if (en.hp <= 0) continue;
        const d = Math.hypot(en.x - p.x, en.z - p.z);
        if (en.isHuman && d <= 50) humanCount50m++;
        if (d < RANGE && !en.isHuman && d < 28) plot(en.x, en.z, '#ff6b4a', 2.2, false);
      }
      for (const rp of g.entities.remotePlayers) {
        if (Math.hypot(rp.x - p.x, rp.z - p.z) <= 50) humanCount50m++;
      }

      // ICONIC STALZONE BEEP EVERY TIME HUMAN COUNT IN 50m INCREASES!
      if (humanCount50m > this.prevHumanCount && g.started) {
        window.SoundEngine.playRadarBeep();
        const box = $('radar-human-box');
        box.classList.add('beep-flash');
        setTimeout(() => box.classList.remove('beep-flash'), 420);
      }
      this.prevHumanCount = humanCount50m;
      $('radar-human-count').textContent = humanCount50m;

      // Player center triangle
      ctx.fillStyle = '#e5a93b';
      ctx.beginPath();
      ctx.moveTo(CX, CY - 5);
      ctx.lineTo(CX - 4, CY + 4);
      ctx.lineTo(CX + 4, CY + 4);
      ctx.closePath();
      ctx.fill();
    }

    // === INVENTORY MODAL ===
    renderInventory() {
      const g = this.game;
      const prof = g.profile;
      const derived = window.GameData.getPlayerDerivedStats(prof);

      $('inv-weight-label').textContent = `${derived.weight.toFixed(1)} / ${derived.maxWeight.toFixed(0)} кг`;
      $('inv-money-label').textContent = prof.money.toLocaleString('ru-RU') + ' ₽';

      // 1. Personal Equipment Slots
      const equipList = $('equip-slots-list');
      equipList.innerHTML = '';
      const eqRows = [
        { key: 'armor', label: 'БРОНЯ', item: window.GameData.ARMORS[prof.equipment.armor], lvl: prof.upgrades[prof.equipment.armor] || 0, pool: prof.ownedGear.armors, map: window.GameData.ARMORS },
        { key: 'primary', label: 'ОСНОВНОЕ', item: window.GameData.WEAPONS[prof.equipment.primary], lvl: prof.upgrades[prof.equipment.primary] || 0, pool: prof.ownedGear.weapons.filter(id => window.GameData.WEAPONS[id].slot === 'primary'), map: window.GameData.WEAPONS },
        { key: 'secondary', label: 'ПИСТОЛЕТ', item: window.GameData.WEAPONS[prof.equipment.secondary], lvl: prof.upgrades[prof.equipment.secondary] || 0, pool: prof.ownedGear.weapons.filter(id => window.GameData.WEAPONS[id].slot === 'secondary'), map: window.GameData.WEAPONS },
        { key: 'detector', label: 'ДЕТЕКТОР', item: window.GameData.DETECTORS[prof.equipment.detector], lvl: 0, pool: prof.ownedGear.detectors, map: window.GameData.DETECTORS },
        { key: 'container', label: 'КОНТЕЙНЕР', item: window.GameData.CONTAINERS[prof.equipment.container], lvl: 0, pool: prof.ownedGear.containers, map: window.GameData.CONTAINERS }
      ];

      for (const row of eqRows) {
        const div = document.createElement('div');
        div.className = 'equip-slot';
        div.innerHTML = `<div><div class="slot-type">${row.label}</div><div class="slot-name">${row.item.name}${row.lvl > 0 ? ' +' + row.lvl : ''}</div></div><span class="muted">${row.pool.length > 1 ? '⇄ Сменить' : '✔'}</span>`;
        div.onclick = () => {
          if (row.pool.length > 1) {
            const idx = row.pool.indexOf(prof.equipment[row.key]);
            prof.equipment[row.key] = row.pool[(idx + 1) % row.pool.length];
            if (row.key === 'container') {
              const maxS = window.GameData.CONTAINERS[prof.equipment.container].slots;
              while (prof.containerArtifacts.length > maxS) {
                const removed = prof.containerArtifacts.pop();
                window.GameData.addItemToList(prof.backpack, removed, 1);
              }
            }
            window.SoundEngine.playUI();
            g.save();
            this.renderInventory();
          }
        };
        equipList.appendChild(div);
      }

      // 2. Artifact Container Slots
      const cont = derived.container;
      $('container-prot-label').textContent = `(защита ${Math.round(cont.protection * 100)}%)`;
      const artWrap = $('container-art-slots');
      artWrap.innerHTML = '';
      for (let i = 0; i < cont.slots; i++) {
        const artId = prof.containerArtifacts[i];
        const div = document.createElement('div');
        div.className = 'art-slot' + (artId ? ' filled' : '');
        if (artId && window.GameData.ARTIFACTS[artId]) {
          const a = window.GameData.ARTIFACTS[artId];
          div.innerHTML = `<strong>${a.name}</strong><div class="muted">Снять</div>`;
          div.onclick = () => {
            prof.containerArtifacts.splice(i, 1);
            window.GameData.addItemToList(prof.backpack, artId, 1);
            window.SoundEngine.playUI();
            g.save();
            this.renderInventory();
          };
        } else {
          div.textContent = 'Пустой слот';
        }
        artWrap.appendChild(div);
      }

      // 3. Weapon Attachments toggles
      const attWrap = $('attachment-toggles');
      attWrap.innerHTML = '';
      const attLabels = { optic: 'Оптика', suppressor: 'Глушитель', extMag: 'Увел.маг', laser: 'ЛЦУ' };
      for (const k of Object.keys(attLabels)) {
        const btn = document.createElement('button');
        const owned = prof.attachmentsOwned[k];
        const on = owned && prof.attachmentsEnabled[k];
        btn.className = 'attach-chip' + (on ? ' on' : '');
        btn.textContent = owned ? `${on ? '✔ ' : ''}${attLabels[k]}` : `${attLabels[k]} (нет)`;
        btn.onclick = () => {
          if (!owned) { g.toast('Купите обвес у Торговца в Баре!', 'bad'); return; }
          prof.attachmentsEnabled[k] = !prof.attachmentsEnabled[k];
          window.SoundEngine.playUI();
          g.save();
          this.renderInventory();
        };
        attWrap.appendChild(btn);
      }

      // Player Stats Summary
      $('player-stats-summary').innerHTML = `
        Пулестойкость: <b>${derived.bulletRes.toFixed(0)}</b> • Скорость: <b>${Math.round(derived.speedMult * 100)}%</b><br>
        Защита: ☢${derived.radProt} | ☣${derived.bioProt} | 🔥${derived.thermProt} | 🧠${derived.psyProt}<br>
        Реген HP: +${derived.hpRegen.toFixed(1)}/с • Дебафф артов: ☢${derived.artDebuffs.rad.toFixed(1)} ☣${derived.artDebuffs.bio.toFixed(1)} 🧠${derived.artDebuffs.psy.toFixed(1)}
      `;

      // 4. Minecraft-style 24-Slot Backpack Grid!
      const grid = $('backpack-grid');
      $('bag-count-label').textContent = `${prof.backpack.length} / ${window.GameData.BACKPACK_SLOTS}`;

      const invHandBar = $('inv-hand-bar');
      if (this.mcHand && this.mcHand.zone === 'inv_bag') {
        const it = prof.backpack.find(x => x.slot === this.mcHand.slot);
        const def = it ? window.GameData.ITEMS[it.id] : null;
        if (def) {
          invHandBar.classList.remove('hidden');
          invHandBar.classList.add('holding');
          $('inv-hand-text').textContent = `✋ ${def.icon || ''} ${def.name} x${it.count} — тап по другой ячейке для переноса`;
        } else {
          this.mcHand = null;
          invHandBar.classList.add('hidden');
        }
      } else {
        invHandBar.classList.add('hidden');
      }

      this._renderMcGrid(grid, 'inv_bag', prof.backpack, window.GameData.BACKPACK_SLOTS, {
        selectedSlot: this.selectedBagSlot,
        onInspect: (entry, slot) => {
          this.selectedBagSlot = slot;
          this.selectedBagId = entry.id;
        },
        onChange: () => this.renderInventory()
      });

      const sel = prof.backpack.find(b => b.slot === this.selectedBagSlot) || prof.backpack.find(b => b.id === this.selectedBagId);
      if (sel) this._renderInspector(sel);
      else $('item-inspector').innerHTML = '<p class="muted">Нажмите на ячейку рюкзака чтобы посмотреть, использовать или переставить предмет.</p>';
    }

    _renderInspector(entry) {
      const g = this.game;
      const prof = g.profile;
      const def = window.GameData.ITEMS[entry.id];
      if (!def) return;
      const box = $('item-inspector');
      box.innerHTML = `
        <div class="insp-title">${def.name} (x${entry.count})</div>
        <div class="insp-stats">
          Вес: ${(def.weight * entry.count).toFixed(2)} кг • Цена: ~${Math.round(def.price * 0.65)} ₽<br>
          ${def.desc || ''}
        </div>
        <div class="insp-actions" id="insp-actions-wrap"></div>
      `;
      const act = $('insp-actions-wrap');

      if (def.type === 'consumable' && def.id !== 'grenade') {
        const b = document.createElement('button');
        b.className = 'btn-primary';
        b.textContent = 'ИСПОЛЬЗОВАТЬ';
        b.onclick = () => { g.consumeItem(def.id); this.renderInventory(); };
        act.appendChild(b);
      }
      if (def.type === 'artifact') {
        const b = document.createElement('button');
        b.className = 'btn-primary';
        b.textContent = 'ПОМЕСТИТЬ В КОНТЕЙНЕР';
        b.onclick = () => {
          const maxS = window.GameData.CONTAINERS[prof.equipment.container].slots;
          if (prof.containerArtifacts.length >= maxS) {
            g.toast('Контейнер полон! Снимите другой артефакт.', 'bad');
            return;
          }
          window.GameData.removeItemFromList(prof.backpack, def.id, 1);
          prof.containerArtifacts.push(def.id);
          window.SoundEngine.playUI();
          g.save();
          this.renderInventory();
        };
        act.appendChild(b);
      }
      if (def.type === 'attachment') {
        const b = document.createElement('button');
        b.className = 'btn-primary';
        b.textContent = 'УСТАНОВИТЬ ОБВЕС';
        b.onclick = () => {
          window.GameData.removeItemFromList(prof.backpack, def.id, 1);
          prof.attachmentsOwned[def.attKey] = true;
          prof.attachmentsEnabled[def.attKey] = true;
          g.toast(`Обвес «${def.name}» установлен!`, 'good');
          g.save();
          this.renderInventory();
        };
        act.appendChild(b);
      }

      const dropBtn = document.createElement('button');
      dropBtn.className = 'btn-danger';
      dropBtn.textContent = 'ВЫБРОСИТЬ 1 ШТ.';
      dropBtn.onclick = () => {
        window.GameData.removeItemFromList(prof.backpack, def.id, 1);
        g.save();
        this.renderInventory();
      };
      act.appendChild(dropBtn);
    }

    // === PDA MODAL (MAP, QUESTS, STATS) ===
    renderPDA() {
      const g = this.game;
      const p = g.player;

      // Emission countdown & coordinates
      const em = g.entities.emission;
      const sec = Math.max(0, Math.ceil(em.timer));
      $('pda-em-timer').textContent = em.phase === 'calm'
        ? `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
        : `ИДЁТ (${sec}с)`;
      $('pda-coords').textContent = `Координаты: X ${Math.round(p.x)} / Z ${Math.round(p.z)} • ${g.world.getRegionName(p.x, p.z, g.profile.faction)}`;

      // Render Expanded 520x520m Interactive Zone Map Canvas
      const ctx = this.pdaCtx;
      const W = 480, H = 480;
      const mapScale = W / 520;
      const toMap = (wx, wz) => ({ x: W * 0.5 + wx * mapScale, y: H * 0.5 + wz * mapScale });

      ctx.fillStyle = '#0d1511';
      ctx.fillRect(0, 0, W, H);

      // Regions tint
      ctx.fillStyle = 'rgba(229, 196, 59, 0.07)';
      ctx.fillRect(0, H * 0.5 + 24 * mapScale, W, H * 0.5);
      ctx.fillStyle = 'rgba(222, 67, 56, 0.09)';
      ctx.fillRect(0, 0, W, H * 0.5 - 30 * mapScale);

      // Grid lines
      ctx.strokeStyle = 'rgba(130, 175, 145, 0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 8; i++) {
        const pos = (W / 8) * i;
        ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, H); ctx.moveTo(0, pos); ctx.lineTo(W, pos); ctx.stroke();
      }

      // Main Road & Railways
      ctx.fillStyle = '#2c3330';
      ctx.fillRect(W * 0.5 - 5, 10, 10, H - 20);
      ctx.fillStyle = '#3b4244';
      const rw1 = toMap(0, -34).y;
      ctx.fillRect(18, rw1 - 1.5, W - 36, 3);

      // Swamps
      ctx.fillStyle = 'rgba(42, 105, 76, 0.52)';
      for (const s of g.world.swampPools) {
        const pt = toMap(s.x - s.w * 0.5, s.z - s.d * 0.5);
        ctx.fillRect(pt.x, pt.y, s.w * mapScale, s.d * mapScale);
      }

      // Contamination zones
      const cCols = { rad: 'rgba(232,207,56,0.20)', bio: 'rgba(91,224,125,0.20)', therm: 'rgba(255,110,48,0.20)', psy: 'rgba(181,101,255,0.20)' };
      for (const cz of g.world.contamZones) {
        const pt = toMap(cz.x, cz.z);
        ctx.fillStyle = cCols[cz.type] || 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, cz.radius * mapScale, 0, Math.PI * 2); ctx.fill();
      }

      // Safe Zone 1: Stalker Bar
      const barPt = toMap(0, 0);
      ctx.fillStyle = 'rgba(91, 224, 125, 0.25)';
      ctx.strokeStyle = '#5be07d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(barPt.x, barPt.y, 24 * mapScale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Safe Zone 2: Bandit Depot
      const depPt = toMap(-145, 78);
      ctx.fillStyle = 'rgba(255, 130, 50, 0.25)';
      ctx.strokeStyle = '#ff8232';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(depPt.x, depPt.y, 24 * mapScale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // World Stashes (yellow dots)
      for (const st of g.world.worldStashes) {
        if (st.items.length === 0) continue;
        const pt = toMap(st.x, st.z);
        ctx.fillStyle = '#f2d96b';
        ctx.fillRect(pt.x - 3, pt.y - 3, 6, 6);
      }

      // Spots, Proto, Signal, Bags
      for (const sp of g.world.spots) {
        const pt = toMap(sp.x, sp.z);
        ctx.fillStyle = sp.kind === 'stalkers' ? '#68e88a' : (sp.kind === 'mercs' ? '#58c0ff' : '#ff8c30');
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill();
      }
      for (const pr of g.world.protoAnomalies) {
        const pt = toMap(pr.x, pr.z);
        ctx.fillStyle = '#3ec8e8';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2); ctx.fill();
      }
      if (g.entities.signalScan.active) {
        const pt = toMap(g.entities.signalScan.targetX, g.entities.signalScan.targetZ);
        ctx.strokeStyle = '#3ec8e8';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2); ctx.stroke();
      }
      for (const b of g.entities.lootBags) {
        if (!b.isPlayerBag) continue;
        const pt = toMap(b.x, b.z);
        ctx.fillStyle = '#c77dff';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2); ctx.fill();
      }

      // Labels for 520x520m Zone landmarks
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#76e896'; ctx.fillText('БАР (СТАЛКЕРЫ)', barPt.x - 42, barPt.y + 4);
      ctx.fillStyle = '#ff9d5c'; ctx.fillText('ДЕПО (БАНДИТЫ)', depPt.x - 44, depPt.y + 4);
      ctx.fillStyle = '#ff8c82'; ctx.fillText('РЛС «ДУГА» (ТИР 3)', W * 0.5 - 56, 22);
      ctx.fillStyle = '#d4e2d8'; ctx.fillText('СВАЛКА', W - 82, H * 0.5 + 18);
      ctx.fillStyle = '#f2d96b'; ctx.fillText('ЗАТОПЛЕННАЯ ДЕРЕВНЯ', W * 0.5 - 64, H - 14);

      // Online remote players plotted on PDA map with callsigns
      for (const rp of (g.entities.remotePlayers || [])) {
        const rpt = toMap(rp.x, rp.z);
        ctx.fillStyle = rp.faction === 'bandit' ? '#ff8c30' : '#5be07d';
        ctx.strokeStyle = '#3ec8e8';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(rpt.x, rpt.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#9ceeff';
        ctx.fillText(rp.name || 'Игрок', rpt.x + 7, rpt.y + 3);
      }

      // Player marker
      const pl = toMap(p.x, p.z);
      ctx.fillStyle = '#e5a93b';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pl.x, pl.y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      this.updateOnlineBadges();
      this.renderRadioChat();

      // Render Quests Tab
      const qList = $('pda-quests-list');
      qList.innerHTML = '';
      for (const q of g.profile.quests) {
        const done = q.progress >= q.target;
        const card = document.createElement('div');
        card.className = 'quest-card' + (done ? ' done' : '');
        const rItem = window.GameData.ITEMS[q.rewardItem];
        card.innerHTML = `
          <div>
            <strong>${q.title}</strong> (${Math.min(q.progress, q.target)}/${q.target})
            <div class="muted">${q.desc}</div>
            <div class="muted">Награда: ${q.rewardMoney} ₽ + ${rItem ? rItem.name : ''} x${q.rewardCount}</div>
          </div>
          <div>${q.claimed ? '<span class="req-ok">✔ ПОЛУЧЕНО</span>' : (done ? '<button class="btn-primary">ЗАБРАТЬ</button>' : '<span class="muted">В ПРОЦЕССЕ</span>')}</div>
        `;
        if (done && !q.claimed) {
          card.querySelector('button').onclick = () => {
            q.claimed = true;
            g.addMoney(q.rewardMoney);
            window.GameData.addItemToList(g.profile.backpack, q.rewardItem, q.rewardCount);
            g.profile.reputation += 25;
            window.SoundEngine.playHeal();
            g.toast(`✔ Квест «${q.title}» сдан!`, 'good');
            g.save();
            this.renderPDA();
          };
        }
        qList.appendChild(card);
      }

      // Render Stats & Guide Tab
      const st = g.profile.stats;
      const derived = window.GameData.getPlayerDerivedStats(g.profile);
      $('pda-stats-content').innerHTML = `
        <div class="npc-card">
          <h4>СТАТИСТИКА СТАЛКЕРА</h4>
          <p>Репутация Бара: <b>${g.profile.reputation}</b> • Баланс: <b>${g.profile.money} ₽</b></p>
          <p>Убито мутантов: <b>${st.killsMutant}</b> • Бандитов/Сталкеров: <b>${st.killsHuman}</b> • В голову: <b>${st.headshots}</b></p>
          <p>Найдено артефактов: <b>${st.artifactsFound}</b> • Пережито Выбросов: <b>${st.emissionsSurvived}</b> • Смертей: <b>${st.deaths}</b></p>
        </div>
        <div class="npc-card">
          <h4>СПРАВОЧНИК ЗАЩИТЫ И ЗАРАЖЕНИЙ</h4>
          <p>Текущая броня: <b>${derived.armor.name} (+${derived.armorLvl})</b> — Пулестойкость <b>${derived.bulletRes.toFixed(0)}</b></p>
          <p>☢ Радиация: защита ур. ${derived.radProt} | ☣ Био: ур. ${derived.bioProt} | 🔥 Термо: ур. ${derived.thermProt} | 🧠 Пси: ур. ${derived.psyProt}</p>
          <p>Совет: Бросайте БОЛТ [B] в «Электру», чтобы разрядить её на 3 секунды. Достаньте ДЕТЕКТОР [G], чтобы проявлять скрытые артефакты и сканировать сигналы [X].</p>
        </div>
      `;
    }

    updateOnlineBadges() {
      const m = this.game.onlineMeta || { sectorId: 'zone_1', onlineCount: 1 };
      const secTag = m.sectorId === 'zone_2' ? 'С2' : 'С1';
      const badge = $('online-badge');
      if (badge) badge.textContent = `🌐 ОНЛАЙН: ${m.onlineCount || 1} • ${secTag}`;
      if ($('btn-sector-1')) $('btn-sector-1').classList.toggle('active', m.sectorId !== 'zone_2');
      if ($('btn-sector-2')) $('btn-sector-2').classList.toggle('active', m.sectorId === 'zone_2');
    }

    renderRadioChat() {
      const g = this.game;
      const m = g.onlineMeta || { callsign: 'Сталкер', sectorId: 'zone_1', onlineCount: 1 };
      const countEl = $('online-roster-count');
      const rosterEl = $('online-roster-list');
      const feedEl = $('radio-chat-feed');
      if (countEl) {
        countEl.textContent = `Игроков в ${m.sectorId === 'zone_2' ? 'Секторе 2' : 'Секторе 1'}: ${m.onlineCount || 1}`;
      }
      if (rosterEl) {
        rosterEl.innerHTML = '';
        const myFac = g.profile.faction || 'stalker';
        const selfRow = document.createElement('div');
        selfRow.className = 'roster-row fac-' + myFac;
        selfRow.innerHTML = `<span>★ ${m.callsign || 'Вы'} (Вы)</span><span>${Math.round(g.player.hp)} HP</span>`;
        rosterEl.appendChild(selfRow);
        for (const rp of (g.entities.remotePlayers || [])) {
          const row = document.createElement('div');
          row.className = 'roster-row fac-' + (rp.faction === 'bandit' ? 'bandit' : 'stalker');
          const safeName = String(rp.name || 'Игрок').replace(/[<>&]/g, '');
          row.innerHTML = `<span>${safeName}</span><span>${Math.round(rp.hp ?? 100)} HP</span>`;
          rosterEl.appendChild(row);
        }
      }
      if (feedEl) {
        feedEl.innerHTML = '';
        const msgs = g.chatMessages || [];
        if (msgs.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'muted';
          empty.style.fontSize = '11px';
          empty.textContent = 'Эфир чист. Напишите сообщение сталкерам в вашем секторе.';
          feedEl.appendChild(empty);
        } else {
          for (const msg of msgs) {
            const div = document.createElement('div');
            div.className = 'chat-msg fac-' + (msg.faction === 'bandit' ? 'bandit' : 'stalker');
            const author = document.createElement('span');
            author.className = 'chat-author';
            author.textContent = `[${msg.callsign || 'Сталкер'}]:`;
            const body = document.createElement('span');
            body.textContent = msg.text || '';
            div.appendChild(author);
            div.appendChild(body);
            feedEl.appendChild(div);
          }
          feedEl.scrollTop = feedEl.scrollHeight;
        }
      }
    }

    // === BAR NPC SERVICES MODAL ===
    renderNpcModal() {
      const g = this.game;
      const prof = g.profile;
      const npcId = this.activeNpcId;
      $('npc-money-label').textContent = prof.money.toLocaleString('ru-RU') + ' ₽';
      const body = $('npc-modal-body');
      const prevScroll = body.scrollTop;
      body.innerHTML = '';

      if (npcId === 'trader') {
        $('npc-modal-title').textContent = 'ТОРГОВЕЦ «СИДОРЫЧ»';
        $('npc-modal-sub').textContent = 'Боеприпасы (Обыч / ББ / Эксп), медицина, обвесы и запчасти';
        const list = document.createElement('div');
        list.className = 'npc-list';
        for (const offer of window.GameData.TRADER_CATALOG) {
          const def = window.GameData.ITEMS[offer.itemId];
          const card = document.createElement('div');
          card.className = 'npc-card';
          card.innerHTML = `
            <div><h4>${def.name} x${offer.count}</h4><p>${def.desc}</p></div>
            <button class="btn-primary">КУПИТЬ • ${offer.price} ₽</button>
          `;
          card.querySelector('button').onclick = () => {
            if (prof.money < offer.price) { g.toast('Недостаточно рублей!', 'bad'); return; }
            prof.money -= offer.price;
            if (def.type === 'attachment') {
              prof.attachmentsOwned[def.attKey] = true;
              prof.attachmentsEnabled[def.attKey] = true;
              g.toast(`Обвес «${def.name}» куплен и установлен!`, 'good');
            } else {
              window.GameData.addItemToList(prof.backpack, offer.itemId, offer.count);
              g.toast(`Куплено: ${def.name} x${offer.count}`, 'good');
            }
            window.SoundEngine.playUI();
            g.save();
            this.renderNpcModal();
          };
          list.appendChild(card);
        }
        body.appendChild(list);
      } else if (npcId === 'barter') {
        $('npc-modal-title').textContent = 'БАРТЕРЩИК «КУЗНЕЦ»';
        $('npc-modal-sub').textContent = 'Ветки бартера: Боевая / Научная / Комбо броня, топовые стволы, Берлога и Бурят';
        const list = document.createElement('div');
        list.className = 'npc-list';
        for (const rec of window.GameData.BARTER_RECIPES) {
          const ownedList = rec.resultType === 'weapon' ? prof.ownedGear.weapons
            : rec.resultType === 'armor' ? prof.ownedGear.armors
            : rec.resultType === 'container' ? prof.ownedGear.containers : prof.ownedGear.detectors;
          const already = ownedList.includes(rec.resultId);
          const hasPrev = ownedList.includes(rec.reqItem);
          let hasAllRes = prof.money >= rec.cost && hasPrev;
          let reqHtml = `<div class="${hasPrev ? 'req-ok' : 'req-miss'}">База: ${rec.reqItem} ${hasPrev ? '✔' : '✕'}</div>`;
          for (const rk of Object.keys(rec.reqRes)) {
            const need = rec.reqRes[rk];
            const have = window.GameData.countItem(prof.backpack, rk) + window.GameData.countItem(prof.stash, rk);
            if (have < need) hasAllRes = false;
            const rName = window.GameData.ITEMS[rk].name;
            reqHtml += `<div class="${have >= need ? 'req-ok' : 'req-miss'}">${rName}: ${have}/${need}</div>`;
          }
          reqHtml += `<div class="${prof.money >= rec.cost ? 'req-ok' : 'req-miss'}">Рубли: ${rec.cost} ₽</div>`;

          const card = document.createElement('div');
          card.className = 'npc-card';
          card.innerHTML = `
            <div><h4>${rec.name}</h4><div class="req-list">${reqHtml}</div></div>
            <button class="${already ? 'btn-ghost' : (hasAllRes ? 'btn-primary' : 'btn-ghost')}">${already ? '✔ СБАРТЕРЕНО' : 'СБАРТЕРИТЬ'}</button>
          `;
          card.querySelector('button').onclick = () => {
            if (already || !hasAllRes) { g.toast('Не хватает ресурсов или базового предмета!', 'bad'); return; }
            prof.money -= rec.cost;
            for (const rk of Object.keys(rec.reqRes)) {
              let rem = rec.reqRes[rk];
              const inBag = window.GameData.countItem(prof.backpack, rk);
              const takeBag = Math.min(inBag, rem);
              if (takeBag > 0) { window.GameData.removeItemFromList(prof.backpack, rk, takeBag); rem -= takeBag; }
              if (rem > 0) window.GameData.removeItemFromList(prof.stash, rk, rem);
            }
            ownedList.push(rec.resultId);
            // Auto-equip newly bartered upgrade!
            if (rec.resultType === 'weapon') prof.equipment.primary = rec.resultId;
            if (rec.resultType === 'armor') prof.equipment.armor = rec.resultId;
            if (rec.resultType === 'container') prof.equipment.container = rec.resultId;
            if (rec.resultType === 'detector') prof.equipment.detector = rec.resultId;
            window.SoundEngine.playHeal();
            g.toast(`⚒ Получено и экипировано: ${rec.name}!`, 'good');
            g.save();
            this.renderNpcModal();
          };
          list.appendChild(card);
        }
        body.appendChild(list);
      } else if (npcId === 'mechanic') {
        $('npc-modal-title').textContent = 'МЕХАНИК «АЗОТ» — ЗАТОЧКА (+1..+15)';
        $('npc-modal-sub').textContent = 'Затачивайте оружие (+урон) и броню (+пулестойкость) за Инструменты и рубли';
        const toolsHave = window.GameData.countItem(prof.backpack, 'tools') + window.GameData.countItem(prof.stash, 'tools');
        const info = document.createElement('div');
        info.className = 'pill-stat';
        info.textContent = `Инструменты / Запаски в наличии (рюкзак + схрон): ${toolsHave} шт.`;
        body.appendChild(info);

        const list = document.createElement('div');
        list.className = 'npc-list';
        const targets = [
          { id: prof.equipment.primary, name: window.GameData.WEAPONS[prof.equipment.primary].name, kind: 'Оружие (+4.5% урона/ур.)' },
          { id: prof.equipment.secondary, name: window.GameData.WEAPONS[prof.equipment.secondary].name, kind: 'Пистолет (+4.5% урона/ур.)' },
          { id: prof.equipment.armor, name: window.GameData.ARMORS[prof.equipment.armor].name, kind: 'Броня (+3.5% пулест./ур.)' }
        ];
        for (const t of targets) {
          const lvl = prof.upgrades[t.id] || 0;
          const costMoney = (lvl + 1) * 900;
          const costTools = lvl >= 8 ? 2 : 1;
          const chance = lvl < 5 ? 100 : Math.max(35, 100 - (lvl - 4) * 6);
          const card = document.createElement('div');
          card.className = 'npc-card';
          card.innerHTML = `
            <div>
              <h4>${t.name} [ +${lvl} / +15 ]</h4>
              <p>${t.kind}</p>
              <div class="req-list">Цена: ${costMoney} ₽ • Запаски: ${costTools} шт. • Шанс успеха: ${chance}%</div>
            </div>
            <button class="btn-primary">${lvl >= 15 ? 'МАКСИМУМ (+15)' : 'ЗАТОЧИТЬ ДО +' + (lvl + 1)}</button>
          `;
          card.querySelector('button').onclick = () => {
            if (lvl >= 15) return;
            if (prof.money < costMoney || toolsHave < costTools) {
              g.toast('Нужно больше рублей или Инструментов/Запасок!', 'bad');
              return;
            }
            prof.money -= costMoney;
            let rem = costTools;
            const inBag = window.GameData.countItem(prof.backpack, 'tools');
            const tb = Math.min(inBag, rem);
            if (tb > 0) { window.GameData.removeItemFromList(prof.backpack, 'tools', tb); rem -= tb; }
            if (rem > 0) window.GameData.removeItemFromList(prof.stash, 'tools', rem);

            if (Math.random() * 100 <= chance) {
              prof.upgrades[t.id] = lvl + 1;
              window.SoundEngine.playHeal();
              g.toast(`⚒ Успешная заточка! ${t.name} теперь +${lvl + 1}!`, 'good');
            } else {
              window.SoundEngine.playBoltClang();
              g.toast(`Заточка не удалась — уровень сохранён (+${lvl}).`, 'bad');
            }
            g.save();
            this.renderNpcModal();
          };
          list.appendChild(card);
        }
        body.appendChild(list);
      } else if (npcId === 'fence') {
        $('npc-modal-title').textContent = 'СКУПЩИК «БАРЫГА»';
        $('npc-modal-sub').textContent = 'Скупает части мутантов, артефакты и трофеи за наличные рубли';
        const sellAllBtn = document.createElement('button');
        sellAllBtn.className = 'btn-primary';
        sellAllBtn.textContent = 'ПРОДАТЬ ВСЕ ТРОФЕИ И ПРОДАВАЕМЫЙ ЛУТ';
        sellAllBtn.onclick = () => {
          let total = 0;
          for (let i = prof.backpack.length - 1; i >= 0; i--) {
            const def = window.GameData.ITEMS[prof.backpack[i].id];
            if (def && def.type === 'sellable') {
              total += Math.round(def.price * prof.backpack[i].count);
              prof.backpack.splice(i, 1);
            }
          }
          if (total > 0) {
            g.addMoney(total);
            window.SoundEngine.playHeal();
            g.toast(`💰 Продано трофеев на +${total} ₽!`, 'good');
            g.save();
            this.renderNpcModal();
          } else {
            g.toast('В рюкзаке нет трофеев на продажу.', 'bad');
          }
        };
        body.appendChild(sellAllBtn);

        const list = document.createElement('div');
        list.className = 'npc-list';
        for (const entry of prof.backpack) {
          const def = window.GameData.ITEMS[entry.id];
          if (!def) continue;
          const unitPrice = def.type === 'sellable' || def.type === 'artifact' ? def.price : Math.round(def.price * 0.55);
          const card = document.createElement('div');
          card.className = 'npc-card';
          card.innerHTML = `
            <div><h4>${def.name} x${entry.count}</h4><p>${def.desc}</p></div>
            <button class="btn-ghost">ПРОДАТЬ 1 ШТ • +${unitPrice} ₽</button>
          `;
          card.querySelector('button').onclick = () => {
            window.GameData.removeItemFromList(prof.backpack, entry.id, 1);
            g.addMoney(unitPrice);
            window.SoundEngine.playUI();
            g.save();
            this.renderNpcModal();
          };
          list.appendChild(card);
        }
        body.appendChild(list);
      } else if (npcId === 'stash') {
        $('npc-modal-title').textContent = 'ЛИЧНЫЙ СХРОН (24 ↔ 24 СЛОТА)';
        $('npc-modal-sub').textContent = 'Перетаскивайте или нажимайте по слотам (как в Minecraft) • Двойной тап — быстрый перенос';
        const split = document.createElement('div');
        split.className = 'stash-split';

        const bagPane = document.createElement('div');
        bagPane.className = 'loot-pane';
        bagPane.innerHTML = '<h3>ВАШ РЮКЗАК (24 СЛОТА)</h3>';
        const bagGrid = document.createElement('div');
        bagGrid.className = 'mc-grid mc-grid-bag';
        bagPane.appendChild(bagGrid);

        const stPane = document.createElement('div');
        stPane.className = 'loot-pane';
        stPane.innerHTML = '<h3>ЛИЧНЫЙ СХРОН (24 СЛОТА)</h3>';
        const stGrid = document.createElement('div');
        stGrid.className = 'mc-grid mc-grid-bag';
        stPane.appendChild(stGrid);

        this._renderMcGrid(bagGrid, 'stash_bag', prof.backpack, window.GameData.BACKPACK_SLOTS, {
          quickTargetList: prof.stash,
          quickTargetSlots: window.GameData.BACKPACK_SLOTS,
          onChange: () => this.renderNpcModal()
        });
        this._renderMcGrid(stGrid, 'stash_box', prof.stash, window.GameData.BACKPACK_SLOTS, {
          quickTargetList: prof.backpack,
          quickTargetSlots: window.GameData.BACKPACK_SLOTS,
          onChange: () => this.renderNpcModal()
        });

        split.appendChild(bagPane);
        split.appendChild(stPane);
        body.appendChild(split);
      }
      body.scrollTop = prevScroll;
    }
  }

  return { UI };
})();
