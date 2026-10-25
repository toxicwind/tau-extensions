// rawhide — mechanical prose linter for technical writing.
// Runs on tool_result for write/edit/multi_edit to *.md/*.mdx files.
// English: agentic-clarity subset of prose rules, inspired by ASD-STE100 Issue 9
// (a mechanical subset, not an STE compliance claim).
//
// MODE: warn by default — appends a violation list to the tool result so the
//                  model self-corrects on the next turn. Set RAWHIDE_MODE=block
//                  for hard enforcement that rejects violating writes before
//                  they execute.
//
// The RAWHIDE_MODE env var decides the shipped default; downstream forks can
// still override it in source without touching call sites because tool_call
// and tool_result both read the same source.

import type { ExtensionAPI } from "@tau/tau-agent-core";

// --- Path / glob filtering ---------------------------------------------------

// Prose files the linter cares about. Mirrors the skill's `globs` so the
// extension and the portable skill agree on scope.
export const PROSE_GLOBS = /\.(md|mdx|markdown)$|\/(README|CHANGELOG|RELEASE|errors|runbooks)(\.[a-z]+)?\/?$/i;

// --- Lint thresholds (source constants, shared by handlers and tests) -------

export const MAX_WORDS_DESCRIPTIVE = 25;
export const MAX_WORDS_PROCEDURAL = 20;
export const MAX_EM_DASH_PER_PARAGRAPH = 1;
export const MIN_PARAGRAPH_WORDS_FOR_DASH_CHECK = 30;

// --- English rules -----------------------------------------------------------

// Banned vocabulary (English). Static lookup → Record, not Set.
const EN_BANNED: Record<string, true> = {
	seamless: true,
	seamlessly: true,
	robust: true,
	powerful: true,
	"cutting-edge": true,
	"cutting edge": true,
	effortless: true,
	effortlessly: true,
	"world-class": true,
	"next-generation": true,
	revolutionary: true,
	leverage: true,
	utilize: true,
	facilitate: true,
	empower: true,
	holistic: true,
	meticulously: true,
	crucial: true,
	pivotal: true,
	paramount: true,
	"game-changing": true,
	"game changer": true,
	tapestry: true,
	delve: true,
	"navigate the landscape": true,
	"in today's": true,
	"robust solution": true,
	"comprehensive guide": true,
	"seamless experience": true,
	"best-in-class": true,
	"state-of-the-art": true,
};

// Phrasal verbs with precise replacement hints (STE 9.3).
const EN_PHRASAL_VERBS: { re: RegExp; hint: string }[] = [
	{ re: /\bspin up\b/gi, hint: "start" },
	{ re: /\breach out\b/gi, hint: "contact" },
	{ re: /\bdive into\b/gi, hint: "open/read" },
	{ re: /\bdelve into\b/gi, hint: "read" },
	{ re: /\bcircle back\b/gi, hint: "return" },
	{ re: /\bdeep dive\b/gi, hint: "analysis" },
	{ re: /\bhop on a call\b/gi, hint: "call" },
	{ re: /\bping (me|us)\b/gi, hint: "message" },
	{ re: /\bleverage\b/gi, hint: "use" },
	{ re: /\butilize\b/gi, hint: "use" },
];

const EN_NOMINALIZATIONS = [
	/\b(perform|conduct|carry out|do)\s+(a|an|the)?\s*(analysis|determination|assessment|evaluation|investigation|review)\b/gi,
	/\b(make|provide)\s+(a|an|the)?\s*(determination|assessment|decision|recommendation|assistance|support)\b/gi,
	/\bprovide\s+assistance\b/gi,
	/\b(?:do|perform)\s+a\s+check\s+of\b/gi,
];

