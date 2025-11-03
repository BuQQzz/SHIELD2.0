import { useState, useEffect, useCallback } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ModelInfo {
  name: string;
  uri: string;
  contextSize?: number;
}

export function useLlama() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize llama.cpp on mount
  useEffect(() => {
    const init = async () => {
      console.log("[useLlama] Checking for window.llama...");

      // Wait for Electron bridge to be available
      let retries = 0;
      const maxRetries = 50; // 5 seconds max
      while (!window.llama && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }

      if (!window.llama) {
        console.error("[useLlama] window.llama is undefined after waiting!");
        setError("Electron bridge not available");
        return;
      }

      console.log("[useLlama] Initializing llama.cpp...");
      try {
        const result = await window.llama.initialize();
        console.log("[useLlama] Initialize result:", result);
        if (result.success) {
          setIsInitialized(true);
          console.log("[useLlama] Initialized successfully");
        } else {
          setError(result.error || "Failed to initialize");
          console.error("[useLlama] Initialize failed:", result.error);
        }
      } catch (err) {
        console.error("[useLlama] Initialize exception:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    init();
  }, []);

  const loadModel = useCallback(async (model: ModelInfo) => {
    console.log("[useLlama] Loading model:", model);
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.llama.loadModel(model);
      console.log("[useLlama] Load model result:", result);
      if (result.success) {
        setIsModelLoaded(true);
        setCurrentModel(model);
        console.log("[useLlama] Model loaded successfully");
      } else {
        setError(result.error || "Failed to load model");
        console.error("[useLlama] Load model failed:", result.error);
      }
    } catch (err) {
      console.error("[useLlama] Load model exception:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (
      message: string,
      options?: { temperature?: number; maxTokens?: number }
    ) => {
      setError(null);
      try {
        const result = await window.llama.chat(message, options);
        if (result.success && result.response) {
          return result.response;
        } else {
          throw new Error(result.error || "Failed to get response");
        }
      } catch (err) {
        // Check if this is an abort error (user cancelled)
        const isAbortError =
          err instanceof Error &&
          (err.name === "AbortError" || err.message.includes("abort"));

        if (!isAbortError) {
          // Only set error for actual errors, not user cancellations
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          setError(errorMsg);
        }
        throw err;
      }
    },
    []
  );

  const sendStreamingMessage = useCallback(
    async (
      message: string,
      onToken: (token: string) => void,
      options?: { temperature?: number; maxTokens?: number }
    ) => {
      setError(null);
      try {
        // Set up token listener
        const unsubscribe = window.llama.onToken(onToken);

        // Send message
        const result = await window.llama.chatStreaming(message, options);

        // Clean up listener
        unsubscribe();

        if (result.success && result.response) {
          return result.response;
        } else {
          throw new Error(result.error || "Failed to get response");
        }
      } catch (err) {
        // Check if this is an abort error (user cancelled)
        const isAbortError =
          err instanceof Error &&
          (err.name === "AbortError" || err.message.includes("abort"));

        if (!isAbortError) {
          // Only set error for actual errors, not user cancellations
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          setError(errorMsg);
        }
        throw err;
      }
    },
    []
  );

  const clearHistory = useCallback(async () => {
    if (!window.llama) {
      console.warn(
        "[useLlama] clearHistory called but window.llama not available"
      );
      return;
    }
    setError(null);
    try {
      await window.llama.clearHistory();
    } catch (err) {
      console.error("[useLlama] clearHistory failed:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const stopGeneration = useCallback(async () => {
    if (!window.llama) {
      console.warn(
        "[useLlama] stopGeneration called but window.llama not available"
      );
      return;
    }
    try {
      await window.llama.stopGeneration();
    } catch (err) {
      console.error("[useLlama] stopGeneration failed:", err);
    }
  }, []);

  const setChatHistory = useCallback(async (messages: Message[]) => {
    if (!window.llama) {
      console.warn(
        "[useLlama] setChatHistory called but window.llama not available"
      );
      return;
    }
    try {
      await window.llama.setChatHistory(messages);
      console.log("[useLlama] Chat history set successfully");
    } catch (err) {
      console.error("[useLlama] setChatHistory failed:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const generateTitle = useCallback(
    async (userMessage: string): Promise<string | null> => {
      if (!window.llama) {
        console.warn(
          "[useLlama] generateTitle called but window.llama not available"
        );
        return null;
      }
      try {
        const result = await window.llama.generateTitle(userMessage);
        if (result.success && result.title) {
          console.log("[useLlama] Generated title:", result.title);
          return result.title;
        }
        return null;
      } catch (err) {
        console.error("[useLlama] generateTitle failed:", err);
        return null;
      }
    },
    []
  );

  return {
    isInitialized,
    isModelLoaded,
    currentModel,
    isLoading,
    error,
    loadModel,
    sendMessage,
    sendStreamingMessage,
    clearHistory,
    setChatHistory,
    generateTitle,
    stopGeneration,
  };
}
