# SHIELD Features

Comprehensive guide to all features implemented in SHIELD.

## Core Features

### 🤖 Local AI Chat

**Status**: ✅ Production Ready

- **Local LLM inference** using llama.cpp (no cloud, full privacy)
- **Streaming responses** with real-time token generation
- **Model management** - download, load, and switch models
- **Chat templates** - Support for multiple instruction formats
- **Conversation history** - Persistent storage across sessions
- **Message editing** - Edit and regenerate responses
- **Conversation management** - Create, rename, delete conversations

**Key Files**:

- `electron/services/LlamaService.ts` - LLM inference engine
- `src/hooks/useLlama.ts` - React integration
- `src/stores/chat-store.ts` - Chat state management

---

### 🔍 Web Search Integration

**Status**: ✅ Production Ready  
**Added**: January 2025

Privacy-first web search powered by DuckDuckGo with content extraction.

**Features**:

- ✅ DuckDuckGo HTML search (no API key required)
- ✅ Privacy protection (tracker blocking, user agent rotation)
- ✅ Content extraction with @mozilla/readability
- ✅ JavaScript rendering via Playwright
- ✅ Cache system to avoid duplicate fetches
- ✅ Toggle on/off per message

**Privacy Measures**:

- Blocks 20+ tracking services (Google Analytics, Facebook Pixel, etc.)
- Removes tracking parameters from URLs
- No cookies, no referrer, DNT header enabled
- User agent rotation for anonymity

**Usage**:

```
User: "What's the latest news about AI?" (with web search enabled)
→ System searches DuckDuckGo
→ Extracts content from top results
→ Feeds context to LLM for answer
```

**Key Files**:

- `electron/services/WebSearchService.ts` - Search & extraction
- `electron/services/WebCacheService.ts` - Result caching
- `src/hooks/useWebSearch.ts` - React integration

---

### 🔧 Model Context Protocol (MCP)

**Status**: ✅ Production Ready  
**Added**: November 2025

Revolutionary tool-calling system that works with ANY LLM (no API requirements).

**Features**:

- ✅ Natural language file operations (read, write, list, search)
- ✅ Model-agnostic intent detection (no function calling API needed)
- ✅ Security-first design (permission dialogs, path restrictions)
- ✅ Audit logging for all operations
- ✅ Desktop & Documents folder access only
- ✅ Built-in filesystem MCP server

**How It Works**:

1. User asks: "Read my todo.txt file"
2. Intent detector analyzes message using NLP patterns
3. Permission dialog shows user what will happen
4. User approves → MCP executes → LLM gets results
5. All operations logged to audit trail

**Security**:

- Restricted to `Documents` and `Desktop` folders only
- Explicit permission dialogs for every operation
- Path validation prevents directory traversal
- Comprehensive audit logging

**Key Files**:

- `electron/services/MCPService.ts` - MCP lifecycle management
- `src/handlers/intentDetector.ts` - NLP pattern matching
- `electron/services/AuditLogService.ts` - Operation tracking
- `src/components/dialogs/PermissionDialog.tsx` - User permissions

---

### 📦 Export & Import

**Status**: ✅ Production Ready

**Export Features**:

- Export single conversations to Markdown or JSON
- Export all conversations at once
- Markdown format includes metadata and formatting
- JSON format preserves full conversation structure

**Import Features**:

- Import conversations from JSON exports
- Validates conversation structure
- Generates new unique IDs to prevent conflicts
- Preserves all metadata and timestamps

**Key Files**:

- `electron/services/ExportService.ts` - Export logic
- `src/components/dialogs/ExportDialog.tsx` - Export UI
- `src/components/dialogs/ImportDialog.tsx` - Import UI

---

### 🎨 Theme System

**Status**: ✅ Production Ready

- **Dark mode** (default)
- **Light mode**
- **System theme** (follows OS preference)
- Persistent preference storage
- Smooth transitions between themes

**Key Files**:

- `src/hooks/useTheme.ts` - Theme management
- `src/components/theme/ThemeToggle.tsx` - Toggle UI

---

### 🏷️ Conversation Tagging

**Status**: ✅ Production Ready

Organize conversations with custom tags for easy filtering and search.

**Features**:

- Create custom tags with colors
- Add multiple tags per conversation
- Filter conversations by tag
- Tag management (create, edit, delete)
- Persistent storage

**Key Files**:

