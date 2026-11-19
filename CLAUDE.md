# Sound lab

Web pages, served from GitHub Pages, where Blake designs the sound and feel of
a plugin or app by ear from his iPhone, before any VST or EAS build exists.
Blake is blind and uses VoiceOver; every control must be a native, labelled
control that VoiceOver can step through.

## How it works

- `lab/lab.js` builds a lab page from a list of settings: sliders, Play, a
  fine/coarse step switch, and saved spots. A new lab supplies only a settings
  list and an engine file.
- Each lab's `engine.js` is an AudioWorklet written one sample at a time, with
  no browser audio nodes, so it ports to C++ for the plugin. It contains a
  Sequencer (stands in for the DAW: a looping C major scale doubled an octave
  up, which also tests polyphony), the voices, and the parameters.
- "Copy all spots" puts readable slider positions on the clipboard; Blake
  pastes them to Claude to say where he landed.

## Rules

- Bump the `?v=N` query strings and the lab's `version` on every change, so
  Safari loads the new files and Blake can hear which version he is on.
- Pages stays unlisted: `noindex` meta on every page plus `robots.txt`.
- Labs are throw-away sketches. The finished plugin is built separately
  (AudioPluginCoder, at the computer).
