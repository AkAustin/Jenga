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
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return this.enabled;
  }

  /**
   * Short wooden knock when selecting, probing, or nudging a block.
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
   * Subtle wood-on-wood friction scrape while pulling a block.
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
   * Solid wooden thud when placing a block on top of the tower.
   */
  playBlockPlace() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    this.playWoodTap(0.78, 0.42);
    setTimeout(() => this.playWoodTap(1.12, 0.22), 45);
  }

  /**
   * Pleasant chime when a turn completes safely.
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
   * Contagious multi-voice parlor laughter ("Hahaha! Ahahahaha!") that stretches
   * across the tower's fall and collapse (~2.4 seconds).
   * Synthesizes rhythmic "Ha-ha-ha-ha!" vocal bursts with breath aspiration + vowel formants
   * layered with Web Speech laughter.
   */
  playBreakOh(duration = 2.4) {
    if (!this.enabled) return;
    const nowMs = performance.now();
    if (this.lastOhTime && nowMs - this.lastOhTime < 2200) {
      return;
    }
    this.lastOhTime = nowMs;

    this.init();
    if (!this.ctx) return;

    // 1. Multi-voice rhythmic "Ha-ha-ha-ha-ha!" laughter bursts across ~2.4 seconds
    const laughVoices = [
      { basePitch: 240, stepMs: 175, syllables: 12, delayMs: 0 },
      { basePitch: 315, stepMs: 160, syllables: 13, delayMs: 55 },
      { basePitch: 185, stepMs: 190, syllables: 11, delayMs: 95 },
      { basePitch: 370, stepMs: 155, syllables: 13, delayMs: 130 }
    ];

    laughVoices.forEach((v) => {
      for (let s = 0; s < v.syllables; s++) {
        const burstDelay = v.delayMs + s * v.stepMs + Math.random() * 18;
        setTimeout(() => {
          if (!this.ctx || !this.enabled) return;
          const now = this.ctx.currentTime;
          const sylDur = 0.125;

          // Descending laugh phrase contour with playful bounce per "Ha!" syllable
          const phraseDecay = Math.max(0.72, 1.0 - (s % 6) * 0.045);
          const pitch = v.basePitch * phraseDecay * (0.97 + Math.random() * 0.06);

          // Vocal cord sawtooth source for the "a" in "Ha!"
          const osc = this.ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(pitch * 1.18, now);
          osc.frequency.exponentialRampToValueAtTime(pitch * 0.84, now + sylDur);

          // Vowel "Ah" Formants (F1 ~ 760 Hz, F2 ~ 1320 Hz)
          const f1 = this.ctx.createBiquadFilter();
          f1.type = 'bandpass';
          f1.frequency.setValueAtTime(760, now);
          f1.Q.setValueAtTime(4.8, now);

          const f2 = this.ctx.createBiquadFilter();
          f2.type = 'bandpass';
          f2.frequency.setValueAtTime(1320, now);
          f2.Q.setValueAtTime(5.5, now);

          const vGain = this.ctx.createGain();
          const envelopeScale = Math.sin((Math.PI * (s + 1)) / (v.syllables + 1));
          const peakVol = 0.035 + 0.045 * envelopeScale;
          vGain.gain.setValueAtTime(0.001, now);
          vGain.gain.linearRampToValueAtTime(peakVol, now + 0.018);
          vGain.gain.exponentialRampToValueAtTime(0.0008, now + sylDur);

          osc.connect(f1);
          osc.connect(f2);
          f1.connect(vGain);
          f2.connect(vGain);
          vGain.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + sylDur + 0.01);

          // Short breathy "H-" aspiration burst at the start of each "Ha!"
          const bufLen = Math.floor(this.ctx.sampleRate * 0.028);
          const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let j = 0; j < bufLen; j++) {
            data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufLen * 0.45));
          }
          const hNoise = this.ctx.createBufferSource();
          hNoise.buffer = buf;
          const hFilter = this.ctx.createBiquadFilter();
          hFilter.type = 'bandpass';
          hFilter.frequency.setValueAtTime(1450, now);
          hFilter.Q.setValueAtTime(2.2, now);
          const hGain = this.ctx.createGain();
          hGain.gain.setValueAtTime(peakVol * 0.65, now);
          hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
          hNoise.connect(hFilter);
          hFilter.connect(hGain);
          hGain.connect(this.ctx.destination);
          hNoise.start(now);
        }, burstDelay);
      }
    });

    // 2. Spoken laughter via SpeechSynthesis spanning the tower fall and collapse
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance('Hahaha! Ahahahaha! Hahaha!');
        utter.pitch = 1.25;
        utter.rate = 0.92;
        utter.volume = 0.95;
        window.speechSynthesis.speak(utter);
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
      setTimeout(() => {
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
   * Multi-block clatter + stretched "Ohhhhhhhhhhhhhhh!" vocal groan as the tower falls and collapses.
   */
  playTowerCollapse() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    // Stretched "Ohhhhhhhhhhhhhhh!" reaction spanning the fall and collapse
    this.playBreakOh(2.35);

    // 28 staggered hardwood block impacts spanning ~2.1 seconds as the tower topples and settles
    for (let i = 0; i < 28; i++) {
      const delay = i * 68 + Math.random() * 55;
      setTimeout(() => {
        const pitch = 0.62 + Math.random() * 0.88;
        const vol = Math.max(0.06, 0.4 - i * 0.012);
        this.playWoodTap(pitch, vol);
      }, delay);
    }
  }
}

window.JengaAudio = new SoundEngine();
