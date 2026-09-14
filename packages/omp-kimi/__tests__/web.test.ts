/**
 * Tests for the unified web gateway's pure helpers (src/web.ts).
 * The Gateway class itself needs Bun.serve + a kimi backend; its pure
 * pieces (banner parsing, token handling, header/URL rewriting, shell HTML)
 * are covered here.
 */
import { describe, expect, test } from "bun:test";

import {
	backendWsProtocol,
	buildShellHtml,
	buildUpstreamHeaders,
	extractWsToken,
	generateGatewayToken,
	parseBackendBanner,
	requestToken,
	resolveCollabWeb,
	stripTokenParam,
	WS_BEARER_PROTOCOL_PREFIX,
} from "../src/web.ts";

describe("generateGatewayToken", () => {
	test("produces unique, URL-safe tokens", () => {
		const a = generateGatewayToken();
		const b = generateGatewayToken();
		expect(a).not.toBe(b);
		expect(a.length).toBeGreaterThan(20);
		expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
	});
});

describe("parseBackendBanner", () => {
	test("parses the documented banner shape", () => {
		const banner = [
			"Local:   http://127.0.0.1:58628/#token=abc123def",
			"Token: abc123def",
			"Stop:    Ctrl+C",
		].join("\n");
		const info = parseBackendBanner(banner);
		expect(info).not.toBeNull();
		expect(info?.url).toBe("http://127.0.0.1:58628/");
		expect(info?.token).toBe("abc123def");
		expect(info?.port).toBe(58628);
	});

	test("falls back to the Token: line when the URL has no fragment", () => {
		const banner = "Local:   http://127.0.0.1:58627/\nToken: zz-top-secret\n";
		const info = parseBackendBanner(banner);
		expect(info?.token).toBe("zz-top-secret");
		expect(info?.port).toBe(58627);
	});

	test("returns null when no URL/token is present", () => {
		expect(parseBackendBanner("starting…\n")).toBeNull();
		expect(parseBackendBanner("Local: http://x/\n")).toBeNull();
	});
});

describe("extractWsToken", () => {
	test("extracts the kimi bearer subprotocol token", () => {
		expect(
			extractWsToken(`${WS_BEARER_PROTOCOL_PREFIX}tok123`),
		).toBe("tok123");
	});

	test("handles multi-protocol headers", () => {
		expect(
			extractWsToken(`other, ${WS_BEARER_PROTOCOL_PREFIX}tok123`),
		).toBe("tok123");
	});

	test("returns null for missing/empty tokens", () => {
		expect(extractWsToken(null)).toBeNull();
		expect(extractWsToken(undefined)).toBeNull();
		expect(extractWsToken("unrelated")).toBeNull();
		expect(extractWsToken(WS_BEARER_PROTOCOL_PREFIX)).toBeNull();
	});

	test("backendWsProtocol round-trips", () => {
		expect(extractWsToken(backendWsProtocol("abc"))).toBe("abc");
	});
});

describe("requestToken", () => {
	const url = (s: string) => new URL(s);
	test("prefers the Authorization header", () => {
		const req = new Request("http://x/", {
			headers: { authorization: "Bearer headertok" },
		});
		expect(requestToken(req, url("http://x/?token=querytok"))).toBe(
			"headertok",
		);
	});
	test("falls back to ?token=", () => {
		const req = new Request("http://x/");
		expect(requestToken(req, url("http://x/?token=querytok"))).toBe(
			"querytok",
		);
	});
	test("returns null when absent", () => {
		expect(requestToken(new Request("http://x/"), url("http://x/"))).toBeNull();
	});
});

describe("buildUpstreamHeaders", () => {
	test("swaps the bearer token and drops host", () => {
		const req = new Request("http://gw/api/v1/x", {
			headers: {
				authorization: "Bearer gateway-tok",
				host: "127.0.0.1:9999",
				"x-keep": "yes",
			},
		});
		const out = buildUpstreamHeaders(req, "backend-tok");
		expect(out.get("authorization")).toBe("Bearer backend-tok");
		expect(out.get("host")).toBeNull();
		expect(out.get("x-keep")).toBe("yes");
	});
	test("leaves requests without auth untouched", () => {
		const out = buildUpstreamHeaders(
			new Request("http://gw/"),
			"backend-tok",
		);
		expect(out.get("authorization")).toBeNull();
	});
});

describe("stripTokenParam", () => {
	test("removes token and keeps the rest", () => {
		expect(stripTokenParam("?token=abc&a=1")).toBe("?a=1");
		expect(stripTokenParam("?a=1&token=abc")).toBe("?a=1");
		expect(stripTokenParam("?token=abc")).toBe("");
		expect(stripTokenParam("")).toBe("");
		expect(stripTokenParam("?a=1")).toBe("?a=1");
	});
});

describe("resolveCollabWeb", () => {
	test("honors TAU_COLLAB_WEB_URL", () => {
		expect(
			resolveCollabWeb({ TAU_COLLAB_WEB_URL: "http://localhost:3000" }),
		).toEqual({ kind: "url", url: "http://localhost:3000" });
	});
	test("reports none when unset", () => {
		expect(resolveCollabWeb({})).toEqual({ kind: "none" });
	});
});

describe("buildShellHtml", () => {
	test("embeds the gateway token and both panes", () => {
		const html = buildShellHtml({
			gatewayToken: "gw-tok",
			collabWeb: { kind: "url", url: "http://localhost:3000" },
		});
		expect(html).toContain("gw-tok");
		expect(html).toContain('id="pane-kimi"');
		expect(html).toContain('id="pane-collab"');
		expect(html).toContain("http://localhost:3000");
	});
	test("shows collab setup hint when unconfigured", () => {
		const html = buildShellHtml({
			gatewayToken: "gw-tok",
			collabWeb: { kind: "none" },
		});
		expect(html).toContain("TAU_COLLAB_WEB_URL");
		expect(html).toContain("my.omp.sh");
	});
	test("escapes collab URLs", () => {
		const html = buildShellHtml({
			gatewayToken: "t",
			collabWeb: { kind: "url", url: 'http://x/"><script>' },
		});
		expect(html).not.toContain('"><script>');
		expect(html).toContain("&quot;");
	});
});
