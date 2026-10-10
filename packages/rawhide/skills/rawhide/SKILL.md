---
name: rawhide
description: Engine + default Gwern pack. Anti-slop, hedge detection, Kesselman epistemic calibration, 75-word dense prose, markdown-aware. Loads additional packs from RAWHIDE_PACKS.
globs:
  - "**/*.md"
  - "**/*.mdx"
alwaysApply: false
---

# Rawhide

Rawhide is the engine. Skills supply composable rule packs.

## Default pack: gwern

- Anti-slop (delve, tapestry, seamless, utilize, game-changer, etc.)
- Hedge detection (may, might, it seems that, arguably)
- Kesselman epistemic calibration (vague probability → explicit scale)
- 75-word dense prose cap
- Markdown-aware (skips code fences, tables, headings)

## Optional packs

| Pack | Load with |
|---|---|
| airspeak | `RAWHIDE_PACKS=gwern,airspeak` |
| epistemic | `RAWHIDE_PACKS=gwern,epistemic` |

Enable or disable packs without touching the engine.
