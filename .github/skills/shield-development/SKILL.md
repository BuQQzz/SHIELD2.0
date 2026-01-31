---
name: shield-development
description: Core development guidelines for SHIELD 2.0 - a privacy-first local AI chatbot. Use this when writing code, creating files, or making architectural decisions in the SHIELD project.
---

# SHIELD 2.0 Development Guidelines

## Project Overview

SHIELD 2.0 is a privacy-first, local AI chatbot for Windows with tool integration. All AI inference runs locally using llama.cpp via node-llama-cpp.

## Code Organization Rules

### Strict Line Limit

- **Maximum 300 lines per file** - No exceptions
- When approaching limit, refactor into smaller modules
- Use barrel exports (index.ts) for clean imports

### Directory Structure

```
src/
├── components/     # React components (shadcn/ui)
├── hooks/          # Custom React hooks
├── services/       # Business logic services
├── stores/         # Zustand state management
├── types/          # TypeScript interfaces
├── utils/          # Utility functions
├── config/         # Configuration files
└── handlers/       # Message/event handlers

electron/
├── ipc/            # IPC handlers (one file per domain)
├── services/       # Main process services
└── setup/          # Window and app setup
```

## Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Components**: PascalCase (`ChatInterface.tsx`)
- **Functions/Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Types/Interfaces**: PascalCase

## UI Guidelines

- Use **shadcn/ui** components exclusively
- Use **Lucide React** for all icons
- Dark theme first, minimalistic design
- All components must be accessible

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **State**: Zustand stores
- **Styling**: Tailwind CSS + shadcn/ui
- **Desktop**: Electron
- **AI Engine**: node-llama-cpp (llama.cpp)

## Module Refactoring

When a file approaches 300 lines:

1. Identify logical groupings
2. Extract to separate modules
3. Use barrel exports
4. Update imports
5. Ensure tests pass

## Performance

- Lazy load components with React.lazy
- Use async/await for non-blocking operations
- Monitor memory for LLM operations
- Cache compiled models
