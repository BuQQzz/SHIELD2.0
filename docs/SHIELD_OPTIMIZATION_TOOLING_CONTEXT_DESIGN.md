# SHIELD Optimization, Tooling & Context Architecture

**Status:** Living design / active brainstorm  
**Date:** 2026-09-21  
**Related branch:** `feat/mcp-permission-modes`

This document captures the next architecture direction for SHIELD after the September 2026 MCP/permission work.

The central idea is simple:

> **SHIELD should make local models better by making the harness smarter, cheaper, and more structured.**

The model should spend its limited compute deciding what to do, not carrying unnecessary schemas, rereading old history, remembering internal protocols, or rediscovering state that SHIELD can preserve for it.

Related docs:

- `SHIELD_AGENT_ARCHITECTURE.md`
- `MODEL_SYSTEM_BRAINSTORM.md`
- `PROMPT_RESEARCH.md`
- `PERMISSION_MODES_PLAN.md`
- `HYBRID_TOOL_CALLING_IMPLEMENTATION_PLAN.md`

---

# 1. Optimization is a product principle

Optimization should sit beside **local-first**, **privacy**, and **explicit permission** as a top-level SHIELD design principle.

Consumer hardware is not a limitation we hide from. It is the environment SHIELD is designed around.

Optimization happens at four layers.

## Model optimization

SHIELD should recommend models based on:

- actual GPU/VRAM
- RAM
- CPU capabilities
- task type
- measured model behavior
- native tool support
- runtime requirements
- benchmark results on comparable hardware

Parameter count alone should not determine whether a model is considered practical.

## Runtime optimization

The runtime should tune:

- CUDA / Vulkan / CPU backend
- GPU layer/offload strategy
- KV-cache format and size
- active context target
- batch/prefill settings
- CPU thread count
- speculative decoding / drafter models
- model-specific runtime flags
- prompt-prefix caching where supported

## Context optimization

Only useful information belongs in the active model window:

- stable system contract
- current task state
- recent turns
- relevant persistent notes
- relevant files/symbols
- relevant tool results
- relevant full tool schemas
- current runtime/mode state

## Agent optimization

Do not ask the model to do work code can do more reliably.

Examples:

- never repeat an identical completed tool call without a reason
- do not re-read unchanged files
- do not expose full schemas for unrelated tools
- do not reload giant historical context because it exists
- do not make the model infer permission policy
- do not make the model choose between multiple serialization protocols
- do not use a large model for work a smaller validated model can reliably complete

---

# 2. Hardware Profile

SHIELD should create a local host profile.

Example:

```text
GPU
  RTX 4070
  VRAM: 12 GB
  CUDA: yes

CPU
  architecture
  AVX/AVX2/etc.
  physical/logical cores

RAM
  total
  available

Runtime support
  mainline llama.cpp
  Prism runtime
  Vulkan
  CUDA

Measured
  prompt throughput
  decode throughput
  practical context target
  last benchmark
```

This profile becomes an input to:

- model recommendations
- runtime selection
- context budgets
- KV-cache choices
- speculative decoding recommendations
- automatic performance presets

The user can still override advanced settings, but should not need to understand them for SHIELD to perform well.

---

# 3. Model Library replaces the flat picker

The current model dropdown should become a small active-model control backed by a proper **Model Library** in the sidebar.

Suggested library sections:

## Installed

Models already on disk and ready to run.

## Recommended

Models SHIELD believes are especially good fits for the current host.

## Explore

Curated model catalog with filtering by:

- chat
- coding
- tool use
- reasoning
- vision
- tiny / fast
- long context

## Loaded

Currently resident runtime/model instances.

## Defaults

Startup model and future task-profile defaults.

## Runtime

Advanced view showing which runtime a model uses and why.

The composer can stay compact:

```text
Bonsai 2 27B · High          Auto
```

Clicking the model opens the library rather than expanding a huge dropdown.

---

# 4. Runtime Manager

A model and a runtime are separate concepts.

`LlamaService` should eventually become one provider implementation rather than the universal inference architecture.

Potential providers:

```text
NodeLlamaCppProvider
MainlineLlamaServerProvider
PrismRuntimeProvider
OpenAICompatibleLocalProvider
```

## Why managed sidecars are interesting

A SHIELD-managed local `llama-server` style runtime gives us:

- crash isolation from Electron
- runtime-specific binaries
- independent runtime upgrades
- native OpenAI-compatible tools
- runtime-specific launch flags
- cleaner benchmark collection
- easier support for specialized model architectures

