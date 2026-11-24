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
- Version 2 (2026-11-24): focus jumped on his iPhone after hatching and
  naming (once it landed him on Feed carrot). Cause: the control under
  VoiceOver's cursor was hidden. Rule now: move focus to the new control
  first, hide the old one SETTLE_MS (600 ms) later. Use this for any step
  that hides the control just pressed. His first Tuneling: Maya.
- Version 3 (2026-11-24): hidden pickiness (his idea after Maya turned out
  picky: one love, mushrooms). `picky` 0-1 skews taste odds (love 25->10%,
  like 45->20%, hate 7->22%). Never shown until every food is tried (his
  rule), then announced with a count: easy eater (8+ loved/liked, ~25% of
  eggs), strong opinions (~48%), picky (4 or fewer, ~26%). Judged from actual
  tastes, so old saves work. Real game: inherited.
- Version 4 (2026-11-24): humming (his pick for next). hum.js: 7 s mic
  capture after a rising beep (fixed length, so no tap needed mid-hum and
  VoiceOver isn't talking into the mic), voice processing OFF, YIN pitch
  every 25 ms, split into notes on silence or a lasting semitone jump, max 8
  notes, audio never kept. audioSession set to play-and-record while
  listening, back to playback after (else iPhone plays through the earpiece).
  Tune book in its own key `sound-lab:nest:tunes`, survives Start over.
  Lessons: off-note chance 0.6 x 0.75^(lessons-1), learned under 8% (lesson
  8); four mistake kinds; sleepy after 3 lessons until "come back later".
  His idea: happy calls (loved/liked food, happy cuddles, happy "How is")
  end with the first 4 notes of a taught tune 25% of the time, as roughly
  as currently known. Verified with a fake-microphone Twinkle in Edge and
  synthetic hums (breathy, off-key, fast, high and low voices).
