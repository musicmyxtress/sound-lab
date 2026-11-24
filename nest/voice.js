// A Tuneling's voice, ported from Tunelings (choir/src/audio/synth.ts) so the
// sketch sounds like the real creatures. Pure maths, no browser audio nodes:
// renderCall() returns samples, nest.js plays them.
//
// Differences from Tunelings: `base` is the pitch in Hz directly (the game
// moves it with diet and mood), and breath, distance and echo are left out.

export const SAMPLE_RATE = 22050;
const TAU = Math.PI * 2;
const CEILING = SAMPLE_RATE * 0.45;

export const TIMBRES = ['hollow', 'breathy', 'bell', 'buzzy', 'whistle', 'wooden', 'glassy', 'nasal'];
export const RHYTHMS = ['single', 'pair', 'triple'];
export const CONTOURS = ['rise', 'fall', 'arch', 'wobble', 'flat'];
export const MELODIES = ['level', 'climb', 'fall', 'zigzag', 'leap'];
export const PHRASINGS = ['even', 'long-short', 'short-long', 'short-short-long', 'long-short-short', 'long-short-long', 'short-long-short'];

const PHRASING_LENGTHS = {
  even: [1],
  'long-short': [1.6, 0.6],
  'short-long': [0.6, 1.6],
  'short-short-long': [0.65, 0.65, 1.8],
  'long-short-short': [1.8, 0.65, 0.65],
  'long-short-long': [1.6, 0.6, 1.6],
  'short-long-short': [0.6, 1.6, 0.6],
};

const MELODY_STEPS = {
  level: [0],
  climb: [0, 2, 4, 7, 9],
  fall: [0, -2, -4, -7, -9],
  zigzag: [0, 4, 0, 4, 0],
  leap: [0, 7, 4, 9, 7],
};

function notes(p) {
  const speed = Math.min(1, Math.max(0, p.speed));
  const stretch = 1.4 - speed * 0.7;
  const pattern = {
    single: [1, 0.6, 0],
    pair: [2, 0.26, 0.09],
    triple: [3, 0.17, 0.07],
    stutter: [5, 0.075, 0.045],
  };
  const [count, len, gap] = pattern[p.rhythm];
  const lengths = PHRASING_LENGTHS[p.phrasing];
  const out = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const length = len * lengths[i % lengths.length] * stretch;
    out.push({ start: at, length });
    at += length + gap * stretch;
  }
  return out;
}

function contourAt(c, x, t, noteLength) {
  const scale = Math.min(3, Math.max(1, 0.25 / noteLength));
  switch (c) {
    case 'rise': return (-2 + x * 4) * scale;
    case 'fall': return (2 - x * 4) * scale;
    case 'arch': return (-1.5 + Math.sin(x * Math.PI) * 4) * scale;
    case 'wobble': return Math.sin(t * TAU * Math.max(7, 1.5 / noteLength)) * 0.7 * Math.min(2, scale);
    default: return 0;
  }
}

function voice(timbre, phase, freq, x, noise, t) {
  const part = ratio => (freq * ratio < CEILING ? Math.sin(ratio * phase) : 0);
  switch (timbre) {
    case 'hollow': return Math.sin(phase) + 0.18 * part(3);
    case 'breathy': return 0.75 * Math.sin(phase) + 0.45 * noise;
    case 'bell': {
      const fade = Math.exp(-x * 5);
      return Math.sin(phase) + 0.5 * fade * part(2.76) + 0.25 * fade * part(5.4);
    }
    case 'buzzy': {
      let s = 0;
      for (let h = 1; h <= 8; h++) s += part(h) / h;
      return s * 0.6;
    }
    case 'whistle': return Math.sin(phase) + 0.04 * part(2) + 0.45 * Math.exp(-t * 30) * noise;
    case 'wooden': {
      const knock = 0.9 * Math.exp(-t * 180) * noise;
      return Math.sin(phase) + 0.35 * Math.exp(-t * 18) * part(4) + 0.15 * Math.exp(-t * 40) * part(10) + knock;
    }
    case 'glassy': {
      const shimmer = 0.5 + 0.5 * Math.sin(TAU * 2.2 * t - Math.PI / 2);
      return Math.sin(phase) * (0.5 + 0.5 * shimmer) + 0.18 * part(2) + 0.14 * (0.2 + shimmer) * part(5.04);
    }
    case 'nasal': {
      let s = 0;
      for (let h = 1; h <= 14; h++) s += part(h);
      return s / 5;
    }
  }
  return Math.sin(phase);
}

