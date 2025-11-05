# MCP Integration

## ⚠️ Important Update (November 2025)

**Intent Detection System Removed**: This document previously described a regex-based intent detection system. This has been removed in favor of focusing on models with native tool calling support. The MCP integration now requires models trained on XML/function calling formats.

**Recommended Models**:
- Llama 3.3 70B (excellent function calling)
- Qwen 2.5 Coder 32B (trained on tool use)
- Mistral Large (native function calling)
- Command R+ (strong tool calling)

Current models (Qwen 7B, Llama 3B, Mistral 7B) will show "MCP Limited" status as they don't support native tool calling.

---

## Overview

SHIELD 2.0 includes Model Context Protocol (MCP) integration, enabling the AI assistant to interact with external tools and services in a secure, privacy-first manner. This implementation focuses on filesystem operations using the official MCP filesystem server with XML-based tool calling.

## Architecture

### Core Components

#### 1. MCPService (`electron/services/MCPService.ts`)
- **Purpose**: Manage MCP server lifecycle and tool execution
- **Lines**: 280 (under 300-line limit)
- **Key Features**:
  - Server process spawning and management
  - StdioClientTransport for communication
  - Whitelist-based server validation
  - Path restriction enforcement
  - Graceful shutdown and cleanup

#### 2. AuditLogService (`electron/services/AuditLogService.ts`)
- **Purpose**: Track all MCP operations for transparency
- **Lines**: 277 (under 300-line limit)
- **Key Features**:
  - Daily log rotation (JSON format)
  - In-memory cache (1000 recent entries)
  - Query interface with filters
  - Statistics aggregation
  - Export/import functionality
  - Privacy-first local storage

#### 3. PermissionDialog (`src/components/dialogs/PermissionDialog.tsx`)
- **Purpose**: User consent interface for MCP operations
- **Lines**: 161 (under 300-line limit)
- **Key Features**:
  - Display operation details
  - Highlight security concerns
  - Block restricted paths
  - Remember user choices
  - Clean, accessible UI

#### 4. useMCP Hook (`src/hooks/useMCP.ts`)
- **Purpose**: React integration for MCP operations
- **Lines**: 147 (under 300-line limit)
- **Key Features**:
  - Service initialization
  - Tool calling interface
  - Audit log queries
  - Error handling
  - Type-safe API

### IPC Integration

**Main Process Handlers** (`electron/main.ts`):
- `mcp:initialize` - Initialize services
- `mcp:call-tool` - Execute tools with logging
- `mcp:list-tools` - Get available tools
- `mcp:get-server-config` - Retrieve configuration
- `mcp:is-ready` - Check initialization status
- `mcp:audit-query` - Query logs
- `mcp:audit-stats` - Get statistics
- `mcp:audit-export` - Export logs
- `mcp:audit-clear` - Clear logs

**Preload API** (`electron/preload.ts`):
- Exposes `window.electronAPI.mcp` interface
- Type-safe TypeScript definitions
- Secure IPC bridge to main process

## Security Model

### Whitelist-Based Server Access

Only official MCP servers are allowed:

```typescript
const OFFICIAL_MCP_SERVERS = {
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", ...allowedPaths],
    env: process.env,
  },
};
```

### Path Restrictions

Filesystem operations are limited to safe directories:
- Documents folder
- Desktop folder

**Blocked paths**:
- `C:\Windows`
- `C:\Program Files`
- `C:\System32`
- Any other system directories

### User Consent

All operations require explicit user approval via PermissionDialog:
1. Display operation details
2. Show target path with security indicators
3. Warn about restricted directories
4. Block dangerous operations
5. Log approval/denial

## Audit System

