import { createLab } from '../lab/lab.js?v=2';

// Envelope sliders are positions 0-100 on a curved scale; engine.js turns
// them into seconds with the same ranges. Keep TIME_RANGES matched.
const TIME_RANGES = { attack: [0.001, 5], decay: [0.005, 5], release: [0.005, 8] };
const seconds = (id, pos) => {
  const [lo, hi] = TIME_RANGES[id];
  return lo * Math.pow(hi / lo, pos / 100);
};
const timeText = id => pos => {
  const s = seconds(id, pos);
  if (s < 0.1) return `${(s * 1000).toFixed(1).replace(/\.0$/, '')} milliseconds`;
  if (s < 1) return `${Math.round(s * 1000)} milliseconds`;
  return `${s.toFixed(2).replace(/0$/, '')} seconds`;
};
const time = (id, label, def) =>
  ({ id, label, min: 0, max: 100, fine: 1, coarse: 10, default: def, format: timeText(id) });

createLab({
  id: 'synth-lab', // keeps saved spots from earlier versions
  title: 'Synth',
  version: 3,
  engineUrl: new URL('./engine.js?v=3', import.meta.url).href,
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
        { id: 'sustain', label: 'Sustain', min: 0, max: 100, fine: 1, coarse: 10, default: 60, format: v => `${v} percent` },
        time('release', 'Release', 53),
      ],
    },
  ],
});
