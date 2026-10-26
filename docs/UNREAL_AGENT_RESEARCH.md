# Unreal Agent Research — What SHIELD Should Learn

**Status:** Fresh research / no implementation decision implied
**Date:** 2026-09-22
**Source snapshot:** unreallabsai/unreal-agent at b7c9bf1c5c2fa4127255c07727a7c8413e23944a

Unreal Labs published unreal-agent on 2026-09-21 as an MIT-licensed, Go-based, async-first agent harness.

This note records architectural findings relevant to SHIELD. It intentionally distinguishes implemented behavior from interfaces that are only scaffolded for future behavior.

Repository: https://github.com/unreallabsai/unreal-agent

---

# 1. Core decomposition

Unreal Agent separates the harness into unusually clean responsibilities:

    Inbox
      -> Coordinator
          -> Context Builder
          -> LLM Adapter
          -> Tool Registry
              -> Tool Translator
                  -> durable Operation(s)
                      -> Operation Manager
                          -> async primitive execution

The README defines:

- Session — append-only persisted history that can be forked
- Tool — model-visible schema bound to a translator
- Tool translator — validates a model call and synchronously translates it into one or more operations
- Operation — serializable work description executed asynchronously
- Context builder — stateful, I/O-free model request assembly
- Coordinator — owns the decision/event loop
- Operation manager — actor runtime for durable operations

## SHIELD takeaway

The most interesting boundary is that model intent and execution are different layers.

    Model Tool Call
         |
    Tool Adapter / Translator
         |
    Permission Policy
         |
    Durable Action / Operation
         |
    Executor

This gives SHIELD a clean place for permission approval, retries, cancellation, audit logging, crash recovery, async execution, and remote or sandbox execution later.

---

# 2. Async-first tool calls

## Implemented now

Their prompt explicitly tells the model that tool calls run asynchronously. Independent calls should be issued together. A running call does not block the agent. When a result finishes, it can wake another model turn.

The Context Builder temporarily represents unfinished work with a model-facing running result.

The Coordinator listens concurrently for:

- new external and control inputs
- operation state updates
- model responses
- tool heartbeats
- short grace windows that batch fast completions

A one-second grace period lets quickly completed calls arrive together before another model turn starts.

## SHIELD takeaway

Our current multi-round loop is sequentially agentic. A later SHIELD endpoint could allow:

    Model turn
      -> read A
      -> read B
      -> run test C

    A, B, C begin concurrently

    B finishes -> state updated
    A finishes -> state updated
    C still running -> model can continue independent work
    C finishes -> wakes another turn

This can reduce both wall-clock time and the number of model turns.

It also suggests that tool rounds may eventually be less useful than tracking a set of in-flight operations.

---

# 3. Tool Call -> Translator -> Operation

## Implemented now

A tool translator performs no I/O.

It receives a normalized tool call, validates it, and emits one or more serializable operation specs.

For Bash:

1. validate model arguments
2. create a Shell operation spec
3. submit it through coordinator-owned state
4. later convert durable operation state back into a model-facing result

The operation runtime performs the actual process and filesystem work.

## SHIELD takeaway

A model-visible tool does not need to equal one operating-system action.

    Tool Call: deploy_project
           |
           +-- Operation: build
           +-- Operation: upload
           +-- Operation: verify

MCP can plug into the same boundary:

    Native model tool call
           |
    SHIELD Tool Registry
           |
    MCP Tool Adapter
           |
    ToolPolicy
           |
    MCP Operation
           |
    MCP Client / executor
           |
    Native tool result

Built-in tools, MCP tools, future plugins, and OS integrations can normalize into the same execution layer.

---

# 4. Durable, versioned Operations

## Implemented now

Operations contain an ID, type, version, status, serialized state, idempotency data, and output limit.

Statuses include:

- ready
- awaiting
- canceling
- completed
- failed
- canceled

The operation manager starts an operation ID at most once during its lifetime.

Operations checkpoint state as they proceed.

Their Shell operation is a resumable state machine:

    create directory
     -> create stdout file
     -> create stderr file
     -> start process
     -> wait
     -> read stdout
     -> read tail when truncated
     -> read stderr
     -> finish

