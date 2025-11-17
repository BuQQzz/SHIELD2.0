---
applyTo: "**/*.ts"
excludeAgent: ["copilot-coding-agent"]
---

# TypeScript Coding Standards

Guidelines for TypeScript code in SHIELD 2.0 focused on Copilot code review.

## Purpose & Scope

This file defines TypeScript-specific conventions for code reviews. Applies to all `.ts` files (main process, services, handlers, utilities).

---

## Naming Conventions

- Use `camelCase` for variables and functions
- Use `PascalCase` for classes, interfaces, and type aliases
- Prefix interfaces with descriptive nouns (e.g., `UserSettings`, not `ISettings`)
- Use `UPPER_SNAKE_CASE` for constants
- Prefix private class members with `_` (e.g., `_privateMethod()`)

## Code Style

- Prefer `const` over `let` when variables are not reassigned
- Use arrow functions for anonymous callbacks
- **Never use `any` type** - specify precise types or use `unknown`
- Limit line length to 100 characters
- Maximum file length: 300 lines (enforced)
- Use template literals for string concatenation

## Type Safety

- Always provide return types for exported functions
- Use strict TypeScript configuration
- Leverage union types instead of loose types
- Use type guards for narrowing (`if (typeof x === 'string')`)
- Prefer interfaces for object shapes, types for unions/intersections

## Error Handling

- Always handle promise rejections with `try/catch` or `.catch()`
- Use custom error classes for application-specific errors
- Log errors with context using `console.error()`
- Never swallow errors silently
- Validate inputs at boundaries (IPC handlers, API calls)

## Testing

- Write unit tests for all exported functions
- Use Vitest for all testing
- Name test files as `<filename>.test.ts`
- Aim for >80% code coverage
- Mock external dependencies (filesystem, network, Electron APIs)

## IPC Handlers (Electron-specific)

- Register all handlers in dedicated files (`electron/ipc/`)
- Use consistent naming: `category:action` (e.g., `system:select-directory`)
- Always validate inputs in handlers
- Return typed response objects with success/error states
- Document IPC channels in type definitions

---

## Example: Good vs. Bad

```typescript
// ✅ GOOD
interface UserSettings {
  modelDirectory: string;
  temperature: number;
}

const loadSettings = async (): Promise<UserSettings> => {
  try {
    const data = await readFile(SETTINGS_PATH, "utf-8");
    return JSON.parse(data) as UserSettings;
  } catch (error) {
    console.error("Failed to load settings:", error);
    throw new Error("Settings load failed");
  }
};

// ❌ BAD
interface ISettings {
  ModelDirectory: any; // any type, wrong casing
  temperature: any;
}

function LoadSettings() {
  // PascalCase function, no return type
  let data = readFileSync(SETTINGS_PATH); // sync operation, let instead of const
  return JSON.parse(data); // no error handling, no type assertion
}
```

---

## Security

- Never log sensitive data (API keys, user content, file paths)
- Validate all external inputs
- Use path normalization for filesystem operations
- Check allowed paths before file operations
- Sanitize data before passing to shell commands

## Performance

- Use async/await for I/O operations
- Cache expensive computations
- Avoid blocking the main thread
- Use streams for large file operations
- Profile performance-critical paths
