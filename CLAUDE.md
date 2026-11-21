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
- Several sounds at once (Sounds slider, 1-8, default 4): choosing which to
  chase is the strategy Blake loved in E.X.O. Each has its own rhythm so
  they never ping in unison; pickups refill after 1.5 s.
- Game decisions so far (2026-11-21): keep a giant mech (Daniel loves it),
  but no suit upgrades. Endless, procedurally generated field and sounds that
  never run out. Building happens in a separate workshop (built things would
  mask the field), reached by a "go home" command.
- Premise: space colonization. Find a planet, read its resource report,
  choose to colonize; it becomes the field. Build houses, roads, factories,
  mines, shops per colony. Money is universal (from commercial buildings,
  needs colonists) and pays for new colonies; materials are per colony and
  come slowly from mines and factories, so every colony starts by hand.
- Economy decisions: money cannot buy materials and materials cannot move
  between colonies (for now). All colonies earn in real time, while playing
  and while away; offline earnings cap at 4 hours, money buys higher caps.
  Hand gathering is faster than mines, but mines let you colonize elsewhere
  while they work.
- `colony/` is the first playable game sketch (own colony.js and style.css,
  copies the chase field code). Menu: Explore this planet, Return to colony,
  My colonies, Blast off, Settings. Planets come from a seed (mulberry32), so
  names, materials and procedural material sounds are fixed per planet. All
  tuning numbers at the top of colony.js are PLACEHOLDERs for Blake. Save is
  localStorage `colony:save:v1`. Live numbers update text in place, never
  rebuilding buttons, so VoiceOver focus holds while money ticks in.
- Buildings design (2026-11-21): cabins house 2 people (cheaper), houses 4.
  Production chain, each needs workers: mine (1) -> raw ore; forge (2) ore ->
  bars; factory (3) bars -> components: wires, servos, motors, beams, bricks.
  Any number of each; a building stops when it lacks inputs. Components make
  construction easier than crafting everything individually. Shopping centers
  produce a small amount of credits per person in that colony.
  Built in colony v3: four material types, each with its own workplace
  (1 worker): metal = mine, wood = lumber camp, stone = masonry, fiber =
  tailor. All four on every planet, sometimes a second of one. Sound kinds:
  wood pluck, stone thud, metal FM, fiber breathy noise (learnable by ear), cabins (wood + stone), houses, shopping
  centers (no workers; credits per person), workplaces staffed in material order (placeholder). Pickup speech: "Zate: 3 found. Type:
  metal." UI says credits, not money. Forges and factories not built yet.
- Decided: workers fill the chain in order (mines, then forges, then
  factories); each factory makes one chosen product, switchable any time;
  no roads, because building is menu-based, not spatial.
- Planned fifth mode, native app only: Swipe steps - real swipes on a
  direct-touch play area (VoiceOver silent), up/down = step, left/right =
  turn. Not on the web: double-tap-and-hold made it feel the same as Hold
  and drag, so it was removed (version 6).
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
