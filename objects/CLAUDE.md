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
- Measured in Node before publishing: 1-5% of one core, no NaN anywhere. A
  bowed string sings at its note (261 Hz for C4). A bowed bar tends to lock
  onto its second mode, as real bowed bars sometimes do; left in.

## Open

- Velocity: the scale player has none, so every strike is the same strength.
- Second object shares the first's material; it could get its own.
- More exciters (breath, scrape) and objects (spring, tube) were mentioned
  in the pitch but aren't in version 1.
