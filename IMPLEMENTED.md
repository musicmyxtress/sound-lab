# Implemented features

_Newest first. Browse in AIDE with Ctrl+I._

## 2026-11-24 — Colony lab: pause production buildings
Version 11 adds a pause switch for each kind of processing building (forges, masonries, tailors) in Production, and a Pause button for each factory. Paused buildings keep their inputs in stock and free their workers. Came from Daniel's feedback: masonries ate all the stone on a stone-scarce planet, so cabins could never be built.
- Files: colony/
- Commit: c1d64cd

## 2026-11-22 — Echo lab, automated page checks and publishing checklist
Added the Echo lab (a tape-style echo effect sketch with a built-in test sound), made every slider lab wake its sound after leaving Safari, split the notes into one CLAUDE.md per lab, added `npm run check` to test every page in a headless browser (errors, VoiceOver names, spoken slider words, versions, Play makes sound), and added the lab-update publishing skill.
- Files: echo/, lab/lab.js, synth/, tests/check.mjs, package.json, CLAUDE.md, chase/, colony/, fidget/, .claude/skills/lab-update/
- Commit: 729d459