The localhost API overhead is minor compared with model inference.

## Bonsai as the first special-runtime test

Bonsai is useful as an architecture test, not just another model.

The question is:

> Can SHIELD run a specialized optimized model through Prism's llama.cpp architecture without adding Prism-specific hacks throughout the rest of SHIELD?

If yes, the runtime/provider boundary is healthy.

Initial approach:

```text
SHIELD Runtime Manager
├── mainline llama.cpp runtime
└── Prism/Bonsai runtime
```

Prefer pinned known-good Prism runtime builds first.

Do **not** maintain a permanent SHIELD fork immediately unless we later need capabilities that cannot be cleanly consumed or contributed upstream.

---

# 5. Native MCP tool flow

MCP is the source of tool definitions and execution.

The preferred modern flow is:

```text
MCP server
   |
tools/list
   |
SHIELD Tool Registry
   |
model-native tool schemas
   |
MODEL
   |
structured tool call
   |
NormalizedToolCall
   |
ToolPolicy
   |
MCP tools/call
   |
native tool result
   |
MODEL
```

XML/text parsing becomes a compatibility adapter for models that cannot use native tools.

It should not remain the primary mental model for SHIELD.

---

# 6. Tool Atlas

A large tool ecosystem creates a context problem.

Two naive strategies both fail.

## Bad extreme A: load every schema

```text
50 tools
x names
x descriptions
x JSON schemas
x parameter descriptions
```

Consequences:

- higher prompt token usage
- slower prefill
- larger active context
- more attention competition
- more tool-selection mistakes

## Bad extreme B: expose only guessed-relevant tools

This saves tokens, but can make the model believe another capability does not exist.

Then it may:

- invent a workaround
- tell the user it cannot do something
- try the wrong tool repeatedly
- enter a loop

## Proposed solution: progressive tool disclosure

Separate **capability awareness** from **callable schema availability**.

### Always-visible Tool Atlas

Give the model a cheap map:

```text
filesystem.read_file — read a file
filesystem.search_files — find files
filesystem.write_file — create or replace a file
github.search_code — search repository code
github.create_pr — open a pull request
web.search — search the web
calendar.create_event — create a calendar event
```

This is not the full schema.

It answers:

> "What can SHIELD do?"

without paying the full cost of:

> "Exactly what JSON parameters does every possible tool require?"

### Selected native schemas

SHIELD selects likely tools for the current turn and provides their complete native schemas.

```text
User request
     |
Tool relevance engine
     |
top likely tools
     |
full schemas
```

### Tool search / loading

Keep one cheap meta-tool always available:

```text
find_tools(query)
```

or:

```text
load_tools(names[])
```

If the model realizes it needs something else, it asks SHIELD for the relevant schema.

Next turn:

```text
Tool Atlas
+ newly loaded full schema
+ current task
```

The model never has to assume that a capability is unavailable.

## Hierarchical Tool Atlas

For very large ecosystems, even one-line descriptions can become expensive.

Then the atlas becomes:

```text
Files
Git / GitHub
Web
Calendar
Email
Databases
Local system
```

The model expands a category only when needed.

## Permissions remain separate

The atlas describes what SHIELD can potentially do.

The active mode determines what may actually happen:

```text
Ask
Auto
Plan
Read-only
```

The model does not decide its own privileges.

---

# 7. Tool Registry

The Tool Registry should be the internal source of truth regardless of tool origin.

Possible origins:

```text
MCP server
built-in SHIELD tool
future plugin
local OS integration
provider-native tool
```

Normalized metadata can include:

```text
name
namespace/server
short description
full description
input schema
output schema
read-only/mutating classification
permission requirements
cost/latency estimate
availability
loaded/deferred state
```

This registry produces:

- Tool Atlas entries
- native model tool schemas
- permission-policy inputs
- audit metadata
- UI descriptions

---

# 8. Context is a hardware-managed resource

Long context is not free on a local machine.

Even when a model advertises a huge maximum context, actively carrying a large history increases:

- KV-cache memory
- RAM/VRAM pressure
- prompt-prefill time
- time to first token
- context noise

Therefore SHIELD should optimize for **useful active context**, not maximum possible context.

The complete conversation can remain persisted locally without remaining inside every inference request.

---

# 9. Auto-compaction

SHIELD should automatically compact active context as a task grows.

## Do not trigger only by token percentage

A fixed "compact at 80%" rule ignores local hardware.

Use a combined **Context Budget**.

Inputs may include:

