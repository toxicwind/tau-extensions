/**
 * rawhide/rules.ts — Anti-slop vocabulary, epistemic calibration, and prose linting rules.
 *
 * Provenance & Attribution:
 * - Forked and evolved from donrami/airspeak (ASD-STE100 aerospace linting lineage)
 * - Grounded in Gwern Branwen's Manual of Style (Gwern.net)
 * - Calibrated with Kesselman (2008) National Intelligence Estimates probability expressions
 * - Informed by Massaro (2026, arXiv:2607.17228) and Oh et al. (2026, arXiv:2610.00531)
 */

export const PROSE_GLOBS =
  /\.(md|mdx|markdown)$|\/(README|CHANGELOG|RELEASE|errors|runbooks)(\.[a-z]+)?\/?$/i;

export const MAX_SENTENCE_WORDS = 75; // Relaxed from Airspeak's 20-word cap; supports dense technical exposition

export interface LintIssue {
  rule: string;
  category: "slop" | "hedge" | "epistemic" | "length" | "typography";
  message: string;
  match?: string;
}

// 1. AI Tells, Corporate Clichés, and Fluff
export const SLOP_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  {
    re: /\b(?:delve|delves|delving)\b/gi,
    hint: "AI tell: replace 'delve' with examine, inspect, explore, or investigate",
  },
  {
    re: /\b(?:tapestry|tapestries)\b/gi,
    hint: "AI tell: replace 'tapestry' with system, architecture, structure, or ecosystem",
  },
  {
    re: /\b(?:seamless|seamlessly)\b/gi,
    hint: "Vague marketing claim: 'seamless' hides mechanics; specify the exact latency, protocol, or failure boundary",
  },
  {
    re: /\b(?:game[\s-]changer|game[\s-]changing)\b/gi,
    hint: "Marketing hyperbole: state the measured quantitative delta instead of 'game changer'",
  },
  {
    re: /\b(?:stands as a testament|testament to)\b/gi,
    hint: "Pompous filler: replace 'testament to' with evidence of, proof of, or delete",
  },
  {
    re: /\b(?:beacon of|beacon for)\b/gi,
    hint: "Melodramatic metaphor: cut 'beacon' in technical prose",
  },
  {
    re: /\b(?:multifaceted|myriad of|plethora of)\b/gi,
    hint: "Pseudo-intellectual padding: name the concrete elements or specify the quantity",
  },
  {
    re: /\bharness(?:ing)? the power of\b/gi,
    hint: "Boilerplate marketing: state directly what the tool executes",
  },
  {
    re: /\bin today's (?:fast-paced|rapidly evolving|digital) world\b/gi,
    hint: "Formulaic AI preamble: cut entirely",
  },
  {
    re: /\bat the end of the day\b/gi,
    hint: "Colloquial padding: cut or replace with ultimately/finally",
  },
  {
    re: /\bdive deep(?: into)?\b/gi,
    hint: "AI cliché: replace 'dive deep' with analyze, profile, or detail",
  },
  {
    re: /\b(?:intertwined|intertwines)\b/gi,
    hint: "Vague connectivity: describe the exact dependency graph or interface contract",
  },
  {
    re: /\b(?:revolutionary|groundbreaking)\b/gi,
    hint: "Unverified superlative: state the novel primitive or measured benchmark speedup",
  },
];

// 2. Spineless Hedging and Throat-Clearing
export const HEDGE_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  {
    re: /\bit is worth noting that\b/gi,
    hint: "Throat-clearing: delete 'it is worth noting that' and make the assertion directly",
  },
  {
    re: /\bit should be noted that\b/gi,
    hint: "Passive hedging: state the fact directly without preamble",
  },
  {
    re: /\bit goes without saying(?: that)?\b/gi,
    hint: "If it goes without saying, do not say it; delete",
  },
  {
    re: /\bneedless to say\b/gi,
    hint: "Filler phrase: delete",
  },
  {
    re: /\bin order to\b/gi,
    hint: "Verbose connective: replace 'in order to' with 'to'",
  },
  {
    re: /\butilize|utilizes|utilizing\b/gi,
    hint: "Pretentious jargon: replace 'utilize' with 'use'",
  },
];

// 3. Kesselman Probability Calibration Tokens
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

export const VAGUE_PROBABILITY_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  {
    re: /\b(?:sort of|kind of|more or less)\b/gi,
    hint: "Vague qualifier: state exact boundary or numerical tolerance",
  },
  {
    re: /\bit seems likely that maybe\b/gi,
    hint: "Compounded hedge: declare an explicit Kesselman estimative confidence (e.g., 'likely', 'possible')",
  },
];

// Strip code fences, inline code, and URLs so code literals don't trip prose linters
export function sanitizeMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, "") // Code fences
    .replace(/`[^`]+`/g, "") // Inline code
    .replace(/https?:\/\/[^\s\)]+/g, "") // URLs
    .replace(/^<!--[\s\S]*?-->/gm, ""); // Comments
}

// Split text into individual sentences while respecting code, quotes, and abbreviations
export function extractSentences(text: string): string[] {
  const clean = sanitizeMarkdown(text);
  const lines = clean.split("\n");
  const sentences: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip Markdown headings and raw list marker prefixes
    if (/^#{1,6}\s/.test(trimmed)) continue;

    // Remove leading list markers (- * 1.)
    const normalized = trimmed.replace(/^[-*+]\s+|\d+\.\s+/, "");

    // Split on sentence terminators followed by whitespace or end of line
    const parts = normalized.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
    for (const p of parts) {
      const s = p.trim();
      if (s.length > 0) sentences.push(s);
    }
  }

  return sentences;
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0 && /[a-zA-Z0-9]/.test(w)).length;
}

export function lintProse(content: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const clean = sanitizeMarkdown(content);

  // 1. Slop check
  for (const { re, hint } of SLOP_PATTERNS) {
    const matches = clean.match(re);
    if (matches) {
      for (const m of new Set(matches)) {
        issues.push({
          rule: "rawhide:anti-slop",
          category: "slop",
          message: hint,
          match: m,
        });
      }
    }
  }

  // 2. Hedge check
  for (const { re, hint } of HEDGE_PATTERNS) {
    const matches = clean.match(re);
    if (matches) {
      for (const m of new Set(matches)) {
        issues.push({
          rule: "rawhide:unhedged",
          category: "hedge",
          message: hint,
          match: m,
        });
      }
    }
  }

  // 3. Vague probability check
  for (const { re, hint } of VAGUE_PROBABILITY_PATTERNS) {
    const matches = clean.match(re);
    if (matches) {
      for (const m of new Set(matches)) {
        issues.push({
          rule: "rawhide:epistemic-calibration",
          category: "epistemic",
          message: hint,
          match: m,
        });
      }
    }
  }

  // 4. Runaway sentence check (relaxed threshold: 75 words)
  const sentences = extractSentences(content);
  for (const sentence of sentences) {
    const wc = wordCount(sentence);
    if (wc > MAX_SENTENCE_WORDS) {
      const preview = sentence.length > 60 ? `${sentence.slice(0, 57)}...` : sentence;
      issues.push({
        rule: "rawhide:sentence-length",
        category: "length",
        message: `Runaway sentence has ${wc} words (cap is ${MAX_SENTENCE_WORDS}): "${preview}"`,
        match: preview,
      });
    }
  }

  return issues;
}
