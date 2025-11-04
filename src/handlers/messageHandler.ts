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
import { detectFileOperationIntent, formatFileOperationResult } from "./intentDetector";

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
    console.log(
      "[MessageHandler] Called with content:",
      content,
      "useWebSearch:",
      useWebSearch
    );

    if (!isModelLoaded) {
      alert("Please wait for the model to load");
      return;
    }

    // Perform web search if requested
    let webSearchContext = "";
    let searchSources: SearchResult[] = [];

    // Detect if this is a vague follow-up query that shouldn't trigger web search
    const isVagueFollowUp = isVagueFollowUpQuery(content);

    if (isVagueFollowUp) {
      console.log(
        "[MessageHandler] Skipping web search for vague follow-up query:",
        content
      );
    }

    if (useWebSearch && performWebSearch && !isVagueFollowUp) {
      // Get current messages for context
      const currentMessages = currentConversation?.messages || [];

      // Enhance query with conversation context if needed
      const enhancedQuery = enhanceQueryWithContext(content, currentMessages);

      console.log("[MessageHandler] Original query:", content);
      if (enhancedQuery !== content) {
        console.log("[MessageHandler] Enhanced query:", enhancedQuery);
      }

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

    // ===== INTENT DETECTION FOR FILE OPERATIONS =====
    // Detect if user is requesting a file operation (works with any model)
    const { settings } = useSettingsStore.getState();
    const mcpEnabled = settings.mcp?.enabled ?? false;

    if (mcpEnabled && handleToolCallRequest) {
      const intent = detectFileOperationIntent(content);
      
      if (intent.operation !== 'none' && intent.confidence > 0.6) {
        console.log("[MessageHandler] Detected file operation intent:", intent);

        // Execute the file operation via MCP
        let toolCallRequest: ToolCallRequest | null = null;

        switch (intent.operation) {
          case 'read':
            if (intent.filepath) {
              toolCallRequest = {
                serverName: 'filesystem',
                tool: 'read_file',
                arguments: { path: intent.filepath },
              };
            }
            break;
          case 'write':
            if (intent.filepath && intent.content) {
              toolCallRequest = {
                serverName: 'filesystem',
                tool: 'write_file',
                arguments: { path: intent.filepath, content: intent.content },
              };
            }
            break;
          case 'list':
            if (intent.filepath) {
              toolCallRequest = {
                serverName: 'filesystem',
                tool: 'list_directory',
                arguments: { path: intent.filepath },
              };
            }
            break;
        }

        if (toolCallRequest) {
          try {
            // Execute the tool call (will trigger permission dialog)
            console.log("[MessageHandler] Executing tool call:", toolCallRequest);
            const result = await handleToolCallRequest(toolCallRequest);

            // Check if user denied permission
            const wasDenied = !result.success && result.error === "User denied permission";

            if (result.success) {
              // Format the result for the LLM
              const formattedResult = formatFileOperationResult(
                intent.operation,
                intent.filename,
                { success: true, data: result.data } // Use result.data not result.result
              );

              // Create a system message with the file contents
              const toolResultMessage: Message = {
                id: generateMessageId(),
                role: 'assistant',
                content: formattedResult,
                timestamp: new Date(),
              };

              setMessages((prev) => [...prev, toolResultMessage]);
              addMessage(toolResultMessage);

              // Now let the LLM respond with the actual file contents in context
              // We'll continue with the normal flow, but add the result as context
              content = `User asked: "${content}"\n\n${formattedResult}\n\nPlease provide a helpful response based on this information.`;
            } else if (wasDenied) {
              // User denied permission
              const deniedMessage: Message = {
                id: generateMessageId(),
                role: 'assistant',
                content: "I understand. I won't access that file without your permission.",
                timestamp: new Date(),
              };

              setMessages((prev) => [...prev, deniedMessage]);
              addMessage(deniedMessage);
              await saveCurrentConversation();
              setIsGenerating(false);
              return; // Stop here
            } else {
              // Tool execution failed
              const errorMessage: Message = {
                id: generateMessageId(),
                role: 'assistant',
                content: `I encountered an error: ${result.error || 'Unknown error'}`,
                timestamp: new Date(),
              };

              setMessages((prev) => [...prev, errorMessage]);
              addMessage(errorMessage);
              await saveCurrentConversation();
              setIsGenerating(false);
              return; // Stop here
            }
          } catch (error) {
            console.error("[MessageHandler] Tool call error:", error);
          }
        }
      }
    }
    // ===== END INTENT DETECTION =====

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

      console.log(
        "[MessageHandler] Final prompt being sent (first 500 chars):"
      );
      console.log(messageWithContext.substring(0, 500));

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

      // Parse and optionally hide reasoning steps
      const { settings } = useSettingsStore.getState();
      let processedContent = finalContent;
      let reasoning: string | undefined;

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

      console.log("[MessageHandler] Truncation check:", {
        contentLength: finalContent.length,
        estimatedTokens,
        maxTokens: modelSettings.maxTokens,
        tokenLimitReached,
        endsWithPunctuation,
        endsWithCodeBlock,
        wasTruncated,
      });

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: processedContent,
        timestamp: new Date(),
        truncated: wasTruncated,
        sources: searchSources.length > 0 ? searchSources : undefined,
        reasoning: reasoning, // Store reasoning separately for potential future use
      };

      setMessages((prev) => [...prev, assistantMessage]);
      addMessage(assistantMessage);
      setStreamingContent("");
      streamingContentRef.current = "";

      // Check for MCP tool calls in the AI response
      if (handleToolCallRequest) {
        const hadToolCalls = await processMCPToolCalls(assistantMessage, {
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

        if (hadToolCalls) {
          console.log("[MessageHandler] Processed MCP tool calls");
        }
      }

      // Generate title for first message in conversation
      if (currentConversation && currentConversation.messages.length === 0) {
        console.log("[App] Generating title for new conversation");
        const generatedTitle = await generateTitle(content);
        if (generatedTitle) {
          console.log("[App] Setting conversation title:", generatedTitle);
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
