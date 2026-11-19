// Synth lab sound engine (runs inside an AudioWorklet).
//
// Written one sample at a time on purpose: this is the code that moves to
// C++ when the synth becomes a VST, so it avoids browser-only shortcuts like
// OscillatorNode. Two parts, mirroring a plugin inside a host:
//   Voice - one sounding note: oscillator + ADSR amp envelope.
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

// Envelope times arrive as slider positions 0-100 on a curved scale: each
// step multiplies the time by the same ratio, because ears hear time in
// ratios. synth/synth.js has the same ranges for display; keep them matched.
const TIME_RANGES = { attack: [0.001, 5], decay: [0.005, 5], release: [0.005, 8] };
const posToSeconds = (id, pos) => {
  const [lo, hi] = TIME_RANGES[id];
  return lo * Math.pow(hi / lo, pos / 100);
};

class Voice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.note = -1;
    this.phase = 0;
    this.env = 0;
    this.stage = 'off'; // attack, decay (falls to and holds sustain), release, off
    this.age = 0;
  }
  start(note, age) {
    this.note = note;
    this.freq = 440 * Math.pow(2, (note - 69) / 12);
    this.stage = 'attack';
    this.age = age;
  }
  stop() { if (this.stage !== 'off') this.stage = 'release'; }
  // Attack starts from the current level, so a re-used voice never clicks.
  render(wave, e) {
    if (this.stage === 'off') return 0;
    if (this.stage === 'attack') {
      this.env += e.attackStep;
      if (this.env >= 1) { this.env = 1; this.stage = 'decay'; }
    } else if (this.stage === 'decay') {
      // Curved fall toward sustain; follows a moving sustain slider too.
      this.env += (e.sustain - this.env) * e.decayCoef;
    } else {
      this.env -= this.env * e.releaseCoef;
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
    this.sr = sampleRate;
    this.voices = Array.from({ length: 8 }, () => new Voice(sampleRate));
    this.counter = 0;
    this.params = { wave: 2, level: -12, attack: 19, decay: 63, sustain: 60, release: 53 };
    this.env = {};
    this.updateEnvelope();
    this.gain = this.targetGain();
    // Smooth level changes over ~20 ms so dragging the slider doesn't crackle.
    this.smooth = 1 - Math.exp(-1 / (0.02 * sampleRate));
  }
  targetGain() { return Math.pow(10, this.params.level / 20); }
  // Precompute per-sample envelope steps whenever a slider moves.
  // A decay or release "time" is how long until the level is 1/1000 (-60 dB).
  updateEnvelope() {
    const p = this.params, sr = this.sr;
    const coef = secs => 1 - Math.pow(0.001, 1 / (secs * sr));
    this.env.attackStep = 1 / (posToSeconds('attack', p.attack) * sr);
    this.env.decayCoef = coef(posToSeconds('decay', p.decay));
    this.env.releaseCoef = coef(posToSeconds('release', p.release));
    this.env.sustain = p.sustain / 100;
  }
  noteOn(note) {
    // Use a free voice; otherwise steal the quietest fading voice, so long
    // releases get cut where it's least audible; otherwise the oldest.
    let v = this.voices.find(x => x.stage === 'off');
    if (!v) {
      const fading = this.voices.filter(x => x.stage === 'release');
      v = fading.length
        ? fading.reduce((a, b) => (a.env < b.env ? a : b))
        : this.voices.reduce((a, b) => (a.age < b.age ? a : b));
    }
    v.start(note, ++this.counter);
  }
  noteOff(note) { for (const v of this.voices) if (v.note === note && v.stage !== 'release') v.stop(); }
  setParam(id, value) {
    if (!(id in this.params)) return;
    this.params[id] = value;
    this.updateEnvelope();
  }
  render() {
    const wave = WAVES[this.params.wave] || 'saw';
    let sum = 0;
    for (const v of this.voices) sum += v.render(wave, this.env);
    this.gain += (this.targetGain() - this.gain) * this.smooth;
    // 0.25 per voice leaves headroom for two notes plus some release tails.
    const out = sum * 0.25 * this.gain;
    // Long releases can stack many voices. Above 0.7, round the peaks off
    // smoothly instead of chopping them flat, which would sound harsh.
    const mag = Math.abs(out);
    if (mag <= 0.7) return out;
    return Math.sign(out) * (0.7 + 0.3 * Math.tanh((mag - 0.7) / 0.3));
  }
}

globalThis.createSynth = sr => new Synth(sr);
