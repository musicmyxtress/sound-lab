# Jack-in-the-box lab

Tests the finale of the Tricky Toy Maker, Blake's printable Christmas escape
room (plan: C:\Users\User\Documents\projects\TrickyToyMaker\IDEAS.md). Game
lab: own fidget.js and style.css; no lab.js or scale player. Browser audio
nodes, because the real kit's finale will be a web page like this one.

- Blake's design: "Wind the handle" starts a music box looping "Pop Goes the
  Weasel" (traditional). Each solved answer speeds it up; after the third
  the tune plays on to the next "POP!" note (MELODY index 22), then the pop
  sound and Fidget appear. The three Solve buttons stand in for real
  answers.
- Music box tine = sine plus inharmonic partials at 6.27x and 17.55x (steel
  tine overtones) that decay fast, plus a pluck click.
- Tuning sliders are saved in localStorage `sound-lab:fidget:v2`.
- v2 (Blake: kids should get excited): defaults 76 beats a minute, 30%
  faster per answer, so the levels are 76, 99, 128.
- `window.__fidget` exposes state for automated checks.
- v3 (Blake's rules): a Wrong answer button giggles and drops the tune one
  level (divide by the speed-up step), down to a 24 beats-a-minute crawl, no
  lockout. A right answer speeds up one level, or if slowed, closes most of
  the gap to where it should be (Catch-up slider, default 70%), never all of
  it. The third answer never changes speed: the box waits for "POP!" however
  slow the tune is.
