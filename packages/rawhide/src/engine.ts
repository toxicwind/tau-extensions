import type { LintIssue, RulePack } from "./types.ts";
import * as gwern from "./packs/gwern.ts";
import { checkEnglish } from "./packs/airspeak.ts";

const PACKS: Record<string, RulePack> = {
  gwern: {
    name: "gwern",
    check(text: string): LintIssue[] {
      return (gwern as any).lintProse?.(text) ?? [];
    },
  },
  airspeak: {
    name: "airspeak",
    check(text: string): LintIssue[] {
      const msgs = checkEnglish(text);
      return msgs.map(m => ({ rule: "airspeak", category: "ste" as const, message: m }));
    },
  },
};

export function loadPacks(names?: string[]): RulePack[] {
  const raw = names ?? (process.env.RAWHIDE_PACKS ?? "gwern").split(",");
  const want = raw.map(s => s.trim()).filter(Boolean);
  return want.map(n => PACKS[n]).filter(Boolean);
}

export function lint(text: string, packNames?: string[]): LintIssue[] {
  const packs = loadPacks(packNames);
  return packs.flatMap(p => p.check(text));
}