### Log Structure

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: Date;
  serverName: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  approved: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
}
```

### Storage

- **Format**: JSON files
- **Location**: `userData/mcp-audit-YYYY-MM-DD.json`
- **Rotation**: Daily
- **Retention**: User-configurable
- **Privacy**: All data stays local

### Query Capabilities

Filter logs by:
- Server name
- Tool name
- Date range
- Approval status
- Pagination (limit/offset)

## Usage Example

### React Component Integration

```tsx
import { useMCP } from "@/hooks/useMCP";
import { PermissionDialog } from "@/components/dialogs/PermissionDialog";

function MyComponent() {
  const { isReady, initialize, callTool } = useMCP();
  const [permissionRequest, setPermissionRequest] = useState(null);

  useEffect(() => {
    initialize();
  }, []);

  const handleFileOperation = async () => {
    const request = {
      serverName: "filesystem",
      toolName: "read_file",
      arguments: { path: "C:\\Users\\MyUser\\Documents\\example.txt" },
      approved: false,
    };

    setPermissionRequest(request);
  };

  const handleApprove = async (remember: boolean) => {
    const result = await callTool({
      ...permissionRequest,
      approved: true,
    });
    
    console.log("Operation result:", result);
    setPermissionRequest(null);
  };

  return (
    <>
      <button onClick={handleFileOperation}>Read File</button>
      <PermissionDialog
        open={!!permissionRequest}
        request={permissionRequest}
        onApprove={handleApprove}
        onDeny={() => setPermissionRequest(null)}
      />
    </>
  );
}
```

## File Operations

### Read File

**Natural Language**:
- "Read the file test.txt on my desktop"
- "Show me the contents of notes.md in documents"
- "Open file data.json from desktop"

**Tool Call Format**:
```xml
<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>
{
  "path": "C:\\Users\\Username\\Desktop\\test.txt"
}
</arguments>
</tool_call>
```

**Permission Dialog**: Shows file path, requests read access

**Result Format**:
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "type": "text",
        "text": "File contents here..."
      }
    ]
  }
}
```

### Write File

**Natural Language with Content Extraction**:
- "Create a file called notes.txt on desktop with: Hello World"
- "Write to config.json in documents: {\"key\": \"value\"}"
- "Save this code to test.py on desktop:"
  ```python
  print("Hello World")
  ```

**Tool Call Format**:
```xml
<tool_call>
<server>filesystem</server>
<tool>write_file</tool>
<arguments>
{
  "path": "C:\\Users\\Username\\Desktop\\notes.txt",
  "content": "Hello World"
}
</arguments>
</tool_call>
```

**Content Extraction**:
The system automatically extracts content from:
- **Markdown code blocks**: ` ```language\ncode\n``` `
- **Inline code**: `` `content` ``
- **Quoted text**: `"content"` or `'content'`
- **Natural language**: "with content: ...", "containing: ..."

**WriteFileDialog Features**:
- Content preview (scrollable, syntax-highlighted)
- File size indicator
- Path validation (blocks C:\Windows, C:\Program Files, etc.)
- Dangerous extension warning (.exe, .dll, .bat, etc.)
- Overwrite confirmation if file exists
- Remember choice option

**Security Checks**:
1. ✅ Path must be in allowed directories (Desktop/Documents)
2. ✅ Blocks restricted system paths
3. ✅ Warns about dangerous file extensions
4. ✅ Shows content preview before writing
5. ✅ Requires explicit user approval
6. ✅ Audit logs all operations

**Result Format**:
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "type": "text",
        "text": "Successfully wrote to file.txt"
      }
    ]
  }
}
```

### List Directory

**Natural Language**:
- "List files in my desktop"
- "Show me files in documents folder"
- "What files are in my desktop?"

**Tool Call Format**:
```xml
<tool_call>
<server>filesystem</server>
<tool>list_directory</tool>
<arguments>
{
  "path": "C:\\Users\\Username\\Desktop"
}
</arguments>
</tool_call>
```

**Permission Dialog**: Shows directory path, requests list access

**Result Format**:
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "type": "text",
        "text": "file1.txt\nfile2.pdf\nfolder/"
      }
    ]
  }
}
```

