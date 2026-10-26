# LLM Integration Guide

## Overview

SHIELD 2.0 now has complete integration with llama.cpp for local AI inference with real-time streaming chat capabilities.

## Architecture

### Backend (Electron Main Process)

- **LlamaService** (`electron/services/LlamaService.ts`): Singleton service managing llama.cpp
  - Model downloading and caching
  - Streaming inference with token callbacks
  - Session management and history

### IPC Bridge

- **Main Process** (`electron/main.ts`): Exposes llama methods via `ipcMain.handle()`
- **Preload Script** (`electron/preload.ts`): Secure bridge using `contextBridge`
- **Type Definitions** (`src/types/electron.d.ts`): TypeScript declarations for `window.llama`

### Frontend (React)

- **useLlama Hook** (`src/hooks/useLlama.ts`): React hook wrapping IPC calls
  - Auto-initialization
  - Model loading state management
  - Streaming message handling
  - Error handling

## Components

### ChatMessage

Individual message bubble component with:

- User/Assistant icons
- Streaming indicator (pulsing cursor during generation)
- Proper text wrapping

### ChatHeader

Top bar displaying:

- Current model name
- Loading spinner during model initialization
- Error messages

### MessageList

Scrollable message container:

- Completed messages from history
- Real-time streaming message display
- Auto-scroll on new content

### ChatInput

Message input with:

- Auto-resizing textarea
- Send button / Stop button toggle
- Disabled state while model loads
- Shift+Enter for new lines

### ChatPlaceholder

Welcome screen showing:

- SHIELD logo and branding
- Loading status during model initialization
- Clickable suggested prompts (when model ready)

### Sidebar

Navigation panel with:

- New Chat button with persistent, searchable conversation history (`ConversationList`, `useConversationStore`)
- Clear History button
- Settings button with full model browsing, download, and selection

## Usage Flow

1. **App Initialization**

   ```typescript
   const { isInitialized, isModelLoaded, loadModel, sendStreamingMessage } =
     useLlama();
   ```

2. **Auto-load Default Model**

   ```typescript
   useEffect(() => {
     if (isInitialized && !isModelLoaded && !isLoading) {
       loadModel({
         name: "Qwen2.5-7B-Instruct",
         uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
       });
     }
   }, [isInitialized, isModelLoaded, isLoading, loadModel]);
   ```

3. **Send Streaming Message**

   ```typescript
   const streamingContentRef = useRef("");

   await sendStreamingMessage(
     userMessage,
     (token) => {
       streamingContentRef.current += token;
       setStreamingContent(streamingContentRef.current);
     },
     {
       temperature: 0.7,
       maxTokens: 512,
     }
   );

   // Use ref for final content (state may be stale)
   const finalContent = streamingContentRef.current;
   ```

## Key Implementation Details

### Streaming Content Bug Fix

**Problem**: Using state directly in the callback results in stale closures:

```typescript
// ❌ WRONG - finalContent will be empty
await sendStreamingMessage(content, (token) => {
  setStreamingContent((prev) => prev + token);
});
const finalContent = streamingContent; // Stale state!
```

**Solution**: Use a ref to accumulate tokens:

```typescript
// ✅ CORRECT - ref has the latest value
const streamingContentRef = useRef("");
await sendStreamingMessage(content, (token) => {
  streamingContentRef.current += token;
  setStreamingContent(streamingContentRef.current);
});
const finalContent = streamingContentRef.current; // Latest content!
```

### Model Configuration

Default model auto-loads on app start:

- **Name**: Qwen2.5-7B-Instruct
- **URI**: `hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M`
- **Size**: ~4.2GB (Q4_K_M quantization)

Pre-installed models (`isInstalled: true` in `src/config/models.ts`):

- Qwen2.5-7B-Instruct (Q4_K_M) - Default
- Llama-3.2-3B-Instruct (Q4_K_M) - Smaller, faster
- Mistral-7B-Instruct (Q4_K_M) - Alternative 7B model

