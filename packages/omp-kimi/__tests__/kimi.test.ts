import { describe, it, expect } from "bun:test";
import {
	binaryCandidates,
	buildPromptArgs,
	buildWebArgs,
	parseKimiArgs,
	parseVersion,
	pickBinary,
	resolveTimeoutMs,
	tokenizeArgs,
	truncateOutput,
	DEFAULT_TIMEOUT_MS,
	DEFAULT_WEB_PORT,
} from "../src/kimi.ts";

describe("binaryCandidates", () => {
	it("prefers KIMI_BINARY, then PATH, then ~/.kimi-code/bin/kimi", () => {
		const c = binaryCandidates(
			{ KIMI_BINARY: "/opt/kimi" },
			"/home/u",
			(n) => (n === "kimi" ? "/usr/bin/kimi" : null),
		);
		expect(c).toEqual(["/opt/kimi", "/usr/bin/kimi", "/home/u/.kimi-code/bin/kimi"]);
	});

	it("skips PATH when kimi is not on it", () => {
		const c = binaryCandidates({}, "/home/u", () => null);
		expect(c).toEqual(["/home/u/.kimi-code/bin/kimi"]);
	});

	it("dedupes identical candidates", () => {
		const c = binaryCandidates(
			{ KIMI_BINARY: "/home/u/.kimi-code/bin/kimi" },
			"/home/u",
			() => null,
		);
		expect(c).toEqual(["/home/u/.kimi-code/bin/kimi"]);
	});
});

describe("pickBinary", () => {
	it("returns the first executable candidate", () => {
		const ok = new Set(["/b"]);
		const got = pickBinary(["/a", "/b", "/c"], (p) => ok.has(p));
		expect(got).toBe("/b");
	});

	it("returns null when nothing is executable", () => {
		expect(pickBinary(["/a", "/b"], () => false)).toBeNull();
	});

	it("treats a throwing stat as not usable", () => {
		const got = pickBinary(["/a", "/b"], (p) => {
			if (p === "/a") throw new Error("EACCES");
			return true;
		});
		expect(got).toBe("/b");
	});
});

describe("resolveTimeoutMs", () => {
	it("defaults to 120s", () => {
		expect(resolveTimeoutMs({})).toBe(DEFAULT_TIMEOUT_MS);
		expect(DEFAULT_TIMEOUT_MS).toBe(120_000);
	});

	it("honors KIMI_TIMEOUT_MS", () => {
		expect(resolveTimeoutMs({ KIMI_TIMEOUT_MS: "5000" })).toBe(5000);
	});

	it("falls back on garbage", () => {
		expect(resolveTimeoutMs({ KIMI_TIMEOUT_MS: "nope" })).toBe(DEFAULT_TIMEOUT_MS);
		expect(resolveTimeoutMs({ KIMI_TIMEOUT_MS: "-3" })).toBe(DEFAULT_TIMEOUT_MS);
	});
});

describe("parseVersion", () => {
	it("extracts semver from --version output", () => {
		expect(parseVersion("0.42.0\n")).toBe("0.42.0");
		expect(parseVersion("kimi-code 0.29.2 (abc123)")).toBe("0.29.2");
	});

	it("returns null when no version is present", () => {
		expect(parseVersion("no version here")).toBeNull();
	});
});

describe("buildPromptArgs", () => {
	it("builds a minimal -p invocation", () => {
		expect(buildPromptArgs({ prompt: "hi" })).toEqual(["-p", "hi"]);
	});

	it("adds model, agent, and extra dirs", () => {
		expect(
			buildPromptArgs({
				prompt: "hi",
				model: "kimi-code/kimi-k2",
				agent: "reviewer",
				addDir: ["/x", "/y"],
			}),
		).toEqual([
			"-p",
			"hi",
			"-m",
			"kimi-code/kimi-k2",
			"--agent",
			"reviewer",
			"--add-dir",
			"/x",
			"--add-dir",
			"/y",
		]);
	});
});

describe("buildWebArgs", () => {
	it("never passes --dangerous-bypass-auth", () => {
		const args = buildWebArgs({ port: 58628, noOpen: true });
		expect(args).toEqual(["web", "--port", "58628", "--no-open"]);
		expect(args.join(" ")).not.toContain("dangerous");
	});

	it("supports a bare host bind", () => {
		expect(buildWebArgs({ host: "0.0.0.0" })).toEqual([
			"web",
			"--host",
			"0.0.0.0",
		]);
	});

	it("defaults are sane", () => {
		expect(DEFAULT_WEB_PORT).toBe(58627);
		expect(buildWebArgs({})).toEqual(["web"]);
	});
});

describe("tokenizeArgs", () => {
	it("splits on whitespace", () => {
		expect(tokenizeArgs("a b  c")).toEqual(["a", "b", "c"]);
	});

	it("respects double and single quotes", () => {
		expect(tokenizeArgs('--model "my model" hello')).toEqual([
			"--model",
			"my model",
			"hello",
		]);
		expect(tokenizeArgs("it's 'a b'")).toEqual(["it's", "a b"]);
	});

	it("handles escapes inside quotes", () => {
		expect(tokenizeArgs('"a\\"b"')).toEqual(['a"b']);
	});
});

describe("parseKimiArgs", () => {
	it("extracts --model and --agent, leaving the prompt", () => {
		const p = parseKimiArgs('--model kimi-k2 --agent reviewer explain this diff');
		expect(p).toEqual({
			prompt: "explain this diff",
			model: "kimi-k2",
			agent: "reviewer",
		});
	});

	it("supports -m shorthand and quoted prompts", () => {
		const p = parseKimiArgs('-m kimi-k2 "summarize the repo"');
		expect(p.prompt).toBe("summarize the repo");
		expect(p.model).toBe("kimi-k2");
		expect(p.agent).toBeUndefined();
	});

	it("leaves unknown flags in the prompt", () => {
		const p = parseKimiArgs("--frobnicator 9000 do the thing");
		expect(p.prompt).toBe("--frobnicator 9000 do the thing");
	});
});

describe("truncateOutput", () => {
	it("passes short text through", () => {
		expect(truncateOutput("abc")).toBe("abc");
	});

	it("truncates long text with a marker", () => {
		const t = truncateOutput("x".repeat(30), 10);
		expect(t.startsWith("xxxxxxxxxx")).toBe(true);
		expect(t).toContain("truncated 20 chars");
	});
});
