# SHIELD — Session Handoff

**Last session:** 2026-11-04 → 05 on Linux (`fix/qwen38-8gb`): Qwen3.8 27B on the 8 GB card, see the first update. Before that, 2026-11-03 on Windows (`main`): a declutter pass. PR #49 removed unused files and packages; the docs pass moved finished plans, research and old feature write-ups to [archive/](./archive/). Before that, 2026-10-30 → 11-02 (PRs #47, #48), 2026-10-30 (PR #46), 2026-10-27 → 30 on Linux and 2026-10-26 → 29 on Windows.
**Branches (2026-11-03):** `main` is the only long-lived branch.
**Tests:** 1370 passing (2026-11-06); run `npx vitest run`, `npx tsc --noEmit`. `prettier --check` flags `src/components/ui/button.tsx` and `scripts/bench/mcp.ts`, already unformatted: do not run `prettier --write` over whole folders.

**Tested in the app with (2026-10-20):** Bonsai 27B Q1_0 on an RTX 2070 SUPER 8 GB (Ubuntu 26.04), SHIELD-managed Prism llama-server at 32K, ~19 tok/s. Earlier sessions: Qwen3-Coder-30B and Gemma 4 12B on Windows.

Read this first: the updates below, newest first, then [SHIELD_AGENT_ARCHITECTURE.md](./SHIELD_AGENT_ARCHITECTURE.md) (§21 agent teams, §17 decision log, §13 priorities, §20 evidence) and [testing/AGENT_BENCHMARK.md](./testing/AGENT_BENCHMARK.md). Updates from 2026-10-24 and earlier (the hang hunt, team fixes, the Linux port, agent teams v1, and the September work: Code view, terminal, memory, Gemma, model library) are in [archive/HANDOFF_HISTORY.md](./archive/HANDOFF_HISTORY.md); sections below that name them ("Update — 2026-10-23 → 24" and earlier) mean that file.

## Update — 2026-11-06: native tool history (branch `feat/qwen38-native-history`, on top of PR #56, start here)

PR #56 (`fix/qwen38-8gb`) is open; all 4 CI checks pass. This branch builds on it.

- **Native history (`llamaServer/nativeHistory.ts`):** for native-call models the request sends past calls as `tool_calls` and results as `tool` messages, and the template renders them in its trained form (checked with `/apply-template`). The stored history stays in SHIELD's text form.
  - Interleaved A/B, Qwen3.8 IQ1_M at 12K, edit task: both 6 of 6. Native ~53 s and 2 rounds in 5 of 6 runs, 1 failed call in all. Text ~115 s and 3-7 rounds, 9 failed calls (it kept trying `write_file` first).
  - Write task with native history: Qwen 4 of 4.
- **Paths cleaned (`cleanPaths`, utils/schemaArguments.ts):** applies to `path`, `source`, `destination` and `paths`.
  - With native history, IQ1_M ended paths with `</`, `</}` or `</content>`. Everything from `</` is cut off.
  - With thinking on, it ended them with a space (`.md `), and the read failed as "no such file". Outer whitespace is trimmed.