```text
model maximum context
recommended active context
KV-cache memory estimate
available VRAM
available RAM
prefill latency
model profile
runtime profile
task complexity
amount of redundant/stale conversation
```

A 262K model on a consumer GPU should not automatically mean SHIELD tries to maintain 262K active tokens.

## Task Capsule

Before compaction, create a structured state capsule:

```text
Objective
Current state
Completed work
Files/resources touched
Important tool results
Decisions made
Constraints
Open questions
Next steps
Verification/tests
```

That capsule becomes the durable bridge between context windows.

## Compaction does not delete history

Important distinction:

```text
Persisted conversation history
         !=
Active inference context
```

SHIELD retains the original history locally.

Only the model-facing active context is compressed/reassembled.

---

# 10. Persistent model-maintained Wiki

Instead of one giant "memory note," give SHIELD a small local wiki.

Example:

```text
Project: SHIELD
├── Architecture
│   ├── Agent loop
│   ├── MCP/tool system
│   ├── Context engine
│   └── Runtime providers
├── Decisions
│   ├── Native tools first
│   ├── Tool Atlas
│   └── Ask/Auto/Plan/Read-only
├── Current Work
│   ├── MCP permission branch
│   └── Bonsai integration
├── Known Issues
└── Benchmarks
```

## Memory Atlas

The model should not receive every page.

Give it a cheap index:

```text
architecture/mcp
  Current MCP and tool-disclosure architecture

architecture/runtime
  Provider and runtime decisions

current/bonsai
  Current Bonsai integration state

benchmarks/qwen
  Qwen benchmark observations
```

Then it reads only what matters.

This mirrors the Tool Atlas:

```text
TOOLS                       MEMORY
-----                       ------
Tool Atlas                  Memory Atlas
   |                            |
selected schemas            selected pages
   |                            |
 model                       model
```

That symmetry may be useful across the entire SHIELD architecture.

---

# 11. Notes are state, not chain-of-thought

The wiki should not become a dump of hidden reasoning.

Good persistent notes:

- architectural decisions
- facts learned from files/tools
- current task state
- constraints
- known issues
- benchmark measurements
- unresolved questions
- next actions

Bad persistent notes:

- rambling internal reasoning
- repeated narration
- unsupported guesses stored as fact

Model-maintained notes should be inspectable by the user.

---

# 12. Memory storage

Start simple.

SQLite is already part of SHIELD.

A wiki page can contain:

```text
id/path
title
summary
body
scope
tags
source references
createdAt
updatedAt
lastVerified
confidence
supersedes
optional expiresAt
```

SQLite FTS may be enough initially.

A vector database should not be added until benchmark evidence shows keyword/FTS + structured page selection is insufficient.

---

# 13. Memory scopes

Persistent information needs boundaries.

Suggested scopes:

```text
global
project/repository
task/conversation
model/runtime
user-approved preference
```

A note from an old unrelated repository should never silently enter a new task.

Stale notes that materially affect an action should be revalidated.

---

# 14. Compaction + wiki handoff

Before a major context refresh:

```text
1. Agent updates relevant wiki pages
2. Agent/runtime updates Task Capsule
3. SHIELD compacts old active turns
4. Recent turns remain verbatim
5. Context engine selects relevant wiki pages
6. Relevant tool schemas are loaded
7. Task continues
```

This makes long-running work possible without requiring a consumer GPU to carry the full history forever.

---

# 15. Proposed unified context assembly

A future SHIELD turn may look like:

```text
Stable system contract

Synthetic runtime state
  mode
  runtime
  context budget
  allowed paths

Tool Atlas
  compact capability map

Loaded tool schemas
  only likely/current tools

Memory Atlas
  compact page index

Selected wiki pages
  only relevant persistent state

Task Capsule
  current long-horizon state

Repo/symbol context
  selected relevant code

Recent raw turns

Current user request
```

Everything is selected deliberately.

---

# 16. Optimization feedback loop

SHIELD should learn from its own local measurements.

After tasks, record anonymous/local-only operational metrics such as:

```text
model
runtime
hardware profile
prompt tokens
prefill time
decode tokens/sec
tool-call success
tool rounds
duplicate calls
context size
task completion
```

This data stays local by default.

It can improve:

- model recommendations
- active context targets
- tool disclosure counts
- runtime presets
- benchmark profiles

The goal is not "AI learns everything about the user."

The goal is:

> **SHIELD learns how to run AI better on this machine.**

---

# 17. First implementation experiments

These should be experiments, not simultaneous production rewrites.

