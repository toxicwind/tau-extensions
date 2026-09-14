/**
 * kimi-wire — pure kap-server → pi-wire translation for the Tau collab surface.
 *
 * This module performs NO I/O. It translates:
 *   1. kap-server REST messages   → pi-wire `SessionEntry[]` (snapshot/backfill)
 *   2. kap-server WS v2 events    → pi-wire `AgentEvent[]`  (live streaming)
 *   3. kap-server approvals/questions → pi-wire `ui-request` HostFrames
 *      (lets a collab guest answer Kimi permission prompts)
 *
 * The pi-wire shapes below are structural mirrors of `@oh-my-pi/pi-wire`
 * (`tau/engine/packages/wire/src/index.ts` in sovereign-projects). They are
 * intentionally dependency-free: a future virtual-host package can import this
 * module and its output is directly assignable to the real pi-wire types.
 *
 * Architecture note — why a virtual host, not a collab-web patch:
 * collab-web's `GuestClient` is hardwired to sealed pi-wire `HostFrame`s
 * arriving from an omp relay host (`CollabSocket`; AES-GCM; `hello`/`welcome`
 * proto v3). There is no transport seam to swap in. The clean integration is
 * therefore host-side: a process that speaks kap-server (REST + WS v2) on one
 * side and emits pi-wire `HostFrame`s on the other. collab-web renders Kimi
 * sessions unmodified. This module is the translation core of that host.
 *
 * Source contracts (observed 2026-09-14, kimi-code @ f8c606e7d):
 *   packages/kap-server/src/protocol/{envelope,message,ws-control,events-zod,
 *   approval,question}.ts
 * Target contracts:
 *   sovereign-projects tau/engine/packages/{wire/src/index.ts,
 *   collab-web/src/lib/{client,socket}.ts}
 */

// ═══════════════════════════════════════════════════════════════════════════
// Mirrored pi-wire shapes (subset used by the translator)
// ═══════════════════════════════════════════════════════════════════════════

export interface WireTextContent {
	type: "text";
	text: string;
}

export interface WireThinkingContent {
	type: "thinking";
	thinking: string;
}

export interface WireToolCallContent {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	intent?: string;
}

export type WireAssistantContent = WireTextContent | WireThinkingContent | WireToolCallContent;

export type WireStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export interface WireUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: { total: number };
}

export const ZERO_USAGE: WireUsage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { total: 0 },
};

export interface WireUserMessage {
	role: "user";
	content: string;
	synthetic?: boolean;
	timestamp: number;
}

export interface WireAssistantMessage {
	role: "assistant";
	content: WireAssistantContent[];
	model: string;
	usage: WireUsage;
	stopReason: WireStopReason;
	errorMessage?: string;
	timestamp: number;
}

export interface WireToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: string;
	isError: boolean;
	timestamp: number;
}

export type WireMessage = WireUserMessage | WireAssistantMessage | WireToolResultMessage;

export interface WireMessageEntry {
	type: "message";
	id: string;
	parentId: string | null;
	timestamp: string;
	message: WireMessage;
}

export interface WireCustomMessageEntry {
	type: "custom_message";
	id: string;
	parentId: string | null;
	timestamp: string;
	customType: string;
	content: string;
	display: boolean;
}

export type WireSessionEntry = WireMessageEntry | WireCustomMessageEntry;

export type WireAgentEvent =
	| { type: "agent_start" }
	| { type: "agent_end" }
	| { type: "turn_start" }
	| { type: "turn_end" }
	| { type: "message_start"; message: WireMessage }
	| { type: "message_update"; message: WireMessage }
	| { type: "message_end"; message: WireMessage }
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown; intent?: string }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError?: boolean }
	| { type: "notice"; level: "info" | "warning" | "error"; message: string; source?: string };

export interface WireUiSelectItem {
	label: string;
	description?: string;
}

export interface WireUiSelectRequest {
	kind: "select";
	title: string;
	options: WireUiSelectItem[];
	reqId: number;
	initialIndex?: number;
	selectionMarker?: "radio" | "checkbox";
	checkedIndices?: number[];
	helpText?: string;
}

export type WireHostFrame =
	| { t: "entry"; entry: WireSessionEntry }
	| { t: "event"; event: WireAgentEvent }
	| { t: "ui-request"; request: WireUiSelectRequest }
	| { t: "ui-request-end"; reqId: number };