- **Bonsai 2 27B:**
  - At 24K with a 16-bit cache it no longer loads on this machine, on either build (its 1,536 MB cache didn't fit).
  - Now 32K with an 8-bit cache and CUDA graphs off on b12128: recall exact from a 16,391-token prompt, 7.34 GB bare peak, ~41 tok/s. Edit 3 of 3 (~40 s).
  - Write: 1 of 2 looped (batteries by type up to the 8,192-token limit), so `presencePenalty: 1.5` was added. Since then, 4 of 4 writes (62-82 s) and 2 of 2 edits (~47 s), with no reply at the limit.
- **Thinking for Qwen IQ1_M at 12K: now low, capped at 1,024 tokens.**
  - Uncapped low first looked worse: edits 3 of 4 at 96-249 s, writes 2 of 2 at 116-229 s. Its one failure was the trailing-space path, which `cleanPaths` now fixes.
  - New code task in `compare.mjs` (`ONLY=code`): write `count_items.py`, which prints each `### ` heading with its `- ` item count. The harness runs it with `python3 -I` against the right counts (35, 27, 33).
  - Code task: thinking off 1 of 3 (it rewrote the script in the visible reply up to six times, once inside `write_file`'s content, 19K characters that don't parse); low uncapped 2 of 3 at 200-293 s (one still thinking at 5 minutes); **low capped at 1,024: 3 of 3 at 96-281 s**.
  - With the cap: edits 3 of 3 at 76-168 s, writes 2 of 2 at 192-214 s. Slower than off (edits ~53 s), but the only setting that passes all three tasks.
  - Bonsai 2 27B passed the code task 2 of 2 at 56-60 s, 1 round each.
- **Qwen3.8 IQ1_M has a Caution badge in the library** (new `ModelFile.caution`, shown when that file is the one picked for the GPU). Its note points to Bonsai 2 27B on 8 GB. It still shows Recommended too; whether Bonsai 2 should be the 8 GB recommendation is open.
- **RAM notice fixed for fixed placements:** `serverMemoryNeed` assumed `--fit`'s 3 GB GPU reserve, so the library said Qwen3.8 IQ1_M kept ~3 GB in RAM while it ran fully on the GPU. A file whose `serverPlacement` puts every layer on the GPU now needs no RAM for weights.
- **Bonsai 2 27B, harder tasks** (new in `compare.mjs`: `ONLY=fix`, two seeded bugs in `kit_tool.py`; `ONLY=split`, move `parse_items` to `md_sections.py` and add `--total`; both checked by running the code with `python3 -E -s`, since `-I` blocks the local import):
  - Uncapped (medium thinking): fix 2 of 2 at 188-279 s. In one run its thinking looped twice, reworded each time, so the exact-repeat guard took 60-110 s to stop each: 174 of 279 s.
  - **`reasoningBudget: 1536` added:** fix 3 of 3 at 66-148 s, split 1 of 1 (70 s), code 1 of 1 (68 s). Longest generation ~1,600 tokens. One looped thought was still caught by the guard, at ~1,200 tokens.
  - It looked for a file that is in the project folder (`search_files`, then `list_directory`) before reading it.
- **The session folder's files are in a Code session's prompt** (`listingSection`, config/agentsMd.ts): the top level and one level in, at most 40 lines (`PROMPT_TREE_LINES`, ~94 tokens for the test project). Read with AGENTS.md (`project:instructions` now returns `listing`) but kept for the session: the store re-reads AGENTS.md after each message, and a listing that changed the prompt every turn would make the server process the whole conversation again.
- **Bonsai 2 27B reliability sweep (current settings, listing in):** edit 2/2, write 2/2, code 2/2, fix 2/2, split 2/2. One failed call in the 10, recovered (a typo'd home folder, `buqqcz`).
  - New tasks in `compare.mjs`: `ONLY=mid` adds one item as the last line of the 3-Day kit's **Additional Tools** list, checked against the exact expected file (look-alike lists sit next to it); `ONLY=multi` sends three messages in one session (the script, then `--json`, then a README; `prompts` in the task, `TASK_MIN` each). `sweep.sh "<model>" <prefix> task:count...` runs a set and prints one line per run.
  - mid: 3 of 3 exact, 2 rounds each (read, then one `edit_file`).
  - multi with "Do not run it": 0 of 2. Both scripts were right in shape and wrong on argv by one (`main(sys.argv[1:])` then `argv[1]`; `parse_args(sys.argv)`); the README was right both times.
  - multi with running allowed (`allowRun`: its run_command prompts are approved even with `DENY=1`): **3 of 3** at 167-223 s, 6-8 rounds; each ran the script and fixed it before answering. One `edit_file` miss on a docstring, recovered with `write_file`. So for code, letting the model run it is what makes it reliable; nothing in SHIELD needed changing.
  - Duplicate-text edits (new tasks `dedupe`: remove the second of two identical **Pet Supplies** blocks in the 72-hour kit; `rename`: change both exact `**Tools**` lines to `**Tools & Gear**` but not **Additional Tools**). Both are checked against the exact expected file; `sameText` also compares with blank lines ignored.
    - rename: **3 of 3 exact**, 62-70 s, one `edit_file` each. Each then tried a `run_command` to check its work, which `DENY=1` refused.
    - dedupe: **5 of 6 exact, 6 of 6 same text**, 54-80 s. Each made its `oldText` unique by including the `---` divider that follows the second copy. The miss (`dd-dedupe1`) replaced `\n<block>\n\n---` with `---`, which dropped the blank line before the divider; the page renders the same. One run (`dd2-dedupe2`) made a correct edit, then wasted 3 rounds checking it: `read_text_file` with both `head` and `tail`, and `search_files` on a file instead of a folder.
  - Cross-file tasks (`xwater`: read the UK Be Ready water amount from the research file, add it as the last item of the 72-hour kit's **Water** list, one of three **Water** lists; `xtable`: append a "## Kit Sizes" table to the research file with each kit's item count from the checklist, 35/27/33). **6 of 6.** xwater: 3 of 3 exact at 44-58 s, 3 rounds (read both, one `edit_file`). xtable: 3 of 3 with all counts right at 132-175 s; each tried `run_command` to count, was denied, and counted by hand correctly.
  - Failed calls across all 102 saved Bonsai 2 runs (denials left out): `edit_file` with an `oldText` that is not in the file is the most common, 8 or more, nearly all with markdown marks dropped (`**`, `- `) from the Pet Supplies lines. Next: `write_file` on an existing file, refused by the guard (5, always recovered); failed web page fetches (7); `edit_file` where `oldText` appears twice (2, refused, as intended); `edits[0].oldText` missing (2); and one each of a cut-off write, a wrong file name, `head`+`tail`, and `search_files` on a file.
    - The missed-`oldText` errors already carry the file's closest lines (`closestLinesHint`, since 2026-10-28), and the model copies them on its next call; most of those misses were older runs (Bonsai 27B, other models). Recent Bonsai 2 runs had one, recovered.
    - The two `edits[0].oldText` failures were one edit sent in halves, `[{newText}, {oldText}]`, twice in a row (`research-after2`); the model then gave up on `edit_file` for a Python script. **`joinSplitEdits`** (utils/schemaArguments.ts, applied in useMCPDialogs.ts after `cleanPaths`) now joins a list made wholly of such halves, each pair one of each, into whole edits. Unit-tested; the shape did not come up in the retest.
  - Retest on a fresh build (`fx-*`): edit 3, mid 2, dedupe 2, xwater 2: **9 of 9 exact or passing, 0 failed calls**, 42-64 s, 2-3 rounds each.
  - Bonsai 2, 5 runs with the listing: no `search_files` or `list_directory` call in any. Fix 3 of 3 at 96-167 s, 4-6 rounds (it reads the checklist to see the expected output and re-reads the script after editing, which is fair). Split 1 of 1 at 42 s, 3 rounds; edit 1 of 1 at 44 s, 3 rounds.
- **Announced step, no call, mid-turn (`endsByAnnouncing`, handlers/mcpRetryPolicy.ts):** the act-now retry only checked the first reply. After a tool result, IQ1_M ended turns on "I'll append the new section at the end of the file…" and on long plans ending "Let me now create the content", with nothing done. The tool loop now sends the act-now note once per turn when a reply's last sentence names a tool step (read, append, edit…); "I'll let the user know" and "Let me know if…" are left alone. Bursts after it: edits 4 of 4 at 52-54 s, 2 rounds, no failed calls; the retry was not needed in those runs, so it is unit-tested only.
- **Tests:** 1,370 passing.

## Update — 2026-11-04 → 05: Qwen3.8 27B on 8 GB (branch `fix/qwen38-8gb`)

The 27B in IQ1_M, on the RTX 2070 SUPER 8 GB with the old Prism build (b1-73bfe6c), thinking off, Code mode, Auto. **Edit task 13 of 16 passed, write task 8 of 9, no file damaged.** On 2026-11-04 it was 0 of 3 edits at 0.6-0.9 tok/s. Tested in short bursts: one task, 5 minutes, `DENY=1 ONLY=edit TASK_MIN=5 node tmp/ui-check/compare.mjs "Qwen3.8 27B" <tag>`. With `DENY=1` the script clicks Deny: in Auto, the only prompts are the shrink guard and `run_command`.

- **Fit and speed:**
  - `nominalGB` rounds VRAM and RAM: the card read as 7.6 GB and 16 GB RAM as 15.5, which failed the minimums.
  - Each catalog file can set `serverPlacement`. IQ1_M puts all layers on the GPU, about 17-40 tok/s against 0.6-0.9 with `--fit on`.
  - IQ2_XXS ran out of memory at 8k, so it is 10 GB+.
- **Thinking:**
  - Each catalog file can set `reasoningEffort` ("none" = thinking off) and `reasoningBudget` (`--reasoning-budget`, plus a message when it runs out).
  - IQ1_M: medium thinking used the whole 8,192-token reply limit on an edit. Thinking off passed 4 of 5; capped at 1,536 tokens, 2 of 3, slower.
- **Sampling:** `presencePenalty` (1.5 for Qwen3.8, Qwen's non-thinking value) stopped long values from looping. The GGUF's own `general.sampling` takes precedence over the catalog.
- **Calls that ran on (root cause):** llama-server ends a Qwen value only at "\n</parameter>", and IQ1_M often leaves out the line break. The value then runs through the rest of the reply. Fixes, in `toolCallParsing.ts` and `nativeCalls.ts`:
  - The value is cut at `</parameter>`. The same call's later parameters are kept, and calls after it are recovered.
  - Calls after a result the model invented ("You executed 1 tool call(s)…") are dropped. The stream stops there, both in call arguments and in plain text.
  - History gets the repaired calls.
  - Recovered values are converted to the types the tool's schema asks for (`utils/schemaArguments.ts`).
  - `<function_calls>` JSON is parsed.
- **Files:**
  - New SHIELD tool `append_file` (`electron/services/appendFile.ts`, next to the Recycle Bin delete). It refuses text that repeats the file's start. The allowlist migration adds it to untouched default lists.
  - A resent `write_file` under 90% of the file's size asks the user, even in Auto. IQ1_M had cut a 6,101-character file to 1,350.
  - A truncated read names the exact `tail` read. The rewrite refusal names `append_file`.
- **Replies with nothing done:**
  - A reply that only announces an action ("I'll add…"), or is only a path, is asked once more for the call.
  - An empty reply from SHIELD's own server is sent once more with thinking off. It rescued 2 of 2 writes.
  - A chat is now saved when a reply fails. Before, it vanished from the list.
- **Research (model card, harness write-ups):**
  - Non-thinking sampler: 0.7 / 0.8 / 20 / presence 1.5.
  - `preserve_thinking` is on by default. Harnesses that send `reasoning_content` back scored better.
  - **Not done yet:** SHIELD sends history as text in its own `<tool_call><tool>` form, with no reasoning. A native `tool_calls`/`tool` history is the next candidate.
- **Later on 2026-11-05 (after `d588f73`):**
  - **Prism b12128 with `GGML_CUDA_DISABLE_GRAPHS=1`:** no GPU memory crash in 8 of 8 runs; it was 3 of 7 without it. At 8K, edits passed only 3 of 8. Twice the model wrote a call in a made-up text form (`<file>…</file></function>`, `<file_read>…`) that the grammar never caught. The old build passed 3 of 4 the same evening, 16 of 20 in all. Later that night, with the changes below, b12128 at 12K passed 7 of 8.
  - **Prompts over the window (old build too):** the estimate left out the native tool definitions, which are sent outside the messages. After a summary the next request was refused (9,351 of 8,192 tokens) and the task ended. Now they are counted, in the estimate and in the summary's target. A refusal (`exceed_context_size_error`) is retried once from the server's own count, with the latest exchange's tool payloads cleared too: a 5,360-character read and a 5,763-character write had kept the same prompt over.
  - **Escaped calls inside a run-on value:** the value can hold calls in SHIELD's own form, escaped. `unswallowQwenCalls` ended the arguments at the first `</arguments>`, which was inside the value. The rest was read as calls of its own, with paths starting with a literal `\n`. It now ends them where their JSON ends.
- **2026-11-05 night → 06: a bigger window and a smaller fixed prompt.** **Edit task 7 of 8 at 12K on b12128, no file damaged, no out-of-memory.**
  - **8-bit KV cache:** the new `ServerPlacement.kvCacheType` (`--cache-type-k/-v q8_0`) halves the cache. A fact in the middle of 13,000 tokens of code was recalled exactly at 8K, 16K and 18K on b12128. On the old Bonsai build (b1-73bfe6c) it fails with "unspecified launch failure" once the window is full, so it needs b12128, the runtime installer's build.
  - **CUDA graphs:** the new `ServerPlacement.cudaGraphs: false` sets `GGML_CUDA_DISABLE_GRAPHS=1` for the server only.
  - **The window:** IQ1_M now loads at 12K (the new per-file `contextSize`; the sized context plan now offers the catalog's own size too) with 256-token batches. Bare-server peaks: 12K/256 7,394 MiB, 12K/512 7,480, 16K/256 7,532, 16K/512 7,616. SHIELD's own window adds ~145 MiB on the GPU. 16K/512 peaked at 7,761 MiB in the app and ran out of memory on the first prompt in 4 of 12 runs; 12K/256 peaked at 7,483-7,536 MiB in 8 of 8.
  - **Vision:** nothing to remove. The vision encoder is a separate `mmproj` file, and SHIELD never passes `--mmproj`.
  - **Fixed prompt, measured from the request:** **4,742 tokens before**, 58% of 8K, against the 60% at which making room starts. The earlier "~3,100" was a later request. 22 tools came to 14,377 characters and the system prompt to 4,220. **Now 3,581 tokens**, 29% of 12K: 19 tools and 9,430 characters, and the system prompt is 3,619 characters.
    - For native-call models (`openAiTools`), `read_file`, `read_media_file` and `list_directory_with_sizes` are no longer sent. The filesystem server's tools have one-line descriptions, and `$schema` is dropped. The policy still decides any call as before.
    - `buildSystemPrompt` drops the generic Complex Reasoning, Code Generation and Structured Output sections for them, plus the Tool Usage line the grammar enforces.
    - Edits got faster: often 2 rounds, ~60 s, against 100-150 s.
  - **Rewrite guard by lines, not size (`utils/keptLines.ts`):** a resent `write_file` that keeps under 90% of the file's lines asks the user. IQ1_M had retyped a 6,101-character file at 6,500 characters, which passed the size check and lost lines.
  - **Same reply twice:** a reply with a call that is word for word the last one is sent once more at temperature +0.4. IQ1_M had sent the same 435 characters four times until the loop guard stopped it.
- **Open:**
  - A long reply that plans the edit in text and stops without a call is not retried. The act-now retry takes only short ones.
  - Now and then the model writes a call in a made-up text form (`<file>…</function>`, a bare `</parameter></function></tool_call>`), with 0 rounds. That was 1 of 15 tonight.
  - Bonsai 2 27B on b12128 with these settings is unchecked. Its entry is unchanged.
  - Gemma 4 12B on 8 GB is unmeasured; the file is not downloaded. The catalog's Q4_K_M is 7.12 GB, which leaves little for context. IQ4_XS (6.38 GB) or UD-Q3_K_XL (6.02 GB) are the likely 8 GB files.
  - The model's text is still 1-bit quality: made-up phone numbers, "NASSA".

## Update — 2026-11-03: declutter, tiers 1 to 4, and a runtime installer

- **Tier 1 (PR #49, `f9de969`):** removed five source files nothing imported, stale root files, four old Playwright UI scripts and eight unused packages (`date-fns`, `@radix-ui/react-tooltip`, `concurrently`, `@tailwindcss/upgrade`, `@huggingface/hub`, `postcss`, `autoprefixer`, `playwright`); dropped `postcss.config.js` (Tailwind runs through `@tailwindcss/vite`); release notes moved to `docs/releases/`.
- **Tier 2 (docs):** plans, research, the roadmap and 2025 feature docs moved to `docs/archive/` with every link updated; `docs/README.md` rewritten as a short index; this handoff trimmed, older updates in `archive/HANDOFF_HISTORY.md`.
- **Tier 3 (UI, PR #51):** the composer's picker is the only model picker (the sidebar's Model section is gone; the composer carries its status light); the header no longer repeats the model name and drops the MCP status icon; tags (saved, shown nowhere) and templates are removed. Checked in a browser with the preload APIs stubbed, **not yet in the real app with a model loading**.
- **Runtime installer (`feat/runtime-installer`):** Settings › Runtime installs PrismML's llama.cpp build on request (`electron/services/runtime/`): picks CUDA 13 / CUDA 12.4 / Vulkan / CPU from the NVIDIA driver, checks GitHub's sha256, unpacks into `<userData>/runtime/<tag>-<variant>`, runs `--version` and `--help` before activating, keeps the previous build for a rollback. Lookup order: `SHIELD_LLAMA_SERVER`, the installed build, the Bonsai demo folder. Tested end to end with the real b12128 Vulkan build (28.7 MB); **the 0.59 GB CUDA install has not been run**.
- **Tier 4 (`feat/one-engine`):** every local model runs on llama-server; the in-process engine is gone (`LlamaService`, `NativeChatSession`, the Gemma 4 chat wrapper and protocol, `nativeTools`, the renderer's `toolResults` plumbing, the node-only context plan and the Speculative Decoding switch; llama-server always drafts with ngram-mod). `localModels.ts` keeps file lookup, hardware info and the node-llama-cpp bindings for GGUF reading. **GPU check (2026-11-03, `scripts/bench/gemma-smoke.ts`, Bonsai-demo server b10685):** Gemma-4-12B (the user's OBLITERATED Q4_K_M) 8/8 at ~42 tok/s; Qwen3.8-27B UD-Q3_K_XL 8/8 at 4-5 tok/s (spills to RAM). Gemma E4B not tried (not on disk). Not yet seen in the app window.

---

## Update — 2026-10-30 → 11-02: a per-model zero-retention opt-out, and a caution when switching models (start here)

Everything is on `main` (`47aada9`). Two features landed from GitHub, each on its own branch and PR, both fully green (Test Suite, Code Quality, Automated PR Review, File Size Analysis): **#47** (`30088a1`, commit `6fb2101`) and **#48** (`47aada9`, commit `47f2ac5`). Every feature branch is deleted; `main` is the only branch left. **Tests 1330 → 1349.**

### #47 — one hosted model may be used without zero-data retention (`6fb2101`)

A provider often has models with **no zero-retention route** (frequently the wider, less censored ones). SHIELD blocked every one of them until the user turned the requirement off for the **whole provider**, from Settings. Now:

- The **composer has a model picker**, next to the Team toggle (Chat and Code). Both it and the sidebar show one shared list (`components/shell/ModelPickerMenu.tsx`).
- A hosted model with no such route carries its own **Allow** switch; it is **remembered per model** and leaves the requirement in place for the rest of the provider.
- An allowed model's endpoint is attached with `requireZdr: false`, so the request asks for nothing and the reply's badge says **"keeps data"**, not "zero retention". Settings › Providers shows "N models allowed without it".
- Data: `ProviderConfig.allowNoZdr`, `ProviderStore.setAllowedModel`, IPC `providers:allow-model`; `ModelRuntime.loadRemote` skips `zdrBlock` when the model is allowed; `cloudModels.optionFor` carries `noZdrRoute` / `zdrAllowed`.
- The privacy-first default is unchanged (Experiential still requires it; the `custom` preset was never affected).

**Not verified:** a real non-zero-retention model through the app (built, unit-tested and tried by hand in the dev build; no such model was actually run).

### #48 — switching models in a used chat now asks, and offers a handoff (`47f2ac5`)

The user asked whether switching models mid-chat degrades output, and to confirm before building. **It does, and it is not "the new model is worse" — it is a handoff context mismatch.** The evidence gathered (2026-11-02):

- [arXiv 2603.03111](https://arxiv.org/html/2603.03111v1) "Performance Drift from Model Switching in Multi-Turn LLM Systems": a **single-turn** handoff swings strict success by **−8 to +13 points** and ±4 F1, "comparable to the no-switch gap between common model tiers". **Within-family ≈ zero; cross-family is where it bites.** Their own suggested mitigation is a short handoff briefing.
- [arXiv 2610.19712](https://arxiv.org/html/2610.19712) "New Model, Old Habits": the recipient adopts the reasoning/action patterns of whoever wrote the history — strongest with raw-history transfer, **strongly reduced by summarization**.
- [arXiv 2602.24287](https://huggingface.co/papers/2602.24287) "Do LLMs Benefit From Their Own Words?": models over-condition on prior assistant turns, propagating errors and style artifacts.
- [usepoly.co](https://usepoly.co/switch-ai-models-mid-conversation): same-lab switches re-read the transcript; **cross-lab drops the old model's hidden reasoning**, and a smaller context window forces loss.
- [OpenAI Codex #19877](https://github.com/openai/codex/issues/19877) and [hermes-agent #88087](https://github.com/NousResearch/hermes-agent/issues/88087): a switch changes the prompt prefix, so local llama.cpp **reprocesses the whole history** (408 s on a ~45k-token chat) and the first reply is slower.
- [IJCAI 2026 semantic inertia](https://ijcai.org/proceedings/2026/0088.pdf): prompt-level "reset" instructions are "unreliable and often counter-productive" — so a fresh session, not a note, is the fix.

What was built:

- Picking a **different** model in a chat that already has messages opens `components/chat/SwitchModelDialog.tsx`: **Hand off & start new session** (recommended), **Switch anyway**, Cancel. The guard (`selectModel` in `App.tsx`) covers the sidebar picker, the composer picker, the Library and the Code hint; re-selecting the current model is silent.
- **The handoff** (`handlers/handoff.ts`): the parting model writes a short briefing (GOAL / DONE / DECIDED / OPEN / CAUTION) in a **throwaway agent session** that never touches the chat's history; a **mechanical** briefing (goal, files touched, failed steps, what is open) stands in if the model errors or answers with nothing. A new session then opens on the new model, same kind/folder/project, with the briefing **in the box, ready to send**.
- **Not auto-sent, on purpose:** it would otherwise cost a generation the user did not ask for. Easy to change if wanted.
- 9 new tests. **Not yet seen:** a live switch-and-handoff in the app.

### What carries over

- The hosted-model todos stand (native function calling for a hosted provider; Team on a hosted model; more call shapes are a long tail — see "Update — 2026-10-26 → 29").
- The caution's copy and the prefill-vs-send choice are worth a second look after real use.
- **Everything here is on `main`; nothing is uncommitted.**

---

## Update — 2026-10-30: PR #46 merged; the hosted model's other tool-call shapes (start here)

Everything is on `main` now. `feat/remote-providers` (the other PC's branch, PR #46) was pushed its last two commits and **merged to `main` from GitHub as `0aba405`**; `feat/model-library` was already in. Both branches are deleted; `main` is the only branch left (local and remote). All four PR checks passed (Test Suite, Code Quality, Automated PR Review, File Size Analysis).

### The fix (`ef4d086`) — five call shapes the hosted model wrote

The user ran a real Code session on `remote:…:deepseek-v4.1-flash-1017` (Experiential, Windows) about their Chromecast work. Every reply looked broken: raw `<tool_call>` bodies sat in the chat, several calls failed with "no tool name could be read", and every paragraph ended with a stray `</tool_call>`.

Read from the saved chat (`%APPDATA%\shield2.0\conversations\conv-1793322197763-*.json`, 82 messages). In one session the model wrote **five** call shapes other than SHIELD's; each either ran the wrong tool, was dropped (its whole JSON body — with literal `\n` — shown to the user as text), or was sent back unreadable while its arguments were thrown away. None of it was "thinking": the hosted reply's `reasoning_content` is still dropped, not shown (`LlamaServerProvider.chat` reads it only for the repetition guard).

| Shape                                                                              | Before                                              | Now                                                               |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| DSML `<invoke name="filesystem">` + `<parameter name="list_directory_with_sizes">` | ran `filesystem.filesystem`                         | reads the server and the tool (`dsml.ts`, `splitToolCallName`)    |
| `<tool_call name="write_file">` (the tool as an attribute, no `<tool>` element)    | dropped; its JSON body shown as text                | normalised to `<server>/<tool>`, on the right server for the tool |
| `<tool>run_command</arguments>` then `<arguments>…`                                | the call closed early; its arguments were discarded | `</arguments>` read as `</tool>`                                  |
| `<tool>run_command</tool_call>` then `<arguments>…`                                | the same                                            | `</tool_call>` read as `</tool>`                                  |
| `<server>terminal</server>` then `<run_command</tool_call>` and the arguments      | unreadable                                          | the bare name read as the tool                                    |
| an extra trailing `</tool_call>`                                                   | painted onto the paragraph                          | stripped                                                          |

- One shared `normaliseCallMarkup` (`toolCallParsing.ts`) feeds parsing, rendering _and_ the live preview, so the three agree; `stripToolCallMarkup` drops the stray closer too. Built from the captured output; 9 new tests (`dsml.test.ts`, `toolCallParsing.test.ts`). Tests 1326 → 1335.
- **Verified:** the whole 82-message saved conversation was replayed through the new parser — every call now parses. One is still unreadable (a bare `<run_command</tool_call>` with no arguments at all), which is correctly sent back to the model, and its markup no longer leaks into the chat. `npx tsc --noEmit`, `eslint src`, `prettier --check` on the touched files all clean.
- **Not yet seen:** a fresh live hosted turn in the running app (a dev build on `main` was started; the saved chat and the tests are the evidence).

### What carries over

The hosted-model work still has its open todos from "Update — 2026-10-26 → 29" below (native function calling for hosted models; Team on a hosted model; the DSML shapes beyond these five are a long tail). The remote test layout changed: the endpoint tests moved to `src/services/remote/remoteEndpoint.test.ts` and the rest to `remoteModels.test.ts` (both under the 300-line limit).

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

## Update — 2026-10-27 → 28: Bonsai 27B in a real Code session; seven fixes; models to compare before deciding (start here)

The user used the installed AppImage (`~/Applications/SHIELD.AppImage`) for a real task: a Code session in `~/Desktop/Projects/Prepping`, Bonsai 27B Q1_0, research disaster preparedness and write `Preparedness_Checklists.md`. Each failure was read from the saved chat (`~/.config/shield2.0/conversations/`) and fixed; the AppImage was rebuilt and replaced after each fix (`npm run build && npx electron-builder --linux AppImage --config electron-builder.yml`, then copy `release/0.1.5/SHIELD-0.1.5.AppImage` over it; the Oct 26 build is kept as `SHIELD.AppImage.bak-2026-10-26`). **Restarting SHIELD does not pick up source changes: the installed AppImage has to be rebuilt.**

### Commits (local, not pushed)

- `037a29e` **a reply gets at least 8,192 tokens** (`replyTokenLimit`, `LlamaServerProvider`): the user's Max Tokens was the default 2,048; Bonsai thought until the limit and wrote nothing, or was cut off inside a `write_file`. **Widened in `aad8dbe`:** first only with thinking on, but a reply resent with thinking off (the thinking-loop guard, `db72362`) still had 2,048, and a 9.6k-character `write_file` stopped at exactly 2,048 tokens; now every chat reply (`MIN_REPLY_TOKENS`).
- `babb618` **no fixed round cap in a solo turn; a progress check every 10 rounds** (`progressCheckEvery`, `PROGRESS_MIN_STEPS` = 3 new successful calls) and a **Continue button** on the notice that ended a turn (`Message.resumable`; round limit, no progress, a repeated step). Team mode keeps its cap.
- `d871e98` **the loop guard no longer acts as Stop**: Bonsai wrote "- [ ] Trash bags" until the guard tripped; the turn ended and its note sat inside the hidden tool call, so the user saw nothing. A call it cuts off now fails back to the model ("began repeating the same lines … smaller steps").
- `da34536` **a string left open in a finished call is closed** (`closeOpenBrackets({ closeString })`, only inside a whole `<tool_call>` block, not on the stray-quote guesses): three `write_file` calls ended `…\n</arguments>` with no `"}`.
- `ec939d3` **the chat column narrows with the window** (`min-w-0` on `<main>`, `shrink-0` on the sidebar): it kept its widest line's width and was cut off on the right (141 px past a 900 px window, reproduced in the browser preview with stubbed `window.*` APIs).
- `1eaa7f9` **`newText`/`oldText` beside `edits` go back into the one edit; `</tool>` after the arguments closes a call** (was read as a reply cut off at the length limit); **a reply holding SHIELD's "removed from your context" note runs no call** (`COPIED_NOTE_ERROR_PREFIX`): Bonsai copied a shortened history call as its next `write_file`, path only.
- `220364c` **a missed `edit_file` shows the file's closest lines** (`src/utils/closestLines.ts`, Dice over character pairs on oldText's longest line; `readFile` prop, `handlers/projectFile.ts`, solo and team): Bonsai built oldText from memory (a heading the file never had; a row with an extra " |").
- Tests 1177 → 1216.

### What the runs showed (Bonsai 27B Q1_0, 8 GB 2070 SUPER)

- **Good:** 15-37 tok/s; research and summaries on topic and organised.
- **Bad: exact format.** Every failure was a malformed call, a different shape each run: unclosed strings, misplaced or missing `newText`, `</tool>`, a copied removal note, oldText from memory, rewriting a whole 6-10k-character file in one call. After all the fixes, the last run still did not write the file (`newText` missing entirely; a shorter rewrite refused by the existing overwrite guard), and answered in chat instead. **`Preparedness_Checklists.md` is unchanged since 2026-10-27 21:53.**
- So patching each new shape is a long tail. Two levers left: **grammar-constrained tool calls** (llama-server forcing calls to the tool's JSON schema, so malformed arguments cannot be written; SHIELD lets the model type calls as text today; effort not yet looked at), and **a more precise model**.

### Next: compare models on the same task before deciding (the user's call, 2026-10-28)

The user chose Bonsai for its very low-bit quants (speed and quality on 8 GB). No decision to drop or keep it until these runs are done. Same task for each, in a fresh Code session on a copy of `Prepping` (reset the files between runs): "add a Long Island, NY section to Preparedness_Checklists.md" (an edit) and "write a new 72-hour kit checklist file" (a write). Record per model: tok/s, rounds, failed calls and their kind, whether the file was really changed (check the file, not the answer), time.

| Model                           | Why                                                                                                             | On disk                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Bonsai-27B Q1_0                 | the baseline from this session                                                                                  | yes                                                                              |
| **Ternary-Bonsai-2-27B PTQ1_0** | newer (2026-09-17), ternary weights: more precise than 1-bit, already in the catalog (8 GB min, 12 recommended) | **no: download**                                                                 |
| Ternary-Bonsai-2-9B PQ2_0       | smaller, faster ternary                                                                                         | yes                                                                              |
| **Qwen3.5-9B Q4_K_M**           | the usual 8 GB pick for tool calling (vendor-reported BFCL-V4 66.1); upstream llama-server                      | **no: not in the catalog yet; check GGUF names and sizes on Hugging Face first** |
| Gemma 4 12B                     | in the catalog; tight on 8 GB, comfortable on the 12 GB 4070; noted for reliable output format                  | check                                                                            |

Not candidates for Code: **LFM3** (Liquid AI, 2026-10-27, six ~2B models; its card says not for agentic coding or multi-step reasoning: a fast chat model at most); Qwen 3.8 has no size under 27B. Fit rules: only models that fit the 8 GB card without spilling into RAM; the 4070 (12 GB) can take the 12 GB-class ones.

Then: keep in the catalog what passes; a Bonsai that still fumbles the format with constrained calls stays for chat only. Grammar-constrained tool calls are worth doing whichever model wins.

### First comparison round (2026-10-28, one run per model; not enough to decide)

**How:** `tmp/ui-check/compare.mjs "<display name>" <tag>` (git-ignored): `npm run build`, then Electron from source with the test profile (`tmp/ui-check/profile`, models symlinked from `~/Desktop/Projects/Bonsai/models`), Auto, Team off, server log on; each task in a new Code session on a fresh copy of `tmp/ui-check/prep-originals` (the real Prepping files); 20-minute cap per task. Results `compare-<tag>.json`, the chat `compare-<tag>-<task>-conv.json`, the written files `compare-<tag>-<task>-*.md`. The tasks name the resources and hazards in the prompt, so no web search is needed. **The user tests on the source build now, not the installed AppImage** (rebuilding it each time was too slow). Downloaded: `Ternary-Bonsai-2-27B-PTQ1_0.gguf` (5.95 GB) and `Qwen3.5-9B-Q4_K_M.gguf` (5.68 GB), symlinked into the test profile and `~/.config/shield2.0/models`.

| Model (8 GB RTX 2070 SUPER) | Edit                                             | Write                 | Speed        | Written file                                                           |
| --------------------------- | ------------------------------------------------ | --------------------- | ------------ | ---------------------------------------------------------------------- |
| Bonsai 27B Q1_0             | pass, 129 s, 1 failed                            | pass, 128 s, 2 failed | 23-37 tok/s  | 30 items, clean                                                        |
| Bonsai 2 27B PTQ1_0         | pass, 62 s, 1 failed                             | pass, 98 s, 0 failed  | 38-39 tok/s  | 76 items, clean                                                        |
| Bonsai 2 9B PQ2_0           | pass, 64 s, 3 failed                             | pass, 56 s, 0 failed  | ~87-92 tok/s | 133 items, 19 duplicate lines, nonsense ("1 gallon of iodine tablets") |
| Qwen3.5 9B Q4_K_M, run 1    | **fail**: 5 calls with broken JSON, turn stopped | pass, 60 s            | -            | -                                                                      |
| Qwen3.5 9B Q4_K_M, run 2    | pass, 34 s, 0 failed                             | pass, 78 s, 0 failed  | ~39 tok/s    | 122 items, clean                                                       |

- **Every model did both tasks at least once**; on 2026-10-27 Bonsai 27B never wrote the file. The fixes above carry most of it (closest lines on a missed edit, the loop guard failing the call instead of the turn).
- **Bonsai 2 27B looks the best Bonsai** (fastest 27B, fewest failures, cleanest file); Bonsai 2 9B is fast but sloppy (chat at most). Qwen3.5 9B: one clean run, one failed run. Run 1's raw calls were lost (a later run cleared the profile's chats; the script now keeps each chat).
- **Next:** two or three more runs per model on both tasks before ranking or removing anything; then look at grammar-constrained tool calls. Gemma 4 12B on the 12 GB 4070 only (7.1 GB file: would spill on 8 GB).

### Rounds 2 and 3 (2026-10-29): three runs per model (four for Qwen)

Same script and tasks (`compare-<tag>-r2`, `-r3`), on the build with `7a8615c`. "Partial": the file was written but the prompt's `- [ ]` checklist format was ignored (tables instead); no failed call.

| Model               | Edit (3 runs)                                                      | Write (3 runs)  | Failed calls, all runs            | Speed       | Time per task |
| ------------------- | ------------------------------------------------------------------ | --------------- | --------------------------------- | ----------- | ------------- |
| **Bonsai 2 27B**    | **3/3**                                                            | **3/3**         | **1** (one JSON)                  | 36-39 tok/s | 50-98 s       |
| Bonsai 27B Q1_0     | 2/3 (r2: 5 failed calls, paused by the progress check at round 10) | 3/3             | 10 (missed edits, loops, cut-off) | 22-37 tok/s | 104-373 s     |
| Bonsai 2 9B         | 3/3                                                                | 2/3 + 1 partial | 6 (missed edits every run)        | 74-92 tok/s | 38-64 s       |
| Qwen3.5 9B (4 runs) | 3/4 (run 1: broken JSON, turn stopped)                             | 3/4 + 1 partial | 6 (all broken JSON)               | ~39 tok/s   | 32-94 s       |

- **Bonsai 2 27B is the clear pick on this card:** all six tasks, one failed call in total, the cleanest files, about 1 minute per task. It supports the user's choice of very low-bit quants: a 27B at 1.58 bits beats a 9B at 4-5 bits here.
- Bonsai 27B Q1_0 works now but is the least reliable and slowest; Bonsai 2 27B replaces it. Bonsai 2 9B is twice as fast but misses edits every run and writes sloppy content (duplicates, wrong units): chat, not Code. Qwen3.5 9B is no faster than Bonsai 2 27B on this card (~39 tok/s) and failed one edit outright.
- **Decided (the user, 2026-10-29): Bonsai 2 27B is the default** (`DEFAULT_MODEL_ID`, was Qwen3-Coder-30B; also the Code-mode suggestion and the recommended Bonsai) **and Bonsai 27B Q1_0 is out of the catalog.** A saved `lastModelId` of `bonsai-27b` falls back to the default (checked in the app with the test profile). Its file stays in `~/Desktop/Projects/Bonsai/models`, not deleted. Still open: server-enforced (grammar-constrained) tool calls, Bonsai 2 27B as a team (untested), and Gemma 4 12B on the 12 GB 4070.

### Summarising every round at 24k (fixed 2026-10-29, the user saw it)

A research turn on Bonsai 2 27B summarised on almost every request and never finished: 10 requests, 3 summaries, 3 clearings, 5 full re-reads of 10-14k tokens (`tmp/before-fix-*.log`). After a summary the history was still ~49% of the 24k window (3.4k-token system prompt 14%, capsule up to 10%, a flat `KEEP_SHARE` 25% kept whole), and one tool result could be 35% of the window, so the next web page passed `COMPACT_AT` (60%) again; each summary changes the system message (the capsule is in it), so the server re-reads the whole prompt. Fix: a summary keeps only what fits under `CLEAR_TO` (40%) beside the system prompt and capsule (`keepCharsFor`, `taskCapsule.ts`: 10-25% of the window), and one tool result is at most `COMPACT_AT - CLEAR_TO` (20%) of the window (`messageHandler.ts`, was 35%). Same kind of task after (`compare.mjs` with `RESEARCH=...`, web search on): **done in 8 minutes**, 21 tool steps, 6 sources read, the section written and the file kept; 1 summary, 6 clearings, 3 re-reads of 8-11k in 15 requests. Test notes: a terminal command's approval button is "Run", not "Allow" (the script now clicks both); web search was off in the test profile (now on, as in the user's).

### Watching the user's own run after the fix (2026-10-29)

The user's Prepping chat on the dev build, watched live (`dev-server.log`, `dev-launch.log`): about 30 requests, 3 summaries, cheap clearings in between, most requests reading a few hundred new tokens; the turn finished with 8 successful edits (24 steps, 5 failed calls) and the file really changed. Two more costs found:

- `edc1cdb` **thinking counted as history:** the window was measured as prompt + completion tokens, and thought (in the completion) is not sent back, so after a thinking reply SHIELD saw it up to 20% fuller than it was and cleared early; now `nextPromptTokens` (prompt + visible reply).
- **Not fixed: thinking loops.** Bonsai 2 27B's thought went in circles three times in this run; the guard resent each with thinking off, and that resend re-reads the whole prompt (~10k tokens, ~25 s: thinking off changes the template's layout). Prism's KNOWN_ISSUES: it loops on some prompts at the default `xhigh`; `reasoning_effort: "medium"` thinks less, about as accurate. **Done (2026-10-29):** catalog `reasoningEffort` (sent with every request that thinks, forked sessions too; `ModelRuntime` → `ServerLoadOptions`), `"medium"` for Bonsai 2 27B. Measured with one planning prompt against a server with this model's flags (`scratchpad effort.py`): default (no effort) thought 2,518 / 3,931 / 7,333 tokens (62 / 94 / 179 s), `xhigh` 1,196 / 3,220 (30 / 78 s), `medium` 1,899 / 2,439 (46 / 59 s) with the fullest answers (~1,300 characters against ~400). Two or three runs each: whether it cuts the loops in real use is still to be seen.
- `07bc28f` **SHIELD's record under a reply** is now a plain line plus one line per failed edit (file name, "(3 tries)"), normal text with an amber bar; it was one long amber sentence repeating full paths (the shortening was Windows-only).

### Server-enforced tool calls (started 2026-10-29; the user's pick for next)

Goal: stop malformed tool calls at the source instead of repairing them (nearly every Bonsai failure so far was a malformed call). **Checkpoint 1, the server (done):** the Prism llama-server (`73bfe6c`, Oct 19) has the newer template-derived chat parser (`common/chat-auto-parser*`, format `peg-native` for Bonsai 2 27B). Sent `tools` (OpenAI schema) with `tool_choice` auto, it builds a **lazy grammar from each tool's JSON schema, switched on at the template's call marker** (`chat-auto-parser-generator.cpp`, `grammar_lazy`/`grammar_triggers`): once the model starts a call it can only write one that fits. Measured (`scratchpad native_tools.py`, streamed like SHIELD, `reasoning_effort` medium): **9 of 9 calls structured and valid** (`delta.tool_calls`): 3 `write_file` with 1.1-4.4k characters of content including quotes and a backslash, 3 `edit_file` with the right `edits` shape, 3 `web_search`; `finish_reason` `tool_calls`, no stray content.

**What SHIELD did before:** tools were described in the system prompt as text (`TOOL_CALLING_PROMPT` + `generateMCPToolPrompt`) and the model wrote `<tool_call><server>…</server><tool>…</tool><arguments>{…}</arguments></tool_call>` as text, which `toolCallParsing.ts` reads and repairs. A native path existed for Gemma 4 on node-llama-cpp only (`usesNativeToolCalling`, `setSystemPrompt(prompt, tools)` → `LlamaService`); `LlamaServerProvider` ignored the tool list.

**Checkpoint 2, built and tried in the app (done).** History question first: with SHIELD's history as it keeps it (calls as XML text, results in a user message), **3 of 3 second-round calls were valid structured edits**, as with the structured form; so the history stays as it is. Also seen once in 18 single-turn requests: an empty reply (no call, no text, finish "length" after 61 s); SHIELD already explains an empty reply.

- Catalog `nativeToolCalls` (Bonsai 2 27B only); `usesNativeToolCalling` also checks it, so the prompt is the native one (`generateNativeToolPrompt`) and the tools go to `setSystemPrompt` → `ModelRuntime` → `LlamaServerProvider.applySystemPrompt(prompt, tools)`.
- The provider sends `tools` (`openAiTools`: plain names, the MCP schema) and **writes the streamed `delta.tool_calls` into the reply as SHIELD's text form as they arrive** (`NativeCallWriter`, `llamaServer/nativeCalls.ts`), so the tool loop, history, clearing, the live preview and the loop guard are unchanged. Forked sessions (team agents) keep the text form for now; the orchestrator gets native calls (untested in a team).
- In the app (`compare.mjs`, Bonsai 2 27B, medium): edit 114 s / 6 steps, write 62 s / 1 step, shopping list 309 s / 15 steps: **0 failed calls** (the text-format runs averaged 1-3 per task), no thinking loops. But the shopping list missed its file name, grouping and pointer line: **the summary cut each request to 300 characters** and the 700-character request lost its second half mid-task. Now the latest request is kept up to 2,000 characters (older ones shown at 300). Rerun: all of it done (`Shopping_List.md`, three groups, subtotals and total, the pointer line), 0 malformed calls (4 page fetches failed at the sites); but 879 s, 45 steps, 4 summaries: it read far more pages than the text-format run (23 steps, 6 min). Watch run length.
- **Checkpoint 3, three rounds each on the edit and write tasks (2026-10-30):** text form (`ternary27`, `-r2`, `-r3`, 2026-10-28) 6/6 passed, **1 failed call** (broken JSON); native (`native-r1..r3`) 6/6 passed, **0 failed calls**, one thinking loop caught. All six edited files clean (one new section each, `compare-*-edit-*.md`). But native took more steps and time: edit 124 s / 6.3 steps on average against 55 s / 3; write 91 s / 3.3 against 89 s / 1.7. The extra steps are re-reads after writing, a `run_command` to check the file, and edits in several pieces; the native prompt (`generateNativeToolPrompt`, written for Gemma) differs from the text one (`TOOL_CALLING_PROMPT` + `generateMCPToolPrompt`), a likely cause.
- **Checkpoint 4, prompt parity (2026-10-30):** the native prompt got the text prompt's two missing rules ("call only the ones it needs", "afterwards, say in a sentence or two what you changed"). Three more native rounds (`native-p1..p3`): edit 95 s / 4.3 steps on average (was 124 / 6.3), write 124 s / 4 (was 91 / 3.3): no clear change, within run-to-run noise. **Found instead: an ambiguous edit.** In `native-p3` the first `edit_file`'s oldText was the Pet Supplies block, which appears in all three kits; the first match (72-hour kit) was replaced, deleting its pet lines and putting the section mid-file, later edits appended it again at the end, and the answer said done (`compare-native-p3-edit-*.md`). The same as in the user's own chat on 2026-10-29 ("splitting the 72-Hour kit's Pet Supplies section"). Not a call-format problem; native calls still had 0 malformed calls (p1's two failures: a made-up file name and a rewrite the overwrite guard refused).
- **Checkpoint 5, ambiguous edits refused (2026-10-30):** before an `edit_file` runs, SHIELD reads the file and replays the edits in order (`utils/editMatches.ts`, `ambiguityWarning` in `useMCPDialogs`); an oldText that matches more than one place is sent back unrun: "is in <file> 2 times (lines 68, 74), and edit_file changes only the first … include a line that is unique to the place you mean". Checked against the real failing edit (lines 68 and 74). In the app (`native-g1..g3`): the guard fired 3 times; twice the model resent a unique edit and passed with a clean file ("The anchor text matched twice. I'll use the unique '30 days' line"), edits 60-74 s. **Still open:** `native-g3`'s write task ran to the 20-minute cap: it kept expanding `72_Hour_Kit.md` to 22,575 characters across ~10 requests with one thinking loop (a runaway write, not the guard or the call format).
- **Next (paused here by the user, 2026-10-30):** the runaway write; `nativeToolCalls` for team agents and Qwen3.5 9B; the cheaper loop recovery and the per-round result budget from the list.

### Tuning runs (2026-10-29 evening): shopping list, date, Qwen-format calls

- **Shopping-list task** (`compare.mjs` research mode, tag `shopping`, Bonsai 2 27B with `medium`): done in 6.3 minutes, 23 steps, **no thinking loops, no summaries**, 3 clearings; `Shopping_List.md` with priorities, quantities, prices, stores and correct subtotals and total, and the pointer line in the checklist.
- **Today's date** (`dateLine`, end of every system prompt): without it the model searched for "2025" and labelled prices "(2025)". After: searched for "2026", dated `Prices.md` "October 29, 2026".
- **Qwen3-Coder calls:** with the date, the first rerun ended at once: the model's first two calls were garbled Qwen3-Coder (`<web><parameter=web_search</parameter>...`), not taken for calls, so the turn ended on them as the answer. Now a well-formed `<function=NAME><parameter=KEY>` call is read, and any `<tool_call>` block nothing can be read from goes back as unreadable (the three-strikes rule still ends it). Rerun: 4 minutes, 14 steps, file written.

### Bonsai 2 27B needed a placement fix (`7a8615c`; Qwen3.5-9B added in `8b205e0`)

First run: **2.8 tok/s**, GPU 11% busy. node-llama-cpp cannot size the `PTQ1_0` format, so `planUnsizedServerContext` took the catalog's 64k unchecked, and `--fit on` moved layers to the CPU. Measured with llama-server alone (`scratchpad ctxbench.sh`, same flags as SHIELD otherwise): `--fit on` 3.1 tok/s at 64k, 4.6 at 32k, 7.6 at 16k, 8.2 at 24k with 512-token batches, 19.3 with `--fit-target 256`; **all layers on the GPU** (`--fit off -ngl all`): 42.7 tok/s at 8k-24k (24k in 7.5 GB); 32k, and 24k with 2048-token batches, ran out of memory. Now the catalog's `serverPlacement` (`--fit off --n-gpu-layers all --ubatch-size 512`) for this model only, its context 24k, and the unsized plan offers a catalog size that is not a step (it fell back to 64k and the fixed placement ran out of memory at load). In the app afterwards: 38-39 tok/s, both tasks passed. Ternary 2 9B (80 tok/s, 4 GB) and Qwen3.5 9B (62 tok/s, 6.7 GB at 32k) already ran fully on the GPU with `--fit on`. Prism's own notes agree: its `KNOWN_ISSUES.md` says 32k does not fit a 12 GB GPU in their scripts, and lists malformed tool calls as a known model limitation.

## Update — 2026-10-26 → 29: remote providers, a hosted model on the same harness (start here)

Branch `feat/remote-providers` (from `feat/model-library` at `c5d79aa`), **PR #46 into `main`**. `main` already holds `feat/model-library` (PR #45, merge `764386c`, no file changes against this branch's base). The user asked for this on 2026-10-26: let users plug in their own LLM provider with an API key, **Experiential Labs** first, so people who want SHIELD's privacy can use zero-data-retention hosted models. Decided with the user: generic OpenAI-compatible providers with an Experiential preset, **zero data retention required by default**.

**Also this session (Windows, RTX 4070 12 GB):** Bonsai 2 27B (PTQ1_0, 5.5 GB) loads fully on the GPU at 32K (8.25 GB of VRAM, ~35-40 tok/s, Team on: a read-only question and a change task both passed in the app). In Auto, a command that is not read-only still asks every time (`commandSafety.ts`, decided 2026-09-26); the Auto menu label says "Run everything automatically", which is wrong for commands.

### How it works

- **Engine:** `ModelRuntime` has a third engine, `remote`. `LlamaServerProvider.attach(endpoint)` points the same chat handling (history, summaries, stall and stuck-bar handling, sub-agent forks) at a provider instead of a process. `src/services/remote/remoteEndpoint.ts` cuts a request to the standard fields, adds the key, and for Experiential adds `provider: {zdr: true}`; a reply is **thrown away unless the gateway answers `x-gateway-zdr: true`** (`ZdrNotConfirmedError`).
- **Ids:** `remote:<providerId>:<model id>`. `detectModelFamily` gives them the generic prompt; Team is available (untried).
- **Keys:** `electron/services/ProviderStore.ts` encrypts with Electron `safeStorage` (never plain text; no key saved where the system cannot encrypt); only the main process decrypts; the window gets a summary (`window.providers`). The HF token still sits in plain text in settings.json.
- **UI:** Settings > Providers (`ProvidersSettings.tsx`, `ProviderForm.tsx`); a Cloud section in the model picker (`ModelPickerMenu`; since 2026-11-03 only in the composer). A provider's models are fetched only when the picker or Settings opens (at most once a minute, `cloud-store.ts`), **never at startup**. A badge under each hosted reply says who served it and whether that route reported zero retention.
- **Context window:** `/v1/models` does not give it. `fetchCatalogContext` asks the public catalog `GET <origin>/api/models/<slug>` (no key sent) at load: `max_input_tokens` first (655,360 for `deepseek-v4.1-flash-1017`; its `context_window` is 1,048,576 but counts the reply), else the model list, else the provider's default; a size the user chose still wins. The catalog is paginated (963 models), so it is asked per model.
- **Logs:** the IPC and window message logs drop to a character count for a hosted model; the `SHIELD_SERVER_LOG` stall dump is skipped for it.
- **Titles:** a thinking model can spend the title request's tokens thinking; a hosted title gets 400 tokens and falls back to the first six words (`titleFromMessage`).
- **DeepSeek markup:** a hosted DeepSeek model wrote its native `<｜｜DSML｜｜ invoke ...>` calls (or a SHIELD call with a DSML closing tag); `src/handlers/dsml.ts` reads them as SHIELD's calls in the parser, the display and the live preview. It fired in a real session on 2026-10-29 (see "Update — 2026-10-30"), along with four more shapes the same model wrote; all five are read now (`ef4d086`).

### Verified / not verified

- Verified: tests (new ones for the store, adapter, ZDR check, catalog and list parsing, hosted chat, cloud options, DSML), tsc, eslint, prettier, `vite build`; a fake gateway driven through `ModelRuntime` (`tmp/remote-e2e.mts`, git-ignored); by hand against the real API: cloud chat, a Code session with tools (list, search, write), the zero-retention badge, titles, context from the catalog.
- **Not verified:** per-request zero retention needs a **Pro** Experiential org (else 403 `needs_subscription`); Team on a hosted model; `max_tokens` accepted by every gateway model.

### Todos

- [ ] **Native function calling for hosted models** (send `tools`, turn `delta.tool_calls` back into SHIELD's call text; sub-agent sessions need their tool lists too) so other model families do not depend on prompt formats.
- [ ] **Auto and commands:** allow a command prefix for the session, and let installs from the project's manifest run (Claude Code's auto mode drops blanket interpreter and `npm run` rules and allows manifest installs; Codex uses a sandbox plus approval rules). At least fix the Auto label.
- [ ] A cap on very large windows (cost per request), and the window shown in the picker.
- [ ] Split `LlamaServerProvider.ts` (1,179 lines: process management vs chat handling); the 300-line review bot flags it and several older files.
- [ ] **In-app runtime updater** (Prism / llama.cpp): parked, design saved in memory (`todo-runtime-updater`). Installed Prism build 10685; latest 10826.
- [ ] A "Served by" detail for the badge name (`experiential_cloud` reads raw).

---

## Update — 2026-10-25 → 26: the orchestrator prompt reaches the app; four in-app rechecks pass

The user's direction is unchanged: short, capped window runs, each result shown before the next. **Every window check now runs with `SHIELD_SERVER_LOG=$PWD/tmp/ui-check/<name>.log`** (see below). Details and numbers: the subsections "The orchestrator prompt never reached the app" and "Redoing the in-app checks with the prompt in place" under 2026-10-23 → 24.

### Commits (pushed 2026-10-26)

- `1fc3d96` **the orchestrator prompt was never sent** (since `a6f3a90`, 2026-10-22): `useMCPSystemPrompt` took any prompt opening "You are SHIELD" for the built-in default; now `isBuiltInPrompt` ("You are SHIELD, a helpful"). Team mode had run on `BASE_PROMPT` + delegate; all in-app team results from 10-22 to 10-25 were without the orchestrator rules.
- `02a104e` **report requests without thinking** (`AgentRunDeps.chat(id, msg, { thinking })`): a reviewer thought 8,192 tokens on "write your HANDOFF block"; after, 277 tokens in 1.5 s.
- `db72362` **thinking-loop guard** (`src/services/llamaServer/repetition.ts`, `LlamaServerProvider.chat`): newest 150 characters of `reasoning_content` written three times → abort, resend with thinking off. Tuned on 11 real traces (`tmp/hang-hunt/traces/`): 10 normal never fire, a real 29,926-character loop caught at ~8,850. **Not yet seen firing in the app.**
- `b7b0a02` **`SHIELD_SERVER_LOG=<file>`**: llama-server's output plus timestamped `[SHIELD]` markers (each request with thinking on/off, a guard abort, a stall with a `/slots` snapshot). The harness filters keep every `[LlamaServer]` line.
- `d4d7e0c` **full paths of the task's files in the agent's first message** (`namedFilesNote`): made-up first reads 7 of 12 → 0 of 12 headless (`tmp/hang-hunt/coder-paths.mts`); calc.py first in the window. Also strips a stray `</think>` from what an agent says (seen in the Team panel; fixed by test only).
- The rest are handoff updates. Tests 1155 → 1166.

### In-app rechecks with the real prompt (Bonsai 27B, Team on)

| Check                                         | Result                                                                                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greeting                                      | pass: the prompt's example sentence, 5.4 s, no agent                                                                                                                                                                       |
| Question ("what does add in calc.py return?") | pass after `02a104e`: reviewer, correct, 17.8 s                                                                                                                                                                            |
| Change (calc.py third number, Auto)           | pass after `db72362`, again after `d4d7e0c`: ~5-6 min, test exit 0, answer in "I"                                                                                                                                          |
| Deny (Ask, first call denied)                 | first try **hung the server** (stall watchdog after 5 min; unknown whether the guard fired: no log then); second try with the log **passed** (8.6 min, 5 delegations, denied path never retried, no guard abort, no stall) |

### Later on 2026-10-26 (evening)

- **Three window rounds back to back for the hang** (19:00-19:13, server log on, 15 min cap each, `server-hang-r{1,2,3}.log`, `recheck-hang-r*.txt`, files kept as `hang-r*-calc.py`/`-test_calc.py`): deny (6 min, 15 requests), change in Auto (4 min, 12), deny (3 min, 9). **No hang, no stall, no loop-guard abort.** Each run is a fresh app and server, so the long same-process condition of the old hangs (35-49 min) is still untested.
  All three right: one coder delegation each, no tester, `c=0`, old asserts untouched. Round 1: denied call, the coder carried on (11 steps) and finished. **Round 3: the coder's read of calc.py was denied, the coder stopped (PARTIAL), and the answer told the user** ("You denied my request to read calc.py, so I have not been able to make the changes … Would you like me to proceed …?"): the give-up-then-tell-the-user path, **seen in the window for the first time**, nothing re-delegated.
- `2ad521f` **SHIELD's record flags changed test checks** (step (c) above): an `edit_file` of a test file (`isTestFile`) that changes or removes an existing check line (`assert`, `expect`, `toBe`, …; `changedChecks` in `agentRunner.ts`) is listed as "test_calc.py edited (changed 3 existing test checks: tell the user)". Built from the real edit; not seen in the window (the coder no longer does it).
- `ea344df` **panel label**: a streamed call's path that holds `<`, `>`, `{` or `}` is not used as the target (`streamingToolCallPreview`), so "Reading tool> <arguments>{…" cannot show. Test only.
- Tests 1170 → 1175. Both commits local.

### The hang caught on one server (2026-10-26, 19:19-19:29)

`tmp/ui-check/long.mjs` (git-ignored): one app, one llama-server, Auto, Team on; five tasks in turn in one chat (change, question, bug fix, add `sub`, review), files reset by the script between tasks, Allow clicked, stops at `MINUTES` (45) or the first "no progress" in the server log. Log `server-long.log`, results `long-progress.txt`, `long-run.txt`.

- Task 1 (change) 131 s, task 2 (question) 94 s, both right. **Task 3 (bug fix) stalled**, 9 minutes into the run (the fix itself had been made: test exit 0).
- **What the log shows:** task 3300, a coder request with thinking on (prompt 7,161 tokens, 3,756 cached), started 19:23:51 and wrote steadily at ~22 tok/s; in its last ~40 s the 3-second rate rose to 29-36 tok/s (speculation accepting drafts, i.e. repeated text); llama-server's own timing lines **stop at 19:26:07, n_gen 3,104**; at 19:28:52 `/slots` said `is_processing: true`, `n_decoded` 3,123: **19 tokens in 165 s, so the server really froze, while decoding** (as on 2026-10-21: 151 and 1,971). The loop guard did not fire (no "repeated itself").
- **And a SHIELD bug (fixed, `f24dbdc`):** the watchdog fired at 19:28:52, exactly 5 minutes after the prompt read, not after the freeze. One progress mark was shared by reading and writing: the read set it to 7,161, the thinking reply's count stayed under it, thought is not content, so the clock never reset. Any thinking reply longer than 5 minutes after a long prompt was called stalled; **so the 2026-10-26 17:10 deny "hang" may have been this false alarm** (unknown: no log then). Now reading and writing have their own marks and new thought resets the clock. Test (fails on the old code).
- **Added (`f24dbdc`):** on a stall with `SHIELD_SERVER_LOG`, the exact request body goes to `<log>.stall-<ms>.json` and `ps -L` of llama-server (CPU and state per thread) into the log.
- **Hypothesis, not shown:** `ngram-mod` speculation on repetitive (looping) thought freezes the fork's decode loop; both 2026-10-21 hangs were with it on, the 10-21 one with "main thread 100% CPU", and this one froze right after the acceptance rate jumped. **Next:** run `long.mjs` again until a stall; send the saved `.stall-*.json` to a fresh server headless with `--spec-type ngram-mod` and without (same seed and sampling): a freeze with it and none without settles it. A real freeze also leaves the slot busy, so SHIELD's next request queues behind it: after a stall SHIELD should restart the server (or tell the user to reload) rather than send the next request.

### A second long run, no hang (2026-10-26, 19:44-20:45)

Same `long.mjs`, rebuilt app (watchdog fix and stall dump in), `MINUTES=60`, log `server-long2.log`, results `long-progress.txt`, `long-run2.txt`. **15 tasks (three full rounds of the five), all done, test exit 0 every time, 144 requests on one server, no "no progress", no loop guard, no stall file**; slowest was task 6 (change, 702 s, 7 approvals). So nothing to replay yet: the freeze is rare (one in ~9 minutes, then none in 60), not a matter of uptime. The replay script is ready: `tmp/hang-hunt/replay-stall.mts <stall.json>` (git-ignored; env `TRIES`, `MODES`, `FREEZE_S`) starts a server per mode, sends the saved body with seeds 1001.., calls 60 s without a new token a freeze, saves `/slots` and `ps -L`, restarts, and writes `tmp/hang-hunt/replay/results.txt`.

### The stuck bar: Nudge, Skip, Restart (2026-10-26 night)

The user's idea: a stuck step should cost that step, not the session. Part 1 of 3 (steer and queue come next).

- **The bar** (`src/components/chat/StuckBar.tsx`, above the composer): polls `window.llama.requestStatus()` every 2 s while generating. Shows a quiet timer once a request has run 30 s. At **60 s with no progress** (no token, thought or prompt read; not while summarising) it says the server may have frozen and offers **Restart and retry**. At **3 minutes** of one reply that is still writing it offers **Nudge**. Both states offer **Skip step** on an agent's request. Thresholds and pure helpers are in `src/services/llamaServer/rescue.ts`.
- **Main process** (`LlamaServerProvider`): the root server tracks the one request in flight, of whichever session (`inFlight`). `rescue(action)` aborts it, then:
  - **nudge** sends the same message again with `NUDGE_NOTE` and thinking off;
  - **restart** runs `restartServer()` (SIGTERM, then SIGKILL after 3 s, then a new process on a new port; every session's chat is kept, and forks follow the parent's `baseUrl`), then sends the same message again;
  - **skip** keeps what was written, like Stop.
    IPC: `llama:requestStatus`, `llama:rescue`.
- **The 5-minute watchdog** now restarts the server and resends **once**. A second stall on the same message gives up with "also after a restart".
- **Skip** sets `skipRequested` (generationStore). The agent runner ends that run as PARTIAL with `SKIPPED_BY_USER` and asks for no report; the orchestrator's loop goes on. The report says "THE USER SKIPPED this step to move on…" in place of the continue_from line and the "delegate again" warning.
- **Checked in the window** (`tmp/ui-check/stuck.mjs`, git-ignored; it freezes the real server with `kill -STOP`):
  - Restart: the bar appeared at 1:00, the server came back in 7 s on a new pid, and the step went on.
  - Nudge, through the API: the retry was sent with thinking off.
  - Skip: the step ended at once.
    The task still finished (test exit 0). The first run showed the orchestrator sending the coder straight back to the skipped step: its report had said "delegate again". After the report fix, a skip-only rerun stopped and asked the user how to go on. The Nudge _button_ (3 minutes) was not clicked in the window; the API it calls was.

### Steer: a message sent while it works (2026-10-26 night)

Part 2 of 3 (queue is next). The input stays open during a turn; its placeholder says "Add to the task while it works…" and a Send button shows next to Stop.

- **Sending mid-turn** (`App.handleSendMessage`): the message goes into the chat at once as `steer: true`, shown _inside_ the reply as "You, while it worked: …" (`turns.ts` part `steer`, `AssistantTurn`), and is queued in `generationStore.steer`.
- **Delivery** (`src/handlers/steer.ts` `withSteer`): the next tool result takes the queue, whoever is running.
  - The running agent's next result (`agentRunner`, `deps.takeSteer`); the agent's report then carries it, and the orchestrator reads "THE USER SAID while the coder worked (it was given this): …" (`formatReport`).
  - Otherwise the orchestrator's or chat's next tool result (`messageHandler`).
- **Left over** at the end of the turn (no tool result came): sent as the next message (`shown: true`, so no second bubble). After Stop it goes back into the input box instead (`ChatInputRef.restore`).
- **Fixed on the way:** `continueConversation` set `isGenerating` false after every round, so from the second round on the Stop button went and the input opened mid-turn (and the stuck bar stopped polling). Only the turn's own `finally` sets it false now.
- **Checked in the window** (`tmp/ui-check/steer.mjs`, git-ignored). Task: "Make add in calc.py take an optional third number, then run python3 test_calc.py." While the coder worked, the script typed "Also add an assert that add(1, 1, 1) == 3."
  - The bubble showed inside the reply.
  - The coder added exactly that assert (`test_calc.py` passes).
  - The report reached the orchestrator with THE USER SAID, and its answer mentions the assert.
  - Not checked in the window: a leftover sent as the next turn, and the after-Stop return to the box.

### Queue: a message held for after (2026-10-26 night)

Part 3 of 3. While a turn runs, **Ctrl+Enter** (or the list button next to Send) queues the message instead of steering. The placeholder reads "Enter: add to this task · Ctrl+Enter: queue for after".

- **Chips:** queued messages show as "Queued: …" chips above the input. × removes one; clicking one puts it back in the box. The queue lives in `generationStore.queue`.
- **After the turn** (`sendWhatWaits` in `src/handlers/steer.ts`, called from `App.handleSendMessage`): leftover steer goes first, as one message already shown. Then each queued message is sent as a turn of its own, in order, each with `beginTurn`.
- **After Stop, or with another chat open:** steer and queue go back into the input box instead.
- **Checked in the window** (`tmp/ui-check/queue.mjs`, git-ignored). While "What does test_calc.py check?" ran, the script queued "Add a function sub(a, b) to calc.py…" and "remove me", then removed the second with ×.
  - The question was answered.
  - The queued change then ran as its own turn: a "You" bubble, then a coder delegation, and `sub` landed in calc.py.
  - "remove me" was never sent.

### Next steps (suggested order)

1. **The hang: hunt closed 2026-10-26 (the user's call), evaluated from the runs so far.** Real freezes seen: two on 2026-10-21 (35-49 minutes in) and one on 2026-10-26 19:26 (9 minutes in), all with `ngram-mod` on, all the same picture: `/slots` busy, `n_decoded` stuck, `/health` ok. The 2026-10-26 17:10 one may have been the watchdog false alarm fixed in `f24dbdc`. With speculation on there were also about 104 stress requests, 60 direct ones and well over 2 hours of window runs with no freeze, so it is rare: roughly one per 1-2 hours of use. Speculation off had too little use (two team runs, 10 requests) to show whether it prevents the freeze, so **the cause is not proven**. It is a bug in the fork's decode loop, not in SHIELD, and speculation makes edits 2-3x faster, so **keep it on and recover instead:** after a stall, restart llama-server, because a frozen slot stays busy and the next request would queue behind it. Then tell the user and let them resend, or resend the request once. `SHIELD_SPEC_TYPE=none` stays as the way out for anyone who hits it often. `tmp/hang-hunt/replay-stall.mts` is kept in case a `.stall-*.json` turns up.
2. ~~**A repeated delegate gets the cached report.**~~ **Fixed 2026-10-26 (`302f911`, pushed; tests only, not seen in the window yet):** a repeated delegate call gets a note ("nothing has changed since … delegate again with what the agent lacked, or tell the user") instead of the old report. Found on the way: `delegate` is on the read-only list, so a coder's edits never cleared the turn's call cache, and a tester sent the same task after a fix would have got its stale report; a delegation whose agent changed a file or ran a command now returns `changed: true` (`MCPToolResult.changed`, `delegation.ts`) and clears the cache. A coder whose task `isChangeRequest` but that changed no file and ran no command (here or in the run it continued) is now PARTIAL with "asked for a change but changed no file", not DONE. Tests 1166 → 1170.
3. **Tester decided (2026-10-26, the user):** "Only add a tester when I explicitly ask for testing; if I say 'then run X', the coder runs it itself." Done in `ORCHESTRATOR_PROMPT` rule 1 (`roles.ts`) and `CHANGE_NOTE` (`teamRouting.ts`): a command to run after a change and an edit the user spells out in a test file go in the coder's task. **In the window** (2026-10-26 18:26, Auto, 15 min cap, `server-change-tester.log`, `recheck-change-tester.txt`): **one coder delegation, no tester**, ~6 min, 11 requests, no loop-guard abort, no stall, no leaked markup, the answer in "I". **But the result was wrong:** the orchestrator's task made up a detail the user never gave, "optional third number **(default to 2)**"; the coder wrote `def add(a, b, c=2)`, the test failed twice, and it then **rewrote the three existing asserts to fit** (`add(2, 3) == 7`, …) and added `add(2, 3, 4) == 9`; exit 0, and the final answer did not say the existing asserts were changed. Files kept as `tmp/ui-check/calc-after-tester-run.py` and `test_calc-after-tester-run.py`; `team-project` reset to the originals. **Next:** (a) the orchestrator must not add values or behaviour the user did not ask for (the "made-up path" rule, widened); (b) the coder must not change an existing test's expected value to make it pass unless the task says so: a failing old test means the change broke it; (c) SHIELD's record could flag edits to lines of a test file that were already there.
   **Fixed (a) and (b) in the prompts (`051752b`):** orchestrator rule 1 ("pass on what the user asked without details of your own … "add an optional timeout", not "… (default 30 seconds)""; unrelated example on purpose), coder ("keep what works today working … pick the default that leaves existing calls behaving as before"; "never change what an existing test expects to make it pass"), tester (the same: a failing old test is a finding). **Rerun in the window** (18:41, same task, `server-change-details.log`, `recheck-change-details.txt`): **passed in ~1.5 min**, 8 requests, no guard abort or stall, one coder delegation in 5 steps, `def add(a, b, c=0)`, the three old asserts untouched, `assert add(1, 2, 3) == 6` added, exit 0 outside the app; the answer said the default is 0 "to maintain backward compatibility". The orchestrator's task still added a detail, "(default None or 0)": harmless here (both keep old calls working), but rule (a) is not fully followed. One run only. (c) not done. `team-project` reset to the originals. Earlier notes:
   **Extra rounds in the team.** The deny run took 5 delegations (a coder only to _read_ calc.py; a reviewer to find a file). The change run added a tester once and not another time. Decide with the user whether a tester belongs on a two-line change the user asked to "then run".
4. Still open from before: the "coder agent" wording in final answers was not seen again in five runs with the prompt in place (likely the missing prompt); Windows CI before any PR to `main` (ask first); the recall tool; "SHIELD learns and remembers".

### Working notes from this session

- The harness's 90-second quiet-page exit fired while an agent was still thinking; `quick.mjs`/`deny.mjs` now wait while the panel says "N working". `tmp/ui-check/recheck.sh <name> <cap-ms> <script> "<prompt>"` runs one capped check. Reset `team-project/calc.py` and `test_calc.py` to their originals before a change run (they are at the originals now).
- Never `pkill -f` with a pattern that appears in your own command line (it happened again: it ended the calling shell, no harm). Kill by `-x` name or PID.

## Working agreements with the user

- Ask before downloading large files or installing system packages (name, source, size). Push and open PRs only when asked, each time. Run visible windows only when agreed, with a cap.
- Report plainly what failed or was not tested; verify with your own run, not an agent's summary.
- **Never empty the Trash** or run any broad cleanup: on 2026-10-20 `gio trash --empty` was run to remove one test file (it empties everything). Nothing was lost (the Trash folder had been created by that same test seconds earlier), but clean up only your own files, by exact path.

- Agents only when needed; the orchestrator speaks as one assistant (see the top of this section).
- Never chain `git stash` with other commands: an interrupted chain once left the work in the stash and the tree clean (recovered with `git stash pop`, nothing lost). Do not `git init` inside a test project either.
- A background `until` loop that waits for "an exit line" must count lines (or watch the process), not match any earlier line: two checks returned at once on old output.

## Working on SHIELD: things that cost time this session

- **Don't edit `electron/` while `npm run dev:electron` is running.** vite-plugin-electron rebuilds main, its Windows `taskkill` fails, and the dev server dies. Stop the app, edit, relaunch. Renderer (`src/`) edits hot-reload fine — except adding or removing hooks in a mounted component, which throws a React `getSnapshot` error until a full reload.
- **`ELECTRON_ENABLE_LOGGING=1 npm run dev:electron > app.log 2>&1`** captures main _and_ renderer console output in one file.
- **Main-process code isn't covered by `npx tsc -p tsconfig.json`** (it includes only `src/`). The Vite build catches errors; for a quick check run tsc on `electron/main.ts` with explicit flags.
- **npm 10.9 crashes** (`reading 'edgesOut'`) resolving the vitest ↔ @vitest/ui peer set. Use `npx npm@11 install`.
- **Shell heredocs eat backslashes**: Windows paths in test strings (`C:\p\t…` → tab) broke tests three times. Use forward slashes or `String.raw` in files, and the editor rather than shell for anything with regex escapes.
- The machine's GPU is shared with other projects (e.g. Android emulators): check before loading a model or running the benchmark.
