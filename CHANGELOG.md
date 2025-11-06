# Changelog

All notable changes to SHIELD 2.0 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **GPT-OSS Model Documentation** - Comprehensive guide for handling GPT-OSS specific output formats
  - Documented pipe-delimited channel format (`<|channel|>analysis<|message|>...`)
  - Added notes on chat template configuration
  - Included grammar file workarounds for non-native tool calling
  - Reference guide at [docs/GPT-OSS-NOTES.md](docs/GPT-OSS-NOTES.md)

- **Thinking Animation UI** for chain-of-thought transparency
  - Collapsible indicator shows AI's reasoning process (like ChatGPT/Claude)
  - Animated brain icon with pulse effect during streaming
  - Three-dot loading animation while thinking
  - Expand/collapse functionality for viewing reasoning
  - Automatically detects and parses multiple XML thinking formats:
    - `<analysis>...</analysis>`
    - `<thinking>...</thinking>`
    - `<thought>...</thought>`
    - `<chain_of_thought>...</chain_of_thought>`
    - Complex nested format `<start><analysis>...<end>` (GPT OSS 20B)
  - Extracts thinking from response and displays separately
  - Cleans XML wrapper tags from visible output
  - Default collapsed state - users can expand to see reasoning
  - Persists thinking in conversation history
  - Works with models that output chain-of-thought analysis
  - Improves transparency into AI decision-making
  - See [Thinking Animation Guide](docs/features/THINKING_ANIMATION.md)

- **GPU Layer Offloading** for running large models on limited hardware
  - Enables 32B+ models on GPUs with 12GB VRAM or less
  - Automatic hybrid CPU+GPU inference using llama.cpp's layer splitting
  - `gpuLayers: "auto"` parameter intelligently distributes layers between VRAM and RAM
  - Warning system notifies users when offloading occurs
  - Performance trade-off: slower than full VRAM but enables model access
  - Comprehensive documentation at `docs/features/GPU_LAYER_OFFLOADING.md`
  - Technical details:
    - llama.cpp splits model into layers
    - Loads as many layers as possible into VRAM (fast)
    - Automatically offloads remaining layers to system RAM (slower)
    - No user configuration needed - works automatically
  - Example: Qwen 2.5 Coder 32B (18GB) on RTX 3060 (12GB VRAM)
    - ~25 layers in VRAM, ~8 layers in RAM
    - Achieves ~8-12 tokens/s (vs impossible without offloading)
  - Based on research from llama.cpp and node-llama-cpp documentation
  - See [GPU Layer Offloading Guide](docs/features/GPU_LAYER_OFFLOADING.md)

### Changed

- **Codebase Cleanup** - Removed verbose debug logging for production readiness
  - Cleaned `messageHandler.ts`: Removed query enhancement, prompt preview, truncation check logs
  - Cleaned `queryEnhancer.ts`: Removed verbose enhancement process logs
  - Cleaned `useLlama.ts`: Removed initialization, model loading, system prompt debug logs
  - Cleaned `LlamaService.ts`: Removed model path, context size fallback logs
  - Cleaned `useInstalledModels.ts`: Removed file matching and model discovery logs
  - Kept essential error logging (console.error, console.warn for issues)
  - All files pass linter with zero warnings
  - Production-ready logging that focuses on errors and important warnings only

- **Model Capabilities System** for dynamic feature management
  - Automatically enables/disables features based on model specifications
  - Capability detection: toolCalling, complexReasoning, webSearch, structuredOutput
  - Visual warnings when using features model doesn't support well
  - MCP shows "Limited" state for models without native tool calling
  - Yellow warning boxes in settings explaining limitations
  - Tooltips with helpful guidance on when to switch models
  - Smart feature recommendations based on model strengths
  - Files created:
    - `src/hooks/useModelCapabilities.ts` (93 lines) - Capability checking hook
    - `docs/features/MODEL_CAPABILITIES.md` - Complete documentation
  - Updated files:
    - `src/config/models.ts` - Added ModelCapabilities interface and metadata for all models
    - `src/components/chat/MCPStatus.tsx` - Shows warnings for incompatible models
    - `src/components/settings/MCPSettings.tsx` - Warning box for model limitations
    - `src/components/chat/ModelSelector.tsx` - Added capabilities field
    - `src/App.tsx` - Pass current model to settings dialog