// ═══════════════════════════════════════════════════════════════════════════
// kap-server input shapes (structural mirrors of the zod contracts)
// ═══════════════════════════════════════════════════════════════════════════

export type KapRole = "user" | "assistant" | "tool" | "system";

export type KapMessageContent =
	| { type: "text"; text: string }
	| { type: "tool_use"; tool_call_id: string; tool_name: string; input: unknown }
	| { type: "tool_result"; tool_call_id: string; output: unknown; is_error?: boolean }
	| { type: "image"; source: unknown; name?: string }
	| { type: "video"; source: unknown; name?: string }
	| { type: "file"; file_id?: string; path?: string; name?: string; media_type?: string; size?: number }
	| { type: "thinking"; thinking: string; signature?: string };

export interface KapMessage {
	id: string;
	session_id: string;
	role: KapRole;
	content: KapMessageContent[];
	created_at: string;
	prompt_id?: string;
	parent_message_id?: string;
	metadata?: Record<string, unknown>;
}

/**
 * kap-server WS v2 stream events, structurally typed. Only the fields the
 * translator consumes are declared; unknown extra fields are ignored.
 */
export interface KapStreamEvent {
	type: string;
	agentId?: string;
	turnId?: number;
	delta?: string;
	toolCallId?: string;
	commandId?: string;
	name?: string;
	args?: unknown;
	argumentsPart?: string;
	description?: string;
	update?: unknown;
	output?: unknown;
	isError?: boolean;
	message?: string;
	reason?: string;
	interruptReason?: string;
}

export interface KapApprovalRequest {
	approval_id: string;
	session_id: string;
	turn_id?: number;
	tool_call_id: string;
	tool_name: string;
	action: string;
	tool_input_display: unknown;
	created_at: string;
	expires_at: string;
}

export interface KapQuestionOption {
	id: string;
	label: string;
	description?: string;
}

export interface KapQuestionItem {
	id: string;
	question: string;
	header?: string;
	body?: string;
	options: KapQuestionOption[];
	multi_select?: boolean;
	allow_other?: boolean;
	other_label?: string;
	other_description?: string;
}

