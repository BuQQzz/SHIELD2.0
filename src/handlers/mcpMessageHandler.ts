/**
 * MCP Message Handler Extension
 *
 * Extends message handling to detect and process MCP tool calls
 */

import type { Message } from "../hooks/useLlama";
import {
  extractToolCalls,
  formatToolResult,
  type ToolCallRequest,
} from "./mcpToolHandler";
import type { MCPToolResult } from "@/types/electron";

export interface MCPMessageHandlerProps {
  onToolCallDetected: (toolCall: ToolCallRequest) => Promise<MCPToolResult>;
  addMessage: (message: Message) => void;
  continueConversation: (content: string) => void;
}

/**
 * Process AI response for tool calls
 * If tool calls are found, executes them and continues the conversation
 */
export async function processMCPToolCalls(
  assistantMessage: Message,
  props: MCPMessageHandlerProps
): Promise<boolean> {
  const { onToolCallDetected, addMessage, continueConversation } = props;

  // Extract any tool calls from the response
  const toolCalls = extractToolCalls(assistantMessage.content);

  if (toolCalls.length === 0) {
    return false; // No tool calls found
  }

  console.log("[MCP] Detected tool calls:", toolCalls);

  // Process each tool call sequentially
  for (const toolCall of toolCalls) {
    try {
      console.log(
        `[MCP] Requesting permission for ${toolCall.serverName}.${toolCall.tool}`
      );

      // Request permission and execute tool
      const result = await onToolCallDetected(toolCall);

      console.log(`[MCP] Tool result:`, result);

      // Format the tool result as a message
      const toolResultFormatted = formatToolResult(toolCall, result);

      // Add tool result to conversation
      const toolResultMessage: Message = {
        id: `${Date.now()}-tool-result`,
        role: "user", // Tool results come back as "user" messages
        content: toolResultFormatted,
        timestamp: new Date(),
      };

      addMessage(toolResultMessage);

      // Continue the conversation with the tool result
      // The AI will see the result and can respond accordingly
      if (result.success) {
        continueConversation(
          `The tool call was successful. Here is the result:\n${toolResultFormatted}\n\nPlease provide a response to the user based on this information.`
        );
      } else {
        continueConversation(
          `The tool call failed with error: ${result.error}\n\nPlease inform the user about this error.`
        );
      }

      // For now, handle one tool call at a time
      break;
    } catch (error) {
      console.error("[MCP] Error processing tool call:", error);
      return false;
    }
  }

  return true; // Tool calls were processed
}
