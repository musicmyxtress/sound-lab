# Tuneling Nest lab

Playable sketch of Tuneling Nest, Blake's Tunelings spinoff where you raise one
Tuneling as a named friend instead of breeding and selling. The full design is
in C:\Users\User\Documents\projects\tuneling-nest\IDEAS.md (his decisions);
this lab only tests whether feeding, tastes and moods are fun by ear before an
app exists. Game lab: own nest.js, voice.js and style.css.

- voice.js is a port of choir/src/audio/synth.ts (Tunelings) with `base` in Hz,
  minus breath, distance and echo. Keep it in step with Tunelings if the
  voice there changes.
- Version 1 (2026-11-22): hatch, name, 12 foods with hidden tastes
  (love 20%, like 35%, dislike 30%, hate 15%), found only by feeding (his
  rule, no hints). Loved = call higher and faster; disliked = eaten, lower and
  slower, leaves it grumpy; hated = spit sound, never swallowed, no effect on
  diet but counts as a taste. Hate softens to dislike after 8 tastes, dislike
  to like after 12 eats (his "very slow" rule; real game ties it to stages).
- Diet: each eaten food moves voice pitch by weight x 0.35 semitones (meat
  lower and bigger, carrots/fruit higher and smaller), capped at 6. Size
  changes are announced.
- Moods (weather) colour the call; bond (climate) only goes up. Grumpy: first
  cuddle gets a huff, second forgives. Sad/scared: cuddle comforts; loved food
  cheers sad or grumpy. "Leave and come back later" sets at most one mood or
  none, never worse for a longer absence.
- Sound plays first, then the text line (say() waits for the sound).
- Not in the sketch yet: pictures, stages, humming, activities, walks.
- Saved in localStorage `sound-lab:nest:v1`.
