import { createLab } from '../lab/lab.js?v=5';

// Envelope sliders are positions 0-100 on a curved scale; engine.js turns
// them into seconds with the same ranges. Keep TIME_RANGES matched.
const TIME_RANGES = {
  attack: [0.001, 5], decay: [0.005, 5], release: [0.005, 8],
  fAttack: [0.001, 2], fDecay: [0.005, 4], fRelease: [0.005, 5],
};
const seconds = (id, pos) => {
  const [lo, hi] = TIME_RANGES[id];
  return lo * Math.pow(hi / lo, pos / 100);
};
const timeText = (id, zeroIsNone) => pos => {
  if (zeroIsNone && pos === 0) return 'none';
  const s = seconds(id, pos);
  if (s < 0.1) return `${(s * 1000).toFixed(1).replace(/\.0$/, '')} milliseconds`;
  if (s < 1) return `${Math.round(s * 1000)} milliseconds`;
  return `${s.toFixed(2).replace(/0$/, '')} seconds`;
};
const time = (id, label, def, extra = {}) =>
  ({ id, label, min: 0, max: 100, fine: 1, coarse: 10, default: def, format: timeText(id, extra.zeroIsNone), ...extra });
const percent = (id, label, def, extra = {}) =>
  ({ id, label, min: 0, max: 100, fine: 1, coarse: 10, default: def, format: v => `${v} percent`, ...extra });

// Cutoff is a pitch (MIDI note number), as in Tonic: every step is the same
// musical distance. Spoken in hertz.
const hertz = note => {
  const hz = 440 * Math.pow(2, (note - 69) / 12);
  if (hz < 1000) return `${Math.round(hz)} hertz`;
  return `${(hz / 1000).toFixed(hz < 10000 ? 2 : 1).replace(/\.?0+$/, '')} kilohertz`;
};
const semitones = v => (v === 0 ? '0 semitones' : `${v > 0 ? 'plus' : 'minus'} ${Math.abs(v)} semitone${Math.abs(v) === 1 ? '' : 's'}`);

// Every filter control but Type shows only while the filter is on.
const filterOn = values => values.fType !== 0;
const whenOn = { showIf: filterOn };

createLab({
  id: 'synth-lab', // keeps saved spots from earlier versions
  title: 'Synth',
  version: 5,
  engineUrl: new URL('./engine.js?v=4', import.meta.url).href,
  groups: [
    {
      name: 'Oscillator',
      params: [
        { id: 'wave', label: 'Waveform', choices: ['Sine', 'Triangle', 'Saw', 'Square'], default: 2 },
        { id: 'level', label: 'Level', min: -36, max: 0, fine: 1, coarse: 6, default: -12, format: v => `${v} dB` },
      ],
    },
    {
      name: 'Envelope',
      params: [
        time('attack', 'Attack', 19),
        time('decay', 'Decay', 63),
        percent('sustain', 'Sustain', 60),
        time('release', 'Release', 53),
      ],
    },
    {
      name: 'Filter',
      params: [
        { id: 'fType', label: 'Filter type', choices: ['Off', 'Low-pass', 'High-pass', 'Band-pass'], default: 0 },
        { id: 'fCutoff', label: 'Filter cutoff', min: 16, max: 135, fine: 1, coarse: 6, default: 84, format: hertz, ...whenOn },
        percent('fRes', 'Filter resonance', 0, whenOn),
        { id: 'fEnvAmt', label: 'Filter envelope amount', min: -48, max: 48, fine: 1, coarse: 6, default: 0, format: semitones, ...whenOn },
        time('fAttack', 'Filter attack', 0, { zeroIsNone: true, ...whenOn }),
        time('fDecay', 'Filter decay', 61, whenOn),
        percent('fSustain', 'Filter sustain', 0, whenOn),
        time('fRelease', 'Filter release', 53, whenOn),
        percent('fKeyTrack', 'Filter key tracking', 0, whenOn),
      ],
    },
  ],
});