// Contractions and their full forms (STE 4.2).
const EN_CONTRACTIONS: Record<string, string> = {
	"don't": "do not",
	"isn't": "is not",
	"aren't": "are not",
	"can't": "cannot",
	"won't": "will not",
	"doesn't": "does not",
	"didn't": "did not",
	"couldn't": "could not",
	"wouldn't": "would not",
	"shouldn't": "should not",
	"it's": "it is",
	"that's": "that is",
	"we're": "we are",
	"they're": "they are",
	"you're": "you are",
	"there's": "there is",
	"let's": "let us",
	"i'm": "I am",
	"i've": "I have",
	"we've": "we have",
	"you've": "you have",
	"they've": "they have",
	"haven't": "have not",
	"hasn't": "has not",
	"hadn't": "had not",
	"mustn't": "must not",
	"needn't": "need not",
	"shan't": "shall not",
	"ain't": "are not",
};
const CONTRACTION_RE =
	/\b(?:don't|isn't|aren't|can't|won't|doesn't|didn't|couldn't|wouldn't|shouldn't|it's|that's|we're|they're|you're|there's|let's|I'm|I've|we've|you've|they've|haven't|hasn't|hadn't|mustn't|needn't|shan't|ain't)\b/gi;

// Missing conjunction "that" (GR-1). Flags "make sure the valve is open" but
// not "make sure that the valve is open".
const MISSING_THAT_RE =
	/\b(make sure|ensure|check|confirm|assume|verify|remember|note|see)\s+(?!that\b)((?:the|a|an|it|we|you|they|this|these|those|[A-Z])\w*)/g;

// Latin abbreviations (GR-6). No trailing \b: the period is a non-word char,
// so a trailing \b would never match.
const EN_LATIN_ABBREVS: Record<string, string> = {
	"e.g.": "for example",
	"i.e.": "that is",
	"etc.": "and so on",
	"vs.": "versus",
	"et al.": "and others",
};
const LATIN_ABBREV_RE = /\b(?:e\.g\.|i\.e\.|etc\.|vs\.|et al\.)/gi;

// Gendered pronouns (GR-7). \b guards "man"/"her" inside manual/there/other.
const GENDERED_RE = /\b(?:he|she|him|his|her|hers|man|woman|men|women)\b/gi;

const EM_DASH = /—/g;

// Strip markdown formatting, but PRESERVE hyphens — they are semantically
// required for English compound-noun checks.
export function stripMarkdown(s: string): string {
	return s
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/[*_>~]{1,}/g, " ")
		.replace(/https?:\/\/\S+/g, " ");
}

export function wordCount(s: string): number {
	return s.split(/\s+/).filter(w => w.length > 0 && /[a-zA-Z0-9]/.test(w)).length;
}

// Split into sentences, handling common abbreviations (e.g., i.e., Mr., Dr.).
export function splitSentences(text: string): string[] {
	const protectedText = text.replace(/\b(e\.g|i\.e|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc)\./gi, "$1<DOT>");
	return protectedText
		.split(/(?<=[.!?])\s+(?=[A-Z])/)
		.map(s => s.replace(/<DOT>/g, ".").trim())
		.filter(s => s.length > 0);
}

export function checkEnglish(text: string): string[] {
	const issues: string[] = [];
	const prose = stripMarkdown(text);

	// Sentence length (STE 5.1 procedures / 6.3 descriptions).
	for (const s of splitSentences(prose)) {
		const wc = wordCount(s);
		if (wc > MAX_WORDS_DESCRIPTIVE) {
			issues.push(`[STE 6.3] sentence has ${wc} words (cap ${MAX_WORDS_DESCRIPTIVE}): "${s.slice(0, 60)}..."`);
		} else if (wc > MAX_WORDS_PROCEDURAL) {
			issues.push(
				`[STE 5.1] sentence has ${wc} words (procedural cap ${MAX_WORDS_PROCEDURAL}): "${s.slice(0, 60)}..."`,
			);
		}
	}

	// Semicolons (STE 8.1).
	if (/;/.test(prose)) {
		const count = (prose.match(/;/g) || []).length;
		issues.push(`[STE 8.1] ${count} semicolon(s) in prose — STE bans semicolons. Replace with period or split.`);
	}

	// Nominalizations (STE 3.7).
	for (const re of EN_NOMINALIZATIONS) {
		const m = prose.match(re);
		if (m) {
			issues.push(`[STE 3.7] nominalization — use a verb: "${m[0]}"`);
		}
	}

	// Phrasal verbs (STE 9.3).
	for (const { re, hint } of EN_PHRASAL_VERBS) {
		const m = prose.match(re);
		if (m) issues.push(`[STE 9.3] phrasal verb "${m[0]}" — replace with "${hint}".`);
	}

	// Banned vocabulary.
	const lower = prose.toLowerCase();
	for (const term of Object.keys(EN_BANNED)) {
		const re = new RegExp(`\\b${term.replace(/[- ]/g, "[- ]")}\\b`);
		if (re.test(lower)) {
			issues.push(`[anti-slop] banned "${term}" — cut or replace with a concrete spec.`);
		}
	}

	// Em-dash density per paragraph. Agentic-clarity cap, labeled [style]:
	// STE 8.1 permits the em-dash, so this is not an STE citation.
	for (const p of text.split(/\n\s*\n/).filter(x => x.trim().length > 0)) {
		const wc = wordCount(stripMarkdown(p));
		if (wc < MIN_PARAGRAPH_WORDS_FOR_DASH_CHECK) continue;
		const dashes = (p.match(EM_DASH) || []).length;
		if (dashes > MAX_EM_DASH_PER_PARAGRAPH) {
			issues.push(
				`[style] ${dashes} em-dashes in a ${wc}-word paragraph — keep at most ${MAX_EM_DASH_PER_PARAGRAPH}.`,
			);
		}
	}

	// Contractions (STE 4.2).
	for (const m of prose.matchAll(CONTRACTION_RE)) {
		issues.push(`[STE 4.2] contraction "${m[0]}" — write "${EN_CONTRACTIONS[m[0].toLowerCase()]}".`);
	}

	// Missing conjunction "that" (GR-1).
	for (const m of prose.matchAll(MISSING_THAT_RE)) {
		issues.push(`[GR-1] add "that": "${m[1]} that …".`);
	}

	// Latin abbreviations (GR-6).
	for (const m of prose.matchAll(LATIN_ABBREV_RE)) {
		issues.push(`[GR-6] Latin abbreviation "${m[0]}" — use "${EN_LATIN_ABBREVS[m[0].toLowerCase()]}".`);
	}

	// Gendered pronouns (GR-7).
	for (const m of prose.matchAll(GENDERED_RE)) {
		issues.push(`[GR-7] gendered term "${m[0]}" — use "they" or rephrase.`);
	}

	return issues;
}

