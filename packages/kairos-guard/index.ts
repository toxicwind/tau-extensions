// kairos-guard — tau/omp extension adapter for the kairos 2s guard.
//
// In-band enforcement over the pi-coding-agent ExtensionAPI: subscribes the
// `tool_call` event (fired before a tool executes, can block or replace the
// input). Works on BOTH tau and upstream oh-my-pi — same event contract.
//   deny    → { block: true, reason }   (the call is refused; model sees why)
//   replace → { input }                 (command rewritten through run-fast)
//   allow   → undefined                 (runs as-is)
import { verdict } from "kairos";

const kairosGuardExtension = (pi: any) => {
  if (typeof pi.on !== "function") return;
  pi.on("tool_call", async (event: any) => {
    if (event?.toolName !== "bash") return undefined;
    const command: string | undefined = event.input?.command;
    if (!command) return undefined;
    const v = verdict(command);
    if (v.action === "deny") {
      return {
        block: true,
        reason: `[kairos] ${v.reason} — MUST DO: ${v.fix}`,
      };
    }
    if (v.action === "replace" && v.replacement) {
      return { input: { ...event.input, command: v.replacement } };
    }
    return undefined;
  });
};

export default kairosGuardExtension;
module.exports = kairosGuardExtension;
exports.default = kairosGuardExtension;
