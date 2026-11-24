# Colony lab

The first playable sketch of Blake's space-colonization game (his design;
never invent mechanics unasked). Game lab: own colony.js and style.css,
copies the chase field code; control schemes are described in
`../chase/CLAUDE.md`.

## Premise and tone

- Keep a giant mech (Daniel loves it). Mech upgrades came in v12 (see
  below); an earlier note said no suit upgrades, and Blake changed that. Endless,
  procedurally generated field and sounds that never run out. Building
  happens in a separate workshop (built things would mask the field),
  reached by a "go home" command.
- Premise (from a brainstorm with friends): find a planet, read its
  resource report, choose to colonize; it becomes the field. Build per
  colony.
- Tone: cozy. Blake reserves the right to add problems later (for example
  storms on some planets, shown in the planet report). Don't add danger
  unasked.
- The mech is just a machine, no voice. Later: battery and health
  mechanics, which is when a voice might come in. Not designed yet; don't
  build unasked.

## Structure

- Menu: Explore this planet, Return to colony, My colonies, Blast off,
  Settings. Planets come from a seed (mulberry32), so names, materials and
  procedural material sounds are fixed per planet.
- All tuning numbers at the top of colony.js are PLACEHOLDERs for Blake.
- Save is localStorage `colony:save:v1`.
- `window.__colony()` exposes game state for automated checks.

## Economy

- Money (the UI says credits) is universal, comes from commercial buildings
  (needs colonists) and pays for new colonies. Materials are per colony and
  come slowly from mines and factories, so every colony starts by hand.
- Money cannot buy materials and materials cannot move between colonies
  (for now). All colonies earn in real time, while playing and away;
  offline earnings cap at 4 hours, money buys higher caps. Hand gathering
  is faster than mines, but mines let you colonize elsewhere meanwhile.
- Shopping centers multiply on purpose: credits per minute = centers x
  colonists (Blake's choice). Colonizing gets more expensive each time so a
  player can't colonize everything (colonizeCost: free, then 100 x 2.5^n).

## Buildings and production

- Cabins house 2 people (cheaper), houses 4.
- Four material types, each with its own gatherer (1 worker): metal = mine,
  wood = lumber camp, stone = quarry, fiber = fiber farm. All four on every
  planet, sometimes a second of one.
- Processing (2 workers, 2 raw -> 1 per minute): forge (ore -> bars),
  masonry (stone -> bricks), tailor (fiber -> cloth/rope).
- Factories (3 workers) make one chosen product each, double tap to switch:
  wires, beams, servos, motors. Their use is mech upgrades (v12).
- Workers fill jobs in chain order (gatherers, processing, factories).
  Buildings stop and say what they are waiting for.
- Houses and shopping centers cost bricks; factories cost bricks and bars.
  Shopping centers have no workers. All recipes and costs are PLACEHOLDERs.
  Goods live in colony.stock as g:*.
- No roads: building is menu-based, not spatial.
- Pausing (v11, from Daniel's feedback: on a stone-scarce planet the
  masonries ate every stone, so cabins could never be built): each kind of
  processing building is one switch in Production (double tap pauses all
  forges, masonries or tailors); each factory gets its own Pause button.
  Paused buildings keep their inputs in stock and send their workers home,
  so those workers can fill other jobs. Saved as colony.paused.

## Field and sound

- Sound kinds, learnable by ear: wood pluck, stone thud, metal FM, fiber
  breathy noise. Pickup speech: "Zate: 3 found. Type: metal."
- Field (v5) follows E.X.O.'s rules: 50 m chunks; each chunk's items come
  from the planet seed plus chunk position, so the world is fixed and
  endless. Collected items are saved per chunk (colony.field.collected) and
  never return. Field position is saved per colony.
- v8: Blake walked 5 minutes with nothing, so items spread across the whole
  chunk (no clusters), hearing is 90 m with a gentler fade (ref 10 m, linear
  edge), and density comes from a temporary Richness slider in Settings
  (levels 1-5 = 0.8/1.5/2.5/4/6 per chunk, worded "about one every N
  metres"; default 3). Make his chosen level the default, then remove the
  slider. Item i's place depends only on i, so changing richness never
  moves items or breaks saved pickups.
- Mech footsteps (v5): servo whine, deep thud, metal clank, ground crunch,
  every 2.4 m, left/right feet alternate in stereo.
- The mech builds (v4): hydraulic hiss, heavy clanks (more for bigger
  buildings) and a thump; jobs queue one at a time and the announcement
  waits for the work sound.
- The field has its own Controls button (v7) cycling the four schemes; it
  stays put while other controls swap, so VoiceOver focus holds.
- Turning (v10): max 70 deg/s with an eased curve (input^1.5) so small tilts
  or drags turn slowly; a soft two-note chime plays when a sound comes
  within 5 degrees of straight ahead. Fixes swinging past sounds like a
  pendulum.

## Mech upgrades (v12)

- Blake and Daniel's idea: factory parts are for upgrading the mech. Bought
  in the colony's Mech upgrades section with the current colony's parts.
  Levels belong to the mech (G.upgrades), so they count on every colony.
- One tool per material type: Woodsman's axe (wood), Stone pick, Ore drill
  (metal), Fiber shears. Each level gives one more of that type per find
  (level 1 axe = 2 wood). Pickup speech adds "2 at once".
- Reach arm: each level picks things up from one more mech footstep away
  (2.4 m, STRIDE) (on any side; without an arm only walking onto it counts). Blake said "1 square away"; the
  field has no grid, so a footstep stands in for a square.
- Cost per level = base cost x the level you're buying. Names and costs are
  PLACEHOLDERs (UPGRADES in colony.js).

## Picking up (v14, Blake's rule)

- Without a Reach arm you pick up only what you walk onto (within 1 m,
  TOUCH). With one, anything within one footstep (2.4 m) per level, on ANY
  side: level 1 = 2.4 m, level 2 = 4.8 m.
- Why: v12 grabbed anything within 2.5 m even without an arm, so Blake
  picked up metal "clearly to my left" while turning to it. v13 tried
  front-only grabbing; Blake rejected that. The reach arm must work on
  every side. Don't add direction rules.
- Simulated steps-mode player (30 degree turns, 2 m steps): 197 of 200
  items reached without an arm, 200 of 200 with one.
