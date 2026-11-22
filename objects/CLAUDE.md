# Impossible objects lab

Struck or bowed objects built from modes, whose size and material can change
while they ring. Started 2026-11-22 from a brainstorm. Blake chose it over a
feedback-resonator idea, which he found too close to his FM and Modular
synths. Slider lab (shared lab.js and scale player; see the root CLAUDE.md).

**Version 1 is Claude's sketch.** Every choice is open to Blake. The pull he
named: something strange that makes him want to add more sliders "to see
what would happen", as the Modular Synth in Tonic did.

## How it works (engine.js)

- Modal synthesis. Each object is up to 16 modes (pitch ratio, strength),
  from Fletcher & Rossing: String (harmonics), Bar (free-free), Bell,
  Plate, Glass bowl (near-twin modes that beat). Each mode is a complex
  phasor `z = z*c + w*F`; its real part acts as surface velocity, which
  the bow reads and the pickup hears.
- Material: eight materials, rubber to glass (`MATERIALS`, same names in
  objects.js). Each has a fundamental T60 at middle C and a tilt: a mode at
  r times the pitch fades r^tilt faster. Low notes ring longer, by (261.6/f0)^0.4.
- Strike: a raised-cosine push, 6 ms (soft) to 0.1 ms (hard). Bow: STK's
  friction curve, with the bow speeding up over 60 ms and stopping over 30 ms.
- Impossible controls: Size drift (all modes glide up to two octaves),
  Melt (the material slides while ringing), both over Change time; Swell
  (upper modes' fades go below zero while the key is held; letting go
  ends it, so no note rings forever).
- Second object: driven by the first's output; pushes back with the
  opposite sign. The same sign made a loop that sat on the limiter and
  never ended (measured). It has the same material and strike point.
- Safety: every mode is capped at 1.2, there's a soft ceiling above 0.7
  like the synth lab, and a NaN clears all voices. 16 voices; it steals the
  oldest let-go voice.
- Measured in Node: 1-5% of one core, no NaN anywhere. (Version 1's bow
  checks used a rough pitch measure and missed that bowed notes were flat;
  see version 2. Use a spectrum, not autocorrelation, to check pitch.)

## Version 2 (2026-11-22), after Blake's first listen

- Blake: overtones sounded ugly on everything but String, and a bowed bell
  "no longer sounded like it could carry a tune": it "starts to play the
  note, then changes its mind halfway through". He wants the clatter kept
  as an option ("metallic or even magical sounds for games").
- **Overtone tuning** (0 wild, 100 in tune, default in tune): each mode's
  ratio blends from the raw object (`ratios`) to `tuned` by multiplying.
  Tuned sets are whole multiples: bar 1, 4, 10 (marimba), bell keeps its hum
  an octave down and a fifth at 1.5, glass keeps its 0.3% twins.
- **Bow reads only the note's mode** (`note` in OBJECTS). Reading every mode
  let them compete for the grip; the switch mid-note was that.
- **Bow grip 0.5 → 0.03** (`BOW_GRIP`): at 0.5 every bowed note came out 1
  to 8 semitones flat (each grab-and-slip outlasted the object's vibration).
  Measured: every object, wild or tuned, now bows on C4's harmonics.
- Bow speed range 0.1 to 0.3 (was 0.03 to 0.3, whose bottom was silent).
  High pressure with the lowest speed still won't start, as a real bow chokes.
- Bowing makes even a wild object sound harmonic (the bow's push repeats at
  the note), so wild mostly changes struck sounds and the bowed colour.

## Open

- Velocity: the scale player has none, so every strike is the same strength.
- Second object shares the first's material; it could get its own.
- More exciters (breath, scrape) and objects (spring, tube) were mentioned
  in the pitch but aren't in version 1.
