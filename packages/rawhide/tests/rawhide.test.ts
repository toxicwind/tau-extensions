import { describe, expect, test } from "bun:test";
import { checkRawhide, buildBlockReason, stripMarkdown, splitSentences } from "../src/index";

describe("rawhide prose linter", () => {
  test("flags quintessential AI tells and corporate buzzwords", () => {
    const text = "We delve into this multifaceted tapestry to provide a seamless and game-changing experience.";
    const issues = checkRawhide(text);
    expect(issues.some((i) => i.includes("delve"))).toBe(true);
    expect(issues.some((i) => i.includes("tapestry"))).toBe(true);
    expect(issues.some((i) => i.includes("seamless"))).toBe(true);
    expect(issues.some((i) => i.includes("game-changing") || i.includes("game changing"))).toBe(true);
    expect(issues.some((i) => i.includes("multifaceted"))).toBe(true);
  });

  test("flags spineless hedging and throat-clearing", () => {
    const text = "It is worth noting that needless to say, in order to utilize the system, we must test it.";
    const issues = checkRawhide(text);
    expect(issues.some((i) => i.includes("worth noting"))).toBe(true);
    expect(issues.some((i) => i.includes("needless to say"))).toBe(true);
    expect(issues.some((i) => i.includes("in order to"))).toBe(true);
    expect(issues.some((i) => i.includes("utilize"))).toBe(true);
  });

  test("flags vague probability and compounded hedges", () => {
    const text = "It seems likely that maybe the cache hit rate is sort of acceptable.";
    const issues = checkRawhide(text);
    expect(issues.some((i) => i.includes("epistemic"))).toBe(true);
  });

  test("allows natural technical syntax: semicolons, contractions, Latin abbreviations", () => {
    const text = `
This is a clean, declarative architectural summary; it doesn't hedge, e.g. when citing exact latency figures.
- Item 1: verified endpoint (i.e. port 25109 answers 200 OK)
- Item 2: zero memory leaks observed across 10,000 iterations
`;
    const issues = checkRawhide(text);
    expect(issues).toEqual([]);
  });

  test("does not penalize bullet points or codeblocks as runaway sentences", () => {
    const text = `
### Technical Verification
- The pipeline executes 54 distinct contract assertions across 6 test suites without crashing.
- Every port is audited with live socket connections before being logged in documentation.
- All git references point to verified ancestor commits on origin/main.
`;
    const issues = checkRawhide(text);
    expect(issues).toEqual([]);
  });

  test("detects genuine runaway sentences (> 65 words outside lists)", () => {
    const runaway =
      "This is an exceedingly long and needlessly verbose run-on sentence that keeps going and going across dozens of words without any punctuation or sensible pauses because the author forgot how to write clearly and concisely and instead generated a wall of text that exhausts the reader and provides very little structure or discipline while meandering through trivial points and repetitive assertions and vague hand-waving claims that add zero value to technical engineering documentation.";
    const issues = checkRawhide(runaway);
    expect(issues.some((i) => i.includes("rawhide:length"))).toBe(true);
  });

  test("buildBlockReason returns null in warn mode and blocks in block mode", () => {
    const badText = "We delve into this seamless world.";
    expect(buildBlockReason("README.md", badText, "warn")).toBeNull();
    const blocked = buildBlockReason("README.md", badText, "block");
    expect(blocked).not.toBeNull();
    expect(blocked).toContain("rawhide blocked write");
  });
});
