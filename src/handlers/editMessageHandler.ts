import type { Message } from "../hooks/useLlama";

interface EditMessageHandlerProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setChatHistory: (messages: Message[]) => Promise<void>;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;
  streamingContentRef: React.MutableRefObject<string>;
  sendStreamingMessage: (
    message: string,
    onToken: (token: string) => void,
    options?: Record<string, unknown>
  ) => Promise<string>;
  addMessage: (message: Message) => void;
  saveCurrentConversation: () => void;
  modelSettings: {
    temperature: number;
    maxTokens: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
  };
}

export function createEditMessageHandler(props: EditMessageHandlerProps) {
  return async (messageId: string, newContent: string) => {
    const messageIndex = props.messages.findIndex(
      (msg) => msg.id === messageId
    );
    if (messageIndex === -1) return;

    const originalMessage = props.messages[messageIndex];
    if (!originalMessage) return;

    const updatedMessages = props.messages.slice(0, messageIndex);
    const editedMessage: Message = {
      id: originalMessage.id,
      role: originalMessage.role,
      content: newContent,
      timestamp: originalMessage.timestamp,
    };
    updatedMessages.push(editedMessage);

    props.setMessages(updatedMessages);
    await props.setChatHistory(updatedMessages);

    props.setIsGenerating(true);
    props.setStreamingContent("");
    props.streamingContentRef.current = "";

    try {
      const returned = await props.sendStreamingMessage(
        newContent,
        (token) => {
          props.streamingContentRef.current += token;
          props.setStreamingContent(props.streamingContentRef.current);
        },
        {
          temperature: props.modelSettings.temperature,
          maxTokens: props.modelSettings.maxTokens,
          topP: props.modelSettings.topP,
          topK: props.modelSettings.topK,
          repeatPenalty: props.modelSettings.repeatPenalty,
        }
      );

      // Complete even when late tokens were missed (see messageHandler)
      const finalContent = returned || props.streamingContentRef.current;
      const finalMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalContent,
        timestamp: new Date(),
      };

      props.setMessages((prev) => [...prev, finalMessage]);
      props.addMessage(finalMessage);
      props.setStreamingContent("");
      props.streamingContentRef.current = "";
      props.setIsGenerating(false);
      props.saveCurrentConversation();
    } catch (error) {
      console.error("Error regenerating response:", error);
      props.setIsGenerating(false);
      props.setStreamingContent("");
      props.streamingContentRef.current = "";
    }
  };
}

export function createRegenerateMessageHandler(props: EditMessageHandlerProps) {
  return async (messageId: string) => {
    const messageIndex = props.messages.findIndex(
      (msg) => msg.id === messageId
    );
    if (messageIndex === -1 || messageIndex === 0) return;

    const assistantMessage = props.messages[messageIndex];
    if (!assistantMessage || assistantMessage.role !== "assistant") return;

    const userMessage = props.messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== "user") return;

    const updatedMessages = props.messages.slice(0, messageIndex);
    props.setMessages(updatedMessages);
    await props.setChatHistory(updatedMessages);

    props.setIsGenerating(true);
    props.setStreamingContent("");
    props.streamingContentRef.current = "";

    try {
      const returned = await props.sendStreamingMessage(
        userMessage.content,
        (token) => {
          props.streamingContentRef.current += token;
          props.setStreamingContent(props.streamingContentRef.current);
        },
        {
          temperature: props.modelSettings.temperature,
          maxTokens: props.modelSettings.maxTokens,
          topP: props.modelSettings.topP,
          topK: props.modelSettings.topK,
          repeatPenalty: props.modelSettings.repeatPenalty,
        }
      );

      // Complete even when late tokens were missed (see messageHandler)
      const finalContent = returned || props.streamingContentRef.current;
      const finalMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalContent,
        timestamp: new Date(),
      };

      props.setMessages((prev) => [...prev, finalMessage]);
      props.addMessage(finalMessage);
      props.setStreamingContent("");
      props.streamingContentRef.current = "";
      props.setIsGenerating(false);
      props.saveCurrentConversation();
    } catch (error) {
      console.error("Error regenerating response:", error);
      props.setIsGenerating(false);
      props.setStreamingContent("");
      props.streamingContentRef.current = "";
    }
  };
}
