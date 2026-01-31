---
name: shield-electron
description: Electron and IPC patterns for SHIELD 2.0. Use this when working with main process code, IPC handlers, or preload scripts.
---

# SHIELD 2.0 Electron Patterns

## Architecture

```
┌─────────────────┐     IPC      ┌─────────────────┐
│   Main Process  │◄────────────►│ Renderer Process│
│   (electron/)   │   preload    │    (src/)       │
└─────────────────┘              └─────────────────┘
```

## IPC Handler Pattern

### Main Process Handler (electron/ipc/\*.ts)

```typescript
import { ipcMain, IpcMainInvokeEvent } from "electron";

export function registerMyHandlers(): void {
  ipcMain.handle(
    "my:action",
    async (_event: IpcMainInvokeEvent, arg: string) => {
      try {
        const result = await doSomething(arg);
        return { success: true, data: result };
      } catch (error) {
        console.error("my:action failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );
}
```

### Preload Script (electron/preload.ts)

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  my: {
    action: (arg: string) => ipcRenderer.invoke("my:action", arg),
    onEvent: (callback: (data: any) => void) => {
      ipcRenderer.on("my:event", (_event, data) => callback(data));
    },
  },
});
```

### Type Definition (src/types/electron.d.ts)

```typescript
interface ElectronAPI {
  my: {
    action: (arg: string) => Promise<{ success: boolean; data?: any }>;
    onEvent: (callback: (data: any) => void) => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

### Renderer Usage (src/\*.tsx)

```typescript
const result = await window.electronAPI.my.action("test");
if (result.success) {
  console.log(result.data);
}
```

## File Organization

```
electron/
├── main.ts              # Entry point, window creation
├── preload.ts           # Context bridge exposures
├── ipc/
│   ├── llamaHandlers.ts      # LLM operations
│   ├── modelHandlers.ts      # Model management
│   ├── mcpHandlers.ts        # MCP tool integration
│   ├── settingsHandlers.ts   # Settings persistence
│   ├── conversationHandlers.ts
│   └── searchHandlers.ts
├── services/
│   ├── LlamaService.ts       # node-llama-cpp wrapper
│   ├── MCPService.ts         # MCP client
│   ├── SettingsService.ts
│   └── ConversationStorageService.ts
└── setup/
    └── windowSetup.ts
```

## Security Best Practices

1. **Never expose Node APIs directly**

   ```typescript
   // BAD
   contextBridge.exposeInMainWorld("fs", require("fs"));

   // GOOD
   contextBridge.exposeInMainWorld("api", {
     readFile: (path: string) => ipcRenderer.invoke("fs:read", path),
   });
   ```

2. **Validate all IPC inputs in main process**

3. **Use contextIsolation: true (default)**

4. **Minimize preload API surface**

## Error Handling

Always wrap IPC handlers in try-catch:

```typescript
ipcMain.handle("action", async (_event, arg) => {
  try {
    return { success: true, data: await operation(arg) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
```
