// Shared scale player (runs inside an AudioWorklet). Identical for every lab:
// it stands in for the DAW, so only the synth changes between projects.
//
// Each lab's engine.js must set globalThis.createSynth = sampleRate => synth,
// where synth has: noteOn(note), noteOff(note), setParam(id, value), render().
// That is the same contract a VST has with its host.

// C major up and back down; each step plays the note and the octave above,
// so two voices always sound and release tails overlap (tests polyphony).
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
const PATTERN = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];

class ScalePlayer {
  constructor(sr, synth) {
    this.sr = sr;
    this.synth = synth;
    this.playing = false;
    this.settings = { tempo: 100, length: 80, octave: 3 };
    this.pos = 0;
    this.sample = 0;
    this.held = [];
  }
  start() { this.playing = true; this.pos = 0; this.sample = 0; }
  stop() { this.playing = false; this.release(); }
  release() { for (const n of this.held) this.synth.noteOff(n); this.held = []; }
  tick() {
    if (!this.playing) return;
    const { tempo, length, octave } = this.settings;
    const stepLen = Math.round(this.sr * 60 / tempo);
    if (this.sample === 0) {
      const root = 12 * (octave + 1) + SCALE[PATTERN[this.pos]];
      this.held = [root, root + 12];
      for (const n of this.held) this.synth.noteOn(n);
    }
    if (this.sample === Math.round(stepLen * length / 100)) this.release();
    this.sample++;
    if (this.sample >= stepLen) {
      this.release();
      this.sample = 0;
      this.pos = (this.pos + 1) % PATTERN.length;
    }
  }
}

class SoundLabProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.synth = globalThis.createSynth(sampleRate);
    this.player = new ScalePlayer(sampleRate, this.synth);
    this.port.onmessage = ({ data }) => {
      if (data.type === 'play') this.player.start();
      else if (data.type === 'stop') this.player.stop();
      else if (data.type === 'player') this.player.settings[data.id] = data.value;
      else if (data.type === 'param') this.synth.setParam(data.id, data.value);
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    for (let i = 0; i < n; i++) {
      this.player.tick();
      const s = this.synth.render();
      for (const ch of out) ch[i] = s;
    }
    return true;
  }
}

registerProcessor('sound-lab', SoundLabProcessor);
