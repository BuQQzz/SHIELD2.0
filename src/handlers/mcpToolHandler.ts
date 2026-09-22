/**
 * MCP Tool Handler
 *
 * Detects and processes MCP tool calls in AI responses
 */
export {
  extractToolCalls,
  stripToolCallMarkup,
  type ExtractToolCallOptions,
  type ToolCallRequest,
} from "./toolCallParsing";
import type { ToolCallRequest } from "./toolCallParsing";

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
