import type { Message } from "../hooks/useLlama";
import type { ModelSettings } from "../types/settings";

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
}: MessageHandlerProps) {
  return async (content: string) => {
    if (!isModelLoaded) {
      alert("Please wait for the model to load");
      return;
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
      await sendStreamingMessage(
        content,
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
