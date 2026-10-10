// Shared test helpers: corpus loading, check dispatch, baseline comparison.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkEnglish } from "../src/packs/airspeak.ts";

export interface SamplePair {
  violating: string;
  conforming: string;
}

export interface Corpus {
  en: Record<string, SamplePair>;
  meta: { nonProsePath: string; shortPath: string; shortContent: string };
}

const FIXTURES = join(import.meta.dir, "fixtures");

export function loadCorpus(): Corpus {
  return JSON.parse(readFileSync(join(FIXTURES, "corpus.json"), "utf8"));
}

export function loadBaseline(): Record<string, Record<string, { violating: string[]; conforming: string[] }>> {
  return JSON.parse(readFileSync(join(FIXTURES, "baseline.json"), "utf8"));
}

export function runChecks(lang: "en", text: string): string[] {
  return checkEnglish(text);
}
