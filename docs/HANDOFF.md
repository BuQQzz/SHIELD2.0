# SHIELD — Session Handoff

**Last session:** 2026-09-26 → 27 (previous: 2026-09-22 → 2026-09-25)  
**Branch:** `feat/model-library`, 68 commits ahead of `main`; it contains `chore/dependency-refresh` and `feat/mcp-permission-modes`. Nothing is merged to `main`. All work is committed (not pushed; the user pushes).  
**Tests:** 589 passing (`npx vitest run`) · `npm run build`, ESLint and Prettier clean on changed source files

**Tested in the app with:** Qwen3-Coder-30B-A3B Q4_K_M on an RTX 4070 (12 GB), SHIELD-managed llama-server at 32K (and 8K to force summaries); Gemma 4 12B at 32K (2026-09-26)

**Gemma 4:** native tools work in the app. Its thinking budget and sampling broke multi-step tool tasks; fixed and tried in the app, see the 2026-09-26 evening update. The user plans to keep Gemma to chat and simple tasks and Qwen3-Coder for coding.

Read this first, then [SHIELD_AGENT_ARCHITECTURE.md](./SHIELD_AGENT_ARCHITECTURE.md) (§13 priorities, §17 decision log, §20 evidence) and [testing/AGENT_BENCHMARK.md](./testing/AGENT_BENCHMARK.md).

---

## Next session — start here (todos from 2026-09-25, updated 2026-09-27)

Order agreed with the user on 2026-09-26: the Code view, then the terminal, then the recall tool. Background is in the updates below.

