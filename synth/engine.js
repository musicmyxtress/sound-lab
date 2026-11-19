// Synth lab sound engine (runs inside an AudioWorklet).
//
// Written one sample at a time on purpose: this is the code that moves to
// C++ when the synth becomes a VST, so it avoids browser-only shortcuts like
// OscillatorNode. Three parts, mirroring a plugin inside a host:
//   Sequencer - stands in for the DAW: sends note on / note off.
//   Voice     - one sounding note: oscillator + a fixed click-free envelope.
//   Synth     - the plugin: owns the voices and the parameters.

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
  allOff() { for (const v of this.voices) v.stop(); }
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

// C major up and back down; each step plays the note and the octave above.
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
const PATTERN = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];

class Sequencer {
  constructor(sampleRate, synth) {
    this.sr = sampleRate;
    this.synth = synth;
    this.playing = false;
    this.tempo = 100;   // steps per minute
    this.length = 80;   // note length, percent of a step
    this.octave = 3;    // C3 = MIDI 48
    this.pos = 0;
    this.sample = 0;
    this.held = [];
  }
  start() { this.playing = true; this.pos = 0; this.sample = 0; }
  stop() { this.playing = false; this.release(); }
  release() { for (const n of this.held) this.synth.noteOff(n); this.held = []; }
  tick() {
    if (!this.playing) return;
    const stepLen = Math.round(this.sr * 60 / this.tempo);
    if (this.sample === 0) {
      const root = 12 * (this.octave + 1) + SCALE[PATTERN[this.pos]];
      this.held = [root, root + 12];
      for (const n of this.held) this.synth.noteOn(n);
    }
    if (this.sample === Math.round(stepLen * this.length / 100)) this.release();
    this.sample++;
    if (this.sample >= stepLen) {
      this.release();
      this.sample = 0;
      this.pos = (this.pos + 1) % PATTERN.length;
    }
  }
}

class SynthLabProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = new Synth(sampleRate);
    this.seq = new Sequencer(sampleRate, this.synth);
    this.port.onmessage = ({ data }) => {
      if (data.type === 'play') this.seq.start();
      else if (data.type === 'stop') this.seq.stop();
      else if (data.type === 'param') {
        if (data.id in this.synth.params) this.synth.params[data.id] = data.value;
        else if (data.id in this.seq) this.seq[data.id] = data.value;
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    for (let i = 0; i < n; i++) {
      this.seq.tick();
      const s = this.synth.render();
      for (const ch of out) ch[i] = s;
    }
    return true;
  }
}

registerProcessor('synth-lab', SynthLabProcessor);
