// Echo lab sound engine (runs inside an AudioWorklet).
//
// Only the Echo class is the plugin. The Source class is a stand-in for
// whatever is on the track (the scale player has no audio of its own), so
// there is something short and plucky to hear the echoes of.
//
// Written one sample at a time with no browser audio nodes, so the Echo class
// ports straight to C++ for the VST. The lab contract is the same as every
// lab: noteOn, noteOff, setParam, render.

// ---------- Source: a few simple sounds to echo ----------

const noteToHz = note => 440 * Math.pow(2, (note - 69) / 12);

// PolyBLEP softens the saw's jump so high notes don't whistle (aliasing).
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

class Voice {
  constructor(sr, note, kind) {
    this.sr = sr; this.note = note; this.kind = kind;
    this.hz = noteToHz(note);
    this.phase = 0; this.mphase = 0; this.lp = 0;
    this.t = 0; this.amp = 1; this.released = false; this.done = false;
    // How fast each sound fades while held, and after the key is let go.
    const decay = [0.35, 1.6, 0.9][kind];
    const rel = [0.08, 0.5, 0.15][kind];
    this.holdMul = Math.exp(-1 / (decay * sr));
    this.relMul = Math.exp(-1 / (rel * sr));
  }
  release() { this.released = true; }
  render() {
    const sr = this.sr, dt = this.hz / sr;
    this.amp *= this.released ? this.relMul : this.holdMul;
    const attack = Math.min(this.t++ / (0.002 * sr), 1); // 2 ms, no click
    let s;
    if (this.kind === 0) {
      // Pluck: a saw whose brightness falls fast, like a plucked string.
      let saw = 2 * this.phase - 1 - polyBlep(this.phase, dt);
      const bright = 0.02 + 0.6 * this.amp * this.amp;
      this.lp += bright * (saw - this.lp);
      s = this.lp;
    } else if (this.kind === 1) {
      // Bell: FM with an inharmonic 3.5x modulator; the clang fades first.
      const index = 2.5 * this.amp;
      this.mphase = (this.mphase + dt * 3.5) % 1;
      s = Math.sin(2 * Math.PI * this.phase + index * Math.sin(2 * Math.PI * this.mphase));
    } else {
      // Soft keys: a sine with a little second harmonic.
      s = Math.sin(2 * Math.PI * this.phase) + 0.25 * Math.sin(4 * Math.PI * this.phase);
    }
    this.phase = (this.phase + dt) % 1;
    if (this.amp < 1e-4) this.done = true;
    return s * this.amp * attack;
  }
}

// ---------- Echo: the plugin ----------

const MAX_SECONDS = 2.5;
const TIME_MIN = 0.01, TIME_MAX = 2; // keep matched with echo.js
const posToSeconds = pos => TIME_MIN * Math.pow(TIME_MAX / TIME_MIN, pos / 100);

