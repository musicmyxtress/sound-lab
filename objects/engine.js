// Impossible objects lab sound engine (runs inside an AudioWorklet).
//
// Modal synthesis: a struck or bowed object is a sum of "modes", each a pure
// tone with its own pitch ratio, loudness and fade. Material is mostly how
// fast each mode fades (and how much faster the high ones go), so one slider
// can move from rubber to glass. Because a mode is only a pitch and a fade,
// the impossible controls are cheap: change the pitch while it rings (Size
// drift), change the fades while it rings (Melt), or let the upper modes'
// fades go below zero so they grow (Swell).
//
// Each mode is a decaying complex phasor rotated once per sample (z = z*c + F),
// so pitch is exact. Its real part behaves like the surface's velocity at
// that mode, which is what a bow reads and what a pickup hears.
//
// Written one sample at a time with no browser audio nodes, so it ports to
// C++ for a plugin. noteOn/noteOff/setParam/render is the VST contract the
// shared scale player (lab/player.js) drives.

// --- Objects: mode pitch ratios and strengths (Fletcher & Rossing, rounded) ---
// `ratios` are the raw object (Overtone tuning "wild"); `tuned` are where
// Overtone tuning "in tune" puts each mode: whole multiples of the note, so
// chords don't clash. The bar's tuned set is a marimba's (1, 4, 10); the bell
// keeps its hum an octave down; the glass keeps its twins, now a gentle chorus.
// `note` is the mode that sounds the note itself (the bow locks onto it).
const harmonics = n => Array.from({ length: n }, (_, i) => i + 1);
const OBJECTS = [
  null, // index 0 is "None" for the second object
  { name: 'string', ratios: harmonics(16), tuned: harmonics(16), note: 0,
    strengths: Array.from({ length: 16 }, (_, i) => 1 / (i + 1)) },
  { name: 'bar', ratios: [1, 2.756, 5.404, 8.933, 13.344, 18.638, 24.81, 31.87],
    tuned: [1, 4, 10, 16, 20, 24, 32, 40], note: 0,
    strengths: [1, 0.6, 0.42, 0.3, 0.22, 0.16, 0.12, 0.09] },
  { name: 'bell', ratios: [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433, 6.796, 8.215],
    tuned: [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16], note: 1,
    strengths: [0.6, 0.8, 0.7, 0.4, 1, 0.5, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15] },
  { name: 'plate', ratios: [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16, 3.5, 3.6, 4.06, 4.15, 4.64, 5, 5.27],
    tuned: harmonics(14), note: 0,
    strengths: [1, 0.8, 0.7, 0.65, 0.55, 0.5, 0.45, 0.4, 0.38, 0.33, 0.3, 0.27, 0.24, 0.2] },
  // Glass: near-twin modes beat against each other, the shimmer of a wine glass.
  { name: 'glass bowl', ratios: [1, 1.003, 2.32, 2.326, 4.25, 4.262, 6.63, 9.38],
    tuned: [1, 1.003, 2, 2.006, 4, 4.012, 6, 8], note: 0,
    strengths: [1, 0.8, 0.5, 0.4, 0.3, 0.25, 0.2, 0.1] },
];
const MAX_MODES = 16;

// --- Materials, rubber to glass. t60: seconds the fundamental takes to fall
// 60 dB at middle C. tilt: a mode at r times the pitch fades r^tilt faster.
// objects.js has the same names for the slider's words; keep them matched.
const MATERIALS = [
  { t60: 0.06, tilt: 2.5 },  // rubber
  { t60: 0.15, tilt: 2.0 },  // clay
  { t60: 0.35, tilt: 1.6 },  // soft wood
  { t60: 0.8, tilt: 1.2 },   // hard wood
  { t60: 1.3, tilt: 1.0 },   // bone
  { t60: 3.0, tilt: 0.6 },   // bronze
  { t60: 4.5, tilt: 0.45 },  // steel
  { t60: 7.0, tilt: 0.3 },   // glass
];
function material(m) { // m 0..1; log-interpolated between neighbours
  const x = Math.min(Math.max(m, 0), 1) * (MATERIALS.length - 1);
  const i = Math.min(Math.floor(x), MATERIALS.length - 2), f = x - i;
  const a = MATERIALS[i], b = MATERIALS[i + 1];
  return { t60: a.t60 * Math.pow(b.t60 / a.t60, f), tilt: a.tilt + (b.tilt - a.tilt) * f };
}