// Topology-preserving state-variable filter; stable while the cutoff moves.
function makeFilter(q, band) {
  let ic1 = 0, ic2 = 0;
  const k = 1 / q;
  return (x, hz) => {
    const fc = Math.min(SAMPLE_RATE * 0.45, Math.max(40, hz));
    const g = Math.tan((Math.PI * fc) / SAMPLE_RATE);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return band ? k * v1 : v2;
  };
}

function envelope(timbre, attack, sinceStart, untilEnd, noteLength) {
  if (timbre === 'wooden') attack = 'plain';
  const rise = attack === 'pluck' || timbre === 'wooden' ? 0.002 : attack === 'swell' ? Math.min(0.25, noteLength * 0.45) : 0.012;
  const start = Math.min(1, sinceStart / rise);
  const release = Math.min(1, untilEnd / 0.04);
  const bellDecay = timbre === 'bell' ? Math.exp(-sinceStart * 4) : timbre === 'wooden' ? Math.exp(-sinceStart * 9) : 1;
  const pluckDecay = attack === 'pluck' ? Math.exp(-sinceStart * 10) : 1;
  return start * release * bellDecay * pluckDecay;
}

// A tune to sing instead of the creature's own call: p.notes is a list of
// { semis (from base), length (seconds) }, each followed by a short gap.
function tuneLayout(list) {
  let at = 0;
  return list.map(nt => { const o = { start: at, length: nt.length }; at += nt.length + 0.05; return o; });
}

// p: { base (Hz), speed 0-1, rhythm, timbre, contour, melody, phrasing,
//      brightness 0-1, sweep, attack, harmony, growl, purr, trill, seed }
export function renderCall(p) {
  const ns = p.notes ? tuneLayout(p.notes) : notes(p);
  const last = ns[ns.length - 1];
  const total = last.start + last.length + 0.05;
  const out = new Float32Array(Math.ceil(total * SAMPLE_RATE));

  let n = p.seed || 12345;
  const noise = () => {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    return n / 0x3fffffff - 1;
  };
  let smoothNoise = 0;

  const base = p.base;
  const voices = p.harmony ? [{ ratio: 1, gain: 1 }, { ratio: 1.5, gain: 0.6 }] : [{ ratio: 1, gain: 1 }];
  const tune = MELODY_STEPS[p.melody];
  const sweep = p.sweep || 'still';
  const attack = p.attack || 'plain';
  const filtered = p.brightness < 0.98 || sweep !== 'still';
  const cutoff = base * 0.9 * Math.pow(2, p.brightness * 5.6);
  const rumble = Math.min(1, Math.max(0, Math.log2(600 / base) / Math.log2(600 / 250)));
  const nasalHz = Math.min(2600, Math.max(1000, base * 3));
  const purrSmooth = 1 - Math.exp((-TAU * Math.max(600, base * 2.5)) / SAMPLE_RATE);

  ns.forEach((note, index) => {
    const first = Math.floor(note.start * SAMPLE_RATE);
    const count = Math.floor(note.length * SAMPLE_RATE);
    const step = p.notes ? p.notes[index].semis : tune[index % tune.length];
    for (const v of voices) {
      let phase = 0, subPhase = 0, purrLow = 0;
      const subFreq = (base * v.ratio * Math.pow(2, step / 12)) / 2;
      const filter = makeFilter(0.7, false);
      const sweepFilter = makeFilter(1.6, false);
      const formant = makeFilter(5, true);
      for (let i = 0; i < count; i++) {
        const t = i / SAMPLE_RATE;
        const x = i / count;
        let semis = step + contourAt(p.contour, x, t, note.length);
        if (p.timbre === 'whistle') semis -= 4 * Math.exp(-t / 0.06);
        if (p.trill) semis += 2.5 * (0.5 + 0.5 * Math.tanh(5 * Math.sin(TAU * 13 * t)));
        const freq = base * v.ratio * Math.pow(2, semis / 12);
        phase += (TAU * freq) / SAMPLE_RATE;
        smoothNoise += (noise() - smoothNoise) * 0.25;
        let s = voice(p.timbre, phase, freq, x, smoothNoise, t);
        if (attack === 'pluck' && p.timbre !== 'wooden') {
          const twang = Math.exp(-t * 35);
          s += 0.6 * Math.exp(-t * 300) * smoothNoise
            + twang * ((freq * 2 < CEILING ? 0.45 * Math.sin(2 * phase) : 0) + (freq * 3 < CEILING ? 0.25 * Math.sin(3 * phase) : 0));
        }
        if (p.timbre === 'nasal') s = 0.3 * Math.sin(phase) + 1.6 * formant(s, nasalHz);
        if (p.growl) {
          subPhase += (TAU * subFreq) / SAMPLE_RATE;
          s *= 1 + 0.5 * rumble * Math.sin(phase / 2);
          s += 0.5 * rumble * Math.tanh(3 * Math.sin(subPhase));
          s *= 1 + (0.35 + 0.6 * (1 - rumble)) * smoothNoise;
          s = Math.tanh(2.2 * s) / Math.tanh(2.2);
          const throb = 0.5 + 0.5 * Math.sin(TAU * 27 * t + 0.8 * Math.sin(TAU * 4.3 * t));
          s *= 1 - 0.5 * throb;
        }
        if (p.purr) {
          if (!p.growl) subPhase += (TAU * subFreq) / SAMPLE_RATE;
          purrLow += (s - purrLow) * purrSmooth;
          const roll = 0.5 + 0.5 * Math.sin(TAU * 4 * t - Math.PI / 2);
          const flutter = 0.5 + 0.5 * Math.sin(TAU * 25 * t);
          s = purrLow * (0.55 + 0.45 * roll) * (1 - 0.2 * flutter)
            + 0.3 * rumble * Math.sin(subPhase) + 0.15 * roll * smoothNoise;
        }
        if (sweep !== 'still') {
          const open = sweep === 'opens' ? x : 1 - x;
          const travel = base * Math.pow(2, -2 + 5.6 * open);
          s = sweepFilter(s, Math.min(travel, Math.max(cutoff, base * 1.5)));
        } else if (filtered) {
          s = filter(s, cutoff);
        }
        out[first + i] += v.gain * envelope(p.timbre, attack, t, note.length - t, note.length) * s;
      }
    }
  });

  normalise(out, 0.8);
  return out;
}

