# tau-extensions

[`toxicwind/tau-extensions`](https://github.com/toxicwind/tau-extensions) — a monorepo of Tau extensions.

Ten extensions that plug directly into your Tau (oh-my-pi / `omp`) agent session: two built here, eight vendored forks of community extensions — all MIT-licensed, all cataloged under the `tau-extensions` marketplace.

## Extensions

| Extension | Category | What it does | Provenance |
|---|---|---|---|
| [`omp-kafka`](packages/omp-kafka) | Integration | Consume Kafka topics into a session; auto (push) and pull modes with `/kafka-*` slash commands and a `kafka_consume` LLM tool. | Built here (from RekunDzmitry/omp-extensions) |
| [`omp-edit-committer`](packages/omp-edit-committer) | Workflow | Auto-commit every Edit/Write with a Conventional-Commits message; renders a commit badge next to the tool result (works with `modem-dev/hunk`). | Built here (from RekunDzmitry/omp-extensions) |
| [`omp-model-router`](packages/omp-model-router) | Model routing | Route prompts to cheap/mid/expensive models by task complexity; tracks per-turn and session costs. | Fork of cakriwut/omp-model-router |
| [`engram`](packages/engram) | Memory | Persistent memory for the agent session. | Vendored from thebtf/engram (locally adapted) |
| [`gsd-omp`](packages/gsd-omp) | Orchestration | GSD Embeddable Orchestration System host plugin for Tau. | Fork of tchivs/gsd-omp |
| [`omp-best-of`](packages/omp-best-of) | Agents | Best-of-N coding agents with LLM-as-a-verifier selection. | Fork of wolfiesch/omp-best-of |
| [`omp-undo-redo`](packages/omp-undo-redo) | Workflow | Session and file undo/redo; snapshot-based undo of agent edits. | Fork of Baylar55/omp-undo-redo |
| [`pi-agent-browser-native`](packages/pi-agent-browser-native) | Automation | Exposes agent-browser as a native Tau tool for scripted browser automation. | Fork of fitchmultz/pi-agent-browser-native |
| [`pi-tasks`](packages/pi-tasks) | Productivity | Claude Code-style task tracking and coordination. | Fork of tintinweb/pi-tasks |
| [`pi-workflow`](packages/pi-workflow) | Workflow | Named, repeatable multi-step workflow orchestration. | Fork of AgwaB/pi-workflow |

Fork provenance and attribution live in [`NOTICE`](./NOTICE). Forks keep their upstream LICENSE files; repo URLs are repointed at this monorepo.

## Marketplace

`marketplace.json` (repo root) is the plugin catalog: `tau-extensions` by `toxicwind`, `pluginRoot: packages`, 10 plugins. The Tau engine reads `.omp-plugin/marketplace.json` first — the two manifests are kept byte-identical.

## Install

Requires `omp >= 17.0.0` and [Bun](https://bun.sh) 1.3.x.

### Option A — clone the monorepo and link

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/toxicwind/tau-extensions ~/.tau/agent/extensions/tau-extensions
cd ~/.tau/agent/extensions/tau-extensions
git sparse-checkout set packages/omp-kafka
cd packages/omp-kafka
bun install
omp plugin link .
```

Drop `--filter=blob:none --sparse` and the `sparse-checkout` lines to clone everything. Swap `packages/omp-kafka` for any package from the table above.

### Option B — install via npm (once published)

```bash
bun add -g @toxicwind/omp-kafka
```

Then add to `~/.tau/agent/config.yml`:

```yaml
extensions:
  - @toxicwind/omp-kafka
```

### Option C — load once for a single session

```bash
omp --extension /path/to/tau-extensions/packages/omp-kafka
```

## Development

Requires **Bun 1.3.x** — lockfiles are generated with 1.3.x and CI installs with `--frozen-lockfile`.

```bash
bun install
bun run test        # bun test packages/*
bun run typecheck   # bun scripts/typecheck.mjs
```

All packages typecheck and test cleanly (enforced in CI).

## License

MIT — see [LICENSE](./LICENSE). Vendored forks retain their upstream MIT licenses; see [NOTICE](./NOTICE) for attribution.
