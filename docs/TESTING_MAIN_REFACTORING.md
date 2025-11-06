# Testing Plan for electron/main.ts Refactoring

## Overview
The electron/main.ts file has been refactored from 863 lines to 68 lines by extracting IPC handlers into separate, focused modules.

## Files Modified
- `electron/main.ts` - Main entry point (863 → 68 lines)

## Files Created
1. `electron/services/SharedServiceInstances.ts` - Shared service singletons (11 lines)
2. `electron/services/LlamaIPCHandlers.ts` - Llama.cpp IPC handlers (180 lines)
3. `electron/services/ConversationIPCHandlers.ts` - Conversation management handlers (64 lines)
4. `electron/services/SearchIPCHandlers.ts` - Web search handlers (219 lines)
5. `electron/services/MCPIPCHandlers.ts` - MCP handlers (132 lines)
6. `electron/services/SettingsIPCHandlers.ts` - Settings handlers (80 lines)
7. `electron/services/ModelIPCHandlers.ts` - Model download handlers (124 lines)
8. `electron/services/SystemIPCHandlers.ts` - System handlers (27 lines)
9. `electron/services/WindowSetup.ts` - Window creation logic (66 lines)

## Required Tests

### 1. TypeScript Compilation
```bash
npx tsc --noEmit
```
**Expected**: No TypeScript errors

### 2. Linting
```bash
npm run lint
```
**Expected**: No linting errors or warnings

### 3. Build
```bash
npm run build
```
**Expected**: Successful build with no errors

### 4. Unit Tests
```bash
npm test
```
**Expected**: All existing tests pass

### 5. Functional Testing (Manual)

#### Llama Service (LlamaIPCHandlers.ts)
- [ ] Initialize llama service
- [ ] Load a model
- [ ] Send chat message (non-streaming)
- [ ] Send streaming chat message
- [ ] Get model info
- [ ] Check if model is loaded
- [ ] Clear chat history
- [ ] Set chat history
- [ ] Stop generation
- [ ] Set system prompt
- [ ] Get system prompt
- [ ] Generate conversation title

#### Conversation Management (ConversationIPCHandlers.ts)
- [ ] Save conversation
- [ ] Load conversation
- [ ] List conversations
- [ ] Delete conversation
- [ ] Search conversations
- [ ] Export conversation as JSON
- [ ] Export conversation as Markdown
- [ ] Import conversation from JSON

#### Web Search (SearchIPCHandlers.ts)
- [ ] Initialize web search service
- [ ] Perform search query
- [ ] Fetch web page content
- [ ] Cache operations (get, has, stats, clear, etc.)
- [ ] Verify cache functionality

#### MCP Integration (MCPIPCHandlers.ts)
- [ ] Initialize MCP service
- [ ] Call MCP tool
- [ ] List MCP tools
- [ ] Get server config
- [ ] Check if MCP is ready
- [ ] Query audit logs
- [ ] Get audit statistics
- [ ] Export audit logs
- [ ] Clear audit logs

#### Settings Management (SettingsIPCHandlers.ts)
- [ ] Load settings
- [ ] Save settings
- [ ] Export settings
- [ ] Import settings
- [ ] Reset settings
- [ ] Verify model directory updates propagate to services

#### Model Management (ModelIPCHandlers.ts)
- [ ] Download a model
- [ ] Cancel download
- [ ] Get download progress
- [ ] Get active downloads
- [ ] List installed models
- [ ] Check if model is installed
- [ ] Delete a model
- [ ] Get disk space usage

#### System Operations (SystemIPCHandlers.ts)
- [ ] Select directory dialog

#### Window Management (WindowSetup.ts)
- [ ] Create main window
- [ ] Window shows correctly
- [ ] DevTools open in dev mode
- [ ] Window state management

### 6. Integration Testing

#### Service Lifecycle
- [ ] App starts successfully
- [ ] All services initialize correctly
- [ ] Services are properly disposed on app close
- [ ] No memory leaks

#### Shared Instances
- [ ] Verify llamaService is singleton across handlers
- [ ] Verify modelDownloadService is singleton across handlers
- [ ] Settings changes propagate to all services using shared instances

## Known Considerations

### Architecture Changes
- Handler files are in `electron/services/` instead of `electron/ipc/` due to tooling constraints
- All handlers use `*IPCHandlers.ts` naming convention for clarity
- Shared service instances are managed in `SharedServiceInstances.ts`

### Backward Compatibility
- All IPC channel names remain unchanged
- All function signatures remain unchanged
- No breaking changes to the API

## Success Criteria
- ✅ electron/main.ts is under 300 lines (currently 68 lines)
- ✅ All handler files are under 300 lines
- [ ] TypeScript compiles without errors
- [ ] Linter passes with 0 warnings
- [ ] All tests pass
- [ ] Build succeeds
- [ ] All IPC handlers work as before
- [ ] No regression in functionality

## Rollback Plan
If issues are found:
1. Revert to previous main.ts structure
2. Investigate specific failing handler
3. Fix and re-test incrementally
