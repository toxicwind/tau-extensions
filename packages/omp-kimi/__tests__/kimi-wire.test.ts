import { describe, expect, test } from "bun:test";
import {
	KapMessage,
	KapStreamAccumulator,
	kapApprovalToUiRequest,
	kapMessageToEntries,
	kapQuestionToUiRequests,
	kapTextOf,
	uiResponseToApprovalDecision,
	uiResponseToQuestionAnswer,
	WireAgentEvent,
} from "../src/kimi-wire";

const FIXED_NOW = 1_787_654_321_000;

function userMsg(): KapMessage {
	return {
		id: "m1",
		session_id: "s1",
		role: "user",
		content: [{ type: "text", text: "hello kimi" }],
		created_at: "2026-09-14T10:00:00.000Z",
	};
}

describe("kapTextOf", () => {
	test("joins text parts and notes non-text parts", () => {
		const text = kapTextOf([
			{ type: "text", text: "a" },
			{ type: "text", text: "b" },
			{ type: "tool_use", tool_call_id: "t1", tool_name: "bash", input: {} },
			{ type: "image", source: {}, name: "pic.png" },
		]);
		expect(text).toBe("a\nb\n[tool_use bash]\n[image: pic.png]");
	});
});

describe("kapMessageToEntries", () => {
	test("user message becomes a message entry with string content", () => {
		const [entry] = kapMessageToEntries(userMsg());
		expect(entry.type).toBe("message");
		if (entry.type !== "message") throw new Error("unreachable");
		expect(entry.id).toBe("m1");
		expect(entry.parentId).toBeNull();
		expect(entry.timestamp).toBe("2026-09-14T10:00:00.000Z");
		expect(entry.message.role).toBe("user");
		if (entry.message.role !== "user") throw new Error("unreachable");
		expect(entry.message.content).toBe("hello kimi");
		expect(entry.message.timestamp).toBe(Date.parse("2026-09-14T10:00:00.000Z"));
	});

	test("parent_message_id is preserved", () => {
		const [entry] = kapMessageToEntries({ ...userMsg(), parent_message_id: "m0" });
		expect(entry.parentId).toBe("m0");
	});

	test("assistant message maps text/thinking/tool_use blocks", () => {
		const [entry] = kapMessageToEntries(
			{
				id: "m2",
				session_id: "s1",
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "hmm" },
					{ type: "text", text: "here you go" },
					{ type: "tool_use", tool_call_id: "t1", tool_name: "read", input: { path: "/x" } },
					{ type: "image", source: {}, name: "drop.png" },
				],
				created_at: "2026-09-14T10:01:00.000Z",
			},
			{ model: "kimi-k2", now: () => FIXED_NOW },
		);
		expect(entry.type).toBe("message");
		if (entry.type !== "message" || entry.message.role !== "assistant") throw new Error("unreachable");
		const msg = entry.message;
		expect(msg.model).toBe("kimi-k2");
		expect(msg.timestamp).toBe(FIXED_NOW);
		expect(msg.content).toEqual([
			{ type: "thinking", thinking: "hmm" },
			{ type: "text", text: "here you go" },
			{ type: "toolCall", id: "t1", name: "read", arguments: { path: "/x" } },
		]);
	});

	test("tool message fans out one entry per tool_result part", () => {
		const entries = kapMessageToEntries(
			{
				id: "m3",
				session_id: "s1",
				role: "tool",
				content: [
					{ type: "tool_result", tool_call_id: "t1", output: "ok" },
					{ type: "tool_result", tool_call_id: "t2", output: { data: 1 }, is_error: true },
				],
				created_at: "2026-09-14T10:02:00.000Z",
			},
			{ toolNames: new Map([["t1", "bash"]]) },
		);
		expect(entries).toHaveLength(2);
		for (const e of entries) {
			expect(e.type).toBe("message");
			if (e.type !== "message" || e.message.role !== "toolResult") throw new Error("unreachable");
		}
		const [a, b] = entries;
		if (a.type !== "message" || b.type !== "message") throw new Error("unreachable");
		expect(a.id).toBe("m3:t1");
		if (a.message.role !== "toolResult" || b.message.role !== "toolResult") throw new Error("unreachable");
		expect(a.message.toolCallId).toBe("t1");
		expect(a.message.toolName).toBe("bash");
		expect(a.message.isError).toBe(false);
		expect(b.message.toolCallId).toBe("t2");
		expect(b.message.toolName).toBe("");
		expect(b.message.isError).toBe(true);
		expect(b.message.content).toBe(JSON.stringify({ data: 1 }));
	});

	test("system message becomes a hidden custom_message entry", () => {
		const [entry] = kapMessageToEntries({
			id: "m0",
			session_id: "s1",
			role: "system",
			content: [{ type: "text", text: "sys prompt" }],
			created_at: "2026-09-14T09:59:00.000Z",
		});
		expect(entry.type).toBe("custom_message");
		if (entry.type !== "custom_message") throw new Error("unreachable");
		expect(entry.customType).toBe("kap-system");
		expect(entry.display).toBe(false);
		expect(entry.content).toBe("sys prompt");
	});
});

