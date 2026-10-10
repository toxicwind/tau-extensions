export interface LintIssue {
  rule: string;
  category: "slop" | "hedge" | "epistemic" | "length" | "typography" | "ste";
  message: string;
  match?: string;
}

export interface RulePack {
  name: string;
  check(text: string): LintIssue[];
}

export const PROSE_GLOBS =
  /\.(md|mdx|markdown)$|\/(README|CHANGELOG|RELEASE|errors|runbooks)(\.[a-z]+)?\/?$/i;