export interface KapQuestionRequest {
	question_id: string;
	session_id: string;
	turn_id?: number;
	tool_call_id?: string;
	questions: KapQuestionItem[];
	created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

export function kapTimestampMs(iso: string): number {
	const ms = Date.parse(iso);
	return Number.isFinite(ms) ? ms : Date.now();
}

function asRecord(value: unknown): Record<string, unknown> {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return { _raw: value };
}

/** Plain-text rendering of a kap content list (text parts joined; others noted). */
export function kapTextOf(content: KapMessageContent[]): string {
	const parts: string[] = [];
	for (const part of content) {
		switch (part.type) {
			case "text":
				parts.push(part.text);
				break;
			case "thinking":
				parts.push(part.thinking);
				break;
			case "tool_use":
				parts.push(`[tool_use ${part.tool_name}]`);
				break;
			case "tool_result":
				parts.push(typeof part.output === "string" ? part.output : JSON.stringify(part.output));
				break;
			case "image":
				parts.push(`[image${part.name ? `: ${part.name}` : ""}]`);
				break;
			case "video":
				parts.push(`[video${part.name ? `: ${part.name}` : ""}]`);
				break;
			case "file":
				parts.push(`[file${part.name ? `: ${part.name}` : ""}]`);
				break;
		}
	}
	return parts.join("\n");
}

export interface KapMessageToEntriesOptions {
	/** Model label stamped on assistant messages (kap messages carry none). */
	model?: string;
	/**
	 * kap `tool_result` parts carry no tool name; resolve via this map when
	 * the caller tracked `tool_call_id → tool_name` from stream events.
	 */
	toolNames?: ReadonlyMap<string, string>;
	now?: () => number;
}

/**
 * Translate one kap-server REST message into pi-wire session entries.
 * A `tool`-role message fans out to one entry per `tool_result` part because
 * pi-wire's `ToolResultMessage` carries a single `toolCallId`.
 */
export function kapMessageToEntries(msg: KapMessage, opts: KapMessageToEntriesOptions = {}): WireSessionEntry[] {
	const now = opts.now ?? Date.now;
	const base = {
		id: msg.id,
		parentId: msg.parent_message_id ?? null,
		timestamp: msg.created_at,
	};

	switch (msg.role) {
		case "user": {
			const entry: WireMessageEntry = {
				...base,
				type: "message",
				message: {
					role: "user",
					content: kapTextOf(msg.content),
					timestamp: kapTimestampMs(msg.created_at),
				},
			};
			return [entry];
		}
		case "assistant": {
			const content: WireAssistantContent[] = [];
			for (const part of msg.content) {
				if (part.type === "text") content.push({ type: "text", text: part.text });
				else if (part.type === "thinking") content.push({ type: "thinking", thinking: part.thinking });
				else if (part.type === "tool_use")
					content.push({
						type: "toolCall",
						id: part.tool_call_id,
						name: part.tool_name,
						arguments: asRecord(part.input),
					});
				// image/video/file parts have no pi-wire AssistantContent equivalent; dropped (see docs).
			}
			const entry: WireMessageEntry = {
				...base,
				type: "message",
				message: {
					role: "assistant",
					content,
					model: opts.model ?? "kimi",
					usage: ZERO_USAGE,
					stopReason: "stop",
					timestamp: now(),
				},
			};
			return [entry];
		}
		case "tool": {
			const entries: WireSessionEntry[] = [];
			for (const part of msg.content) {
				if (part.type !== "tool_result") continue;
				const output = typeof part.output === "string" ? part.output : JSON.stringify(part.output);
				const entry: WireMessageEntry = {
					...base,
					id: `${msg.id}:${part.tool_call_id}`,
					type: "message",
					message: {
						role: "toolResult",
						toolCallId: part.tool_call_id,
						toolName: opts.toolNames?.get(part.tool_call_id) ?? "",
						content: output,
						isError: part.is_error ?? false,
						timestamp: kapTimestampMs(msg.created_at),
					},
				};
				entries.push(entry);
			}
			return entries;
		}
		case "system": {
			const entry: WireCustomMessageEntry = {
				...base,
				type: "custom_message",
				customType: "kap-system",
				content: kapTextOf(msg.content),
				display: false,
			};
			return [entry];
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Live stream accumulator: kap WS v2 events → pi-wire AgentEvents
// ═══════════════════════════════════════════════════════════════════════════

interface PendingToolCall {
	name: string;
	argsRaw: string;
	args: Record<string, unknown>;
	intent?: string;
}

/**
 * Accumulates kap-server WS v2 stream events into pi-wire `AgentEvent`s.
 *
 * kap emits *deltas* (`assistant.delta`, `tool.call.delta`); pi-wire's
 * `message_update` carries the FULL accumulating partial message, so this
 * class holds the running text/thinking/tool-arg buffers and re-emits the
 * whole message on every delta. One instance per agent turn stream; feed
 * events in arrival order (`seq` order on the kap socket).
 */
export class KapStreamAccumulator {
	#text = "";
	#thinking = "";
	#tools = new Map<string, PendingToolCall>();
	#messageStarted = false;
	#turnActive = false;
	#model: string;

	constructor(model = "kimi") {
		this.#model = model;
	}

	#currentMessage(stopReason: WireStopReason = "stop"): WireAssistantMessage {
		const content: WireAssistantContent[] = [];
		if (this.#thinking) content.push({ type: "thinking", thinking: this.#thinking });
		content.push({ type: "text", text: this.#text });
		for (const [id, call] of this.#tools) {
			content.push({ type: "toolCall", id, name: call.name, arguments: call.args, intent: call.intent });
		}
		return {
			role: "assistant",
			content,
			model: this.#model,
			usage: ZERO_USAGE,
			stopReason,
			timestamp: Date.now(),
		};
	}

	#beginMessage(): WireAgentEvent[] {
		if (this.#messageStarted) return [];
		this.#messageStarted = true;
		return [{ type: "message_start", message: this.#currentMessage() }];
	}

	#upsertTool(id: string, name?: string): PendingToolCall {
		let call = this.#tools.get(id);
		if (!call) {
			call = { name: name ?? "unknown", argsRaw: "", args: {} };
			this.#tools.set(id, call);
		} else if (name && call.name === "unknown") {
			call.name = name;
		}
		return call;
	}

	#mergeArgs(call: PendingToolCall, part: string): void {
		call.argsRaw += part;
		try {
			call.args = asRecord(JSON.parse(call.argsRaw));
		} catch {
			call.args = { _raw: call.argsRaw };
		}
	}

	feed(event: KapStreamEvent): WireAgentEvent[] {
		switch (event.type) {
			case "turn.started": {
				if (this.#turnActive) return [];
				this.#turnActive = true;
				return [{ type: "agent_start" }, { type: "turn_start" }];
			}
			case "assistant.delta": {
				const head = this.#beginMessage();
				this.#text += event.delta ?? "";
				return [...head, { type: "message_update", message: this.#currentMessage() }];
			}
			case "thinking.delta": {
				const head = this.#beginMessage();
				this.#thinking += event.delta ?? "";
				return [...head, { type: "message_update", message: this.#currentMessage() }];
			}
			case "tool.call.started": {
				const id = event.toolCallId ?? "";
				const call = this.#upsertTool(id, event.name);
				call.intent = typeof event.description === "string" ? event.description : undefined;
				if (event.args !== undefined) {
					call.args = asRecord(event.args);
					call.argsRaw = JSON.stringify(event.args);
				}
				this.#beginMessage();
				return [
					{
						type: "tool_execution_start",
						toolCallId: id,
						toolName: call.name,
						args: call.args,
						intent: call.intent,
					},
				];
			}
			case "tool.call.delta": {
				const id = event.toolCallId ?? "";
				const call = this.#upsertTool(id, event.name);
				if (event.argumentsPart) this.#mergeArgs(call, event.argumentsPart);
				this.#beginMessage();
				return [
					{
						type: "tool_execution_update",
						toolCallId: id,
						toolName: call.name,
						args: call.args,
						partialResult: call.argsRaw,
					},
				];
			}
			case "tool.progress": {
				const id = event.toolCallId ?? "";
				const call = this.#upsertTool(id, event.name);
				return [
					{
						type: "tool_execution_update",
						toolCallId: id,
						toolName: call.name,
						args: call.args,
						partialResult: event.update,
					},
				];
			}
			case "tool.result": {
				const id = event.toolCallId ?? "";
				const call = this.#upsertTool(id, event.name);
				return [
					{
						type: "tool_execution_end",
						toolCallId: id,
						toolName: call.name,
						result: event.output,
						isError: event.isError,
					},
				];
			}
			// Shell commands are not tool calls in kap, but pi-wire renders
			// execution through tool_execution_* — map commandId onto toolCallId.
			case "shell.started": {
				const id = event.commandId ?? "";
				this.#upsertTool(id, "shell");
				return [{ type: "tool_execution_start", toolCallId: id, toolName: "shell", args: {} }];
			}
			case "shell.output": {
				const id = event.commandId ?? "";
				const call = this.#upsertTool(id, "shell");
				return [
					{
						type: "tool_execution_update",
						toolCallId: id,
						toolName: call.name,
						args: {},
						partialResult: event.update,
					},
				];
			}
			case "shell.completed": {
				const id = event.commandId ?? "";
				const call = this.#upsertTool(id, "shell");
				return [
					{
						type: "tool_execution_end",
						toolCallId: id,
						toolName: call.name,
						result: "",
						isError: event.isError,
					},
				];
			}
			case "turn.step.retrying": {
				return [{ type: "notice", level: "info", message: `Retrying step (${event.message ?? "unknown attempt"})` }];
			}
			case "error": {
				return [{ type: "notice", level: "error", message: event.message ?? "unknown error", source: "kimi" }];
			}
			case "warning": {
				return [{ type: "notice", level: "warning", message: event.message ?? "unknown warning", source: "kimi" }];
			}
			case "turn.ended": {
				const out: WireAgentEvent[] = [];
				if (this.#messageStarted) {
					out.push({ type: "message_end", message: this.#currentMessage(mapStopReason(event)) });
				}
				if (this.#turnActive) {
					out.push({ type: "turn_end" }, { type: "agent_end" });
				}
				this.#reset();
				return out;
			}
			default:
				return [];
		}
	}

	#reset(): void {
		this.#text = "";
		this.#thinking = "";
		this.#tools = new Map();
		this.#messageStarted = false;
		this.#turnActive = false;
	}
}

function mapStopReason(event: KapStreamEvent): WireStopReason {
	if (event.interruptReason === "max_steps") return "length";
	switch (event.reason) {
		case "completed":
			return "stop";
		case "cancelled":
			return "aborted";
		case "failed":
		case "blocked":
			return "error";
		default:
			return "stop";
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Approvals & questions → pi-wire ui-request frames
// ═══════════════════════════════════════════════════════════════════════════

export const APPROVAL_OPTION_LABELS = ["Approve", "Approve for session", "Reject"] as const;
export type ApprovalOptionLabel = (typeof APPROVAL_OPTION_LABELS)[number];

export interface ApprovalDecision {
	decision: "approved" | "rejected" | "cancelled";
	scope?: "session";
	feedback?: string;
}

/**
 * kap approval → pi-wire `ui-request` (kind "select"). The guest's answer
 * comes back as a `ui-response` string; decode it with
 * {@link uiResponseToApprovalDecision}.
 */
export function kapApprovalToUiRequest(approval: KapApprovalRequest, reqId: number): WireHostFrame {
	return {
		t: "ui-request",
		request: {
			kind: "select",
			title: `Approve ${approval.tool_name}?`,
			options: APPROVAL_OPTION_LABELS.map((label) => ({ label })),
			reqId,
			initialIndex: 0,
			helpText: typeof approval.tool_input_display === "string" ? approval.tool_input_display : undefined,
		},
	};
}

/** Map a guest's `ui-response` value back onto a kap `ApprovalResponse`. */
export function uiResponseToApprovalDecision(value: string | undefined): ApprovalDecision {
	switch (value) {
		case "Approve":
			return { decision: "approved" };
		case "Approve for session":
			return { decision: "approved", scope: "session" };
		case "Reject":
			return { decision: "rejected" };
		default:
			// Dismissed / empty answer: treat as cancelled, never as approval.
			return { decision: "cancelled" };
	}
}

export interface QuestionAnswer {
	kind: "single" | "multi" | "other" | "multi_with_other" | "skipped";
	option_id?: string;
	option_ids?: string[];
	text?: string;
}

/**
 * kap question request → one pi-wire `ui-request` per question item.
 * Multi-select items render as checkbox selects; pi-wire's `ui-response`
 * carries a single string, so multi-select answers need an encoding
 * convention (JSON array) agreed with the virtual host — see
 * {@link uiResponseToQuestionAnswer} and the docs.
 */
export function kapQuestionToUiRequests(question: KapQuestionRequest, reqIdBase: number): WireHostFrame[] {
	return question.questions.map((item, index) => {
		const options: WireUiSelectItem[] = item.options.map((o) => ({
			label: o.label,
			description: o.description,
		}));
		if (item.allow_other) options.push({ label: item.other_label ?? "Other" });
		return {
			t: "ui-request",
			request: {
				kind: "select",
				title: item.header ?? item.question,
				options,
				reqId: reqIdBase + index,
				selectionMarker: item.multi_select ? "checkbox" : "radio",
				checkedIndices: [],
				helpText: item.body,
			},
		} satisfies WireHostFrame;
	});
}

/**
 * Decode a guest's `ui-response` string for a question item back into a kap
 * `QuestionAnswer`. Single-select matches by label; anything unmatched (when
 * `allow_other`) becomes an `other` answer. Multi-select answers are expected
 * as a JSON array of labels — a convention the virtual host must document to
 * guests, since pi-wire only transports one string.
 */
export function uiResponseToQuestionAnswer(value: string | undefined, item: KapQuestionItem): QuestionAnswer {
	if (value === undefined || value === "") return { kind: "skipped" };
	if (item.multi_select) {
		try {
			const labels = JSON.parse(value);
			if (Array.isArray(labels)) {
				const ids = labels
					.map((label) => item.options.find((o) => o.label === label)?.id)
					.filter((id): id is string => typeof id === "string");
				if (ids.length > 0) return { kind: "multi", option_ids: ids };
			}
		} catch {
			// fall through to single-label matching
		}
	}
	const match = item.options.find((o) => o.label === value);
	if (match) return { kind: "single", option_id: match.id };
	if (item.allow_other) return { kind: "other", text: value };
	return { kind: "skipped" };
}