## Experiment A — Native tools

Take one validated Qwen/Bonsai-capable model and route MCP definitions into its native tool interface.

Measure against current XML fallback.

## Experiment B — Tool Atlas

Test:

```text
all full schemas
vs
top-N full schemas only
vs
Tool Atlas + top-N schemas + find_tools
```

Measure:

- prompt tokens
- prefill time
- correct-tool rate
- failure-to-discover rate
- loops
- task completion

## Experiment C — Hardware-aware compaction

Run the same long task with:

```text
no compaction
token-threshold compaction
hardware-aware context budget
```

Measure:

- VRAM/RAM
- prefill latency
- quality retention
- task continuity

## Experiment D — Wiki memory

Have a model complete a multi-stage task across forced context resets.

Compare:

```text
summary only
one giant memory note
wiki + Memory Atlas
```

Measure how quickly and accurately it recovers task state.

## Experiment E — Bonsai runtime

Run Bonsai through a Prism-compatible runtime provider without changing higher-level agent code.

If higher layers require Prism-specific conditionals, the provider boundary needs improvement.

---

# 18. Current design status

| Idea | Status |
| --- | --- |
| Optimization as a top-level SHIELD principle | **Direction** |
| Replace flat model picker with Model Library | **Direction** |
| Separate model identity from runtime provider | **Direction** |
| Bonsai as first special-runtime test | **Proposal** |
| MCP → native model tool calling | **Direction** |
| Tool Atlas | **Proposal** |
| Progressive schema disclosure | **Proposal** |
| `find_tools` / lazy tool loading | **Proposal** |
| Hardware-aware auto-compaction | **Proposal** |
| Structured Task Capsule | **Proposal** |
| Persistent wiki memory | **Proposal** |
| Memory Atlas | **Proposal** |
| SQLite/FTS memory implementation | **Candidate implementation** |

---

# 19. Open questions

1. How many Tool Atlas entries can tiny models carry before categories become better than one-line tools?
2. Should tool relevance initially use simple keyword/classification logic, embeddings, or the active model itself?
3. Should `find_tools` return schemas immediately or activate them for a subsequent turn?
4. What is the right default number of full schemas to expose: 3, 5, 8, dynamic?
5. What combination of tokens, KV estimate, latency, and memory pressure should drive compaction?
6. Should users be able to directly edit the model's wiki pages?
7. Should the UI show which memory pages influenced a response/action?
8. How should stale wiki notes be revalidated?
9. Should task capsules live in the wiki, conversation database, or their own task table?
10. How much runtime benchmarking should happen automatically on first launch?
11. Can prompt-prefix caching preserve the Tool Atlas/system prefix across turns on all target runtimes?
12. Which Bonsai/Prism runtime features are actually required versus simply performance improvements?

---

# 20. Architecture sketch

```text
                         SHIELD
                            |
          +-----------------+------------------+
          |                 |                  |
      Model Library     Agent Core         MCP Gateway
          |                 |                  |
          v                 v                  v
    Runtime Manager     Context Engine     Tool Registry
          |                 |                  |
          |          +------+-------+          |
          |          |              |          |
          |     Task Capsule     Wiki Memory   |
          |          |              |          |
          |          +------+-------+          |
          |                 |                  |
          |          Memory Atlas        Tool Atlas
          |                 |                  |
          +-----------------+------------------+
                            |
                         Model Turn
                            |
                  native structured tools
                            |
                        ToolPolicy
                            |
                        MCP tools/call
                            |
                         Tool result


Cross-cutting:

                     SHIELD OPTIMIZER
                            |
          +-----------------+-----------------+
          |                 |                 |
       Hardware          Runtime           Context
       Profile           Tuning            Budget
          |                 |                 |
          +-----------------+-----------------+
                            |
                       Benchmark data
```

The architecture should keep returning to one question:

> **Can SHIELD make a local model feel more capable by wasting less of its compute and context?**

---

# 21. Context Engine — Context Packet, budgeting, and observability

The earlier sections describe the sources. The Context Engine should own the decision about what the model actually sees on each turn.

## Context Packet, not string concatenation

Do not let every feature append another string to one giant prompt. Build a structured packet first.

A packet can contain:

    stablePrefix
    runtimeState
    taskCapsule

    toolAtlas
    loadedToolSchemas

    memoryAtlas
    loadedMemoryPages

    repoAtlas
    loadedRepoContext

    recentConversation
    currentRequest

Every candidate context item should carry metadata such as:

    priority
    tokenCost
    relevance
    source
    scope
    freshness
    trust
    cacheable
    compressible
    pinned
    version

