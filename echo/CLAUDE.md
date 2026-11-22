# Echo lab

An echo/delay effect plugin, the next VST after Prism. Started 2026-11-22.
Slider lab (shared lab.js and scale player; see the root CLAUDE.md).

- Claude picked this project when Blake asked for help choosing, and he
  wasn't sure about it. Treat it as optional; don't push it.
- An effect needs input, so engine.js has two parts: `Source` voices
  (Pluck, Bell, Soft keys) stand in for the track and are NOT the plugin;
  the `Echo` class is the plugin and is what ports to C++. Its sliders sit
  under "Test sound (not part of the plugin)".
- Version 1 is Claude's sketch, every choice open to Blake: curved echo
  time 10 ms to 2 s that glides when moved (tape-style pitch bend), Repeats
  (feedback), Mix (both full at 50%), Tone (low-pass) and Low cut
  (high-pass) inside the loop so repeats darken, Saturation (tanh in the
  loop, always present, so 100% repeats can't run away), Wobble depth/speed
  (two unsynced sines, up to 6 ms). Output has a soft ceiling above 0.8.
- Blake's first reaction: it sounds lo-fi. That comes from the defaults
  (tone ~4 kHz, wobble 15%, saturation 20%, low cut ~120 Hz). Clean = tone
  max, low cut min, saturation 0, wobble 0. Offered: make clean the default.
- Mono only: the shared player writes one sample to both ears, and
  player.js never changes. Stereo/ping-pong would need that rule revisited.
- No tempo sync: the player's speed isn't sent to the engine.
- TIME_MIN/TIME_MAX in echo.js and engine.js must stay matched.