describe("KapStreamAccumulator", () => {
	test("full turn lifecycle emits ordered pi-wire events", () => {
		const acc = new KapStreamAccumulator("kimi-k2");
		const events: WireAgentEvent[] = [];
		events.push(...acc.feed({ type: "turn.started", agentId: "a1", turnId: 3 }));
		events.push(...acc.feed({ type: "assistant.delta", agentId: "a1", turnId: 3, delta: "Hello " }));
		events.push(...acc.feed({ type: "assistant.delta", agentId: "a1", turnId: 3, delta: "world" }));
		events.push(
			...acc.feed({
				type: "tool.call.started",
				agentId: "a1",
				turnId: 3,
				toolCallId: "t1",
				name: "bash",
				args: { cmd: "ls" },
				description: "list files",
			}),
		);
		events.push(
			...acc.feed({ type: "tool.call.delta", agentId: "a1", turnId: 3, toolCallId: "t2", name: "read", argumentsPart: '{"pa' }),
		);
		events.push(
			...acc.feed({ type: "tool.call.delta", agentId: "a1", turnId: 3, toolCallId: "t2", argumentsPart: 'th":"/x"}' }),
		);
		events.push(...acc.feed({ type: "tool.result", agentId: "a1", turnId: 3, toolCallId: "t1", output: "ok" }));
		events.push(...acc.feed({ type: "turn.ended", agentId: "a1", turnId: 3, reason: "completed" }));

		const types = events.map((e) => e.type);
		expect(types).toEqual([
			"agent_start",
			"turn_start",
			"message_start",
			"message_update",
			"message_update",
			"tool_execution_start",
			"tool_execution_update",
			"tool_execution_update",
			"tool_execution_end",
			"message_end",
			"turn_end",
			"agent_end",
		]);

		// message_update carries the FULL accumulating message, not deltas
		const updates = events.filter((e) => e.type === "message_update");
		expect(updates).toHaveLength(2);
		const last = updates[1];
		if (last.type !== "message_update" || last.message.role !== "assistant") throw new Error("unreachable");
		const textBlock = last.message.content.find((c) => c.type === "text");
		expect(textBlock).toEqual({ type: "text", text: "Hello world" });
		expect(last.message.model).toBe("kimi-k2");

		// tool args accumulate across deltas and parse to a record
		const toolUpdates = events.filter((e) => e.type === "tool_execution_update");
		const t2updates = toolUpdates.filter((e) => e.type === "tool_execution_update" && e.toolCallId === "t2");
		const t2 = t2updates[t2updates.length - 1];
		if (!t2 || t2.type !== "tool_execution_update") throw new Error("unreachable");
		expect(t2.args).toEqual({ path: "/x" });
		expect(t2.partialResult).toBe('{"path":"/x"}');

		// message_end carries the toolCall blocks too
		const end = events.find((e) => e.type === "message_end");
		if (!end || end.type !== "message_end" || end.message.role !== "assistant") throw new Error("unreachable");
		const toolBlocks = end.message.content.filter((c) => c.type === "toolCall");
		expect(toolBlocks.map((c) => (c.type === "toolCall" ? c.name : ""))).toEqual(["bash", "read"]);
		if (end.message.stopReason !== "stop") throw new Error("bad stop reason");
	});

	test("message_end is skipped when no message was started", () => {
		const acc = new KapStreamAccumulator();
		const events = acc.feed({ type: "turn.started", turnId: 1 });
		events.push(...acc.feed({ type: "turn.ended", turnId: 1, reason: "completed" }));
		expect(events.map((e) => e.type)).toEqual(["agent_start", "turn_start", "turn_end", "agent_end"]);
	});

	test("max_steps interrupt maps to length stop reason", () => {
		const acc = new KapStreamAccumulator();
		acc.feed({ type: "turn.started", turnId: 1 });
		acc.feed({ type: "assistant.delta", turnId: 1, delta: "x" });
		const events = acc.feed({ type: "turn.ended", turnId: 1, reason: "completed", interruptReason: "max_steps" });
		const end = events.find((e) => e.type === "message_end");
		if (!end || end.type !== "message_end" || end.message.role !== "assistant") throw new Error("unreachable");
		expect(end.message.stopReason).toBe("length");
	});

	test("failed turn maps to error stop reason", () => {
		const acc = new KapStreamAccumulator();
		acc.feed({ type: "turn.started", turnId: 1 });
		acc.feed({ type: "assistant.delta", turnId: 1, delta: "x" });
		const events = acc.feed({ type: "turn.ended", turnId: 1, reason: "failed" });
		const end = events.find((e) => e.type === "message_end");
		if (!end || end.type !== "message_end" || end.message.role !== "assistant") throw new Error("unreachable");
		expect(end.message.stopReason).toBe("error");
	});

	test("error and warning events become notices", () => {
		const acc = new KapStreamAccumulator();
		expect(acc.feed({ type: "error", message: "boom" })).toEqual([
			{ type: "notice", level: "error", message: "boom", source: "kimi" },
		]);
		expect(acc.feed({ type: "warning", message: "careful" })).toEqual([
			{ type: "notice", level: "warning", message: "careful", source: "kimi" },
		]);
	});

	test("shell events map onto tool_execution events via commandId", () => {
		const acc = new KapStreamAccumulator();
		const events = [
			...acc.feed({ type: "shell.started", agentId: "a1", commandId: "c1" }),
			...acc.feed({ type: "shell.output", agentId: "a1", commandId: "c1", update: "line1" }),
			...acc.feed({ type: "shell.completed", agentId: "a1", commandId: "c1", isError: false }),
		];
		expect(events.map((e) => e.type)).toEqual(["tool_execution_start", "tool_execution_update", "tool_execution_end"]);
		const start = events[0];
		if (start.type !== "tool_execution_start") throw new Error("unreachable");
		expect(start.toolCallId).toBe("c1");
		expect(start.toolName).toBe("shell");
	});

	test("thinking deltas accumulate into a thinking block", () => {
		const acc = new KapStreamAccumulator();
		acc.feed({ type: "assistant.delta", turnId: 1, delta: "answer" });
		const events = acc.feed({ type: "thinking.delta", turnId: 1, delta: "reasoning" });
		const update = events.find((e) => e.type === "message_update");
		if (!update || update.type !== "message_update" || update.message.role !== "assistant") throw new Error("unreachable");
		expect(update.message.content[0]).toEqual({ type: "thinking", thinking: "reasoning" });
	});

	test("unknown event types are ignored", () => {
		const acc = new KapStreamAccumulator();
		expect(acc.feed({ type: "mcp.server.status" })).toEqual([]);
		expect(acc.feed({ type: "session.meta.updated" })).toEqual([]);
	});

	test("state resets after turn end", () => {
		const acc = new KapStreamAccumulator();
		acc.feed({ type: "turn.started", turnId: 1 });
		acc.feed({ type: "assistant.delta", turnId: 1, delta: "one" });
		acc.feed({ type: "turn.ended", turnId: 1, reason: "completed" });
		const events = acc.feed({ type: "turn.started", turnId: 2 });
		expect(events.map((e) => e.type)).toEqual(["agent_start", "turn_start"]);
		const updates = acc.feed({ type: "assistant.delta", turnId: 2, delta: "two" });
		const update = updates.find((e) => e.type === "message_update");
		if (!update || update.type !== "message_update" || update.message.role !== "assistant") throw new Error("unreachable");
		const textBlock = update.message.content.find((c) => c.type === "text");
		expect(textBlock).toEqual({ type: "text", text: "two" });
	});
});

