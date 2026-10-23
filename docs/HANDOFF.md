# SHIELD — Session Handoff

**Last session:** 2026-10-21 → 22, on Linux (previous: 2026-10-20 → 21 on Linux; 2026-09-26 → 28 on Windows)  
**Branch:** `feat/model-library`, 35 commits past the 2026-09-28 tip (`57d5baf`). Pushed to the public repo up to `3981847`; **everything after it is committed locally, not pushed:** `1ed9b36` (panel runs survive a restart), `a26dba2` (the earlier handoff) and the commits of 2026-10-21 → 22 (`0839059` .. this handoff commit). Nothing is merged to `main`. Only the user says when to push or open a PR.  
**Tests:** 1135 passing, 7 skipped (`npx vitest run`) · `npx tsc --noEmit`, `npx eslint src electron scripts --ext ts,tsx --max-warnings 0` clean. `prettier --check` flags `src/components/ui/button.tsx` and `scripts/bench/mcp.ts`, which were already unformatted: do not run `prettier --write` over whole folders (it reformats `button.tsx`; `git checkout` it).

**Tested in the app with (2026-10-20):** Bonsai 27B Q1_0 on an RTX 2070 SUPER 8 GB (Ubuntu 26.04), SHIELD-managed Prism llama-server at 32K, ~19 tok/s. Earlier sessions: Qwen3-Coder-30B and Gemma 4 12B on Windows (see the older updates).

Read this first (the sections "Update — 2026-10-21 → 22" and then "Update — 2026-10-20 → 21" are the current state), then [SHIELD_AGENT_ARCHITECTURE.md](./SHIELD_AGENT_ARCHITECTURE.md) (§21 agent teams, §17 decision log, §13 priorities, §20 evidence) and [testing/AGENT_BENCHMARK.md](./testing/AGENT_BENCHMARK.md).

---

## Next session — start here (todos from 2026-09-25, updated 2026-09-28)

Order agreed with the user on 2026-09-26: the Code view, then the terminal, then the recall tool. Background is in the updates below.

