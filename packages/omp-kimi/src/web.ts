/**
 * omp-kimi unified web gateway.
 *
 * Why this exists
 * ---------------
 * kimi-code ships a complete WebUI (streaming chat, approvals, file diffs,
 * session management, settings) as a prebuilt bundle served by its kap-server
 * backend (`kimi web`). The WebUI is the valuable surface; the TUI is
 * explicitly out of scope for this extension.
 *
 * The naive integration — `/kimi-web` launching `kimi web` detached on its own
 * port with its own bearer token — creates a PARALLEL web UI: a second port, a
 * second URL, a second auth token, disconnected from tau's web story
 * (collab-web). This module instead provides ONE web surface:
 *
 *   - a single Bun server on loopback (one port, one URL, one token),
 *   - kimi's full WebUI proxied at the root path `/` — its absolute asset and
 *     API paths keep working untouched, and the backend bearer token is
 *     swapped server-side so it is never exposed to the browser,
 *   - WebSocket channels relayed with the same token swap (the frontend builds
 *     WS URLs from window.location, so they land on the gateway),
 *   - a tau shell at `/tau/` presenting Kimi and tau's collab-web side by
 *     side instead of as two separate browser tabs/ports.
 *
 * The kimi backend stays a managed child process (`kimi web --no-open`) bound
 * to loopback; its port and token are an implementation detail. The gateway
 * token is the only credential the user ever sees.
 *
 * Security notes
 * --------------
 * - Loopback-only by default. Do not bind LAN unless you understand that the
 *   gateway token then guards shell + proxied API access.
 * - The backend token is parsed from the `kimi web` banner and kept in memory
 *   only; it is injected into upstream `Authorization` headers and never sent
 *   to the browser.
 * - `?token=` query params are stripped before proxying so tokens do not leak
 *   into backend access logs via URLs.
 */

import { randomBytes } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { buildWebArgs, DEFAULT_WEB_PORT } from "./kimi.ts";

/** WS subprotocol prefix kap-server uses for bearer auth (mirrors upstream). */
export const WS_BEARER_PROTOCOL_PREFIX = "kimi-code.bearer.";

export const DEFAULT_GATEWAY_PORT = DEFAULT_WEB_PORT;
export const GATEWAY_TOKEN_BYTES = 32;

export interface BackendInfo {
	/** Origin, e.g. http://127.0.0.1:58628 */
	url: string;
	/** Backend bearer token parsed from the startup banner. */
	token: string;
	port: number;
}

/** Short unpredictable token for the gateway front door. */
export function generateGatewayToken(): string {
	return randomBytes(GATEWAY_TOKEN_BYTES).toString("base64url");
}

/**
 * Parse a `kimi web` startup banner for the access URL and token.
 * The banner prints `Local: http://127.0.0.1:<port>/#token=...` and a
 * `Token: ...` line; either is accepted.
 */