describe("approvals", () => {
	const approval = {
		approval_id: "ap1",
		session_id: "s1",
		tool_call_id: "t1",
		tool_name: "bash",
		action: "exec",
		tool_input_display: "rm -rf /",
		created_at: "2026-09-14T10:00:00.000Z",
		expires_at: "2026-09-14T10:05:00.000Z",
	};

	test("approval becomes a select ui-request with safe defaults", () => {
		const frame = kapApprovalToUiRequest(approval, 42);
		expect(frame.t).toBe("ui-request");
		if (frame.t !== "ui-request") throw new Error("unreachable");
		expect(frame.request.kind).toBe("select");
		expect(frame.request.reqId).toBe(42);
		expect(frame.request.title).toBe("Approve bash?");
		expect(frame.request.options.map((o) => o.label)).toEqual(["Approve", "Approve for session", "Reject"]);
		expect(frame.request.initialIndex).toBe(0);
	});

	test("ui responses map back to kap decisions; dismissal never approves", () => {
		expect(uiResponseToApprovalDecision("Approve")).toEqual({ decision: "approved" });
		expect(uiResponseToApprovalDecision("Approve for session")).toEqual({ decision: "approved", scope: "session" });
		expect(uiResponseToApprovalDecision("Reject")).toEqual({ decision: "rejected" });
		expect(uiResponseToApprovalDecision(undefined)).toEqual({ decision: "cancelled" });
		expect(uiResponseToApprovalDecision("")).toEqual({ decision: "cancelled" });
		expect(uiResponseToApprovalDecision("weird")).toEqual({ decision: "cancelled" });
	});
});

