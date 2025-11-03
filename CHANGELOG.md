# Changelog

All notable changes to SHIELD 2.0 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
  - Model selector dropdown animations
- **Model selector UI** with 3 model options
  - Qwen 7B (4.4GB) - Excellent multilingual
  - Llama 3B (1.9GB) - Fast, smaller model
  - Mistral 7B (4.1GB) - Good general purpose

### Fixed
- Color rendering issues in Electron (hardware-accelerated rendering fix)
- Chat layout not expanding when sidebar collapses
- "This operation was aborted" error messages appearing to users
- Border persistence when sidebar collapsed

### Changed
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
