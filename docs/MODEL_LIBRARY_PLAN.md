# Model Library Revamp — Plan

**Status:** Phase 1 done (2026-09-24); Phases 2–6 not started  
**Date:** 2026-09-24  
**Supersedes:** the flat catalog in `src/config/models.ts`; idea #5 ("prune") in [MODEL_SYSTEM_BRAINSTORM.md](./MODEL_SYSTEM_BRAINSTORM.md)  
**Builds on:** [SHIELD_OPTIMIZATION_TOOLING_CONTEXT_DESIGN.md](./SHIELD_OPTIMIZATION_TOOLING_CONTEXT_DESIGN.md) §2–4 (Hardware Profile, Model Library, Runtime Manager) and [SHIELD_AGENT_ARCHITECTURE.md](./SHIELD_AGENT_ARCHITECTURE.md) §10 (provider layer)

---

## Why

- The catalog has 17 entries plus a separate `AVAILABLE_MODELS` list. Nearly all are 2024 models (Llama 3.2, Mistral 7B, Phi-3, Gemma 2, DeepSeek Coder 6.7B), several are impossible on consumer hardware (Qwen3.5 397B at 232 GB, Mistral Large at 73 GB), and entries repeat (`qwen-7b`, `mistral-7b`, `llama-3b` appear twice).
- Local models are listed as machine-specific `file://` paths (`unsloth/…`, `google/gemma-4/…`), so the catalog only works on this PC.
- The one model we most want to try that needs a different runtime (Bonsai 2) can't be added as "just another row".

## Decisions (user, 2026-09-24)

1. **Three families, a few variants each.** Start small and grow from there.
2. **Bonsai 2 comes in through the Prism runtime.** SHIELD manages Prism's `llama-server`, which makes it the first real test of the provider layer.
3. **Qwen gets two variants by role:** Qwen3-Coder-30B for agent/coding work, Qwen3.8-27B for general use.
4. **Gemma gets two variants by size:** 12B and E4B, recommended by VRAM.

## The library

| Family | Variant                      | Role                           | Runtime              | File(s)                                          | Size              | On a 12 GB GPU                                           |
| ------ | ---------------------------- | ------------------------------ | -------------------- | ------------------------------------------------ | ----------------- | -------------------------------------------------------- |
| Qwen   | Qwen3-Coder-30B-A3B-Instruct | Agent / coding                 | node-llama-cpp       | `unsloth/…-Q4_K_M.gguf`                          | 18.6 GB           | partial offload, 9–14 tok/s; 100% on the agent benchmark |
| Qwen   | Qwen3.8-27B                  | General, vision-capable        | node-llama-cpp       | `unsloth/…-UD-Q4_K_M.gguf` · `…-UD-IQ3_XXS.gguf` | 16.5 GB · 10.9 GB | IQ3_XXS picked (Q4_K_M from 16 GB up)                    |
| Gemma  | Gemma 4 12B-it               | Everyday, fast, vision-capable | node-llama-cpp       | `unsloth/…-Q4_K_M.gguf`                          | 7.1 GB            | fits, with room for context                              |
| Gemma  | Gemma 4 E4B-it               | Small / fast, weaker machines  | node-llama-cpp       | `unsloth/…-Q4_K_M.gguf`                          | 5.0 GB            | fits                                                     |
| Bonsai | Ternary-Bonsai-2-27B         | Long context fully on GPU      | Prism `llama-server` | `prism-ml/…-PTQ1_0.gguf`                         | 6.0 GB            | fits at 64k context (11.05 GB measured)                  |

Already on this machine: Qwen3-Coder-30B, Qwen3.8-27B (Q4_K_M, Q3_K_XL, IQ3_XXS), Gemma 4 12B (all in `D:\AIMODELS`), Bonsai 2 + Prism CUDA binaries (`C:\Users\imend\Bonsai\Bonsai-demo`). Gemma 4 E4B is the only one to download.

Vision needs the `mmproj` projector files and image input in the chat. That is out of scope here; the library records which variants support vision so it can be added later.

---

## Data model

Replace `ModelMetadata` + `AVAILABLE_MODELS` with families and variants:

```ts
interface ModelFamily {
  id: "qwen" | "gemma" | "bonsai";
  name: string;
  provider: string; // Alibaba, Google, PrismML
  description: string;
  variants: ModelVariant[];
}

interface ModelVariant {
  id: string; // stable; stored in settings and conversations
  displayName: string;
  roles: ("agent" | "coding" | "chat" | "small" | "long-context" | "vision")[];
  runtime: "node-llama-cpp" | "prism-llama-server";
  source: { hfRepo: string; file: string }; // one exact file, not a quant tag
  alternates?: { file: string; sizeBytes: number; minVRAM: number }[]; // other quants
  sizeBytes: number;
  trainedContext: number; // what the model supports
  defaultContext: number; // what we load by default before hardware tuning
  hardware: { minVRAM: number; recommendedVRAM: number; minRAM: number };
  toolCalling: "xml" | "native"; // per runtime + model, from benchmark evidence
  capabilities: ModelCapabilities; // kept for existing UI and prompt code
  sampling?: {
    temperature: number;
    topP?: number;
    topK?: number;
    minP?: number;
  };
}
```

