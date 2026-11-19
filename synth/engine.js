// Synth lab sound engine (runs inside an AudioWorklet).
//
// Written one sample at a time on purpose: this is the code that moves to
// C++ when the synth becomes a VST, so it avoids browser-only shortcuts like
// OscillatorNode. Parts, mirroring a plugin inside a host:
//   Voice  - one sounding note: oscillator, ADSR amp envelope, filter.
//   Filter - one voice's filter with its own envelope (Tonic's VoiceFilter).
//   Synth  - the plugin: owns the voices and the parameters.
// The shared scale player (lab/player.js) plays the DAW's part and calls
// noteOn, noteOff, setParam and render - the same contract a VST has.

const WAVES = ['sine', 'triangle', 'saw', 'square'];
const FILTER_MODES = ['off', 'lowpass', 'highpass', 'bandpass'];

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
const TIME_RANGES = {
  attack: [0.001, 5], decay: [0.005, 5], release: [0.005, 8],
  fAttack: [0.001, 2], fDecay: [0.005, 4], fRelease: [0.005, 5],
};
const posToSeconds = (id, pos) => {
  const [lo, hi] = TIME_RANGES[id];
  return lo * Math.pow(hi / lo, pos / 100);
};
const noteToHz = note => 440 * Math.pow(2, (note - 69) / 12);

// One voice's filter, the same design as Tonic's VoiceFilter: a state-variable
// filter in Andrew Simper's "topology-preserving" form, which stays stable and
// click-free while an envelope sweeps its cutoff (a plain biquad can blow up or
// zipper). Low-, high- and band-pass come out of one structure, 12 dB/octave.
// Its envelope is straight lines in semitones, as Tonic's is.
const UPDATE_INTERVAL = 16; // recompute the cutoff every 16 samples, as Tonic does

class Filter {
  constructor(sampleRate) { this.sr = sampleRate; this.reset(); this.mode = 'off'; }
  reset() { this.ic1 = 0; this.ic2 = 0; this.count = 0; }
  start(note, fresh) {
    this.note = note;
    this.env = 0;
    this.stage = 'attack';
    this.count = 0;
    if (fresh) { this.ic1 = 0; this.ic2 = 0; }
  }
  release() {
    if (this.stage === 'release') return;
    this.releaseFrom = this.env;
    this.stage = 'release';
  }
  stepEnvelope(f) {
    if (this.stage === 'attack') {
      this.env = f.attackFrames < 1 ? 1 : this.env + 1 / f.attackFrames;
      if (this.env >= 1) { this.env = 1; this.stage = 'decay'; }
    } else if (this.stage === 'decay') {
      this.env -= f.decayFrames < 1 ? 1 : (1 - f.sustain) / f.decayFrames;
      if (this.env <= f.sustain) { this.env = f.sustain; this.stage = 'sustain'; }
    } else if (this.stage === 'sustain') {
      this.env = f.sustain; // follows the slider while held
    } else {
      this.env = Math.max(this.env - this.releaseFrom / f.releaseFrames, 0);
    }
  }
  process(x, f) {
    if (f.mode === 'off') { this.mode = 'off'; return x; }
    // Coming on mid-note: start from silence, not whatever it last held.
    if (this.mode === 'off') { this.ic1 = 0; this.ic2 = 0; this.count = 0; }
    this.mode = f.mode;
    this.stepEnvelope(f);
    if (this.count++ % UPDATE_INTERVAL === 0) {
      const cutNote = f.cutoff + f.keyTracking * (this.note - 60) + f.envAmount * this.env;
      const hz = Math.min(Math.max(noteToHz(cutNote), 20), this.sr * 0.45);
      const g = Math.tan(Math.PI * hz / this.sr);
      this.a1 = 1 / (1 + g * (g + f.k));
      this.a2 = g * this.a1;
      this.a3 = g * this.a2;
    }
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (f.mode === 'lowpass') return v2;
    if (f.mode === 'highpass') return x - f.k * v1 - v2;
    return f.k * v1; // band-pass, scaled so its peak stays level at any resonance
  }
}

class Voice {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.note = -1;
    this.phase = 0;
    this.env = 0;
    this.stage = 'off'; // attack, decay (falls to and holds sustain), release, off
    this.age = 0;
    this.filter = new Filter(sampleRate);
  }
  start(note, age) {
    // A silent voice starts its filter afresh; a stolen one keeps the
    // filter's memory, so cutting a sounding note doesn't click.
    this.filter.start(note, this.stage === 'off');
    this.note = note;
    this.freq = 440 * Math.pow(2, (note - 69) / 12);
    this.stage = 'attack';
    this.age = age;
  }
  stop() {
    if (this.stage === 'off') return;
    this.stage = 'release';
    this.filter.release();
  }
  // Attack starts from the current level, so a re-used voice never clicks.
  render(wave, e, f) {
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
    // After the amp envelope, as in Tonic's synth voice.
    return this.filter.process(s * this.env, f);
  }
}

class Synth {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.voices = Array.from({ length: 8 }, () => new Voice(sampleRate));
    this.counter = 0;
    this.params = {
      wave: 2, level: -12, attack: 19, decay: 63, sustain: 60, release: 53,
      // Filter defaults are Tonic's, except the cutoff it opens at.
      fType: 0, fCutoff: 84, fRes: 0, fEnvAmt: 0,
      fAttack: 0, fDecay: 61, fSustain: 0, fRelease: 53, fKeyTrack: 0,
    };
    this.env = {};
    this.filt = {};
    this.update();
    this.gain = this.targetGain();
    // Smooth level changes over ~20 ms so dragging the slider doesn't crackle.
    this.smooth = 1 - Math.exp(-1 / (0.02 * sampleRate));
  }
  targetGain() { return Math.pow(10, this.params.level / 20); }
  // Precompute per-sample steps whenever a slider moves.
  // An amp decay or release "time" is how long until the level is 1/1000.
  update() {
    const p = this.params, sr = this.sr;
    const coef = secs => 1 - Math.pow(0.001, 1 / (secs * sr));
    this.env.attackStep = 1 / (posToSeconds('attack', p.attack) * sr);
    this.env.decayCoef = coef(posToSeconds('decay', p.decay));
    this.env.releaseCoef = coef(posToSeconds('release', p.release));
    this.env.sustain = p.sustain / 100;
    const f = this.filt;
    f.mode = FILTER_MODES[p.fType] || 'off';
    f.cutoff = p.fCutoff;
    // Resonance 0 gives k = 2, a gentle corner; full stops just short of
    // ringing on its own (Tonic's numbers).
    f.k = 2 - 1.96 * (p.fRes / 100);
    f.envAmount = p.fEnvAmt;
    // Filter attack's lowest slider position is no attack at all, as in Tonic.
    f.attackFrames = p.fAttack === 0 ? 0 : posToSeconds('fAttack', p.fAttack) * sr;
    f.decayFrames = posToSeconds('fDecay', p.fDecay) * sr;
    f.sustain = p.fSustain / 100;
    f.releaseFrames = Math.max(posToSeconds('fRelease', p.fRelease) * sr, 1);
    f.keyTracking = p.fKeyTrack / 100;
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
    this.update();
  }
  render() {
    const wave = WAVES[this.params.wave] || 'saw';
    let sum = 0;
    for (const v of this.voices) sum += v.render(wave, this.env, this.filt);
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
