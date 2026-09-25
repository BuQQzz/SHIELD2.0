import type { Message } from "../hooks/useLlama";
import type { ModelSettings } from "../types/settings";
import { useSettingsStore } from "../store/settingsStore";
import { useGenerationStore } from "../store/generationStore";
import { processMCPToolCalls, unrunToolCallsNote } from "./mcpMessageHandler";
import { extractToolCalls } from "./mcpToolHandler";
import {
  buildMCPRetryPrompt,
  isLikelyMCPToolIntent,
  shouldRetryWithMCP,
} from "./mcpRetryPolicy";
import type { ToolCallRequest } from "./mcpToolHandler";
import type { MCPToolResult } from "@/types";
import { parseAllThinking } from "../utils/thinkingParser";
import { detectTruncation } from "../utils/messageTruncation";

/**
 * Generate a unique message ID
 */
let messageIdCounter = 0;
function generateMessageId(): string {
  return `${Date.now()}-${messageIdCounter++}`;
}

interface MessageHandlerProps {
  isModelLoaded: boolean;
  currentConversation: {
    id: string;
    messages: Message[];
  } | null;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsGenerating: (value: boolean) => void;
  setStreamingContent: (value: string) => void;
  streamingContentRef: React.MutableRefObject<string>;
  sendStreamingMessage: (
    message: string,
    onToken: (token: string) => void,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
    }
  ) => Promise<string>;
  addMessage: (message: Message) => void;
  generateTitle: (userMessage: string) => Promise<string | null>;
  updateTitle: (title: string) => void;
  saveCurrentConversation: () => Promise<void>;
  modelSettings: ModelSettings;
  handleToolCallRequest?: (request: ToolCallRequest) => Promise<MCPToolResult>;
  isMCPReady?: boolean;
}

