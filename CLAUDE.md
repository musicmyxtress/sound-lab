# Sound lab

Web pages, served from GitHub Pages at https://musicmyxtress.github.io/sound-lab/,
where Blake designs the sound and feel of a plugin, app or game by ear from
his iPhone, before any VST or EAS build exists. Blake is blind and uses
VoiceOver; every control must be a native, labelled control that VoiceOver
can step through.

This file holds only what every lab shares. **Each lab folder has its own
CLAUDE.md** with that lab's design notes; it loads when you work on files
there. Put a lab's decisions in its own file, never here.

## Labs

| Folder | What it is | Kind |
|---|---|---|
| `synth/` | Throw-away synth; its oscillators become the first test VST | slider lab |
| `echo/` | Tape-style echo effect, the next VST after Prism | slider lab |
| `chase/` | Phone controls for an audio exploration game (E.X.O.-inspired) | game lab |
| `colony/` | Space-colonization game sketch built on the chase field | game lab |
| `fidget/` | Music-box finale page for the Tricky Toy Maker escape room | game lab |

**Slider labs** use the shared builder and scale player below. **Game labs**
have their own JS and `style.css`, never use lab.js or the scale player, and
may use browser audio nodes.

## Shared parts (slider labs)

- `lab/player.js` is the scale player, identical in every lab (Blake's rule:
  only the engine changes between projects; never edit it for one lab). It
  plays the DAW's part: a looping C major scale, each note doubled an octave
  up, which also tests polyphony. It writes one mono sample to both ears.
- Each lab's `engine.js` sets `globalThis.createSynth = sampleRate => synth`,
  where synth has noteOn(note), noteOff(note), setParam(id, value) and
  render() - the VST contract. Written one sample at a time with no browser
  audio nodes, so it ports to C++ for the plugin.
- `lab/lab.js` builds the page from a settings list: sliders, Play, a
  fine/coarse step switch, saved spots, and the iPhone audio wake-up. A lab
  passes a stable `id` (keys localStorage). A setting with `showIf(values)`
  hides while false, keeps its value, is left out of saved-spot
  descriptions, and the page announces controls shown or hidden.
- "Copy all spots" puts readable slider positions on the clipboard; Blake
  pastes them to Claude to say where he landed.

## Accessibility rules (every lab)

- Sliders must speak a real word: a lone "." valuetext made VoiceOver focus
  jump.
- Spoken announcements are polite and delayed about 700 ms, never clearing
  VoiceOver mid-sentence.
- Live numbers update text in place; never rebuild buttons, or VoiceOver
  loses focus.

## iPhone audio

- iOS suspends web audio when Safari is left and never resumes it. lab.js
  and every game lab call wakeAudio() on visibilitychange, pageshow, focus
  and any tap (capture phase). Any new page with audio needs the same.
- The silent switch mutes web audio unless the page claims media playback
  (lab.js unmuteIOS does this).

## Rules

- **Publishing any change: follow `.claude/skills/lab-update/SKILL.md`.**
  It covers version bumps, checks, notes and pushing.
- Pages stays unlisted: `noindex` meta on every page plus `robots.txt`.
  The repo is public on purpose (free Pages).
- Labs are throw-away sketches. Finished plugins are built separately
  (AudioPluginCoder, at the computer).
- Game labs expose state as `window.__name` for automated checks.

## Checking

`npm run check` loads every lab linked from index.html in a headless browser
(Edge on Windows, Chromium elsewhere) and reports page errors, missing
noindex, unlabelled controls, sliders without spoken words, version
mismatches, and for slider labs whether Play makes sound. First time on a
machine: `npm install`.
