---
applyTo: "electron/**/*.ts"
excludeAgent: ["copilot-coding-agent"]
---

# Electron Development Standards

Guidelines for Electron main process, IPC handlers, and native integrations in SHIELD 2.0.

## Purpose & Scope

This file defines Electron-specific conventions for code reviews. Applies to all files in `electron/` directory.

---

## Architecture Principles

- **Main Process**: Runs Node.js, has full system access
- **Renderer Process**: Runs Chromium, sandboxed
- **Preload Script**: Bridge between main and renderer with controlled APIs
- **Security**: Context isolation enabled, nodeIntegration disabled

## IPC Communication

### Handler Registration

- Register all IPC handlers in `electron/ipc/` directory
- Group by category: `system`, `llama`, `mcp`, `settings`, `conversation`, etc.
- One registration function per category (e.g., `registerSystemHandlers()`)
- Call registration functions from `main.ts`

### IPC Channel Naming

```typescript
// Pattern: "category:action"
"system:select-directory"
"llama:load-model"
"mcp:list-servers"
"settings:save"
"conversation:create"
```

### Handler Implementation

```typescript
// ✅ GOOD: Typed, validated, error-handled
ipcMain.handle("system:open-external", async (_event, url: string) => {
  try {
    // Validate inputs
    const urlObj = new URL(url);
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return { success: false, error: "Only HTTP/HTTPS URLs allowed" };
    }

    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error("Failed to open external URL:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
});

// ❌ BAD: No validation, poor error handling
ipcMain.handle("open-url", async (event, url) => {
  shell.openExternal(url);  // No validation, no error handling
});
```

## Preload Script

### API Surface

- Define typed APIs in `src/types/electron.d.ts`
- Group APIs by category (e.g., `SystemAPI`, `LlamaAPI`)
- Expose via `contextBridge.exposeInMainWorld()`
- **Never** expose entire Node.js APIs

```typescript
// ✅ GOOD: Controlled, typed API
const systemAPI: SystemAPI = {
  selectDirectory: () => ipcRenderer.invoke("system:select-directory"),
  openExternal: (url: string) => 
    ipcRenderer.invoke("system:open-external", url),
};

contextBridge.exposeInMainWorld("electronAPI", {
  system: systemAPI,
  llama: llamaAPI,
  // ...other APIs
});

// ❌ BAD: Exposes entire Node.js
contextBridge.exposeInMainWorld("node", {
  fs: require("fs"),
  path: require("path"),
  // Massive security hole!
});
```

## Security

### File System Access

- **Always** validate file paths before operations
- Use `path.normalize()` to prevent traversal attacks
- Maintain whitelist of allowed directories
- Check paths are within allowed locations

```typescript
// ✅ GOOD: Validated path
import path from "path";
import { app } from "electron";

const validatePath = (filePath: string): boolean => {
  const normalized = path.normalize(filePath);
  const userDataPath = app.getPath("userData");
  const documentsPath = app.getPath("documents");
  
  return normalized.startsWith(userDataPath) || 
         normalized.startsWith(documentsPath);
};

ipcMain.handle("file:read", async (_event, filePath: string) => {
  if (!validatePath(filePath)) {
    throw new Error("Access denied: Invalid path");
  }
  // Proceed with file operation
});
```

### External Resources

- Validate URLs before opening with `shell.openExternal()`
- Only allow `http:` and `https:` protocols
- Never execute arbitrary commands from renderer
- Sanitize all inputs from untrusted sources

## Window Management

- Create windows with proper security options:
  ```typescript
  new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  ```
- Use `webContents.setWindowOpenHandler()` to control popup windows
- Disable remote module

## Services

### Structure

- Place services in `electron/services/`
- One service per file, single responsibility
- Export service instances or factory functions
- Document public API with JSDoc

### Example Service

```typescript
/**
 * Manages application settings storage and retrieval
 */
export class SettingsStorageService {
  private static settingsPath = path.join(
    app.getPath("userData"),
    "settings.json"
  );

  static async loadSettings(): Promise<Settings> {
    try {
      const data = await fs.readFile(this.settingsPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      return this.getDefaultSettings();
    }
  }

  static async saveSettings(settings: Settings): Promise<void> {
    await fs.writeFile(
      this.settingsPath,
      JSON.stringify(settings, null, 2)
    );
  }

  private static getDefaultSettings(): Settings {
    return {
      /* defaults */
    };
  }
}
```

## Performance

- Use async operations (avoid sync file I/O)
- Implement progress tracking for long operations
- Cancel long-running tasks when window closes
- Cache expensive computations
- Use Node.js streams for large files

## Error Handling

- Wrap all async operations in try/catch
- Log errors with context to console
- Return error objects to renderer (never throw across IPC)
- Use custom error classes for domain-specific errors
- Handle unhandled rejections and exceptions

```typescript
// Main process error handling
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  // Optionally restart or gracefully shutdown
});
```

---

## Testing

- Mock Electron APIs (`app`, `dialog`, `shell`)
- Test IPC handlers independently
- Validate input validation logic
- Test error scenarios
- Use `@electron/remote` for integration tests

## Common Patterns

### Dialogs
```typescript
// ✅ GOOD: Async, returns result
const result = await dialog.showOpenDialog({
  properties: ["openDirectory"],
  title: "Select Model Directory",
});
return result.canceled ? null : result.filePaths[0];
```

### Native Menus
```typescript
// Create application menu
const template: MenuItemConstructorOptions[] = [
  {
    label: "File",
    submenu: [
      { role: "quit" },
    ],
  },
];
const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
```

### Auto-Updater
```typescript
// Check for updates
autoUpdater.checkForUpdatesAndNotify();
autoUpdater.on("update-downloaded", () => {
  // Notify user, prompt to restart
});
```