describe("questions", () => {
	const question = {
		question_id: "q1",
		session_id: "s1",
		questions: [
			{
				id: "qi1",
				question: "Pick one",
				header: "Choice",
				body: "details here",
				options: [
					{ id: "o1", label: "Alpha", description: "first" },
					{ id: "o2", label: "Beta" },
				],
			},
			{
				id: "qi2",
				question: "Pick many",
				options: [
					{ id: "o3", label: "X" },
					{ id: "o4", label: "Y" },
				],
				multi_select: true,
				allow_other: true,
				other_label: "Custom",
			},
		],
		created_at: "2026-09-14T10:00:00.000Z",
	};

	test("one ui-request per question item with checkbox marker for multi-select", () => {
		const frames = kapQuestionToUiRequests(question, 100);
		expect(frames).toHaveLength(2);
		const [first, second] = frames;
		if (first.t !== "ui-request" || second.t !== "ui-request") throw new Error("unreachable");
		expect(first.request.reqId).toBe(100);
		expect(first.request.title).toBe("Choice");
		expect(first.request.helpText).toBe("details here");
		expect(first.request.selectionMarker).toBe("radio");
		expect(first.request.options.map((o) => o.label)).toEqual(["Alpha", "Beta"]);
		expect(second.request.reqId).toBe(101);
		expect(second.request.selectionMarker).toBe("checkbox");
		expect(second.request.options.map((o) => o.label)).toEqual(["X", "Y", "Custom"]);
	});

	test("answers decode by label; other text falls back; skip on empty", () => {
		const [item] = question.questions;
		expect(uiResponseToQuestionAnswer("Alpha", item)).toEqual({ kind: "single", option_id: "o1" });
		expect(uiResponseToQuestionAnswer(undefined, item)).toEqual({ kind: "skipped" });
		expect(uiResponseToQuestionAnswer("", item)).toEqual({ kind: "skipped" });
		// no allow_other on item 1 → unmatched label skips rather than inventing
		expect(uiResponseToQuestionAnswer("Gamma", item)).toEqual({ kind: "skipped" });
		const [, multi] = question.questions;
		expect(uiResponseToQuestionAnswer("Free text", multi)).toEqual({ kind: "other", text: "Free text" });
		expect(uiResponseToQuestionAnswer(JSON.stringify(["X", "Y"]), multi)).toEqual({
			kind: "multi",
			option_ids: ["o3", "o4"],
		});
	});
});
