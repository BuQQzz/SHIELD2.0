# Changelog

All notable changes to SHIELD 2.0 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
