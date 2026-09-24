# SHIELD — Session Handoff

**Last session:** 2026-09-22 → 2026-09-24  
**Branch:** `chore/dependency-refresh` (built on `feat/mcp-permission-modes`; neither is merged to `main`)  
**Tests:** 230 passing (`npx vitest run`) · `tsc`, ESLint and Prettier clean  
**Tested in the app with:** Qwen3-Coder-30B-A3B Q4_K_M on an RTX 4070 (12 GB), workspace `C:\Users\imend\Desktop\Projects\EXPERIMENT`

Read this first, then [SHIELD_AGENT_ARCHITECTURE.md](./SHIELD_AGENT_ARCHITECTURE.md) (§13 priorities, §17 decision log, §20 evidence) and [testing/AGENT_BENCHMARK.md](./testing/AGENT_BENCHMARK.md).

---

## Update — 2026-09-24 afternoon (`feat/model-library`, commits `d8ac243`…`0cad67b`)

**Tests:** 313 passing · `tsc` and ESLint clean · Prettier clean except `ui/button.tsx` and `types/prompts.ts` (untouched, pre-existing)
**Tested with:** Qwen3-Coder-30B on the SHIELD-managed llama-server, 32k context, max tokens 8192, workspace `C:\Users\imend\Desktop\Projects\Searcher` (a multi-file build).

Done, in commit order:

1. **llama-server runtime** — MoE experts in RAM, attention and KV cache on the GPU (earlier work, committed now).
2. **Agent loop fixes** — each one stopped a long turn or misled the model: HTML in JSON read as XML arguments; unescaped quotes and a stray `}` in arguments; made-up `edit_file` keys (`replace`/`with`); 5-round limit (now 20, with a notice and a note to the model when it drops a call); replies cut off mid-call by the token limit; Stop ending only the current reply; MCP `isError` shown as success; unhelpful "no exact match" edit errors. The prompt now shows each `edits` item's fields and says edit, don't rewrite.
3. **Crash recovery** — the window reloads when the renderer dies.
4. **Chat layout** — one block per reply, tool calls as quiet collapsible steps ("Wrote index.html", "Edited styles.css +4 −2"), consecutive calls grouped.
5. **Clearing old tool payloads** — above 60% of the window, older write/read payloads in the model's history become "[N characters, cleared to save space]". ~31.6k → ~7.9k tokens on the Searcher chat. **Not yet seen running live**: look for `[LlamaServer] Compacted history` in the log. llama-server only.

**Next:** context compaction proper (summarising, not just clearing) — see the research docs; then whether node-llama-cpp models need the same.

**Machine notes from this session:**

- `--load-mode none` commits ~22 GB for Qwen3-Coder. With the old 15 GB pagefile the Windows commit limit ran out and the renderer crashed. The pagefile is now 32–48 GB (commit limit ~64 GB). Check free commit before loading a model.
- **The machine bluescreens under heavy RAM load, with or without SHIELD running:** `0x1A` MEMORY_MANAGEMENT (`41790`/`41792`) and `0x50`, on Sep 14 and three times on Sep 24 (once with SHIELD closed). These are page-table corruption codes, which point to unstable RAM (2×16 GB DDR4-3600 XMP on a Ryzen 9 3900X) rather than to SHIELD or the commit limit. If a crash happens during a model run, check the bugcheck code before debugging SHIELD.
- After that bluescreen, Rollup's native `parseAstAsync` segfaulted until a Windows restart, which broke every Vitest run. If Vitest dies with exit 139 before running a test, restart Windows first.
- Python heredocs turn `\n` inside test strings into real line breaks; use the editor for escapes.
- For screenshots with computer-use, the dev window is `electron.exe`, not "SHIELD" (that is an installed build).

---

## Where things stand

The tool-calling path that users actually run (XML + parser) went from "works in demos" to "works on a real 30B local model", and SHIELD gained a workspace, a delete, and visibility into speed and context.

### Verified in the app

- Folder chip → pick a folder; file tools can use only that folder; persists across restarts
- "What's in this folder?" → one `list_directory` of the workspace (`.` resolves to it)
- Read a 34k-character file → read once, cut to fit the window, summarised in ~7 s of reading
- `delete_file` → red "Move to Recycle Bin" prompt even in Auto → file lands in the Recycle Bin
- Ask mode prompts; Auto runs reads and changes unprompted; deletes always ask
- Header shows the loaded model; per-reply `tok/s · tok · s`; context ring + breakdown panel

### Shipped this session (32 commits on top of `origin/feat/mcp-permission-modes`)

**Tool-call correctness (every one found by the benchmark or live testing)**

- Malformed arguments no longer run as `{}`: JSON repaired, missing `</arguments>` accepted, unreadable calls returned to the model as an error
- Quoted JSON with a `"name"` field (a config file, `package.json`) is no longer run as a phantom tool
- Call bodies with no `<tool_call>` tags are recognised; half-typed markup is hidden while streaming ("Preparing tool call…")
- Identical calls in a turn are answered from memory, including the same file under relative vs absolute paths; large repeats are not resent
- Tool prompt teaches one format, no `Thought/Observation` template (models filled it in with fake results)
- Tool results are wrapped as untrusted data (injection obeyed 3/3 → 0/2 on Qwen2.5)
- Tool results are cut to ~⅓ of the context window, with a note on how to read the rest
- Unknown tools get "no such tool; here is what exists" instead of "disabled in settings"

**Filesystem / MCP**

