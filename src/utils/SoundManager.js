/**
 * SoundManager — Premium basketball audio via Web Audio API
 * Fixed: throttled _play() prevents audio glitching from rapid overlapping nodes
 */
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;
    this.reverbBuffer = null;
    // Throttle: minimum ms between same sound
    this._lastPlay = {};
    this._minInterval = {
      throw: 160, score: 220, rimHit: 200, bounce: 90,
      miss: 250, hit: 200, combo: 180, click: 90,
      gameOver: 2000, ambient: 2200
    };
    // Cap total active sound groups to prevent Web Audio overload
    this._activeCount = 0;
    this._maxActive = 10;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.55;
      this.masterGain.connect(this.ctx.destination);
      this._buildReverb();
    } catch (e) {
      console.warn('Web Audio not available');
    }
  }

  _buildReverb() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
    }
    this.reverbBuffer = buf;
  }

  _reverb(node, wet = 0.22) {
    if (!this.reverbBuffer) { node.connect(this.masterGain); return; }
    try {
      const conv = this.ctx.createConvolver();
      conv.buffer = this.reverbBuffer;
      const dryGain = this.ctx.createGain(); dryGain.gain.value = 1 - wet;
      const wetGain = this.ctx.createGain(); wetGain.gain.value = wet;
      node.connect(dryGain); dryGain.connect(this.masterGain);
      node.connect(conv);    conv.connect(wetGain); wetGain.connect(this.masterGain);
    } catch (e) {
      node.connect(this.masterGain);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(val) {
    this.enabled = val;
    if (this.masterGain) this.masterGain.gain.value = val ? 0.55 : 0;
  }

  /**
   * Throttled play:
   *  1. Skips if same key played within _minInterval[key] ms
   *  2. Skips if too many active sounds (prevents Web Audio graph explosion)
   */
  _play(fn, key = 'generic') {
    if (!this.ctx || !this.enabled) return;
    const now = performance.now();
    const minMs = this._minInterval[key] || 80;
    if (this._lastPlay[key] && (now - this._lastPlay[key]) < minMs) return;
    if (this._activeCount >= this._maxActive) return;
    this._lastPlay[key] = now;
    this.resume();
    this._activeCount++;
    try { fn(); } catch (e) {}
    const maxDur = { throw: 250, score: 500, rimHit: 420, bounce: 180, miss: 480, hit: 420, combo: 650, click: 100, gameOver: 900, ambient: 1050 };
    setTimeout(() => { this._activeCount = Math.max(0, this._activeCount - 1); }, maxDur[key] || 400);
  }

  /** Throw — deep rubber thud + air whoosh */
  playThrow() {
    this._play(() => {
      const t = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const g1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(180, t);
      osc1.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      g1.gain.setValueAtTime(0.75, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc1.connect(g1);
      this._reverb(g1, 0.18);
      osc1.start(t); osc1.stop(t + 0.2);

      const bufSz = Math.floor(this.ctx.sampleRate * 0.1);
      const noise = this.ctx.createBuffer(1, bufSz, this.ctx.sampleRate);
      const nd = noise.getChannelData(0);
      for (let i = 0; i < bufSz; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / bufSz) * 0.32;
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = noise;
      const bpf = this.ctx.createBiquadFilter();
      bpf.type = 'bandpass'; bpf.frequency.value = 800; bpf.Q.value = 0.8;
      const ng = this.ctx.createGain(); ng.gain.value = 0.28;
      nSrc.connect(bpf); bpf.connect(ng); ng.connect(this.masterGain);
      nSrc.start(t); nSrc.stop(t + 0.12);
    }, 'throw');
  }

  /** Swish — net brush + satisfaction chord */
 playScore() {
  this._play(() => {
    const t = this.ctx.currentTime;

    // =====================================================
    // CLEAN SWISH (NO HISS / NO "TISH")
    // =====================================================
    const swishLen = Math.floor(this.ctx.sampleRate * 0.18);
    const swishBuf = this.ctx.createBuffer(1, swishLen, this.ctx.sampleRate);
    const data = swishBuf.getChannelData(0);

    for (let i = 0; i < swishLen; i++) {
      const x = i / swishLen;

      // ONLY smooth air movement — no random noise
      const envelope = Math.pow(1 - x, 3);

      // soft air wave (not noise)
      const air =
        Math.sin(x * Math.PI * 2) * 0.12 +
        Math.sin(x * Math.PI * 4) * 0.06;

      data[i] = air * envelope;
    }

    const swish = this.ctx.createBufferSource();
    swish.buffer = swishBuf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; // smoother, removes hiss
    filter.frequency.value = 1000;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.85;

    swish.connect(filter);
    filter.connect(gain);

    this._reverb(gain, 0.25);

    swish.start(t + 0.02);
    swish.stop(t + 0.16);

    // =====================================================
    // SOFT DUNK POP (UNCHANGED)
    // =====================================================
    const pop = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();

    pop.type = 'sine';
    pop.frequency.setValueAtTime(180, t + 0.04);
    pop.frequency.exponentialRampToValueAtTime(90, t + 0.14);

    popGain.gain.setValueAtTime(0, t + 0.04);
    popGain.gain.linearRampToValueAtTime(0.35, t + 0.06);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    pop.connect(popGain);
    this._reverb(popGain, 0.25);

    pop.start(t + 0.04);
    pop.stop(t + 0.22);

    // =====================================================
    // SPARKLE (UNCHANGED)
    // =====================================================
    const sparkle = this.ctx.createOscillator();
    const sparkleGain = this.ctx.createGain();

    sparkle.type = 'triangle';
    sparkle.frequency.setValueAtTime(1200, t + 0.05);
    sparkle.frequency.exponentialRampToValueAtTime(2400, t + 0.18);

    sparkleGain.gain.setValueAtTime(0, t + 0.05);
    sparkleGain.gain.linearRampToValueAtTime(0.12, t + 0.08);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    sparkle.connect(sparkleGain);
    this._reverb(sparkleGain, 0.4);

    sparkle.start(t + 0.05);
    sparkle.stop(t + 0.25);
  }, 'score');
}
  /** Bounce on hardwood */
  playBounce() {
    this._play(() => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g);
      this._reverb(g, 0.12);
      osc.start(t); osc.stop(t + 0.14);
    }, 'bounce');
  }

  /** Miss — descending tone + ground thud */
  playMiss() {
    this._play(() => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(85, t + 0.28);
      g.gain.setValueAtTime(0.38, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.35);

      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(100, t + 0.2);
      osc2.frequency.exponentialRampToValueAtTime(35, t + 0.38);
      g2.gain.setValueAtTime(0.45, t + 0.2);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc2.connect(g2); g2.connect(this.masterGain);
      osc2.start(t + 0.2); osc2.stop(t + 0.45);
    }, 'miss');
  }

  /** Combo — pentatonic rise (capped at 4 notes) */
  playCombo(level) {
    this._play(() => {
      const t = this.ctx.currentTime;
      const scale = [0, 2, 4, 7, 9, 12];
      const baseHz = 330 * Math.pow(2, Math.min(level - 1, 4) / 6);
      const notes = Math.min(level + 1, 4);
      for (let i = 0; i < notes; i++) {
        const freq = baseHz * Math.pow(2, scale[i] / 12);
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t + i * 0.06);
        g.gain.linearRampToValueAtTime(0.20, t + i * 0.06 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.20);
        osc.connect(g);
        this._reverb(g, 0.28);
        osc.start(t + i * 0.06); osc.stop(t + i * 0.06 + 0.26);
      }
    }, 'combo');
  }

  /** UI click */
  playClick() {
    this._play(() => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, t);
      osc.frequency.exponentialRampToValueAtTime(700, t + 0.04);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.07);
    }, 'click');
  }

  /** Game over — buzzer + descending horn */
  playGameOver() {
    this._play(() => {
      const t = this.ctx.currentTime;
      const buzz = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      buzz.type = 'sawtooth';
      buzz.frequency.value = 160;
      bg.gain.setValueAtTime(0.48, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      buzz.connect(bg);
      this._reverb(bg, 0.4);
      buzz.start(t); buzz.stop(t + 0.6);

      [440, 370, 311, 220].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.28, t + 0.1 + i * 0.13);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1 + i * 0.13 + 0.26);
        osc.connect(g);
        this._reverb(g, 0.35);
        osc.start(t + 0.1 + i * 0.13); osc.stop(t + 0.1 + i * 0.13 + 0.32);
      });
    }, 'gameOver');
  }

  /** Ambient arena breathing */
  playAmbientTick() {
    this._play(() => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 55;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.032, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(g); g.connect(this.masterGain);
      osc.start(t); osc.stop(t + 1.0);
    }, 'ambient');
  }
}

export const soundManager = new SoundManager();