- [x] **Code view, separate from Chat.** Built and used in the app 2026-09-27, with fixes from that test (see "Code view" below). Not committed yet.
- [ ] **Terminal tool in Code** (`run_command`): PowerShell in the session's project folder, timeout, output capped (head and tail), exit code returned, output treated as untrusted like other results, Stop kills the process tree; no interactive or background processes at first. Permissions decided with the user: in Auto a short list of read-only commands runs unprompted (git status/diff/log, listing, reading and searching files), every other command asks and shows the exact command, as deletes do; Ask asks for everything, Plan records, Read-only runs only that list. Why: models cannot test what they write — Qwen's `lint-scripts.ps1` (evening update) crashed on the one path that mattered — and a filtered command (`Select-String -Context`, `git diff`, a test run) can replace reading whole files.
- [ ] **Recall tool** (after the terminal). Let the model read back the original messages a summary replaced, from the saved chat. Summaries become an index instead of a loss, and the re-reading loops stop (at 8K, "review the whole repo" re-read cleared files until the 20-round limit). A SHIELD-owned tool like `delete_file` and `web_search` (`electron/services/webTools.ts` shows how one is registered); the design docs' "compaction does not delete history". Proposed shape in the 2026-09-26 update.
- [ ] Later: keep Gemma out of coding sessions (e.g. suggest Qwen3-Coder when a chat turns to file edits); give the context planner real headroom for the desktop; fork a chat from a summary; edit or pin summaries; whether node-llama-cpp models need clearing and summarising too (today they fall back on node-llama-cpp's own context shift, which drops the oldest turns).
- [x] **Commit the working tree.** Done 2026-09-27 as three commits, each tested on its own: `6069e14` Gemma native tools and saved summaries (the 2026-09-25 work; 558 tests), `c36cf10` clearing to 40%, folder note, work-group header (567), then the evening fixes (589).
- [x] **Try the 2026-09-26 evening fixes in the app.** See the evening update.

- [x] **Finish Gemma desktop verification.** Done 2026-09-26 in an isolated profile: load Gemma, approve a read, deny a write, reload, reopen the saved chat, fresh follow-up. See the update below.
- [x] **Keep summaries on reload.** The reply saves the capsule, the exact model history it kept, and the cumulative count of model messages it replaced. A reopened chat uses its full history if it fits; when it needs room, it resumes from the saved capsule without writing the same note again. The full visible chat stays in local storage. Verified with fake llama-server requests and a JSON round trip; a live model reload has not been tried for this change. See the evening update below.
- [x] **Clear less often at 32K.** Done 2026-09-26: once clearing starts it goes on, oldest exchange first, until the history is under 40%. Seen in the app with Qwen3-Coder (evening update).
- [x] **Stop workspace detours.** Done 2026-09-26: the `[Current folder: …]` note goes only with requests about files. `npm run bench:agent` never covered this case — its prompts give full paths and it does not add the note — so "what's in this folder?" has to be checked in the app.

---

## Update — 2026-09-27: Code view, separate from Chat (working tree)

The sidebar's **Code** entry is live. Chat stays plain conversation for the user's other plans; Code is where the agent work lives. Decided with the user: switching views never loads a model (Code shows a hint instead), and existing conversations stay in Chat.

- **Sessions.** A conversation has a `kind` (`"chat" | "code"`; none means chat) and a code session its `folder` (`types/conversation.ts`, `electron.d.ts`, saved as-is; the list metadata carries both, `ConversationStorageService`). `lib/sessions.ts`: `viewKind`, `kindOf`, `ofKind`, `folderName`, `isCodingModel`. Each view lists only its kind ("Chats" / "Sessions"); opening Chat or Code goes to that kind's latest conversation or starts one (`App.tsx` effect). "New session" asks for a folder first (`handleNewSession`); a session opened without one shows "Choose a project folder".
- **Tool scope follows the open conversation**, not the view (a look at the library mid-session changes nothing): `resolveToolPolicy({ fileTools })` — a chat offers only the web tools, and calls a file tool as not permitted; the system prompt gets no allowed paths and, without web search, no tool section; the `[Current folder]` note and the "use your file tools" first attempt and refusal retry happen only in code sessions (`messageHandler.ts`).
- **The folder.** Opening a code session applies its folder (`useApplyWorkspace`: restart the filesystem server, then save `mcp.workspaceFolder`), so the global setting now follows the open session. Sending (and the empty-state prompts) waits until the folder is in effect — in the second the server restarts, a message could have run tools in the previous session's folder. The input's folder chip (`WorkspaceSelector`) shows the session's folder and can move the session to another; Chat has no chip.
- **Model hint** (`CodeModelHint`): a chat model in a code session gets "… is made for chat; Qwen3 Coder 30B is better at code" with a Load button (catalog roles `coding`/`agent`).
- Templates are chat personas: the template button shows in Chat only.

**Verification:** 599 tests across 48 files (new: tool scope, folder note never in a chat, session helpers, model hint); `npm run build`, ESLint and Prettier clean. Used by the user the same evening: a Code session on a test project (`Continue\wifi`, PowerShell scripts) with Qwen3-Coder, "look for bugs", then "apply these fixes".

Also in the working tree, from that test:

- **Colours** (`ChatMessage.tsx`): the model's answer in the foreground colour, the user's own messages muted; thinking and tool work were already muted.
- **Rule 7, "make the change"** (`systemPrompts.ts`, both the XML and the native prompt): asked for the quickest fixes, Qwen answered with 2,700 characters of code blocks to paste and changed nothing. With the rule it edited the files.
- **A repeated failed call is reported as failed** (`repeatNote` in `mcpMessageHandler.ts`). Qwen's second `edit_file` found no exact match; it sent the identical call again, was told "use the result you already have", and told the user both fixes were applied. The next turn it wrote that false fix into the project's `FIXES.md`. Now a repeat of a failed call quotes the error and says to change the call or tell the user the change was not made; a declined call says not to try again; a Plan/Read-only refusal repeats the refusal. Successful repeats are unchanged. Not yet seen live (no repeat came up after it went in). 602 tests.
- **Why that edit failed:** Qwen wrote the file's `"` as `&quot;` in `oldText` (it treats `<arguments>` as XML), so the text could not match; its first edit, written with `\"`, worked. Not fixed. A safe fix: when `edit_file` finds no match and `oldText` holds XML entities, retry once with them decoded (never decode up front, since HTML files really contain `&quot;`).
- `npm run lint` also lints the git-ignored `tmp/` folder, where old debugging scripts fail `no-explicit-any`; the source itself is clean (`--ignore-pattern "tmp/**"`).

---

## Update — 2026-09-26 evening: Gemma on a real task — thinking budget, per-model sampling, loop guards (`7526bad`)

**What the user saw** (Gemma 4 12B, their wifi test project, Auto mode). Task 1: "Read all the .ps1 files and STATE.md, then write SCRIPTS.md with a table…". The reply ran to the 8,192-token limit: thoughts in the chat, file names mangled ("dialect.ps1", "Dg3"), the same lines looping. With Gemma's own sampling it wrote emoji, then a stray `<channel|>`. Earlier that day: at 128K Gemma decoded 18.8 tok/s, at 32K 43. The context planner filled the card on paper (9.9 of 11.0 GiB usable) and Windows moved part of it to shared memory; the user set 32K in the Library.

**Causes, reproduced headless** with `tmp/gemma-think-repro.ts` (Task 1 through the app's runtime and tool loop, on a copy of the folder, 32K; logs and `result.json` per run in `tmp/gemma-think/`):

| Thought budget                                           | Temperature | Result                                                                                  |
| -------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| 512 per turn (as shipped)                                | 1.0         | a raw `<\|channel>`, then garbage to 8,192 tokens                                       |
| none                                                     | 1.0         | hidden thought for all 8,192 tokens, no answer                                          |
| off (empty thought prefilled, as Google's template does) | 1.0         | one mistyped `list_directory`, 20 times                                                 |
| 2,048 per reply                                          | 1.0         | clean · 15 rounds with 3 mistyped paths · malformed call after a thought hit the budget |
| 2,048 per reply                                          | 0.5         | clean · clean (4 rounds, ~110 s each)                                                   |

- **Thinking budget.** It counted every tool round of a turn (`includeCurrentResponse: true`), so 512 was spent by round 3. node-llama-cpp then stops watching for the thought channel's start, and a thought cut short leaves Gemma mid-thought outside the channel: the thinking streams into the chat and derails. Now `gemmaThoughtBudget` (`LlamaService.ts`): per reply, half of max tokens, at most 2,048.
- **Sampling.** SHIELD sent one global setting to every model; the user's was temperature 0.21 with repeat penalty 1.1, and the penalty mangles names a table must repeat. GGUFs carry their makers' sampling (`general.sampling.*`): Gemma 4 temperature 1 / top-k 64 / top-p 0.95 and no repeat penalty; Qwen3.8 1 / 20 / 0.95. Qwen3-Coder's file has none; the catalog holds Qwen's model card values, 0.7 / 0.8 / 20 / 1.05.
- **Temperature for tools.** At 1.0 Gemma mistyped a path in four of six runs ("tpc" for "tmp", "SHEILD", "WiFi"). Decided with the user: the model's values, but temperature at most 0.5 while tools are available.

**Shipped in the working tree:**

- **Per-model sampling** (`modelSampling.ts`, `ModelRuntime.getRecommendedSampling`, IPC `llama:getRecommendedSampling`, `useRecommendedSampling`, `App.tsx`): the model's file, else the catalog. A model that names its sampling but no repeat penalty gets none; `TOOL_TEMPERATURE_CAP` (0.5) with tools on. Settings › Model has "Use the model's recommended sampling" (on by default, `model.useModelSampling`): it says what the model recommends and locks the sliders to it. A template's sampling applies only with it off.
- **Loop guard** (`utils/loopGuard.ts`, in `useLlama.sendStreamingMessage`): a reply whose recent lines mostly repeat, or that ends in one block five times, is stopped like the Stop button, with a note. On the day's failures it caught the garbage within 400 characters and the 24k-character reasoning loop at 22.4k (late: that loop varied a little each pass). No false alarm on the last 40 saved chats.
- **Repeat-call stop** (`mcpMessageHandler.ts`): the third answer from memory to the same call ends the turn with a note. The thinking-off run spent 17 rounds on one.
- **Path capitals** (`resolveToolPaths`): on Windows a path inside the workspace spelled with other capitals takes the workspace's own. SHIELD's check and the filesystem server compare exact text and refused "…\WiFi\…" for "wifi".
- **Work-group header** (`WorkGroup.tsx`): with Gemma the live header was blank. Each progress update (every 150 ms) re-keyed the label, which waited for the old one to fade. Now keyed per kind of work, counts animate in place, no fade-out wait, and a tool's label stays at least 0.6 s. Hot-updated into the running app, where the user's next prompts ran with it; not specifically confirmed.

**Found on the way, not done:**

- The context planner counts total VRAM minus node-llama-cpp's 0.96 GiB padding. Leave room for the desktop instead (say 20% of VRAM) in `contextPlanner.ts`; measuring Gemma at 64K would place the threshold.
- `eslint.config.js` spreads `reactHooks.configs.recommended.rules`, which is `undefined` in eslint-plugin-react-hooks 6.1: the hooks rules have never run.
- Settings › Model "Speculative Decoding" reaches no load call (node-llama-cpp models use the per-model default; llama-server always uses ngram-mod).
- `[LlamaService] Loading <id> from <path>` is also logged by path lookups (the Library's context plans), not only by loads; `[App] Model switched successfully` is logged even when the RAM check held the load back.
- Editing any tracked file while the dev app runs reloads its window (Tailwind's plugin scans every file): a docs edit lost the user's first prompt mid-reply.
- Speed: SHIELD's llama-server profile already matches a tweeted 50 tok/s setup (fit, flash attention, batch 2048); the gap on this machine is the RAM at 2133 MT/s. Unmeasured ideas: q8_0 KV again now that RAM is slower, what `--fit` places, a smaller Qwen3-Coder quant, and `empero-ai/Qwen3.8-35B-A3B-Distill` (a thinking model, `qwen35moe`, which the installed llama-server build supports).

**Verification:** 589 tests across 46 files; `npm run build`, ESLint and Prettier clean. The sampling lookup was checked against the installed files (Gemma and Qwen3.8 from the file, Qwen3-Coder from the catalog, Bonsai none).

**Tried in the app** (2026-09-26 night, the user testing). Gemma 4 at 32K ran Task 1 with the new defaults (sent: temperature 0.5, top-k 64, top-p 0.95, no repeat penalty): 5 rounds, ~2¼ minutes, 43 tok/s, ending on its own. Its SCRIPTS.md named all 13 scripts but misspelled two ("diag2_crnlf", "Diag3"), contradicted its own keep/delete list and dropped "pal" from wlansvcpal.dll — model quality, not mechanics. Qwen3-Coder at 32K (the RAM check held it back with ~11 GB free until the user chose Load anyway) ran Task 1, a lint-script task and four follow-up fix requests with no loop or repeat stop and no errors. Clearing fired four times in ~10 minutes (25k, 37k and 23k characters, then 19k + 1.2k in one two-step clearing), each a 5–8 s re-read, never a summary; decode 18–24 tok/s, edits 34–52 tok/s with n-gram drafts. Qwen's `lint-scripts.ps1` printed every script's syntax tree, printed ErrorId instead of line numbers, and crashed on the first file with a parse error by assigning to `$error`, which is read-only.

---

## Update — 2026-09-26: Gemma desktop check, clearing further, folder note only for files (`c36cf10`)

**Gemma desktop check passes** (`tmp/gemma-ui-check.mjs`, isolated profile `tmp/gemma-ui/profile`, Gemma 4 12B Q4_K_M at 8K, Ask mode). Approved read → "The meeting is scheduled for 4:15 PM."; denied write → nothing ran, no file, "I was unable to create `report.txt`…"; Ctrl+R → the model was adopted; the saved chat reopened from the sidebar; the follow-up "Answer without tools" → "The Orchid meeting was scheduled for 4:15 PM." in the same saved chat, no tool call. Passed twice, once on a fresh profile; ~43 s per run, 43 tok/s. The chat shows a native call as a "Read notes.txt" step with no raw JSON; the saved reply keeps it as a `json {"tool_calls": …}` block. Every verdict comes from the saved conversation JSON, not page text. The harness now opens the collapsed sidebar and fails if a sent message does not appear.

**Not explained: one lost first message.** On the first-ever run (cold start, 33 s to the Load button) the first message, typed the moment the model finished loading, never appeared: the input cleared, no user message, no reply, no error in the main log. The renderer console was not captured that time. Three later runs, one on a fresh profile, did not repeat it. A fresh profile saves its settings and runs `mcp:initialize` a second time around the first load (theme `system` → `dark`); on the cold run that landed just after the load, when the message was sent. Watch for a first message that vanishes right after a load.

**Clearing goes on to 40%** (`LlamaServerProvider.makeRoomCheaply`, `historyCompaction.ts` `COMPACT_AT` / `CLEAR_TO`). Still triggered at 60%, but once it starts it clears one exchange at a time, oldest first, until the estimate is under 40%, never the latest exchange. Summarising still runs only if the history is over 60% after clearing. Worked through on paper (not measured) for 2026-09-25's five-file read at 32K: the fifth read would clear the first three files at once instead of one per read, with a re-read of ~7.5k tokens instead of ~15.6k, and the next clearing two or three reads later.

**Folder note only for file requests** (`refersToFiles` in `messageHandler.ts`): words like folder, file, path, project, repo, "in here", a file name (`main.ts`, `notes.txt`), or a path (`C:\…`, `./src`); or `isLikelyMCPToolIntent`. "explain MCP", "What's the newest Node.js release?" and "Write a haiku" go without it.

**Recall tool, proposed shape** (not started): a renderer-owned `recall` tool, advertised with the others, that searches the chat's saved messages (requests, replies without tool markup, tool results) and returns excerpts labelled with message numbers, or one whole earlier message by number; read-only, so it runs in every mode without asking. It can be tried with Gemma at 8K, which is light: node-llama-cpp's context shift drops old turns there too.

**Verification:** 562 tests pass; ESLint and Prettier are clean on the changed files.

---

## Update — 2026-09-25 late evening: Gemma 4 native tools (`6069e14`)

Gemma 4 now receives native tool declarations, emits its own native argument syntax, and receives the real tool result in its native result slot. `Gemma4ToolChatWrapper`, `gemmaToolProtocol`, and `NativeChatSession` adapt the installed node-llama-cpp version without changing Qwen's XML flow. The bridge returns a structured call to the renderer; the existing permission callback still decides whether it runs. Tool results are matched by call ID. Stopped, incomplete, unknown, or stale calls cannot silently resume execution. Native syntax stays out of visible streaming, tool declarations follow Plan/Read-only filtering, and title generation preserves chat history.

Gemma defaults to input lookup off: the read smoke fell from 26.8 s with lookup to 6.7 s, with observed decode around 46 tok/s. Explicit runtime overrides remain possible. The eight real filesystem cases all passed: read, list/read, write, edit, search, denied write, injected file instructions, and no-tool arithmetic. Two wrong paths were rejected and corrected by the model. These are small fixtures, not evidence of broad coding reliability. Reproduce with `npx tsx scripts/bench/gemma-smoke.ts --models-dir D:/AIMODELS`; full local traces are in `tmp/gemma-native-final.log` and `tmp/gemma-smoke-vKafoF/results.json`.

**Verification:** 558 tests across 43 files pass; the production build, changed-source ESLint, and Prettier pass. E4B is not installed and was not downloaded. Vision and large-context Gemma are unverified. Existing saved-capsule changes below remain separate uncommitted work.

**Paused for tomorrow:** the installed-model smoke is complete, but the Electron UI permission/reload check has not run. The user requested the pause before it launched. Independent source review found no blocking issues. Test/build/source-check logs are `tmp/gemma-final-tests.log`, `tmp/gemma-final-build.log`, `tmp/gemma-final-lint.log`, and `tmp/gemma-final-format.log`; the full final model run exited successfully and released GPU memory. Do not repeat those checks unless follow-up code changes warrant it.

---

## Update — 2026-09-25 evening: saved Task Capsules (`6069e14`)

The first item above is implemented but not yet committed. `SavedCapsule` is stored on the assistant reply that needed a summary and passes through IPC, the generation store, and conversation JSON. It includes the capsule, the exact kept model history (including any shortened reply), and a cumulative `replacedEntries` count. On restore, `LlamaServerProvider` keeps the full chat when it fits; otherwise it first clears old tool payloads, then uses the saved capsule with the live tail of the chat. New turns added after reopening are retained. A same-turn MCP retry keeps a capsule written by its first attempt when the retry writes no new one.

**Verification:** 467 tests pass; `npm run build` passes for the renderer, main process and preload; ESLint and Prettier pass on changed source. Tests cover JSON serialization with the complete visible text, reopening without a second note, a larger context using the full chat, shortened replies, model-only retry turns, multiple summaries, and turns added after reload. The app was not reloaded with a live model for this change; the next live check should use an already loaded model rather than starting a heavy model solely for this test.

---

## Update — 2026-09-25 afternoon: summarising, live progress, work groups (`176064c`…`871a05a`)

**Making room in the model's history** (llama-server only). Before a request that would pass 60% of the window, in the cheapest step that is enough:

1. clear old tool payloads, keeping the last 6 entries (`historyCompaction.ts`, since 2026-09-24);
2. clear them from all but the latest exchange — added after, at 8K, every tool round summarised with a 4–7 s note (`7b36096`);
3. summarise (`taskCapsule.ts`, `176064c`): the oldest turns become a capsule in the system message — the user's requests and the tool calls listed exactly by SHIELD, plus a three-line note from the model (State / Decisions / Next). The latest exchange always stays; a long answer is cut to its start and end. A slice of plain tool rounds gets no new note.

Only the model's copy changes. The reply that needed a summary shows it as a quiet step; a pill at the top right of the chat header counts a chat's summaries, lists them (the note's State line) and jumps to one. Notes are asked for with a fixed three-line form and told what comes next — asked mid-task the model once carried on with its answer inside the note, and once wrote "my web search didn't return clear results" before the results were sent.

**Live progress** (`176064c`). llama-server's `return_progress` and `timings_per_token`: "Reading the conversation · 2.0k / 5.2k tokens" with a bar, "Summarising earlier turns", "Thinking · ↓ N tokens" (thinking was invisible on llama-server before), "↓ 523 tokens · 24.1 tok/s" under a streaming reply. The context ring follows a reply live: amber from 60% (where making room starts), red from 85%. Page updates are throttled to one per 150 ms — one per token made the page fall 28 s behind a 1,770-token reply; now 0.0–0.1 s behind at 3,552 tokens.

**Chat view** (`da6cd93`, `871a05a`; the user liked the work groups: "not cluttered with calls and thinking"):

- **Work groups** (`WorkGroup.tsx`, `turns.ts`): tool steps, summaries and the short lines between calls ("I'll continue examining the remaining files.") fold into one collapsible. Live, its header says what is happening ("Reading MISTAKES.md…"); done, what it did ("Listed wifi, read 6 files · summarised 3 times"). Replies without a tool call, and text over 400 characters, stay in view.
- **Auto-scroll that lets go** (`MessageList.tsx`): follows the bottom while there; scrolling up releases it at once; back at the bottom, sending a message or opening a chat takes hold again. It used to snap down after every tool round.
- **Restored chats**: consecutive same-role messages are joined in `setChatHistory` — the 20-round limit notice after the model's last reply gave "Cannot have 2 or more assistant messages at the end of the list".

**Open:** the todo list at the top. Measured on the way: at 8K the 16-file repo question re-read cleared files and hit the 20-round limit; at 32K the same question took 7 rounds, and clearing (24.6k, 5k and 35k characters) needed no summary.

Also seen: the model's edits to the user's wifi project (`C:\Users\imend\Desktop\Continue\wifi\set-radio.ps1`) renamed P/Invoke parameters, which changes no behaviour; the user was told.

**Working on it:** editing main-process code (anything under `src/services/` the main bundle imports, e.g. `LlamaServerProvider.ts`, `taskCapsule.ts`) while the dev app runs makes vite-plugin-electron rebuild and restart Electron; on 2026-09-25 that came back cleanly but unloaded the model. A half-finished renderer edit also hot-reloads — change a type and its consumers in one go.

---

## Update — 2026-09-25 (`67b29ab`, `996509b`)

- **Reload keeps the model** (`67b29ab`). After Ctrl+R or the crash-recovery reload, the page asks the main process what is loaded and adopts it, instead of showing "No model loaded". It also stops a reply the old page was still streaming, and no longer saves `lastModelId` before settings are read (that would have written the defaults over them). Tried in the app: load, Ctrl+R, prompt family still `qwen`, next message ran a tool round. Stopping a mid-stream reply on reload is unit-tested only. In dev the adopt line logs twice: React StrictMode runs mount effects twice.
- **`--load-mode none` stays** (`996509b`, [RUNTIME_SPEED_RESEARCH.md](./RUNTIME_SPEED_RESEARCH.md) Finding 6). mmap loads 7 s faster and commits half (10.9 vs 21.5 GiB), but reads prompts 30–54% slower, decodes up to 38% slower, and kept the whole file resident (17.7 vs 11.9 GiB of RAM in use). The script is not in the repo; the run was two llama-server starts with `launch.ts`'s arguments plus `scripts/bench/server-speed.ts` twice each.
- **Payload clearing seen live.** Workspace = this repo; five source files read one per round (22k, 15k, 9k, 12k, 11k characters). Clearing fired on the fifth (`Compacted history: cleared 21987 characters`), and the next request re-read 11.7k tokens: 9.7 s to the first token, the one slow read by design. Asked about the cleared file afterwards, the model re-read it and answered correctly. Sending that re-read back cleared again (23,249 characters, another 9.5 s). So with large reads the window sits near the 60% trigger and each clearing costs ~10 s. Worth weighing in the compaction design below.
- Speeds are ~30% below earlier tables because the RAM runs at 2133 MT/s: Qwen3-Coder decodes ~21 tok/s in the app, 25.8 in the probe.

**Next: context compaction proper** (item 6 below, second half). The research docs call it a Task Capsule (objective, state, completed work, files touched, decisions, open questions, next steps) that replaces the oldest turns in the model's view only ([SHIELD_OPTIMIZATION_TOOLING_CONTEXT_DESIGN.md](./SHIELD_OPTIMIZATION_TOOLING_CONTEXT_DESIGN.md) §9, [SHIELD_AGENT_ARCHITECTURE.md](./SHIELD_AGENT_ARCHITECTURE.md) "hardware-aware auto-compaction"). Today nothing happens when clearing is not enough: the history keeps growing until llama-server refuses a prompt larger than the window.

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

### Update — 2026-09-24 evening (`92b4aea`…`16515e2`)

Items 1–4 below are done and **tried in the running app** (2026-09-24, Qwen3-Coder on llama-server): with 10 GB held by a helper process, startup held the load back once and showed the dialog, Cancel loaded nothing, no retry loop; with the memory released the Library load passed; a 32K → 16K reload passed with only 9.8 GB free (loaded model counted as free). Measured vs estimate — 32K: 11.6 GiB RAM / 21.8 GiB commit (est. 12.0 / 22.3 after recalibrating, `12336a3`); 16K: 10.0 / 20.3 (est. 10.4 / 20.8).

**Also (`3b11cdd`): SHIELD starts without a model.** Startup selects the last model loaded (`model.lastModelId`) and the empty chat offers "Load …"; Settings › Model › "Load last model at startup" (off by default) restores the old behaviour.

- **1 · RAM check** — every load (auto-load, picker, Library) estimates RAM and commit from the context plan and compares with free memory; the loaded model counts as free. Short → nothing unloads, a dialog gives the numbers with Load anyway / Cancel. Estimates for Qwen3-Coder on llama-server at 32K: ~12 GB RAM, ~21 GiB commit (measured: ~12 / ~22 GB). Startup auto-load now runs once (a failed load used to retry in a loop).
- **2 · Library label** — "Runs partly from system RAM · ~12 GB" on installed models above 1 GB; heads-up opens once per model (`model.ramNoticeSeen`); offers a smaller context if it saves ≥ 2 GB. The context picker shows RAM per size for llama-server models.
- **3 · `cleanup()`** — context and model disposal in separate `try`s, with a test.
- **4 · Orphaned llama-server: not a bug.** Tested: hard-killing Electron's main (`Stop-Process -Force`) killed its attached child too — libuv puts attached children in a kill-on-close job object. The handoff's claim was an assumption. The spawn call now says why it must never be `detached`. (A PowerShell watchdog was built and dropped: detached PowerShell 5.1 gets no console and exits before running.)

Still to do from the list: 5 (mmap vs none) and 6. **2026-09-25:** 5 done (keep `none`), 6 seen live; compaction proper is next.

### Update — 2026-09-24 night: web search as tools (`78f66a2`…`2c766ee`)

- **`web_search` / `fetch_page`** are model tools on a `web` server (`electron/services/webTools.ts`), on when Settings › Web Search is on. The globe toggle and the pre-search code are gone. Auto/Plan/Read-only run them unprompted; Ask shows the query or URL.
- **In-app browser** (`electron/services/web-search/InAppBrowser.ts`): hidden `BrowserWindow`, in-memory `shield-web` session, storage cleared per page, no permissions/downloads/popups, trackers dropped, DNT + GPC. Replaces Playwright (its Chromium build broke after the dependency refresh; `playwright-core` removed from dependencies — `playwright` stays as a dev tool for `scripts/`).
- **URL safety** (`urlSafety.ts`): public http(s) only, checked before DNS, after DNS, and for every request a page makes.
- **Fixed on the way:** the chat kept streamed text over the returned reply, so a fast cached reply lost its tail and tool call (`3951eb1`); new prompt rule 5 "ANSWER, THEN STOP" stopped a stray `list_allowed_directories` after a finished answer (`2c766ee`).
- Tested with Qwen3-Coder: "newest Node.js release?" → search → nodejs.org → v26.10.0 Current / v24.21.0 LTS.

**Open:**

- `C:\Users\imend\Desktop\Projects\GAME\check_node_version.js` was written by the model during the failed first web test (3 lines printing `process.version`). The user has not decided whether to remove it.
- ~~After a window reload (Ctrl+R) the renderer shows "No model loaded" while llama-server still runs the model.~~ Fixed 2026-09-25 (`67b29ab`).
- `fetch_page` of a PDF or a JavaScript-only app returns little text; not handled specially.

### 2026-09-24's list (done by 2026-09-25 except where noted — the current list is at the top)

Decided with the user at the end of the session (2026-09-24). In order:

1. **RAM check before loading a model.** Models that don't fit in VRAM spill into system RAM (Qwen3-Coder: experts in RAM, ~12 GB resident, ~22 GB committed with `--load-mode none`). Before loading, estimate the model's system-RAM need from the context plan (`contextPlanner`, `placement: "experts" | "layers"`) and compare it with free RAM and free commit. Too little headroom → a message with the numbers ("Needs ~12 GB of RAM, 9 GB free") and Continue / Cancel. This is what crashed the renderer on 2026-09-24.
2. **Library label** on spill-over models: "Runs partly from system RAM · ~12 GB". Its explanation says this is heavy, sustained memory load — normally fine, but if a PC's memory is unstable (e.g. overclocked RAM), long runs of this model are where it shows. Word it as a heads-up, **not** "this model causes instability": the model exposes a weak memory setup, it doesn't create one. Shown once per model. Where a lighter option exists (smaller context or quant), offer it in the same place.
3. **`LlamaService.cleanup()` fix:** context and model disposal share one `try`, so a throw while disposing the context skips model disposal. In-process (node-llama-cpp) engine only; small.
4. **Kill llama-server when SHIELD dies hard.** A normal close stops it (verified 2026-09-24: server gone, PID file removed, ~13 GB freed). A hard crash or Task Manager kill of Electron does not run the cleanup, and on Windows the child survives — holding up to ~22 GB — until the next SHIELD start removes it via the PID file. Plan: start a hidden `Wait-Process -Id <SHIELD pid>; Stop-Process -Id <server pid>` watcher next to the server.
5. **Done 2026-09-25: keep `none`.** **Measure `--load-mode mmap` vs `none`** for Qwen3-Coder (tok/s, prompt speed, RAM and commit). mmap weights are file-backed: Windows can drop them under pressure and they don't count against the commit limit. Decide default vs option. Note the RAM now runs at 2133 MT/s, so tok/s will be lower than the ~36 measured at 3600 either way.
6. **Watch the payload clearing run live** (item 5 above; seen 2026-09-25), then **context compaction proper** (summarising, not just clearing) from the research docs; then whether node-llama-cpp models need the same.

**Machine notes from this session:**

- `--load-mode none` commits ~22 GB for Qwen3-Coder. With the old 15 GB pagefile the Windows commit limit ran out and the renderer crashed. The pagefile is now 32–48 GB (commit limit ~64 GB). Check free commit before loading a model.
- **Bluescreens under heavy RAM load — hardware, not SHIELD code.** Five minidumps (Sep 14, Sep 24 ×4): four `0x1A` MEMORY_MANAGEMENT (`41790` page-table page corrupted / `41792` corrupted PTE), one `0x50` in `WdFilter.sys`. Two are classified `MEMORY_CORRUPTION_ONE_BIT`. The processes named (`msedgewebview2`, `java`, `bash`, `codex`, `claude`) are whatever was running when the corruption surfaced; one crash happened with SHIELD closed. Timeline of RAM settings: DOCP 3600 / FCLK 1800 → crashes; DOCP-derived 3200 / FCLK 1600 → crashed again (4:31 PM, `claude.exe`); **now BIOS Auto, 2133 MT/s** — stable so far, a long heavy SHIELD run not yet confirmed. Hardware: Ryzen 9 3900X (AMD rates it for 3200 MT/s), ROG Crosshair VIII Hero BIOS 5302, 2×16 GB G.Skill F4-3600C16 (replaced earlier as "faulty"; crashes began with local LLM work). Leading explanation: the memory configuration or path is unstable under sustained load; a large RAM-resident model is a trigger, not the root cause. The user's full write-up: `C:\Users\imend\Documents\Codex\2026-09-24\referenced-chatgpt-conversation-this-is-an\RAM-BSOD-investigation-2026-09-24.md` (DISM still reports 156 repairable component-store entries; SFC clean). If a crash happens during a model run, check the bugcheck code before debugging SHIELD.
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
