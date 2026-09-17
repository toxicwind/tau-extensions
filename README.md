# tau-extensions

[`toxicwind/tau-extensions`](https://github.com/toxicwind/tau-extensions) — a monorepo of Tau extensions.

A curated set of Tau extensions that plug directly into your Tau agent session. Five extensions ship out of the box:

- **omp-kafka** — subscribe to Apache Kafka topics and surface messages in the session (auto push or on-demand pull).
- **omp-edit-committer** — auto-commit every Edit/Write with a descriptive Conventional-Commits message and surface the SHA under the tool result.
- **omp-model-router** — cost-optimized model routing: sends prompts to cheap/mid/expensive models by task complexity; tracks per-turn and session costs.
- **omp-kimi** — drive Moonshot's kimi-code CLI from the session: non-interactive prompts, provider/model listing, config validation, and the kimi web UI (supports `KIMI_API_KEY`).
- **pi-tasks** — task tracking and coordination: structured multi-step tasks, dependency management, background task processes, and a persistent visual task widget.

```mermaid
flowchart LR
    subgraph omp[omp session]
        ext1[omp-kafka]
        ext2[omp-edit-committer]
    end
    Kafka((Kafka)) --> ext1
    Agent --> ext1
    Agent --> ext2
    Git[(Git)] --> ext2
end
```

## Extensions

| Extension | Category | What it does |
|---|---|---|
| [`omp-kafka`](packages/omp-kafka) | Integration | Consume Kafka topics into an `omp` session; supports auto (push) and pull modes with `/kafka-*` slash commands and a `kafka_consume` LLM tool. |
| [`omp-edit-committer`](packages/omp-edit-committer) | Workflow | Auto-commit every Edit/Write with intent, trade-offs, and an ASCII diagram; renders a commit badge next to the tool result for use with `modem-dev/hunk`. |
| [`omp-model-router`](packages/omp-model-router) | Model routing | Cost-optimized model routing for Tau/omp — routes prompts to cheap/mid/expensive models based on task complexity; tracks per-turn and session costs. |
| [`omp-kimi`](packages/omp-kimi) | Integration | Drive Moonshot's kimi-code CLI from the session: `/kimi` non-interactive prompts, `/kimi-models`, `/kimi-doctor`, `/kimi-web` (web UI), plus a `kimi_ask` LLM tool. |
| [`pi-tasks`](packages/pi-tasks) | Productivity | Task tracking and coordination: structured multi-step tasks, dependency management, background task processes, and a persistent visual task widget. |

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