A possible internal item has identity, kind, content, token estimate, priority, relevance, scope, trust, cacheability, compressibility, pin state, source, and version.

The engine then builds both a Context Packet and a Context Report.

## Context tiers

Prefer a layout similar to:

    STABLE PREFIX
      SHIELD contract
      project instructions
      compact atlases

    CURRENT STATE
      mode
      task capsule
      current plan
      loaded schemas

    RETRIEVED DETAIL
      selected wiki pages
      selected repo symbols/files
      selected tool results

    RECENT RAW TURNS

    CURRENT USER REQUEST

Recent instructions remain close to generation while stable content stays cache-friendly.

## Budget Manager

Model maximum context is an upper bound, not the target.

Example:

    Model maximum        262K
    Hardware target       32K
    Response reserve       4K
    Tool/schema reserve    3K
    Working context       25K

Budget inputs can include:

- model profile
- runtime backend
- KV-cache estimate
- free VRAM/RAM
- measured prefill speed
- task complexity
- response reserve
- tool/schema needs

## Context value

When something has to leave the active window, not every token is equal.

Never-drop examples:

- current user instruction
- active permission/runtime policy
- explicit user constraints
- current task identity

High-value examples:

- Task Capsule
- current plan and decisions
- relevant code/file content
- verified relevant memory

Lower-value examples:

- old raw terminal logs
- stale tool output
- redundant assistant prose
- unrelated old conversation

The exact scoring should be benchmarked, but the engine should optimize value per active token rather than FIFO history alone.

## Progressive Context Sources

Tool, Memory, Repo, and future Skill retrieval should share one conceptual interface:

    index()
    search(query)
    load(ids)
    estimateCost(ids)
    invalidate(version)

Implementations:

    ToolContextSource
    MemoryContextSource
    RepoContextSource
    SkillContextSource

This makes progressive disclosure a SHIELD primitive instead of four unrelated features.

## Invalidation

Context caches need source versions:

    repoVersion
    toolRegistryVersion
    memoryPageVersion
    skillCatalogVersion
    runtimeVersion

A git change should invalidate affected Repo Atlas entries, not every context source.

## Context Report

Every assembled turn should be inspectable.

Example:

    Context for turn

    System              812 tokens
    Runtime state        94
    Tool Atlas          318
    Loaded schemas      634
    Memory Atlas        201
    Wiki pages          744
    Task Capsule        522
    Repo context       2840
    Recent messages    1905
    User message         86
    -----------------------------
    Total              8156
    Budget            12288

    Omitted
      old terminal output
      reason: stale, low relevance

    Truncated
      test log
      54K chars -> 4K chars

    Compacted
      turns 1-37 -> Task Capsule v8

Development builds should expose why-included metadata so a poor response can be diagnosed as bad model vs bad retrieval vs missing context vs stale memory vs overloaded context.

## Task vs conversation

Long term:

    Conversation
      messages and user-visible interaction

    Task
      objective
      plan
      files/resources
      operations
      checkpoints
      tests
      decisions
      Task Capsule

A resumed task should not require replaying 90 old chat messages. It should load the Task Capsule, relevant atlas entries/pages, relevant repo state, and recent raw interaction.

---

# 22. Unreal Agent validation and new ideas

Fresh research on unreallabsai/unreal-agent (2026-09-22) independently validates several directions above.

Detailed notes: UNREAL_AGENT_RESEARCH.md

Particularly relevant:

- its Context Builder is I/O-pure and already models omitted, truncated, and compacted report categories
- its Skills feature gives the model a compact catalog and lazily loads one full skill with a native SkillUse tool, closely matching our Atlas pattern
- provider adapters normalize messages, reasoning, tool calls, and tool results
- sessions are append-only and forkable
- tool calls translate into durable, versioned Operations that execute asynchronously
- prompt-cache/session affinity is explicitly optimized
- benchmark trajectories and token accounting are built into the project

The most novel concept for SHIELD is a new proposal:

> Separate model-visible Tool Calls from durable machine Operations.

Possible SHIELD path:

    Native Tool Call
       |
    Tool Adapter / Translator
       |
    ToolPolicy
       |
    Operation Spec
       |
    Operation Manager
       |
    MCP / filesystem / process / plugin execution
       |
    Operation Result
       |
    Native Tool Result

This layer could eventually own concurrency, cancellation, recovery, retries, audit state, and remote/sandbox execution while keeping model-facing tools simple.
