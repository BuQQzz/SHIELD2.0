# Runtime Speed Research — big MoE models on a consumer GPU

**Status:** Stages 1–2 done (2026-09-24); Stage 3 not started  
**Date:** 2026-09-24  
**Goal:** make Qwen3-Coder-30B-A3B run much faster on a 12 GB GPU **without** shrinking the context window (32k) or tool-result limits.  
**Machine:** RTX 4070 12 GB (~500 GB/s) · Ryzen 9 3900X 12C/24T, AVX2 · 32 GB DDR4-3600 (~40 GB/s real) · PCIe 4.0

---

## Where we are

Measured in SHIELD (node-llama-cpp, 32k context; its loader turned out to put only 15 of 49 layers on the GPU, see Finding 1):

|                                     | Now                             |
| ----------------------------------- | ------------------------------- |
| Decode, short chat                  | 9.5 tok/s                       |
| Decode after a 9.3k-token file read | **4.8 tok/s**                   |
| Time to first token for that read   | **26.7 s** (~350 tok/s prefill) |

## Why it is slow — the arithmetic

Qwen3-Coder-30B-A3B: 48 blocks, 128 experts per block, 8 active per token, hidden 2048, expert width 768.

- One expert = 3 × 2048 × 768 ≈ 4.7M parameters; 128 × 48 of them ≈ **29B of the 30.5B parameters are experts**.
- Per token only 8 experts per block run: ≈ 1.8B expert parameters + ≈ 0.8B attention/head/router ≈ **2.6B read per token** (~1.6 GB at Q4_K_M).

SHIELD today splits by **whole layers**: 23 blocks run entirely on the CPU, _including their attention and their share of the KV cache_. Attention cost grows with context, so the deeper the conversation, the slower the CPU half gets. That is the 9.5 → 4.8 tok/s drop.

The alternative is to split by **tensor type**: attention, router, norms and the whole KV cache on the GPU for all 48 blocks; only the expert weights (the part that is big but sparsely used) in system RAM.

- CPU work per token becomes ~1.1 GB of expert reads → at ~40 GB/s the ceiling is ~35 tok/s, realistically 15–25.
- Attention runs on the GPU for every layer, so **depth stops mattering** to decode speed.
- VRAM left after attention weights (~1 GB), a 32k KV cache (3.1 GB f16 / 1.6 GB q8_0) and buffers (~1 GB) holds the experts of roughly 12–16 blocks, cutting CPU reads further.

node-llama-cpp cannot place tensors this way (no tensor overrides in its addon). llama.cpp's `llama-server` can (`--n-cpu-moe`, `-ot`), and a build with them is already on this machine (the Prism fork, build 10685, which also ships `llama-bench`). That is the same serving runtime the Bonsai work needs (MODEL_LIBRARY_PLAN.md Phases 3–4).

---

## Experiments

All on Qwen3-Coder-30B-A3B Q4_K_M, measured with `llama-bench` (5 repetitions): prefill (pp) of a 9k prompt and decode (tg) of 128 tokens **at depth 0 and at depth 16k**, because the depth number is the one users feel.

### Stage 1 — runtime levers (known techniques, measured here)

| #   | Configuration                                                                | Hypothesis                                                                    |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| E0  | Layer split like SHIELD today (`-ngl 26`)                                    | Reproduces ~9 → ~5 tok/s with depth; establishes the baseline in this runtime |
| E1  | All layers on GPU, **all experts on CPU** (`-ngl 99 --cpu-moe`)              | Decode 2×+, flat across depth                                                 |
| E2  | E1 but keep as many blocks' experts on GPU as fit (`--n-cpu-moe N`, sweep N) | Further gain, proportional to experts moved                                   |
| E3  | E2 + flash attention + q8_0 KV cache                                         | KV halves → ~4 more expert blocks fit; quality check needed                   |
| E4  | E3 + ubatch 1024/2048/4096                                                   | Prefill: big batches amortise copying CPU experts to the GPU (`--op-offload`) |
| E5  | E4 + thread sweep (8/10/12/16/24)                                            | Zen 2 is bandwidth-bound; fewer threads may equal more                        |

### Stage 2 — speculative decoding

