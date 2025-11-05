# SHIELD 2.0 Development Roadmap

## Project Overview
SHIELD 2.0 is a privacy-first, local AI chatbot for Windows with tool integration capabilities. All AI processing happens locally using llama.cpp - your data never leaves your device.

---

## ✅ Completed Milestones

### Phase 1: Foundation & Setup
- ✅ **Project initialization** - Set up Vite + React + TypeScript project structure
- ✅ **UI framework** - Integrated shadcn/ui component library with Lucide React icons
- ✅ **Chat interface** - Built responsive chat UI with sidebar, message list, and input
- ✅ **State management** - Implemented Zustand for lightweight state management
- ✅ **Framework updates** - Upgraded to React 19.2.0, Vite 7.1.12, TypeScript 5.7.3, Tailwind CSS 4.1.16, ESLint 9.39.0

**Status:** Foundation complete ✅

### Phase 2: Local AI Integration
- ✅ **llama.cpp integration** - Integrated node-llama-cpp 3.14.2 with GPU support
- ✅ **Model downloading** - Automatic model download from Hugging Face
- ✅ **Model management** - LlamaService wrapper with singleton pattern
- ✅ **Inference testing** - Validated streaming inference functionality
- ✅ **React hook** - Created useLlama hook for IPC bridge to React

**Status:** AI integration complete ✅

### Phase 3: Desktop Application Setup
- ✅ **Electron installation** - Configured Electron 39.0.0 (latest stable)
- ✅ **Main process** - Set up Electron main process with window management
- ✅ **IPC configuration** - Secure IPC via contextBridge and ipcRenderer
- ✅ **Vite integration** - Configured vite-plugin-electron for hot-reload
- ✅ **Security policies** - Implemented CSP and nodeIntegration=false
- ✅ **Development workflow** - Hot-reload working in dev mode

**Status:** Desktop app setup complete ✅

### Phase 4: Core Chat Functionality
- ✅ **Chat UI integration** - Connected chat interface to llama.cpp backend
- ✅ **Streaming responses** - Implemented token-by-token streaming display
- ✅ **Message history** - Conversation history with clear functionality
- ✅ **Model auto-load** - Qwen 7B loads automatically on startup
- ✅ **Error handling** - Comprehensive error states and user feedback
- ✅ **Loading states** - Model loading indicators and disabled states
- ✅ **Suggested prompts** - Clickable starter prompts for new users

**Status:** Core chat complete ✅

---

## 🚀 Upcoming Milestones

### Phase 5: Enhanced Features (Current Focus)

#### 1. UI/UX Improvements
**Priority:** HIGH | **Status:** ✅ Completed

- [x] Fix color rendering issues in Electron
- [x] Implement model selector UI (switch between Qwen/Llama/Mistral)
- [x] Add smooth Framer Motion animations throughout UI
- [x] Implement collapsible sidebar with icon-only minimal view
- [x] Create sleek borderless design with subtle shadow styling
- [x] Add stop/cancel generation button
- [x] Implement model download progress indicator
- [x] Add markdown rendering in chat messages
- [x] Implement code syntax highlighting
- [x] Add copy message functionality
- [x] Integrate Inter font for professional typography
- [x] Implement dark mode with theme provider
- [x] Add keyboard shortcuts (Ctrl+N, Ctrl+K, Ctrl+,, Escape)
- [x] Ultra minimal header design (settings in sidebar)
- [x] Unified shadow-based design system

**Dependencies:** None  
**Blockers:** None  
**Estimated Time:** ~~1-2 weeks~~ **COMPLETED**

**Completed Features:**
- ✅ Hardware-accelerated rendering color fix (yellow → white)
- ✅ Model selector dropdown with 3 models (Qwen 7B, Llama 3B, Mistral 7B)
- ✅ Comprehensive Framer Motion animations (messages, cursor, sidebar, buttons)
- ✅ Collapsible sidebar (260px ↔ 64px) with PanelLeft/Right icons
- ✅ Borderless design with consistent shadow styling (0 1px 3px rgba)
- ✅ Smooth transitions and hover effects throughout
- ✅ Stop/cancel generation with clean abort handling
- ✅ Model loading progress with dynamic status messages
- ✅ Markdown rendering with GitHub Flavored Markdown (react-markdown)
- ✅ Code syntax highlighting with oneDark theme (react-syntax-highlighter)
- ✅ Copy button on all messages with visual feedback
- ✅ **Inter variable font (weights 100-900) for optimal UI readability**
- ✅ **Dark mode with light/dark/system theme options**
- ✅ **Keyboard shortcuts for power users**
- ✅ **Settings moved to sidebar footer for minimal header**
- ✅ **ModelSelector with shadow styling (no borders)**
- ✅ **Consistent design language throughout app**

#### 2. Conversation Management
**Priority:** MEDIUM | **Status:** ✅ Completed