// Pure decision for hard-enforcement mode: returns the block reason when the
// write must be rejected, or null when it may proceed. Wired into the
// tool_call handler with the shipped MODE; exported so tests can exercise
// both modes without mutating the source constant.
export function buildBlockReason(filePath: string, content: string, mode: "warn" | "block" = "warn"): string | null {
	if (mode !== "block") return null;
	if (!PROSE_GLOBS.test(filePath)) return null;
	if (content.length < 40) return null;

	const issues = checkEnglish(content);
	if (issues.length === 0) return null;

	const preview = issues.slice(0, 5).join(" | ");
	return `rawhide (English mode: ASD-STE100) blocked this write: ${issues.length} violation(s): ${preview}. Fix the violations or disable the linter with disabledExtensions: ["rawhide"].`;
}

// Shared input extraction for write/edit/multi_edit tool events.
// The tool_call and tool_result events MUST stay in lockstep here: if the
// input shape changes, both blocking and annotation read the same fields.
function extractWriteTarget(input: unknown): { filePath?: string; content?: string } {
	if (typeof input !== "object" || input === null) return {};
	const record = input as Record<string, unknown>;
	const filePath = (record.file_path as string) ?? (record.path as string);
	const content = record.content ?? record.new_text ?? record.newText ?? record.text;
	return { filePath, content: typeof content === "string" ? content : undefined };
}

export default function rawhide(pi: ExtensionAPI) {
	const MODE: "warn" | "block" = process.env.RAWHIDE_MODE === "block" ? "block" : "warn";

	pi.on("tool_result", async event => {
		try {
			if (event.isError) return;
			const toolName = String(event.toolName ?? "");
			if (!["write", "edit", "multi_edit"].includes(toolName)) return;

			const { filePath, content } = extractWriteTarget(event.input);
			if (!filePath || !PROSE_GLOBS.test(filePath)) return;
			if (typeof content !== "string" || content.length < 40) return;

			const issues = checkEnglish(content);
			if (issues.length === 0) return;

			const header = `## rawhide (English mode: ASD-STE100) — ${issues.length} issue(s)`;
			const body = issues.map(i => `- ${i}`).join("\n");
			const footer = `\nDisable linter: add \`disabledExtensions: ["rawhide"]\` to ~/.omp/agent/config.yml.`;
			const annotation = `\n\n---\n${header}\n${body}${footer}\n`;

			const newContent = (event.content ?? []).map(chunk => {
				if (chunk.type === "text" && typeof chunk.text === "string") {
					return { ...chunk, text: chunk.text + annotation };
				}
				return chunk;
			});

			pi.sendMessage(
				{
					customType: "rawhide",
					content: `${header}\n${body}`,
					display: true,
				},
				{ triggerTurn: false },
			);

			return { content: newContent };
		} catch (err) {
			// Fail soft: a linter error must never break the write or the agent.
			console.error("[rawhide] tool_result handler failed", err);
		}
	});

	pi.on("tool_call", event => {
		const toolName = String(event.toolName ?? "");
		if (!["write", "edit", "multi_edit"].includes(toolName)) return;

		const { filePath, content } = extractWriteTarget(event.input);
		if (typeof filePath !== "string" || typeof content !== "string") return;

		const reason = buildBlockReason(filePath, content, MODE);
		if (reason) return { block: true, reason };
	});
}
