# Implemented features

_Newest first. Browse in AIDE with Ctrl+I._

## 2026-11-24 — Colony lab: playthrough log, easier straightening, front-free reach rule
The field now keeps a playthrough log: twice a second it records position, facing, turning and the nearest sounds with distance and direction. A Mark this moment button flags spots, and Settings shares the log as a text file. Also in this stretch: wider go-straight zones for hold and tilt with a louder tock when you're straight (v15-16), and the pickup rule (walk onto items without a reach arm; the arm reaches a footstep per level on every side, v14).
- Files: colony/
- Commit: 491a4f6

## 2026-11-24 — Colony lab: mech upgrades
Version 12 makes factory parts buy mech upgrades. Woodsman's axe, Stone pick, Ore drill and Fiber shears each give one more of their material per find for every level. The Reach arm picks things up one more footstep away per level. Upgrades belong to the mech, so they count on every colony.
- Files: colony/
- Commit: 3dfc823

## 2026-11-24 — Colony lab: pause production buildings
Version 11 adds a pause switch for each kind of processing building (forges, masonries, tailors) in Production, and a Pause button for each factory. Paused buildings keep their inputs in stock and free their workers. Came from Daniel's feedback: masonries ate all the stone on a stone-scarce planet, so cabins could never be built.
- Files: colony/
- Commit: c1d64cd

## 2026-11-22 — Echo lab, automated page checks and publishing checklist
Added the Echo lab (a tape-style echo effect sketch with a built-in test sound), made every slider lab wake its sound after leaving Safari, split the notes into one CLAUDE.md per lab, added `npm run check` to test every page in a headless browser (errors, VoiceOver names, spoken slider words, versions, Play makes sound), and added the lab-update publishing skill.
- Files: echo/, lab/lab.js, synth/, tests/check.mjs, package.json, CLAUDE.md, chase/, colony/, fidget/, .claude/skills/lab-update/
- Commit: 729d459
