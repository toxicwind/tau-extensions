# AGENTS.md -- tau-extensions

Monorepo of Tau/OMP extensions: our extensions plus forks of others.
TypeScript, Bun workspaces.

## Layout

- `packages/<name>/` -- one extension per directory. Each ships `package.json`
  (with an `omp.extensions` entry pointing at `./src/extension.ts`), `src/`,
  `README.md`, and `LICENSE`.
- `marketplace.json` -- Claude Code marketplace catalog (repo root).
- `.omp-plugin/marketplace.json` -- OMP/Tau catalog. The Tau engine reads this
  copy first. Keep the two manifests byte-identical.
- `NOTICE` -- fork provenance and attribution. Update it when adding a fork.

## Adding an extension

1. Vendor the source under `packages/<name>/` (keep the upstream LICENSE file;
   strip `.git`).
2. Ensure `package.json` declares `omp.extensions: ["./src/extension.ts"]` whose
   module default-exports a function taking the extension API object.
3. Add a plugin entry to BOTH marketplace manifests: `name`, `description`,
   `version`, `source` as `"./<name>"`, `homepage` pointing at this repo tree URL,
   `license`.
4. Record provenance in `NOTICE`.
5. Run `bun install`, `bun run typecheck`, `bun test packages/<name>` before
   pushing.

## Rules

- Never commit `node_modules/`, `dist/`, `.env`, or API keys.
- Forks keep their upstream LICENSE; repoint repo URLs at this monorepo but
  keep author attribution.
- Do not invent config paths -- check the extension README for the canonical
  locations (`~/.tau/agent/extensions/`, `<cwd>/.tau/extensions/`).
