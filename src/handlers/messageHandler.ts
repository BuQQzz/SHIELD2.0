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
import type { ToolCallRequest } from "./mcpToolHandler";
import type { MCPToolResult } from "@/types";
import { extractThinking } from "../utils/thinkingParser";
import { detectTruncation } from "../utils/messageTruncation";
import { buildWebSearchPrompt } from "../utils/webSearchPrompt";

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
}: MessageHandlerProps) {
  return async (content: string, useWebSearch?: boolean) => {
    if (!isModelLoaded) {
      alert("Please wait for the model to load");
      return;
    }

    // Perform web search if requested
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

    const userMessage: Message = {
      id: generateMessageId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    addMessage(userMessage);

    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    const assistantMessageId = generateMessageId();

    try {
      // Combine user query with web search context
      const messageWithContext = webSearchContext
        ? buildWebSearchPrompt(content, webSearchContext)
        : content;

      await sendStreamingMessage(
        messageWithContext,
        (token) => {
          streamingContentRef.current += token;
          setStreamingContent(streamingContentRef.current);
        },
        {
          // Use much lower temperature for web search to force following instructions
          temperature: webSearchContext ? 0.1 : modelSettings.temperature,
          maxTokens: modelSettings.maxTokens,
          topP: webSearchContext ? 0.5 : modelSettings.topP, // Lower top_p too
          topK: webSearchContext ? 20 : modelSettings.topK, // Lower top_k
          repeatPenalty: webSearchContext ? 1.2 : modelSettings.repeatPenalty, // Higher repeat penalty
        }
      );

      const finalContent = streamingContentRef.current;

      // Parse and extract thinking/reasoning content from various XML formats
      const { settings } = useSettingsStore.getState();
      let processedContent = finalContent;
      let reasoning: string | undefined;
      let thinking: string | undefined;

      // Pattern 1: <reasoning> tags (web search responses)
      if (webSearchContext) {
        const reasoningMatch = finalContent.match(
          /<reasoning>([\s\S]*?)<\/reasoning>/
        );
        if (reasoningMatch && reasoningMatch[1]) {
          reasoning = reasoningMatch[1].trim();

          // If showReasoning is false, remove the reasoning tags and content
          if (!settings.webSearch.showReasoning) {
            processedContent = finalContent
              .replace(/<reasoning>[\s\S]*?<\/reasoning>\s*/, "")
              .trim();
          } else {
            // If showing reasoning, make it look nice
            processedContent = finalContent.replace(
              /<reasoning>([\s\S]*?)<\/reasoning>/,
              "**🧠 AI Reasoning:**\n$1\n---\n"
            );
          }
        }
      } else {
        // Pattern 2: Various thinking/analysis XML formats (GPT OSS, Qwen Coder, etc.)
        const thinkingResult = extractThinking(finalContent);
        if (thinkingResult.thinking) {
          thinking = thinkingResult.thinking;
          processedContent = thinkingResult.processedContent;
        }
      }

      // Detect truncation: response was cut off if it ends mid-sentence or reaches token limit
      const wasTruncated = detectTruncation(finalContent, modelSettings.maxTokens);

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: processedContent,
        timestamp: new Date(),
        truncated: wasTruncated,
        sources: searchSources.length > 0 ? searchSources : undefined,
        reasoning: reasoning, // Store reasoning separately for web search responses
        thinking: thinking, // Store thinking/analysis for chain-of-thought models
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
      const isAbortError =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("abort"));

      if (isAbortError) {
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
