---
name: lab-update
description: Checklist for changing, adding or publishing any Sound lab page (synth, echo, chase, colony, fidget or a new lab) - version bumps, accessibility rules, automated checks, notes, commit and push to GitHub Pages. Use whenever a Sound lab change is about to be committed or Blake asks to update, publish or add a lab.
---

# Updating a Sound lab page

Blake tests on his iPhone from the live site, so every change is published.
Work through this in order; don't skip steps because the change is small.

## Changing an existing lab

1. **Bump versions** (Safari caches hard; Blake hears the version in the
   heading):
   - Slider lab: `version` in the lab's JS, the `?v=` on its script tag in
     index.html, and the `?v=` on engineUrl if engine.js changed.
   - Game lab: its version constant/heading and every `?v=` on files it
     loads.
   - Shared files: if `lab/lab.js` changed, bump its `?v=` in EVERY slider
     lab's import and bump each of those labs' versions too.
     Never edit `lab/player.js` for one lab (Blake's rule).
2. **Accessibility pass** on what changed: native labelled controls, sliders
   whose words are spoken (never a lone symbol), announcements polite and
   delayed ~700 ms, live numbers updated in place without rebuilding buttons.
3. **Check:** run `npm run check` (first time on a machine: `npm install`).
   Every page must say OK. If a check is wrong rather than the page, fix the
   check and say so.
4. **Notes:** record new decisions in that lab's own `CLAUDE.md`, with the
   version and Blake's reason when he gave one. Shared rules only go in the
   root CLAUDE.md.
5. **Commit and push** to main: message starts "<Lab name> version N: <what
   he'll hear or notice>". Push with `git push origin main`.
6. **Report** with the first line "Published (<Lab> version N)", then the
   live link https://musicmyxtress.github.io/sound-lab/<folder>/ and that
   Pages takes a minute or two. Say what to listen for.

## Adding a new lab

Do everything above, plus:

- New folder with `index.html` (copy synth/ for a slider lab), the
  `noindex, nofollow` robots meta, and its own `CLAUDE.md` saying what it is,
  whose design it is, and what's still open.
- Slider lab: an `engine.js` with createSynth and the VST contract, sample by
  sample, no browser audio nodes. An effect needs a test-sound source,
  clearly labelled as not part of the plugin (see echo/).
- Game lab: own JS and `style.css`; its own wakeAudio() for iPhone (see the
  root CLAUDE.md); expose state as `window.__name` for checks.
- Link it from the home page's list and add a row to the Labs table in the
  root CLAUDE.md.
