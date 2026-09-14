# AGENTS.md — tau-extensions

Monorepo of Tau/OMP extensions: our extensions plus forks of others.
TypeScript, Bun workspaces.

## Layout

-  — one extension per directory. Each ships 
  (with an  entry pointing at ), ,
  , and .
-  — Claude Code marketplace catalog (repo root).
-  — OMP/Tau catalog. The Tau engine reads this
  copy first. **Keep the two manifests byte-identical.**
-  — fork provenance and attribution. Update it when adding a fork.

## Adding an extension

1. Vendor the source under  (keep the upstream LICENSE file;
   strip ).
2. Ensure  declares  whose
   module default-exports .
3. Add a plugin entry to BOTH marketplace manifests: , ,
   , ,  pointing at this repo's tree URL,
   .
4. Record provenance in .
5. Run , ,  before
   pushing.

## Rules

- Never commit , , , or API keys.
- Forks keep their upstream LICENSE; repoint repo URLs at this monorepo but
  keep author attribution.
- Don't invent config paths — check the extension's README for the canonical
  locations (, ).
