import { createLab } from '../lab/lab.js?v=5';

// Echo time is a position 0-100 on a curved scale (each step multiplies the
// time by the same ratio). engine.js has the same range; keep them matched.
const TIME_MIN = 0.01, TIME_MAX = 2;
const timeText = pos => {
  const s = TIME_MIN * Math.pow(TIME_MAX / TIME_MIN, pos / 100);
  return s < 1 ? `${Math.round(s * 1000)} milliseconds` : `${s.toFixed(2).replace(/0$/, '')} seconds`;
};
const percent = (id, label, def) =>
  ({ id, label, min: 0, max: 100, fine: 1, coarse: 10, default: def, format: v => `${v} percent` });
// Filters are set as notes, as in Tonic, so every step is the same musical
// distance; spoken in hertz.
const hertz = note => {
  const hz = 440 * Math.pow(2, (note - 69) / 12);
  if (hz < 1000) return `${Math.round(hz)} hertz`;
  return `${(hz / 1000).toFixed(hz < 10000 ? 2 : 1).replace(/\.?0+$/, '')} kilohertz`;
};

createLab({
  id: 'echo-lab',
  title: 'Echo',
  version: 1,
  engineUrl: new URL('./engine.js?v=1', import.meta.url).href,
  groups: [
    {
      name: 'Echo',
      params: [
        { id: 'time', label: 'Echo time', min: 0, max: 100, fine: 1, coarse: 10, default: 68, format: timeText },
        percent('feedback', 'Repeats', 45),
        percent('mix', 'Mix', 35),
      ],
    },
    {
      name: 'Colour',
      params: [
        { id: 'tone', label: 'Tone', min: 60, max: 135, fine: 1, coarse: 6, default: 108, format: hertz },
        { id: 'lowCut', label: 'Low cut', min: 16, max: 100, fine: 1, coarse: 6, default: 51, format: hertz },
        percent('drive', 'Saturation', 20),
      ],
    },
    {
      name: 'Wobble',
      params: [
        percent('wobble', 'Wobble depth', 15),
        { id: 'wobbleRate', label: 'Wobble speed', min: 1, max: 80, fine: 1, coarse: 10, default: 8, format: v => `${(v / 10).toFixed(1)} hertz` },
      ],
    },
    {
      name: 'Test sound (not part of the plugin)',
      params: [
        { id: 'source', label: 'Test sound', choices: ['Pluck', 'Bell', 'Soft keys'], default: 0 },
        { id: 'level', label: 'Test sound level', min: -36, max: 0, fine: 1, coarse: 6, default: -12, format: v => `${v} dB` },
      ],
    },
  ],
});
