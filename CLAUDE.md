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
- "Copy all spots" puts readable slider positions on the clipboard; Blake
  pastes them to Claude to say where he landed.

## Rules

- Bump the `?v=N` query strings and the lab's `version` on every change, so
  Safari loads the new files and Blake can hear which version he is on.
- Pages stays unlisted: `noindex` meta on every page plus `robots.txt`.
- Labs are throw-away sketches. The finished plugin is built separately
  (AudioPluginCoder, at the computer).
