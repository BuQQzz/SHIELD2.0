import type { Message } from "../hooks/useLlama";
import type { ModelSettings } from "../types/settings";
import type { SearchResult, PageContent } from "../types/electron";
import { useSettingsStore } from "../store/settingsStore";
import {
  isVagueFollowUpQuery,
  performWebSearchAndBuildContext,
} from "./webSearchHelper";
import { enhanceQueryWithContext } from "../utils/queryEnhancer";
import { processMCPToolCalls } from "./mcpMessageHandler";
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
  performWebSearch?: (query: string) => Promise<{
    results: SearchResult[];
    contents: PageContent[];
  } | null>;
  setIsSearching?: (value: boolean) => void;
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
  performWebSearch,
  setIsSearching,
  handleToolCallRequest,
  isMCPReady = false,
}: MessageHandlerProps) {
  return async (content: string, useWebSearch?: boolean) => {
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

    // Perform web search if requested (after user message is shown)
    let webSearchContext = "";
    let searchSources: SearchResult[] = [];

    // Detect if this is a vague follow-up query that shouldn't trigger web search
    const isVagueFollowUp = isVagueFollowUpQuery(content);

    if (useWebSearch && performWebSearch && !isVagueFollowUp) {
      // Get current messages for context
      const currentMessages = currentConversation?.messages || [];

      // Enhance query with conversation context if needed
      const enhancedQuery = enhanceQueryWithContext(content, currentMessages);

      const searchResult = await performWebSearchAndBuildContext(
        enhancedQuery,
        performWebSearch,
        setIsSearching
      );
      webSearchContext = searchResult.context;
      searchSources = searchResult.sources;
    }

    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    const assistantMessageId = generateMessageId();

    try {
      const { settings } = useSettingsStore.getState();

      // Combine user query with web search context
      let messageWithContext: string;

      if (webSearchContext) {
        messageWithContext = `${webSearchContext}`;
        messageWithContext += `\nUSER REQUEST:\n${content}\n\n`;
        messageWithContext += `RESPONSE INSTRUCTIONS:\n`;
        messageWithContext += `- Use only the web results above for factual claims.\n`;
        messageWithContext += `- Respond naturally and helpfully, not in robotic or template-heavy style.\n`;
        messageWithContext += `- Start with a direct answer in 1-2 sentences.\n`;
        messageWithContext += `- If the user asks for places/events/venues/activities near a location, include a concise list with:\n`;
        messageWithContext += `  1) Place name\n`;
        messageWithContext += `  2) Area/neighborhood\n`;
        messageWithContext += `  3) Why it matches the request (concerts/outdoor, etc.)\n`;
        messageWithContext += `  4) Any timing/detail available in results\n`;
        messageWithContext += `- If details are missing, say what is missing and suggest a specific follow-up search.\n`;
        messageWithContext += `- Keep answer concise but useful.\n`;
      } else {
        messageWithContext = content;
      }

      const allowedTools = settings.mcp.allowedTools ?? [];
      const shouldForceMCPFirstAttempt =
        !webSearchContext &&
        isMCPReady &&
        allowedTools.length > 0 &&
        isLikelyMCPToolIntent(content);

      if (shouldForceMCPFirstAttempt) {
        messageWithContext = buildMCPRetryPrompt(content, allowedTools);
      }

      const returnedResponse = await sendStreamingMessage(
        messageWithContext,
        (token) => {
          streamingContentRef.current += token;
          setStreamingContent(streamingContentRef.current);
        },
        {
          temperature: webSearchContext ? 0.3 : modelSettings.temperature,
          maxTokens: modelSettings.maxTokens,
          topP: webSearchContext ? 0.85 : modelSettings.topP,
          topK: webSearchContext ? 40 : modelSettings.topK,
          repeatPenalty: webSearchContext ? 1.1 : modelSettings.repeatPenalty,
        }
      );

      // Use streamed content if available, otherwise fall back to returned response
      // This handles cases where streaming doesn't work but the response is returned
      const finalContent = streamingContentRef.current || returnedResponse;

      // Parse and extract thinking/reasoning content from various XML formats
      const { reasoning, thinking, processedContent } = parseAllThinking(
        finalContent,
        !!webSearchContext,
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
          !!webSearchContext,
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
        sources: searchSources.length > 0 ? searchSources : undefined,
        reasoning: assistantReasoning,
        thinking: assistantThinking,
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
          continueConversation: async (toolPrompt: string) => {
            // Continue the conversation with tool results
            setIsGenerating(true);
            setStreamingContent("");
            streamingContentRef.current = "";

            const toolMessageId = generateMessageId();

            try {
              await sendStreamingMessage(
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

              const toolResponseMessage: Message = {
                id: toolMessageId,
                role: "assistant",
                content: streamingContentRef.current,
                timestamp: new Date(),
              };

              setMessages((prev) => [...prev, toolResponseMessage]);
              addMessage(toolResponseMessage);
              setStreamingContent("");
              streamingContentRef.current = "";
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
