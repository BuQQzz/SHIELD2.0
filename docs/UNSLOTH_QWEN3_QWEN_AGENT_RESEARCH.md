# Unsloth Qwen3 + Qwen-Agent Research (SHIELD 2.0)

**Date:** 2026-02-16  
**Goal:** Evaluate latest Unsloth Qwen3-family models and determine whether SHIELD already supports Qwen-Agent style tool calling, or what would be needed.

**Implementation plan:** [HYBRID_TOOL_CALLING_IMPLEMENTATION_PLAN.md](./HYBRID_TOOL_CALLING_IMPLEMENTATION_PLAN.md)

---

## Executive Summary

- SHIELD currently uses **XML-tag-based tool calling** (`<tool_call>...</tool_call>`) and post-response parsing.
- SHIELD does **not** currently implement native OpenAI-style function/tool-call message flow as first-class runtime behavior.
- Qwen-Agent and newer Qwen3/Qwen3.5 docs strongly center around **OpenAI-compatible function/tool calling** and agent loops.
- We can add newer Unsloth Qwen3-family models to SHIELD as chat/coding models quickly, but to fully align with Qwen-Agent behavior we should add a **JSON/OpenAI tool-call adapter path** (in addition to existing XML path).

---

## What SHIELD Already Supports (Codebase Snapshot)

### Tool-calling format in SHIELD

- `src/handlers/mcpToolHandler.ts` extracts tool calls using regex over XML blocks:
  - `<tool_call>`
  - `<server>...</server>`
  - `<tool>...</tool>`
  - `<arguments>{...json...}</arguments>`
- `src/config/systemPrompts.ts` explicitly instructs models to emit this exact XML format.
- `docs/mcp-integration.md` documents XML-centric MCP integration and model gating.

### Tool-call execution flow

- `src/handlers/mcpMessageHandler.ts` processes tool calls **sequentially**.
- Current logic handles one tool-call turn and then continues conversation with a tool result prompt.
- `src/handlers/messageHandler.ts` triggers MCP tool processing after assistant response text is produced.

### LLM runtime mode

- `src/services/LlamaService.ts` uses `node-llama-cpp` directly for local inference.
- This is a local llama.cpp-backed chat session path, not a built-in Python Qwen-Agent runtime.

---

## Latest External Findings (2026-02-16)

## 1) Unsloth + Qwen3 ecosystem updates

Observed from Unsloth GitHub/docs/HF pages:

- Unsloth actively promotes Qwen3/Qwen3.5 support and publishes fresh model updates.
- Unsloth docs include dedicated pages for:
  - `Qwen3-Coder-Next` local run guide
  - `Qwen3.5` local run guide
- Unsloth highlights GGUF + llama.cpp deployment guidance and model-specific serving settings.

Notable practical takeaway:

- **Qwen3-Coder-Next (80B total / 3B active MoE)** is framed as agentic coding focused and local-friendly relative to larger frontier models.
- **Qwen3.5-397B-A17B** is available but very large; practical local use is high-memory and not realistic for most SHIELD users.

## 2) Qwen3/Qwen3.5 tool-calling patterns

Observed from Qwen HF/model docs and deployment snippets:

- Recommended serving stacks for advanced behavior are typically vLLM/SGLang with parser flags (e.g. `--tool-call-parser qwen3_coder`, `--enable-auto-tool-choice`) depending on model.
- Tool-calling examples are OpenAI-compatible JSON function-call style (`tools`, `tool_calls`, `tool` role messages).

## 3) Qwen-Agent status and guidance

Observed from Qwen-Agent repo/docs:

- Qwen-Agent docs are active and recently updated (Jan/Feb 2026 updates present).
- Framework includes:
  - tool usage
  - planning/memory abstractions
  - MCP integration support
  - function-calling agents and templates
- Qwen-Agent notes emphasize configuration differences by model family/version and parser mode.

---

## Compatibility Assessment for SHIELD

## A) Add latest Unsloth Qwen3-family models to SHIELD catalog

**Status:** Partially ready now.

What already works:

- SHIELD model catalog already supports HuggingFace URI-based entries and Qwen chat template family handling.
- SHIELD local llama.cpp runtime can run GGUF models when resources are sufficient.

What to watch:

- Very large models (e.g., Qwen3.5 397B variants) are likely impractical for normal desktop profiles.
- For first rollout, prioritize realistic model sizes and quantizations.

## B) Support “Qwen-Agent recommended flow” directly

**Status:** Not currently native.

Why:

- SHIELD tool-calling pipeline is XML extraction + local orchestration.
- Qwen-Agent expects a function/tool-call loop and often OpenAI-compatible semantics.
- SHIELD does not currently embed Python Qwen-Agent runtime or direct agent protocol compatibility layer.

## C) Do we already support equivalent behavior?

**Short answer:** **Partially**.

- SHIELD already has an MCP tool execution loop with permissioning and audit controls.
- But protocol/style differs: SHIELD’s current primary path is XML tool-call prompting/parsing, not native function-call envelopes as first-class objects.

---

## Recommended Integration Path

## Phase 1 (Low-risk, high value)

1. Add **Qwen3-Coder-Next GGUF** as a new model option in catalog (with conservative capability flags).
2. Keep XML path as default fallback.
3. Add model notes in UI/docs indicating preferred sampling/context settings for Qwen3-Coder-Next.

## Phase 2 (Bridge to Qwen-Agent semantics)

1. Add a **dual parser strategy** in SHIELD:
   - existing XML parser (current)
   - OpenAI-style `tool_calls` JSON parser path
2. Normalize both parser outputs into one internal `ToolCallRequest` schema.
3. Preserve SHIELD permission dialog/audit flow unchanged.

## Phase 3 (Optional advanced support)

1. Add optional “Agent backend mode”:
   - External Qwen-Agent sidecar (Python process) as an optional integration.
2. Keep this behind explicit settings/experimental flag.
3. Maintain SHIELD privacy-first defaults and local-only execution constraints.

---

## Practical Model Prioritization for SHIELD

### Strong candidate now

- **Qwen3-Coder-Next (GGUF)**
  - Best fit for coding + tool usage direction.
  - More practical than 397B class models.

### Defer / optional enterprise-high-memory tier

- **Qwen3.5-397B-A17B (GGUF)**
  - Technically available.
  - Hardware footprint is extreme for typical SHIELD desktop installs.

---

## Risks / Notes

- Upstream parser recommendations (vLLM/SGLang flags, model behavior) can change quickly.
- Some provider/model docs include both “framework parses tools” and “agent parses tools” modes—SHIELD should avoid hard-coding one assumption globally.
- Keep model capability labels conservative until validated by SHIELD’s own tool-call tests.

---

## Source URLs Reviewed

- https://github.com/unslothai/unsloth
- https://unsloth.ai/docs
- https://unsloth.ai/docs/models/qwen3-coder-next
- https://unsloth.ai/docs/models/qwen3.5
- https://huggingface.co/unsloth
- https://huggingface.co/collections/unsloth/qwen35
- https://huggingface.co/unsloth/Qwen3-Coder-Next-GGUF
- https://huggingface.co/unsloth/Qwen3.5-397B-A17B-GGUF
- https://github.com/QwenLM/Qwen-Agent
- https://qwenlm.github.io/Qwen-Agent/en/
- https://qwenlm.github.io/Qwen-Agent/en/guide/
- https://qwen.ai/research
- https://huggingface.co/Qwen
- https://huggingface.co/Qwen/Qwen3-Coder-Next-GGUF

---

## Suggested Next Step in SHIELD Repo

If we proceed, implement **Phase 1 + Phase 2**:

- Add Qwen3-Coder-Next model catalog entry.
- Add dual tool-call parsing (XML + OpenAI tool_calls JSON) with a single normalized execution path.
- Keep permission and audit controls as-is.

See implementation details in [HYBRID_TOOL_CALLING_IMPLEMENTATION_PLAN.md](./HYBRID_TOOL_CALLING_IMPLEMENTATION_PLAN.md).