// Curved time slider, 0-100 → seconds. objects.js has the same range.
const CHANGE_RANGE = [0.05, 5];
const changeSeconds = pos => CHANGE_RANGE[0] * Math.pow(CHANGE_RANGE[1] / CHANGE_RANGE[0], pos / 100);

// How hard the bow grips. 0.5 gripped so hard that each grab-and-slip took
// longer than the object's own vibration: bowed notes came out 1 to 8
// semitones flat. At 0.03 the object leads and every bowed note is in tune
// (measured in Node across all five objects).
const BOW_GRIP = 0.03;
const UPDATE = 32;       // recompute mode pitches and fades every 32 samples
const MODE_CAP = 1.2;    // a mode never grows past this (keeps Swell and coupling safe)
const CAP2 = MODE_CAP * MODE_CAP;

// One object: up to 16 modes, with their phasors and current coefficients.
class Body {
  constructor() {
    this.zr = new Float64Array(MAX_MODES); this.zi = new Float64Array(MAX_MODES);
    this.cr = new Float64Array(MAX_MODES); this.ci = new Float64Array(MAX_MODES);
    this.w = new Float64Array(MAX_MODES);   // weight at the strike/bow/pickup point
    this.ratio = new Float64Array(MAX_MODES);
    this.n = 0;
  }
  clear() { this.zr.fill(0); this.zi.fill(0); }
  // Choose the object; weights follow the strike position (a comb, as on a
  // string: striking at a node leaves that mode silent) and are normalised so
  // every object comes out about equally loud.
  shape(obj, tuning, stiffness, position, f0, sr) {
    if (!obj) { this.n = 0; return; }
    this.n = Math.min(obj.ratios.length, MAX_MODES);
    this.noteMode = obj.note;
    let sum = 0;
    for (let k = 0; k < this.n; k++) {
      // Stiffness bends the ratios: above 0 stretches the overtones apart,
      // below 0 squeezes them together (no real object does that).
      // Tuning blends wild to tuned by multiplying, so it sweeps evenly by ear.
      const blended = obj.ratios[k] * Math.pow(obj.tuned[k] / obj.ratios[k], tuning);
      const r = Math.pow(blended, 1 + stiffness);
      this.ratio[k] = r;
      const comb = 0.15 + 0.85 * Math.abs(Math.sin(Math.PI * (k + 1) * position));
      let w = obj.strengths[k] * comb;
      if (f0 * r > 0.45 * sr) w = 0; // above what this sample rate can hold
      this.w[k] = w;
      sum += w * w;
    }
    const norm = sum > 0 ? 1 / Math.sqrt(sum) : 0;
    for (let k = 0; k < this.n; k++) this.w[k] *= norm;
  }
  // Pitches and fades for this moment. sigma is nepers per second.
  coefs(f0, mat, swell, extraSigma, sr) {
    const noteFactor = Math.pow(261.6 / f0, 0.4); // low notes ring longer
    for (let k = 0; k < this.n; k++) {
      const f = f0 * this.ratio[k];
      if (f > 0.45 * sr || f < 10) { this.cr[k] = 0; this.ci[k] = 0; continue; }
      const t60 = Math.max(mat.t60 * noteFactor / Math.pow(this.ratio[k], mat.tilt), 0.004);
      // Swell grows the upper modes (more the higher they are): fades below zero.
      const grow = swell * 25 * (k / Math.max(this.n - 1, 1));
      const sigma = 6.91 / t60 - grow + extraSigma;
      const r = Math.exp(-sigma / sr), wv = 2 * Math.PI * f / sr;
      this.cr[k] = r * Math.cos(wv); this.ci[k] = r * Math.sin(wv);
    }
  }
  // One sample: push force F in, return the velocity at the pickup point.
  step(F) {
    let out = 0;
    const { zr, zi, cr, ci, w } = this;
    for (let k = 0; k < this.n; k++) {
      const a = zr[k], b = zi[k];
      let nr = a * cr[k] - b * ci[k] + w[k] * F;
      let ni = a * ci[k] + b * cr[k];
      const m2 = nr * nr + ni * ni;
      if (m2 > CAP2) { const s = MODE_CAP / Math.sqrt(m2); nr *= s; ni *= s; }
      zr[k] = nr; zi[k] = ni;
      out += w[k] * nr;
    }
    return out;
  }
  energy() {
    let e = 0;
    for (let k = 0; k < this.n; k++) e = Math.max(e, this.zr[k] * this.zr[k] + this.zi[k] * this.zi[k]);
    return e;
  }
}