- **MCP (Model Context Protocol) Integration** for secure filesystem operations
  - XML-based tool calling format for AI-to-system communication
  - Requires models trained on function calling (e.g., Llama 3.3 70B, Qwen 2.5 Coder 32B)
  - Model Capabilities System shows warnings for models without native tool calling
  - Supports filenames with spaces (e.g., "hello friend.txt")
  - Permission dialog for explicit user approval of all operations
  - Security-first approach with path restrictions
  - Only Desktop and Documents directories allowed by default
  - Tilde path expansion (~) for cross-platform compatibility
  - Official @modelcontextprotocol/server-filesystem v2025.8.21 integration
  - Operations supported: read_file, write_file, list_directory
  - XML tool call format:
    ```xml
    <tool_call>
    <server>filesystem</server>
    <tool>write_file</tool>
    <arguments>{"path": "C:\\Users\\...\\file.txt", "content": "..."}</arguments>
    </tool_call>
    ```
  - **Unified Toggle UX** - One-click enable/disable from main UI or settings
  - **Header Button** - Quick access MCP toggle in chat header (top-right)
  - **Settings Panel** - Full control in settings with helpful tips
  - **Auto-sync** - Both UI locations stay perfectly synchronized
  - **Auto-initialization** - Enabling automatically initializes MCP service
  - **Persistent settings** - All MCP settings save across app restarts
  - **Status indicators** - Clear visual feedback (Off/Initializing/Ready/Limited/Error)
  - **Enhanced System Prompt** - Strongly directive prompting with examples
  - **Critical Bug Fix** - setSystemPrompt() now applies immediately while preserving chat history
  - Comprehensive error handling with user-friendly messages
  - Audit logging for all file operations
  - Files created:
    - `src/components/chat/MCPStatus.tsx` - Clickable status toggle button
    - `src/components/settings/MCPSettings.tsx` - Settings panel with capability warnings
    - `electron/services/MCPService.ts` (284 lines) - MCP server lifecycle management
    - `electron/services/MCPServerConfig.ts` (105 lines) - Security configuration
    - `docs/features/MCP_INTEGRATION.md` - Integration documentation
    - `docs/features/MCP_TESTING_GUIDE.md` - Manual testing guide
- **Context-aware query enhancement for web search** to prevent hallucination on follow-up questions
  - Intelligent detection of vague queries that need context enrichment
  - Automatic extraction of topics from recent conversation (last 4 messages)
  - Enhanced queries include relevant entities and keywords
  - Example: "their positions" → "NYC mayoral election Mamdani Cuomo their positions"
  - Prevents irrelevant search results (e.g., football positions when asking about candidates)
  - Only enhances short (<100 chars) vague queries to preserve user intent
  - Transparent logging shows original vs enhanced queries
  - New utility: `src/utils/queryEnhancer.ts` (143 lines)
  - Updated: `src/handlers/messageHandler.ts` to integrate enhancement
- **Improved vague follow-up detection** for smarter web search filtering
  - More specific pattern matching to reduce false positives
  - "check/look" now requires "again/once more" to be considered vague
  - Vague references must be standalone (e.g., "what about that?" not "what about X?")
  - Conjunctions and yes/no responses must be standalone to be filtered
  - Fixes issue where legitimate queries were incorrectly skipped
  - Updated: `src/handlers/webSearchHelper.ts` with refined patterns
- **Code organization improvements** for maintainability
  - Extracted web search logic into `src/handlers/webSearchHelper.ts` (180 lines)
  - Created reusable UI components in `src/components/settings/HelpComponents.tsx` (91 lines)
  - Extracted title generation into `src/services/titleGenerator.ts` (60 lines)
  - Refactored App.tsx from 308 → 199 lines (extracted to custom hooks)
  - Refactored messageHandler.ts from 378 → 262 lines (extracted web search helper)
  - Refactored HelpSettings.tsx from 353 → 289 lines (extracted UI components)
  - Refactored LlamaService.ts from 308 → 247 lines (extracted title generator)
  - Created `useAppHandlers.ts` (210 lines) for message/conversation handlers
  - Created `useModelLoader.ts` (67 lines) for model initialization logic
  - All source files now comply with <300 line limit
