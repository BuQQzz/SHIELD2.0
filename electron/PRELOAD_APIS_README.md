# Electron Preload API Modules

This directory contains modular API implementations for the Electron preload script.

## Overview

The preload script exposes secure APIs to the renderer process via Electron's `contextBridge`. To maintain the 300-line limit per file, the APIs are split into focused modules.

## Module Structure

### Main File
- **`preload.ts`** (32 lines)
  - Imports all API modules
  - Exposes them to renderer via `contextBridge.exposeInMainWorld()`
  - Main orchestration only, no implementation

### API Modules

Each module exports its API implementation and is imported by the main preload.ts:

- **`llamaApi.ts`** (44 lines)
  - Llama.cpp inference API
  - Model loading, chat, streaming, generation control
  - Exposed as `window.llama`

- **`conversationApi.ts`** (14 lines)
  - Conversation CRUD operations
  - Save, load, list, delete, search conversations
  - Exposed as `window.conversations`

- **`settingsApi.ts`** (23 lines)
  - Settings management
  - Load, save, import, export, reset
  - Exposed as `window.electronAPI.settings` and `window.electronAPI.settingsPersistence`

- **`exportApi.ts`** (11 lines)
  - Conversation export/import
  - JSON and Markdown formats
  - Exposed as `window.electronAPI.export`

- **`searchApi.ts`** (20 lines)
  - Web search integration
  - Query, fetch, cache management
  - Exposed as `window.electronAPI.webSearch`

- **`mcpApi.ts`** (20 lines)
  - Model Context Protocol integration
  - Tool calls, server config, audit logs
  - Exposed as `window.electronAPI.mcp`

- **`modelApi.ts`** (29 lines)
  - Model download management
  - Download, cancel, progress tracking
  - Exposed as `window.electronAPI.modelDownload`

- **`systemApi.ts`** (7 lines)
  - System utilities
  - Directory selection, etc.
  - Exposed as `window.electronAPI.system`

## Type Safety

All modules import types from `src/types/electron.d.ts` to ensure type safety across the IPC boundary.

## Adding New APIs

To add a new API:

1. Create a new module file (e.g., `newApi.ts`)
2. Import necessary types from `../src/types/electron.d.ts`
3. Export your API implementation
4. Import it in `preload.ts`
5. Add it to the appropriate `contextBridge.exposeInMainWorld()` call
6. Ensure the file stays under 300 lines

## Design Principles

- **Single Responsibility**: Each module handles one API domain
- **No Logic in Preload**: Main preload.ts is pure orchestration
- **Type Safety**: All APIs use TypeScript interfaces
- **Security**: All IPC communication through secure contextBridge
- **Modularity**: Easy to add, remove, or modify APIs independently
