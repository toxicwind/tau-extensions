# kap-server → pi-wire contract map

**Purpose:** precise field-level mapping between Moonshot's kap-server protocol
(`kimi-code/packages/kap-server`) and Tau's collab pi-wire protocol
(`sovereign-projects/tau/engine/packages/wire`), backing the `kimi-wire.ts`
translation module.

**Sources observed 2026-09-14** (kimi-code @ `f8c606e7d`):
- `packages/kap-server/src/protocol/{envelope,message,ws-control,events-zod,approval,question,session,task,tool,workspace,rest-*}.ts`
- `sovereign-projects/tau/engine/packages/wire/src/index.ts` (pi-wire, `COLLAB_PROTO = 3`)
- `sovereign-projects/tau/engine/packages/collab-web/src/lib/{client,socket}.ts`

**Architecture decision:** collab-web needs **zero** source changes. Its
`GuestClient` is hardwired to sealed pi-wire `HostFrame`s from an omp relay
host — there is no transport seam to swap. The integration point is a
**host-side virtual host**: a process speaking kap-server REST + WS v2 on one
side and emitting pi-wire `HostFrame`s on the other. `src/kimi-wire.ts` is the
pure translation core of that host (no I/O, no kap-server/pi-wire imports —
structural mirrors only, directly assignable to the real types).

---

## 1. Transport & auth

| kap-server | pi-wire / collab-web | Mapping |
|---|---|---|
| HTTP REST, envelope `{code, msg, data, request_id}`; `code: 0` = success | N/A (guest never does REST) | Virtual host unwraps the envelope; `code !== 0` → `notice` error frame, never a silent success |
| WS v2, subprotocol `kimi-code.bearer.<token>` | Relay WS `wss://host/r/<roomId>`, frames AES-GCM-sealed with the room key | Auth boundaries differ: the virtual host holds the kap bearer; guests hold only the collab room key. The omp-kimi gateway (`src/web.ts`) already implements this boundary — reuse it, never ship the kap bearer to the browser |
| Server hello: `{ws_connection_id, protocol_version: 2, heartbeat_ms, max_event_buffer_size, capabilities}` | Host `hello` → `welcome` (`proto: 3`), then `snapshot-chunk`s | Virtual host answers the collab `hello` itself; kap hello is internal |
| Session cursor `{seq, epoch}`; resumable event stream | `welcome.entryCount` + `snapshot-chunk[]` + `final: true` | On (re)connect the host replays kap history via REST `messages` → entries, then resumes the WS at the stored cursor |
| Control envelopes `{type, id, payload}` + `ack` | `ui-request` / `ui-response` (`reqId`) | `reqId` is host-assigned; map kap `approval_id`/`question_id` ↔ `reqId` in host state |

## 2. Messages → SessionEntry (snapshot/backfill)

kap `Message`: `{id, session_id, role, content[], created_at, prompt_id?, parent_message_id?, metadata?}`.

| kap role / content | pi-wire `SessionEntry` | Notes |
|---|---|---|
| `user` | `message` → `UserMessage{content: string}` | Text parts joined; image/video/file parts become `[image: name]` markers — pi-wire user content has no URL/file variants, and kap sources are usually file IDs, not browser-usable base64. **Lossy by design; documented.** |
| `assistant` text | `message` → `AssistantMessage.content[]` `{type:"text"}` | Direct |
| `assistant` thinking | `{type:"thinking", thinking}` | pi-wire has a native thinking block — no loss |
| `assistant` tool_use | `{type:"toolCall", id, name, arguments}` | `input: unknown` → record via `asRecord`; non-objects wrapped as `{_raw}` |
| `assistant` image/video/file | **dropped** | pi-wire `AssistantContent` has no image block. Gap: vision transcripts lose media on the collab surface. |
| `tool` / tool_result | `message` → `ToolResultMessage{toolCallId, toolName, content, isError}` | One entry **per part** (pi-wire carries one `toolCallId` per message). kap parts carry no `tool_name` — caller must supply a `toolCallId → toolName` map tracked from stream events, else `""`. |
| `system` | `custom_message{customType:"kap-system", display:false}` | Hidden by default; guests can still fetch it |

Field notes: `parent_message_id` → `parentId` (null when absent); `created_at` (ISO) → entry `timestamp` (ISO kept) and message `timestamp` (ms). kap messages carry no model/usage — stamped `model: "kimi"` (overridable) and zero usage.