Full stdout and stderr captures remain on disk even when the model-facing result is truncated.

## SHIELD takeaway

This is stronger than merely persisting that a tool call happened.

A future SHIELD Task Store could durably know:

    operation id
    originating tool call
    permission decision
    runtime state
    artifacts
    full output path
    current status
    retry/cancel state

That enables genuine crash recovery and long-running local tasks.

---

# 5. Append-only sessions and forks

## Implemented now

Session history is append-only and uses typed events:

- fork
- input
- turn
- model response
- tool-call status

Tool-call status is persisted atomically with operation snapshots. On resume, unfinished operation state is restored. Sessions can fork from an earlier turn.

## SHIELD takeaway

Long term, an append-only task/session event log may be safer than treating mutable chat messages as the source of truth.

Possible SHIELD events:

    InputReceived
    TurnStarted
    ModelResponded
    ToolProposed
    PermissionGranted
    OperationStarted
    OperationUpdated
    OperationCompleted
    ContextCompacted
    MemoryUpdated

Conversation UI can become a projection of durable task history.

This would help undo/fork, replay, debugging, crash recovery, auditing, and benchmarks.

---

# 6. Context Builder: I/O-pure and observable

## Implemented now

The Context Builder owns in-memory model-request assembly and performs no I/O.

Its result contains both the prepared model request and a Report.

The report already defines three change categories:

- omitted
- truncated
- compacted

## Scaffolded, not fully implemented yet

The current default builder mainly combines a committed prefix with a staged suffix. The report does not yet implement the sophisticated budgeting and compaction we want.

However, the interface was explicitly designed to report context transformations.

They also define a special compaction turn type, and the Coordinator treats compaction responses specially. Tests cover interruption, recovery, delivery, and forks around compaction turns.

So compaction is clearly an architectural concern even though the default builder is not yet a complete context optimizer.

## SHIELD takeaway

This independently validates our proposed Context Report.

Every SHIELD turn should eventually be able to explain:

    Included:
      Task Capsule       522 tokens
      recent messages   1905
      repo context      2840

    Omitted:
      old terminal log
      reason: stale + low relevance

    Truncated:
      test output
      54,200 chars -> 4,000 chars

    Compacted:
      turns 1-37
      -> Task Capsule v8

Context optimization should be observable rather than magical.

---

# 7. Progressive disclosure: Skills validate our Atlas pattern

## Implemented now