- [x] Persistent chat sessions (save/load)
- [x] Multiple conversation threads
- [x] Conversation search functionality
- [x] Delete conversations with inline confirmation UI
- [x] Auto-save after each message exchange
- [x] Conversation list with previews and timestamps
- [x] Automatic conversation titling using LLM
- [x] Context restoration across conversation switches
- [x] Memory persistence for LLM chat history
- [x] Export chat history (JSON, Markdown, ~~PDF~~)
- [x] Import previous conversations
- [x] Conversation tagging and organization

**Dependencies:** None  
**Blockers:** None  
**Estimated Time:** ~~1-2 weeks~~ **COMPLETED**

**Completed Features:**
- ✅ File-based conversation storage in Electron userData directory
- ✅ ConversationStorageService with save/load/list/delete/search operations
- ✅ Zustand conversation store for state management
- ✅ ConversationList UI component with metadata display
- ✅ Real-time conversation search and filtering
- ✅ Automatic conversation saving after each message
- ✅ date-fns integration for friendly timestamps
- ✅ Inline delete confirmation (replaced browser confirm dialog)
- ✅ Smooth animations for delete interactions
- ✅ LLM-powered automatic conversation titling (max 6 words)
- ✅ Low temperature (0.3) title generation
- ✅ Chat history restoration when switching conversations
- ✅ ChatMessage to ChatHistoryItem format conversion
- ✅ Auto-clear history for new conversations
- ✅ Auto-focus chat input for improved UX
- ✅ **Export conversations as JSON with metadata**
- ✅ **Export conversations as Markdown with formatting**
- ✅ **Import conversations from JSON with validation**
- ✅ **Native Electron file dialogs for export/import**
- ✅ **Per-conversation dropdown menu for export/import actions**
- ✅ **Conversation tagging system with add/remove functionality**
- ✅ **Tag component with animations and compact display**
- ✅ **Tags displayed in conversation list for quick visual filtering**
- ✅ **Tag management UI in chat header dropdown menu**

**Remaining:**
- ⏳ Tag-based filtering in search (future enhancement)
- ⏳ PDF export format (future enhancement)

---

### Phase 6: Web Search & Local Caching (🌟 UNIQUE FEATURE)

#### Web Search with Privacy-First Local Caching
**Priority:** HIGH | **Status:** ✅ **COMPLETED** (November 2025)

**Vision:** Enable the local LLM to search the web, fetch content, and cache it locally for offline access while maintaining SHIELD's privacy-first philosophy.

**Phase 1: Basic Web Search (MVP)** - ✅ COMPLETED
- [x] DuckDuckGo search integration (privacy-focused, no API key)
- [x] Web page fetching with content extraction
- [x] Local JSON/SQLite cache with encryption (AES-256-GCM)
- [x] Manual search trigger (toggle in settings)
- [x] Privacy settings (enable/disable, clear cache)
- [x] Visual source attribution in AI responses
- [x] Tracker blocking and request anonymization
- [x] User agent rotation and stealth mode
- [x] **Context-aware query enhancement** - Enriches vague follow-ups with conversation context
- [x] **Chain-of-Thought reasoning** - 3-step transparent analysis before answering
- [x] **Show Reasoning toggle** - Configurable visibility of AI's analysis steps
- [x] **Collapsible sources** - Clean source display with expand/collapse
- [x] **Smart follow-up detection** - Improved vague query filtering

**Phase 2: LLM Tool Integration** - 🚧 PARTIAL
- [x] LLM automatically decides when to search web (heuristic-based)
- [x] Multi-turn conversations with web context
- [x] Source tracking and citation system
- [ ] Function calling / tool use support (advanced)
- [ ] Per-conversation web access toggle
- [ ] Privacy confirmation dialogs

**Phase 3: RAG Enhancement** - 📋 Planned
- [ ] Local embedding model integration (all-MiniLM-L6-v2, 80MB)
- [ ] Vector database for semantic search (LanceDB)
- [ ] Content chunking and indexing
- [ ] Hybrid search (keyword + semantic)
- [ ] Automatic context expansion from cache

**Completed Features:**
- ✅ DuckDuckGo HTML search (no tracking, no JavaScript)
- ✅ Playwright-based page fetching with 3s timeout
- ✅ AES-256-GCM encrypted local cache
- ✅ Stealth mode (modified UA, anti-detection)
- ✅ Chain-of-Thought reasoning (STEP 1-3 analysis)
- ✅ Context extraction from last 4 messages
- ✅ Vague query detection with refined regex patterns
- ✅ Automatic query enhancement for follow-ups
- ✅ Temperature lowering (0.1) for factual responses
- ✅ Source attribution with "View Sources" UI
- ✅ Configurable settings (max results, cache expiry)
- ✅ Show/hide reasoning toggle
- ✅ Top 2 pages + 10 snippets fetching
- ✅ Graceful timeout and error handling

**Technical Implementation:**
- WebSearchService.ts - DuckDuckGo integration
- WebCacheService.ts - Encrypted local caching
- webSearchHelper.ts - Search orchestration logic
- queryEnhancer.ts - Context-aware query enhancement (143 lines)
- Enhanced vague detection patterns in isVagueFollowUpQuery()

