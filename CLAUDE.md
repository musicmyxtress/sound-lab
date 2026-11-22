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
  (1 worker): metal = mine, wood = lumber camp, stone = quarry, fiber =
  fiber farm. Masonry (stone -> bricks) and tailor (fiber -> cloth/rope) are
  processing steps, like forges. All four on every planet, sometimes a second of one. Sound kinds:
  wood pluck, stone thud, metal FM, fiber breathy noise (learnable by ear), cabins (wood + stone), houses, shopping
  centers (no workers; credits per person), workplaces staffed in material order (placeholder). Pickup speech: "Zate: 3 found. Type:
  metal." UI says credits, not money. Production chain built in v6: gatherers (1 worker), forge/masonry/tailor
  (2 workers, 2 raw -> 1 bar/brick/cloth per minute), factories (3 workers,
  one chosen product each, double tap to switch: wires, beams, servos,
  motors). Workers fill jobs in chain order. Buildings stop and say what
  they are waiting for. Houses and shopping centers now cost bricks;
  factories cost bricks and bars. Servos and motors have no use yet. All
  recipes and costs are PLACEHOLDERs. Goods live in colony.stock as g:*.
- Shopping centers multiply on purpose: credits per minute = centers x
  colonists (Blake's choice). Colonizing gets more expensive each time so a
  player can't colonize everything (colonizeCost: free, then 100 x 2.5^n).
- The field has its own Controls button (v7) cycling the four schemes; it
  stays put while the other controls swap, so VoiceOver focus holds. Settings
  still has the same choice.
- Field (v5) follows E.X.O.'s rules: the surface is cut into 50 m chunks;
  each chunk's 0-3 clustered materials come from the planet seed plus the
  chunk position, so the world is fixed and endless. Only items within 70 m
  play, fading to silence at the edge. Collected items are saved per chunk
  (colony.field.collected) and never return, so you clear an area and move
  on. Your field position is saved per colony. The old Sounds slider is gone.
  v8: Blake walked 5 minutes with nothing, so items now spread across the
  whole chunk (no clusters), hearing is 90 m with a gentler fade (ref 10 m,
  linear edge), and density comes from a temporary Richness slider in
  Settings (levels 1-5 = 0.8/1.5/2.5/4/6 per chunk, worded as "about one
  every N metres"; default 3). Make his chosen level the default, then
  remove the slider. Item i's place depends only on i, so changing richness
  never moves existing items or breaks saved pickups.
- Tone: cozy. Blake reserves the right to add problems later (for example
  storms on some planets, shown in the planet report). Don't add danger
  unasked.
- The mech is just a machine, no voice. Later: battery and health mechanics,
  which is when a voice might come in. Not designed yet; don't build unasked.
- Mech footsteps (v5): servo whine, deep thud, metal clank, ground crunch,
  every 2.4 m, left/right feet alternate in stereo.
- The mech builds (v4): each build plays a hydraulic hiss, heavy clanks
  (more for bigger buildings) and a thump; jobs queue one at a time and the
  announcement waits for the work sound.
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

- Turning (v10): max 70 deg/s with an eased curve (input^1.5) so small
  tilts or drags turn slowly; a soft two-note chime plays when a sound comes
  within 5 degrees of straight ahead. Fixes Blake swinging past sounds like
  a pendulum.

## iPhone audio

- iOS suspends web audio when Safari is left and never resumes it. Both
  game labs call wakeAudio() on visibilitychange, pageshow, focus and any
  tap (capture phase). Any new page with audio needs the same.

## Rules

- Bump the `?v=N` query strings and the lab's `version` on every change, so
  Safari loads the new files and Blake can hear which version he is on.
- Pages stays unlisted: `noindex` meta on every page plus `robots.txt`.
- Labs are throw-away sketches. The finished plugin is built separately
  (AudioPluginCoder, at the computer).

## Jack-in-the-box lab

- `fidget/` tests the finale of the Tricky Toy Maker, Blake's printable
  Christmas escape room (plan: projects/TrickyToyMaker/IDEAS.md). Own
  fidget.js and style.css; no lab.js or scale player. Browser audio nodes,
  because the real kit's finale will be a web page like this one.
- Blake's design: "Wind the handle" starts a music box looping "Pop Goes the
  Weasel" (traditional). Each solved answer speeds it up; after the third the
  tune plays on to the next "POP!" note (MELODY index 22), then the pop
  sound and Fidget appear. The three Solve buttons stand in for real answers.
- Music box tine = sine plus inharmonic partials at 6.27x and 17.55x (steel
  tine overtones) that decay fast, plus a pluck click. Tuning sliders are
  saved in localStorage `sound-lab:fidget`.
- `window.__fidget` exposes state for Playwright checks.
