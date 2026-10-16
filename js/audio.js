/**
 * Procedural Web Audio synthesizer for realistic wooden Jenga blocks.
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
   * Multi-block clatter when the tower collapses.
   */
  playTowerCollapse() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    for (let i = 0; i < 16; i++) {
      const delay = i * 32 + Math.random() * 55;
      setTimeout(() => {
        const pitch = 0.65 + Math.random() * 0.85;
        const vol = Math.max(0.08, 0.38 - i * 0.018);
        this.playWoodTap(pitch, vol);
      }, delay);
    }
  }
}

window.JengaAudio = new SoundEngine();
