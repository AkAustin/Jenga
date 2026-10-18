/**
 * Dual-Engine Mobile & Desktop Sound Synthesizer (Web Audio API + HTML5 WAV/MP3 Audio Pool)
 * for Jenga 360°.
 * - Works on iOS Safari/Chrome (even with hardware Silent switch via Playback session + WAV Audio)
 * - Works on Android Chrome, Samsung Internet, and Desktop browsers
 * - Includes YouTube Short laughing sound (pez2Wcfm--g) on mid-air tower collapse
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastSlideTime = 0;
    this.lastOhTime = 0;
    this.activeTimers = [];
    this.laughBuffer = null;
    this.laughSource = null;
    this.laughAudio = null;
    this.laughBlobUrl = null;
    this.isDecodingLaugh = false;
    this.pendingLaughPlay = false;
    this.pendingSoundFn = null;
    this.mobileUnlocked = false;
    this.wavUrls = {};
    this.wavPools = {};
    this.unlockAudio = null;

    this.buildProceduralWavBank();
    this.preloadLaughElement();
    this.bindMobileAudioUnlock();
  }

  /**
   * Encodes a mono Float32Array [-1..1] at sampleRate into a 16-bit PCM WAV Blob URL.
   */
  encodeWavUrl(samples, sampleRate = 22050) {
    const numSamples = samples.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, 1, true);  // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  /**
   * Pre-synthesizes crisp PCM WAV clips for HTML5 <audio> fallback on mobile devices
   * where Web Audio API may still be resuming or muted by the iOS silent switch.
   */
  buildProceduralWavBank() {
    try {
      const sr = 22050;

      // 1. Silent looping WAV (keeps iOS AVAudioSession in Playback mode even when Silent switch is on)
      const silentSamples = new Float32Array(Math.floor(sr * 0.25));
      this.wavUrls.silent = this.encodeWavUrl(silentSamples, sr);
      this.unlockAudio = new Audio(this.wavUrls.silent);
      this.unlockAudio.preload = 'auto';
      this.unlockAudio.loop = true;
      this.unlockAudio.playsInline = true;
      this.unlockAudio.setAttribute('playsinline', '');
      this.unlockAudio.setAttribute('webkit-playsinline', '');

      // Helper to add a decaying sine/triangle wood tone into a sample buffer
      const addTone = (buf, startSec, durSec, freqStart, freqEnd, amp, isTriangle = false) => {
        const i0 = Math.floor(startSec * sr);
        const len = Math.floor(durSec * sr);
        let phase = 0;
        for (let i = 0; i < len && i0 + i < buf.length; i++) {
          const t = i / len;
          const freq = freqStart * Math.pow(freqEnd / freqStart, t);
          phase += (2 * Math.PI * freq) / sr;
          const env = Math.min(1, i / (sr * 0.004)) * Math.exp(-t * 5.2);
          const raw = isTriangle
            ? (2 / Math.PI) * Math.asin(Math.sin(phase))
            : Math.sin(phase);
          buf[i0 + i] += raw * amp * env;
        }
      };

      // 2. Wood Tap WAV
      const tapBuf = new Float32Array(Math.floor(sr * 0.09));
      addTone(tapBuf, 0, 0.08, 320, 95, 0.55, true);
      addTone(tapBuf, 0, 0.04, 680, 420, 0.3, false);
      this.wavUrls.tap = this.encodeWavUrl(tapBuf, sr);

      // 3. Block Select (Allowed) — Crisp wood knock + warm G4 -> C5 marimba interval
      const selOkBuf = new Float32Array(Math.floor(sr * 0.22));
      addTone(selOkBuf, 0, 0.07, 350, 110, 0.45, true);
      addTone(selOkBuf, 0, 0.14, 392.0, 392.0, 0.35, false);
      addTone(selOkBuf, 0.045, 0.15, 523.25, 523.25, 0.38, false);
      this.wavUrls.selectAllowed = this.encodeWavUrl(selOkBuf, sr);

      // 4. Block Select (Locked) — Low muted hollow knock
      const selLockBuf = new Float32Array(Math.floor(sr * 0.12));
      addTone(selLockBuf, 0, 0.09, 175, 70, 0.45, true);
      this.wavUrls.selectLocked = this.encodeWavUrl(selLockBuf, sr);

      // 5. Wood Slide — Filtered friction grain burst
      const slideBuf = new Float32Array(Math.floor(sr * 0.055));
      for (let i = 0; i < slideBuf.length; i++) {
        const env = Math.exp(-i / (slideBuf.length * 0.55));
        const mod = Math.sin((2 * Math.PI * 980 * i) / sr);
        slideBuf[i] = (Math.random() * 2 - 1) * mod * env * 0.28;
      }
      this.wavUrls.slide = this.encodeWavUrl(slideBuf, sr);

      // 6. Block Extract — Upward wooden pop + A4 -> E5 lift
      const extBuf = new Float32Array(Math.floor(sr * 0.26));
      addTone(extBuf, 0, 0.075, 360, 130, 0.48, true);
      addTone(extBuf, 0, 0.16, 440.0, 440.0, 0.38, true);
      addTone(extBuf, 0.055, 0.19, 659.25, 659.25, 0.42, true);
      this.wavUrls.extract = this.encodeWavUrl(extBuf, sr);

      // 7. Block Place — Solid 3-tap hardwood set-down thud
      const placeBuf = new Float32Array(Math.floor(sr * 0.22));
      addTone(placeBuf, 0, 0.08, 220, 75, 0.65, true);
      addTone(placeBuf, 0.048, 0.075, 310, 95, 0.42, true);
      addTone(placeBuf, 0.095, 0.07, 260, 85, 0.25, true);
      this.wavUrls.place = this.encodeWavUrl(placeBuf, sr);

      // 8. Win Fanfare WAV
      const winBuf = new Float32Array(Math.floor(sr * 0.9));
      const fanfare = [523.25, 659.25, 783.99, 1046.5];
      fanfare.forEach((f, idx) => {
        addTone(winBuf, idx * 0.09, idx === 3 ? 0.55 : 0.22, f, f, 0.42, true);
      });
      this.wavUrls.win = this.encodeWavUrl(winBuf, sr);

      // Pre-allocate small HTML5 Audio pools per sound key
      Object.keys(this.wavUrls).forEach((key) => {
        if (key === 'silent') return;
        this.wavPools[key] = [new Audio(this.wavUrls[key]), new Audio(this.wavUrls[key])];
        this.wavPools[key].forEach((a) => {
          a.preload = 'auto';
          a.playsInline = true;
          a.setAttribute('playsinline', '');
          a.setAttribute('webkit-playsinline', '');
        });
      });
    } catch (_) {}
  }

  playWavFallback(key, volume = 0.85) {
    if (!this.enabled) return;
    const pool = this.wavPools[key];
    if (!pool || !pool.length) return;
    try {
      const audio = pool.find((a) => a.paused || a.ended) || pool[0];
      audio.volume = Math.max(0.05, Math.min(1.0, volume));
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (_) {}
  }

  preloadLaughElement() {
    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.playsInline = true;
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');

      // Convert base64 MP3 to a Blob URL (much more reliable on iOS Safari & mobile Chrome than a long data: URI)
      if (window.JENGA_LAUGH_MP3) {
        const commaIdx = window.JENGA_LAUGH_MP3.indexOf(',');
        if (commaIdx !== -1) {
          const b64 = window.JENGA_LAUGH_MP3.slice(commaIdx + 1);
          const binary = atob(b64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          this.laughRawBytes = bytes;
          const blob = new Blob([bytes], { type: 'audio/mpeg' });
          this.laughBlobUrl = URL.createObjectURL(blob);
          audio.src = this.laughBlobUrl;
        }
      }

      if (!audio.src) {
        audio.src = 'assets/laugh.mp3';
      }
      audio.load();
      this.laughAudio = audio;
    } catch (_) {}
  }

  /**
   * Synchronously unlocks Web Audio API + HTML5 Audio inside any direct user gesture
   * (pointerdown, pointerup, touchend, click) before any library calls preventDefault().
   */
  unlockFromGesture() {
    if (!this.enabled) return;

    if (typeof navigator !== 'undefined' && navigator.audioSession) {
      try {
        navigator.audioSession.type = 'playback';
      } catch (_) {}
    }

    this.init();

    if (this.unlockAudio && this.unlockAudio.paused) {
      try {
        this.unlockAudio.volume = 0.01;
        const p = this.unlockAudio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            this.mobileUnlocked = true;
            this.flushPendingSound();
          }).catch(() => {});
        }
      } catch (_) {}
    }

    if (this.ctx) {
      if (this.ctx.state !== 'running') {
        try {
          const rp = this.ctx.resume();
          if (rp && typeof rp.then === 'function') {
            rp.then(() => {
              this.mobileUnlocked = true;
              this.flushPendingSound();
            }).catch(() => {});
          }
        } catch (_) {}
      } else {
        this.mobileUnlocked = true;
        this.flushPendingSound();
      }

      try {
        const silentBuf = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = silentBuf;
        src.connect(this.ctx.destination);
        src.start(0);
      } catch (_) {}
    }
  }

  flushPendingSound() {
    if (!this.pendingSoundFn || !this.enabled) return;
    const fn = this.pendingSoundFn;
    this.pendingSoundFn = null;
    try {
      fn();
    } catch (_) {}
  }

  /**
   * Unlocks Web Audio API and HTML5 Audio on mobile browsers (iOS Safari, Android Chrome).
   */
  bindMobileAudioUnlock() {
    const unlockHandler = () => {
      this.unlockFromGesture();
    };

    ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'click', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlockHandler, { capture: true, passive: true });
    });
  }

  decodeLaughBuffer() {
    if (!this.ctx || this.laughBuffer || this.isDecodingLaugh) return;
    if (!this.laughRawBytes && !window.JENGA_LAUGH_MP3) return;
    try {
      this.isDecodingLaugh = true;
      let bytes = this.laughRawBytes;
      if (!bytes && window.JENGA_LAUGH_MP3) {
        const commaIdx = window.JENGA_LAUGH_MP3.indexOf(',');
        if (commaIdx === -1) {
          this.isDecodingLaugh = false;
          return;
        }
        const b64 = window.JENGA_LAUGH_MP3.slice(commaIdx + 1);
        const binary = atob(b64);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        this.laughRawBytes = bytes;
      }

      const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      this.ctx.decodeAudioData(
        arrayBuf,
        (decoded) => {
          this.laughBuffer = decoded;
          this.isDecodingLaugh = false;
          if (this.pendingLaughPlay && this.enabled) {
            this.pendingLaughPlay = false;
            this.startBufferLaugh();
          }
        },
        () => {
          this.isDecodingLaugh = false;
        }
      );
    } catch (_) {
      this.isDecodingLaugh = false;
    }
  }

  startBufferLaugh() {
    if (!this.ctx || !this.laughBuffer || !this.enabled) return false;
    try {
      if (this.ctx.state !== 'running') {
        this.ctx.resume();
      }
      if (this.laughSource) {
        try {
          this.laughSource.stop();
        } catch (_) {}
      }
      const src = this.ctx.createBufferSource();
      src.buffer = this.laughBuffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(0);
      this.laughSource = src;
      return true;
    } catch (_) {
      return false;
    }
  }

  init() {
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
      try {
        navigator.audioSession.type = 'playback';
      } catch (_) {}
    }
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        this.ctx.resume();
      } catch (_) {}
    }
    if (this.ctx && !this.laughBuffer && !this.isDecodingLaugh) {
      this.decodeLaughBuffer();
    }
  }

  scheduleTimer(fn, delayMs) {
    const id = setTimeout(() => {
      this.activeTimers = this.activeTimers.filter((t) => t !== id);
      fn();
    }, delayMs);
    this.activeTimers.push(id);
    return id;
  }

  stopAll() {
    while (this.activeTimers.length > 0) {
      clearTimeout(this.activeTimers.pop());
    }
    this.lastOhTime = 0;
    this.pendingLaughPlay = false;
    if (this.laughSource) {
      try {
        this.laughSource.stop();
      } catch (_) {}
      this.laughSource = null;
    }
    if (this.laughAudio) {
      try {
        this.laughAudio.pause();
        this.laughAudio.currentTime = 0;
      } catch (_) {}
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopAll();
    } else {
      this.init();
    }
    return this.enabled;
  }

  /**
   * Short wooden knock used during tower collapse impacts.
   */
  playWoodTap(pitchFactor = 1.0, volume = 0.25) {
    if (!this.enabled) return;
    this.init();

    if (!this.ctx || this.ctx.state !== 'running') {
      this.playWavFallback('tap', Math.min(1.0, volume * 2.5));
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    const baseFreq = 260 * pitchFactor + (Math.random() * 35 - 17);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.065);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650 * pitchFactor, now);
    filter.Q.setValueAtTime(3.2, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * Subtle wood-on-wood friction scrape.
   */
  playWoodSlide(intensity = 0.4) {
    if (!this.enabled) return;
    const nowMs = performance.now();
    if (nowMs - this.lastSlideTime < 55) return;
    this.lastSlideTime = nowMs;

    this.init();
    if (!this.ctx || this.ctx.state !== 'running') {
      this.playWavFallback('slide', Math.min(0.9, 0.35 + intensity * 0.45));
      return;
    }

    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.045;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.6));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950 + Math.random() * 250, now);
    filter.Q.setValueAtTime(4.0, now);

    const gain = this.ctx.createGain();
    const vol = Math.min(0.16, 0.04 + intensity * 0.12);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
  }

  /**
   * Warm, tactile wooden marimba-like click/knock when a block is touched or selected.
   */
  playBlockSelect(allowed = true) {
    if (!this.enabled) return;
    this.init();

    const wavKey = allowed ? 'selectAllowed' : 'selectLocked';

    // Always play HTML5 WAV fallback when Web Audio is still unlocking or on touch devices
    if (!this.ctx || this.ctx.state !== 'running') {
      this.playWavFallback(wavKey, 0.9);
      this.pendingSoundFn = () => {
        this.playBlockSelect(allowed);
      };
      if (this.ctx) {
        try {
          const rp = this.ctx.resume();
          if (rp && typeof rp.then === 'function') {
            rp.then(() => {
              this.mobileUnlocked = true;
              this.flushPendingSound();
            }).catch(() => {});
          }
        } catch (_) {}
      }
      return;
    }

    if (!allowed) {
      this.playWoodTap(0.55, 0.24);
      return;
    }

    this.playWoodTap(1.15, 0.28);

    const notes = [392.0, 523.25];
    notes.forEach((freq, idx) => {
      const start = this.ctx.currentTime + idx * 0.045;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.14);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  /**
   * Satisfying upward wooden pop & release tone when a block is pulled free from the tower.
   */
  playBlockExtract() {
    if (!this.enabled) return;
    this.init();

    if (!this.ctx || this.ctx.state !== 'running') {
      this.playWavFallback('extract', 0.95);
      this.pendingSoundFn = () => this.playBlockExtract();
      return;
    }

    this.playWoodTap(1.28, 0.3);
    const notes = [440.0, 659.25];
    notes.forEach((freq, idx) => {
      const start = this.ctx.currentTime + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.19);
    });
  }

  /**
   * Solid wooden thud when a block is placed down on top of the tower.
   */
  playBlockPlace() {
    if (!this.enabled) return;
    this.init();

    if (!this.ctx || this.ctx.state !== 'running') {
      this.playWavFallback('place', 0.95);
      this.pendingSoundFn = () => this.playBlockPlace();
      return;
    }

    this.playWoodTap(0.78, 0.45);
    this.scheduleTimer(() => this.playWoodTap(1.12, 0.26), 48);
    this.scheduleTimer(() => this.playWoodTap(0.95, 0.14), 95);
  }

  /**
   * Pleasant chime.
   */
  playTurnSuccess() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;

    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const now = this.ctx.currentTime + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  /**
   * Plays the YouTube Short laughing sound (https://www.youtube.com/shorts/pez2Wcfm--g)
   * as the tower starts falling through the air.
   */
  playBreakOh() {
    if (!this.enabled) return;
    const nowMs = performance.now();
    if (this.lastOhTime && nowMs - this.lastOhTime < 2200) {
      return;
    }
    this.lastOhTime = nowMs;

    this.init();

    // Stop any previous laugh instance
    if (this.laughSource) {
      try {
        this.laughSource.stop();
      } catch (_) {}
      this.laughSource = null;
    }
    if (this.laughAudio) {
      try {
        this.laughAudio.pause();
        this.laughAudio.currentTime = 0;
      } catch (_) {}
    }

    // 1. Play via unlocked Web Audio API buffer (works inside requestAnimationFrame on iOS & Android)
    let playedWebAudio = false;
    if (this.ctx && this.laughBuffer) {
      playedWebAudio = this.startBufferLaugh();
    } else if (this.isDecodingLaugh) {
      this.pendingLaughPlay = true;
    }

    // 2. If Web Audio didn't play, fall back to HTML5 Audio element
    if (!playedWebAudio && this.laughAudio) {
      try {
        this.laughAudio.muted = false;
        this.laughAudio.volume = 1.0;
        this.laughAudio.currentTime = 0;
        const p = this.laughAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (this.isDecodingLaugh) {
              this.pendingLaughPlay = true;
            } else {
              this.startBufferLaugh();
            }
          });
        }
      } catch (_) {}
    }
  }

  /**
   * Joyful "Yey!" celebration sound + applause + fanfare when a player wins!
   */
  playWinYey() {
    if (!this.enabled) return;
    this.init();

    if (!this.ctx || this.ctx.state !== 'running') {
      this.playWavFallback('win', 0.95);
      return;
    }

    const voices = [275, 340, 410, 225];
    voices.forEach((basePitch, idx) => {
      const now = this.ctx.currentTime + idx * 0.04;
      const dur = 0.72;

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(basePitch * 0.92, now);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 1.48, now + 0.28);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 1.32, now + dur);

      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(380, now);
      f1.frequency.linearRampToValueAtTime(620, now + 0.25);
      f1.frequency.linearRampToValueAtTime(440, now + dur);
      f1.Q.setValueAtTime(5.0, now);

      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(2150, now);
      f2.frequency.linearRampToValueAtTime(1750, now + 0.25);
      f2.frequency.linearRampToValueAtTime(2100, now + dur);
      f2.Q.setValueAtTime(6.0, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.085, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 0.38);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

      osc.connect(f1);
      osc.connect(f2);
      f1.connect(gain);
      f2.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + dur + 0.02);
    });

    const fanfareNotes = [523.25, 659.25, 783.99, 1046.5];
    fanfareNotes.forEach((freq, i) => {
      const start = this.ctx.currentTime + i * 0.09;
      const dur = i === fanfareNotes.length - 1 ? 0.55 : 0.22;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });

    for (let c = 0; c < 10; c++) {
      this.scheduleTimer(() => {
        if (!this.ctx || !this.enabled) return;
        const now = this.ctx.currentTime;
        const bufLen = Math.floor(this.ctx.sampleRate * 0.04);
        const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let j = 0; j < bufLen; j++) {
          data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufLen * 0.35));
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1200 + Math.random() * 400, now);
        bp.Q.setValueAtTime(2.5, now);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.ctx.destination);
        src.start(now);
      }, c * 65 + Math.random() * 25);
    }

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance('Yey!');
        utter.pitch = 1.45;
        utter.rate = 1.05;
        utter.volume = 0.95;
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    }
  }

  /**
   * Multi-block clatter + contagious laughter as the tower falls and collapses.
   */
  playTowerCollapse() {
    if (!this.enabled) return;
    this.init();

    // Contagious laughter reaction spanning the fall and collapse
    this.playBreakOh();

    // 28 staggered hardwood block impacts spanning ~2.1 seconds as the tower topples and settles
    for (let i = 0; i < 28; i++) {
      const delay = i * 68 + Math.random() * 55;
      this.scheduleTimer(() => {
        const pitch = 0.62 + Math.random() * 0.88;
        const vol = Math.max(0.06, 0.4 - i * 0.012);
        this.playWoodTap(pitch, vol);
      }, delay);
    }
  }
}

window.JengaAudio = new SoundEngine();
