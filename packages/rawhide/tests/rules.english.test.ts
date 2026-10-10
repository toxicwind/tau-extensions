// English rule tests (ASD-STE100 Issue 9 mechanical subset).
// Every check family fires on its violating fixture and stays silent on its
// conforming fixture (spec FR-011, SC-002).
import { describe, expect, test } from "bun:test";
import { loadCorpus, runChecks } from "./helpers.ts";

const corpus = loadCorpus();

// Expected issue marker per family; a family fires iff at least one issue
// matches its marker, and the conforming sample must stay fully silent.
const MARKERS: Record<string, RegExp> = {
  "sentence-length": /\[STE (6\.3|5\.1)\]/,
  semicolon: /\[STE 8\.1\]/,
  nominalization: /\[STE 3\.7\]/,
  "phrasal-verb": /\[STE 9\.3\]/,
  banned: /anti-slop/,
  "em-dash": /\[style\]/,
  contraction: /\[STE 4\.2\]/,
  "missing-that": /\[GR-1\]/,
  "latin-abbrev": /\[GR-6\]/,
  "gendered-pronoun": /\[GR-7\]/,
};

for (const [family, samples] of Object.entries(corpus.en)) {
  describe(`EN check family: ${family}`, () => {
    test("fires on the violating sample", () => {
      const issues = runChecks("en", samples.violating);
      expect(issues.some((i) => MARKERS[family].test(i))).toBe(true);
    });

    test("stays silent on the conforming sample", () => {
      expect(runChecks("en", samples.conforming)).toEqual([]);
    });
  });
}