- `src/stores/conversation-store.ts` - Tag state management
- `src/components/chat/Sidebar.tsx` - Tag UI

---

### ⚡ Speculative Decoding

**Status**: ✅ Production Ready  
**Added**: January 2026

Accelerate LLM inference using intelligent token prediction.

**Features**:

- ✅ InputLookupTokenPredictor for pattern-based prediction
- ✅ 20-50% speedup for code completion and summarization
- ✅ No additional model required (unlike draft model approaches)
- ✅ Zero memory overhead
- ✅ Toggle on/off in Advanced Settings

**How It Works**:

1. Analyzes input text for recurring patterns
2. Predicts multiple tokens ahead during generation
3. Verifies predictions in parallel (faster than sequential)
4. Falls back to normal generation when patterns don't match

**Best For**:

- Code completion (high pattern repetition)
- Summarization (content from input)
- Q&A tasks (quoting source text)

**Key Files**:

- `src/services/LlamaService.ts` - Token predictor integration
- `src/components/settings/ModelSettings.tsx` - UI toggle
- `docs/features/SPECULATIVE_DECODING.md` - Full documentation

---

### ⚙️ Settings & Configuration

**Status**: ✅ Production Ready

Comprehensive settings for customizing SHIELD behavior.

**Categories**:

1. **General Settings**
   - Model selection and loading
   - Temperature, max tokens, context length
   - Chat templates (ChatML, Llama3, Alpaca, etc.)
   - System prompts

2. **Performance Settings**
   - GPU layer offloading (0-99 layers)
   - Context length limits
   - Thread count configuration
   - **Speculative decoding toggle**

3. **Web Search Settings**
   - Enable/disable web search
   - Max search results
   - Cache management

4. **MCP Settings**
   - Enable/disable MCP tools
   - View audit logs
   - Permission management

5. **Advanced Settings**
   - Keyboard shortcuts
   - Export/Import
   - Theme selection

**Key Files**:

- `electron/services/SettingsService.ts` - Settings persistence
- `src/store/settingsStore.ts` - Settings state
- `src/components/settings/*` - Settings UI components

---

## Performance Optimizations

### Bundle Size Reduction

- **Before**: 1,327 KB (440 KB gzipped) - single bundle
- **After**: 245 KB (73 KB gzipped) - optimized main bundle
- **Improvement**: 82% reduction in main bundle size

### Code Splitting

| Chunk             | Size      | Gzipped   | Load Strategy |
| ----------------- | --------- | --------- | ------------- |
| Main Bundle       | 244.50 KB | 73.14 KB  | Immediate     |
| Settings Dialog   | 32.33 KB  | 9.40 KB   | Lazy          |
| Template Selector | 9.29 KB   | 3.56 KB   | Lazy          |
| Code Block        | 13.36 KB  | 2.28 KB   | Lazy          |
| Markdown Vendor   | 779.48 KB | 270.32 KB | Lazy          |

**Result**: 65% smaller initial load (440 KB → 155 KB gzipped)

---

## Roadmap

### Planned Features

- **GPU Acceleration**: Enhanced GPU layer offloading with auto-detection
- **Multi-modal Support**: Image understanding capabilities
- **Voice Input**: Speech-to-text integration
- **Plugin System**: Extensible architecture for custom tools
- **Collaboration**: Share conversations and templates

See `ROADMAP.md` for detailed timeline and priorities.

---

## Detailed Feature Documentation

For in-depth technical documentation on specific features:

- **[GPU_LAYER_OFFLOADING.md](./features/GPU_LAYER_OFFLOADING.md)** - Running large models on limited VRAM
- **[MODEL_DOWNLOAD.md](./features/MODEL_DOWNLOAD.md)** - Model catalog and HuggingFace authentication
- **[MODEL_CAPABILITIES.md](./features/MODEL_CAPABILITIES.md)** - Dynamic feature enabling based on model specs
- **[EXPORT_IMPORT.md](./features/EXPORT_IMPORT.md)** - Technical details on conversation export/import
- **[WEB_SEARCH.md](./features/WEB_SEARCH.md)** - Web search implementation and privacy measures
- **[TAGGING.md](./features/TAGGING.md)** - Conversation tagging system architecture
- **[HELP_PAGE.md](./features/HELP_PAGE.md)** - Built-in help page implementation

---

## Feature Requests

Have an idea for a new feature? Check out `CONTRIBUTING.md` for how to submit feature requests and contribute to SHIELD.
