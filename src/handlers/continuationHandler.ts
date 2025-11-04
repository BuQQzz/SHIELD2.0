import type { Message } from "../hooks/useLlama";
import type { ModelSettings } from "../types/settings";

// Generate unique message IDs to prevent React key collisions
let messageIdCounter = 0;
function generateMessageId(): string {
  return `${Date.now()}-${messageIdCounter++}`;
}

interface ContinuationHandlerParams {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;
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
  saveCurrentConversation: () => Promise<void>;
  modelSettings: ModelSettings;
}

export const createContinuationHandler = ({
  messages,
  setMessages,
  setIsGenerating,
  setStreamingContent,
  streamingContentRef,
  sendStreamingMessage,
  addMessage,
  saveCurrentConversation,
  modelSettings,
}: ContinuationHandlerParams) => {
  return async (messageId: string) => {
    // Find the truncated message
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;

    // Send a continuation prompt
    const userMessage: Message = {
      id: generateMessageId(),
      role: "user",
      content: "Continue",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    addMessage(userMessage);
    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    const assistantMessageId = generateMessageId();

    try {
      await sendStreamingMessage(
        "Continue",
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

      // Detect truncation with same logic as messageHandler
      const estimatedTokens = Math.ceil(finalContent.length / 3.5);
      const tokenLimitReached =
        estimatedTokens >= modelSettings.maxTokens * 0.9;
      const endsWithPunctuation = /[.!?][\s]*$/.test(finalContent.trim());
      const endsWithCodeBlock = /```[\s]*$/.test(finalContent.trim());
      const wasTruncated =
        tokenLimitReached && (!endsWithPunctuation || endsWithCodeBlock);

      console.log("[Continue] Truncation check:", {
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
        console.error("Error generating continuation:", err);
      }
    } finally {
      setIsGenerating(false);
    }
  };
};
