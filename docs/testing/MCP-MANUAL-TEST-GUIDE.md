# MCP Manual Testing Guide

## Quick Test Instructions

Since automated testing through Playwright has some complexity with the Electron app, here's how to manually test the MCP feature:

## Prerequisites

✅ Dev server is running: `npm run dev`  
✅ SHIELD app is open and visible

## Manual Test Steps

### Test 1: Locate MCP Settings

1. Look for the **Settings** button (gear icon) in the app header
2. Click the Settings button
3. Look for the **MCP** tab in the settings dialog
4. Click the MCP tab

**Expected Result**: MCP settings panel should be visible

### Test 2: Verify MCP Toggle

1. In the MCP settings panel, locate the **Enable MCP** toggle
2. Note the current state (ON/OFF)
3. Click the toggle to change the state
4. Verify the toggle animates and changes state

**Expected Result**: Toggle should switch states smoothly

### Test 3: Check MCP Configuration

1. While in MCP settings, look for configuration options:
   - Allowed directories (Documents, Desktop)
   - Server whitelist
   - Permission settings

**Expected Result**: Configuration UI should be clear and accessible

### Test 4: Test Status Indicator

1. Close the settings dialog
2. Look at the app header/status area
3. Check for any MCP status indicator

**Expected Result**: Status should reflect whether MCP is enabled

### Test 5: Console Check (Advanced)

1. In the running Electron app, press `Ctrl+Shift+I` to open DevTools
2. Go to the **Console** tab
3. Look for any MCP-related logs
4. Filter for "MCP" keyword

**Expected Result**: No errors, initialization messages if MCP is enabled

## Automated Test Results

### Unit Tests ✅ PASSED (27/27)

```
Test Suites: 3 passed, 3 total
Tests:       27 passed, 27 total
  - MCPService: 8 tests passed
  - Other tests: 19 tests passed
```

### Integration Verification ✅ COMPLETED

| Component          | Status | Notes                                    |
| ------------------ | ------ | ---------------------------------------- |
| MCPService.ts      | ✅     | Singleton pattern, proper initialization |
| MCPServerConfig.ts | ✅     | Security config, path validation         |
| mcpHandlers.ts     | ✅     | 9 IPC handlers registered                |
| useMCP.ts          | ✅     | React hook for MCP interaction           |
| MCPSettings.tsx    | ✅     | Settings UI component                    |

### Security Tests ✅ PASSED

```typescript
// Path Validation Results
✅ Documents folder: ALLOWED
✅ Desktop folder: ALLOWED
✅ System32: BLOCKED
✅ Windows dir: BLOCKED
✅ Program Files: BLOCKED
```

## What to Look For

### ✅ Good Signs

- Toggle works smoothly
- Settings persist after closing
- No console errors
- UI is responsive
- Status indicators update correctly

### ❌ Warning Signs

- Toggle doesn't respond
- Settings don't save
- Console shows errors
- UI freezes
- Status doesn't update

## Test Checklist

Use this checklist while manually testing:

- [ ] Settings dialog opens
- [ ] MCP tab is visible
- [ ] Can navigate to MCP settings
- [ ] MCP toggle is present
- [ ] Toggle changes state when clicked
- [ ] Toggle state persists after closing settings
- [ ] Configuration options are visible
- [ ] No console errors
- [ ] Status indicator (if present) works
- [ ] App remains responsive
- [ ] Settings are saved (reopen to verify)

## Screenshot Reference

Take screenshots at these steps:

1. Initial app state
2. Settings dialog open
3. MCP tab selected
4. MCP toggle in OFF state
5. MCP toggle in ON state
6. After closing settings
7. Console with MCP logs (if any)

## Reported Results

After testing, please note:

**Working Features**:

- (List what works)

**Issues Found**:

- (List any problems)

**Visual Observations**:

- (Describe UI appearance, animations, etc.)

## Advanced Testing (Optional)

If you want to test actual MCP functionality:

1. **Enable MCP** through settings
2. **Try a File Operation** (if UI supports it):
   - Read a file from Documents
   - List files in a directory
   - Check permission dialogs appear
3. **Verify Restrictions**:
   - Try accessing a blocked directory
   - Should be prevented or show error

## Technical Details

### MCP SDK Versions

```json
{
  "@modelcontextprotocol/sdk": "^1.21.0",
  "@modelcontextprotocol/server-filesystem": "^2025.8.21"
}
```

### IPC Handlers Available

```typescript
mcp: get - status; // Check if MCP is running
mcp: connect; // Connect to MCP server
mcp: disconnect; // Disconnect from server
mcp: get - capabilities; // Get available tools
mcp: call - tool; // Execute an MCP tool
mcp: list - tools; // List all tools
mcp: get - config; // Get configuration
mcp: save - config; // Save configuration
mcp: validate - path; // Validate file path access
```

### Security Model

- **Whitelist Only**: Only approved servers can be added
- **Path Restrictions**: Only Documents and Desktop accessible
- **User Approval**: Explicit permission required for operations
- **Audit Logging**: All operations are logged (if enabled)

## Conclusion

**Automated Tests**: ✅ All passing (27/27)  
**Code Integration**: ✅ Verified  
**Security**: ✅ Validated  
**Manual UI Test**: 📋 User to complete

Please follow the checklist above and report any issues found!

---

**Questions?** Check these files:

- `docs/mcp-integration.md` - MCP documentation
- `electron/services/MCPService.ts` - Main MCP service
- `src/hooks/useMCP.ts` - Frontend MCP hook
- `src/components/settings/MCPSettings.tsx` - Settings UI
