// Procedural sound. One job: every sound and the music are synthesised with
// WebAudio at run time — no audio files, no network, nothing borrowed.
// The context only starts after the player's first key press or click.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicOn = false;
  }

  /** Create the context on the first user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngineHum();
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  startEngineHum() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  /** Engine pitch follows speed; call every frame while driving. */
  setEngine(speedRatio, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const target = driving ? 0.045 + speedRatio * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speedRatio * 118, this.ctx.currentTime, 0.08);
  }

  /** Two-tone police siren while wanted level is 2 or more. */
  setSiren(on, dt) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = 0;
    }
    if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenGain = null;
      return;
    }
    if (this.sirenOsc) {
      this.sirenTimer += dt;
      const high = Math.floor(this.sirenTimer / 0.45) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(high ? 720 : 540, this.ctx.currentTime, 0.03);
    }
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol || 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, lowpass) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1800;
    const gain = this.ctx.createGain();
    gain.gain.value = vol || 0.2;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shoot() { this.noise(0.14, 0.28, 2400); this.blip(180, 0.08, 'square', 0.1); }
  punch() { this.noise(0.08, 0.16, 900); }
  pickup() { this.blip(660, 0.09, 'sine', 0.14); this.blip(990, 0.12, 'sine', 0.12); }
  coin() { this.blip(880, 0.07, 'sine', 0.12); this.blip(1318, 0.14, 'sine', 0.12); }
  carDoor() { this.noise(0.07, 0.14, 700); this.blip(140, 0.07, 'square', 0.08); }
  crash() { this.noise(0.22, 0.3, 700); }
  wantedUp() { this.blip(392, 0.12, 'square', 0.1); this.blip(311, 0.2, 'square', 0.1); }
  busted() { this.blip(220, 0.3, 'sawtooth', 0.12); this.blip(165, 0.5, 'sawtooth', 0.12); }
  click() { this.blip(1200, 0.04, 'sine', 0.07); }

  missionStart() {
    [523, 659, 784].forEach((f, i) => {
      window.setTimeout(() => this.blip(f, 0.16, 'triangle', 0.13), i * 110);
    });
  }

  missionComplete() {
    [523, 659, 784, 1046].forEach((f, i) => {
      window.setTimeout(() => this.blip(f, 0.22, 'triangle', 0.14), i * 130);
    });
  }

  // A lazy sunset groove: soft bass notes over a warm pad chord, one step
  // every 0.24 s, quiet enough to sit under the game. Original, of course.
  startMusic() {
    if (this.musicTimer) return;
    this.musicOn = true;
    const bass = [55, 0, 65.4, 0, 49, 0, 58.3, 0, 55, 0, 65.4, 0, 73.4, 65.4, 49, 0];
    const pad = [220, 261.6, 329.6];
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const note = bass[this.musicStep % bass.length];
      if (note) this.blip(note, 0.22, 'triangle', 0.05);
      if (this.musicStep % 16 === 0) {
        pad.forEach((f) => this.blip(f, 1.4, 'sine', 0.018));
      }
      this.musicStep += 1;
    }, 240);
  }
}