- **Performance optimizations** for faster load times and better runtime performance
  - Lazy loading system for heavy components (react-markdown, syntax highlighting)
  - Code splitting with manual chunk configuration for vendor libraries
  - React.memo optimizations for ChatMessage, MessageContent, ConversationList
  - useCallback optimizations for event handlers in App.tsx
  - Bundle size reduced by 82% (1,327 KB → 244 KB main bundle)
  - Initial transfer reduced by 65% (440 KB → 155 KB gzipped)
  - Lazy-loaded components:
    - SettingsDialog (32.33 KB) - loaded only when settings opened
    - TemplateSelector (9.29 KB) - loaded when selecting templates
    - CodeBlock (13.36 KB) - loaded when code blocks appear
    - MessageContent (779.48 KB) - defers markdown rendering
  - Manual vendor chunk splitting:
    - react-vendor (11.79 KB) - React core
    - ui-vendor (202.31 KB) - Framer Motion + Radix UI
    - utils-vendor (33.94 KB) - Zustand, date-fns, utilities
    - markdown-vendor (779.48 KB) - react-markdown + syntax highlighting (lazy)
  - Bundle visualization with rollup-plugin-visualizer (dist/stats.html)
  - ESBuild minification for faster builds (replaced Terser)
  - Memoized components prevent unnecessary re-renders
  - Stable function references with useCallback
  - Performance documentation in docs/PERFORMANCE.md
- **CI/CD pipeline fixes and code organization improvements**
  - Added missing TypeScript type definitions for setSystemPrompt and getSystemPrompt in LlamaAPI interface
  - Fixed type errors in src/hooks/useLlama.ts (lines 237, 253)
  - Resolved code formatting violations in 7 files
  - Refactored App.tsx from 416 lines to 288 lines (under 300-line project limit)
  - Extracted message handlers into src/handlers/editMessageHandler.ts (145 lines)
  - Created src/handlers/templateHandler.ts for template selection logic (32 lines)
  - Moved keyboard shortcuts to src/config/shortcuts.ts (48 lines)
  - GitHub Actions CI/CD pipeline now passing all checks
  - Improved code maintainability and adherence to project guidelines
- **Chat templates system** for quick-start conversations with pre-configured settings
  - 8 predefined templates with optimized configurations
  - General Assistant - balanced AI for everyday questions
  - Code Reviewer - expert code analysis and suggestions
  - Creative Writer - imaginative storytelling and content
  - Technical Expert - in-depth technical explanations
  - Learning Tutor - patient teaching with clear examples
  - Brainstorm Partner - idea generation and exploration
  - Writing Editor - improve clarity, grammar, and style
  - Research Assistant - organized information gathering
  - Each template includes custom system prompt, model settings, and starter prompts
  - Visual template selector modal with grid layout
  - Sparkles button in sidebar for quick access
  - Templates automatically configure temperature, max tokens, and other parameters
  - Icon-based visual identification for each template
  - Example prompts shown for each template
- **Message regeneration for alternative responses** for exploring different AI outputs
  - Regenerate button appears on hover for assistant messages
  - Re-runs inference with same user prompt
  - Removes old response and everything after it
  - Generates fresh response with new UUID
  - Applies current model settings to regenerated response
  - Updates conversation history automatically
  - Useful for getting different perspectives or better answers
- **Message editing with automatic regeneration** for conversation refinement
  - Edit button appears on hover for user messages
  - Inline textarea editor with save/cancel buttons
  - Keyboard shortcuts: Enter to save, Escape to cancel, Shift+Enter for newlines
  - Automatic conversation trimming to edited point
  - Regenerates AI response from edited message
  - Updates chat history via setChatHistory
  - "Save & Regenerate" button makes action clear
  - Preserves message timestamps and IDs
  - Applies current model settings to regenerated response
- **System prompt customization** for AI personality control
  - Custom system prompt field in System settings tab
  - Apply button with loading and success states
  - Real-time updates to active LlamaChatSession
  - System prompt persists across conversations
  - Default: "You are a helpful AI assistant."
  - Enables custom AI personalities (technical expert, creative writer, etc.)
  - Backend infrastructure: LlamaService methods (setSystemPrompt, getSystemPrompt, applySystemPrompt)
  - IPC handlers for secure main ↔ renderer communication
  - Preload API exposure via contextBridge
  - React hooks integration (useLlama)
