// rawhide — unvarnished, slop-free prose linter and style engine for the Ranch.
// Runs on tool_result for write/edit/multi_edit to *.md/*.mdx files.
//
// Lineage & Attribution:
// - Forked from donrami/airspeak (Rami, ASD-STE100 aerospace linting ruleset)
// - Grounded in Gwern Branwen's Manual of Style (Gwern.net, "classic style")
// - Epistemically calibrated via Kesselman (2008) National Intelligence Estimates
// - Stylistic tell analysis informed by Massaro (2026, arXiv:2607.17228) and Oh et al. (2026)

import type { ExtensionAPI } from "@tau/tau-agent-core";

export const PROSE_GLOBS = /\.(md|mdx|markdown)$|\/(README|CHANGELOG|RELEASE|errors|runbooks)(\.[a-z]+)?\/?$/i;

export const MAX_WORDS_RAW_SENTENCE = 65; // High-density technical limit; ignores list items & code
export const MAX_EM_DASH_PER_PARAGRAPH = 2;
export const MIN_PARAGRAPH_WORDS_FOR_DASH_CHECK = 30;

// --- Anti-Slop Vocabulary (AI Cliches & Corporate Fluff) -----------------------
export const EN_BANNED: Record<string, string> = {
	seamless: "vague claim; state protocol or latency",
	seamlessly: "vague claim; state protocol or latency",
	robust: "corporate filler; state failure handling or invariants",
	powerful: "vague hype; state exact throughput or capabilities",
	"cutting-edge": "marketing fluff; describe the mechanism",
	"cutting edge": "marketing fluff; describe the mechanism",
	effortless: "empty promise; state setup steps",
	effortlessly: "empty promise; state setup steps",
	"world-class": "superlative; state benchmarks",
	"next-generation": "buzzword; describe architecture delta",
	revolutionary: "unsubstantiated hype; state measured delta",
	groundbreaking: "unsubstantiated hype; state measured delta",
	leverage: "corporate jargon; use 'use'",
	utilize: "corporate jargon; use 'use'",
	facilitate: "bureaucratic filler; use 'help' or 'run'",
	empower: "marketing filler; state direct action",
	holistic: "vague corporate speak; detail components",
	meticulously: "adverbial fluff; omit",
	crucial: "overused filler; state consequence",
	pivotal: "overused filler; state consequence",
	paramount: "overused filler; state consequence",
	"game-changing": "marketing hype; state quantitative delta",
	"game changer": "marketing hype; state quantitative delta",
	tapestry: "AI tell; use system, architecture, or structure",
	delve: "AI tell; use inspect, examine, explore, or read",
	"navigate the landscape": "corporate metaphor; describe problem domain",
	"in today's": "formulaic AI preamble; cut entirely",
	"robust solution": "empty corporate jargon; name the tool",
	"comprehensive guide": "cliché; name the document",
	"seamless experience": "marketing fluff; cut",
	"best-in-class": "marketing claim; cite benchmark",
	"state-of-the-art": "marketing claim; cite benchmark",
	beacon: "melodramatic AI metaphor; cut",
	testament: "pompous filler; use evidence or proof",
	multifaceted: "pseudo-intellectual padding; name elements",
	plethora: "AI tell; use many, numerous, or state number",
	"myriad of": "AI tell; state count or name items",
	intertwined: "vague connectivity; describe interface/dependency",
};

// --- Phrasal Verbs & Slop Idioms ----------------------------------------------
export const EN_PHRASAL_VERBS: { re: RegExp; hint: string }[] = [
	{ re: /\bspin up\b/gi, hint: "start" },
	{ re: /\breach out\b/gi, hint: "contact" },
	{ re: /\bdive into\b/gi, hint: "open/read" },
	{ re: /\bdelve into\b/gi, hint: "examine" },
	{ re: /\bcircle back\b/gi, hint: "return" },
	{ re: /\bdeep dive\b/gi, hint: "analysis" },
	{ re: /\bhop on a call\b/gi, hint: "call" },
	{ re: /\bping (me|us)\b/gi, hint: "message" },
	{ re: /\bharness(?:ing)? the power of\b/gi, hint: "state directly what it does" },
	{ re: /\bat the end of the day\b/gi, hint: "ultimately / finally" },
];

// --- Spineless Hedging & Throat-Clearing ---------------------------------------
export const EN_HEDGES: { re: RegExp; hint: string }[] = [
	{ re: /\bit is worth noting that\b/gi, hint: "throat-clearing; delete and state assertion directly" },
	{ re: /\bit should be noted that\b/gi, hint: "passive hedge; state fact directly" },
	{ re: /\bit goes without saying(?: that)?\b/gi, hint: "if it goes without saying, delete" },
	{ re: /\bneedless to say\b/gi, hint: "filler; delete" },
	{ re: /\bin order to\b/gi, hint: "use 'to'" },
];

// --- Kesselman Estimative Probability Tokens ---------------------------------
export const KESSELMAN_STANDARDS = [
	"certain",
	"highly likely",
	"likely",
	"possible",
	"unlikely",
	"highly unlikely",
	"remote",
	"impossible",
];

