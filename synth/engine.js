// Synth lab sound engine (runs inside an AudioWorklet).
//
// Written one sample at a time on purpose: this is the code that moves to
// C++ when the synth becomes a VST, so it avoids browser-only shortcuts like
// OscillatorNode. Two parts, mirroring a plugin inside a host:
//   Voice - one sounding note: oscillator + a fixed click-free envelope.
//   Synth - the plugin: owns the voices and the parameters.
// The shared scale player (lab/player.js) plays the DAW's part and calls
// noteOn, noteOff, setParam and render - the same contract a VST has.

const WAVES = ['sine', 'triangle', 'saw', 'square'];

// PolyBLEP smooths the instant jump in a saw or square wave. Without it, the
// jump creates harsh high frequencies that fold back down as metallic
// whistles (aliasing), worst on high notes.
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

class Voice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.note = -1;
    this.phase = 0;
    this.env = 0;
    this.stage = 'off'; // attack, sustain, release, off
    this.age = 0;
    // Fixed 5 ms attack and 40 ms release, only to stop clicks.
    // Real envelope sliders come in a later version.
    this.attackStep = 1 / (0.005 * sampleRate);
    this.releaseMul = Math.exp(Math.log(0.001) / (0.04 * sampleRate));
  }
  start(note, age) {
    this.note = note;
    this.freq = 440 * Math.pow(2, (note - 69) / 12);
    this.stage = 'attack';
    this.age = age;
  }
  stop() { if (this.stage !== 'off') this.stage = 'release'; }
  render(wave) {
    if (this.stage === 'off') return 0;
    if (this.stage === 'attack') {
      this.env += this.attackStep;
      if (this.env >= 1) { this.env = 1; this.stage = 'sustain'; }
    } else if (this.stage === 'release') {
      this.env *= this.releaseMul;
      if (this.env < 0.0001) { this.env = 0; this.stage = 'off'; this.note = -1; return 0; }
    }
    const dt = this.freq / this.sr;
    const t = this.phase;
    let s;
    switch (wave) {
      case 'sine': s = Math.sin(2 * Math.PI * t); break;
      case 'triangle': s = 4 * Math.abs(t - 0.5) - 1; break;
      case 'saw': s = 2 * t - 1 - polyBlep(t, dt); break;
      default: s = (t < 0.5 ? 1 : -1) + polyBlep(t, dt) - polyBlep((t + 0.5) % 1, dt);
    }
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;
    return s * this.env;
  }
}

class Synth {
  constructor(sampleRate) {
    this.voices = Array.from({ length: 8 }, () => new Voice(sampleRate));
    this.counter = 0;
    this.params = { wave: 2, level: -12 };
    this.gain = this.targetGain();
    // Smooth level changes over ~20 ms so dragging the slider doesn't crackle.
    this.smooth = 1 - Math.exp(-1 / (0.02 * sampleRate));
  }
  targetGain() { return Math.pow(10, this.params.level / 20); }
  noteOn(note) {
    // Use a free voice, or steal the oldest one.
    let v = this.voices.find(x => x.stage === 'off');
    if (!v) v = this.voices.reduce((a, b) => (a.age < b.age ? a : b));
    v.start(note, ++this.counter);
  }
  noteOff(note) { for (const v of this.voices) if (v.note === note && v.stage !== 'release') v.stop(); }
  setParam(id, value) { if (id in this.params) this.params[id] = value; }
  render() {
    const wave = WAVES[this.params.wave] || 'saw';
    let sum = 0;
    for (const v of this.voices) sum += v.render(wave);
    this.gain += (this.targetGain() - this.gain) * this.smooth;
    // 0.25 per voice leaves headroom for two notes plus overlapping release
    // tails at full level, so the safety clamp below never has to act.
    const out = sum * 0.25 * this.gain;
    return out > 1 ? 1 : out < -1 ? -1 : out;
  }
}

globalThis.createSynth = sr => new Synth(sr);
