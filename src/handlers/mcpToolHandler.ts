/**
 * MCP Tool Handler
 * 
 * Detects and processes MCP tool calls in AI responses
 */

export interface ToolCallRequest {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Extract tool calls from AI response
 * Looks for XML-style tool call tags in the response
 */
export function extractToolCalls(content: string): ToolCallRequest[] {
  const toolCalls: ToolCallRequest[] = [];
  
  // Match <tool_call> blocks
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match;
  
  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const toolCallContent = match[1]?.trim();
      if (!toolCallContent) continue;
      
      // Parse server, tool, and arguments
      const serverMatch = toolCallContent.match(/<server>(.*?)<\/server>/);
      const toolMatch = toolCallContent.match(/<tool>(.*?)<\/tool>/);
      const argsMatch = toolCallContent.match(/<arguments>([\s\S]*?)<\/arguments>/);
      
      if (serverMatch?.[1] && toolMatch?.[1]) {
        const serverName = serverMatch[1].trim();
        const toolName = toolMatch[1].trim();
        let args: Record<string, unknown> = {};
        
        if (argsMatch?.[1]) {
          try {
            args = JSON.parse(argsMatch[1].trim());
          } catch {
            console.warn("[MCPToolHandler] Failed to parse arguments, using empty object");
          }
        }
        
        toolCalls.push({
          serverName,
          toolName,
          arguments: args,
        });
      }
    } catch (error) {
      console.error("[MCPToolHandler] Error parsing tool call:", error);
    }
  }
  
  return toolCalls;
}

/**
 * Get system prompt for MCP tool awareness
 */
export function getMCPSystemPrompt(): string {
  return `
## Available Tools

You have access to filesystem tools that allow you to read and write files in the user's Documents and Desktop folders.

### Filesystem Tools

**read_file** - Read the contents of a file
- Arguments: { "path": "/full/path/to/file.txt" }

**write_file** - Write or create a file
- Arguments: { "path": "/full/path/to/file.txt", "content": "file contents" }

**list_directory** - List files in a directory
- Arguments: { "path": "/full/path/to/directory" }

### Tool Call Format

To use a tool, respond with a tool call block:

<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>
{
  "path": "C:\\\\Users\\\\Username\\\\Documents\\\\example.txt"
}
</arguments>
</tool_call>

**Important Notes:**
- You can only access files in Documents and Desktop folders
- The user will be asked to approve each tool use
- Wait for tool results before continuing your response
- Use Windows path format (C:\\\\Users\\\\...) with escaped backslashes in JSON
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
<tool>${toolCall.toolName}</tool>
<error>${result.error || 'Unknown error'}</error>
</tool_result>`;
  }
  
  return `<tool_result>
<tool>${toolCall.toolName}</tool>
<result>
${JSON.stringify(result.data, null, 2)}
</result>
</tool_result>`;
}