- **Settings persistence system** for data portability and backup
  - SettingsStorageService for file-based settings management
  - Settings stored in JSON format in userData directory
  - Export settings to user-selected location with metadata
  - Import settings from exported JSON files with validation
  - Reset to defaults with confirmation dialog
  - Settings automatically merge with new defaults on updates (future-proof)
  - Export/Import/Reset UI in Privacy settings tab
  - Settings persist across app restarts
  - Type-safe validation for imported settings
- **Conversation tagging system** for organization
  - Add custom tags to conversations via ChatHeader dropdown menu
  - Tag component with remove functionality and animations
  - Tags displayed in conversation list for quick visual identification
  - Compact variant for space-efficient display in sidebar
  - Tag management UI with sub-menu for adding/removing tags
  - Tags persist with conversation data
  - Prevents duplicate tags with validation
  - Future: Tag-based filtering in search
- **Built-in Help & About page** for self-contained documentation
  - Comprehensive HelpSettings component explaining all features
  - App overview highlighting privacy-first, offline-first approach
  - Core features guide (conversation management, tags, export/import, dark mode)
  - Keyboard shortcuts reference (Ctrl+N, Ctrl+K, Ctrl+,, Escape)
  - Model settings explanations (temperature, max tokens, top-p, top-k, repeat penalty)
  - Privacy & data information (local processing, no telemetry, complete control)
  - Getting started guide for new users
  - Version information display
  - Integrated as 4th tab in settings dialog (Model | System | Privacy | Help)
  - No external links - completely self-contained for offline use
- **Conversation export/import system** for data portability
  - Export conversations as JSON (full data with metadata)
  - Export conversations as Markdown (human-readable format with emojis)
  - Import conversations from JSON files with validation
  - Native Electron file dialogs for save/open operations
  - Automatic filename generation from conversation titles
  - Validation checks for imported data structure
  - Export includes metadata (exportedAt timestamp, version)
  - Markdown format includes formatted headers, timestamps, and user/assistant emojis
- **Per-conversation dropdown menu** for contextual actions
  - Import conversation option (always available)
  - Export as JSON (when conversation active)
  - Export as Markdown (when conversation active)
  - Clear History option (with destructive styling)
  - Moved from sidebar to 3-dot menu in ChatHeader for cleaner UI
- **Inter font integration** for professional typography
  - Variable font supporting weights 100-900
  - Single file for all font weights (InterVariable.ttf)
  - Italic variant included (InterVariable-Italic.ttf)
  - SIL Open Font License 1.1
  - Optimized for UI/screen readability
- **Dark mode support** with theme provider
  - Light, dark, and system theme options
  - Persistent theme selection
  - Smooth theme transitions
  - System preference detection
- **Keyboard shortcuts** for power users
  - Ctrl+N: New conversation
  - Ctrl+K: Focus search
  - Ctrl+,: Open settings
  - Escape: Clear search/close dialogs
- **Conversation management system** with complete persistence
  - File-based storage in Electron userData directory
  - Automatic conversation saving after each message exchange
  - Real-time search and filtering of conversations
  - Conversation metadata (title, preview, message count, timestamps)
  - Create, load, delete, and search operations via IPC
  - date-fns integration for friendly relative timestamps
- **Automatic conversation titling** using LLM
  - Generates concise, descriptive titles from first user message
  - Low temperature (0.3) for focused title generation
  - Maximum 6 words for clean UI presentation
  - Fallback to "New Chat" if generation fails
  - Similar to Claude and ChatGPT's automatic naming
- **Conversation context restoration** for LLM memory
  - Persists chat history across conversation switches
  - Converts ChatMessage format to llama.cpp ChatHistoryItem format
  - Automatically restores context when loading conversations
  - Clears history when creating new conversations
- **Inline delete confirmation** for conversations
  - Animated confirmation UI within conversation card
  - "Delete" and "Cancel" buttons with smooth transitions
  - Replaces intrusive browser confirm dialog
  - Keeps users in flow without window pop-ups
- **Auto-focus chat input** for improved UX
  - Automatically focuses input on component mount
  - Re-focuses after sending messages
  - Focuses when generation completes
  - Ensures cursor is always visible and ready
