# Model System Rethink — Brainstorm

**Status:** Ideas only. Nothing here is decided or scheduled. Written to capture research before we agree on a direction.
**Date:** 2026-09-21

> **Update 2026-09-22: parts of this are out of date.** Plan mode (idea #4) has shipped.
> The claim that the hybrid parser had "partly addressed" format problems turned out
> to be wrong. The benchmark showed it was turning malformed arguments into `{}` and still running the call
> (now fixed). Open question #3's validation pass has been done. For the current
> direction and priorities see `SHIELD_AGENT_ARCHITECTURE.md` §13 and §20, and
> `testing/AGENT_BENCHMARK.md`.

---

## Why we're looking at this

- The model catalog has grown to 15 entries in a single flat dropdown (`src/config/models.ts`, `ModelSelector.tsx`) — picking a model means scrolling a list, not making an informed choice.
- We've had real-world compliance problems: models not reliably following tool-call format / instructions.
- Other harnesses (agentic coding tools, local chat UIs) have converged on patterns — provider abstraction, routing/fallback, simpler collapsible UI — that we haven't adopted.
- Bonsai (see prior session) surfaced that "just add a row to the model list" breaks down once a model needs a different runtime. That's a symptom of not having a provider layer, not a one-off.

## What SHIELD already has (don't rebuild this)

- **Hybrid tool-call parsing already shipped** (Feb 2026, per `CHANGELOG.md`): `src/handlers/toolCallParsing.ts` normalizes both XML (`<tool_call>`) and OpenAI-style (`tool_calls`) formats into one internal shape, feeding the existing MCP permission/audit flow. So the "models don't format tool calls right" problem was already partly addressed at the parser level.
- **Capability flags exist** (`ModelCapabilities` in `src/config/models.ts`) — `toolCalling`, `complexReasoning`, `structuredOutput`, etc. — but they only drive UI warnings ("MCP Limited") today. Nothing routes or suggests based on them.
- **One runtime**: everything goes through `node-llama-cpp` in-process bindings. No abstraction for "this model needs a different execution path" (exactly what blocked Bonsai).
- **Chat template + system prompt modules are already per-model** (`modelChatTemplates.ts`, `systemPrompts.ts` — "capability-based prompt modules," "automatic model family detection" per CHANGELOG). This is more infrastructure than most local-chat clones bother building.

So: **if compliance issues persist post-hybrid-parser, the remaining causes are more likely model/quant-specific** (a Q4_K_M 7B model just isn't reliable at structured output, regardless of prompt format) **than a parsing gap.** Worth a quick validation pass against the test matrix already sketched in `docs/HYBRID_TOOL_CALLING_IMPLEMENTATION_PLAN.md` before assuming more parser work is needed.

---

## How others are doing it

### [LM Studio Bionic](https://lmstudio.ai/blog/introducing-lm-studio-bionic) (shipped July 2026) — closest analog to what SHIELD is

- Separate agent app that sits **on top of** LM Studio's local model management layer — i.e., "model library/runtime" and "agentic chat surface" are architecturally split, not one monolith.
- **Local-first with an opt-in cloud escape hatch**: run models locally, or "switch to open-source models in the cloud for heavier tasks," with zero data retention and local inference that never leaves the machine even when cloud is used for the heavy lift. This is the privacy-first positioning we want, proven at a brand people already trust for local AI.
- Points at a local codebase → inspects/edits/debugs with **inline diffs requiring approval** before anything lands — same trust model SHIELD's file-permission dialogs already use.
- Settings structure (see your screenshot) splits "Local Models" into **Explore / Library / Loaded Instances / Local Model API / Local Model Defaults / Runtime** — i.e., discovery, what-you-have, what's-running, and API/runtime config are separate panels, not one big list.
- Model+effort combo selector in the composer ("Kimi K3 · High") — model choice and reasoning-effort/quality choice are two separate, small controls, not buried in one dropdown.

### [OpenCode](https://opencode.ai/) (208k GitHub stars, MIT)

- **Client/server split**: terminal, desktop, and IDE surfaces all talk to one engine. Relevant even if SHIELD stays single-surface — it's the same shape as "provider abstraction," just at the whole-app level instead of just the model layer.
- **Provider registry pattern**: connects to 75+ providers via a shared registry (Models.dev) plus "any OpenAI-compatible endpoint." SHIELD doesn't need 75 providers, but the *pattern* — a small provider interface (`load`, `chat`, `stream`, capability flags) that specific backends implement — is exactly what would have made Bonsai support a config entry instead of a new subsystem.
- **Plan mode**: a mode where the agent can't edit files, only draft what it intends to do. Directly reusable idea for SHIELD's MCP file-operation flow — cheaper trust-building than a permission dialog per action.
- Extensibility via MCP + custom agents + plugins — SHIELD already has MCP; the agent/plugin layer is the part we don't have.

### [Jan.ai](https://jan.ai/), [Open WebUI](https://openwebui.com/), [AnythingLLM](https://anythingllm.com/) — the broader local-chat field

- **Jan.ai** is the closest positioning match: privacy-first, native desktop app, simple onboarding, 5.5M downloads. Good company to be in — but it's a *generalist* chat client. It doesn't do OS-level file permissions or an audit log the way SHIELD does.
- **Open WebUI** wins on breadth (any-model support, huge community) but has more restrictive commercial-reuse terms and is web-server-first, not a native desktop app.
- **AnythingLLM** differentiates on document-centric RAG (bundled vector DB, workspaces, zero-config `@agent` tools).
- Takeaway: SHIELD's actual differentiation isn't "yet another local chat UI" — it's **agentic system access with explicit consent + audit logging, on Windows, fully local.** None of these three foreground that. Worth keeping front-and-center rather than chasing generalist chat-UI feature parity.

### Routing patterns (from general LLM-gateway research — [LiteLLM](https://docs.litellm.ai/docs/routing-load-balancing), OpenRouter-style)

- **Sequential fallback chain**: try model A, fall back to model B on failure. Simplest, and useful for us in a narrow sense (model crashes / OOMs → fall back to a smaller one), but not the interesting case for a local-only app.
- **Complexity-based routing**: classify the request (simple chat vs. needs tools vs. needs long context) and route to the right-sized model automatically. This is the pattern that actually matters for SHIELD — we already compute capability flags per model, we just don't act on them yet.
- Important distinction from cloud gateways: **their routing optimizes for cost/latency across paid APIs. Ours would optimize for "don't silently degrade quality/privacy without telling the user."** A local app shouldn't auto-switch models behind someone's back — see proposal below.

---

## Ideas for SHIELD specifically (not a decision — pick, mix, or reject)

### 1. Formalize a provider/runtime layer
Instead of `LlamaService` hardcoding `node-llama-cpp`, define a small interface (`load`, `chat` (streaming), `unload`, capability flags) with implementations:
- `NodeLlamaCppProvider` (current behavior, default)
- `ExternalServerProvider` (spawns a `llama-server`-compatible binary and speaks HTTP — this is what Bonsai needs, and also what SHIELD3.0's README already assumes for its own llama-server mode)
- Future, optional: `RemoteEndpointProvider` for someone's own already-running OpenAI-compatible server (Ollama, LM Studio, etc.) — opt-in, not cloud, still local-network-only by default

This is the single highest-leverage change: it's what Bionic, OpenCode, and every gateway-style tool have in common, and it directly unblocks Bonsai without a one-off.

### 2. Restructure the catalog UI, not just the data
Mirror Bionic's split instead of one flat dropdown:
- **Installed** (what's ready to use now)
- **Browse/Explore** (the full catalog, filterable — this exists already as `ModelDownloadDialog`, just needs to become the primary entry point instead of a secondary dialog)
- **Defaults** (which model loads on startup, per-task defaults if we do #3)
- Group the browse view by use-case tags (Chat / Coding / Tool-use / Tiny-fast) instead of the current Premium/High-Perf/Efficient/Specialized tiers, which are about hardware cost, not what the user is trying to do.

### 3. Capability-aware *suggestions*, not silent routing
When a user's message needs something the loaded model can't do well (tool call requested but `toolCalling: false`), surface an inline suggestion to switch — don't auto-swap models behind their back. Keeps the "explicit consent" ethos consistent between file operations and model selection. This reuses capability flags that already exist; it's a UI/message-pipeline change, not a new subsystem.

### 4. Adopt a lightweight "Plan mode" for MCP file operations
Borrowed directly from OpenCode: a mode where the model can propose a multi-step plan (what files it'll touch and how) before any permission dialog fires, rather than approving one tool call at a time with no preview of what's coming. Complements, doesn't replace, the existing per-action permission dialog.

### 5. Prune, don't just reorganize
"We have a lot of models" is also a legitimate complaint on its own. Candidates to reconsider (not necessarily remove): the two Meta 1B/3B efficient-tier models overlap heavily with Qwen3 4B now that it's tool-calling-capable at a similar size; DeepSeek Coder 6.7B (2024-01) and Gemma 2 9B (2024-06) are the oldest, weakest-capability entries in the catalog relative to what's been added since. Fewer, better-labeled defaults > exhaustive coverage, per your "simplicity wins" instinct.

---

## Open questions for you

1. Does "chatbot first, personal assistant, sometimes coding" mean the provider-layer work (idea #1) is worth doing generally, or should it be scoped narrowly just to unblock Bonsai?
2. On suggestions vs. auto-routing (#3) — confirm the "never silently switch" instinct is right, or is some auto-behavior acceptable for pure quality-of-life (e.g., auto-picking context size)?
3. Worth spending a short validation pass on the *existing* hybrid parser against real models before assuming more architecture is needed for the compliance issue specifically?

No code touched for any of this — say which thread (if any) you want turned into an actual plan.
