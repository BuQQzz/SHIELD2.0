# Development Environment Variables

This document describes environment variables that can be used during development.

## HIDE_DEVTOOLS

**Type**: Boolean (set to `1` to enable)  
**Default**: Not set (DevTools open by default)

When set to `1`, prevents Chrome DevTools from opening automatically in development mode.

### Why Use This?

When DevTools is open, you may see harmless Autofill protocol errors in the console:

```
Request Autofill.enable failed. {"code":-32601,"message":"'Autofill.enable' wasn't found"}
Request Autofill.setAddresses failed. {"code":-32601,"message":"'Autofill.setAddresses' wasn't found"}
```

These errors occur because Chromium DevTools tries to enable the Autofill protocol, which isn't available in Electron desktop apps. They are **completely harmless** and don't affect functionality, but can clutter the console.

### Usage

**PowerShell (Windows)**:

```powershell
$env:HIDE_DEVTOOLS=1; npm run dev:electron
```

**Bash/Zsh (Linux/macOS)**:

```bash
HIDE_DEVTOOLS=1 npm run dev:electron
```

**Persistent Setting**:

Create a `.env.local` file in the project root:

```env
HIDE_DEVTOOLS=1
```

### When to Use

- ✅ **Use `HIDE_DEVTOOLS=1`** when you want a clean console without DevTools errors
- ✅ **Use `HIDE_DEVTOOLS=1`** when demonstrating the app or recording tutorials
- ❌ **Don't use** when actively debugging frontend issues (you'll need DevTools!)

### Note

In production builds (not dev mode), DevTools is never opened, so these errors never appear to end users.

---

**See Also**:

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common development issues
- Main entry point: [electron/main.ts](../electron/main.ts)
