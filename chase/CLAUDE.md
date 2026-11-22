# Chase lab

A game sketch, not a synth lab: no lab.js or scale player, its own
`style.css` (so lab style changes never touch it), browser audio nodes
(HRTF PannerNode). It tests phone controls for an audio exploration game
inspired by E.X.O. (shiftBacktick): chasing an unknown sound, then upgrading
with the screen reader. Not a copy: setting, materials and names are Blake's
to design ("glass/metal/mist/ember" are placeholders).

The game itself has moved on to `colony/` (see its CLAUDE.md), which copied
this field code. Control changes may need making in both.

- Four control settings, all designed by Blake: Tilt; Hold and drag (press
  walks; drag left/right turns, further = sharper; drag toward you =
  backward, away = forward, latched; release stops); Compass (body turns,
  pad walks); Steps and buttons (3-position sliders that snap back, so
  VoiceOver swipe up/down = one step or turn). Steps mode is for braille
  display and keyboard users: never put touch-only controls (the pad) in it.
- Several sounds at once (Sounds slider, 1-8, default 4): choosing which to
  chase is the strategy Blake loved in E.X.O. Each has its own rhythm so
  they never ping in unison; pickups refill after 1.5 s.
- Planned fifth mode, native app only: Swipe steps - real swipes on a
  direct-touch play area (VoiceOver silent), up/down = step, left/right =
  turn. Not on the web: double-tap-and-hold made it feel the same as Hold
  and drag, so it was removed (version 6).
- Speech is polite and delayed 700 ms: E.X.O. cut JAWS off when announcing
  pickups and Blake wants that fixed.
- `window.__chase` exposes game state for automated checks.