export const VAGUE_PROBABILITY: { re: RegExp; hint: string }[] = [
	{
		re: /\bit seems likely that maybe\b/gi,
		hint: "compounded hedge; declare explicit Kesselman confidence (e.g. 'likely', 'possible')",
	},
	{ re: /\b(?:sort of|kind of)\b/gi, hint: "vague qualifier; state exact boundary or numerical tolerance" },
];

const EM_DASH = /—/g;

export function stripMarkdown(s: string): string {
	return s
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]+`/g, " ")
		.replace(/^<!--[\s\S]*?-->/gm, " ")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/^\s*\d+\.\s+/gm, "")
		.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
		.replace(/[*_~]/g, "");
}

export function wordCount(s: string): number {
	return s.split(/\s+/).filter(w => w.length > 0 && /[a-zA-Z0-9]/.test(w)).length;
}

export function splitSentences(text: string): string[] {
	const protectedText = text.replace(/\b(e\.g\.|i\.e\.|etc\.|vs\.|et al\.|Mr\.|Dr\.|Prof\.)/gi, m =>
		m.replace(/\./g, "<DOT>"),
	);

	const parts = protectedText.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
	const out: string[] = [];
	for (const p of parts) {
		const s = p.replace(/<DOT>/g, ".").trim();
		if (s.length > 0) out.push(s);
	}
	return out;
}

export function checkRawhide(text: string): string[] {
	const issues: string[] = [];
	const prose = stripMarkdown(text);
	const lower = prose.toLowerCase();

	// 1. Anti-slop vocabulary
	for (const [term, hint] of Object.entries(EN_BANNED)) {
		const re = new RegExp(`\\b${term.replace(/[- ]/g, "[- ]")}\\b`, "i");
		if (re.test(lower)) {
			issues.push(`[rawhide:slop] banned "${term}" — ${hint}`);
		}
	}

	// 2. Phrasal verbs & cliches
	for (const { re, hint } of EN_PHRASAL_VERBS) {
		const m = prose.match(re);
		if (m) issues.push(`[rawhide:cliche] "${m[0]}" — replace with "${hint}"`);
	}

	// 3. Spineless hedging & throat-clearing
	for (const { re, hint } of EN_HEDGES) {
		const m = prose.match(re);
		if (m) issues.push(`[rawhide:hedge] "${m[0]}" — ${hint}`);
	}

	// 4. Vague probability calibration
	for (const { re, hint } of VAGUE_PROBABILITY) {
		const m = prose.match(re);
		if (m) issues.push(`[rawhide:epistemic] "${m[0]}" — ${hint}`);
	}

	// 5. Em-dash excess (> 2 per paragraph)
	for (const p of text.split(/\n\s*\n/).filter(x => x.trim().length > 0)) {
		const wc = wordCount(stripMarkdown(p));
		if (wc < MIN_PARAGRAPH_WORDS_FOR_DASH_CHECK) continue;
		const dashes = (p.match(EM_DASH) || []).length;
		if (dashes > MAX_EM_DASH_PER_PARAGRAPH) {
			issues.push(
				`[rawhide:typography] ${dashes} em-dashes in a ${wc}-word paragraph — max ${MAX_EM_DASH_PER_PARAGRAPH}`,
			);
		}
	}

	// 6. Runaway sentence check (cap: 65 words, ignores list bullets)
	for (const s of splitSentences(prose)) {
		const wc = wordCount(s);
		if (wc > MAX_WORDS_RAW_SENTENCE) {
			issues.push(
				`[rawhide:length] sentence has ${wc} words (cap ${MAX_WORDS_RAW_SENTENCE}): "${s.slice(0, 50)}..."`,
			);
		}
	}

	return issues;
}

export function buildBlockReason(filePath: string, content: string, mode: "warn" | "block" = "warn"): string | null {
	if (mode !== "block") return null;
	if (!PROSE_GLOBS.test(filePath)) return null;
	const issues = checkRawhide(content);
	if (issues.length === 0) return null;
	return `rawhide blocked write to ${filePath} (${issues.length} issue(s)):\n${issues.map(i => `  - ${i}`).join("\n")}`;
}

function extractWriteTarget(input: unknown): { filePath?: string; content?: string } {
	if (typeof input !== "object" || input === null) return {};
	const rec = input as Record<string, unknown>;
	const filePath =
		typeof rec.path === "string" ? rec.path : typeof rec.filePath === "string" ? rec.filePath : undefined;
	const content = typeof rec.content === "string" ? rec.content : undefined;
	return { filePath, content };
}

export default function rawhide(pi: ExtensionAPI) {
	const mode = (process.env.RAWHIDE_MODE === "block" ? "block" : "warn") as "warn" | "block";

	pi.on("tool_call", async event => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;
		const { filePath, content } = extractWriteTarget(event.input);
		if (!filePath || !content) return;
		const reason = buildBlockReason(filePath, content, mode);
		if (reason) {
			throw new Error(reason);
		}
	});

	pi.on("tool_result", async event => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;
		const { filePath, content } = extractWriteTarget(event.input);
		if (!filePath || !content || !PROSE_GLOBS.test(filePath)) return;
		const issues = checkRawhide(content);
		if (issues.length === 0) return;

		return {
			content: `${event.result}\n\n---\n## rawhide (Slop-free prose linter) — ${issues.length} issue(s)\n${issues.map(i => `- ${i}`).join("\n")}\nTo disable: add 'disabledExtensions: ["rawhide"]' to agent config.`,
		};
	});
}
