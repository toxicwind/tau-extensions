# omp-kimi

Drive [Moonshot's kimi-code CLI](https://github.com/MoonshotAI/kimi-code) from
inside a Tau/omp session: run prompts non-interactively, inspect providers and
models, validate config, and spin up the kimi web UI — all without leaving the
session.

## Requirements

- The kimi-code CLI installed and on your PATH (or at `~/.kimi-code/bin/kimi`,
  or pointed to via `KIMI_BINARY`):
  ```sh
  curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
  # or: npm install -g @moonshot-ai/kimi-code
  ```
- Authentication: either run `kimi login` once (OAuth / device flow), or set
  `KIMI_API_KEY` to a Moonshot platform API key.

The extension loads even when kimi is missing — commands fail loudly with
install instructions instead of silently doing nothing.

## Install

```sh
# from the tau-extensions monorepo
bun install
```

Then add the extension to Tau:

```sh
mkdir -p ~/.tau/agent/extensions
ln -s /path/to/tau-extensions/packages/omp-kimi ~/.tau/agent/extensions/omp-kimi
```

## Commands

| Command | What it does |
|---|---|
| `/kimi [--model <alias>] [--agent <name>] <prompt>` | Run one prompt non-interactively (`kimi -p`) and stream the result back. Uses kimi's `auto` permission policy; static deny rules still apply. |
| `/kimi-status` | Binary path, version, `KIMI_API_KEY` presence, timeout, web UI state. |
| `/kimi-models [providerId] [--filter <s>]` | Configured providers (`kimi provider list`), or the public model catalog for a provider (`kimi provider catalog list`). |
| `/kimi-doctor` | Validate kimi's `config.toml` / `tui.toml`. |
| `/kimi-web [--port <n>]` | Start the integrated tau+kimi web gateway on loopback (default port 58627): kimi's full WebUI plus the tau shell (Kimi + collab-web tabs) behind one URL + token. Never uses `--dangerous-bypass-auth`. |
| `/kimi-web-stop` | Stop the web gateway started by `/kimi-web`. |

### Tool

`kimi_ask` — the LLM-callable equivalent of `/kimi`. Parameters: `prompt`
(required), `model`, `agent`, `timeoutMs` (1000–600000). Honors the caller's
abort signal.

## Configuration (environment)

| Variable | Default | Meaning |
|---|---|---|
| `KIMI_BINARY` | `kimi` on PATH, then `~/.kimi-code/bin/kimi` | Explicit CLI path. |
| `KIMI_API_KEY` | — | Moonshot platform API key. |
| `KIMI_TIMEOUT_MS` | `120000` | Timeout for `/kimi` / `kimi_ask` runs. |
| `KIMI_DISABLED` | — | Set to `1` to skip the extension. |
| `KIMI_DEBUG` | — | Set to `1` for debug logging on stderr. |
| `KIMI_WEB_PORT` | 58627 | Preferred `/kimi-web` gateway port (auto-increments on conflict). |
| `TAU_COLLAB_WEB_URL` | — | URL of a collab-web client to embed in the tau shell's Collab tab. |

## Notes

- Non-interactive (`-p`) runs never ask for approval — treat them like any
  other autonomous agent run and keep them in trusted directories.
- `/kimi-web` runs ONE gateway on loopback (default port 58627): kimi's full
  WebUI is proxied at `/`, and the tau shell at `/tau/` shows Kimi and
  collab-web side by side. The gateway token it prints is a secret: don't
  paste it into chats, tickets, or logs. The backend's own bearer token
  never leaves the gateway process — it is swapped server-side.
- Large outputs are truncated at 20k chars per section so a runaway transcript
  can't flood the session.

## Development

```sh
bun test        # unit tests (pure helpers, no kimi binary needed)
bun run typecheck
```

## License

MIT © toxicwind. kimi-code itself is MIT © Moonshot AI.
