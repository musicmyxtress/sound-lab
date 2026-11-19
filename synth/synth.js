import { createLab } from '../lab/lab.js?v=2';

createLab({
  id: 'synth-lab', // keeps saved spots from version 1
  title: 'Synth',
  version: 2,
  engineUrl: new URL('./engine.js?v=2', import.meta.url).href,
  groups: [
    {
      name: 'Oscillator',
      params: [
        { id: 'wave', label: 'Waveform', choices: ['Sine', 'Triangle', 'Saw', 'Square'], default: 2 },
        { id: 'level', label: 'Level', min: -36, max: 0, fine: 1, coarse: 6, default: -12, format: v => `${v} dB` },
      ],
    },
  ],
});
