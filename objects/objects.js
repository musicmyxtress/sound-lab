import { createLab } from '../lab/lab.js?v=5';

// Material names along the slider, rubber to glass. engine.js has the same
// eight materials in the same order; keep them matched.
const MATERIALS = ['rubber', 'clay', 'soft wood', 'hard wood', 'bone', 'bronze', 'steel', 'glass'];
const materialWord = v => MATERIALS[Math.round((v / 100) * (MATERIALS.length - 1))];

// Change time: curved 0-100 → 0.05 to 5 seconds (engine.js CHANGE_RANGE).
const changeText = pos => {
  const s = 0.05 * Math.pow(100, pos / 100);
  return s < 1 ? `${Math.round(s * 1000)} milliseconds` : `${s.toFixed(1)} seconds`;
};
const percent = (id, label, def, extra = {}) =>
  ({ id, label, min: 0, max: 100, fine: 1, coarse: 10, default: def, format: v => `${v} percent`, ...extra });
const semis = v => (v === 0 ? 'no change' : `${v > 0 ? 'up' : 'down'} ${Math.abs(v)} semitone${Math.abs(v) === 1 ? '' : 's'}`);

const struck = { showIf: v => v.exciter === 0 };
const bowed = { showIf: v => v.exciter === 1 };
const hasSecond = { showIf: v => v.second !== 0 };

createLab({
  id: 'objects-lab',
  title: 'Impossible objects',
  version: 1,
  engineUrl: new URL('./engine.js?v=1', import.meta.url).href,
  groups: [
    {
      name: 'Object',
      params: [
        { id: 'object', label: 'Object', choices: ['String', 'Bar', 'Bell', 'Plate', 'Glass bowl'], default: 1 },
        { id: 'material', label: 'Material', min: 0, max: 100, fine: 1, coarse: 10, default: 70,
          format: v => `${materialWord(v)}, ${v}` },
        { id: 'stiffness', label: 'Overtone spread', min: -50, max: 50, fine: 1, coarse: 10, default: 0,
          format: v => (v === 0 ? 'natural' : v > 0 ? `stretched ${v} percent` : `squeezed ${-v} percent`) },
        { id: 'position', label: 'Strike point', min: 0, max: 100, fine: 1, coarse: 10, default: 22,
          format: v => `${v} percent toward the middle` },
      ],
    },
    {
      name: 'Exciter',
      params: [
        { id: 'exciter', label: 'Played by', choices: ['Strike', 'Bow'], default: 0 },
        percent('hardness', 'Mallet hardness', 60, struck),
        percent('pressure', 'Bow pressure', 50, bowed),
        percent('bowSpeed', 'Bow speed', 50, bowed),
        percent('damper', 'Damper when let go', 20),
      ],
    },
    {
      name: 'Impossible',
      params: [
        { id: 'drift', label: 'Size drift', min: -24, max: 24, fine: 1, coarse: 6, default: 0,
          format: v => (v === 0 ? 'stays the same size' : v > 0 ? `shrinks, rising ${v} semitones` : `grows, falling ${-v} semitones`) },
        { id: 'melt', label: 'Melt', min: -100, max: 100, fine: 1, coarse: 10, default: 0,
          format: v => (v === 0 ? 'stays the same material' : `${v > 0 ? 'toward glass' : 'toward rubber'}, ${Math.abs(v)} percent`) },
        { id: 'change', label: 'Change time', min: 0, max: 100, fine: 1, coarse: 10, default: 50, format: changeText },
        percent('swell', 'Swell', 0),
      ],
    },
    {
      name: 'Second object',
      params: [
        { id: 'second', label: 'Second object', choices: ['None', 'String', 'Bar', 'Bell', 'Plate', 'Glass bowl'], default: 0 },
        { id: 'tuneB', label: 'Second object tuning', min: -24, max: 24, fine: 1, coarse: 12, default: 7, format: semis, ...hasSecond },
        percent('couple', 'Coupling', 30, hasSecond),
      ],
    },
    {
      name: 'Output',
      params: [
        { id: 'level', label: 'Level', min: -36, max: 0, fine: 1, coarse: 6, default: -12, format: v => `${v} dB` },
      ],
    },
  ],
});
