/**
 * Procedural Web Audio synthesizer for realistic wooden Jenga blocks,
 * plus expressive vocal "Oh!" (on tower collapse) and "Yey!" celebration cheers (on win).
 * Requires zero external MP3/WAV assets and works offline or via file://.
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
    this.isDecodingLaugh = false;
    this.pendingLaughPlay = false;
    this.preloadLaughElement();
  }

  preloadLaughElement() {
    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = window.JENGA_LAUGH_MP3 || 'assets/laugh.mp3';
      audio.load();
      this.laughAudio = audio;
    } catch (_) {}
  }

  decodeDataUriToBuffer(dataUri) {
    if (!this.ctx || !dataUri || this.laughBuffer || this.isDecodingLaugh) return;
    try {
      const commaIdx = dataUri.indexOf(',');
      if (commaIdx === -1) return;
      this.isDecodingLaugh = true;
      const b64 = dataUri.slice(commaIdx + 1);
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      this.ctx.decodeAudioData(
        bytes.buffer,
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
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.ctx && !this.laughBuffer && !this.isDecodingLaugh) {
      this.decodeDataUriToBuffer(window.JENGA_LAUGH_MP3);
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
    }
    return this.enabled;
  }

  /**
   * Short wooden knock used during tower collapse impacts.
   */
  playWoodTap(pitchFactor = 1.0, volume = 0.25) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

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
    if (!this.ctx) return;

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
   * Plays a pleasant two-tone wooden pick sound if allowed, or a low muted knock if locked.
   */
  playBlockSelect(allowed = true) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    if (!allowed) {
      this.playWoodTap(0.55, 0.18);
      return;
    }

    // Crisp initial wood touch
    this.playWoodTap(1.15, 0.22);

    // Warm rosewood/marimba harmonic overtone to confirm selection
    const notes = [392.0, 523.25]; // G4 -> C5 warm fifth/fourth interval
    notes.forEach((freq, idx) => {
      const start = this.ctx.currentTime + idx * 0.045;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.006);
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
    if (!this.ctx) return;

    this.playWoodTap(1.28, 0.26);
    const notes = [440.0, 659.25]; // A4 -> E5 lift interval
    notes.forEach((freq, idx) => {
      const start = this.ctx.currentTime + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.008);
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
    if (!this.ctx) return;

    this.playWoodTap(0.78, 0.42);
    this.scheduleTimer(() => this.playWoodTap(1.12, 0.24), 48);
    this.scheduleTimer(() => this.playWoodTap(0.95, 0.12), 95);
  }

  /**
   * Pleasant chime.
   */
  playTurnSuccess() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const now = this.ctx.currentTime + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
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

    // Prefer decoded Web Audio buffer for instant zero-latency playback
    if (this.startBufferLaugh()) {
      return;
    }

    // If Web Audio buffer is currently decoding, queue it to play immediately upon decode completion
    if (this.isDecodingLaugh) {
      this.pendingLaughPlay = true;
      return;
    }

    // HTML5 Audio fallback
    if (this.laughAudio) {
      try {
        this.laughAudio.volume = 1.0;
        this.laughAudio.currentTime = 0;
        const p = this.laughAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
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
    if (!this.ctx) return;

    // 1. Multi-voice formant "Yey!" cheer (vowel glide 'Y-e-y' with rising pitch)
    const voices = [275, 340, 410, 225];
    voices.forEach((basePitch, idx) => {
      const now = this.ctx.currentTime + idx * 0.04;
      const dur = 0.72;

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(basePitch * 0.92, now);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 1.48, now + 0.28);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 1.32, now + dur);

      // Formant 1 (glides 380 -> 580 -> 420 Hz for "Ye-a-y")
      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(380, now);
      f1.frequency.linearRampToValueAtTime(620, now + 0.25);
      f1.frequency.linearRampToValueAtTime(440, now + dur);
      f1.Q.setValueAtTime(5.0, now);

      // Formant 2 (glides 2150 -> 1750 -> 2100 Hz for bright "Yey!")
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

    // 2. Celebratory Victory Fanfare Arpeggio
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

    // 3. Rhythmic Party Claps
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

    // 4. Spoken "Yey!" celebration via SpeechSynthesis if supported
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
    if (!this.ctx) return;

    // Contagious laughter reaction spanning the fall and collapse
    this.playBreakOh(2.35);

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