export function normalise(out, target) {
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= target / peak;
  return out;
}

// Seeded noise for the non-voice sounds.
function noiseSource(seed) {
  let n = seed;
  return () => {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    return n / 0x3fffffff - 1;
  };
}

// "Pthoo": lips closed, then a burst of air that drops in pitch as it goes.
export function renderSpit() {
  const len = Math.floor(0.32 * SAMPLE_RATE);
  const out = new Float32Array(len);
  const rnd = noiseSource(777);
  const bp = makeFilter(2.5, true);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t / 0.006) * Math.exp(-t * 11);
    const pop = t < 0.012 ? Math.sin(TAU * 140 * t) * (1 - t / 0.012) : 0;
    out[i] = bp(rnd(), 3200 * Math.exp(-t * 6) + 500) * env * 1.6 + pop * 0.6;
  }
  return normalise(out, 0.7);
}

// A huff: a soft, low puff of air through the nose.
export function renderHuff() {
  const len = Math.floor(0.4 * SAMPLE_RATE);
  const out = new Float32Array(len);
  const rnd = noiseSource(4242);
  const lp = makeFilter(0.8, false);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t / 0.03) * Math.exp(-t * 7);
    out[i] = lp(rnd(), 900) * env;
  }
  return normalise(out, 0.55);
}

// An eggshell cracking: a few small, dry clicks, then a bigger break.
export function renderCrack() {
  const len = Math.floor(1.1 * SAMPLE_RATE);
  const out = new Float32Array(len);
  const rnd = noiseSource(99);
  const hits = [[0, 0.4], [0.28, 0.5], [0.5, 0.45], [0.72, 1]];
  for (const [at, vol] of hits) {
    const bp = makeFilter(3, true);
    const first = Math.floor(at * SAMPLE_RATE);
    const count = Math.floor((vol > 0.9 ? 0.25 : 0.05) * SAMPLE_RATE);
    for (let i = 0; i < count && first + i < len; i++) {
      const t = i / SAMPLE_RATE;
      out[first + i] += bp(rnd(), vol > 0.9 ? 2200 : 3800) * Math.exp(-t * (vol > 0.9 ? 18 : 90)) * vol * 2;
    }
  }
  return normalise(out, 0.6);
}
