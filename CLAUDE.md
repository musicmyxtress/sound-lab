# Sound lab

Web pages, served from GitHub Pages, where Blake designs the sound and feel of
a plugin or app by ear from his iPhone, before any VST or EAS build exists.
Blake is blind and uses VoiceOver; every control must be a native, labelled
control that VoiceOver can step through.

## How it works

- `lab/player.js` is the shared scale player, identical in every lab (Blake's
  rule: only the synth changes between projects). It plays the DAW's part: a
  looping C major scale, each note doubled an octave up, which also tests
  polyphony. Its sliders (speed, note length, octave) are added by lab.js.
- Each lab's `engine.js` contains only the synth and sets
  `globalThis.createSynth = sampleRate => synth`, where synth has
  noteOn(note), noteOff(note), setParam(id, value) and render() - the VST
  contract. Written one sample at a time with no browser audio nodes, so it
  ports to C++ for the plugin.
- `lab/lab.js` builds a lab page from the synth's settings list: sliders,
  Play, a fine/coarse step switch, and saved spots. A lab page passes a
  stable `id` (it keys saved spots and slider positions in localStorage).
  A setting with `showIf(values)` hides while that is false (Tonic's rule: a
  filter that is off shows only its type), keeps its value, is left out of
  saved-spot descriptions, and the page announces controls shown or hidden.
- The synth's filter is Tonic's VoiceFilter (Simper SVF, k = 2 - 1.96 x
  resonance, cutoff as a note, linear filter envelope in semitones) so a lab
  sound carries over to Tonic. No velocity: the scale player has none.
- "Copy all spots" puts readable slider positions on the clipboard; Blake
  pastes them to Claude to say where he landed.

## Game labs

- `chase/` is a game sketch, not a synth lab: it does not use lab.js or the
  scale player, has its own `style.css` (so lab style changes never touch
  it), and uses browser audio nodes (HRTF PannerNode). It tests phone controls for an
  audio exploration game inspired by E.X.O. (shiftBacktick) - chasing an
  unknown sound, then upgrading with the screen reader. Not a copy: setting,
  materials and names are still Blake's to design ("glass/metal/mist/ember"
  are placeholders).
- Four control settings, all designed by Blake: Tilt, Hold and drag (press
  walks; drag left/right turns, further = sharper; drag toward you = backward,
  away = forward, latched; release stops), Compass (body turns, pad walks),
  Steps and buttons (3-position sliders that snap back, so VoiceOver swipe
  up/down = one step or turn). Steps mode is for braille display and
  keyboard users: never put touch-only controls (the pad) in it.
- Sliders must speak a real word: a lone "." valuetext made VoiceOver focus
  jump (version 2).
- Speech is polite and delayed 700 ms, never clearing VoiceOver mid-sentence:
  E.X.O. cut JAWS off when announcing pickups and Blake wants that fixed.
- `window.__chase` exposes game state for Playwright checks.

## Rules

- Bump the `?v=N` query strings and the lab's `version` on every change, so
  Safari loads the new files and Blake can hear which version he is on.
- Pages stays unlisted: `noindex` meta on every page plus `robots.txt`.
- Labs are throw-away sketches. The finished plugin is built separately
  (AudioPluginCoder, at the computer).
