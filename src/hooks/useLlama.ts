import { useState, useEffect, useCallback } from "react";
import type {
  GenerationStats,
  MemoryCheck,
  SearchResult,
} from "../types/electron";
import { useGenerationStore } from "../store/generationStore";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  truncated?: boolean;
  sources?: SearchResult[];
  reasoning?: string; // AI's step-by-step reasoning (for web search responses)
  thinking?: string; // AI's chain-of-thought analysis (extracted from XML tags)
  isThinking?: boolean; // True while streaming thinking content
  /** Tokens and speed of the reply, shown under assistant messages */
  stats?: GenerationStats;
  /**
   * Tool calls the model wrote that were never run because the turn hit its
   * tool-round limit, e.g. "write_file C:\p\index.html". Set on the
   * notice shown to the user; the next prompt tells the model about them.
   */
  unrunToolCalls?: string[];
  /**
   * Set when this message is an MCP tool result rather than something the
   * user typed. It is stored with role "user" because that is how the model's
   * chat template expects tool output, but it must not be rendered as if the
   * user wrote it.
   */
  toolResult?: {
    tool: string;
    serverName: string;
    success: boolean;
    /** The file or folder it acted on, for the step's label */
    target?: string;
    /**
     * Plan mode refused to run this. Not a failure - the mode working as
     * intended - so it must not be presented as an error.
     */
    blocked?: boolean;
  };
}

export interface ModelInfo {
  /** Library model id (src/config/models.ts) */
  id: string;
  name: string;
  uri: string;
  contextSize?: number;
}

/** A load held back because the model needs more memory than is free */
export interface MemoryPrompt {
  model: ModelInfo;
  check: MemoryCheck;
}

/**
 * The model the main process already holds, or null. A window reload
 * (Ctrl+R, or the one that follows a renderer crash) starts this page from
 * scratch while the model stays loaded.
 */
async function findLoadedModel(): Promise<ModelInfo | null> {
  try {
    const [loaded, info] = await Promise.all([
      window.llama.isModelLoaded(),
      window.llama.getModelInfo(),
    ]);
    if (!loaded.loaded || !info.info) return null;
    const { id, name, uri, contextSize } = info.info;
    return { id, name, uri, contextSize };
  } catch (err) {
    console.warn("[useLlama] Could not ask which model is loaded:", err);
    return null;
  }
}

export function useLlama() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [memoryPrompt, setMemoryPrompt] = useState<MemoryPrompt | null>(null);

  // Initialize llama.cpp on mount
  useEffect(() => {
    const init = async () => {
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

      try {
        const result = await window.llama.initialize();
        if (result.success) {
          const loaded = await findLoadedModel();
          if (loaded) {
            // A reply the previous page was streaming has no one to show it
            // to, and llama-server's single slot would make the next message
            // wait for it to finish
            await window.llama.stopGeneration();
            console.log(`[useLlama] ${loaded.name} is already loaded`);
            setCurrentModel(loaded);
            setIsModelLoaded(true);
            void useGenerationStore.getState().refreshContext();
          }
          setIsInitialized(true);
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

  const loadModel = useCallback(
    async (model: ModelInfo, options: { allowLowMemory?: boolean } = {}) => {
      setIsLoading(true);
      setError(null);
      setWarning(null);
      setMemoryPrompt(null);
      try {
        const result = await window.llama.loadModel({ ...model, ...options });
        if (result.memory) {
          // Nothing was unloaded or loaded; the user decides
          setMemoryPrompt({ model, check: result.memory });
        } else if (result.success) {
          setIsModelLoaded(true);
          setCurrentModel(model);
          void useGenerationStore.getState().refreshContext();
          if (result.warning) {
            setWarning(result.warning);
          }
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
    },
    []
  );

  const confirmLowMemory = useCallback(() => {
    if (memoryPrompt) {
      void loadModel(memoryPrompt.model, { allowLowMemory: true });
    }
  }, [memoryPrompt, loadModel]);

  const cancelLowMemory = useCallback(() => setMemoryPrompt(null), []);

  const sendMessage = useCallback(
    async (
      message: string,
      options?: { temperature?: number; maxTokens?: number }
    ) => {
      setError(null);
      try {
        const result = await window.llama.chat(message, options);
        if (result.success && result.response) {
          useGenerationStore.getState().record(result.stats, result.context);
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
      options?: {
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        topK?: number;
        repeatPenalty?: number;
      }
    ) => {
      console.log("[useLlama] sendStreamingMessage called");
      console.log("[useLlama] Message:", message.substring(0, 50));
      console.log("[useLlama] Options:", JSON.stringify(options));

      setError(null);
      try {
        // No per-token or full-response logging: both flooded the console
        const unsubscribe = window.llama.onToken(onToken);
        const result = await window.llama.chatStreaming(message, options);
        unsubscribe();

        if (result.success && result.response) {
          useGenerationStore.getState().record(result.stats, result.context);
          return result.response;
        } else {
          console.error("[useLlama] Failed:", result.error);
          throw new Error(result.error || "Failed to get response");
        }
      } catch (err) {
        console.error("[useLlama] Exception:", err);
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
      void useGenerationStore.getState().refreshContext();
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
      void useGenerationStore.getState().refreshContext();
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

  const setSystemPrompt = useCallback(async (prompt: string) => {
    if (!window.llama) {
      console.warn(
        "[useLlama] setSystemPrompt called but window.llama not available"
      );
      return;
    }
    try {
      await window.llama.setSystemPrompt(prompt);
    } catch (err) {
      console.error("[useLlama] setSystemPrompt failed:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const getSystemPrompt = useCallback(async (): Promise<string | null> => {
    if (!window.llama) {
      console.warn(
        "[useLlama] getSystemPrompt called but window.llama not available"
      );
      return null;
    }
    try {
      const result = await window.llama.getSystemPrompt();
      if (result.success && result.prompt) {
        return result.prompt;
      }
      return null;
    } catch (err) {
      console.error("[useLlama] getSystemPrompt failed:", err);
      return null;
    }
  }, []);

  return {
    isInitialized,
    isModelLoaded,
    currentModel,
    isLoading,
    error,
    warning,
    memoryPrompt,
    confirmLowMemory,
    cancelLowMemory,
    loadModel,
    sendMessage,
    sendStreamingMessage,
    clearHistory,
    setChatHistory,
    generateTitle,
    stopGeneration,
    setSystemPrompt,
    getSystemPrompt,
  };
}