- [x] **Code view, separate from Chat.** Built and used in the app 2026-09-27, with fixes from that test (see "Code view" below). Committed 2026-09-28: `25a7f65` (Code view), `a837dfe` (colours, rule 7, repeated failures).
- [x] **Terminal tool in Code** (`run_command`). Built 2026-09-28, working tree; first tried in the app the same morning, then fixed (failure lines, reason and script view, PowerShell 7) — see the update below. Still to try: the fixes, a read-only `git status` in Auto, Stop during a long command, Plan and Read-only.
- [ ] **Try the `&quot;` retry in the app** (same update), then commit it with the terminal.
- [x] **Work ledger** (2026-09-28, working tree; see the terminal update). Tried once: Qwen acknowledged the record, then misread the file; now the record checks failed edits against the file, and a note under the reply tells the user.
- [x] **Memory step 1 and projects** (2026-09-28, working tree, not yet tried in the app): see "Memory step 1, projects" below. Try: "what did we do with the GUID fix?" in a new chat (automatic recall and search_memory); a project in Chat and one in Code (folder picked once, later sessions start there); moving a chat into a project.
- [x] **AGENTS.md and Plan** (2026-09-28 evening, see the updates below; neither tried in the app yet).
- [ ] **SHIELD learns and remembers** — the user's goal (2026-09-28): notes survive restarts, SHIELD learns from the user, its work and its chats, "as powerful as the Claude and Codex harnesses but offline and local". Plan in "Memory: where this is going" below; the recall tool is its first step.
- [x] **Agent teams (v1)** and the **Linux port** — 2026-10-20 → 21, see "Update — 2026-10-20 → 21" below (start there).
- [ ] **Recall tool** (after the terminal). Let the model read back the original messages a summary replaced, from the saved chat. Summaries become an index instead of a loss, and the re-reading loops stop (at 8K, "review the whole repo" re-read cleared files until the 20-round limit). A SHIELD-owned tool like `delete_file` and `web_search` (`electron/services/webTools.ts` shows how one is registered); the design docs' "compaction does not delete history". Proposed shape in the 2026-09-26 update.
- [ ] Later: keep Gemma out of coding sessions (e.g. suggest Qwen3-Coder when a chat turns to file edits); give the context planner real headroom for the desktop; fork a chat from a summary; edit or pin summaries; whether node-llama-cpp models need clearing and summarising too (today they fall back on node-llama-cpp's own context shift, which drops the oldest turns).
- [x] **Commit the working tree.** Done 2026-09-27 as three commits, each tested on its own: `6069e14` Gemma native tools and saved summaries (the 2026-09-25 work; 558 tests), `c36cf10` clearing to 40%, folder note, work-group header (567), then the evening fixes (589).
- [x] **Try the 2026-09-26 evening fixes in the app.** See the evening update.

- [x] **Finish Gemma desktop verification.** Done 2026-09-26 in an isolated profile: load Gemma, approve a read, deny a write, reload, reopen the saved chat, fresh follow-up. See the update below.
- [x] **Keep summaries on reload.** The reply saves the capsule, the exact model history it kept, and the cumulative count of model messages it replaced. A reopened chat uses its full history if it fits; when it needs room, it resumes from the saved capsule without writing the same note again. The full visible chat stays in local storage. Verified with fake llama-server requests and a JSON round trip; a live model reload has not been tried for this change. See the evening update below.
- [x] **Clear less often at 32K.** Done 2026-09-26: once clearing starts it goes on, oldest exchange first, until the history is under 40%. Seen in the app with Qwen3-Coder (evening update).
- [x] **Stop workspace detours.** Done 2026-09-26: the `[Current folder: …]` note goes only with requests about files. `npm run bench:agent` never covered this case — its prompts give full paths and it does not add the note — so "what's in this folder?" has to be checked in the app.

---

## Update — 2026-10-21 → 22: team fixes, a hanging server, and a quieter orchestrator (start here)

The user's direction this session: **agents only when the task needs them or the user asks** (saved as a memory); the orchestrator must **speak as the one assistant that does the work** ("it should just work and spawn agents to help if needed"); and **short in-app tests over long benchmarks** ("we do not have the time"). The first plan, a repeated headless benchmark of the team, was cut short for the last reason.

### Commits (all local, not pushed)
- `0839059` **tool-call parser**: a call that stops after `</arguments>` with no `</tool_call>` now runs; with two `<server>` elements the last wins (Bonsai wrote `agents`, then `terminal`); a finished block with no `<tool>` name gets an error (`unreadableToolCall`, `UNREADABLE_ERROR_PREFIX`) instead of ending the turn. Cause: two of three reviewers in a `bug` run wrote `<server>filesystem</tool>` and ended without a report. The agent-runner test that used that call now expects the error, not a report request.
- `7bf1563` orchestrator prompt: delegate only what the request needs (a greeting or general question: answer directly; a question about files: one read-only delegation; a change: the coder; tester and reviewer when the user asks or the change calls for them; the user's words come first).
- `a0587cc` and `08d922d` **stall watchdog** (`STALL_MS`, 5 minutes, `LlamaServerProvider.chat`): a server that makes no progress fails the turn. The first version reset on any byte and never fired, because the hung server still sent a few bytes now and then; the timer now counts progress only (new text, a higher generated-token count, more prompt read).
- `969a0b0` `SHIELD_SPEC_TYPE=none` leaves out `--spec-type ngram-mod` (`buildServerArgs({ specType })`). The default is unchanged.
- `a6f3a90` orchestrator prompt: speak as the assistant, never mention delegating, agents, tools, a terminal or access, never say it cannot read or edit; an example reply for a greeting. Its first wording was not enough (the model tried a tool that does not exist, then said it had no terminal).
- `93e094b` **approval bar**: a long path ran under the Deny button (`truncate` does nothing on an inline span); the folders now shorten and the file name always stays visible (`PathText` in `ToolPermissionBar.tsx`).
- `d02482c` **Team fit by model** (`src/agents/teamFit.ts`, `ModelMetadata.team` in `config/models.ts`): each catalog model is `good` (Bonsai 27B), `untested` (the 9B: one small task passed; Qwen3-Coder: never tried; the rest unrated) or `poor` (the 8B: `delegate` with no role). A model whose runtime is not a llama-server (Gemma, Qwen3.8) is `unavailable`. `shouldTurnTeamOff` (App.tsx effect, with a toast) turns Team off for the session when the model is poor or unavailable, unless the user accepted the caution for that model (`Conversation.teamOverride` holds the model id). The Team button (`TeamToggle`) is disabled for unavailable, explains and offers "Turn on anyway" (a dialog quoting the model's note) for poor, and the Model Library cards show "Team: works / untested / not suited / not available" (`teamLabel`). Edit the notes in the catalog when a model is tested.
- `0eb3dcc` **approval bar**: a Coder/Tester/Reviewer chip names the agent that asks (`AgentRunDeps.execute(call, { role })` → `handleToolCallRequest(…, { agent })` → `PendingToolRequest.agent`), and an `edit_file` shows the lines taken out and put in, a `write_file` the start of the new file (`src/utils/changePreview.ts`, `ChangeView` in `ToolPermissionBar.tsx`; 3 edits of 8 lines at most, the rest counted).
- `03d13a2` **escaped closing quote**: the orchestrator wrote `"task":"…applied correctly\"}` and sent that call 11 times until the round cap. `unescapeClosingQuote` now reads a final `\"` before the closing braces as the closing quote (checked on the real saved call), and the same unreadable call three times ends the turn with "kept sending a delegate call that could not be read" (`stuckUnreadable` in `mcpMessageHandler`).
- `fd28e54` a per-reply **`thinking: false`** option (renderer `messageHandler` → `useLlama` → IPC → `LlamaService.ChatOptions` → `chat_template_kwargs: { enable_thinking: false }`), set for the team's orchestrator only: a greeting went from 36-67 s and 659-1,300 tokens to about 10 s and 146 tokens. The agents that do the work still think.

### The server hang (open question; speculative decoding is not shown to be the cause)
Two of two `fix` runs with speculative decoding on froze: llama-server's main thread at 100% CPU, `/slots` showing `is_processing: true` with `n_decoded` unchanged (151 in the first, 1,971 in the second), the GPU about 40% busy, `/health` still "ok", and a few bytes sent now and then. Both times it ran with `--spec-type ngram-mod` (the launch default). Without it, the one `fix` and one `bug` run that finished took 1,279 s and 1,345 s (with it on, `bug` took 438-700 s), so it costs speed. **Two hangs in six runs do not prove the cause.** The direct test below (60 requests with it on, none hung) did not settle it either. To spot a hang live: query `/slots` twice a few seconds apart (`ss -ltnp | grep llama-server` gives the port).

**Direct stress test of speculative decoding (2026-10-22, `--spec-type ngram-mod` on or off, same prompts, Bonsai 27B at 32K, SHIELD's own launch arguments via `buildServerArgs({ specType })`).** A script started `llama-server` the way SHIELD does and sent chat requests in one growing conversation (reset past 60,000 characters of history): four in five "rewrite this 36-function file with one change" with thinking off (about 670 tokens out), one in five "review this code at length" with thinking on (900 tokens). A hang was defined as a request still processing with the decode counter unchanged for 45 s, or a request over 8 minutes.
- **ON: 60 of 60 requests, no hang**, 44,792 tokens, 64 tok/s overall.
- **OFF: 10 of 10 requests, no hang** (cut short: it was for the speed comparison).
- **Speed, the same first 10 requests:** edits **102 tok/s ON vs 30 tok/s OFF (3.4x; 6.6 s vs 22.4 s each)**; thinking reviews 31 vs 30 tok/s (no difference); the whole mix 2.1x faster with it on. This matches the team runs (`bug` took 438-700 s with it on, 1,345 s off).
- **So the hang is not reproduced by chat alone, and speculation is not shown to cause it.** Both real hangs came in team runs, after many agent turns with tool results in the context and, on one slot, with the orchestrator and the coder, tester and reviewer sessions taking turns. Untested ideas: alternate two or more different conversation histories on one slot, with tool results in them, as a team does; and a long team run with `SHIELD_SPEC_TYPE=none` (only two finished runs so far without it, both passed). Until then the default stays on: it is the model's big speed win and the stall watchdog (`a0587cc`, `08d922d`) turns a hang into an error after 5 minutes.
- The script was not kept (it lived in the session scratchpad); it is about 80 lines: spawn the server from `buildServerArgs`, poll `/slots` every 5 s, post chat requests, compare `next_token` between polls.

### What the runs showed (Bonsai 27B, 32K, `--max-tokens 8192`)
| Run | Scenario | Speculation | Result | Time |
|---|---|---|---|---|
| 1 | bug | on | pass | 700 s |
| 1 | fix | on | hung, killed | 49 min |
| 2 | bug | on | pass | 438 s |
| 2 | fix | on | hung, killed | about 35 min |
| 1 | fix | off | pass (tests re-run by the harness) | 1,279 s |
| 1 | bug | off | pass | 1,345 s |

Five finished runs, all passing: **still no pass rate.** In the last `bug` run the orchestrator sent a tester twice although the scenario never asks for one, so the "delegate only what is needed" prompt is not reliably followed by this model. In another run a tester's `run_command` JSON was malformed (`"reason\":\"…` ended up inside `command`); harmless there, not fixed.

### Short in-app checks (real window, Bonsai 27B, Team on, Auto)
`tmp/ui-check/quick.mjs` is `team.mjs` with a 90 s stability window instead of 240 s; run `RUN_MS=240000 node tmp/ui-check/quick.mjs "<prompt>"` after `npm run build` and `rm -rf "tmp/ui-check/profile/Local Storage"`. After the last commit: a greeting answered in 9.6 s with no mention of agents and no "I cannot"; "what does `add` in calc.py return?" answered in 8.7 s (a coder looked, not the reviewer the prompt prefers); "make `add` take an optional third number" done by the coder alone in 11 s (`def add(a, b, c=0)`), nothing else spawned. **Ask mode** (`tmp/ui-check/ask.mjs`: `team.mjs` in Ask mode; it waits `WAIT_MS` (default 60 s) for a human to click Allow, then clicks itself): the same edit asked for an approval before the read and before each edit, named the tool and path, and ended with the right file. In that run **nobody clicked**, so the script did; the buttons work, but a person reading the bars is untested. Two gaps seen in the bar and left alone: it does not say **which agent** is asking (the activity line and the Team panel do), and an edit shows only its path, **not the change** it will make.

**Multi-step and smaller models** (`tmp/ui-check/quickm.mjs`: `quick.mjs` that picks the model from the Model Library; `MODEL_INDEX=1` is the 9B, `2` the 8B, with `MODEL_SIZE` its size on disk; the 27B is `MODEL_INDEX` unset). Task: `calc.py` has `a - b`, "python3 test_calc.py fails. Find the bug and fix it so the test passes." (Auto mode, Team on):
- **27B** (thinking off for the orchestrator): one coder listed, read, ran the test (fail), edited, re-ran (pass); the orchestrator's answer came in 11 s; no tester or reviewer spawned; the test passes when run outside the app.
- **9B**: the same, with SHIELD's record under the report confirming the edit and `exit 1` then `exit 0`; about 46-58 tok/s; the orchestrator's summary misdescribed the bug ("returning -b instead of +b") where the agent's own note was right.
- **8B** (the catalog calls it too weak for multi-step tool work): **fails**. It called `delegate` with no `role`, nothing was delegated, and the chat showed the tool's own error ("delegate needs "role"…") and then asked the user which role to use. `calc.py` stayed broken. Worth deciding: do not offer Team with the 8B, or hide the tool error behind a retry.
- **Qwen3-Coder is not installed** (18.6 GB, "too large for this PC" in the library): not tried; ask before downloading.

**Team fit and the approval bar, in the window** (`tmp/ui-check/fit.mjs`, `ask.mjs`): with the 8B, Team shows off with the explanation and the caution dialog, "Turn on anyway" turns it on; the library cards read works / untested / not available / not suited. In Ask mode the bar showed `Coder · read_text_file …/te… calc.py` and, for the edit, `- def add(a, b):` / `+ def add(a, b, c=0):` lines. A run on the 27B before the quote fix sent one unreadable delegate call 12 times (see `03d13a2`); after it the same task finished with `def add(a, b, c=0)`.

**Not tried:** a human clicking through Ask mode, Qwen3-Coder as the team's model.

### Next steps (suggested order)
1. Short in-app checks of what is untried: a human clicking through Ask mode, and Qwen3-Coder (needs a download, ask first; then set its `team` note in the catalog). Rate the 9B `good` once it has done a bigger task.
2. Find the hang. Speculative decoding is not shown to cause it (see above). Try the two untested ideas there: alternating conversation histories with tool results on one slot, and a long team run with `SHIELD_SPEC_TYPE=none`. If it still hangs with it off, the cause is elsewhere (the fork, the 1-bit kernels, the cache).
3. ~~Make a read-only question go to the reviewer~~ done: the system-prompt rule alone changed nothing for the 27B (three questions, three coders); a note in the user's message does (`src/agents/teamRouting.ts`: `isProjectQuestion` = opens with a question word and asks for no change, then `QUESTION_NOTE` is appended in `messageHandler`), the reviewer's role text now covers answering, and three questions went to the reviewer with correct answers in the app. It is a word pattern, so an oddly phrased question still reaches the coder as before. The 9B's summary of a result can still be wrong while the agent's note is right.
4. The malformed `reason` in `run_command` JSON: see whether `repairJsonStrings` can mend `"reason\":\"…` without moving text into `command`. Bonsai breaks JSON in a few recurring ways (escaped closing quote, quotes inside file content): each repair so far came from a real saved call, so keep reading `tmp/ui-check/profile/conversations/*.json` after a bad run.
5. Still open from before: Windows CI (an eventual PR to `main`, ask the user first), team notes and hand-offs kept only in memory, the recall tool, "SHIELD learns and remembers", and the older "Later" list below.

### Working agreements added this session
- Agents only when needed; the orchestrator speaks as one assistant (see the top of this section).
- Never chain `git stash` with other commands: an interrupted chain once left the work in the stash and the tree clean (recovered with `git stash pop`, nothing lost). Do not `git init` inside a test project either.
- A background `until` loop that waits for "an exit line" must count lines (or watch the process), not match any earlier line: two checks returned at once on old output.

## Update — 2026-10-20 → 21: Linux, Bonsai, and agent teams

### The machine and the Bonsai server
- Ubuntu 26.04 (XFCE, X11), user `buqqzz`. Ryzen 5 3600, 15 GB RAM, RTX 2070 SUPER 8 GB (Turing, sm_75), driver 595, CUDA 12.4 toolkit, Node 22, `gh` installed and logged in as BuQQzz (HTTPS). No global git identity: commit with `git -c user.name=buqqzz -c user.email=buqqzz@gmail.com commit ...` (the author of the earlier commits).
- Bonsai lives in `~/Desktop/Projects/Bonsai/`: PrismML's llama.cpp fork built with CUDA arch 75 (`src/llama.cpp/build/bin/llama-server`); models in `models/` (`Bonsai-27B-Q1_0` 3.8 GB, `Ternary-Bonsai-2-9B-PQ2_0` 2.4 GB, `Bonsai-8B-Q1_0` 1.2 GB). SHIELD finds the binary through **`SHIELD_LLAMA_SERVER=<path>`**; SHIELD's own models folder (`~/.config/shield2.0/models`) holds symlinks to the three files. The fork accepts every flag SHIELD passes.
- Never use a quantized KV cache (`-ctk/-ctv q8_0`) with the 27B/9B on sm_75: the GPU crashes. SHIELD does not pass it.
- **Thinking models:** the 27B thinks before it answers. Two traps found live: (1) a small reply limit (SHIELD's default Max Tokens is 2048) can be spent entirely on thought, leaving an empty reply (the chat now explains this; 8192 suits Bonsai); (2) **`--reasoning-budget` must not be on by default**: the model carries on thinking in the visible answer when it is cut off (checked against the server, and seen as a rambling block ending in `</think>` in the chat). `buildServerArgs` accepts an opt-in `reasoningBudget`; the thinking parser now also files a lone `</think>` as thinking.

### What was built (commits `d351752`..`1ed9b36`)
- **Linux:** path validation refuses relative, foreign (Windows drive/UNC) and symlinked paths (a symlink escape was a real hole); `run_command` runs in bash with POSIX read-only rules (a `echo a\" | rm x \"` bypass found and closed; backslash and `!` ask); `canonicalPath` is case-sensitive off Windows; prompts, the delete step, tagline and memory warning name the host OS and "Trash" (`src/utils/platform.ts`: `hostOs`, `osName`, `trashName`; the main process reads `process.platform`). Tests that are Windows scenarios pin the platform with `vi.stubGlobal("navigator", ...)` because jsdom reports Linux.
- **Bonsai:** 27B / 2 9B / 8B in the catalog (runtime `prism-llama-server`, run by the llama-server engine); planner fallback for PQ2_0 (node-llama-cpp cannot size it); the context meter survives Bonsai's template (it refuses a chat with no user message); titles send `enable_thinking:false`; `closeOpenBrackets` mends tool-call JSON whose object never closed.
- **Agent teams** (design, rules and evidence: `SHIELD_AGENT_ARCHITECTURE.md` §21). A **Team** toggle in Code sessions; an orchestrator with **one tool, `delegate`**, hands work to a coder, tester and reviewer, each in its own model session on the same llama-server (`LlamaServerProvider.fork`, `keepWholeHistory`; llama-server models only). SHIELD enforces role limits (tester changes test files only, reviewer nothing), meters context (`[Context: N% used]`), makes agents hand over at 70% (a fresh agent continues from the hand-off; SHIELD attaches it itself when the model forgets `continue_from`), puts its own record of files/commands in every report, asks for a report from an agent that ends without one, and notes under the answer when it credits a role that never ran. The **Team panel** (right side: role icons with status dots, agent list, live timeline with streamed text, context bar, report, collapses to a rail) and the plan checklist are fed by the runner's events; the plan is **derived from the delegations** (`src/agents/teamPlan.ts`); runs are saved with the conversation (`agentRuns`) and restored on open.

### How to check things (the harnesses are in `tmp/ui-check/`, git-ignored; recreate if missing)
- Headless team run: `SHIELD_LLAMA_SERVER=~/Desktop/Projects/Bonsai/src/llama.cpp/build/bin/llama-server npx tsx scripts/bench/agent-team.ts --models-dir ~/Desktop/Projects/Bonsai/models --model bonsai-27b --scenario bug [--checkpoint 0.12]` (`0.12` cuts agents off early on purpose; scenarios `fix`, `bug`, `build`; it re-runs the project's tests itself; evidence in `tmp/agent-team-*`; a run is 10-20 minutes). Single-agent smoke: `scripts/bench/gemma-smoke.ts --model bonsai-27b ...`.
- The real window: `npm run build`, then a Playwright `_electron.launch` script against the build with an isolated `--user-data-dir` (`tmp/ui-check/team.mjs` drives a Team session: stubs the folder dialog, presses Team, sets Auto, clicks the **Run**/**Allow** buttons, screenshots every 45 s; `RUN_MS` caps it). Pitfalls: **never `page.setViewportSize`** (it forces the page wider than the real window); reset the profile's `Local Storage` between runs (the panel's collapsed state persists); the profile's Max Tokens must be 8192 for the 27B; the window appears on the user's desktop, so **run one only when the user has agreed, with a time cap**.
- **Never `pkill -f` / `pgrep -f` with a pattern in your own command line** (it killed the calling shell once). Use `pkill -x electron` / `pkill -x llama-server`.

### Findings from the live runs (what to expect)
- Before the orchestrator lost `update_plan` it stalled in 3 of 5 runs (saving the plan 5-9 times, never delegating) despite a hint, a guard and a round cap. Since: 3 clean runs in a row (coder, tester, reviewer; plan "3 of 3 done"; fix passes outside the app). One run is one attempt on a tiny bug: **there is no pass rate yet.**
- The 27B sometimes skips a role you asked for (it skipped the tester once, then claimed one had run: now flagged). It writes invalid JSON when file content has quotes (16 failed calls in one run before the repair) and mangles bash quoting inside written scripts.
- A reviewer once ended on a malformed tool call, reported nothing, and the orchestrator said the review had confirmed everything: that is why every agent must report and SHIELD's record sits beside the agent's words.

### Next steps (suggested order)
1. **A repeated benchmark** of the team (e.g. 10 runs of the `bug` and `fix` scenarios: pass rate, time, which guard fired). The extra evidence is the basis for any claim of reliability.
2. Try teams with **Qwen3-Coder** and the **9B/8B** Bonsai in the app (untested), and Ask mode with a human approving each call.
3. **Windows**: CI runs on `windows-latest` for PRs and pushes to `main`. Nothing here was run on Windows; an eventual PR to `main` is where the platform-specific tests get their first Windows run. Ask the user before opening one.
4. Team notes and hand-offs are in memory only; sub-agent steps are not saved as chat messages (only the panel's runs, with the chat); agents run one at a time (one server slot).
5. Still open from before: the recall tool, "SHIELD learns and remembers", and the older "Later" list below.

### Working agreements with the user
- Ask before downloading large files or installing system packages (name, source, size). Push and open PRs only when asked, each time. Run visible windows only when agreed, with a cap.
- Report plainly what failed or was not tested; verify with your own run, not an agent's summary.
- **Never empty the Trash** or run any broad cleanup: on 2026-10-20 `gio trash --empty` was run to remove one test file (it empties everything). Nothing was lost (the Trash folder had been created by that same test seconds earlier), but clean up only your own files, by exact path.

## Update — 2026-09-28: a terminal for Code sessions, and edits written with `&quot;` (working tree)

**`run_command`** (`electron/services/terminalTool.ts`), offered in code sessions only (`useToolPolicy`: the `terminal` server's tools follow `fileTools`, like the file tools; there is no Settings switch). One command per call, in the session's project folder (`mcpService.getWorkspaceFolder()`), with PowerShell 7 if `pwsh.exe` is on the PATH, else Windows PowerShell 5.1 (the tool description says which, and that 5.1 has no `&&`).

- **Running.** The command goes in `-EncodedCommand`, wrapped so the output is UTF-8 and the exit code is the program's own (PowerShell alone reports 0 or 1). stdin is closed, so `Read-Host` fails at once instead of waiting. The environment turns off pagers, prompts and colour and sets `CI=1`, so test runners run once instead of watching; `core.fsmonitor=false`, so a repository's own config cannot start a program on `git status`. Timeout 120 s by default, `timeout_seconds` up to 600. Output keeps the first 2,000 and last 6,000 characters (errors and test summaries are at the end), without colour codes, and a redrawn progress line keeps its last state. The result starts `Exit code N · 2.4 s`; a non-zero exit is still a successful call, since the command ran. A timeout, Stop or a start failure is a failed call, with the output so far.
- **Stop** (`handleStopGenerating`) calls `mcp:stop-commands`, which kills each running command's process tree (`taskkill /T /F`); closing SHIELD does too.
- **Permissions** (`src/config/commandSafety.ts`, `isReadOnlyCommand`). A command runs without asking in Auto, Plan and Read-only only when every pipeline stage is one of: git status, diff, log, show, blame, ls-files, rev-parse, grep, shortlog, describe, listing branches, remotes and stashes; `Get-ChildItem`, `Get-Content`, `Select-String`, `Test-Path`, `Select-/Sort-/Where-/Group-/Measure-Object`, `Format-*` and their aliases; `npm ls`; `<program> --version`. Stages are joined with `|`; any `;`, `&`, `||`, `>`, `<`, `$`, brackets, braces, parentheses, `@`, `:`, line break, a path starting `\`, `/` or `~`, or a `..` step asks, so nothing unattended reaches outside the folder, another drive, `Env:` or the registry. Also asking: git global options (`-C`, `-c`), `--output`, `--ext-diff`, `grep -O`. Otherwise Auto asks, Ask asks for everything, Plan records the command as a step, Read-only refuses it. The permission bar shows the whole command and never offers "Allow for session" (`asksEveryTime` in `useMCPDialogs`): approving one command must not approve the next.
- **Not covered:** a repository's `diff.external` or textconv filters could still start a program during `git diff`/`log`/`show`. Read-only commands can read anything inside the project, including `.env` files, as `read_text_file` can.
- **The model:** rule 8, "CHECK YOUR WORK" (6 without edit_file), and the same line in the native prompt: run the tests or the script after a change, fix what fails, never say it passes without running it. The work group shows "Ran npm test · exit 1 · 2.4 s"; summaries say "ran `npm test`".
- A failed or stopped command also clears the turn's remembered results (`mcpMessageHandler.ts`), since it may have changed files.

**First live test (Ask mode, Qwen3-Coder, `wifi` project), and what changed after it.** "check your work": Qwen wrote `test-scripts.ps1` and `integration-test.ps1` and ran them (three commands, each asked). Three problems:

- Its integration test printed `✗ Failed to load set-radio.ps1: A parameter cannot be found that matches parameter name 'Object'` - a real bug already in the script (line 46, `Select -Object -First 1`) - but exited 0, and Qwen answered "All Tests Passed Successfully" with an invented reason. **Now:** after a run that exits 0, lines that look like failures (a ✗ or ×, FAIL/ERROR lines, "3 failed", "TypeError:", "error TS2322", "cannot be found", "is not recognized", Traceback, `npm ERR!`; not ✓/PASS lines) are listed after the output with "do not report success over them" (`failureLines`, `formatRun`); the step shows "exit 0 · 2 possible failures". The check-your-work rule now says to read the whole output and name every failure not fixed.
- The approved `powershell -File integration-test.ps1` ran a script Qwen had just written, which dot-sourced `set-radio.ps1` - the script that switches the Wi-Fi radio (it stopped at the line 46 error, before the switch). **Now:** `run_command` requires a `reason`, one sentence for the user shown in the permission bar; and when a command names a script the model wrote, edited or moved this session (`useMCPDialogs` remembers them; `scriptsInCommand`), the bar says so and "Show script" shows its current contents.
- Qwen ran its scripts with Windows PowerShell 5.1, which read the UTF-8 files as ANSI (`✓` became `âœ“`). **Now:** the tool description says to run scripts as `.\name.ps1` or `pwsh -File`, never `powershell.exe` (or, with only 5.1 installed, to keep scripts ASCII), and carries Codex's Windows rules (no passing paths between shells to delete or move; check the full path before a recursive delete or move).

**How Codex does it** (openai/codex, read 2026-09-28): commands run unattended because they run in a sandbox (writes only in the workspace, no network; on Windows `codex-rs/windows-sandbox-rs`, a separate sandbox user, file ACLs and an admin setup), not because of a read-only list; approval is for leaving the sandbox, with the model's `justification` question shown to the user and an optional saved prefix rule (`["npm","test"]`, broad ones like `python3` banned). Its results are `Exit code / Wall time / Output`, cut in the middle, like ours. Nothing in its harness checks the model's claims - its prompt only says to start with the narrowest test and mention failures not fixed - because it trusts a GPT-5-class model to read output; the failure-line note is for local models. Later, maybe: "always allow `npm test`"-style prefix approvals; a real sandbox (Codex's Windows one is Apache-2.0).

**Second live test, and what changed after it.** "run the tests again" and "run them all individually": the failure note worked - `diag.ps1` exited 0 with three `(404) Not Found` lines, and Qwen reported it "Partially Failed", naming each; `set-radio.ps1` (exit 1) it reported as failed with both errors. But Qwen gave no `reason` and copied `powershell -ExecutionPolicy Bypass -File …` from its own earlier calls, and "Show script" did not appear after the restart (the list of model-written files lived in memory only). One of the commands ran `set-radio.ps1` itself, the Wi-Fi switcher, with nothing but the command shown; it aborted before the switch. **Now:**

- A command that would ask the user and has no `reason` is sent straight back ("Not run: … must include "reason" …"), without asking; the model sends it again with one (`MISSING_REASON`, `useMCPDialogs`). Read-only commands run without one.
- Model-written scripts also come from the saved conversation's own write/edit results (`modelWrittenFiles`), so "Show script" survives a restart.
- After a command that started `powershell.exe` when PowerShell 7 is installed, the result says so: 5.1 misreads UTF-8 scripts (✓ → âœ“), use `.\name.ps1` or `pwsh -File` (`windowsPowerShellNote`). Qwen follows its own history more than the tool description, so the correction comes with the result.

**Work ledger** (`src/handlers/workLedger.ts`). In code sessions, after new work, the user's next message carries SHIELD's record of every change and command in the conversation, from the tools' actual results: "edited set-radio.ps1", "edit of set-radio.ps1 FAILED - nothing changed (Could not find exact match for edit:); it tried to replace text starting "# --- 2. Enum…"", "ran `…diag.ps1` - exit 0, but 3 lines looked like failures", declined and Plan-mode calls as "not done". The note says it outranks the model's own replies. Why: Qwen's claim that the GUID fix was applied was its own words, repeated from its history into FIXES.md and every later summary; clearing context cannot remove that, but a record from tool results contradicts it every time. Built from the saved chat each time, so it survives restarts; sent only when it changed (per conversation, in memory), and again after the model's history is rebuilt (`forgetLedgerSent` in `useConversationSync`). At most 15 lines, older ones counted; repeats answered from the turn's memory and calls bounced before running are left out. The capsule's request list strips it (`requestText`). Not done: a note to the user when a final answer claims a change the ledger shows as failed.

**`&quot;` in edits** (`electron/services/editEntities.ts`). When `edit_file` finds no match and an `oldText` contains `&quot;`-style codes, `MCPService.callTool` tries once more with every `oldText` and `newText` decoded, and on success adds a note telling the model to write plain characters. The filesystem server writes nothing unless every edit matches, so a retry that also misses changes nothing, and the codes are never decoded up front: HTML files really contain `&quot;`. The XML prompt's format line now says to write quotes as `\"`, never `&quot;`.

**Third live test: "Is the GUID fix applied?"** The record went out; Qwen opened with "there was an issue with my edit attempt for the GUID fix", read set-radio.ps1 - and answered "the GUID fix has been properly applied", because the GUID code it found was the old code its edit had meant to replace. A small model can read a file and still not see that its change is missing. **Now** (`workLedger.ts`): before the record is sent, SHIELD reads the files of failed edits (`readFailedEditFiles`, through the filesystem server) and checks each edit's new text line by line, whitespace-tolerant like the server (`containsLines`, `isApplied`): "… FAILED - nothing changed (…). Checked just now: the file still does not have the new text, so this change is NOT in the file", or "FAILED at first … - but the file now has its new text". And after a turn, when the final reply names the file of an unapplied failed edit and claims something was applied, fixed or done (`recordNoteFor`), the reply gets `recordNote`, shown to the user under it in amber (`ChatMessage`): "SHIELD's record: an edit of set-radio.ps1 (replacing "# --- 2. Enum…") failed, and the file still does not have its change."

## Update — 2026-09-28 evening: Plan, a live checklist for code sessions

The user's ask: "I find myself, even with cloud models, telling it to create a doc that's live and can plan and create lists and update it regularly." Built as a tool and a panel instead of a file.

- **The tool** (`src/config/plan.ts`, shared by both processes): `update_plan`, on SHIELD's `plan` server (listed and answered in `electron/ipc/mcpHandlers.ts`). Shaped like Codex's (`codex-rs/core/src/tools/handlers/plan.rs`): `{"plan": [{"step", "status": pending | in_progress | completed}], "explanation"?}`, the whole plan each time. Lenient, since a refusal costs a small model a round: `steps` for `plan`, bare strings, "done"/"in-progress"/"todo"; long steps clipped to 120 characters; more than 12 steps or an unknown status is refused ("Nothing was saved"). The answer is the plan as saved - "[x] Read cart.js / [>] Fix the total / [ ] Run the tests" - with a nudge when no step or several are in progress. Offered in code sessions only (`useToolPolicy`, with the terminal), runs in every mode without asking, Ask and Plan included (it changes nothing on the computer; classed read-only). Prompt rule "KEEP A PLAN" (after CHECK YOUR WORK, both prompt styles): a plan of 3-7 steps for multi-step tasks, one in progress, completed once done and checked, follow the user's version, none for questions or one-step changes.
- **Where it lives:** on the conversation (`Conversation.plan`, saved with the chat), set after each successful call (`savePlanFromCall`, `useMCPDialogs`). Not in the model's context, so clearing history never loses it.
- **Sent back** (`takePlanNote`, `messageHandler`): with the user's message in code sessions while a step is open - "[SHIELD: the plan for this session, as the user sees it. …]" - when it changed since the model last saw it (the user edited it, or a new remark), and otherwise every 4 messages; not right after the model wrote it itself. Reset when the model's history is rebuilt (`useConversationSync`). ~100-200 tokens.
- **Checked against the record** (`planRemarks`, `checkPlan`, `src/handlers/sessionPlan.ts`): a completed step that names a file whose edit failed and whose change is still not in the file gets "not confirmed: SHIELD's record shows an edit of cart.js failed…" - in the note to the model and in amber in the panel. Recomputed after each turn with the files `noteUnappliedEdits` already reads.
- **The panel** (`PlanPanel`, above the permission bar in code sessions with a plan): "Plan · 2 of 5 done", folds to one line with the current step (remembered in localStorage). Click a mark to cycle not started → in progress → done, click a step to reword it (empty removes it), × removes, "Add a step", "Clear plan". The user's edits save at once (`editPlan`, `by: "user"`) and the next message tells the model to follow their version.
- **Memo:** each session's plan is indexed as its own entry (`#plan`, role `plan`; `INDEX_VERSION` 4, so the index rebuilds once), so "where did we leave the visualizer?" finds the open steps; `open_memory` reads it whole.
- Work group: "Updated the plan · 1 of 3 done" (`turns.ts`, ListChecks icon); capsules say "updated the plan".

**Not done:** writing the plan out as `PLAN.md` (the panel covers the live view; a file in the user's project would need the AGENTS.md-style approval), plans in Chat, plan history. **Not tried in the app yet.** Try in a code session (Qwen3-Coder): "add a discount feature to the cart and test it" → a plan appears and steps tick as it works; edit a step in the panel, send "continue" → it follows the edit; restart SHIELD → the plan is still there.

**Verification:** 847 tests across 64 files; `npm run build`, ESLint (src, electron) and Prettier clean; both halves type-checked.

## Update — 2026-09-28 evening: AGENTS.md (`0d2c103`)

**Read.** Code sessions read the project's AGENTS.md the way Codex does (`codex-rs/core/src/agents_md.rs`): every AGENTS.md from the repository root - the nearest folder above with `.git` - down to the session's folder, root first; outside a repository only the folder's own (`electron/services/projectInstructions.ts`, `readProjectInstructions`, IPC `project:instructions`). Capped at 6,000 characters (~1.5k tokens) with a note to read the file for the rest. It goes at the end of the system prompt as "Project instructions (the project's AGENTS.md)", below the user's requests and SHIELD's rules (`instructionsSection`, `useMCPSystemPrompt`'s `projectInstructions`). `App.tsx` reads it again per folder and after each message (`instructions-store`), so one just written counts from the next message.

**Offered, never written unasked.** A code session whose folder has none shows one line under the chat: "No AGENTS.md in this project … Draft one / Not now" (`AgentsMdHint`; "Not now" is remembered per folder in localStorage). Why not automatic: it lands in the user's repository, and a small model's wrong guesses there would be read as instructions in every later session. "Draft one" sends "Create an AGENTS.md for this project." with facts SHIELD gathers itself (`projectFacts`, IPC `project:facts`): the tree (two levels, dependencies and build output skipped), file types by count, package.json name/type/scripts/dependencies, the README's first 1,500 characters, other instruction files present (CLAUDE.md, .cursorrules, …), the last 10 commit subjects. The request asks for sections modelled on Codex's `/init` prompt (overview, layout, build/test/run, style, testing, commits) and "use only the facts below" (`draftNote`). The facts go to the model only (`handleSendMessage(content, { modelNote })`); the chat shows the request.

**Always asked.** A write_file or edit_file of any AGENTS.md asks even in Auto and never offers "for the session" (`writesAgentsMd`, `useMCPDialogs`); the bar says "Write AGENTS.md?" / "Change AGENTS.md?" and "Show the new text" shows what would be written (`ProposedText`, `ToolPermissionBar`).

**Not tried in the app yet.** Try: open a Code session on a folder without AGENTS.md → "Draft one" → read the text → Allow → the next message's prompt carries it.

## Update — 2026-09-28 late afternoon: removal notes written into files; rewrites sent back once

**Found in the EXPERIMENT session:** `PLAN.md` on disk was the single line `[2,450 characters, cleared to save space]`, and earlier the "clean, working version" of `script.js` that broke the visualizer ("its not working now") was `[7,253 characters, cleared to save space]`. History clearing (`historyCompaction.ts`) rebuilt old calls with long arguments replaced by that placeholder - `{"path":"PLAN.md","content":"[2,450 characters, …]"}` - which is an example of a write_file call, and Qwen3-Coder copied it; SHIELD recorded the write as done and Qwen called the plan "comprehensive". **Fixed at both ends:** clearing now drops long argument values from the call (`{"path":"server.js"}`, `"edits":[{}]`) and puts a note after it - "[SHIELD removed from your context to save space: 5,200 characters of the call above. The call already ran; its text is not shown here and is not file content. …]" - and cleared results say the same (`REMOVED_MARK`); and a write_file or edit_file whose text is a removal note, this version's or the old "[N characters, cleared to save space]", is sent back before it runs (`writesRemovalNote`, `isRemovalNote`). `PLAN.md` in the user's EXPERIMENT folder still holds the placeholder (not touched).

**Whole-file rewrites** (the user: "it says it'll create a new better version instead of fixing the code"): a write_file over an existing file larger than 2,500 bytes (`get_file_info`) is sent back once - "Not run: script.js already exists (10,388 characters). Change it with edit_file… If most of the file really has to change, tell the user why, then send the same write_file again." - and goes through when sent again within 10 minutes. Calls sent back before running ("Not run: …") are no longer remembered as the turn's result (so the retry runs), but the same call sent back three times still ends the turn (`bounces` in `mcpMessageHandler`). Rule 7 / the native edit rule add "When code is broken, fix the broken lines with edit_file - never write a new version of the whole file."

**Also from the test run** (`tmp/shield-check/`, an isolated profile driving the production build: `npx tsx tmp/shield-check/prepare.ts`, then `node tmp/shield-check/run.mjs`): 6 of 7 clean - plain answer, web search with the source named, memory (search_memory + open_memory), a failing test found, fixed with one edit and re-run to all-pass, a read-only command run unasked, an honest "did the tests pass". The miss: "What's in this project?" listed the folder and guessed. Two prompt lines since: read files before describing them (folder section, both prompt styles), and check a releases/versions page for "latest" questions.

**Verification:** 803 tests across 58 files; build, ESLint and Prettier clean; both halves type-checked.

## Update — 2026-09-28 afternoon: settings wiped at start-up, Codex's changes reviewed (working tree)

**Music-visualizer test** (a Code session in a project on `EXPERIMENT`, Qwen3-Coder): Qwen planned the app, wrote README/index.html/style.css/script.js, AGENTS.md and UPDATE.md, searched the web (MDN and two articles) and rewrote the visualizer; the user confirmed "works!". Problems: two whole-file writes were cut off at the reply limit and replaced by a "simpler version"; asked to check the web, Qwen first said it could not browse; "commit what we have locally" was silently ignored - `EXPERIMENT` is not a git repository and Qwen neither ran git nor said so (not fixed: a rule like "say which part of a request you did not do" is a candidate).

**Cause of the first two: SHIELD's own settings were reset.** `settingsStore.updateSettings` merged into whatever was in memory; called before the saved settings had loaded, it merged into `DEFAULT_SETTINGS` and saved that. Opening a code session at start-up applies its folder (`useApplyWorkspace` → `updateSettings({ mcp })`), so the reply length went from 8192 to the default 2048, web search went off, and the system prompt, sampling values and Hugging Face token went back to defaults (seen between 2026-09-27 evening and 2026-09-28 07:27). **Fixed:** a save waits for the load in progress, or starts one (`settingsStore.ts`, test `settingsStore.test.ts`). The user chose to restore reply length 8192 and web search on (done in `%APPDATA%\shield2.0\settings\settings.json`, previous copy kept as `.before-restore-2026-09-28`); the HF token is for the user to enter again.

**Folder switched twice when a session started in a project:** `handleNewSession` applied the new folder while the previous session was still open, so the session-folder effect switched back to that session's folder and forward again - two file-server restarts, and twice a tool list read in between with only 5 tools (no file tools). `WorkspaceSelector` had the same order. **Fixed:** the session is created or updated first and the effect applies its folder once.

**Codex's uncommitted changes, reviewed and removed at the user's word ("if redundant, remove"):** (1) keeping file writes under 2,500 characters (rule 6 and the cut-off message) - a workaround for the 2048 limit above, and it broke `mcpMessageHandler.test` "keeps going when a reply is cut off mid-call"; (2) web tools offered with web search off, asking before the first request and approving both web tools for the app session - a workaround for web search having been switched off by the reset, and a change to what "off" means; (3) an opt-in live trace (`electron/services/liveTrace.ts`: tool arguments, model output, renderer and main console, llama-server at log verbosity 4 into `tmp/`) - duplicates the log capture already used, and hooked into the token stream. Kept from it: Allow cannot run a call twice (`approvalInFlight` in `useMCPDialogs`, with a test), and a truthful privacy line in the base prompt (web searches, when on, send queries out). The full patch is kept outside the repo in the session scratchpad (`codex-changes-2026-09-28.patch`); its trace output is still in `tmp/` (git-ignored).

**Verification:** 795 tests across 58 files; `npm run build`, ESLint and Prettier clean; both halves type-checked.

## Memory step 1, projects (2026-09-28, working tree)

**Memory index** (`electron/services/memory/`). SQLite FTS5 with BM25 (`sqlite3` was already a dependency; the old unused `MemoryService.ts` is deleted) at `%APPDATA%\shield2.0\memory\memory.db`. Every saved conversation, chat and code, message by message: the user's text, the reply without tool markup plus "called edit_file set-radio.ps1" lines, each tool result (4,000 characters at most per entry). Indexed when a conversation is saved or deleted (`conversationHandlers`), and caught up 5 s after start (`syncMemoryIndex`, by each conversation's `updatedAt`). On the real data: 37 conversations in 170 ms, searches in 1-7 ms, no model, no GPU. `queryTerms` splits like the index (`set-radio.ps1` → set, radio, ps1) and drops stopwords; at most 2 matches per conversation.

- **Tools** (`memoryTools.ts`, the "memory" server): `search_memory(query, limit≤8)` → one line per match with an id (`conv-…#14`), date, chat or code session, title, folder and snippet; `open_memory(id)` → that message in full with the user request it followed. Read-only, offered in chats and code sessions alike (`useToolPolicy`), so they run in every mode (Ask asks).
- **Automatic recall** (`src/handlers/memoryRecall.ts`): before each message of three or more real words, SHIELD searches the other conversations with it and appends up to two one-line pointers ("[From SHIELD's memory of earlier conversations … read one in full with open_memory …]") when a match shares at least 2 of the message's words and 40% of them. Small models seldom search on their own.
- **First live test:** in a new chat, "what did we do with the GUID fix in set-radio?" - Qwen called `search_memory` itself, then `open_memory` on a match (1k/0.6k/0.9k tokens in); but the match was the reply that had _proposed_ the fix as code to paste, and Qwen answered "we replaced the hardcoded GUID handling" - the edit that failed. Memory held what was said, not what happened. **Now:** each code session's work record (`ledgerEntries`, reused from the renderer) is indexed as its own entry (`<conversation>#record`, role `record`); `search_memory` ends with "Careful - a reply above may describe a change that never happened: In "…", SHIELD's record shows these were NOT done: …" for sessions among the matches (`notDoneFor`); `open_memory` labels a reply "what was said at the time" and appends the record's lines about the files it names ("where this and the message differ, the record is right"); the automatic recall note adds "SHIELD's record for that session - NOT done: …" under a match. Checked on the real chats: the search shows the failed GUID edit, and opening the proposal shows it under it. Memory tools' own results are no longer indexed (they came back as the top matches for the search that made them). The index has a version (`INDEX_VERSION`, now 3): a change in what is indexed rebuilds it once.
- Not yet: preferring matches from the same project; meaning-based search; the profile and project cards; background learning.

**Projects** (both views). `electron/services/ProjectStorageService.ts` keeps `%APPDATA%\shield2.0\projects.json` (id, name, optional folder); a conversation has `projectId`. IPC `projects:list/save/delete` and `conversations:set-project` (`projectHandlers.ts`; deleting a project moves its conversations out of it and re-indexes them). Renderer: `useProjectStore`; `moveToProject` in the conversation store; `inProject` / `outsideProjects` in `lib/sessions`. Sidebar (`ProjectList.tsx`): each project a foldable group (folding remembered in localStorage) of the view's kind, with + (new chat or session in it) and a menu (new here, rename, set/change folder, delete); below, "Not in a project". The folder-plus button in the list header makes a project: in Code it asks for a folder, names the project after it and starts a session there; in Chat it asks for a name. A code session in a project with a folder starts there without asking; a project without one takes the first session's folder. Every list item has "Move to project" (hover). Search shows one flat list.

**Verification:** 792 tests across 57 files (new: the record in memory, index versions; earlier: ledger file checks and record note; memory index against real SQLite - search, stemming, thresholds, re-index, read; memory tools; recall; project storage; project list; session helpers); `npm run build`, ESLint and Prettier clean; both halves type-checked.

**Memory: where this is going** (the user, 2026-09-28: notes must survive restarts; SHIELD should learn from the user, its work and its chats, as capable as the Claude Code and Codex harnesses but offline and local). How Codex does it (`codex-rs/memories/README.md`): when a session starts, a background job takes finished, idle past sessions ("rollouts") and has a model extract a structured memory from each (secrets redacted, stored in a state DB); a second phase has an agent consolidate them into `~/.codex/memories` - `MEMORY.md`, a summary, `rollout_summaries/`, `skills/` - kept in git so each run sees a diff, ranked by use and pruned when unused; the read side puts a short memory summary into the session's instructions and has the model cite what it used. Claude Code: `CLAUDE.md` project instructions plus a typed memory folder with an index loaded each session. SHIELD, in order:

1. **Per conversation** (started): the work ledger; saved capsules; then the recall tool - an index of cleared and summarised parts built from tool results, and `recall`/search to read the originals.
2. **Per project:** read the folder's `AGENTS.md` into the prompt (the `wifi` folder already keeps `AGENTS.md`, `STATE.md`, `MISTAKES.md`); SHIELD's own project notes kept in its app data by project folder, not in the user's repo unless asked.
3. **Per user:** preferences and corrections learned across chats, in app data.
4. **Learning in the background,** Codex-style, with the local model while it is loaded and idle (never loading one for it - the GPU is shared): extract from finished conversations, consolidate into the notes with an index, prune what goes unused. Memories are data, not instructions (they can come from web pages and tool output), cite their source conversation, and the user can see, edit and delete them.

**Verification:** 749 tests across 53 files, among them real PowerShell runs (output and folder, exit codes, no waiting for input, timeout, Stop) and the filesystem server's own `applyFileEdits` missing on `&quot;` and matching once decoded; `npm run build`, ESLint (outside `tmp/`) and Prettier clean. `tsc` covers only `src/`, so the changed `electron/` files were type-checked on their own.

---

## Update — 2026-09-27: Code view, separate from Chat (`25a7f65`, `a837dfe`)

The sidebar's **Code** entry is live. Chat stays plain conversation for the user's other plans; Code is where the agent work lives. Decided with the user: switching views never loads a model (Code shows a hint instead), and existing conversations stay in Chat.

- **Sessions.** A conversation has a `kind` (`"chat" | "code"`; none means chat) and a code session its `folder` (`types/conversation.ts`, `electron.d.ts`, saved as-is; the list metadata carries both, `ConversationStorageService`). `lib/sessions.ts`: `viewKind`, `kindOf`, `ofKind`, `folderName`, `isCodingModel`. Each view lists only its kind ("Chats" / "Sessions"); opening Chat or Code goes to that kind's latest conversation or starts one (`App.tsx` effect). "New session" asks for a folder first (`handleNewSession`); a session opened without one shows "Choose a project folder".
- **Tool scope follows the open conversation**, not the view (a look at the library mid-session changes nothing): `resolveToolPolicy({ fileTools })` — a chat offers only the web tools, and calls a file tool as not permitted; the system prompt gets no allowed paths and, without web search, no tool section; the `[Current folder]` note and the "use your file tools" first attempt and refusal retry happen only in code sessions (`messageHandler.ts`).
- **The folder.** Opening a code session applies its folder (`useApplyWorkspace`: restart the filesystem server, then save `mcp.workspaceFolder`), so the global setting now follows the open session. Sending (and the empty-state prompts) waits until the folder is in effect — in the second the server restarts, a message could have run tools in the previous session's folder. The input's folder chip (`WorkspaceSelector`) shows the session's folder and can move the session to another; Chat has no chip.
- **Model hint** (`CodeModelHint`): a chat model in a code session gets "… is made for chat; Qwen3 Coder 30B is better at code" with a Load button (catalog roles `coding`/`agent`).
- Templates are chat personas: the template button shows in Chat only.

**Verification:** 599 tests across 48 files (new: tool scope, folder note never in a chat, session helpers, model hint); `npm run build`, ESLint and Prettier clean. Used by the user the same evening: a Code session on a test project (`Continue\wifi`, PowerShell scripts) with Qwen3-Coder, "look for bugs", then "apply these fixes".

Fixed after that test (`a837dfe`):

- **Colours** (`ChatMessage.tsx`): the model's answer in the foreground colour, the user's own messages muted; thinking and tool work were already muted.
- **Rule 7, "make the change"** (`systemPrompts.ts`, both the XML and the native prompt): asked for the quickest fixes, Qwen answered with 2,700 characters of code blocks to paste and changed nothing. With the rule it edited the files.
- **A repeated failed call is reported as failed** (`repeatNote` in `mcpMessageHandler.ts`). Qwen's second `edit_file` found no exact match; it sent the identical call again, was told "use the result you already have", and told the user both fixes were applied. The next turn it wrote that false fix into the project's `FIXES.md`. Now a repeat of a failed call quotes the error and says to change the call or tell the user the change was not made; a declined call says not to try again; a Plan/Read-only refusal repeats the refusal. Successful repeats are unchanged. Not yet seen live (no repeat came up after it went in). 602 tests.
- **Why that edit failed:** Qwen wrote the file's `"` as `&quot;` in `oldText` (it treats `<arguments>` as XML), so the text could not match; its first edit, written with `\"`, worked. Fixed 2026-09-28 in the working tree — see the terminal update above.
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
