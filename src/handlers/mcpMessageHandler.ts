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
  continueConversation: (content: string) => Promise<void> | void;
  enableHybridParser?: boolean;
  maxToolCallsPerTurn?: number;
}

/**
 * Process AI response for tool calls
 * If tool calls are found, executes them and continues the conversation
 */
export async function processMCPToolCalls(
  assistantMessage: Message,
  props: MCPMessageHandlerProps
): Promise<boolean> {
  const {
    onToolCallDetected,
    addMessage,
    continueConversation,
    enableHybridParser = true,
    maxToolCallsPerTurn = 5,
  } = props;

  // Extract any tool calls from the response
  const toolCalls = extractToolCalls(assistantMessage.content, {
    enableOpenAIToolCalls: enableHybridParser,
    enableXmlToolCalls: true,
  });

  if (toolCalls.length === 0) {
    return false; // No tool calls found
  }

  const cappedToolCalls = toolCalls.slice(0, Math.max(1, maxToolCallsPerTurn));
  console.log("[MCP] Detected tool calls:", toolCalls);
  if (toolCalls.length > cappedToolCalls.length) {
    console.warn(
      `[MCP] Tool calls capped to ${cappedToolCalls.length} for this turn`
    );
  }

  const formattedResults: string[] = [];

  // Process each tool call sequentially
  for (const toolCall of cappedToolCalls) {
    let result: MCPToolResult;

    try {
      console.log(
        `[MCP] Requesting permission for ${toolCall.serverName}.${toolCall.tool}`
      );

      // Request permission and execute tool
      result = await onToolCallDetected(toolCall);

      console.log(`[MCP] Tool result:`, result);
    } catch (error) {
      console.error("[MCP] Error processing tool call:", error);
      result = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown MCP error",
      };
    }

    const toolResultFormatted = formatToolResult(toolCall, result);
    formattedResults.push(toolResultFormatted);

    const toolResultMessage: Message = {
      id: `${Date.now()}-tool-result-${toolCall.tool}`,
      role: "user", // Tool results come back as "user" messages
      content: toolResultFormatted,
      timestamp: new Date(),
    };

    addMessage(toolResultMessage);
  }

  await continueConversation(
    `
You executed ${formattedResults.length} tool call(s). Here are the results:

${formattedResults.join("\n\n")}

Please provide a clear response to the user based on these results.
If any tool failed, explain the failure briefly and suggest a safe next step.
`.trim()
  );

  return true; // Tool calls were processed
}
