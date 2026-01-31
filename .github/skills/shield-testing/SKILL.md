---
name: shield-testing
description: Testing and CI/CD requirements for SHIELD 2.0. Use this when writing tests, preparing PRs, or ensuring code quality before merge.
---

# SHIELD 2.0 Testing Guidelines

## Pre-Merge Checklist

**ALL checks must pass before merging to main:**

1. `npm run format` - Run Prettier
2. `npm run lint` - Zero errors/warnings
3. `npm test -- --run` - All tests pass
4. `npm run build` - Successful build
5. Manual testing completed
6. Documentation updated

## Test Requirements

### Unit Tests

- Required for all new features
- Aim for >80% coverage on business logic
- Located next to source files (`*.test.ts`)

### Test Structure

```typescript
import { describe, it, expect, vi } from "vitest";

describe("ComponentName", () => {
  describe("methodName", () => {
    it("should do expected behavior", () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Mocking

```typescript
// Mock Electron APIs
vi.mock("electron", () => ({
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
  },
}));

// Mock window.electronAPI
Object.defineProperty(window, "electronAPI", {
  value: {
    llm: { loadModel: vi.fn() },
  },
});
```

## CI/CD Pipeline

GitHub Actions runs on every PR:

1. **Format Check**: `npx prettier --check "**/*.{ts,tsx,js,json,md,yml}"`
2. **Lint**: `npm run lint`
3. **Type Check**: `npx tsc --noEmit`
4. **Tests**: `npm test -- --run`
5. **Build**: `npm run build`

## Test Files Location

```
src/
├── App.test.ts
├── components/
│   └── chat/
│       └── chat.test.ts
electron/
└── services/
    ├── MCPService.test.ts
    └── AuditLogTypes.test.ts
```

## Running Tests

```bash
# Run all tests
npm test -- --run

# Watch mode
npm test

# Specific file
npm test -- src/App.test.ts

# With coverage
npm test -- --coverage
```

## What to Test

- Business logic functions
- State store actions
- IPC handlers
- Utility functions
- Component rendering (basic)

## What NOT to Test

- Third-party library internals
- Electron main process directly
- LLM inference (mock it)