- **Markdown rendering** with GitHub Flavored Markdown support (react-markdown + remark-gfm)
  - Enhanced heading styles (H1-H6) with larger, bolder typography
  - Bold and italic text formatting
  - Code blocks with syntax highlighting (react-syntax-highlighter)
  - Inline code with styled backticks
  - Tables, lists, blockquotes, and links support
  - OneDark theme for code syntax highlighting
- **Copy message functionality** with visual feedback
  - Copy button appears on message hover
  - Check icon confirmation for 2 seconds after copy
  - Clipboard API integration
- **Model loading progress indicator**
  - Dynamic status messages showing model name
  - Loading spinner with clear feedback
- **Stop/cancel generation button**
  - AbortController integration for clean cancellation
  - Silent error handling for user-initiated stops
  - Partial response preservation on abort
- **Collapsible sidebar** with icon-only minimal view
  - Smooth 260px ↔ 64px width transitions
  - PanelLeft/PanelRight toggle icons
  - Icon-only mode with New Chat, Clear History, Settings buttons
- **Borderless design system** with shadow-based depth
  - Consistent `0 1px 3px rgba(0, 0, 0, 0.12)` shadow styling
  - Removed all borders throughout UI
  - Native button elements for consistency
- **Framer Motion animations** throughout application
  - Message fade-in and slide-up animations
  - Streaming cursor with pulsing animation
  - Sidebar slide transitions
  - Button hover and tap effects

### Fixed

- **Vague follow-up detection too aggressive** - blocking legitimate web search queries
  - Pattern `/^(check|look|verify|confirm)` matched "look" in "look at their positions"
  - Now requires explicit re-check keywords: "check/look **again**" to be considered vague
  - Prevents false positives where users ask substantive questions with common verbs
  - Example fixed: "lets look at their positions" now correctly triggers web search
- **Web search hallucination on follow-up questions** with pronouns/references
  - Queries like "their positions" sent without conversation context
  - AI received generic search results (e.g., football positions instead of political positions)
  - Now enriches queries automatically with conversation context
  - Example: Question about NYC mayoral candidates → "their positions" enhanced with "NYC mayoral election Mamdani Cuomo"
  - Result: Relevant search results instead of hallucinated responses
- **ESLint violations** - 22 TypeScript `@typescript-eslint/no-explicit-any` errors across 5 files
  - Changed `any` types to `unknown` with proper type guards
  - Added `eslint-disable` comments only where truly necessary
  - Files: preload.ts, MemoryService.ts, WebCacheService.ts, WebSearchService.ts, electron.d.ts
- **Prettier formatting violations** - 11 files with code style inconsistencies
  - Applied `prettier --write` across all TypeScript/TSX/CSS/Markdown files
  - Enforced consistent formatting before commits
- **File line count violations** - 3 files exceeding 300-line modularity limit
  - App.tsx: 308 → 199 lines (extracted to useAppHandlers, useModelLoader hooks)
  - messageHandler.ts: 378 → 250 lines (extracted to webSearchHelper)
  - HelpSettings.tsx: 353 → 289 lines (extracted to HelpComponents)
  - All source files now under 300-line limit
- **Duplicate IPC handler registration** causing app crashes
  - Removed legacy SettingsService handlers from main.ts
  - Now using only SettingsStorageService for all settings operations
  - Removed unused settingsService import
  - Resolves UnhandledPromiseRejectionWarning on startup
  - Dev server starts cleanly without handler conflicts
  - Model selector dropdown animations
- **Model selector UI** with 3 model options
  - Qwen 7B (4.4GB) - Excellent multilingual
  - Llama 3B (1.9GB) - Fast, smaller model
  - Mistral 7B (4.1GB) - Good general purpose

### Fixed

- **Linting errors in ExportService.ts** for code quality
  - Removed unused `path` import
  - Prefixed unused destructured variables with underscore (`_exportedAt`, `_version`)
  - Replaced `any` type with `unknown` for better type safety
  - Added proper type guards for validation
- **File line count violation** in App.tsx
  - Extracted `handleContinue` logic to separate `continuationHandler.ts`
  - Reduced App.tsx from 343 to 264 lines
  - Improved code organization and modularity
  - Maintains 300-line limit requirement
- Color rendering issues in Electron (hardware-accelerated rendering fix)
- Chat layout not expanding when sidebar collapses
- "This operation was aborted" error messages appearing to users
- Border persistence when sidebar collapsed

### Changed