class Echo {
  constructor(sr) {
    this.sr = sr;
    this.size = Math.ceil(MAX_SECONDS * sr) + 4;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.time = 0.375 * sr;     // where the delay is now, in samples
    this.target = this.time;    // where the slider wants it
    this.lpState = 0; this.hpState = 0; this.hpIn = 0;
    this.wobPhase = 0; this.wobPhase2 = 0;
    this.feedback = 0.45; this.mix = 0.35;
    this.lpCoef = 1; this.hpCoef = 0;
    this.wobDepth = 0; this.wobRate = 0.8;
    this.drive = 1;
  }
  // Four-point (Hermite) read between samples, so gliding time stays smooth.
  read(delay) {
    let pos = this.w - delay;
    while (pos < 0) pos += this.size;
    const i = Math.floor(pos), f = pos - i, n = this.size, b = this.buf;
    const xm1 = b[(i - 1 + n) % n], x0 = b[i % n], x1 = b[(i + 1) % n], x2 = b[(i + 2) % n];
    const c = (x1 - xm1) * 0.5, v = x0 - x1, w = c + v, a = w + v + (x2 - x0) * 0.5;
    return ((a * f - w - a) * f + c) * f + x0;
  }
  process(x) {
    const sr = this.sr;
    // Glide toward the new time: moving the slider bends the echoes' pitch,
    // like a tape machine changing speed. About a quarter second to settle.
    this.time += (this.target - this.time) * (1 / (0.08 * sr));
    // Wobble: two slow wavers not in step, so it drifts like worn tape.
    this.wobPhase = (this.wobPhase + this.wobRate / sr) % 1;
    this.wobPhase2 = (this.wobPhase2 + this.wobRate * 0.37 / sr) % 1;
    const wob = this.wobDepth * (0.7 * Math.sin(2 * Math.PI * this.wobPhase) +
      0.3 * Math.sin(2 * Math.PI * this.wobPhase2));
    const delay = Math.min(Math.max(this.time + wob, 2), this.size - 4);
    let wet = this.read(delay);
    // Tone (low-pass) and low cut (high-pass) inside the loop, so each repeat
    // is darker and thinner than the one before.
    this.lpState += this.lpCoef * (wet - this.lpState);
    wet = this.lpState;
    this.hpState = this.hpCoef * (this.hpState + wet - this.hpIn);
    this.hpIn = wet;
    wet = this.hpState;
    // Saturation: tanh rounds off loud repeats. Even at drive 0 it is there,
    // so 100% feedback builds up but can never run away.
    const fb = Math.tanh(wet * this.drive) / this.drive;
    this.buf[this.w] = x + fb * this.feedback;
    this.w = (this.w + 1) % this.size;
    // Mix: at 50% both are full; above, the dry fades; below, the wet fades.
    const dryGain = this.mix <= 0.5 ? 1 : (1 - this.mix) * 2;
    const wetGain = this.mix >= 0.5 ? 1 : this.mix * 2;
    // Safety ceiling: untouched below 0.8, then eased so it never passes 1.
    // Only extreme settings (full repeats on the bell) ever reach it.
    const y = x * dryGain + wet * wetGain, m = Math.abs(y);
    return m < 0.8 ? y : Math.sign(y) * (0.8 + 0.2 * Math.tanh((m - 0.8) / 0.2));
  }
  setParam(id, v) {
    const sr = this.sr;
    if (id === 'time') this.target = posToSeconds(v) * sr;
    else if (id === 'feedback') this.feedback = v / 100;
    else if (id === 'mix') this.mix = v / 100;
    else if (id === 'tone') this.lpCoef = 1 - Math.exp(-2 * Math.PI * Math.min(noteToHz(v), sr * 0.45) / sr);
    else if (id === 'lowCut') this.hpCoef = Math.exp(-2 * Math.PI * noteToHz(v) / sr);
    else if (id === 'wobble') this.wobDepth = (v / 100) * 0.006 * sr; // up to 6 ms
    else if (id === 'wobbleRate') this.wobRate = v / 10;
    else if (id === 'drive') this.drive = 1 + (v / 100) * 5;
  }
}

// ---------- The lab synth: source into echo ----------

class EchoLab {
  constructor(sr) {
    this.sr = sr; this.voices = []; this.kind = 0; this.gain = 0.25;
    this.echo = new Echo(sr);
  }
  noteOn(note) {
    if (this.voices.length > 24) this.voices.shift();
    this.voices.push(new Voice(this.sr, note, this.kind));
  }
  noteOff(note) { for (const v of this.voices) if (v.note === note) v.release(); }
  setParam(id, v) {
    if (id === 'source') this.kind = v;
    else if (id === 'level') this.gain = Math.pow(10, v / 20);
    else this.echo.setParam(id, v);
  }
  render() {
    let s = 0;
    for (const v of this.voices) s += v.render();
    if (this.voices.some(v => v.done)) this.voices = this.voices.filter(v => !v.done);
    return this.echo.process(s * this.gain);
  }
}

globalThis.createSynth = sampleRate => new EchoLab(sampleRate);