A small draft model with the same tokenizer (Qwen2.5/Qwen3 0.5–0.6B, ~0.5 GB) proposes several tokens; the big model checks them in one batch. With experts in RAM, a batch of k tokens touches more distinct experts than one token but far fewer than k×, so accepted drafts are nearly free. Code has high acceptance rates. Also test llama.cpp's draft-free n-gram lookup.

### Stage 3 — novel: SHIELD-specific expert pruning

Nothing above changes the model. This does, the way Prism's Bonsai does, but aimed at what SHIELD actually uses the model for.

1. **Profile the router** on SHIELD workloads: the agent benchmark's tool-calling tasks plus coding chats. Record, per block, how often each of the 128 experts is selected.
2. **Hypothesis:** usage is heavily skewed for a narrow domain (agentic coding + tool calls), so many experts per block are rarely or never picked.
3. **Prune** the least-used experts per block by rewriting the GGUF: drop their slices from `ffn_{gate,up,down}_exps` and their rows from the router `ffn_gate_inp`, update `expert_count`. The expert axis is the outermost dimension, so quantized data can be sliced without re-quantizing.
4. **Measure** size, speed (Stage 1 config) and quality: the SHIELD agent benchmark must stay at 100%, plus perplexity on held-out code.

Why it could matter: pruning 25–50% of experts takes the model from 18.6 GB to ~10–14 GB. Most or all experts then fit on the GPU next to a 32k cache, and CPU reads per token fall accordingly. Published prior art (Cerebras REAP, 2025) pruned Qwen3-Coder experts with small quality loss using generic calibration data. The new part here is calibrating on SHIELD's own agent traces and validating on SHIELD's own benchmark.

---

## What ships

The winning Stage 1–2 configuration becomes the launch profile for Qwen3-Coder in a SHIELD-managed `llama-server` provider (MODEL_LIBRARY_PLAN.md Phase 3). Stage 3 would add a SHIELD-built model variant to the library if it holds up.

## Results (2026-09-24)

Runtime: Prism's llama.cpp build 10685 (`C:\Users\imend\Bonsai\Bonsai-demo\bin\cuda`), Qwen3-Coder-30B-A3B Q4_K_M. About 1.4 GB of VRAM was in use by Windows and desktop apps throughout, as on any real desktop.

### Headline

Same model, same 32k context, same tool limits:

|                                                    | SHIELD today (node-llama-cpp)     | Best config (llama-server)         |                         |
| -------------------------------------------------- | --------------------------------- | ---------------------------------- | ----------------------- |
| Decode, short chat                                 | 10.1 tok/s                        | 36–39 tok/s                        | **3.7×**                |
| Decode with ~20–25k tokens of conversation         | 3.9 tok/s                         | 31.9 tok/s                         | **8×**                  |
| Prefill (reading a file / tool result)             | ~390 tok/s (19.9k tokens in 51 s) | 1,274 tok/s (24.6k tokens in 19 s) | **3.3×**                |
| Decode while editing a file (output repeats input) | —                                 | 63.7 tok/s                         | with n-gram speculation |

Best config: `-ngl 99 --n-cpu-moe 30 -fa on -ub 2048 -b 2048 -t 8 -c 32768 --spec-type ngram-mod`. It uses 11.25 of 12.28 GB of VRAM.

### Finding 1 — SHIELD's own loader puts too few layers on the GPU

`scripts/bench/decode-speed.ts` loads the model exactly as `LlamaService` does. node-llama-cpp's `gpuLayers: { fitContext }` put only **15 of 49 layers** on the GPU at 32k. llama.cpp with the same kind of split and 26 layers decodes at 33 tok/s. node-llama-cpp's estimator is also unstable for this model (15–30 layers at 8k between runs, see MODEL_LIBRARY_PLAN Phase 2), and it refuses explicit layer counts it believes will not fit. The InputLookupTokenPredictor was roughly neutral (10.1 → 10.8 short, 3.9 → 3.2 long).

### Finding 2 — split by tensor type, not by layer (E0–E2)

pp = prefill, tg = decode, tok/s:

| Config                                       | pp4096 | tg64 | pp4096 @ 8k deep | tg64 @ 8k deep |
| -------------------------------------------- | ------ | ---- | ---------------- | -------------- |
| E0 layer split, 26 layers on GPU             | 612    | 33.3 | 557              | **12.6**       |
| E1 all layers on GPU, all experts on CPU     | 387    | 24.0 | 400              | **23.5**       |
| E2 experts of 18 blocks on GPU (`-ncmoe 30`) | —      | —    | 514              | 33.9           |
| E2 experts of 22 blocks on GPU (`-ncmoe 26`) | —      | —    | 577              | 39.4           |

With the layer split, decode loses 62% by 8k deep because CPU layers do attention over the growing KV cache. With experts on CPU and attention on the GPU, depth barely matters.

### Finding 3 — the VRAM limit is a cliff, not a slope (E3)

At ~29k deep:

| Config               | pp512  | tg64     |
| -------------------- | ------ | -------- |
| `-ncmoe 30`, f16 KV  | 432    | **32.2** |
| `-ncmoe 26`, q8_0 KV | 473    | 29.9     |
| `-ncmoe 26`, f16 KV  | 134    | 22.6     |
| `-ncmoe 22`, q8_0 KV | **18** | **10.4** |

When the configuration does not fit, the Windows NVIDIA driver does not fail. It silently spills into shared system memory ("sysmem fallback") and speed collapses, up to 30× slower for prefill. **SHIELD must place layers with a safety margin and verify after loading, not just pick the tightest fit.** q8_0 KV frees enough memory to move the cliff by about 4 blocks, but f16 with one more block on the CPU was faster here and has no quality cost.

### Finding 4 — batch size is the prefill lever; threads barely matter (E4–E5)

At `-ncmoe 30`, 8k prompt:

| ubatch | threads     | pp8192                 | tg64                   |
| ------ | ----------- | ---------------------- | ---------------------- |
| 512    | 8 / 12 / 16 | 567 / 560 / 556        | 39.5 / 38.9 / 37.1     |
| 2048   | 8 / 12 / 16 | **1554** / 1561 / 1535 | **40.0** / 39.3 / 37.6 |

A 2048-token micro-batch amortises copying CPU-resident experts to the GPU for each batch: 2.8× faster prefill. Decode is memory-bandwidth bound (DDR4 dual channel), so more than 8 threads only adds contention.

### Finding 5 — speculative decoding: n-gram yes, draft model no (Stage 2)

`scripts/bench/server-speed.ts`, 32k context, decode tok/s:

| Config                                          | write (new code) | edit (repeats the file)   | read (5k-token file, summary) |
| ----------------------------------------------- | ---------------- | ------------------------- | ----------------------------- |
| A — best placement                              | 36.2             | 38.7                      | 36.2                          |
| B — A + `--spec-type ngram-simple`              | 35.2             | 59.0 (294/336 drafts)     | 36.0                          |
| B — A + `--spec-type ngram-mod`                 | 36.3             | **63.7** (271/320 drafts) | 34.6                          |
| C — Qwen3-0.6B draft (`-ncmoe 34` to make room) | 23.0 (182/344)   | 34.4 (284/304)            | **3.4** (45/384)              |
| C′ — `-ncmoe 34` without a draft                | 33.0             | 35.5                      | 33.7                          |

N-gram lookup costs nothing and gives +65% on edits, which is what the agent's `edit_file`/`write_file` calls look like. A draft model is a net loss on this hardware. With experts in RAM, verifying 8 drafted tokens touches many more experts than one token, so rejected drafts are expensive; the draft's own VRAM also pushes the main model toward the cliff.

### Next

1. **Ship it:** a SHIELD-managed `llama-server` provider (MODEL_LIBRARY_PLAN Phases 3–4) with a per-model launch profile. Auto-place `--n-cpu-moe` from the GGUF estimate with a margin, then check actual VRAM after load and step back if it spilled.
2. **Stage 3** (expert pruning calibrated on SHIELD's agent traces) is the remaining novel experiment. Every expert block moved from CPU to GPU is worth ~1.3 tok/s here, and pruning is the way to move all of them.
3. Qwen3.8-27B ships MTP heads in its GGUF repo, and this build supports `--spec-type draft-mtp`: built-in speculation worth testing when Qwen3.8 is benchmarked.