**Privacy Features:**
- ✅ Zero tracking - no telemetry or analytics
- ✅ Local storage - all data stays on device
- ✅ Privacy-focused providers (DuckDuckGo)
- ✅ Request anonymization (custom UA, no cookies)
- ✅ Tracker blocking (ads, analytics, third-party)
- ✅ Encrypted cache (AES-256-GCM)
- ✅ User control (export, inspect, delete cache)
- ✅ Transparent operation (clear indicators)

**Performance:**
- ✅ Local caching (fetch once, use forever)
- ✅ Background operations (non-blocking)
- ✅ Smart deduplication and compression
- ✅ Configurable cache limits (500MB default)
- ✅ Memory cache + disk persistence

**Dependencies:** Core chat functionality ✅ Complete  
**Blockers:** None  
**Time Spent:** ~3 weeks (Oct-Nov 2025)  
**Documentation:** [docs/features/WEB_SEARCH.md](./features/WEB_SEARCH.md)

**Competitive Advantage:** Unlike Perplexity AI ($20/month) or ChatGPT with Bing (tracking), SHIELD offers:
- No subscription required
- Complete privacy (no tracking)
- Offline access after fetch
- Open source transparency
- Context-aware follow-ups

---

### Phase 7: Windows Tool Integration (MCP)

**Vision:** Enable SHIELD's local LLM to safely interact with Windows through official MCP servers while maintaining strict security, privacy, and explicit user consent.

#### Security-First MCP Strategy

**Official Servers Only:** SHIELD will exclusively use MCP servers from `@modelcontextprotocol` organization to avoid code injection risks prevalent in community servers.

**Official Reference Servers (Identified):**
1. **filesystem** - Secure file operations with configurable access controls
2. **git** - Read, search, and manipulate Git repositories  
3. **memory** - Knowledge graph-based persistent memory system
4. **fetch** - Web content fetching and conversion
5. **sequential-thinking** - Dynamic problem-solving through thought sequences

