import { createLab } from '../lab/lab.js?v=1';

createLab({
  title: 'Synth',
  version: 1,
  engineUrl: './engine.js?v=1',
  processor: 'synth-lab',
  notes: 'Play loops a C major scale up and down, each note doubled an octave above.',
  groups: [
    {
      name: 'Oscillator',
      params: [
        { id: 'wave', label: 'Waveform', choices: ['Sine', 'Triangle', 'Saw', 'Square'], default: 2 },
        { id: 'level', label: 'Level', min: -36, max: 0, fine: 1, coarse: 6, default: -12, format: v => `${v} dB` },
      ],
    },
    {
      name: 'Scale player',
      params: [
        { id: 'tempo', label: 'Speed', min: 30, max: 240, fine: 5, coarse: 30, default: 100, format: v => `${v} notes per minute` },
        { id: 'length', label: 'Note length', min: 10, max: 100, fine: 5, coarse: 20, default: 80, format: v => `${v} percent` },
        { id: 'octave', label: 'Scale octave', min: 1, max: 5, fine: 1, coarse: 1, default: 3, format: v => `C${v}` },
      ],
    },
  ],
});