## Testing Checklist

### Functionality Tests
- [ ] Enable MCP from settings (auto-initialization)
- [ ] Connect to filesystem server
- [ ] List available tools
- [ ] Read file from Documents folder
- [ ] Read file from Desktop folder
- [ ] Write file to Documents folder with text content
- [ ] Write file to Desktop folder with code content
- [ ] Write file with markdown code block extraction
- [ ] Write file with inline code extraction
- [ ] Write file with quoted text extraction
- [ ] Overwrite existing file (should show warning)
- [ ] List directory contents (Desktop)
- [ ] List directory contents (Documents)
- [ ] Test path restriction enforcement
- [ ] Verify PermissionDialog displays correctly
- [ ] Verify WriteFileDialog shows content preview
- [ ] Verify WriteFileDialog warns about overwrites
- [ ] Test approval/denial workflow
- [ ] Verify audit logging captures all operations
- [ ] Test intent detection for all operation types

### Security Tests
- [ ] Attempt to access restricted path (should be blocked)
- [ ] Attempt to write to C:\Windows (should be blocked)
- [ ] Attempt to write to C:\Program Files (should be blocked)
- [ ] Attempt to write .exe file (should warn/block)
- [ ] Attempt to write .dll file (should warn/block)
- [ ] Attempt to write .bat file (should warn/block)
- [ ] Verify whitelist prevents non-official servers
- [ ] Check audit logs contain accurate information
- [ ] Ensure no data leaves local machine
- [ ] Test graceful error handling
- [ ] Verify content preview truncation for large files

### Edge Cases
- [ ] Server fails to start
- [ ] Tool call timeout
- [ ] Invalid arguments
- [ ] User denies permission
- [ ] Network disconnection
- [ ] Concurrent tool calls

## Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.21.0",
  "@modelcontextprotocol/server-filesystem": "^2025.8.21"
}
```

**Total**: 72 packages added, 0 vulnerabilities

## Code Organization

All files maintain the 300-line limit:
- `MCPService.ts`: 280 lines
- `AuditLogService.ts`: 277 lines
- `PermissionDialog.tsx`: 161 lines
- `useMCP.ts`: 147 lines

## Next Steps

### Phase 1: Testing & Refinement
1. Implement end-to-end tests
2. Test all filesystem operations
3. Verify security restrictions
4. Validate audit logging accuracy

### Phase 2: UI Enhancement
1. Add audit log viewer component
2. Create settings panel for MCP configuration
3. Implement permission memory/preferences
4. Add visual feedback for operations

### Phase 3: Additional Servers
1. Research other official MCP servers
2. Implement web search MCP integration
3. Add API client server support
4. Explore custom server development

### Phase 4: Advanced Features
1. Tool chaining capabilities
2. Batch operations
3. Operation history/replay
4. Advanced permission rules
5. Sandbox environment

## Documentation

- [MCP Official Docs](https://modelcontextprotocol.io)
- [MCP SDK Repository](https://github.com/modelcontextprotocol/typescript-sdk)
- [Filesystem Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)

## Commit History

1. **1fddd13**: Initial MCP SDK and filesystem server integration
2. **d84c62d**: AuditLogService for operation tracking
3. **2c54536**: TypeScript type definitions for MCP API
4. **1275533**: PermissionDialog component and useMCP React hook

## Privacy & Compliance

✅ **Local-First**: All inference and data processing stays on device  
✅ **No Telemetry**: Zero external API calls or tracking  
✅ **User Control**: Explicit consent for every operation  
✅ **Audit Trail**: Complete operation history stored locally  
✅ **Path Restrictions**: System directories protected  
✅ **Whitelist Security**: Only verified servers allowed  

---

**Status**: Proof-of-concept complete, ready for testing  
**Branch**: `feature/mcp-integration`  
**Last Updated**: 2024-11-04
