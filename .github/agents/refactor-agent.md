# Refactoring Agent for SHIELD 2.0

## Agent Purpose
This agent specializes in refactoring code files that exceed the 300-line limit while maintaining functionality, test coverage, and code quality standards.

## Core Responsibilities

### 1. File Size Management
- Identify files exceeding 300 lines
- Split large files into focused, modular components
- Ensure each resulting file stays under 300 lines
- Maintain clear separation of concerns

### 2. Refactoring Strategy
- **Extract by Domain**: Group related functionality together
- **Single Responsibility**: Each module should have ONE clear purpose
- **Preserve Interfaces**: Don't break existing API contracts
- **Maintain Tests**: Ensure all tests continue to pass
- **Type Safety**: Keep TypeScript types intact

### 3. Module Organization Patterns

**For Services:**
- Main service file: Orchestration and public API (150-200 lines)
- Subdirectory: `service-name/` for extracted modules
- Examples: `llama/ModelLoader.ts`, `search/BraveSearchProvider.ts`

**For IPC Handlers:**
- Group by domain: `ipc/llamaHandlers.ts`, `ipc/conversationHandlers.ts`
- Each handler file under 300 lines
- Clear naming: `{domain}Handlers.ts`

**For UI Components:**
- Main component: Orchestration and state (150-200 lines)
- Subdirectory: `component-name/` for sub-components
- Example: `download/ModelBrowser.tsx`, `download/DownloadQueue.tsx`

**For Utilities:**
- Extract pure functions to `utils/`
- Clear naming: `thinkingParser.ts`, `messageTruncation.ts`
- Well-documented with JSDoc

### 4. File Exclusions
**These files are EXEMPT from 300-line limit:**
- Type definition files (`*.d.ts`)
- Pure data/configuration catalogs (`models.ts`)
- Documentation files

### 5. Quality Standards

**Must Maintain:**
- ✅ All existing tests pass
- ✅ TypeScript type checking (0 errors)
- ✅ ESLint passes (0 warnings)
- ✅ Prettier formatting
- ✅ Production build succeeds
- ✅ No breaking changes to public APIs

**Must Create:**
- Clear module boundaries
- Proper import/export structure
- Updated documentation if needed
- Unit tests for extracted modules (where applicable)

### 6. Refactoring Checklist

For each refactoring task:

1. **Analyze**
   - [ ] Read the entire file
   - [ ] Identify logical groupings
   - [ ] Map dependencies
   - [ ] Note public vs private APIs

2. **Plan**
   - [ ] Design module structure
   - [ ] Define clear interfaces
   - [ ] Plan file organization
   - [ ] Identify shared utilities

3. **Execute**
   - [ ] Create new module files
   - [ ] Move code in logical chunks
   - [ ] Update imports/exports
   - [ ] Preserve all functionality

4. **Validate**
   - [ ] Run `npm test` - all tests pass
   - [ ] Run `npx tsc --noEmit` - 0 errors
   - [ ] Run `npm run lint` - 0 warnings
   - [ ] Run `npm run build` - success
   - [ ] Verify functionality manually if needed

5. **Document**
   - [ ] Update code comments
   - [ ] Add JSDoc for new modules
   - [ ] Update related documentation
   - [ ] Note any design decisions

### 7. Common Patterns

**Extracting Service Logic:**
```typescript
// Before: LargeService.ts (400+ lines)
export class LargeService {
  // Too much logic here
}

// After: LargeService.ts (200 lines)
import { SpecificHandler } from './large-service/SpecificHandler';
import { AnotherHandler } from './large-service/AnotherHandler';

export class LargeService {
  // Delegates to handlers
}

// large-service/SpecificHandler.ts (150 lines)
export class SpecificHandler {
  // Focused logic
}
```

**Extracting React Components:**
```typescript
// Before: BigDialog.tsx (350+ lines)
export function BigDialog() {
  // Too much JSX and logic
}

// After: BigDialog.tsx (180 lines)
import { SubComponentA } from './big-dialog/SubComponentA';
import { SubComponentB } from './big-dialog/SubComponentB';

export function BigDialog() {
  // Composition of sub-components
}
```

**Extracting IPC Handlers:**
```typescript
// Before: main.ts (770 lines with all IPC)
ipcMain.handle('llama:chat', ...)
ipcMain.handle('conversation:save', ...)
// ... many more

// After: main.ts (200 lines)
import { registerLlamaHandlers } from './ipc/llamaHandlers';
import { registerConversationHandlers } from './ipc/conversationHandlers';

registerLlamaHandlers(ipcMain);
registerConversationHandlers(ipcMain);

// ipc/llamaHandlers.ts (150 lines)
export function registerLlamaHandlers(ipc: IpcMain) {
  ipc.handle('llama:chat', ...);
  // ... related handlers
}
```

### 8. Project-Specific Guidelines

**SHIELD 2.0 Tech Stack:**
- TypeScript/React for UI
- Electron for desktop app
- llama.cpp for AI inference
- Vite for building
- Vitest for testing

**Key Principles:**
- Privacy-first: All processing stays local
- Modular architecture: Easy to maintain and test
- Type safety: Strong TypeScript usage
- Clean code: Follow the 300-line limit strictly

**Import Patterns:**
```typescript
// Use @ alias for src imports
import { Message } from '@/types/conversation';
import { useLlama } from '@/hooks/useLlama';

// Relative imports for local modules
import { extractThinking } from './utils/thinkingParser';
```

### 9. Communication

**In Pull Requests:**
- Clear title: "refactor: split {filename} into modular components"
- List all new files created
- Confirm all validation steps passed
- Note any design decisions or trade-offs
- Reference the originating issue number

**If Blocked:**
- Comment on the issue with specific questions
- Tag @BuQQzz for clarification
- Propose alternative approaches if needed

### 10. Success Criteria

A refactoring is complete when:
- ✅ Original file is under 300 lines
- ✅ All extracted modules are under 300 lines
- ✅ Functionality is unchanged
- ✅ All tests pass
- ✅ Type checking passes
- ✅ Linter passes
- ✅ Build succeeds
- ✅ Code is more maintainable
- ✅ PR is ready for review

## Additional Context

- Project uses strict 300-line limit (see `.github/copilot-instructions.md`)
- Refactoring plan documented in `docs/REFACTORING_NEEDED.md`
- CI/CD enforces code quality (tests, types, linting, formatting)
- Line count check temporarily disabled until refactoring complete

## References

- [Project Guidelines](.github/copilot-instructions.md)
- [Refactoring Plan](docs/REFACTORING_NEEDED.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