The full downloadable catalog has grown well beyond these three - see
[MODEL_DOWNLOAD.md](features/MODEL_DOWNLOAD.md) for the current list
(15 models as of 2026-02, including the Qwen3 family and several
tool-calling-capable models). Treat `src/config/models.ts` as the
source of truth rather than hardcoding model lists in docs.

### Error Handling

The system gracefully handles:

- Model initialization failures
- Download interruptions
- Inference errors
- IPC communication failures

All errors are:

1. Logged to console
2. Displayed in the UI via error state
3. Communicated via the ChatHeader component

## Testing

### Build Test

```bash
npm run build
```

Should complete with no TypeScript errors.

### Development Test

```bash
npm run dev:electron
```

Expected behavior:

1. Electron window opens
2. "Loading model..." appears in ChatHeader
3. After ~30-60s (first download), model loads
4. Placeholder shows suggested prompts
5. Clicking a prompt or typing sends message
6. Response streams token-by-token
7. Clear History button resets conversation

## Performance Notes

- **First Run**: Model downloads (~4.2GB), takes 2-10 minutes depending on network
- **Subsequent Runs**: Model loads from cache in ~10-30 seconds
- **Inference Speed**: Varies by hardware (GPU > CPU)
  - RTX 3060: ~30-50 tokens/sec
  - CPU (Ryzen 5): ~5-10 tokens/sec
- **Memory Usage**: ~6-8GB RAM with Qwen 7B model loaded

## Future Enhancements

- [x] Model selector UI (full browse/download catalog, not just Qwen/Llama/Mistral)
- [x] Persistent chat sessions
- [x] Conversation history search
- [x] System prompt customization (see [SYSTEM_PROMPT_IMPROVEMENTS.md](features/SYSTEM_PROMPT_IMPROVEMENTS.md))
- [x] Temperature/max tokens UI controls
- [x] Model download progress indicator (see [MODEL_DOWNLOAD.md](features/MODEL_DOWNLOAD.md))
- [x] Export chat history (see [EXPORT_IMPORT.md](features/EXPORT_IMPORT.md))
- [x] Dark/light theme toggle
- [x] Markdown rendering in messages
- [x] Code syntax highlighting
- [ ] GPU acceleration toggle (currently `gpuLayers: "auto"` only; no manual override UI)

## Troubleshooting

### Model won't load

- Check available disk space (need ~5GB free)
- Verify internet connection for first download
- Check console for specific error messages

### Slow inference

- Ensure GPU drivers are up to date
- Close other memory-intensive applications
- Consider using smaller model (Llama 3B)

### Electron app won't start

```bash
# Clean build and restart
npm run build
npm run dev:electron
```

### TypeScript errors in IDE

- Restart TypeScript server: Ctrl+Shift+P → "TypeScript: Restart TS Server"
- Rebuild: `npm run build`

## File Line Counts

The project enforces a 300-line limit per file (see
`.github/copilot-instructions.md`). A hardcoded snapshot here will
always drift as files change - check actual line counts directly
(e.g. `git ls-files -- '*.ts' '*.tsx' | xargs wc -l`) instead of
trusting a list in this doc.

## Dependencies

### Core LLM

- `node-llama-cpp@^3.15.1` - C++ bindings with GPU support

### Electron

- `electron@^40.1.0` - Desktop application framework
- `electron-builder@^26.0.12` - App packaging
- `vite-plugin-electron@^0.29.0` - Vite integration

### React/UI

- `react@^19.2.0` - Frontend framework
- `shadcn/ui` - Component library
- `tailwindcss@^4.1.16` - Styling
- `lucide-react` - Icons

Versions above reflect `package.json` as of 2026-02 (v0.1.5). Check
`package.json` directly rather than trusting a pinned snapshot here -
this list will drift again.
