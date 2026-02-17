# Hybrid Tool Calling Implementation Plan (SHIELD 2.0)

**Date:** 2026-02-16  
**Status:** Proposed implementation plan  
**Related research:** [UNSLOTH_QWEN3_QWEN_AGENT_RESEARCH.md](./UNSLOTH_QWEN3_QWEN_AGENT_RESEARCH.md)

---

## Objective

Implement a **hybrid tool-calling system** that supports both:

1. Existing XML tool calls (`<tool_call>...</tool_call>`) for compatibility.
2. OpenAI-style function/tool calls (`tool_calls`) for newer Qwen3/Qwen3.5/Qwen3-Coder-Next workflows.

All parsed tool calls must converge to one normalized internal request shape and use existing permission + audit controls.

---

## Scope

### In scope

- Add model catalog support for Qwen3-Coder-Next GGUF (Phase 1).
- Add parser routing and normalization layer for dual formats (Phase 2).
- Keep MCP permission dialog, audit logging, and path restrictions unchanged.
- Add docs for behavior and fallback policy.

### Out of scope (for this iteration)

- Full Python Qwen-Agent runtime embedding in SHIELD.
- Replacing existing XML parser entirely.
- Non-filesystem MCP expansion beyond current server constraints.

---

## Target Architecture

## 1) Input formats

- **XML path (legacy/compat):**
  - Parsed from assistant text response.
- **OpenAI-style path (new):**
  - Parsed from structured tool-call payload when available.
  - Fallback parser from assistant text only if structured payload unavailable.

## 2) Normalization layer

Normalize all tool calls to one internal object shape:

```ts
interface NormalizedToolCall {
  serverName: string;
  tool: string;
  arguments: Record<string, unknown>;
  callId?: string;
  source: "xml" | "openai";
}
```

## 3) Execution layer

- Reuse current MCP execution path and dialogs.
- Preserve user approval requirement and audit log behavior.

## 4) Response continuation layer

- Keep current conversational continuation behavior.
- Add support for multi-call batches where structured payload contains multiple calls.

---

## File-Level Implementation Plan

## Phase 1 — Model catalog update (Qwen3-Coder-Next)

### Files to update

- `src/config/models.ts`
- Optional docs:
  - `docs/features/MODEL_CAPABILITIES.md`
  - `docs/features/MODEL_DOWNLOAD.md`

### Work

- Add model entry for Qwen3-Coder-Next GGUF with conservative capability flags:
  - `toolCalling: true`
  - `structuredOutput: true`
  - `chatTemplate: "qwen"` (or dedicated template if introduced later)
- Add practical hardware/context guidance in docs.

### Acceptance criteria

- Model appears in selector/catalog.
- Model loads through existing download/load flow.
- Capabilities correctly influence MCP status messaging.

---

## Phase 2 — Dual parser + normalization

### Files to update

- `src/handlers/mcpToolHandler.ts`
- `src/handlers/mcpMessageHandler.ts`
- `src/handlers/messageHandler.ts`
- `src/types/*` (new/updated type definitions)
- Optional: `src/config/systemPrompts.ts`

### Work

1. Introduce parser abstraction:
   - `parseXmlToolCalls(...)`
   - `parseOpenAIToolCalls(...)`
2. Add normalizer to map both into `NormalizedToolCall`.
3. Add route selection policy:
   - prefer structured OpenAI call data when present
   - fallback to XML parser when absent/failing
4. Update execution loop to handle multiple normalized calls safely and sequentially (initially).
5. Keep existing continuation prompts compatible.

### Acceptance criteria

- Existing XML behavior remains functional.
- OpenAI-style tool calls execute via same permission/audit flow.
- Failures in one parser do not break fallback path.

---

## Phase 3 — Policy and reliability hardening

### Files to update

- `src/config/systemPrompts.ts`
- `docs/mcp-integration.md`
- `docs/UNSLOTH_QWEN3_QWEN_AGENT_RESEARCH.md`

### Work

- Add explicit runtime policy docs:
  - parser precedence
  - fallback conditions
  - error handling behavior
- Tune prompts for each path (XML fallback prompts remain available).

### Acceptance criteria

- Docs clearly describe hybrid behavior.
- Users can understand why a given path was used.

---

## Rollout Strategy

1. Ship Phase 1 first (model availability).
2. Ship Phase 2 behind a feature flag (e.g., `settings.tools.hybridParserEnabled`).
3. Run internal validation matrix:
   - Qwen2.5-7B (XML fallback expected)
   - Qwen2.5-Coder-32B (mixed)
   - Qwen3-Coder-Next (OpenAI-style preferred)
4. Enable by default after pass rate targets are met.

---

## Validation Matrix

## Functional tests

- Parse + execute XML single tool call.
- Parse + execute OpenAI-style single tool call.
- Parse + execute OpenAI-style multiple tool calls.
- Fallback from failed OpenAI parse to XML parse.

## Security tests

- Permission denial flow still blocks execution.
- Path restriction checks still enforced.
- Audit entries still emitted for all attempts.

## UX checks

- No regressions in MCP status labels.
- User-facing error messages remain clear and actionable.

---

## Risks and Mitigations

- **Risk:** Different model backends return heterogeneous tool payloads.
  - **Mitigation:** strict parser adapters + normalizer + defensive validation.
- **Risk:** Regression in legacy XML-only models.
  - **Mitigation:** keep XML parser as default fallback and include regression tests.
- **Risk:** Multi-call loops can create long chains and poor UX.
  - **Mitigation:** enforce max tool-call count per assistant turn and surface progress.

---

## Definition of Done

- Qwen3-Coder-Next is available in SHIELD model catalog.
- Hybrid parser path (OpenAI + XML fallback) is implemented and documented.
- Permission/audit/security behavior remains unchanged.
- Basic regression tests for XML and OpenAI tool-call paths pass.

---

## References

- [UNSLOTH_QWEN3_QWEN_AGENT_RESEARCH.md](./UNSLOTH_QWEN3_QWEN_AGENT_RESEARCH.md)
- `src/handlers/mcpToolHandler.ts`
- `src/handlers/mcpMessageHandler.ts`
- `src/handlers/messageHandler.ts`
- `src/config/models.ts`
- `docs/mcp-integration.md`