## 3. WS events → AgentEvent (live)

kap emits **deltas**; pi-wire `message_update` carries the **full accumulating
partial message**. `KapStreamAccumulator` holds the running buffers and
re-emits the whole message per delta. Feed kap events in `seq` order.

| kap WS event (`type`) | pi-wire `AgentEvent` | Notes |
|---|---|---|
| `turn.started` | `agent_start`, `turn_start` | Emitted once per turn |
| `assistant.delta` | `message_start` (first), then `message_update` (full) | Text accumulates |
| `thinking.delta` | `message_update` (full, thinking block first) | |
| `tool.call.started` | `tool_execution_start{toolCallId, toolName, args, intent}` | `intent` ← kap `description`; `args` ← full `args` when present |
| `tool.call.delta` | `tool_execution_update{args, partialResult}` | `argumentsPart` fragments accumulate; `args` = best-effort `JSON.parse`, else `{_raw}`; `partialResult` = raw fragment string |
| `tool.progress` | `tool_execution_update{partialResult: update}` | |
| `tool.result` | `tool_execution_end{result: output, isError}` | |
| `shell.started/output/completed` | `tool_execution_start/update/end` with `toolName: "shell"` | kap shells aren't tool calls; `commandId` stands in for `toolCallId` |
| `turn.step.retrying` | `notice{level:"info"}` | |
| `error` / `warning` | `notice{level, source:"kimi"}` | |
| `turn.ended` | `message_end`, `turn_end`, `agent_end` | `stopReason`: `completed`→`stop`, `cancelled`→`aborted`, `failed`/`blocked`→`error`; `interruptReason: max_steps`→`length` |
| `subagent.spawned/started/suspended/completed/failed` | **unmapped (gap)** | pi-wire has `AgentSnapshot` + `bus` channels for task subagents — a natural target, not yet implemented |
| `compaction.*` | **unmapped (gap)** | pi-wire has `CompactionEntry` + `auto_compaction_*` events — natural target |
| `agent.status.updated`, `session.meta.updated`, `mcp.server.status`, `tool.list.updated`, `event.config.changed`, … | ignored | No guest-visible equivalent; kept out of the frame stream |
| `prompt.submitted` | ignored | The user message arrives via the REST message list; emitting here would duplicate it |

## 4. Approvals & questions → ui-request

| kap | pi-wire | Round-trip |
|---|---|---|
| `ApprovalRequest{approval_id, tool_name, action, tool_input_display}` | `ui-request{kind:"select", title:"Approve <tool>?", options:[Approve, Approve for session, Reject], helpText: tool_input_display}` | `ui-response` label → `ApprovalResponse{decision, scope?}`. **Dismissal/empty/unknown → `cancelled`, never approval.** Fail-closed. |
| `QuestionRequest{questions[]}` | one `ui-request` per item; `selectionMarker: radio/checkbox`; `helpText: body`; `allow_other` appends an Other option | `ui-response` string → `QuestionAnswer` by label match; unmatched + `allow_other` → `other`; empty → `skipped`. **Multi-select gap:** pi-wire transports one string; multi answers use a JSON-array-of-labels convention the virtual host must document to guests. |

## 5. Known gaps / seams (honest list)

1. **Assistant vision content is dropped** — pi-wire `AssistantContent` has no image block.
2. **User message media is lossy** — kap image/video/file sources (URLs, file IDs, paths) become `[image: name]` markers; pi-wire user images require base64 the browser can't fetch with a kap file ID.
3. **Usage/cost is zeroed** — kap per-message usage isn't in the observed contracts; wire it through when the usage event payload is mapped.
4. **Subagent & compaction events unmapped** — natural pi-wire targets exist (`AgentSnapshot`, `bus`, `CompactionEntry`); deferred to the virtual-host build.
5. **Multi-select question answers** need the JSON-array convention on both ends.
6. **kap `tool_result` has no `tool_name`** — the host must track `toolCallId → name` from `tool.call.started` events.
7. **Epoch/cursor resume** — kap's `{seq, epoch}` resumability must be implemented in the virtual host's WS client; the translator is order-in, order-out.
8. **`prompt.steered`, `hook.result`, `skill.activated`** — no mapping; ignored.

## 6. What's NOT needed

- No collab-web source changes (guest is protocol-complete for this).
- No pi-wire changes (all used shapes already exist).
- No kap-server changes (translation is purely client-side).
