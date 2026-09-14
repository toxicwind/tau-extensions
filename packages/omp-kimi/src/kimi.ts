/**
 * omp-kimi — pure helpers for locating and driving the kimi-code CLI.
 *
 * All filesystem/process lookups are injected so the logic is unit-testable
 * without a real kimi installation.
 */

export const STATUS_KEY = "kimi";
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_WEB_PORT = 58627;

export const INSTALL_HINT =
	"kimi-code CLI not found. Install it: " +
	"curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash " +
	"(or: npm install -g @moonshot-ai/kimi-code), then re-run /kimi-status.";

export interface EnvLike {
	KIMI_BINARY?: string;
	KIMI_API_KEY?: string;
	KIMI_TIMEOUT_MS?: string;
	KIMI_DISABLED?: string;
	KIMI_DEBUG?: string;
	[key: string]: string | undefined;
}

/** Ordered binary candidates: explicit override, PATH, then the native-install default. */
export function binaryCandidates(
	env: EnvLike,
	homeDir: string,
	which: (name: string) => string | null,
): string[] {
	const out: string[] = [];
	if (env.KIMI_BINARY && env.KIMI_BINARY.trim() !== "") {
		out.push(env.KIMI_BINARY.trim());
	}
	const onPath = which("kimi");
	if (onPath) out.push(onPath);
	out.push(`${homeDir}/.kimi-code/bin/kimi`);
	return [...new Set(out)];
}

/** First candidate that exists and is executable. */
export function pickBinary(
	candidates: string[],
	isExecutable: (path: string) => boolean,
): string | null {
	for (const c of candidates) {
		try {
			if (isExecutable(c)) return c;
		} catch {
			// A throwing stat is the same as "not usable" — keep looking.
		}
	}
	return null;
}

export function resolveTimeoutMs(env: EnvLike): number {
	const raw = env.KIMI_TIMEOUT_MS;
	if (!raw) return DEFAULT_TIMEOUT_MS;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TIMEOUT_MS;
}

/** Extract a version like "0.42.0" from `kimi --version` output. */
export function parseVersion(output: string): string | null {
	const m = output.match(/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
	return m?.[1] ?? null;
}

export interface PromptOptions {
	prompt: string;
	model?: string;
	agent?: string;
	addDir?: string[];
}

/** argv for `kimi -p <prompt>` (non-interactive; auto permission policy). */
export function buildPromptArgs(opts: PromptOptions): string[] {
	const args = ["-p", opts.prompt];
	if (opts.model) args.push("-m", opts.model);
	if (opts.agent) args.push("--agent", opts.agent);
	for (const d of opts.addDir ?? []) args.push("--add-dir", d);
	return args;
}

export interface WebOptions {
	port?: number;
	host?: string;
	noOpen?: boolean;
}

/** argv for `kimi web`. Never passes --dangerous-bypass-auth. */
export function buildWebArgs(opts: WebOptions): string[] {
	const args = ["web"];
	if (opts.port !== undefined) args.push("--port", String(opts.port));
	if (opts.host !== undefined) args.push("--host", opts.host);
	if (opts.noOpen) args.push("--no-open");
	return args;
}

/** Quote-aware tokenizer for slash-command args. */
export function tokenizeArgs(input: string): string[] {
	const tokens: string[] = [];
	let cur = "";
	let quote: string | null = null;
	for (let i = 0; i < input.length; i++) {
		const ch = input[i] as string;
		if (quote) {
			if (ch === quote) {
				quote = null;
			} else if (ch === "\\" && i + 1 < input.length) {
				cur += input[i + 1];
				i++;
			} else {
				cur += ch;
			}
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (/\s/.test(ch)) {
			if (cur !== "") {
				tokens.push(cur);
				cur = "";
			}
		} else {
			cur += ch;
		}
	}
	if (cur !== "") tokens.push(cur);
	return tokens;
}

export interface ParsedKimiArgs {
	prompt: string;
	model?: string;
	agent?: string;
}

/**
 * Parse `/kimi [--model <alias>] [--agent <name>] <prompt...>`.
 * Unknown flags are left in the prompt verbatim rather than rejected —
 * the CLI owns flag validation.
 */
export function parseKimiArgs(raw: string): ParsedKimiArgs {
	const tokens = tokenizeArgs(raw.trim());
	let model: string | undefined;
	let agent: string | undefined;
	const rest: string[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i] as string;
		if ((t === "--model" || t === "-m") && i + 1 < tokens.length) {
			model = tokens[i + 1];
			i++;
		} else if (t === "--agent" && i + 1 < tokens.length) {
			agent = tokens[i + 1];
			i++;
		} else {
			rest.push(t);
		}
	}
	return { prompt: rest.join(" "), model, agent };
}

export interface KimiRunResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

/** Trim huge outputs so a runaway agent transcript can't flood the session. */
export function truncateOutput(text: string, maxChars = 20_000): string {
	if (text.length <= maxChars) return text;
	return (
		text.slice(0, maxChars) +
		`\n… [truncated ${text.length - maxChars} chars]`
	);
}
