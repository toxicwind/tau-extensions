---
name: airspeak
description: Write and review technical documentation — docs, READMEs, PR descriptions, error messages, runbooks, release notes, changelogs. English is inspired by ASD-STE100 Issue 9. Use when the architect writes or edits technical prose, API docs, or any document where clarity and brevity matter — even if they don't explicitly mention a style guide or simplification. Never use for marketing copy, essays, creative writing, or anything that needs a distinctive voice. These specs intentionally strip voice.
license: MIT
compatibility: omp, Claude Code, Cursor, GitHub Copilot, and any agent supporting the Agent Skills spec
metadata:
  version: "1.1.5"
  author: Rami Abu-Hamad
  en-spec: inspired by ASD-STE100 Issue 9 (Jan 2025)
globs:
  - "**/*.md"
  - "**/*.mdx"
  - "**/README*"
  - "**/CHANGELOG*"
  - "**/RELEASE*"
  - "**/errors/**"
  - "**/runbooks/**"
alwaysApply: false
hide: false
---

# Airspeak Pack

Agentic clarity: mechanical, machine-checkable prose rules for technical documentation. One language: English, inspired by ASD-STE100 Issue 9. STE is the named source for the mechanical rules below; the product goal is unambiguous, low-jargon English — not STE certification.

## Agentic clarity rule set (10 families, all lintable)

The full STE spec is 434 pages; the ten families below are the mechanical subset that matters for agent-written prose. Each family names the STE anchor it descends from, so the lineage stays honest. Where STE and agentic clarity diverge (the em-dash cap, the marketing list), agentic clarity wins.

| Family (label) | Rationale | Before → After |
|---|---|---|
| sentence-length `[STE 6.3]` / `[STE 5.1]` | One idea per sentence; keeps agent output reviewable (4.1 "write short and clear sentences"; 5.1 max 20 words in procedures; 6.3 max 25 in descriptions) | "Start the server, then wait for it to bind port 8080, and finally run the health check." → "Start the server. Wait for it to bind port 8080. Run the health check." |
| semicolon `[STE 8.1]` | Semicolons are misused by agents more than humans; a period split reads cleaner | "The build failed; the log shows a type error." → "The build failed. The log shows a type error." |
| nominalization `[STE 3.7]` | Verbs describe actions more clearly than nouns | "The ohmmeter gives an indication of 450 ohms." → "The ohmmeter shows 450 ohms." ("Do a check" → "Check") |
| phrasal-verb `[STE 9.3]` | Vague verbs are the #1 source of agent ambiguity | "Spin up the server." → "Start the server." |
| banned-vocab `[anti-slop]` | Marketing adjectives carry no information | "A robust, seamless, powerful solution." → "A solution." |
| em-dash `[style]` | Cap, not ban — STE 8.1 explicitly allows the em-dash; keep at most one per paragraph | "The parser — a recursive descent one — is fast — but hard to debug." → "The parser — a recursive descent one — is fast but hard to debug." |
| contraction `[STE 4.2]` | Contracted negatives trap non-native readers and agents | "Don't touch the wires." → "Do not touch the wires." |
| missing-that `[GR-1]` | "Make sure the valve is open" is ambiguous; "Make sure that the valve is open" is not | "Make sure the valve is open." → "Make sure that the valve is open." |
| latin-abbrev `[GR-6]` | e.g./i.e./etc. confuse non-native readers; agents overuse them | "e.g." → "for example" |
| gendered-pronoun `[GR-7]` | Neutral language is both a standard requirement and agent best practice | "When the architect starts the job, he must wait." → "When the architect starts the job, they must wait." |

### Quick application checklist

Before returning any technical English prose:

1. Any sentence over 20 words (procedures) or 25 (descriptions)? Split it.
2. Any semicolon? Replace with a period, or rewrite as two sentences.
3. Any nominalization (`perform an analysis of`, `do a check`, `make a determination of`, `provide assistance with`)? Use the verb (`analyze`, `check`, `determine`, `help`).
4. Any phrasal verb (`spin up`, `reach out`, `dive into`, `delve into`, `circle back`, `deep dive`, `hop on a call`, `ping`, `leverage`, `utilize`)? Use one precise verb (`start`, `contact`, `open`/`read`, `read`, `return`, `analysis`, `call`, `message`, `use`).
5. Any marketing adjectives? Cut: `seamless`, `robust`, `powerful`, `cutting-edge`, `effortless`, `world-class`, `next-generation`, `revolutionary`, `facilitate`, `empower`, `holistic`, `seamlessly`, `meticulously`, `crucial`, `pivotal`, `paramount`, `game-changing`, `tapestry`, `delve`, `navigate the landscape of`.
6. More than one em-dash in a paragraph? Keep the one that earns the pause.
7. Any contraction (`don't`, `isn't`, `it's`, `we're`, `you're`, `can't`)? Write the full form (`do not`, `is not`, `it is`, `we are`, `you are`, `cannot`).
8. `make sure`/`ensure`/`check`/`verify`/`confirm` followed by a clause without `that`? Add `that`.
9. Any Latin abbreviation (`e.g.`, `i.e.`, `etc.`, `vs.`, `et al.`)? Write it out (`for example`, `that is`, `and so on`, `versus`, `and others`).
10. Any gendered pronoun (`he`, `she`, `him`, `his`, `her`, `hers`)? Use `they` or rephrase.

### Hard NO

- **Do not paste the full STE Issue 9 dictionary** (875 approved + ~1200 forbidden entries) into the prompt. It's copyrighted (ASD owns it; STEMG grants free use only to the listed categories of organizations) and burns ~8k tokens. The skill body covers the mechanical subset; the model knows STE-shaped prose from training.
- **Do not apply STE to voice work.** Marketing copy, essays, blog posts, narrative — running STE on these produces sterile text.

## Modes

The lint extension has two modes; the model always reads this skill regardless of mode.

- `warn` (default) — appends a violation list to the tool result so the model self-corrects on the next turn.
- `block` — rejects violating writes before they execute.

## Companion artifacts (for the full setup)

- **Linter**: `~/.omp/agent/extensions/rawhide.ts` runs the mechanical rules above on every `write`/`edit` to `**/*.md*`. Default mode is `warn` (injects a list of violations into the tool result so the model self-corrects on the next turn); flip to `block` by editing the file or via `disabledExtensions: ["rawhide"]` to disable entirely.
- **Pointer**: `~/.omp/agent/APPEND_SYSTEM.md` contains a one-line reminder to consult this skill.

## Kill switches

This skill is **off by default** — the model only reads it when it judges a doc-related task. To disable entirely:

- Delete `~/.agent/skills/rawhide/SKILL.md`
- Add to `~/.omp/agent/config.yml`: `disabledExtensions: ["skill:rawhide"]`
- Add to `ignoredSkills: ["rawhide"]` in config
- Set `enableAgentsUser: false` to turn off the whole agents provider
- Tighten the `globs` list so it never matches your files
