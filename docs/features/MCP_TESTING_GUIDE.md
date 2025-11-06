# MCP Integration - Manual Testing Guide

## Prerequisites

1. **Test Files Setup**
   Create test files in your Desktop and Documents folders:

   ```powershell
   # Create test file on Desktop
   "Hello from Desktop! This is a test file." | Out-File -FilePath "$env:USERPROFILE\Desktop\test-mcp.txt"

   # Create test file in Documents
   "Shopping List:`n- Milk`n- Bread`n- Eggs" | Out-File -FilePath "$env:USERPROFILE\Documents\todo.txt"

   # Create a subdirectory with file
   New-Item -Path "$env:USERPROFILE\Desktop\test-folder" -ItemType Directory -Force
   "Test content in subfolder" | Out-File -FilePath "$env:USERPROFILE\Desktop\test-folder\notes.txt"
   ```

2. **Start the Application**
   ```powershell
   npm run dev
   ```

## Test Suite

### Test 1: Enable MCP ✅

**Method A: Header Button**

1. Open SHIELD 2.0
2. Click the **"MCP Off"** button in the top-right header

**Method B: Settings Panel**

1. Open SHIELD 2.0
2. Click the **Settings** (gear icon)
3. Navigate to **MCP Integration** section
4. Toggle **Enable MCP** switch

**Expected Results (Both Methods):**

- Status changes: "MCP Off" → "Initializing..." → "MCP Ready" ✅
- Header button shows green "MCP Ready" indicator
- Settings toggle shows as enabled
- Console shows: `[MCP] Initialization successful`
- No errors appear

**What to Watch For:**

- Both UI locations stay in sync
- Disabling from either location disables MCP
- Settings persist after app restart

---

### Test 2: Read File from Desktop 📖

**Steps:**

1. Ensure MCP is enabled and "Ready"
2. In the chat input, type:
   ```
   Can you read the file test-mcp.txt from my Desktop?
   ```
3. Press Enter/Send

**Expected Results:**

1. AI generates a response containing a `<tool_call>` block (you'll see this in the message)
2. **Permission Dialog appears** with:
   - Server: "filesystem"
   - Tool: "read_file"
   - Arguments showing the path to Desktop\test-mcp.txt
3. Click **Approve**
4. Dialog closes
5. AI responds with the file content: "Hello from Desktop! This is a test file."

**What to Watch For:**

- Console logs: `[MCP] Detected tool calls`, `[MCP] Requesting permission`, `[MCP] Tool result`
- Permission dialog should clearly show the file path
- AI should quote or display the exact file content

**If It Fails:**

- Check console for errors
- Verify file exists: `Test-Path "$env:USERPROFILE\Desktop\test-mcp.txt"`
- Check MCP status is "Ready"

---

### Test 3: Write File to Documents 📝

**Steps:**

1. In the chat input, type:
   ```
   Create a new file called meeting-notes.txt in my Documents folder with the content "Project meeting at 2 PM tomorrow"
   ```
2. Press Enter/Send

**Expected Results:**

1. AI generates `<tool_call>` for write_file operation
2. Permission dialog appears showing:
   - Tool: "write_file"
   - Path to Documents\meeting-notes.txt
   - Content: "Project meeting at 2 PM tomorrow"
3. Click **Approve**
4. AI confirms file was created

**Verification:**

```powershell
Get-Content "$env:USERPROFILE\Documents\meeting-notes.txt"
```

**Expected Output:**

```
Project meeting at 2 PM tomorrow
```

---

### Test 4: List Directory Contents 📂

**Steps:**

1. Type:
   ```
   What files are in my Desktop test-folder directory?
   ```
2. Press Enter/Send

**Expected Results:**

1. AI generates `<tool_call>` for list_directory
2. Permission dialog shows path to Desktop\test-folder
3. After approval, AI lists the files (should show "notes.txt")

---

### Test 5: Deny Permission ❌

**Steps:**

1. Type:
   ```
   Read the file todo.txt from my Documents
   ```
2. When permission dialog appears, click **Deny**

**Expected Results:**

1. Dialog closes immediately
2. AI responds with an error message like:
   - "I wasn't able to read the file because permission was denied."
   - "The operation was not permitted."

**What to Watch For:**

- No file access should occur
- Audit log should record the denial
- AI should handle rejection gracefully

---

### Test 6: Invalid Path (Security) 🔒

**Steps:**

1. Type:
   ```
   Read the file C:\Windows\System32\drivers\etc\hosts
   ```
2. Send message

**Expected Results:**

- AI may generate tool call, but system should reject paths outside Desktop/Documents
- OR permission dialog appears but approval fails with security error
- Console shows path validation error

**What to Watch For:**

- MCP should NEVER access files outside Desktop/Documents
- Clear error message to user about path restrictions

---

### Test 7: Update Existing File 📄

**Steps:**

1. Type:
   ```
   Update my todo.txt file in Documents to add "- Coffee" to the shopping list
   ```
2. Approve the operation

**Expected Results:**

1. Permission dialog for write_file
2. After approval, file is updated
3. Verify with:
   ```powershell
   Get-Content "$env:USERPROFILE\Documents\todo.txt"
   ```

**Expected Output:**

```
Shopping List:
- Milk
- Bread
- Eggs
- Coffee
```

---

### Test 8: Multiple Operations in One Conversation 🔄

**Steps:**

1. Type:
   ```
   Read my test-mcp.txt from Desktop, then create a copy of it in Documents called desktop-backup.txt
   ```
2. This should trigger TWO tool calls

**Expected Results:**

1. First permission dialog for read_file (Desktop)
2. Approve → AI reads content
3. Second permission dialog for write_file (Documents)
4. Approve → AI creates copy
5. AI confirms both operations completed

**What to Watch For:**

- Tool calls should happen sequentially
- Each operation gets its own permission prompt
- AI should wait for first result before requesting second operation

---

### Test 9: Check Audit Logs 📋

**Steps:**

1. After running several tests above, check audit logs:
   ```javascript
   // Open browser DevTools (F12)
   // In Console, run:
   await window.electronAPI.mcp.queryAuditLogs();
   ```

**Expected Results:**

- Array of log entries showing:
  - All read_file operations
  - All write_file operations
  - Approved/denied status
  - Timestamps
  - Full arguments

**Example Log Entry:**

```json
{
  "id": "...",
  "timestamp": "2025-01-04T19:00:00Z",
  "operation": "callTool",
  "serverName": "filesystem",
  "toolName": "read_file",
  "arguments": { "path": "C:\\Users\\...\\Desktop\\test-mcp.txt" },
  "result": "success",
  "userId": "local"
}
```

---

### Test 10: Error Handling 🐛

**Test Non-Existent File:**

1. Type:
   ```
   Read the file doesnotexist.txt from my Desktop
   ```
2. Approve permission

**Expected Results:**

- Tool executes but returns error
- AI explains file doesn't exist
- No crash or unhandled exception

**Test Invalid File Path:**

1. Type something that generates an invalid path
2. System should handle gracefully with clear error message

---

## Debugging Tips

### Console Monitoring

Open DevTools (F12) and watch for these log patterns:

**Successful Flow:**

```
[MCP] MCP is ready, adding system prompt
[MessageHandler] AI response contains <tool_call>
[MCP] Detected tool calls: [...]
[MCP] Requesting permission for filesystem.read_file
[MCP] User approved tool request
[MCP] Tool result: { success: true, result: "..." }
```

**Denied Flow:**

```
[MCP] User denied tool request
[MCP] Tool result: { success: false, error: "User denied permission" }
```

### Common Issues

**Issue: Permission dialog doesn't appear**

- Check: MCP status is "Ready"
- Check: AI actually generated `<tool_call>` tags (look at message content)
- Check: handleToolCallRequest is defined in App.tsx

**Issue: AI doesn't generate tool calls**

- Check: System prompt includes MCP tools (verify in useLlama hook)
- Try being more explicit: "Use the read_file tool to read..."
- Check model temperature isn't too high (should be ~0.7)

**Issue: Tool execution fails**

- Check file paths use Windows format (C:\Users\...)
- Verify files exist and are accessible
- Check audit logs for specific error messages

**Issue: Status shows "Error"**

- Check: @modelcontextprotocol/server-filesystem is installed
- Check: Node.js version is compatible
- Restart application and toggle MCP off/on to re-initialize

---

## Advanced Testing

### Test with Different File Types

```powershell
# Create JSON file
'{"name": "test", "value": 123}' | Out-File -FilePath "$env:USERPROFILE\Desktop\data.json"