- Workspace folder picker (`mcp.workspaceFolder`), next to the permission chip
- Relative paths resolve against the workspace, not the Electron process directory
- Every path argument (`path`, `source`, `destination`, `paths[]`) is checked — `move_file`, `read_multiple_files` and `list_allowed_directories` could previously never run
- `delete_file` (SHIELD's own tool): Recycle Bin only, refuses the workspace root, always asks
- All 15 filesystem tools allowed by default, with migrations from the old 3-tool and 14-tool defaults
- One filesystem server at startup (was two, one orphaned)

**Permissions (decided with the user, 2026-09-24)**

| Mode      | Reads                       | Writes / edits / moves      | Deletes                      |
| --------- | --------------------------- | --------------------------- | ---------------------------- |
| Ask       | ask, or "Allow for session" | ask, or "Allow for session" | always ask, never remembered |
| Auto      | run                         | run                         | always ask                   |
| Plan      | run                         | recorded, not run           | recorded, not run            |
| Read-only | run                         | hidden                      | hidden                       |

Unrecognised tools still ask in Auto.

**Runtime / performance**

- Models load with `gpuLayers.fitContext`, so large models keep their requested context instead of silently shrinking it
- The model's chat history is restored only when the chat, model or Plan mode changes — it used to be replaced after every message, mid-reply
- Model auto-load records which model it picked (header showed "Select Model", family was "generic")
- Per-token and per-render logging removed

**UI**

- Per-reply `⚡ tok/s · tokens · seconds`
- Context ring (amber 80%, red 95%) → breakdown panel: system prompt, tool instructions, messages, tool results, formatting, free; loaded vs trained context; overflow reported; one tip for the biggest consumer
- "Reading the conversation · Ns" indicator before the first token

**Tooling / deps**

- `npm run bench:agent` — headless benchmark against a real filesystem MCP server (`scripts/bench/`)
- All dependencies updated within their semver ranges; node-llama-cpp 3.15 → 3.21, MCP SDK 1.30, filesystem server 2026.8.31

---

## Measured on this machine (Qwen3-Coder-30B, 8k context)

|                                                     | Time to first token                 |
| --------------------------------------------------- | ----------------------------------- |
| First message after model load (~1.8k-token prompt) | ~21 s                               |
| New chat afterwards                                 | ~0.6 s (system prompt state reused) |
| Follow-up in the same chat                          | 0.6–1.2 s                           |
| After a large file read (2.8k tokens)               | 7.2 s                               |
| Generation                                          | 9–14 tok/s                          |

Benchmark (XML path, latest code): Qwen3-Coder 100% on 6 tasks; Qwen2.5-7B 67%. Native tool calling is worse than XML for Qwen3-Coder on node-llama-cpp (see benchmark findings 9 and 14).

---

## Next line of work — recommended order

> **Update 2026-09-24:** the model library revamp now comes first. See [MODEL_LIBRARY_PLAN.md](./MODEL_LIBRARY_PLAN.md). Item 1 below becomes its Phase 2, and item 5 its Phases 3–4 (Bonsai 2 through the Prism runtime).

1. **Larger context for Qwen3-Coder (highest value).** It is loaded at 8k because that is what the catalog says; one file read used 65% of it. Make context size a setting with a VRAM-based suggestion (the `fitContext` fix makes 16k–32k plausible on 12 GB). The panel already shows "model supports 262k".
2. **Overwrite warning for `write_file`.** In Auto it now replaces existing files unprompted — that is how `README.md` was overwritten. At minimum: note "replaces existing file" in the tool result/UI; better: keep a backup (e.g. previous version to the Recycle Bin) before overwriting.
3. **Re-run the benchmark** on the latest code, and add Qwen3.8-27B (native tools work for it on node-llama-cpp 3.21) plus a small model (Qwen2.5-3B in `D:\AIMODELS`).
4. **Untrusted-read policy.** The envelope is a mitigation; the architecture's policy half (e.g. ask before a change that follows reading untrusted content) is still open.
5. **Provider layer / `llama-server`** for Qwen3-Coder native tools — only if item 3 shows XML falling short.
6. Housekeeping: open a PR for these branches; consider merging `feat/mcp-permission-modes` + this branch into `main`.

Known, smaller:

- In an existing chat, the model can repeat stale tool errors from earlier turns (it said `delete_file` was "disabled" after the message changed). New chats are clean.
- The ~21 s first message after load is one-time per model load.
- Major-version upgrades were deliberately skipped (Electron 44, Vite 8, Vitest 5, ESLint 10, TypeScript 7, Zustand 5 …) — see the dependency commit message.

---

## Working on SHIELD: things that cost time this session

- **Don't edit `electron/` while `npm run dev:electron` is running.** vite-plugin-electron rebuilds main, its Windows `taskkill` fails, and the dev server dies. Stop the app, edit, relaunch. Renderer (`src/`) edits hot-reload fine — except adding or removing hooks in a mounted component, which throws a React `getSnapshot` error until a full reload.
- **`ELECTRON_ENABLE_LOGGING=1 npm run dev:electron > app.log 2>&1`** captures main _and_ renderer console output in one file.
- **Main-process code isn't covered by `npx tsc -p tsconfig.json`** (it includes only `src/`). The Vite build catches errors; for a quick check run tsc on `electron/main.ts` with explicit flags.
- **npm 10.9 crashes** (`reading 'edgesOut'`) resolving the vitest ↔ @vitest/ui peer set. Use `npx npm@11 install`.
- **Shell heredocs eat backslashes**: Windows paths in test strings (`C:\p\t…` → tab) broke tests three times. Use forward slashes or `String.raw` in files, and the editor rather than shell for anything with regex escapes.
- The machine's GPU is shared with other projects (e.g. Android emulators): check before loading a model or running the benchmark.
