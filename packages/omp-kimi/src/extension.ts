/**
 * omp-kimi extension entry point.
 *
 * Drives the Moonshot kimi-code CLI from inside a Tau/omp session:
 *
 *   /kimi <prompt> [--model <alias>] [--agent <name>]
 *       Run one prompt non-interactively (`kimi -p`) and stream the result
 *       back into the session. Non-interactive runs use kimi's `auto`
 *       permission policy; static deny rules still apply.
 *   /kimi-status      Binary location, version, KIMI_API_KEY presence.
 *   /kimi-models [provider] [--filter <s>]
 *       Configured providers, or the public model catalog for a provider.
 *   /kimi-doctor      Validate kimi's config.toml / tui.toml.
 *   /kimi-web [--port <n>]   Start the integrated tau+kimi web UI: one
 *       gateway (loopback only) serving kimi's full WebUI plus the tau
 *       shell with collab-web side by side. Reports the single entry
 *       URL + token — no parallel `kimi web` instance.
 *   /kimi-web-stop    Stop the web gateway started by /kimi-web.
 *   kimi_ask (tool)   LLM-callable equivalent of /kimi.
 *
 * Configuration (environment):
 *   KIMI_BINARY      Explicit path to the kimi binary (default: PATH, then
 *                    ~/.kimi-code/bin/kimi).
 *   KIMI_API_KEY     Moonshot platform API key (also used by kimi itself).
 *   KIMI_TIMEOUT_MS  Timeout for `kimi -p` runs (default 120000).
 *   KIMI_WEB_PORT    Preferred gateway port for /kimi-web (default 58627).
 *   TAU_COLLAB_WEB_URL  URL of a collab-web client to embed in the tau
 *                    shell's Collab tab (optional).
 *   KIMI_DISABLED=1  Skip the extension entirely.
 *
 * The extension loads (with a warning) even when kimi is not installed;
 * commands fail loud with install instructions instead of silently no-op'ing.
 */

import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { z } from "zod/v4";
import {
	INSTALL_HINT,
	STATUS_KEY,
	binaryCandidates,
	buildPromptArgs,
	parseKimiArgs,
	parseVersion,
	pickBinary,
	resolveTimeoutMs,
	tokenizeArgs,
	truncateOutput,
	type EnvLike,
	type KimiRunResult,
} from "./kimi.ts";
import { KimiWebGateway, type GatewayInfo } from "./web.ts";

const DEBUG = (process.env as EnvLike).KIMI_DEBUG === "1";
const DISABLED = (process.env as EnvLike).KIMI_DISABLED === "1";

function debug(...args: unknown[]): void {
	if (DEBUG) {
		// eslint-disable-next-line no-console
		console.error("[omp-kimi]", ...args);
	}
}

interface KimiState {
	binary: string | null;
	version: string | null;
	gateway: KimiWebGateway | null;
	gatewayInfo: GatewayInfo | null;
}

function isExecutable(path: string): boolean {
	try {
		const f = Bun.file(path);
		return f.size >= 0;
	} catch {
		return false;
	}
}

async function readStream(
	stream: ReadableStream<Uint8Array> | number | null | undefined,
): Promise<string> {
	// Bun types stdio as `number | ReadableStream | undefined` (fd or pipe).
	if (stream instanceof ReadableStream) {
		return new Response(stream as ReadableStream<Uint8Array>).text();
	}
	return "";
}

interface RunOpts {
	cwd: string;
	env?: Record<string, string | undefined>;
	timeoutMs: number;
	signal?: AbortSignal;
}

/** Spawn the kimi binary, enforce a timeout, collect output. Never swallows errors. */
async function runKimi(
	binary: string,
	args: string[],
	opts: RunOpts,
): Promise<KimiRunResult> {
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn([binary, ...args], {
			cwd: opts.cwd,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, ...(opts.env ?? {}) } as Record<string, string>,
		});
	} catch (err) {
		throw new Error(
			`failed to launch kimi (${binary}): ${(err as Error).message}`,
		);
	}

	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		try {
			proc.kill("SIGTERM");
		} catch {
			/* already exited */
		}
	}, opts.timeoutMs);

	const onAbort = (): void => {
		try {
			proc.kill("SIGTERM");
		} catch {
			/* already exited */
		}
	};
	opts.signal?.addEventListener("abort", onAbort, { once: true });

	try {
		const [stdout, stderr, exitCode] = await Promise.all([
			readStream(proc.stdout),
			readStream(proc.stderr),
			proc.exited,
		]);
		if (timedOut) {
			throw new Error(
				`kimi timed out after ${opts.timeoutMs}ms (args: ${args.join(" ")}). ` +
					`Raise KIMI_TIMEOUT_MS if the task legitimately needs longer.`,
			);
		}
		return { exitCode, stdout, stderr, timedOut: false };
	} finally {
		clearTimeout(timer);
		opts.signal?.removeEventListener("abort", onAbort);
	}
}