**Official Company Integrations (Production-Ready):**
- **GitHub** - Official GitHub integration
- **Microsoft Azure** - Azure services integration
- **Cloudflare** - Deploy, configure Cloudflare resources
- **And 50+ more official integrations** (see [MCP Servers Repository](https://github.com/modelcontextprotocol/servers))

#### Phase 7.1: MCP Research & Planning
**Priority:** HIGH | **Status:** ✅ Completed

- [x] Research official @modelcontextprotocol servers
- [x] Identify security requirements and best practices
- [x] Document official server capabilities
- [x] Evaluate filesystem server as proof-of-concept
- [x] Design security architecture
- [x] Create detailed implementation plan

**Completed Research:**
- ✅ Official MCP servers repository analyzed
- ✅ 6 reference servers identified (filesystem, git, memory, fetch, sequential-thinking, everything)
- ✅ 50+ official company integrations catalogued
- ✅ Security strategy defined (official-only, whitelist-based)
- ✅ Filesystem server evaluated and selected for implementation
- ✅ Security architecture designed and documented

#### Phase 7.2: Security Architecture Design
**Priority:** HIGH | **Status:** ✅ Completed

- [x] Design whitelist-based MCP server configuration
- [x] Plan sandboxing implementation (Electron contextIsolation)
- [x] Design permission system UI mockups
- [x] Plan audit logging architecture
- [x] Define version pinning strategy
- [x] Document network isolation approach

**Implemented Security Architecture:**

```typescript
// MCPServerConfig.ts - Production implementation
const OFFICIAL_MCP_SERVERS = {
  filesystem: {
    package: '@modelcontextprotocol/server-filesystem',
    version: '^2025.8.21', // Pinned version
    permissions: ['read', 'write', 'list'],
    allowedPaths: [
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Desktop')
    ],
    requiresApproval: true // Per-operation user confirmation
  }
};
```

**Security Layers (All Implemented):**
1. ✅ **Whitelist Validation** - Only official @modelcontextprotocol packages allowed
2. ✅ **Sandboxed Execution** - Isolated Electron processes with contextIsolation
3. ✅ **Permission System** - Explicit user approval for every tool call via dialogs
4. ✅ **Audit Logging** - All MCP operations logged locally for transparency
5. ✅ **Version Pinning** - Locked versions, manual security review before updates
6. ✅ **Path Restrictions** - Desktop and Documents only, validated before execution

#### Phase 7.3: Filesystem MCP Integration
**Priority:** MEDIUM | **Status:** ✅ Completed

- [x] Install @modelcontextprotocol/server-filesystem package
- [x] Create MCPService wrapper for server management
- [x] Implement file path restriction logic
- [x] Build permission dialog UI component
- [x] Add audit logging for file operations
- [x] Test basic file read/write/list operations
- [x] Document filesystem integration
- [x] **Implement XML-based tool calling format**
- [x] **Add MCP Settings UI for enable/disable control**
- [x] **Create comprehensive error handling**
- [x] **Build model capabilities system**
- [x] **Remove intent detection (simplified architecture)**

**Filesystem Tools Implemented:**
- ✅ Read file contents (with path restrictions)
- ✅ List directory contents
- � Write files (requires tool-calling model)
- 📋 Delete files (requires tool-calling model)
- � Search files (future enhancement)

**Tool Calling Format (XML):**
```xml
<tool_call>
  <server>filesystem</server>
  <tool>read_file</tool>
  <arguments>
    {"path": "C:\\Users\\Username\\Desktop\\file.txt"}
  </arguments>
</tool_call>
```

**Architectural Evolution:**
- ✅ **Initial Approach** - Intent detection for any LLM (regex-based)
- ✅ **November 2025 Update** - Removed intent detection, XML-only format
- ✅ **Current State** - Clean XML tool calling, model capabilities system
- ✅ **Reason** - Focus on proper tool-calling models, simpler maintenance

**Files Created (1,500+ lines):**
- `electron/services/MCPService.ts` (284 lines) - MCP lifecycle management
- `electron/services/MCPServerConfig.ts` (105 lines) - Security configuration
- `src/components/settings/MCPSettings.tsx` (49 lines) - Settings UI
- `electron/services/AuditLogService.ts` (248 lines) - Operation tracking
- `src/hooks/useMCP.ts` (165 lines) - React integration
- `src/components/dialogs/PermissionDialog.tsx` (177 lines) - Permission UI
- `src/hooks/useModelCapabilities.ts` (97 lines) - Capability detection

**Files Removed (-418 lines for cleaner architecture):**
- ~~`src/handlers/intentDetector.ts`~~ (deleted - 218 lines)
- ~~`src/handlers/intentDetector.test.ts`~~ (deleted - 200 lines)

**Documentation:**
- ✅ [docs/features/MCP_INTEGRATION.md](./features/MCP_INTEGRATION.md) - Complete integration guide
- ✅ [docs/features/MCP_TESTING_GUIDE.md](./features/MCP_TESTING_GUIDE.md) - Manual testing procedures
- ✅ [docs/features/MODEL_CAPABILITIES.md](./features/MODEL_CAPABILITIES.md) - Model requirements
- ✅ [docs/mcp-integration.md](./mcp-integration.md) - System overview

#### Phase 7.4: Permission System UI
**Priority:** HIGH | **Status:** ✅ Completed

- [x] Design permission dialog component
- [x] Implement approval workflow
- [x] Add audit log entry creation
- [x] Test permission denial handling
- [x] Build MCP status indicator (Off/Ready/Limited/Error)
- [x] Add capability warnings in UI

**Permission Dialog Features:**
- ✅ Clear description of requested operation
- ✅ Full file path display with security validation
- ✅ Approve/Deny buttons with clear actions
- ✅ Audit log entry creation for all decisions
- ✅ Graceful handling of user denial
- ✅ Framer Motion animations for smooth UX

**MCP Status Indicator:**
- ✅ **Off (gray)** - MCP disabled
- ✅ **Ready (green)** - Compatible model with tool calling
- ✅ **Limited (yellow)** - Model without tool calling support
- ✅ **Error (red)** - MCP initialization failed

#### Phase 7.5: Additional Official Servers
**Priority:** LOW | **Status:** 📋 Planned (Phase 10+)

- [ ] Evaluate git server integration
- [ ] Evaluate memory server integration
- [ ] Research GitHub official integration
- [ ] Test fetch server for enhanced web search
- [ ] Document each server's use case

**Future MCP Servers (After Tool-Calling Models):**
- git (repository analysis)
- memory (persistent agent memory)
- GitHub (code exploration)
- fetch (improved web content extraction)

**Dependencies:** Core chat functionality ✅ Complete  
**Blockers:** None  
**Completion Date:** November 2025  
**Total Development Time:** ~3 weeks
**Documentation:** ✅ Complete - [docs/features/MCP_INTEGRATION.md](./features/MCP_INTEGRATION.md)

**Resources:**
- [MCP Documentation](https://modelcontextprotocol.io/)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)

**Privacy & Security Commitment:**
- ✅ Official servers only (no community servers)
- ✅ Explicit user approval required for every operation
- ✅ Sandboxed execution environment
- ✅ Full audit logging of all MCP activity
- ✅ No telemetry or external reporting
- ✅ Transparent operation visible to user

**Architectural Simplification (November 2025):**
- ✅ Removed intent detection system (-418 lines)
- ✅ Single tool calling format (XML only)
- ✅ Model capabilities system (dynamic feature gating)
- ✅ Clear warnings for incompatible models
- ✅ Focus on proper tool-calling models (Llama 3.3 70B, Qwen 2.5 Coder 32B)

---

### Phase 7: User Experience & Configuration

#### 4. Build Settings and Configuration System
**Priority:** MEDIUM | **Status:** ✅ Completed

- [x] Create settings UI component
- [x] Add model parameter controls (temperature, top_p, top_k, context length)
- [x] Implement system preferences
- [x] Build privacy controls interface
- [x] Add comprehensive Help/About page with feature explanations
- [x] Implement persistent settings storage
- [x] Add export/import settings functionality
- [ ] Add tool permission management (when MCP integration is added)

**Dependencies:** #4 (Chat Functionality)  
**Blockers:** None  
**Estimated Time:** ~~1 week~~ **COMPLETED**

**Completed Features:**
- ✅ Settings dialog with tabbed interface
- ✅ ModelSettings component (temperature, max tokens, top-p, top-k, repeat penalty)
- ✅ SystemSettings component (theme selection, system prompt, toggles)
- ✅ PrivacySettings component (data management, telemetry controls)
- ✅ **HelpSettings component with comprehensive feature documentation**
- ✅ **In-app help page explaining all features and keyboard shortcuts**
- ✅ **Model settings explanations for user understanding**
- ✅ **Privacy & data information highlighting offline-first approach**
- ✅ **Getting started guide for new users**
- ✅ **Self-contained help (no external links required)**
- ✅ **SettingsStorageService for file-based settings persistence**
- ✅ **Settings stored in JSON format in userData directory**
- ✅ **Export settings to user-selected location**
- ✅ **Import settings from JSON with validation**
- ✅ **Reset to defaults functionality**
- ✅ **Settings automatically persist across app restarts**
- ✅ **Export/Import/Reset UI in Privacy settings tab**

**Remaining:**
- ⏳ Tool permission management (pending MCP integration in Phase 6)

#### 5. Implement Advanced Chat Features
**Priority:** MEDIUM | **Status:** ✅ Completed

- [ ] Set up local database (SQLite) for chat history (future enhancement)
- [x] Implement system prompt customization
- [x] Add temperature/max tokens UI controls (already functional via settings)
- [ ] Implement conversation branching (future enhancement)
- [x] Add message editing and regeneration
- [x] Implement chat templates
- [ ] Add voice input (speech-to-text) (future enhancement)

**Dependencies:** Conversation Management  
**Blockers:** None  
**Estimated Time:** ~~2 weeks~~ **COMPLETED**

**Completed Features:**
- ✅ System prompt customization with Apply button in settings
- ✅ Real-time system prompt updates to active LlamaChatSession
- ✅ IPC handlers for setSystemPrompt and getSystemPrompt
- ✅ TypeScript type definitions in LlamaAPI interface
- ✅ Model parameter controls (temperature, top-p, top-k, max tokens, repeat penalty)
- ✅ Live parameter updates already working via settings store
- ✅ Message editing with inline textarea and automatic regeneration
- ✅ Edit button on user messages (hover to reveal)
- ✅ Keyboard shortcuts for editing (Enter=save, Escape=cancel)
- ✅ Conversation trimming to edited point
- ✅ Message regeneration for alternative AI responses
- ✅ Regenerate button on assistant messages (hover to reveal)
- ✅ Fresh inference with same prompt and current settings
- ✅ Chat templates with 8 predefined configurations
- ✅ Template selector modal with visual grid
- ✅ Sparkles button in sidebar for template access
- ✅ Automatic settings application from templates
- ✅ Code organization: App.tsx refactored from 416 to 288 lines
- ✅ Extracted handlers: editMessageHandler, templateHandler, shortcuts
- ✅ CI/CD pipeline passing all checks

**Remaining:**
- ⏳ SQLite database migration (performance optimization)
- ⏳ Conversation branching (advanced feature)
- ⏳ Voice input/speech-to-text (accessibility enhancement)

#### 6. Add Dark Mode and Theme Customization
**Priority:** LOW | **Status:** ✅ Completed

- [x] Implement dark mode toggle (CSS variables already set up)
- [x] Add theme persistence
- [x] Create theme customization UI
- [ ] Support custom color schemes
- [x] Test all components in both themes
- [ ] Ensure accessibility compliance (WCAG)

**Dependencies:** None  
**Blockers:** None  
**Estimated Time:** ~~3-5 days~~ **COMPLETED**

**Completed Features:**
- ✅ Theme provider with light/dark/system modes
- ✅ Persistent theme selection across sessions
- ✅ Theme toggle in settings dialog
- ✅ All components tested in both themes
- ✅ shadcn/ui dark mode integration

**Remaining:**
- ⏳ Custom color scheme support (future enhancement)
- ⏳ WCAG accessibility audit

**Dependencies:** None  
**Blockers:** None  
**Estimated Time:** 3-5 days

---

### Phase 8: Model Capabilities & Tool Calling

**Status:** ✅ Completed (November 2025) | **Branch:** Merged to `main`

Following the MCP integration, this phase implemented a dynamic model capabilities system and simplified tool calling architecture.

#### 8.1: Model Capabilities System
**Priority:** HIGH | **Status:** ✅ Completed

- [x] Design ModelCapabilities interface (toolCalling, complexReasoning, etc.)
- [x] Create useModelCapabilities hook for React integration
- [x] Add capability metadata to all models
- [x] Implement capability-based feature gating
- [x] Build warning system for incompatible models
- [x] Update MCP status to show "Limited" for incompatible models
- [x] Create MODEL_CAPABILITIES.md documentation

**Completed Features:**
- ✅ **ModelCapabilities interface** - Structured capability flags
- ✅ **useModelCapabilities hook** - `supports`, `shouldEnable`, `getWarning(feature)`
- ✅ **Model metadata** - All models have capability definitions
- ✅ **Dynamic feature gating** - MCP auto-enabled for tool-calling models
- ✅ **Warning system** - Clear messages for feature limitations
- ✅ **MCP status indicator** - Shows "Limited" (yellow) for incompatible models
- ✅ **UI warnings** - Chat header + settings warnings for limited capability
- ✅ **Comprehensive documentation** - [MODEL_CAPABILITIES.md](./features/MODEL_CAPABILITIES.md)

**Current Model Capabilities:**
```typescript
// Qwen 7B, Llama 3B, Mistral 7B (Current)
{ toolCalling: false, complexReasoning: false, codeGeneration: true }

// Recommended for MCP (Future)
// Llama 3.3 70B, Qwen 2.5 Coder 32B, Mistral Large
{ toolCalling: true, complexReasoning: true, codeGeneration: true }
```

**Files Created:**
- `src/hooks/useModelCapabilities.ts` (97 lines)
- `docs/features/MODEL_CAPABILITIES.md` (165 lines)

**Dependencies:** MCP Integration ✅ Complete  
**Completion Date:** November 2025  
**Documentation:** [MODEL_CAPABILITIES.md](./features/MODEL_CAPABILITIES.md)

#### 8.2: Architecture Simplification - Intent Detection Removal
**Priority:** HIGH | **Status:** ✅ Completed

- [x] Remove intent detection system (intentDetector.ts, intentDetector.test.ts)
- [x] Update messageHandler.ts to remove fallback logic
- [x] Focus on XML-only tool calling format
- [x] Update all documentation to reflect changes
- [x] Add migration notes to CHANGELOG

**Architectural Changes:**
- ✅ **Removed intentDetector.ts** (218 lines) - Regex-based NLP detection
- ✅ **Removed intentDetector.test.ts** (200 lines) - Intent detection tests
- ✅ **Cleaned messageHandler.ts** (110 lines removed) - Removed fallback logic
- ✅ **XML-only tool calling** - Single format for all operations
- ✅ **Simplified architecture** - No dual-system complexity

**Rationale:**
- Intent detection added maintenance burden with two systems
- XML tool calling is MCP standard format
- Better to focus on models with native function calling
- Clearer user expectations via capability warnings

**Tool Calling Format (XML):**
```xml
<tool_call>
  <server>filesystem</server>
  <tool>read_file</tool>
  <arguments>
    {"path": "C:\\Users\\Username\\Desktop\\file.txt"}
  </arguments>
</tool_call>
```

**Files Deleted:**
- `src/handlers/intentDetector.ts` (218 lines)
- `src/handlers/intentDetector.test.ts` (200 lines)

**Documentation Updates:**
- ✅ Updated [mcp-integration.md](./mcp-integration.md) - Warning banner
- ✅ Updated [MODEL_CAPABILITIES.md](./features/MODEL_CAPABILITIES.md) - Removal notice
- ✅ Updated [CHANGELOG.md](../CHANGELOG.md) - Breaking changes
- ✅ Updated test guides - New enable procedures

**Dependencies:** MCP Integration ✅ Complete  
**Completion Date:** November 2025  
**Code Reduction:** -418 lines (cleaner codebase)

---

### Phase 9: File Operations (Future)

**Status:** 📋 Planned | **Branch:** TBD

Building on the MCP XML tool calling format, this phase will expand file operations with proper tool-calling models.

**Note:** This phase requires models with native function calling support (see MODEL_CAPABILITIES.md for recommendations).

#### 9.1: Write Operations
**Priority:** HIGH | **Status:** 📋 Planned

- [ ] Download model with native function calling (Llama 3.3 70B, Qwen 2.5 Coder 32B)
- [ ] Test XML tool calling for write operations
- [ ] Add write permission dialog with content preview
- [ ] Handle file overwrite confirmations
- [ ] Support multi-line content via XML arguments
- [ ] Validate safe file extensions (.txt, .md, .json, .csv)
- [ ] Block dangerous extensions (.exe, .bat, .ps1)
- [ ] Add write operation audit logging
- [ ] Test write operations end-to-end

**XML Format Example:**
```xml
<tool_call>
  <server>filesystem</server>
  <tool>write_file</tool>
  <arguments>
    {"path": "C:\\Users\\User\\Desktop\\file.txt", "content": "Hello World"}
  </arguments>
</tool_call>
```

**Dependencies:** Model with toolCalling: true  
**Estimated Time:** 1 week (after model download)

#### 9.2: Enhanced List Operations
**Priority:** MEDIUM | **Status:** 📋 Planned

- [ ] Format directory listings for readability
- [ ] Show file sizes in human-readable format
- [ ] Display last modified dates
- [ ] Group results (folders first, then files)
- [ ] Add file count summary
- [ ] Support filtering by extension
- [ ] Implement recursive listing option

**Dependencies:** Model with toolCalling: true  
**Estimated Time:** 3-5 days

#### 9.3: Delete Operations
**Priority:** MEDIUM | **Status:** 📋 Planned

- [ ] Test XML tool calling for delete operations
- [ ] Create strong confirmation dialogs
- [ ] Display file details before deletion
- [ ] Prevent system file deletion
- [ ] Add deletion audit logging
- [ ] Optional move to Recycle Bin (if possible)
- [ ] Test permission denial handling

**XML Format Example:**
```xml
<tool_call>
  <server>filesystem</server>
  <tool>delete_file</tool>
  <arguments>
    {"path": "C:\\Users\\User\\Desktop\\old.txt"}
  </arguments>
</tool_call>
```

**Dependencies:** Model with toolCalling: true  
**Estimated Time:** 3-5 days

#### 9.4: Advanced Features (Future)
**Priority:** LOW | **Status:** 📋 Planned

- [ ] File moving/renaming
- [ ] Batch operations
- [ ] File search by name pattern
- [ ] Content search (grep-like)
- [ ] JSON parsing and querying
- [ ] CSV data extraction

**Dependencies:** Write + Delete operations  
**Estimated Time:** 1-2 weeks

---

### Phase 9: Quality & Performance

#### 7. Performance Optimization and Testing
**Priority:** MEDIUM | **Status:** Partially Complete

- [x] Profile inference performance
- [x] Optimize memory usage
- [x] Implement lazy loading for components
- [x] Add code splitting
- [ ] Write unit tests (target >80% coverage)
- [ ] Write integration tests
- [ ] Create E2E tests for critical flows
- [ ] Benchmark on low-resource systems
- [ ] Optimize bundle size further

**Completed Optimizations:**
- ✅ Lazy loading system for heavy components
- ✅ Code splitting with manual chunks
- ✅ React.memo for ChatMessage, MessageContent
- ✅ useCallback optimizations
- ✅ Bundle size reduced by 82% (1,327 KB → 244 KB)
- ✅ ESBuild minification

**Remaining:**
- ⏳ Comprehensive unit tests
- ⏳ Integration tests
- ⏳ E2E test suite

**Dependencies:** #4 (Chat Functionality) ✅ Complete  
**Blockers:** None  
**Estimated Time:** ~~2-3 weeks~~ (partially complete, 1-2 weeks remaining)

#### 8. Security Hardening and Privacy Audit
**Priority:** HIGH | **Status:** Partially Complete

- [x] Implement tool execution sandboxing (MCP with permission system)
- [x] Audit all data flows for privacy leaks
- [x] Add permission verification layer (MCP permission dialogs)
- [x] Implement audit logging (AuditLogService)
- [x] Create security documentation (MCP docs)
- [ ] Implement secure storage for API keys/secrets (if needed)
- [ ] Run penetration testing
- [ ] Document privacy guarantees comprehensively
- [ ] Add security best practices to README

**Completed Security Measures:**
- ✅ MCP permission system with explicit user approval
- ✅ Sandboxed file operations (Desktop/Documents only)
- ✅ Audit logging for all MCP operations
- ✅ Path validation and traversal prevention
- ✅ Whitelist-based MCP server configuration
- ✅ Version pinning for security

**Remaining:**
- ⏳ Formal penetration testing
- ⏳ Comprehensive privacy policy document
- ⏳ Security audit documentation

**Dependencies:** MCP Integration ✅ Complete  
**Blockers:** None  
**Estimated Time:** ~~1-2 weeks~~ (partially complete, 3-5 days remaining)

---

### Phase 9: Documentation & Release

#### 9. Documentation and User Guides
**Priority:** MEDIUM | **Status:** In Progress

- [x] Write comprehensive README
- [x] Create installation guide (QUICK-START.md)
- [x] Document API for contributors (COMPONENT-API.md)
- [x] Add inline code documentation (JSDoc/TSDoc)
- [x] Create integration guide (LLM-INTEGRATION.md)
- [ ] Add troubleshooting guide
- [ ] Write privacy policy
- [ ] Add contributing guidelines
- [ ] Create video tutorials

**Dependencies:** All core features  
**Blockers:** None  
**Estimated Time:** 1 week

#### 10. Build and Distribution Setup
**Priority:** HIGH | **Status:** Not Started

- [ ] Configure Electron Builder for Windows
- [ ] Set up .exe installer generation
- [ ] Configure MSI installer (optional)
- [ ] Implement auto-update system
- [ ] Create CI/CD pipeline (GitHub Actions)
- [ ] Set up automated builds on push
- [ ] Test installation on clean Windows systems
- [ ] Create release checklist
- [ ] Prepare v1.0.0 release

**Dependencies:** All core features, #11 (Documentation)  
**Blockers:** None  
**Estimated Time:** 1-2 weeks

---

## 📊 Project Timeline

**Total Estimated Time:** ~8-12 weeks remaining

### November 2025 ✅
- ✅ Foundation & Framework Updates (Completed)
- ✅ llama.cpp Integration (Completed)
- ✅ Electron Setup (Completed)
- ✅ Core Chat Functionality (Completed)
- ✅ UI/UX Improvements - Complete (Completed)
- ✅ Conversation Management (Completed)
- ✅ Advanced Chat Features (Completed)
- ✅ Theme Customization (Completed)
- ✅ Web Search & Local Caching (Completed)
- ✅ Context-Aware Query Enhancement (Completed)
- ✅ Code Organization Refactoring (Completed)
- ✅ **MCP Integration - Complete** (Completed Nov 4, 2025)
  - Research & Planning ✅
  - Security Architecture ✅
  - Filesystem Integration ✅
  - Permission System ✅
  - Intent-Based Detection ✅

### December 2025 (Current Focus)
- 🎯 **Model Capabilities & Architecture Simplification** ✅ **COMPLETED**
  - Model capabilities system ✅
  - Intent detection removal ✅
  - XML-only tool calling ✅
  - Documentation updates ✅
- **Download Tool-Calling Models** (next priority)
  - Llama 3.3 70B or Qwen 2.5 Coder 32B
  - Test MCP with native function calling
- **File Operations** (after model download)
  - Write operations
  - Enhanced list formatting
  - Delete operations
  - Advanced features
- **Performance Optimization** (continue improvements)
- **Testing & Quality Assurance** (unit tests, integration tests)

### January 2026
- Additional MCP servers (git, memory, GitHub)
- Security Audit & Hardening
- Comprehensive Testing Suite
- Documentation Polish

### February - March 2026
- Final Documentation
- Build & Distribution Setup
- Beta Testing
- **v1.0.0 Release**

---

## 🎯 Success Criteria

- [x] All AI inference runs locally (zero external API calls)
- [x] User data never leaves the device
- [x] Support for multiple LLM models (GGUF format)
- [x] Fast inference on consumer hardware
- [x] Clean, accessible UI
- [x] **Privacy-first web search with local caching**
- [x] **Context-aware query enhancement**
- [x] **All source files under 300 lines**
- [x] **Windows tool integration with explicit permissions (MCP)**
- [x] **Revolutionary intent-based file operations**
- [ ] Comprehensive documentation (in progress)
- [ ] Easy installation for non-technical users
- [ ] Performance optimized for 8GB RAM systems
- [ ] Full file operation suite (write, delete, search)

---

## 📝 Notes

- **Privacy-First:** Every feature must maintain the privacy guarantee ✅
- **Performance:** Target smooth performance on systems with 8GB RAM (in progress)
- **Security:** All tool executions require explicit user permission ✅
- **Modularity:** Keep files under 300 lines, use clear separation of concerns ✅
- **Testing:** Write tests as features are developed, not after (in progress)
- **Documentation:** Update docs immediately when code changes ✅
- **MCP-First:** Leverage MCP protocol for secure, standardized tool integration ✅

---

**Last Updated:** November 2025

**Recent Completions:**
- ✅ **Model Capabilities System - COMPLETE** (Nov 2025)
  - Dynamic feature gating based on model capabilities
  - MCP status shows "Limited" for incompatible models
  - Warning system in UI (header + settings)
  - Comprehensive documentation (MODEL_CAPABILITIES.md)
- ✅ **Architecture Simplification - COMPLETE** (Nov 2025)
  - Removed intent detection system (-418 lines)
  - XML-only tool calling format
  - Cleaner, more maintainable codebase
  - Updated all documentation
- ✅ **MCP Integration - COMPLETE** (Nov 2025)
  - Filesystem operations with XML tool calling
  - Permission dialog system
  - Audit logging
  - Security architecture
  - Cross-platform path handling
- ✅ Web Search with DuckDuckGo integration (Nov 2025)
- ✅ Chain-of-Thought reasoning for accurate answers (Nov 2025)
- ✅ Context-aware query enhancement (Nov 2025)
- ✅ Code refactoring - all files <300 lines (Nov 2025)
- ✅ CI/CD pipeline improvements (ESLint, Prettier, line count checks)

**Current Focus:**
- 🎯 Download models with native function calling (Llama 3.3 70B, Qwen 2.5 Coder 32B)
- 🎯 Test MCP with tool-calling models
- 🎯 Verify MCP shows "Ready" (green) for compatible models

**Next Up:**
- File Operations (write, delete, advanced features) - requires tool-calling model
- Performance optimization (comprehensive testing)
- Additional MCP servers (git, memory, GitHub)
- Documentation polish and user guides
