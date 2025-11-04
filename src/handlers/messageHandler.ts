import type { Message } from "../hooks/useLlama";
import type { ModelSettings } from "../types/settings";
import type { SearchResult, PageContent } from "../types/electron";

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
    if (!isModelLoaded) {
      alert("Please wait for the model to load");
      return;
    }

    // Perform web search if requested
    let webSearchContext = "";
    if (useWebSearch && performWebSearch) {
      console.log("[MessageHandler] Web search requested for query:", content);
      
      // Set searching state to true
      if (setIsSearching) {
        setIsSearching(true);
      }
      
      try {
        const searchData = await performWebSearch(content);
        
        if (searchData && searchData.contents.length > 0) {
          console.log(`[MessageHandler] Building context from ${searchData.contents.length} sources`);
          
          // Build context from fetched content
          webSearchContext = "\n\n--- Web Search Results ---\n";
          searchData.contents.forEach((pageContent, index) => {
            webSearchContext += `\nSource ${index + 1}: ${pageContent.title}\n`;
            webSearchContext += `URL: ${pageContent.url}\n`;
            webSearchContext += `Content: ${pageContent.textContent.slice(0, 1500)}...\n`;
          });
          webSearchContext += "\nPlease use the above web search results to answer the user's question.\n---\n\n";
        } else if (searchData && searchData.results.length > 0) {
          // If no content was fetched, at least include snippets
          console.log(`[MessageHandler] Building context from ${searchData.results.length} search snippets`);
          
          webSearchContext = "\n\n--- Web Search Results ---\n";
          searchData.results.forEach((result, index) => {
            webSearchContext += `\n${index + 1}. ${result.title}\n`;
            webSearchContext += `   ${result.snippet}\n`;
            webSearchContext += `   Source: ${result.url}\n`;
          });
          webSearchContext += "\nPlease use the above search results to help answer the user's question.\n---\n\n";
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
      const messageWithContext = webSearchContext 
        ? `${webSearchContext}User Question: ${content}`
        : content;

      await sendStreamingMessage(
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

      const finalContent = streamingContentRef.current;

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
        content: finalContent,
        timestamp: new Date(),
        truncated: wasTruncated,
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
