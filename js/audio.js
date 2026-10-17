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
   * Long, dramatic stretched "Ohhhhhhhhhhhhhhh!" vocal reaction that spans from
   * when the tower begins tipping/falling all the way through the final collapse (~2.4s).
   * Uses multi-voice formant synthesis (vowel "O-o-o-h-h-h" with natural 5.5Hz vocal vibrato)
   * layered with a slow-stretched Web Speech utterance.
   */
  playBreakOh(duration = 2.35) {
    if (!this.enabled) return;
    const nowMs = performance.now();
    if (this.lastOhTime && nowMs - this.lastOhTime < 2200) {
      return; // Already stretching "Ohhhhhhhhhhhhhhh!" from the start of the fall
    }
    this.lastOhTime = nowMs;

    this.init();
    if (!this.ctx) return;

    // 1. Multi-voice stretched formant "Ohhhhhhhhhhhhhhh!" crowd groan (~2.35s)
    const basePitches = [235, 285, 188, 320, 155];
    basePitches.forEach((startPitch, idx) => {
      const startOffset = idx * 0.045;
      const now = this.ctx.currentTime + startOffset;
      const dur = duration;

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';

      // Dramatic pitch contour: initial gasp as tower tips -> long suspended hold -> falling groan on collapse
      osc.frequency.setValueAtTime(startPitch * 1.02, now);
      osc.frequency.linearRampToValueAtTime(startPitch * 1.18, now + dur * 0.16);
      osc.frequency.linearRampToValueAtTime(startPitch * 1.08, now + dur * 0.52);
      osc.frequency.exponentialRampToValueAtTime(startPitch * 0.56, now + dur);

      // Natural human vocal vibrato (5.2 - 6.0 Hz LFO) during the long "Ohhhhhhhhhhhhhhh!" stretch
      const vibratoOsc = this.ctx.createOscillator();
      const vibratoGain = this.ctx.createGain();
      vibratoOsc.type = 'sine';
      vibratoOsc.frequency.setValueAtTime(5.2 + idx * 0.25, now);
      vibratoGain.gain.setValueAtTime(0.5, now);
      vibratoGain.gain.linearRampToValueAtTime(startPitch * 0.028, now + dur * 0.35);
      vibratoGain.gain.linearRampToValueAtTime(startPitch * 0.015, now + dur);
      vibratoOsc.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);

      // Vowel 'O -> Ohhh -> Ahhh' Formant 1 (~500 Hz -> 420 Hz -> 360 Hz)
      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(510, now);
      f1.frequency.linearRampToValueAtTime(450, now + dur * 0.5);
      f1.frequency.linearRampToValueAtTime(365, now + dur);
      f1.Q.setValueAtTime(5.2, now);

      // Formant 2 (~880 Hz -> 780 Hz -> 680 Hz)
      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(890, now);
      f2.frequency.linearRampToValueAtTime(790, now + dur * 0.5);
      f2.frequency.linearRampToValueAtTime(680, now + dur);
      f2.Q.setValueAtTime(5.8, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      // Swells in as the tower starts leaning
      gain.gain.linearRampToValueAtTime(0.085, now + 0.12);
      // Sustains across the fall and peaks right as the tower crashes
      gain.gain.linearRampToValueAtTime(0.105, now + dur * 0.55);
      gain.gain.setValueAtTime(0.09, now + dur * 0.72);
      // Long tail fade out after collapse
      gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

      osc.connect(f1);
      osc.connect(f2);
      f1.connect(gain);
      f2.connect(gain);
      gain.connect(this.ctx.destination);

      vibratoOsc.start(now);
      osc.start(now);
      vibratoOsc.stop(now + dur + 0.04);
      osc.stop(now + dur + 0.04);
    });

    // 2. Stretched spoken "Ohhhhhhhhhhhhhhh!" via SpeechSynthesis if supported
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance('Ohhhhhhhhhhhhhhh!');
        utter.pitch = 0.65;
        utter.rate = 0.42; // Slow, drawn-out stretch across the fall
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