export function parseBackendBanner(banner: string): BackendInfo | null {
	const urlMatch = banner.match(/https?:\/\/[^\s"']+/);
	if (!urlMatch) return null;
	const url = urlMatch[0].replace(/[#?].*$/, (m) => m); // keep fragment for token parse
	let token: string | null = null;
	const fragMatch = url.match(/[#?]token=([^&\s"']+)/);
	if (fragMatch) token = fragMatch[1] ?? null;
	if (!token) {
		const lineMatch = banner.match(/^[Tt]oken:\s*(\S+)/m);
		if (lineMatch) token = lineMatch[1] ?? null;
	}
	if (!token) return null;
	const cleanUrl = url.replace(/[#?].*$/, "");
	const portMatch = cleanUrl.match(/:(\d+)(?:\/|$)/);
	const port = portMatch ? Number(portMatch[1]) : 0;
	return { url: cleanUrl, token, port };
}

/** Extract the bearer token from a WS `Sec-WebSocket-Protocol` header. */
export function extractWsToken(
	protocolHeader: string | null | undefined,
): string | null {
	if (!protocolHeader) return null;
	for (const entry of protocolHeader.split(",")) {
		const p = entry.trim();
		if (p.startsWith(WS_BEARER_PROTOCOL_PREFIX)) {
			const t = p.slice(WS_BEARER_PROTOCOL_PREFIX.length);
			return t.length > 0 ? t : null;
		}
	}
	return null;
}

/** Build the WS subprotocol value to present to the backend. */
export function backendWsProtocol(backendToken: string): string {
	return `${WS_BEARER_PROTOCOL_PREFIX}${backendToken}`;
}

/** Pull the caller's token from `Authorization: Bearer` or `?token=`. */
export function requestToken(req: Request, url: URL): string | null {
	const auth = req.headers.get("authorization");
	if (auth && auth.toLowerCase().startsWith("bearer ")) {
		return auth.slice(7).trim() || null;
	}
	return url.searchParams.get("token");
}

/**
 * Rewrite request headers for the upstream backend: drop hop-by-hop junk and
 * swap the gateway bearer token for the backend token.
 */
export function buildUpstreamHeaders(
	req: Request,
	backendToken: string,
): Headers {
	const headers = new Headers(req.headers);
	headers.delete("host");
	headers.delete("content-length");
	const auth = headers.get("authorization");
	if (auth && auth.toLowerCase().startsWith("bearer ")) {
		headers.set("authorization", `Bearer ${backendToken}`);
	}
	return headers;
}

/** Strip `?token=` / `&token=` from a query string before proxying upstream. */
export function stripTokenParam(search: string): string {
	const params = new URLSearchParams(search);
	params.delete("token");
	const rest = params.toString();
	return rest ? `?${rest}` : "";
}

export type CollabWebRef =
	| { kind: "url"; url: string }
	| { kind: "none" };

/**
 * Resolve where tau's collab-web UI lives, if anywhere.
 * `TAU_COLLAB_WEB_URL` wins; otherwise we report none and the shell shows a
 * link to the hosted client plus `/collab` instructions.
 */
export function resolveCollabWeb(
	env: Record<string, string | undefined>,
): CollabWebRef {
	const url = env.TAU_COLLAB_WEB_URL?.trim();
	if (url) return { kind: "url", url };
	return { kind: "none" };
}

export interface ShellOpts {
	gatewayToken: string;
	collabWeb: CollabWebRef;
}

/** The unified tau shell: Kimi and collab-web as tabs, one token. */
export function buildShellHtml(opts: ShellOpts): string {
	const collabPane =
		opts.collabWeb.kind === "url"
			? `<iframe src="${escapeHtml(opts.collabWeb.url)}" title="Tau collab-web"></iframe>`
			: `<div class="placeholder">
				<h2>Tau collab-web</h2>
				<p>No local collab-web URL configured.</p>
				<p>Host a session from any omp instance with <code>/collab</code>, then open
				<a href="https://my.omp.sh" target="_blank" rel="noopener">my.omp.sh</a>
				and paste the link — or set <code>TAU_COLLAB_WEB_URL</code> to embed it here.</p>
			</div>`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tau Web — Kimi + Collab</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
header { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
	border-bottom: 1px solid #8884; }
header h1 { font-size: 15px; margin: 0 12px 0 0; font-weight: 600; }
.tab { border: 1px solid #8886; background: transparent; color: inherit;
	padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.tab.active { background: #8883; font-weight: 600; }
main { height: calc(100% - 53px); }
.pane { display: none; height: 100%; }
.pane.active { display: block; }
iframe { width: 100%; height: 100%; border: 0; }
.placeholder { padding: 32px; max-width: 640px; }
code { background: #8882; padding: 1px 6px; border-radius: 4px; }
</style>
</head>
<body>
<header>
<h1>Tau Web</h1>
<button class="tab active" data-pane="kimi">Kimi</button>
<button class="tab" data-pane="collab">Collab</button>
</header>
<main>
<div class="pane active" id="pane-kimi">
<iframe src="/?token=${encodeURIComponent(opts.gatewayToken)}#token=${encodeURIComponent(opts.gatewayToken)}" title="Kimi WebUI"></iframe>
</div>
<div class="pane" id="pane-collab">${collabPane}</div>
</main>
<script>
document.querySelectorAll('.tab').forEach(function (btn) {
	btn.addEventListener('click', function () {
		document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
		document.querySelectorAll('.pane').forEach(function (p) { p.classList.remove('active'); });
		btn.classList.add('active');
		document.getElementById('pane-' + btn.dataset.pane).classList.add('active');
	});
});
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
/**
 * KimiWebGateway — lifecycle + proxy implementation.
 * (Same file as the pure helpers above; this half needs Bun.)
 */

const BACKEND_BANNER_TIMEOUT_MS = 15_000;
const MAX_PORT_ATTEMPTS = 20;

export interface GatewayOptions {
	binary: string;
	cwd: string;
	env?: Record<string, string | undefined>;
	/** Preferred gateway port; auto-increments on conflict. */
	port?: number;
	/** Preferred backend port; kimi auto-increments on conflict. */
	backendPort?: number;
	onLog?: (msg: string) => void;
}

export interface GatewayInfo {
	/** Unified entry URL (tau shell). */
	url: string;
	token: string;
	gatewayPort: number;
	backend: BackendInfo;
}

async function readStream(
	stream: ReadableStream<Uint8Array> | null | undefined,
): Promise<string> {
	if (!stream || !(stream instanceof ReadableStream)) return "";
	return new Response(stream as ReadableStream<Uint8Array>).text();
}

interface WsRelayState {
	backend: WebSocket;
	queue: (string | ArrayBuffer)[];
	backendOpen: boolean;
	clientClosed: boolean;
}

interface GatewayWsData {
	path: string;
	relay?: WsRelayState;
}

/** Copy a Buffer into a standalone ArrayBuffer (DOM WebSocket.send wants one). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
	return new Uint8Array(buf).buffer as ArrayBuffer;
}

export class KimiWebGateway {
	private readonly opts: GatewayOptions;
	private readonly gatewayToken = generateGatewayToken();
	private backendProc: ReturnType<typeof Bun.spawn> | null = null;
	private server: ReturnType<typeof Bun.serve> | null = null;
	private backend: BackendInfo | null = null;
	private gatewayPort = 0;

	constructor(opts: GatewayOptions) {
		this.opts = opts;
	}

	get running(): boolean {
		return this.server !== null && this.backendProc !== null;
	}

	get info(): GatewayInfo | null {
		if (!this.backend || this.gatewayPort === 0) return null;
		return {
			url: `http://127.0.0.1:${this.gatewayPort}/tau/?token=${this.gatewayToken}`,
			token: this.gatewayToken,
			gatewayPort: this.gatewayPort,
			backend: this.backend,
		};
	}

	private log(msg: string): void {
		this.opts.onLog?.(`[kimi-gateway] ${msg}`);
	}

	/** Start backend + gateway. Resolves with the single entry URL + token. */
	async start(): Promise<GatewayInfo> {
		if (this.running) {
			const info = this.info;
			if (info) return info;
			await this.stop();
		}
		const backend = await this.startBackend();
		this.backend = backend;
		this.gatewayPort = await this.startServer();
		const info = this.info;
		if (!info) throw new Error("gateway failed to initialize");
		this.log(`up at ${info.url} (backend ${backend.url})`);
		return info;
	}

	async stop(): Promise<void> {
		if (this.server) {
			try {
				this.server.stop(true);
			} catch {
				/* already stopped */
			}
			this.server = null;
		}
		if (this.backendProc) {
			try {
				this.backendProc.kill("SIGTERM");
			} catch {
				/* already gone */
			}
			this.backendProc = null;
		}
		this.backend = null;
		this.gatewayPort = 0;
		this.log("stopped");
	}

	// ---- backend ---------------------------------------------------------

	private async startBackend(): Promise<BackendInfo> {
		const preferred =
			this.opts.backendPort ?? (this.opts.port ?? DEFAULT_GATEWAY_PORT) + 1;
		// Single-sourced `kimi web` argv (never --dangerous-bypass-auth).
		const args = buildWebArgs({ port: preferred, noOpen: true });
		let proc: ReturnType<typeof Bun.spawn>;
		try {
			proc = Bun.spawn([this.opts.binary, ...args], {
				cwd: this.opts.cwd,
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, ...(this.opts.env ?? {}) } as Record<
					string,
					string
				>,
			});
		} catch (err) {
			throw new Error(
				`failed to launch kimi backend (${this.opts.binary}): ${(err as Error).message}`,
			);
		}

		const deadline = Date.now() + BACKEND_BANNER_TIMEOUT_MS;
		let banner = "";
		try {
			const src =
				proc.stdout instanceof ReadableStream
					? (proc.stdout as ReadableStream<Uint8Array>)
					: proc.stderr instanceof ReadableStream
						? (proc.stderr as ReadableStream<Uint8Array>)
						: null;
			if (src) {
				const reader = src.getReader();
				while (Date.now() < deadline) {
					const { done, value } = await reader.read();
					if (done) break;
					banner += new TextDecoder().decode(value);
					if (/https?:\/\/[^\s"']+/.test(banner) && /[Tt]oken/.test(banner)) break;
				}
				reader.releaseLock();
			}
		} catch (err) {
			this.log(`backend banner read issue: ${(err as Error).message}`);
		}

		const info = parseBackendBanner(banner);
		if (!info) {
			try {
				proc.kill("SIGTERM");
			} catch {
				/* already gone */
			}
			throw new Error(
				"kimi backend did not print an access URL within 15s — not started.\n" +
					banner.slice(0, 2000),
			);
		}
		// Drain so the pipes never block the backend.
		void readStream(
			proc.stdout as ReadableStream<Uint8Array> | null,
		).catch(() => {});
		void readStream(
			proc.stderr as ReadableStream<Uint8Array> | null,
		).catch(() => {});
		this.backendProc = proc;
		this.log(`backend at ${info.url}`);
		return info;
	}

	// ---- gateway server ----------------------------------------------------

	private async startServer(): Promise<number> {
		const backend = this.backend;
		if (!backend) throw new Error("backend not started");
		const gatewayToken = this.gatewayToken;
		const self = this;

		const handleHttp = async (req: Request): Promise<Response> => {
			const url = new URL(req.url);
			const callerToken = requestToken(req, url);

			// Tau shell (our HTML): gateway token required.
			if (url.pathname === "/tau/" || url.pathname === "/tau") {
				if (callerToken !== gatewayToken) {
					return new Response("unauthorized", { status: 401 });
				}
				const collabWeb = resolveCollabWeb(
					process.env as Record<string, string | undefined>,
				);
				return new Response(
					buildShellHtml({ gatewayToken, collabWeb }),
					{ headers: { "content-type": "text/html; charset=utf-8" } },
				);
			}
			if (url.pathname === "/tau/api/status") {
				if (callerToken !== gatewayToken) {
					return new Response("unauthorized", { status: 401 });
				}
				return Response.json({
					ok: true,
					gatewayPort: self.gatewayPort,
					backend: backend.url,
				});
			}

			// Everything else proxies to the kimi backend (its WebUI).
			// API/WS routes need the token; the static shell is loopback-open
			// exactly like `kimi web` itself (fragment token never reaches us).
			const needsAuth =
				url.pathname.startsWith("/api/") ||
				url.pathname.startsWith("/ws") ||
				url.pathname.startsWith("/kap/");
			if (needsAuth && callerToken !== gatewayToken) {
				return new Response("unauthorized", { status: 401 });
			}
			const target =
				backend.url + url.pathname + stripTokenParam(url.search);
			const headers = buildUpstreamHeaders(req, backend.token);
			try {
				return await fetch(target, {
					method: req.method,
					headers,
					body: req.body,
					// Required when forwarding a stream body.
					duplex: "half",
				} as RequestInit);
			} catch (err) {
				return new Response(
					`backend unreachable: ${(err as Error).message}`,
					{ status: 502 },
				);
			}
		};

		let port = this.opts.port ?? DEFAULT_GATEWAY_PORT;
		let lastErr: unknown = null;
		for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
			try {
				const server = Bun.serve<GatewayWsData>({
					hostname: "127.0.0.1",
					port,
					fetch(req, server) {
						const upgrade = req.headers
							.get("upgrade")
							?.toLowerCase();
						if (upgrade === "websocket") {
							const url = new URL(req.url);
							const proto = req.headers.get("sec-websocket-protocol");
							const tok = extractWsToken(proto);
							if (tok !== gatewayToken) {
								return new Response("unauthorized", { status: 401 });
							}
							const ok = server.upgrade(req, {
								data: { path: url.pathname + url.search },
								headers: proto
									? { "Sec-WebSocket-Protocol": proto }
									: undefined,
							});
							if (!ok) {
								return new Response("websocket upgrade failed", {
									status: 500,
								});
							}
							return undefined as unknown as Response;
						}
						return handleHttp(req);
					},
					websocket: {
						open(ws) {
							self.openRelay(ws, backend);
						},
						message(ws, message) {
							const st = ws.data.relay;
							if (!st || st.clientClosed) return;
							const payload: string | ArrayBuffer =
								typeof message === "string"
									? message
									: toArrayBuffer(message);
							if (st.backendOpen) {
								try {
									st.backend.send(payload);
								} catch {
									/* backend gone */
								}
							} else {
								st.queue.push(payload);
							}
						},
						close(ws) {
							const st = ws.data.relay;
							if (st) {
								st.clientClosed = true;
								try {
									st.backend.close();
								} catch {
									/* already closed */
								}
							}
						},
					},
				});
				this.server = server;
				const boundPort = server.port ?? port;
				this.log(`listening on 127.0.0.1:${boundPort}`);
				return boundPort;
			} catch (err) {
				lastErr = err;
				port++;
			}
		}
		throw new Error(
			`could not bind gateway port after ${MAX_PORT_ATTEMPTS} attempts: ${(lastErr as Error)?.message ?? lastErr}`,
		);
	}

	/** Relay one client WS <-> backend WS, swapping the bearer subprotocol. */
	private openRelay(
		ws: ServerWebSocket<GatewayWsData>,
		backend: BackendInfo,
	): void {
		const path = ws.data.path;
		const qIndex = path.indexOf("?");
		const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path;
		const search = qIndex >= 0 ? path.slice(qIndex) : "";
		const wsUrl =
			backend.url.replace(/^http/, "ws") + pathname + stripTokenParam(search);
		const state: WsRelayState = {
			backend: null as unknown as WebSocket,
			queue: [],
			backendOpen: false,
			clientClosed: false,
		};
		ws.data.relay = state;
		let upstream: WebSocket;
		try {
			upstream = new WebSocket(wsUrl, [backendWsProtocol(backend.token)]);
		} catch (err) {
			this.log(`ws dial failed: ${(err as Error).message}`);
			try {
				ws.close();
			} catch {
				/* ignore */
			}
			return;
		}
		state.backend = upstream;
		upstream.onopen = () => {
			state.backendOpen = true;
			for (const m of state.queue) {
				try {
					upstream.send(m);
				} catch {
					/* ignore */
				}
			}
			state.queue = [];
		};
		upstream.onmessage = (ev) => {
			if (state.clientClosed) return;
			try {
				ws.send(ev.data);
			} catch {
				/* client gone */
			}
		};
		upstream.onclose = () => {
			if (!state.clientClosed) {
				try {
					ws.close();
				} catch {
					/* ignore */
				}
			}
		};
		upstream.onerror = () => {
			try {
				upstream.close();
			} catch {
				/* ignore */
			}
		};
	}
}
