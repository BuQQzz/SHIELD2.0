# Refactoring Required - 300 Line Limit

## Critical Files Exceeding Limit

These files MUST be refactored before the next merge to main:

### 🔴 CRITICAL (500+ lines)
- **electron/main.ts** - ~~770 lines~~ ✅ **COMPLETED** (68 lines)
  - **Status**: Refactored into modular handler files
  - **Files created**:
    - `electron/services/LlamaIPCHandlers.ts` - llama.cpp IPC handlers (180 lines)
    - `electron/services/ConversationIPCHandlers.ts` - conversation IPC handlers (64 lines)
    - `electron/services/SearchIPCHandlers.ts` - web search IPC handlers (219 lines)
    - `electron/services/MCPIPCHandlers.ts` - MCP IPC handlers (132 lines)
    - `electron/services/SettingsIPCHandlers.ts` - settings IPC handlers (80 lines)
    - `electron/services/ModelIPCHandlers.ts` - model download IPC handlers (124 lines)
    - `electron/services/SystemIPCHandlers.ts` - system IPC handlers (27 lines)
    - `electron/services/WindowSetup.ts` - window creation and setup (66 lines)
    - `electron/services/SharedServiceInstances.ts` - shared service singletons (11 lines)
  - See `docs/TESTING_MAIN_REFACTORING.md` for testing plan

- **electron/services/WebCacheService.ts** - 449 lines
  - **Action**: Split into:
    - `WebCacheService.ts` - Core service (cache management)
    - `WebContentExtractor.ts` - Content extraction logic
    - `WebCacheStorage.ts` - Storage operations

### 🟡 HIGH PRIORITY (350-500 lines)
- **electron/services/WebSearchService.ts** - 388 lines
  - **Action**: Split into:
    - `WebSearchService.ts` - Main search orchestration
    - `SearchProviders/BraveSearchProvider.ts` - Brave API integration
    - `SearchResultProcessor.ts` - Result processing logic

- **src/handlers/messageHandler.ts** - 357 lines
  - **Action**: Already modular but needs further split:
    - Extract XML parsing patterns to `utils/thinkingParser.ts`
    - Extract truncation logic to `utils/messageTruncation.ts`
    - Keep only core message handling flow

- **electron/services/ModelDownloadService.ts** - 348 lines
  - **Action**: Split into:
    - `ModelDownloadService.ts` - Download orchestration
    - `HuggingFaceClient.ts` - HF API interactions
    - `DownloadProgress.ts` - Progress tracking logic

- **src/types/electron.d.ts** - 360 lines
  - **Status**: ✅ EXCLUDED (type definitions)

- **src/components/models/ModelDownloadDialog.tsx** - 332 lines
  - **Action**: Split into:
    - `ModelDownloadDialog.tsx` - Main dialog orchestration
    - `ModelBrowser.tsx` - Model catalog browsing
    - `DownloadQueue.tsx` - Download queue management
    - `ModelQuantizationSelector.tsx` - Quantization selection

### 🟢 MEDIUM PRIORITY (300-350 lines)
- **electron/services/MemoryService.ts** - 305 lines
  - **Action**: Split memory operations and cache management

- **electron/services/SettingsStorageService.ts** - 314 lines
  - **Action**: Split settings categories into separate files

- **electron/preload.ts** - 338 lines
  - **Action**: Split API groups:
    - `preload/llamaApi.ts`
    - `preload/conversationApi.ts`
    - `preload/mcpApi.ts`
    - `preload/searchApi.ts`
    - Main preload.ts imports and exposes them

- **src/services/LlamaService.ts** - 343 lines
  - **Action**: Extract:
    - Model loading logic to `ModelLoader.ts`
    - Context management to `ContextManager.ts`
    - Session management to `SessionManager.ts`

- **src/config/models.ts** - 485 lines
  - **Status**: ✅ EXCLUDED (data catalog, not logic)

## Refactoring Guidelines

1. **Extract by Responsibility**: Each module should have ONE clear purpose
2. **Maintain Tests**: Ensure all refactored code has corresponding tests
3. **Keep Interfaces Stable**: Don't break existing API contracts
4. **Document Dependencies**: Update imports and document module relationships
5. **Test After Split**: Run full test suite after each refactoring

## Timeline

- **Phase 1** (Before dynamic template system): Fix critical files (main.ts, WebCacheService)
- **Phase 2** (Next sprint): Fix high priority files
- **Phase 3** (Ongoing): Address medium priority files

## CI/CD Enforcement

The CI/CD pipeline now **strictly enforces** the 300-line limit with only these exceptions:
- `*.d.ts` - Type definition files
- `models.ts` - Model catalog (pure data)

All other files failing this check will block merges to main.
