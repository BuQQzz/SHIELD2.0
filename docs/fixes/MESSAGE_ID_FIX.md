# Message ID Generation Fix

## Issue

React was throwing key collision warnings due to duplicate message IDs:

```
Warning: Encountered two children with the same key, `1762306503345`
```

## Root Cause

Multiple messages were being created in rapid succession using `Date.now()` or `Date.now() + 1`, which could generate identical IDs when operations executed within the same millisecond.

## Solution

Implemented a counter-based unique ID generator that combines timestamp with an incrementing counter:

```typescript
let messageIdCounter = 0;
function generateMessageId(): string {
  return `${Date.now()}-${messageIdCounter++}`;
}
```

This ensures every message ID is unique, even if created in the same millisecond.

## Files Modified

### src/handlers/messageHandler.ts

- Added `generateMessageId()` helper function
- Replaced 7 instances of `Date.now()` and `Date.now() + 1` with `generateMessageId()`
- Lines affected: 123, 195, 210, 224, 248, 396

### src/hooks/useAppHandlers.ts

- Added `generateMessageId()` helper function
- Replaced 1 instance in `handleStopGenerating` callback
- Line affected: 110

### src/handlers/continuationHandler.ts

- Added `generateMessageId()` helper function
- Replaced 2 instances for user message and assistant message IDs
- Lines affected: 44, 58

### src/handlers/mcpMessageHandler.ts

- Fixed type error: `toolCall.toolName` → `toolCall.tool`
- Line affected: 39

### src/components/settings/MCPSettings.tsx

- Removed unused `error` variable from useMCP destructuring
- Line affected: 15

## Testing

- ✅ All lint checks pass (`npm run lint`)
- ✅ Build successful (`npm run build`)
- ✅ Type checking passes
- ✅ No more React key collision warnings

## Impact

- Eliminates all React key collision warnings
- Ensures stable message ordering in UI
- Prevents potential React rendering issues
- Maintains chronological ordering with timestamp prefix

## Date

2025-01-XX (Session continuation from MCP integration work)