export function createMessageHandler({
  isModelLoaded,
  currentConversation,
  setMessages,
  setIsGenerating,
  setStreamingContent,
  streamingContentRef,
  sendStreamingMessage,
  addMessage,
  generateTitle,
  updateTitle,
  saveCurrentConversation,
  modelSettings,
  handleToolCallRequest,
  isMCPReady = false,
}: MessageHandlerProps) {
  // Web search is a tool the model calls (web_search, fetch_page) rather
  // than a search run before the message
  return async (content: string) => {
    if (!isModelLoaded) {
      return;
    }

    // Add user message FIRST so UI updates immediately
    const userMessage: Message = {
      id: generateMessageId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    addMessage(userMessage);
    useGenerationStore.getState().setStopRequested(false);

    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    const assistantMessageId = generateMessageId();

    try {
      const { settings } = useSettingsStore.getState();

      let messageWithContext = content;

      const allowedTools = settings.mcp.allowedTools ?? [];
      const shouldForceMCPFirstAttempt =
        isMCPReady && allowedTools.length > 0 && isLikelyMCPToolIntent(content);

      if (shouldForceMCPFirstAttempt) {
        messageWithContext = buildMCPRetryPrompt(content, allowedTools);
      }

      // The system prompt names the folder, yet Qwen3-Coder still guessed
      // Documents and then its own project path for "what's in this folder?".
      // Restated next to the request, where recency makes it hard to miss.
      // Only the model sees this; the stored message is the user's text.
      const workspace = settings.mcp.workspaceFolder;
      if (workspace && settings.mcp.enabled && isMCPReady) {
        messageWithContext += `\n\n[Current folder: ${workspace}]`;
      }

      // The last turn ended at the tool-round limit with calls still pending
      const unrun = currentConversation?.messages.at(-1)?.unrunToolCalls;
      if (unrun?.length) {
        messageWithContext += `\n\n${unrunToolCallsNote(unrun)}`;
      }

      const returnedResponse = await sendStreamingMessage(
        messageWithContext,
        (token) => {
          streamingContentRef.current += token;
          setStreamingContent(streamingContentRef.current);
        },
        {
          temperature: modelSettings.temperature,
          maxTokens: modelSettings.maxTokens,
          topP: modelSettings.topP,
          topK: modelSettings.topK,
          repeatPenalty: modelSettings.repeatPenalty,
        }
      );

      // Use streamed content if available, otherwise fall back to returned response
      // This handles cases where streaming doesn't work but the response is returned
      const finalContent = streamingContentRef.current || returnedResponse;

      // Parse and extract thinking/reasoning content from various XML formats
      const { reasoning, thinking, processedContent } = parseAllThinking(
        finalContent,
        false,
        settings.webSearch.showReasoning
      );

      let assistantProcessedContent = processedContent;
      let assistantReasoning = reasoning;
      let assistantThinking = thinking;

      const hasToolCalls =
        extractToolCalls(processedContent, {
          enableOpenAIToolCalls: true,
          enableXmlToolCalls: true,
        }).length > 0;

      const shouldRunMCPRetry =
        !hasToolCalls &&
        isMCPReady &&
        (settings.mcp.allowedTools?.length ?? 0) > 0 &&
        shouldRetryWithMCP(content, processedContent);

      if (shouldRunMCPRetry) {
        setStreamingContent("");
        streamingContentRef.current = "";

        const retryResponse = await sendStreamingMessage(
          buildMCPRetryPrompt(content, settings.mcp.allowedTools),
          (token) => {
            streamingContentRef.current += token;
            setStreamingContent(streamingContentRef.current);
          },
          {
            temperature: 0.2,
            maxTokens: modelSettings.maxTokens,
            topP: 0.9,
            topK: 40,
            repeatPenalty: 1.1,
          }
        );

        const retryFinalContent = streamingContentRef.current || retryResponse;
        const retryParsed = parseAllThinking(
          retryFinalContent,
          false,
          settings.webSearch.showReasoning
        );

        assistantProcessedContent = retryParsed.processedContent;
        assistantReasoning = retryParsed.reasoning;
        assistantThinking = retryParsed.thinking;
      }

      // Detect truncation
      const wasTruncated = detectTruncation(finalContent, {
        maxTokens: modelSettings.maxTokens,
      });

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: assistantProcessedContent,
        timestamp: new Date(),
        truncated: wasTruncated,
        reasoning: assistantReasoning,
        thinking: assistantThinking,
        stats: useGenerationStore.getState().lastStats ?? undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      addMessage(assistantMessage);
      setStreamingContent("");
      streamingContentRef.current = "";

      // Check for MCP tool calls in the AI response
      if (handleToolCallRequest) {
        await processMCPToolCalls(assistantMessage, {
          onToolCallDetected: handleToolCallRequest,
          addMessage,
          enableHybridParser: true,
          maxToolCallsPerTurn: settings.mcp.maxToolCallsPerTurn,
          maxToolRounds: settings.mcp.maxToolRounds,
          workspaceFolder: settings.mcp.workspaceFolder,
          isStopped: () => useGenerationStore.getState().stopRequested,
          // About a third of the context window for any one result (~3 chars
          // per token for code), so the request and the reply still fit
          maxResultChars: Math.max(
            2000,
            Math.floor(
              (useGenerationStore.getState().context?.size ?? 8192) * 0.35 * 3
            )
          ),
          continueConversation: async (toolPrompt: string) => {
            // Continue the conversation with tool results
            setIsGenerating(true);
            setStreamingContent("");
            streamingContentRef.current = "";

            const toolMessageId = generateMessageId();

            try {
              const returned = await sendStreamingMessage(
                toolPrompt,
                (token) => {
                  streamingContentRef.current += token;
                  setStreamingContent(streamingContentRef.current);
                },
                {
                  temperature: modelSettings.temperature,
                  maxTokens: modelSettings.maxTokens,
                  topP: modelSettings.topP,
                  topK: modelSettings.topK,
                  repeatPenalty: modelSettings.repeatPenalty,
                }
              );

              const toolReply = streamingContentRef.current || returned;

              const toolResponseMessage: Message = {
                id: toolMessageId,
                role: "assistant",
                content: toolReply,
                timestamp: new Date(),
                stats: useGenerationStore.getState().lastStats ?? undefined,
              };

              setMessages((prev) => [...prev, toolResponseMessage]);
              addMessage(toolResponseMessage);
              setStreamingContent("");
              streamingContentRef.current = "";

              // Hand the reply back so follow-up tool calls get executed too
              return toolReply;
            } finally {
              setIsGenerating(false);
            }
          },
        });
      }

      // Generate title for first message in conversation
      if (currentConversation && currentConversation.messages.length === 0) {
        const generatedTitle = await generateTitle(content);
        if (generatedTitle) {
          updateTitle(generatedTitle);
        }
      }

      await saveCurrentConversation();
    } catch (err) {
      console.error("[MessageHandler] Error during message handling:", err);
      console.error(
        "[MessageHandler] Error stack:",
        err instanceof Error ? err.stack : "N/A"
      );

      const isAbortError =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("abort"));

      if (isAbortError) {
        console.log("[MessageHandler] Aborted by user");
        if (streamingContentRef.current) {
          const assistantMessage: Message = {
            id: assistantMessageId,
            role: "assistant",
            content: streamingContentRef.current,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          addMessage(assistantMessage);
          await saveCurrentConversation();
        }
        setStreamingContent("");
        streamingContentRef.current = "";
      } else {
        console.error("Error generating response:", err);
      }
    } finally {
      setIsGenerating(false);
    }
  };
}
