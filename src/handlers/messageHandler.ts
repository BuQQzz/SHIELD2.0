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
      let messageWithContext: string;

      if (webSearchContext) {
        // Be EXTREMELY aggressive - repeat key info multiple times
        // SANDWICH APPROACH: Put search results before AND after question
        messageWithContext = `${webSearchContext}`;
        messageWithContext += `\n⚠️⚠️⚠️ REMINDER: Today is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} ⚠️⚠️⚠️\n\n`;
        messageWithContext += `===== USER'S QUESTION =====\n${content}\n`;
        messageWithContext += `===== END USER'S QUESTION =====\n\n`;

        // Chain-of-Thought + Attribution approach for grounding
        messageWithContext += `⚠️ CRITICAL: You MUST follow this 3-step reasoning process ⚠️\n\n`;

        messageWithContext += `IMPORTANT: Wrap your reasoning in <reasoning> tags, and your final answer outside.\n`;
        messageWithContext += `Format:\n<reasoning>\nSTEP 1: [your analysis]\nSTEP 2: [your analysis]\nSTEP 3: [your conclusion]\n</reasoning>\n[Your final answer to the user]\n\n`;

        messageWithContext += `STEP 1 - EXTRACT KEY FACTS:\n`;
        messageWithContext += `List the specific facts from the search results that relate to the question.\n`;
        messageWithContext += `Quote the exact text: [Quote: "exact words from search result"]\n\n`;

        messageWithContext += `STEP 2 - ANALYZE:\n`;
        messageWithContext += `Explain what those facts mean. Pay attention to:\n`;
        messageWithContext += `- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n`;
        messageWithContext += `- CRITICAL DATE LOGIC:\n`;
        messageWithContext += `  * If scheduled date is in the FUTURE (after today) = NOT released yet\n`;
        messageWithContext += `  * If scheduled date is in the PAST (before today) = ALREADY released\n`;
        messageWithContext += `  * If results explicitly say "not yet released" = NOT released (even if date passed)\n`;
        messageWithContext += `- Example: If something was scheduled for October 29, 2025 and today is November 4, 2025, it ALREADY HAPPENED\n\n`;

        messageWithContext += `STEP 3 - ANSWER:\n`;
        messageWithContext += `Based ONLY on the facts you extracted, answer the user's question.\n`;
        messageWithContext += `If the search results don't contain the answer, say "The search results don't provide this information."\n\n`;

        messageWithContext += `Example Format:\n`;
        messageWithContext += `<reasoning>\n`;
        messageWithContext += `STEP 1: [Quote: "The Outer Worlds 2 will launch... this coming October 2025"] [Quote: "scheduled for release in late October 2025"]\n`;
        messageWithContext += `STEP 2: The game was scheduled for October 2025. Today is November 4, 2025, which is AFTER October 2025. This means the scheduled date has passed, so the game ALREADY released.\n`;
        messageWithContext += `STEP 3: Yes, The Outer Worlds 2 has been released (it came out in October 2025).\n`;
        messageWithContext += `</reasoning>\n`;
        messageWithContext += `Yes, The Outer Worlds 2 has already been released! It came out on October 29, 2025 for PS5, Xbox Series X|S, and PC.\n\n`;

        messageWithContext += `Now follow these steps for the user's question:\n`;
      } else {
        messageWithContext = content;
      }

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
      }

      // Pattern 2: Various thinking/analysis XML formats (GPT OSS, Qwen Coder, etc.)
      // These models output chain-of-thought in structured XML
      const thinkingPatterns = [
        {
          name: "GPT OSS pipe format (|channel|analysis + |channel|final)",
          // Matches: <|start|>assistant<|channel|>analysis<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>...
          pattern:
            /<\|start\|>assistant<\|channel\|>analysis<\|message\|>([\s\S]*?)<\|end\|>[\s\S]*?<\|start\|>assistant<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/i,
          thinkingIndex: 1, // Extract analysis content
          contentIndex: 2, // Extract final content
        },
        {
          name: "GPT OSS format (start-analysis-final-end)",
          // Matches: <start><analysis>...</analysis>...<final>...</final>...<end>
          pattern:
            /<start>[\s\S]*?<analysis>([\s\S]*?)<\/analysis>[\s\S]*?<final>([\s\S]*?)<\/final>[\s\S]*?<\/end>/i,
          thinkingIndex: 1, // Extract analysis content
          contentIndex: 2, // Extract final content
        },
        {
          name: "analysis",
          pattern: /<analysis>([\s\S]*?)<\/analysis>/i,
          thinkingIndex: 1,
          contentIndex: null,
        },
        {
          name: "thinking",
          pattern: /<thinking>([\s\S]*?)<\/thinking>/i,
          thinkingIndex: 1,
          contentIndex: null,
        },
        {
          name: "thought",
          pattern: /<thought>([\s\S]*?)<\/thought>/i,
          thinkingIndex: 1,
          contentIndex: null,
        },
        {
          name: "chain_of_thought",
          pattern: /<chain_of_thought>([\s\S]*?)<\/chain_of_thought>/i,
          thinkingIndex: 1,
          contentIndex: null,
        },
      ];

      for (const {
        pattern,
        thinkingIndex,
        contentIndex,
      } of thinkingPatterns) {
        const match = finalContent.match(pattern);

        if (match && match[thinkingIndex]) {
          thinking = match[thinkingIndex].trim();

          // If pattern has separate content index (like GPT OSS format)
          if (contentIndex !== null && match[contentIndex]) {
            processedContent = match[contentIndex].trim();
          } else {
            // Remove the entire matched pattern from response
            processedContent = finalContent.replace(pattern, "").trim();

            // Also clean up any remaining XML wrapper tags
            processedContent = processedContent
              .replace(/<start>\s*/gi, "")
              .replace(/<\/end>\s*/gi, "")
              .replace(/<assistant>\s*/gi, "")
              .replace(/<channel>\s*/gi, "")
              .replace(/<message>\s*/gi, "")
              .replace(/<final>\s*/gi, "")
              .replace(/<\/message>\s*/gi, "")
              .replace(/<\/channel>\s*/gi, "")
              .replace(/<\/assistant>\s*/gi, "")
              .replace(/<\/final>\s*/gi, "")
              .trim();
          }

          break; // Found a match, stop searching
        }
      }

      // If we found thinking content, store it separately

      // Detect truncation: response was cut off if it ends mid-sentence or reaches token limit
      // Token estimation: ~3-4 chars per token on average
      const estimatedTokens = Math.ceil(finalContent.length / 3.5);
      const tokenLimitReached =
        estimatedTokens >= modelSettings.maxTokens * 0.9;

      // Also check if response ends abruptly (no ending punctuation)
      const endsWithPunctuation = /[.!?][\s]*$/.test(finalContent.trim());
      const endsWithCodeBlock = /```[\s]*$/.test(finalContent.trim());
      const wasTruncated =
        tokenLimitReached && (!endsWithPunctuation || endsWithCodeBlock);

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
          }
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