function requireBinary(state: KimiState): string {
	if (!state.binary) throw new Error(INSTALL_HINT);
	return state.binary;
}

function emitResult(
	pi: ExtensionAPI,
	customType: string,
	stdout: string,
	stderr: string,
): void {
	const parts = [truncateOutput(stdout.trim())];
	const errText = stderr.trim();
	if (errText !== "") {
		parts.push("--- stderr (thinking / tool progress) ---");
		parts.push(truncateOutput(errText));
	}
	pi.sendMessage(
		{
			customType,
			content: parts.join("\n\n"),
			display: true,
			attribution: "agent",
		},
		{ triggerTurn: false },
	);
}

const askParameters = z.object({
	prompt: z.string().min(1).describe("The prompt to send to kimi-code."),
	model: z
		.string()
		.optional()
		.describe("Model alias for this run (kimi -m). Omit for default_model."),
	agent: z
		.string()
		.optional()
		.describe("Agent to run as the main agent (kimi --agent)."),
	timeoutMs: z
		.number()
		.int()
		.min(1000)
		.max(600000)
		.optional()
		.describe("Timeout in ms (default from KIMI_TIMEOUT_MS, 120000)."),
});

export default function kimiExtension(pi: ExtensionAPI): void {
	pi.setLabel("Kimi");
	const env = process.env as EnvLike;
	const state: KimiState = {
		binary: null,
		version: null,
		gateway: null,
		gatewayInfo: null,
	};

	const refreshStatus = (ctx: ExtensionContext): void => {
		if (!state.binary) {
			ctx.ui.setStatus(STATUS_KEY, "kimi: not installed");
			return;
		}
		ctx.ui.setStatus(
			STATUS_KEY,
			`kimi: ${state.version ?? "unknown version"}`,
		);
	};

	const detectBinary = (): void => {
		const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
		const candidates = binaryCandidates(env, home, (n) => Bun.which(n));
		state.binary = pickBinary(candidates, isExecutable);
		debug("binary candidates:", candidates, "picked:", state.binary);
	};

	// ---- Lifecycle ---------------------------------------------------------

	pi.on("session_start", async (_event, ctx) => {
		if (DISABLED) {
			ctx.ui.notify("kimi: KIMI_DISABLED=1, extension inactive", "info");
			return;
		}
		detectBinary();
		if (state.binary) {
			try {
				const r = await runKimi(state.binary, ["--version"], {
					cwd: ctx.cwd,
					timeoutMs: 10_000,
				});
				state.version = parseVersion(r.stdout + r.stderr);
			} catch (err) {
				debug("version probe failed:", err);
			}
		} else {
			ctx.ui.notify(`kimi: ${INSTALL_HINT}`, "warning");
		}
		if (!env.KIMI_API_KEY) {
			ctx.ui.notify(
				"kimi: KIMI_API_KEY is not set — authenticated runs will fail. " +
					"Set it in your environment or run `kimi login`.",
				"warning",
			);
		}
		refreshStatus(ctx);
	});

	pi.on("session_shutdown", async () => {
		if (state.gateway) {
			try {
				await state.gateway.stop();
			} catch {
				/* already gone */
			}
			state.gateway = null;
			state.gatewayInfo = null;
		}
	});

	// ---- /kimi --------------------------------------------------------------

	pi.registerCommand("kimi", {
		description:
			"Run one prompt through kimi-code non-interactively and show the result. " +
			"Flags: --model <alias>, --agent <name>.",
		handler: async (args, ctx) => {
			const binary = requireBinary(state);
			const parsed = parseKimiArgs(args);
			if (!parsed.prompt) {
				ctx.ui.notify(
					"usage: /kimi [--model <alias>] [--agent <name>] <prompt>",
					"warning",
				);
				return;
			}
			ctx.ui.notify("kimi: running…", "info");
			try {
				const r = await runKimi(binary, buildPromptArgs(parsed), {
					cwd: ctx.cwd,
					timeoutMs: resolveTimeoutMs(env),
				});
				if (r.exitCode !== 0) {
					ctx.ui.notify(
						`kimi: exited with code ${r.exitCode}\n${truncateOutput(r.stderr || r.stdout)}`,
						"error",
					);
					return;
				}
				emitResult(pi, "kimi-result", r.stdout, r.stderr);
			} catch (err) {
				ctx.ui.notify(`kimi: ${(err as Error).message}`, "error");
			}
		},
	});

	// ---- /kimi-status --------------------------------------------------------

	pi.registerCommand("kimi-status", {
		description: "Show kimi binary location, version, and auth status.",
		handler: async (_args, ctx) => {
			const lines: string[] = [];
			lines.push(`binary: ${state.binary ?? "(not found)"}`);
			lines.push(`version: ${state.version ?? "(unknown)"}`);
			lines.push(
				`KIMI_API_KEY: ${env.KIMI_API_KEY ? "set" : "NOT SET"}`,
			);
			lines.push(`timeout: ${resolveTimeoutMs(env)}ms (KIMI_TIMEOUT_MS)`);
			lines.push(
				`web UI: ${state.gatewayInfo ? `integrated gateway at ${state.gatewayInfo.url}` : "not running"} (use /kimi-web)`,
			);
			if (!state.binary) lines.push("", INSTALL_HINT);
			emitResult(pi, "kimi-status", lines.join("\n"), "");
			refreshStatus(ctx);
		},
	});

	// ---- /kimi-models --------------------------------------------------------

	pi.registerCommand("kimi-models", {
		description:
			"List configured providers, or browse the public model catalog. " +
			"Usage: /kimi-models [providerId] [--filter <substring>]",
		handler: async (args, ctx) => {
			const binary = requireBinary(state);
			const tokens = tokenizeArgs(args.trim());
			const positional = tokens.filter((t) => !t.startsWith("-"));
			const filterIdx = tokens.indexOf("--filter");
			const filter =
				filterIdx >= 0 && filterIdx + 1 < tokens.length
					? tokens[filterIdx + 1]
					: undefined;
			const provider = positional[0];

			const cmdArgs = provider
				? ["provider", "catalog", "list", provider, "--json"]
				: ["provider", "list", "--json"];
			if (filter) cmdArgs.push("--filter", filter);

			try {
				const r = await runKimi(binary, cmdArgs, {
					cwd: ctx.cwd,
					timeoutMs: 30_000,
				});
				if (r.exitCode !== 0) {
					ctx.ui.notify(
						`kimi: provider query failed (exit ${r.exitCode})\n${truncateOutput(r.stderr || r.stdout)}`,
						"error",
					);
					return;
				}
				let body = r.stdout.trim();
				try {
					const parsed: unknown = JSON.parse(body);
					body = JSON.stringify(parsed, null, 2);
				} catch {
					/* not JSON — show raw */
				}
				emitResult(pi, "kimi-models", body, "");
			} catch (err) {
				ctx.ui.notify(`kimi: ${(err as Error).message}`, "error");
			}
		},
	});

	// ---- /kimi-doctor --------------------------------------------------------

	pi.registerCommand("kimi-doctor", {
		description: "Validate kimi's config.toml and tui.toml.",
		handler: async (_args, ctx) => {
			const binary = requireBinary(state);
			try {
				const r = await runKimi(binary, ["doctor"], {
					cwd: ctx.cwd,
					timeoutMs: 30_000,
				});
				emitResult(
					pi,
					"kimi-doctor",
					`exit code: ${r.exitCode}\n\n${r.stdout.trim()}`,
					r.stderr,
				);
			} catch (err) {
				ctx.ui.notify(`kimi: ${(err as Error).message}`, "error");
			}
		},
	});

	// ---- /kimi-web ------------------------------------------------------------
	// Integrated web UI: ONE gateway on loopback serving kimi's full WebUI
	// plus the tau shell (Kimi + collab-web tabs). This replaces the old
	// behavior of launching `kimi web` detached as a parallel web UI.

	function resolveGatewayPort(args: string): number | null | undefined {
		const tokens = tokenizeArgs(args.trim());
		const portIdx = tokens.indexOf("--port");
		if (portIdx >= 0) {
			if (portIdx + 1 >= tokens.length) return null;
			const port = Number(tokens[portIdx + 1]);
			if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
			return port;
		}
		const fromEnv = Number((process.env as EnvLike).KIMI_WEB_PORT ?? "");
		if (Number.isInteger(fromEnv) && fromEnv >= 1 && fromEnv <= 65535) {
			return fromEnv;
		}
		return undefined; // gateway default
	}

	pi.registerCommand("kimi-web", {
		description:
			"Start the integrated tau+kimi web UI (one gateway on loopback: " +
			"kimi's full WebUI plus the tau shell with collab-web). " +
			"Usage: /kimi-web [--port <n>]",
		handler: async (args, ctx) => {
			const binary = requireBinary(state);
			if (state.gateway) {
				ctx.ui.notify(
					`kimi: web gateway already running at ${state.gatewayInfo?.url ?? "(unknown URL)"} — /kimi-web-stop first`,
					"warning",
				);
				return;
			}
			const port = resolveGatewayPort(args);
			if (port === null) {
				ctx.ui.notify("usage: /kimi-web [--port <1-65535>]", "warning");
				return;
			}
			const gateway = new KimiWebGateway({
				binary,
				cwd: ctx.cwd,
				port: port ?? undefined,
				onLog: (msg) => debug(msg),
			});
			try {
				const info = await gateway.start();
				state.gateway = gateway;
				state.gatewayInfo = info;
			} catch (err) {
				ctx.ui.notify(
					`kimi: web gateway failed to start: ${(err as Error).message}`,
					"error",
				);
				return;
			}
			const info = state.gatewayInfo;
			emitResult(
				pi,
				"kimi-web",
				`tau+kimi web UI running (loopback only):\n\n${info?.url ?? "(unknown URL)"}\n\n` +
					`One URL, one token: kimi's full WebUI plus the tau shell ` +
					`(Kimi + collab-web tabs). Stop it with /kimi-web-stop. ` +
					`The token above is a secret — do not paste it anywhere.`,
				"",
			);
			refreshStatus(ctx);
		},
	});

	pi.registerCommand("kimi-web-stop", {
		description: "Stop the integrated web gateway started by /kimi-web.",
		handler: async (_args, ctx) => {
			if (!state.gateway) {
				ctx.ui.notify("kimi: no web gateway running", "info");
				return;
			}
			try {
				await state.gateway.stop();
			} catch (err) {
				debug("gateway stop failed:", err);
			}
			state.gateway = null;
			state.gatewayInfo = null;
			ctx.ui.notify("kimi: web gateway stopped", "info");
			refreshStatus(ctx);
		},
	});

	// ---- kimi_ask tool ---------------------------------------------------------
	// Typed locally first so deep zod inference stays out of the call site
	// (same pattern as omp-kafka).

	const toolDef = {
		name: "kimi_ask",
		label: "Kimi Ask",
		description:
			"Run one prompt through the kimi-code CLI non-interactively and " +
			"return its output. Use for a second model's take, for tasks kimi " +
			"is configured for, or to reach models only kimi has. Parameters: " +
			"prompt (string, required), model (string, optional model alias), " +
			"agent (string, optional agent name), timeoutMs (integer 1000..600000, " +
			"optional). Fails loudly when kimi is not installed or the run " +
			"times out.",
		parameters: askParameters,
		async execute(
			_id: string,
			params: {
				prompt: string;
				model?: string;
				agent?: string;
				timeoutMs?: number;
			},
			signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const binary = requireBinary(state);
			const r = await runKimi(
				binary,
				buildPromptArgs({
					prompt: params.prompt,
					model: params.model,
					agent: params.agent,
				}),
				{
					cwd: ctx.cwd,
					timeoutMs: params.timeoutMs ?? resolveTimeoutMs(env),
					signal,
				},
			);
			if (r.exitCode !== 0) {
				return {
					content: [
						{
							type: "text" as const,
							text:
								`kimi exited with code ${r.exitCode}\n` +
								truncateOutput(r.stderr || r.stdout),
						},
					],
					details: { exitCode: r.exitCode, timedOut: false },
					isError: true,
				};
			}
			const text = truncateOutput(r.stdout.trim());
			const thinking = r.stderr.trim();
			return {
				content: [
					{
						type: "text" as const,
						text:
							thinking !== ""
								? `${text}\n\n--- stderr (thinking / tool progress) ---\n${truncateOutput(thinking)}`
								: text,
					},
				],
				details: { exitCode: 0, timedOut: false },
			};
		},
	};
	// Cast through `unknown`: the deeply-recursive zod type does not satisfy
	// the registerTool parameter constraint (same as omp-kafka).
	pi.registerTool(toolDef as unknown as Parameters<typeof pi.registerTool>[0]);
}
