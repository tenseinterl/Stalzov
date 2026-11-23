// STALZONE Procedural Web Audio API Sound Engine
window.SoundEngine = (function () {
  let ctx = null;
  let masterGain = null;
  let volume = 0.75;
  let noiseBuffer = null;
  let sirenOsc = null;
  let sirenGain = null;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);

      // Reusable 2-second white noise buffer
      const sr = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, sr * 2, sr);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    }
  }

  function haptic(kind) {
    if (window.AndroidBridge && typeof window.AndroidBridge.haptic === 'function') {
      try { window.AndroidBridge.haptic(kind); } catch (_) {}
    }
  }

  function playNoise(duration, filterType, freq, q, gainPeak, decay = 0.001) {
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filt = c.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(freq, now);
    filt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gainPeak, now);
    g.gain.exponentialRampToValueAtTime(decay, now + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(masterGain);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  function playTone(type, freqStart, freqEnd, duration, gainPeak) {
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(gainPeak, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // Caliber-specific gunshots (suppressed & unsuppressed)
  function playShot(weaponId, suppressed) {
    const c = ensure();
    if (!c) return;
    if (suppressed) {
      playNoise(0.085, 'bandpass', 2200, 1.4, 0.28);
      playTone('triangle', 190, 65, 0.07, 0.22);
      haptic('shot');
      return;
    }
    switch (weaponId) {
      case 'pm':
        playNoise(0.12, 'bandpass', 1500, 0.8, 0.45);
        playTone('sawtooth', 260, 75, 0.09, 0.26);
        haptic('shot');
        break;
      case 'saiga12':
        playNoise(0.28, 'lowpass', 950, 0.7, 0.85);
        playTone('sawtooth', 140, 34, 0.22, 0.52);
        haptic('heavy_shot');
        break;
      case 'svd':
        playNoise(0.32, 'bandpass', 900, 0.6, 0.82);
        playTone('sawtooth', 180, 40, 0.24, 0.48);
        haptic('heavy_shot');
        break;
      case 'as_val':
      case 'vss':
        // Integrally suppressed 9x39 heavy subsonic thump
        playNoise(0.09, 'bandpass', 1850, 1.8, 0.26);
        playTone('triangle', 165, 58, 0.08, 0.24);
        haptic('shot');
        break;
      default: // AK-74M
        playNoise(0.18, 'bandpass', 1200, 0.7, 0.62);
        playTone('sawtooth', 210, 52, 0.14, 0.36);
        haptic('shot');
        break;
    }
  }

  function playEnemyShot(dist) {
    const atten = Math.max(0.05, Math.min(0.45, 18 / (dist + 8)));
    playNoise(0.14, 'bandpass', 1100, 0.9, atten);
    playTone('sawtooth', 180, 60, 0.1, atten * 0.5);
  }

  function playReload(stage) {
    if (stage === 'start') {
      playTone('square', 420, 260, 0.06, 0.14);
      playNoise(0.05, 'highpass', 2400, 1.2, 0.14);
    } else {
      playTone('square', 520, 780, 0.05, 0.16);
      setTimeout(() => playNoise(0.06, 'bandpass', 3000, 2, 0.2), 75);
    }
  }

  // ICONIC STALZONE RADAR "BEEP" when nearby human count increases!
  function playRadarBeep() {
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, now);
    osc.frequency.setValueAtTime(2120, now + 0.045);
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
    haptic('radar');
  }

  function playGeigerClick() {
    playNoise(0.012, 'highpass', 3600, 2.5, 0.22);
  }

  function playDetectorPing(proximity) {
    const freq = 900 + proximity * 1200;
    playTone('sine', freq, freq * 1.06, 0.06, 0.16);
  }

  function playBoltClang() {
    playTone('triangle', 2600, 1850, 0.11, 0.2);
    playTone('sine', 4100, 3200, 0.08, 0.12);
  }

  function playAnomaly(type) {
    if (type === 'electro') {
      playNoise(0.26, 'bandpass', 2800, 2.2, 0.55);
      playTone('sawtooth', 980, 120, 0.22, 0.35);
      haptic('damage');
    } else if (type === 'vortex') {
      playTone('sine', 95, 42, 0.45, 0.45);
      playNoise(0.35, 'lowpass', 340, 1.2, 0.35);
    } else if (type === 'springboard') {
      playTone('sine', 120, 520, 0.28, 0.42);
      playNoise(0.2, 'bandpass', 600, 1, 0.35);
      haptic('damage');
    } else if (type === 'burner') {
      playNoise(0.55, 'bandpass', 520, 0.8, 0.55);
      playTone('sawtooth', 140, 80, 0.4, 0.22);
    } else if (type === 'acid') {
      playNoise(0.25, 'highpass', 2600, 1.5, 0.28);
    }
  }

  function playExplosion() {
    playNoise(0.75, 'lowpass', 420, 0.7, 0.95);
    playTone('sawtooth', 110, 24, 0.65, 0.6);
    haptic('explosion');
  }

  function playHitmarker(isHeadshot) {
    if (isHeadshot) {
      playTone('triangle', 1480, 1950, 0.09, 0.28);
      playNoise(0.05, 'bandpass', 3200, 1.5, 0.24);
      haptic('headshot');
    } else {
      playTone('triangle', 920, 680, 0.055, 0.2);
      haptic('hit');
    }
  }

  function playFootstep(surface) {
    if (surface === 'water') {
      playNoise(0.09, 'bandpass', 950, 1.2, 0.14);
    } else if (surface === 'concrete') {
      playNoise(0.045, 'bandpass', 1650, 1.8, 0.11);
    } else {
      playNoise(0.055, 'lowpass', 720, 1.0, 0.1);
    }
  }

  function playHurt() {
    playTone('sawtooth', 140, 62, 0.16, 0.32);
    haptic('damage');
  }

  function playHeal() {
    playTone('sine', 420, 660, 0.18, 0.16);
    haptic('ui');
  }

  function playUI() {
    playTone('triangle', 680, 840, 0.04, 0.1);
    haptic('ui');
  }

  function playMutantGrowl() {
    playTone('sawtooth', 120, 65, 0.26, 0.24);
    playNoise(0.22, 'lowpass', 480, 1.5, 0.18);
  }

  function setEmissionSiren(active) {
    const c = ensure();
    if (!c) return;
    if (active && !sirenOsc) {
      sirenOsc = c.createOscillator();
      sirenGain = c.createGain();
      sirenOsc.type = 'sawtooth';
      sirenOsc.frequency.value = 340;
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 900;
      sirenGain.gain.value = 0.08;
      sirenOsc.connect(filt);
      filt.connect(sirenGain);
      sirenGain.connect(masterGain);
      sirenOsc.start();
    } else if (!active && sirenOsc) {
      try { sirenOsc.stop(); } catch (_) {}
      sirenOsc = null;
      sirenGain = null;
    }
  }

  function updateEmissionSiren(time) {
    if (sirenOsc && ctx) {
      const f = 310 + Math.sin(time * 2.2) * 145;
      sirenOsc.frequency.setValueAtTime(f, ctx.currentTime);
    }
  }

  function playThunder() {
    playNoise(1.1, 'lowpass', 260, 0.6, 0.65);
    playTone('sine', 72, 26, 0.9, 0.45);
  }

  return {
    ensure, setVolume, playShot, playEnemyShot, playReload,
    playRadarBeep, playGeigerClick, playDetectorPing, playBoltClang,
    playAnomaly, playExplosion, playHitmarker, playFootstep,
    playHurt, playHeal, playUI, playMutantGrowl,
    setEmissionSiren, updateEmissionSiren, playThunder, haptic
  };
})();
