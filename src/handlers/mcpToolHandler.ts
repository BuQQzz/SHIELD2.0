/**
 * MCP Tool Handler
 *
 * Detects and processes MCP tool calls in AI responses
 */
export {
  extractToolCalls,
  type ExtractToolCallOptions,
  type ToolCallRequest,
} from "./toolCallParsing";
import type { ToolCallRequest } from "./toolCallParsing";

/**
 * Get system prompt for MCP tool awareness
 * Uses the new prompt system with ReAct format and examples
 */
export function getMCPSystemPrompt(): string {
  return `
## 🔧 File System Tools (ReAct Format)

You have tools to work with files. When the user asks you to create, read, or list files, you MUST use these tools.

### Available Tools:

**read_file** - Read contents of a file
- path (string, required): Full Windows path like "C:\\Users\\Username\\Desktop\\file.txt"

**write_file** - Write content to a file (creates or overwrites)
- path (string, required): Full Windows path
- content (string, required): Content to write

**list_directory** - List files and folders in a directory
- path (string, required): Full Windows path to directory

### Tool Call Format:
\`\`\`xml
<tool_call>
<server>filesystem</server>
<tool>TOOL_NAME</tool>
<arguments>{"param": "value"}</arguments>
</tool_call>
\`\`\`

### Alternative Tool Call Format (for native function-calling models):
\`\`\`json
{
  "tool_calls": [
    {
      "type": "function",
      "function": {
        "name": "filesystem.TOOL_NAME",
        "arguments": { "param": "value" }
      }
    }
  ]
}
\`\`\`

### Example: Creating a File

User: "Create a todo list on my desktop"

Thought: The user wants me to create a todo list file. I'll use write_file to create it on their desktop.

<tool_call>
<server>filesystem</server>
<tool>write_file</tool>
<arguments>{"path": "C:\\\\Users\\\\Username\\\\Desktop\\\\todo.txt", "content": "My Todo List\\n============\\n[ ] Task 1\\n[ ] Task 2\\n[ ] Task 3"}</arguments>
</tool_call>

Observation: File created successfully.

Done! I've created todo.txt on your desktop with your task list.

### Example: Reading a File

User: "What's in notes.txt on my desktop?"

Thought: I need to read the contents of notes.txt from the user's desktop.

<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path": "C:\\\\Users\\\\Username\\\\Desktop\\\\notes.txt"}</arguments>
</tool_call>

### 🚨 Critical Rules:
1. **USE TOOLS** - Don't explain how to do it manually, actually DO it
2. **GENERATE CONTENT** - Create complete, useful content for files
3. **FULL PATHS** - Use complete Windows paths with double backslashes
4. **Desktop/Documents only** - Only access these user folders
`.trim();
}

/**
 * Format tool result for inclusion in conversation
 */
export function formatToolResult(
  toolCall: ToolCallRequest,
  result: { success: boolean; data?: unknown; error?: string }
): string {
  if (!result.success) {
    return `<tool_result>
<tool>${toolCall.tool}</tool>
<error>${result.error || "Unknown error"}</error>
</tool_result>`;
  }

  return `<tool_result>
<tool>${toolCall.tool}</tool>
<result>
${JSON.stringify(result.data, null, 2)}
</result>
</tool_result>`;
}