- **Ultra minimal header design** for cleaner UI
  - Moved Settings from header to sidebar footer
  - Header now only contains: menu toggle, branding, model selector, options menu
  - Settings accessible in both expanded and collapsed sidebar states
- **Unified shadow-based design system**
  - ModelSelector uses shadow styling instead of border (matches other buttons)
  - Removed border above Settings button in sidebar
  - All UI elements use consistent `boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)"`
  - Cohesive, minimal aesthetic throughout app
- **Reorganized conversation actions** for better UX
  - Export/import moved from sidebar to per-conversation dropdown menu
  - Clear History moved to conversation dropdown menu
  - Actions are now contextual to active conversation
  - Cleaner, more minimal sidebar with just New Chat and search
- **MAJOR: Upgraded to React 19.2.0** from 18.3.1
  - Added support for Actions, `useActionState`, `useOptimistic` hooks
  - New `use()` API for reading resources in render
  - `ref` now available as a regular prop
  - Improved Suspense with sibling pre-warming
  - Enhanced server-side rendering capabilities
  - Breaking changes: Requires new JSX transform, removed `propTypes`/`defaultProps` for functions
- **MAJOR: Upgraded to Tailwind CSS 4.1.16** from 3.4.14
  - Migrated to new CSS-first configuration using `@theme` directive
  - Removed `tailwind.config.js` and `postcss.config.js` (no longer needed)
  - All configuration now in `src/index.css` using `@theme`, `@plugin`, `@keyframes`
  - Significant performance improvements with new CSS engine
  - Maintained all existing color themes and design tokens
- **MAJOR: Upgraded to Vite 7.1.12** from 5.4.10
  - Enhanced build performance and HMR speed
  - Better ES module handling
  - Improved development server capabilities
- **Upgraded TypeScript to 5.9.3** from 5.6.3
  - Enhanced type checking accuracy
  - Performance improvements in compilation
- **Upgraded ESLint to 9.39.0** from 9.13.0
  - Updated `eslint-plugin-react-hooks` to 6.1.0 with React 19 support
  - Maintained flat config format compatibility
- **Updated @types/react to 19.0.0** and **@types/react-dom to 19.0.0**
  - Type definitions aligned with React 19 API changes
- **Updated @vitejs/plugin-react to 5.0.0**
  - Full React 19 and Vite 7 compatibility

### Removed

- Removed `tailwind.config.js` (replaced by CSS-first configuration)
- Removed `postcss.config.js` (no longer required in Tailwind v4)

### Added

- Complete chat UI interface with minimalistic design
  - Responsive sidebar with chat history, search, and settings
  - Chat header with model selector and action buttons
  - Message list component with auto-scroll functionality
  - Auto-expanding chat input with send/stop controls
  - Welcome placeholder screen with suggested prompts
- Zustand state management for UI persistence
- ChatLayout component with responsive mobile/desktop behavior
- Seven modular chat components (all under 300 lines):
  - `ChatLayout.tsx` - Main responsive container
  - `Sidebar.tsx` - Collapsible navigation sidebar
  - `ChatHeader.tsx` - Top navigation bar
  - `ChatPlaceholder.tsx` - Welcome screen
  - `MessageList.tsx` - Scrollable message display
  - `ChatInput.tsx` - Auto-expanding input field
  - `chat-store.ts` - Zustand state management
- Initial project setup with React, TypeScript, and Vite
- GitHub Copilot instructions with comprehensive development guidelines
- CI/CD pipeline with GitHub Actions for automated testing
- Contributing guidelines with pre-merge requirements
- 300 line code limit enforcement
- Documentation standards and maintenance guidelines
- Web research requirements for latest updates
- shadcn/ui component library integration
- Lucide React icons support
- Basic project structure and configuration files

### Changed

- Refactored App.tsx to use complete chat UI system
- Added zustand dependency for state management

### Development Guidelines Established

- Feature branch workflow (no direct merges to main)
- Mandatory test suite execution before merge
- MCP-first automation approach
- Privacy-first architecture principles
- llama.cpp integration framework

## [0.1.0] - 2025-11-03

### Added

- Initial repository creation
- Project documentation (README, CONTRIBUTING, CHANGELOG)
- Development environment configuration
- Git workflow and branching strategy
- Automated CI/CD pipeline

---

## Legend

- `Added` - New features
- `Changed` - Changes in existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Security improvements
