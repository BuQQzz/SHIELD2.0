/**
 * MCP Tool Handler
 * 
 * Detects and processes MCP tool calls in AI responses
 */

export interface ToolCallRequest {
  serverName: string;
  tool: string; // Changed from toolName to match MCPToolCall
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
        const tool = toolMatch[1].trim();
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
          tool,
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
## You have access to these tools to help users:

### read_file
Read the contents of a file.
Parameters:
- path (string, required): Full Windows path to the file (e.g., "C:\\Users\\Username\\Desktop\\file.txt")

### write_file
Write content to a file (creates new file or overwrites existing).
Parameters:
- path (string, required): Full Windows path to the file
- content (string, required): Content to write to the file

### list_directory
List all files and folders in a directory.
Parameters:
- path (string, required): Full Windows path to the directory

## How to use tools:

When a user asks you to read, write, or list files, respond with a tool call in this XML format:

<tool_call>
<server>filesystem</server>
<tool>TOOL_NAME</tool>
<arguments>
{
  "param_name": "param_value"
}
</arguments>
</tool_call>

## Examples:

User: "can you read the file hello.txt on my desktop"
Assistant: I'll read that file for you.
<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>
{
  "path": "C:\\Users\\YourUsername\\Desktop\\hello.txt"
}
</arguments>
</tool_call>

User: "list files in my Documents folder"
Assistant: I'll list the files in your Documents folder.
<tool_call>
<server>filesystem</server>
<tool>list_directory</tool>
<arguments>
{
  "path": "C:\\Users\\YourUsername\\Documents"
}
</arguments>
</tool_call>

## Important:
- Only access files in Desktop and Documents folders
- Use full Windows paths with escaped backslashes in JSON: "C:\\Users\\..."
- Wait for tool results before giving your final answer
- The user approves each tool use
- If you don't know the full path, ask the user
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
<error>${result.error || 'Unknown error'}</error>
</tool_result>`;
  }
  
  return `<tool_result>
<tool>${toolCall.tool}</tool>
<result>
${JSON.stringify(result.data, null, 2)}
</result>
</tool_result>`;
}
