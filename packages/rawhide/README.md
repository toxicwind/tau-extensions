<div align="right">

[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge)](https://github.com/toxicwind/tau-extensions)
[![tau](https://img.shields.io/badge/tau-extension-1f6feb?style=for-the-badge)](https://github.com/toxicwind/tau-extensions)
[![packs](https://img.shields.io/badge/packs-gwern%20%2B%20airspeak-success?style=for-the-badge)](https://github.com/toxicwind/tau-extensions)

</div>

# Rawhide

> One engine. Multiple maximal rule packs. Skills are the extension point.

> **Why care?** Rawhide is the Gwernian prose linter for tau. Airspeak (STE mechanical lineage) is absorbed as one pack, not a second extension. The airspeak skill carries the original 10-family rule set with before/after examples.

## Packs

| Pack | Default | What it enforces | Skill |
|---|---|---|---|
| **gwern** | yes | Anti-slop, hedge detection, Kesselman epistemic calibration, 75-word dense prose, markdown-aware | `skills/rawhide/` |
| **airspeak** | no | STE mechanical: 20/25-word sentences, banned vocab, phrasal verbs, contractions, semicolons, em-dash density, missing-that, Latin abbrevs, gendered terms | `skills/airspeak/` |

Load with `RAWHIDE_PACKS`. Default is `gwern`.

```bash
RAWHIDE_PACKS=gwern,airspeak tau
```

## Architecture

```
rawhide/
├── src/
│   ├── engine.ts          # loads packs from RAWHIDE_PACKS
│   ├── index.ts           # ExtensionAPI entry
│   ├── rules.ts           # gwern source rules
│   ├── types.ts           # LintIssue, RulePack
│   └── packs/
│       ├── gwern.ts       # default pack
│       └── airspeak.ts    # full STE checker (from airspeak lineage)
├── skills/
│   ├── rawhide/SKILL.md   # engine + gwern pack
│   └── airspeak/SKILL.md  # original 10-family STE rules with examples
└── tests/
```

## Skills

Skills live in `skills/`. The airspeak skill is the original STE document (10 families, before/after examples, checklist). The rawhide skill describes the engine and gwern defaults.

| Skill | Content |
|---|---|
| `rawhide` | Engine + gwern pack (anti-slop, hedge, epistemic, 75-word) |
| `airspeak` | Full STE mechanical rules (original skill, name fixed) |

## Install

```bash
tau -e ./packages/rawhide
```

## License

Apache-2.0