// STK's bow friction curve: grips hard when bow and surface move together,
// lets go as they slip apart. Pressure makes the grip sharper.
function bowFriction(dv, pressure) {
  const slope = 5 - 4 * pressure;
  return Math.min(Math.pow(Math.abs(dv * slope) + 0.75, -4), 1);
}

class Voice {
  constructor(sr) {
    this.sr = sr;
    this.a = new Body(); this.b = new Body();
    this.note = -1; this.active = false; this.held = false; this.age = 0;
    this.t = 0; this.count = 0;
    this.contact = 0; this.contactLen = 1;
    this.bowEnv = 0; this.lastA = 0; this.lastB = 0;
  }
  start(note, age, P) {
    if (!this.active) { this.a.clear(); this.b.clear(); this.lastA = this.lastB = 0; }
    this.note = note; this.age = age;
    this.f0 = 440 * Math.pow(2, (note - 69) / 12);
    this.active = true; this.held = true; this.t = 0; this.count = 0;
    this.contactLen = Math.max(1, Math.round(P.contactSec * this.sr));
    this.contact = P.bow ? 0 : this.contactLen;
    this.reshape(P);
  }
  reshape(P) {
    this.a.shape(P.objA, P.tuning, P.stiffness, P.position, this.f0, this.sr);
    this.fB = this.f0 * P.tuneB;
    this.b.shape(P.objB, P.tuning, P.stiffness, P.position, this.fB, this.sr);
    this.count = 0;
  }
  stop() { this.held = false; }
  render(P) {
    if (!this.active) return 0;
    const sr = this.sr;
    if (this.count++ % UPDATE === 0) {
      // Size drift and Melt both glide from the strike toward their target.
      const g = 1 - Math.exp(-this.t / (P.changeSec * sr));
      const size = Math.pow(2, P.drift * g / 12);
      const mat = material(P.material + P.melt * g);
      const swell = this.held ? P.swell : 0; // letting go ends the growth
      const damp = this.held ? 0 : P.damperSigma;
      this.a.coefs(this.f0 * size, mat, swell, damp, sr);
      this.b.coefs(this.fB * size, mat, swell, damp, sr);
      if (!this.held && this.contact === 0 && this.bowEnv === 0 &&
          this.a.energy() < 1e-10 && this.b.energy() < 1e-10) {
        this.active = false; this.note = -1; return 0;
      }
    }
    this.t++;
    let F = 0;
    if (P.bow) {
      // The bow speeds up over 60 ms and stops over 30 ms when the key lifts.
      const target = this.held ? 1 : 0;
      const rate = this.held ? 1 / (0.06 * sr) : 1 / (0.03 * sr);
      this.bowEnv = target > this.bowEnv ? Math.min(this.bowEnv + rate, 1) : Math.max(this.bowEnv - rate, 0);
      if (this.bowEnv > 0) {
        // The bow feels only the note's own mode. Feeling every mode let
        // several compete for the grip, and a bell or bar could start on the
        // note and switch to another partway through (Blake heard it).
        // Its push still reaches every mode, so they colour the sound.
        const k = this.a.noteMode;
        const v = this.a.w[k] * this.a.zr[k];
        const dv = P.bowSpeed * this.bowEnv - v;
        F = dv * bowFriction(dv, P.pressure) * BOW_GRIP;
      }
    } else if (this.contact > 0) {
      // A raised-cosine push: short for a hard mallet (bright), long for soft (dull).
      const n = this.contactLen - this.contact;
      F = 0.6 * (1 - Math.cos(2 * Math.PI * (n + 0.5) / this.contactLen)) / this.contactLen;
      this.contact--;
    }
    // The second object is shaken by the first and pushes back against it
    // (opposite sign), as a real join loads what drives it. Pushing back the
    // same way made a loop that grew until the limiter and never ended.
    const inA = F - P.couple * 0.5 * this.lastB;
    const inB = P.couple * this.lastA;
    this.lastA = this.a.step(inA);
    this.lastB = this.b.n ? this.b.step(inB) : 0;
    return this.lastA + this.lastB;
  }
}