Unreal Agent discovers skill files from .harness/skills/*/SKILL.md.

It does not inject every complete skill into the prompt. Instead, the prompt receives compact skill metadata: name, description, and location.

The model has one native SkillUse tool that lazily loads the complete selected skill file.

## SHIELD takeaway

This is nearly the same progressive-disclosure primitive we designed:

    Skill Universe
      -> Skill Atlas
      -> selected full skill

    Tool Universe
      -> Tool Atlas
      -> selected full schemas

    Memory Universe
      -> Memory Atlas
      -> selected wiki pages

    Repository
      -> Repo Atlas
      -> selected files/symbols

This is practical independent validation of the Atlas approach.

---

# 8. Provider-normalized model items

## Implemented now

The core LLM representation is provider-independent.

Normalized item types include:

- message
- tool call
- tool result
- reasoning

Provider adapters convert those values to their wire formats.

The current provider set includes:

- Ollama
- OpenAI
- OpenAI Codex
- OpenRouter
- Fireworks

Ollama uses its local OpenAI-compatible Responses endpoint.

## SHIELD takeaway

This is close to the provider boundary we want.

SHIELD Agent Core should not care whether a model is served by node-llama-cpp, mainline llama-server, Prism/Bonsai runtime, Ollama, LM Studio, or an optional cloud backend.

---

# 9. Native tool results

## Implemented now

The normalized request has explicit tool-call and tool-result items.

The Responses adapter serializes results as native function-call outputs rather than pretending they are user messages.

## SHIELD takeaway

This supports one of our highest-priority MCP cleanup goals.

Tool results should become first-class model input, with user-role compatibility envelopes only for runtimes that genuinely require them.

---

# 10. Harness validation over provider strictness

## Implemented now

When function tools are converted to the OpenAI wire format, provider-side schema strictness is disabled.

Their stated reason is that external tools can contribute loose schemas and the harness validates tool calls itself.

## SHIELD takeaway

For MCP, SHIELD should own normalization and validation even when a backend can constrain generation.

That gives one enforcement path across local runtimes with very different native tool quality.

---

# 11. Stable-session prompt caching

## Implemented now

Their OpenRouter adapter:

- hashes a session cache key
- uses session affinity
- opts into a one-hour prompt cache
- explicitly accounts for long tool/reasoning gaps that could otherwise lose a warm growing prefix

## SHIELD takeaway

Our stable-prefix idea should become an explicit Context Engine/runtime contract.

Track:

- stable cacheable prefix
- dynamic suffix
- which changes invalidate the prefix
- backend cache capabilities

For local llama.cpp-family runtimes, this can map to prompt/KV-cache reuse strategies.

---

# 12. MCP is currently isolated from the slim runner

## Important current-state note

The current public slim runner does not expose MCP.

Its request tests reject an mcp_servers field, and the Harbor integration notes that the runner exposes Bash and ViewImage even when a benchmark task declares MCP servers.

Current tests contain historical or unavailable names such as McpSearch and McpCall, but those tools do not resolve in the slim runner.

A 2026-09-21 commit is explicitly titled:

"Isolate MCP and add a slim unreal-agent runner"

## SHIELD takeaway

The useful lesson is architectural, not that we should copy their current MCP support.

Their core Coordinator, Context Builder, LLM Adapter, Tool Registry, and Operation runtime do not depend on MCP.

That matches our direction:

> MCP should be an adapter into SHIELD's Tool Registry and execution architecture, not the foundation Agent Core is built around.

---

# 13. Benchmarkability

## Implemented now

The repo includes a Harbor evaluation adapter and Terminal-Bench instructions.

Recorded trajectories include observations grouped by tool call, sequence/timing, token totals, and async timing metadata.

## SHIELD takeaway

Benchmark support should be first-class.

The SHIELD Agent Benchmark should compare combinations of:

    model
    runtime
    context strategy
    tool strategy
    permission policy
    compaction policy

and emit comparable trajectories.

---

# 14. Concepts worth borrowing

High-value concepts:

1. Tool call vs operation separation
2. Durable versioned operations
3. Async-first execution with in-flight tool state
4. Append-only task/session event history
5. I/O-pure Context Builder
6. Context-change report: omitted / truncated / compacted
7. Native provider-independent message/tool/result items
8. Progressive SkillUse disclosure
9. Prompt-cache/session affinity awareness
10. Benchmark trajectories as a first-class concern

---

# 15. What not to copy directly

SHIELD has different product constraints.

Do not automatically copy:

- Go implementation
- Bash as the primary general-purpose computer tool
- current all-history resend behavior
- cloud-first Responses API assumptions
- absence of SHIELD permission modes
- current slim runner's lack of MCP
- their prompts or tool descriptions verbatim

Borrow boundaries and invariants, not product identity.

---

# 16. New SHIELD experiments suggested

## Experiment F — async tool scheduling

Compare sequential tool execution with parallel independent reads/commands.

Measure:

- wall-clock task time
- model turns
- token use
- duplicate work
- local-model behavior when multiple results arrive

## Experiment G — durable operation recovery

Start long-running work, terminate SHIELD, restart it, and test whether task state can safely resume or reconcile.

## Experiment H — Context Report

For every turn emit a debug record of included, omitted, truncated, and compacted context with reasons and token costs.

## Experiment I — event-log task state

Prototype a small append-only task event stream beside the existing conversation database and see whether it simplifies replay, audit, forks, and task recovery.

---

# 17. Bottom line

Unreal Agent is not a finished blueprint for SHIELD, and its current public runner is deliberately slim.

But several of its invariants independently reinforce our direction:

    model-independent core
    progressive disclosure
    native structured tools
    provider adapters
    observable context assembly
    durable task state
    benchmark-driven development

The genuinely new idea for us is the durable asynchronous Operation layer.

That may be the missing layer between "the model wants something done" and "the machine is actually doing it," especially once SHIELD supports long-running tasks, multiple MCP servers, cancellation, recovery, and local background work.
