import { useMemo } from "react";
import type { ModelCapabilities } from "@/config/models";
import type { ModelOption } from "@/components/chat/ModelSelector";

/**
 * Hook to check current model's capabilities
 * Returns capability flags and helper methods
 */
export function useModelCapabilities(currentModel: ModelOption | null) {
  const capabilities: ModelCapabilities | null = useMemo(() => {
    return currentModel?.capabilities || null;
  }, [currentModel]);

  const supports = useMemo(
    () => ({
      /**
       * Can the model reliably use tool calling/function calling?
       */
      toolCalling: capabilities?.toolCalling ?? false,

      /**
       * Is the model good at complex reasoning tasks?
       */
      complexReasoning: capabilities?.complexReasoning ?? true,

      /**
       * Does the model work well with web search?
       */
      webSearch: capabilities?.webSearch ?? true,

      /**
       * Can the model follow strict output formats (JSON, XML)?
       */
      structuredOutput: capabilities?.structuredOutput ?? false,

      /**
       * Can the model effectively use long context?
       */
      longContext: capabilities?.longContext ?? false,

      /**
       * Is the model good at generating code?
       */
      codeGeneration: capabilities?.codeGeneration ?? true,

      /**
       * Multilingual support quality
       */
      multilingual: capabilities?.multilingual ?? "basic",

      /**
       * Recommended temperature settings
       */
      temperatureRange: capabilities?.temperatureRange ?? {
        min: 0.1,
        max: 1.0,
        default: 0.7,
      },
    }),
    [capabilities]
  );

  /**
   * Check if a specific feature should be enabled
   */
  const shouldEnable = useMemo(
    () => ({
      mcp: supports.toolCalling || supports.structuredOutput, // Enable MCP if model supports tools or structured output
      webSearch: supports.webSearch,
      advancedSettings: supports.complexReasoning,
    }),
    [supports]
  );

  /**
   * Get warning message if feature is not recommended
   */
  const getWarning = (
    feature: "mcp" | "webSearch" | "structuredOutput"
  ): string | null => {
    switch (feature) {
      case "mcp":
        if (!supports.toolCalling) {
          return "This model does not support native function calling. MCP tool operations may not work reliably. Recommended models: Llama 3.3 70B, Qwen 2.5 Coder 32B, Mistral Large.";
        }
        return null;
      case "webSearch":
        if (!supports.webSearch) {
          return "This model may struggle with processing web search results effectively.";
        }
        return null;
      case "structuredOutput":
        if (!supports.structuredOutput) {
          return "This model may not follow structured output formats reliably.";
        }
        return null;
      default:
        return null;
    }
  };

  return {
    capabilities,
    supports,
    shouldEnable,
    getWarning,
    hasCapabilities: capabilities !== null,
  };
}