class Synth {
  constructor(sr) {
    this.sr = sr;
    this.voices = Array.from({ length: 16 }, () => new Voice(sr));
    this.counter = 0;
    this.params = {
      exciter: 0, object: 1, tuning: 100, material: 70, stiffness: 0, hardness: 60, position: 22,
      pressure: 50, bowSpeed: 50, damper: 20,
      drift: 0, change: 50, melt: 0, swell: 0,
      second: 0, tuneB: 7, couple: 30, level: -12,
    };
    this.P = {};
    this.update();
    this.gain = this.targetGain();
    this.smooth = 1 - Math.exp(-1 / (0.02 * sr));
  }
  targetGain() { return Math.pow(10, this.params.level / 20); }
  update() {
    const p = this.params, P = this.P;
    P.bow = p.exciter === 1;
    P.objA = OBJECTS[p.object + 1];
    P.objB = OBJECTS[p.second];
    P.material = p.material / 100;
    P.stiffness = p.stiffness / 100;
    P.tuning = p.tuning / 100;
    P.position = 0.03 + 0.47 * (p.position / 100);
    // Hardness: 6 ms felt down to 0.1 ms steel.
    P.contactSec = 0.006 * Math.pow(0.1 / 6, p.hardness / 100);
    P.pressure = p.pressure / 100;
    P.bowSpeed = 0.1 + 0.2 * (p.bowSpeed / 100);
    // Damper: how hard letting go of the key stops the ring; 100% stops it in 50 ms.
    P.damperSigma = Math.pow(p.damper / 100, 2) * 6.91 / 0.05;
    P.drift = p.drift;
    P.changeSec = changeSeconds(p.change);
    P.melt = p.melt / 100;
    P.swell = p.swell / 100;
    P.tuneB = Math.pow(2, p.tuneB / 12);
    // Coupling is tiny on purpose: a mode driven at its own pitch builds up
    // thousands of times over (its ring time in samples).
    P.couple = p.second ? 0.004 * Math.pow(p.couple / 100, 2) : 0;
  }
  noteOn(note) {
    let v = this.voices.find(x => !x.active);
    if (!v) {
      const free = this.voices.filter(x => !x.held);
      const pool = free.length ? free : this.voices;
      v = pool.reduce((a, b) => (a.age < b.age ? a : b));
    }
    v.start(note, ++this.counter, this.P);
  }
  noteOff(note) { for (const v of this.voices) if (v.note === note && v.held) v.stop(); }
  setParam(id, value) {
    if (!(id in this.params)) return;
    this.params[id] = value;
    this.update();
    // Object, stiffness, position and second object change the mode layout.
    if (['object', 'tuning', 'stiffness', 'position', 'second', 'tuneB'].includes(id)) {
      for (const v of this.voices) if (v.active) v.reshape(this.P);
    }
  }
  render() {
    let sum = 0;
    for (const v of this.voices) if (v.active) sum += v.render(this.P);
    this.gain += (this.targetGain() - this.gain) * this.smooth;
    const out = sum * 1.6 * this.gain;
    const mag = Math.abs(out);
    if (!(mag <= 0.7)) {
      if (mag !== mag) { for (const v of this.voices) { v.active = false; v.a.clear(); v.b.clear(); } return 0; }
      return Math.sign(out) * (0.7 + 0.3 * Math.tanh((mag - 0.7) / 0.3));
    }
    return out;
  }
}

globalThis.createSynth = sr => new Synth(sr);