# Create CSV file
"Name,Age,City`nJohn,30,NYC`nJane,25,LA" | Out-File -FilePath "$env:USERPROFILE\Desktop\data.csv"
```

Ask AI to:

- "Read and parse the JSON data from data.json on my Desktop"
- "Read the CSV file and tell me the average age"

### Test File Operations Workflow

1. "Create a brainstorm.txt file on my Desktop"
2. "Add 3 project ideas to the brainstorm.txt file"
3. "Read back my brainstorm file and summarize the ideas"

---

## Cleanup After Testing

```powershell
# Remove test files
Remove-Item "$env:USERPROFILE\Desktop\test-mcp.txt" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\Desktop\test-folder" -Recurse -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\Documents\todo.txt" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\Documents\meeting-notes.txt" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\Documents\desktop-backup.txt" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\Desktop\data.json" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\Desktop\data.csv" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\Desktop\brainstorm.txt" -ErrorAction SilentlyContinue
```

---

## Success Criteria

✅ **MCP Integration is working if:**

- MCP status shows "Ready" when enabled
- Permission dialog appears for all file operations
- Approved operations execute successfully
- Denied operations are rejected cleanly
- AI incorporates file content into responses
- Audit logs capture all operations
- No unhandled errors or crashes
- Path restrictions are enforced

## Reporting Issues

If you find bugs during testing, report with:

1. **Steps to reproduce**
2. **Expected vs actual behavior**
3. **Console logs** (F12 → Console tab)
4. **MCP status** at time of issue
5. **File paths** involved
6. **Audit log entries** if relevant

---

**Happy Testing! 🚀**
