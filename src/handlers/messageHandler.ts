import type { Message } from "../hooks/useLlama";
import type { ModelSettings } from "../types/settings";
import type { SearchResult, PageContent } from "../types/electron";
import { useSettingsStore } from "../store/settingsStore";

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
    const vagueFollowUpPatterns = [
      /^(please|can you|could you)?\s*(check|look|verify|confirm)\s*(again|once more|one more time)/i,
      /^(what|how)\s*about\s*(that|this|it)/i,
      /^(and|but|so|also)\s*/i,
      /^(yes|no|ok|okay)\b/i,
    ];

    const isVagueFollowUp = vagueFollowUpPatterns.some((pattern: RegExp) =>
      pattern.test(content.trim())
    );

    if (isVagueFollowUp) {
      console.log(
        "[MessageHandler] Skipping web search for vague follow-up query:",
        content
      );
    }

    if (useWebSearch && performWebSearch && !isVagueFollowUp) {
      console.log("[MessageHandler] Web search requested for query:", content);
      console.log(
        "[MessageHandler] performWebSearch function exists:",
        !!performWebSearch
      );

      // Set searching state to true
      if (setIsSearching) {
        console.log("[MessageHandler] Setting isSearching to true");
        setIsSearching(true);
      }

      try {
        console.log("[MessageHandler] Calling performWebSearch...");
        const searchData = await performWebSearch(content);

        console.log("[MessageHandler] Search data received:", {
          hasContents: searchData?.contents && searchData.contents.length > 0,
          contentsCount: searchData?.contents?.length || 0,
          resultsCount: searchData?.results?.length || 0,
          firstResult: searchData?.results?.[0]?.title || "none",
        });

        if (searchData && searchData.contents.length > 0) {
          console.log(
            `[MessageHandler] Building context from ${searchData.contents.length} full pages and ${searchData.results.length} search results`
          );

          // Store sources for display (don't include in prompt)
          searchSources = searchData.results || [];

          // Build context from fetched content - NO source listing
          webSearchContext = "\n\n--- Web Search Results ---\n";
          webSearchContext += `Current Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\n`;
          webSearchContext += `Note: Full content available from ${searchData.contents.length} pages, snippets from ${searchData.results.length - searchData.contents.length} additional results.\n\n`;

          // Add full content first
          webSearchContext += "=== FULL PAGE CONTENT ===\n";
          searchData.contents.forEach((pageContent, index) => {
            webSearchContext += `\nSource ${index + 1}: ${pageContent.title}\n`;
            webSearchContext += `Content: ${pageContent.textContent.slice(0, 1500)}...\n`;
          });

          // Add snippets from results we didn't fetch
          if (searchData.results.length > searchData.contents.length) {
            webSearchContext +=
              "\n=== ADDITIONAL SNIPPETS (Limited Info) ===\n";
            searchData.results
              .slice(searchData.contents.length)
              .forEach((result, index) => {
                webSearchContext += `\n${index + searchData.contents.length + 1}. ${result.title}\n`;
                webSearchContext += `   Snippet: ${result.snippet}\n`;
              });
          }

          webSearchContext += "\n--- End of Search Results ---\n\n";
          webSearchContext +=
            "⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY ⚠️\n\n";
          webSearchContext +=
            "You are answering based on CURRENT LIVE WEB SEARCH RESULTS shown above. These results were just fetched from the internet.\n\n";
          webSearchContext += "ABSOLUTE RULES:\n";
          webSearchContext +=
            "1. ONLY use information that appears in the search results above\n";
          webSearchContext +=
            "2. If search results say something different from your training data, YOU MUST USE THE SEARCH RESULTS\n";
          webSearchContext +=
            "3. DO NOT make up or assume any information not in the results\n";
          webSearchContext +=
            "4. DO NOT list sources in your response - they will be shown separately\n";
          webSearchContext +=
            "5. If information is unclear or contradictory in results, SAY SO\n";
          webSearchContext +=
            "6. Today's date is: " +
            new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }) +
            "\n\n";
          webSearchContext +=
            "Your response MUST be based on the search results above, NOT your training data.\n\n";

          // Debug: Log what we're sending to the LLM
          console.log(
            "[MessageHandler] Full content search context being sent to LLM:"
          );
          console.log(webSearchContext.substring(0, 800) + "...");
        } else if (searchData && searchData.results.length > 0) {
          // If no content was fetched, at least include snippets
          console.log(
            `[MessageHandler] Building context from ${searchData.results.length} search snippets`
          );

          // Store sources for display
          searchSources = searchData.results;

          // Build context from snippets - NO source listing
          webSearchContext = "\n\n--- Web Search Results ---\n";
          webSearchContext += `Current Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\n\n`;
          searchData.results.forEach((result, index) => {
            webSearchContext += `\n${index + 1}. ${result.title}\n`;
            webSearchContext += `   ${result.snippet}\n`;
          });
          webSearchContext += "\n--- End of Search Results ---\n\n";
          webSearchContext +=
            "⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY ⚠️\n\n";
          webSearchContext +=
            "You are answering based on CURRENT LIVE WEB SEARCH SNIPPETS shown above. These were just fetched from the internet.\n\n";
          webSearchContext += "ABSOLUTE RULES:\n";
          webSearchContext +=
            "1. ONLY use information from the snippets above\n";
          webSearchContext +=
            "2. Search results OVERRIDE your training data - use them instead\n";
          webSearchContext +=
            "3. DO NOT invent information not in the snippets\n";
          webSearchContext +=
            "4. DO NOT list sources - they will be shown separately\n";
          webSearchContext +=
            '5. If snippets are unclear or limited, say "Based on the search results..."\n';
          webSearchContext +=
            "6. Today's date is: " +
            new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }) +
            "\n\n";
          webSearchContext += "Answer using ONLY the snippets above.\n\n";

          // Debug: Log what we're sending to the LLM
          console.log("[MessageHandler] Search context being sent to LLM:");
          console.log(webSearchContext.substring(0, 500) + "...");
        } else {
          console.warn("[MessageHandler] No search results found");
        }
      } catch (error) {
        console.error("[MessageHandler] Web search failed:", error);
        // Continue without web search if it fails
      } finally {
        // Set searching state to false
        if (setIsSearching) {
          setIsSearching(false);
        }
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    addMessage(userMessage);
    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    const assistantMessageId = (Date.now() + 1).toString();

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
