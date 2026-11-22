# Synth lab

Throw-away synth, built up iteratively like Tonic's synth. Blake wants its
oscillators to become the first real test VST. Slider lab (shared lab.js and
scale player; see the root CLAUDE.md).

- Parts in engine.js: Voice (oscillator, ADSR, filter), Filter, Synth.
- Saw and square use PolyBLEP against aliasing.
- The filter is Tonic's VoiceFilter (Simper SVF, k = 2 - 1.96 x resonance,
  cutoff as a note, linear filter envelope in semitones) so a lab sound
  carries over to Tonic. Every filter control but Type hides while the
  filter is off (Tonic's rule).
- Envelope sliders are positions 0-100 on a curved scale; TIME_RANGES in
  synth.js and engine.js must stay matched.
- No velocity: the scale player has none.
- localStorage id stays `synth-lab` so saved spots from early versions load.
- Verified on Blake's iPhone: page works, VoiceOver slider stepping works,
  plays on silent.