**Finding installed models by filename, not path.** Each variant names one exact file. SHIELD searches the models folder recursively for that name, so any folder layout works: node-llama-cpp's `hf_*` downloads, LM Studio's `publisher/repo/` folders, and `D:\AIMODELS`. The machine-specific `file://` entries go away.

**Recommending a variant.** Per family, recommend the largest variant whose weights plus default context fit in free VRAM. If none fit, recommend the smallest. Uses `llama.getVramState()` for now; it becomes the Hardware Profile (design doc §2) later.

---

## Phases

### 1. Consolidate the catalog (no runtime changes) — done 2026-09-24

As built, differing from the bullets below:

- Kept `src/config/models.ts` and `ModelMetadata` (extended with `familyId`, `roles`, `runtime`, `files[]`) so existing imports keep working; `MODEL_FAMILIES` is the source and `MODEL_CATALOG` is the flat list. Quantizations are `files[]`, best first, each with the `minVRAM` it is picked from. `trainedContext`, `toolCalling` mode and `sampling` wait for Phases 2 and 6.
- No id migration was needed: the model id is not persisted for loading, only as a label on conversations. The default is now `DEFAULT_MODEL_ID` (`qwen3-coder-30b`), and auto-load falls back to the first installed model SHIELD can run.
- Recommendation is by the variant's hardware thresholds, using total VRAM rather than free VRAM (the GPU is shared, so free VRAM changes minute to minute): first variant at or above `recommendedVRAM`, else first above `minVRAM`.
- Loading resolves the file by model id (`LlamaService.resolveModelPath`) and never downloads. Previously an `hf:` model not found by its expected name was downloaded as a side effect of loading.
- Fixed: the loader used `<app>/models` by default while downloads went to `%APPDATA%\shield\models`, so a download without a custom folder could not be loaded.
- Deleting a model moves all its files to the Recycle Bin (the folder may be shared with LM Studio).
- Scan of `D:\AIMODELS` (3 ms): finds Qwen3-Coder, both Qwen3.8 quants (loads IQ3_XXS on 12 GB) and Gemma 4 12B; ignores the abliterated/obliterated copies.

Original plan:

- New `src/config/modelLibrary.ts` with the three families; delete the old catalog and `AVAILABLE_MODELS`.
- Recursive filename detection in `ModelFileManager`; download by exact file (`hf:<repo>/<file>`).
- Migration: `App.tsx` defaults to `"qwen-7b"`, and saved conversations store model ids that will stop existing. Map old ids to the closest new variant, or to the recommended default.
- Existing UI, regrouped by family: the dropdown shows installed variants; the download dialog lists families and their variants.
- Bonsai appears with the label "Needs the Prism runtime (coming soon)", and loading it is disabled until Phase 4.
- Tests: detection across folder layouts, id migration, recommendation rule.

### 2. Context size (handoff item 1, now per variant)

- Load at the variant's `defaultContext`. A per-variant user setting overrides it, capped at `trainedContext`. The existing Settings slider (currently unused) becomes this setting.
- Suggest a size from free VRAM after load; report the size actually loaded.

### 3. Provider layer

- `ModelProvider` interface (architecture doc §10). It has to cover what `LlamaService` does today, not just `chat`: system prompt, history replace/restore, streaming with abort, stats, context usage and breakdown, and title generation.
- `NodeLlamaCppProvider` = today's `LlamaService`, moved behind the interface with no behaviour change. `llamaHandlers.ts` routes to the provider for the loaded variant's `runtime`.

### 4. Prism runtime → Bonsai 2

- `PrismServerProvider` starts `llama-server.exe` as a child process: free localhost port, `127.0.0.1` only, health check, stopped on unload/quit.
- Runtime folder is a setting. For now it points at the existing install; downloading a pinned Prism release comes later, and it asks first.
- Launch flags come from the variant definition, starting from the tuned set in `D:\AIMODELS\CHEATSHEET.md` (reasoning budget, DRY, min-p, cache reuse, `BONSAI_REASONING`-equivalent default effort).
- SHIELD keeps the chat history (the server is stateless per request). Streaming via `/v1/chat/completions`. Context usage from `/tokenize` or the response `usage`.
- Tool calls use the existing XML path first, so the rest of SHIELD is unchanged. Native `--jinja` tools come after it is benchmarked. Test from the design doc: no Prism-specific conditionals above the provider.

### 5. Model Library UI

- Per design doc §3: Installed / Recommended / Explore / Loaded / Defaults / Runtime; a compact model control in the composer that opens the library.

### 6. Benchmark every variant

- `scripts/bench/` gains provider support so Bonsai can run. The benchmark decides each variant's `toolCalling` mode and whether the E4B is reliable enough for agent work.

---

## Open questions

- **Qwen3.8-27B on 12 GB:** IQ3_XXS fits fully; Q4_K_M is higher quality but partly offloaded. Pick by benchmark, not by guess.
- **Gemma 4 E4B for tools:** untested in SHIELD. If it can't handle tools reliably, it is a chat-only variant.
- **Custom models:** a "use any GGUF" escape hatch is likely wanted later ("then go from there"). It is not part of the curated list.
- **Old downloads:** Qwen2.5-7B in `%APPDATA%\shield\models` will no longer be listed. Offer to delete it (Recycle Bin), or leave it?
