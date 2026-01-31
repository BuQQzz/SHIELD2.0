/**
 * MCP System Prompt Hook
 *
 * Manages system prompt composition based on model capabilities,
 * MCP readiness, and user settings. Uses the new prompt builder system.
 */

import { useEffect, useMemo } from "react";
import { getMCPSystemPrompt } from "@/handlers/mcpToolHandler";
import {
  buildSystemPrompt,
  detectModelFamily,
  getCapabilitiesFromModel,
} from "@/config/systemPrompts";
import type { SystemPromptConfig } from "@/types/prompts";

interface UseMCPSystemPromptProps {
  isModelLoaded: boolean;
  isMCPReady: boolean;
  mcpEnabled: boolean;
  baseSystemPrompt: string;
  setSystemPrompt: (prompt: string) => Promise<void>;
  /** Optional: Model name for model-specific prompts */
  modelName?: string;
  /** Optional: Model capabilities for capability-based prompts */
  modelCapabilities?: {
    toolCalling?: boolean;
    complexReasoning?: boolean;
    webSearch?: boolean;
    structuredOutput?: boolean;
    codeGeneration?: boolean;
    longContext?: boolean;
  };
  /** Optional: Whether web search is enabled */
  webSearchEnabled?: boolean;
}

export function useMCPSystemPrompt({
  isModelLoaded,
  isMCPReady,
  mcpEnabled,
  baseSystemPrompt,
  setSystemPrompt,
  modelName,
  modelCapabilities,
  webSearchEnabled,
}: UseMCPSystemPromptProps) {
  // Detect model family from name
  const modelFamily = useMemo(
    () => detectModelFamily(modelName || "generic"),
    [modelName]
  );

  // Get capabilities array from model config
  const capabilities = useMemo(
    () => getCapabilitiesFromModel(modelCapabilities || {}),
    [modelCapabilities]
  );

  useEffect(() => {
    console.log("[MCP] System prompt effect triggered", {
      isModelLoaded,
      isMCPReady,
      mcpEnabled,
      modelFamily,
      capabilities,
      shouldAddMCP: isMCPReady && mcpEnabled,
    });

    // Only set system prompt if model is loaded
    if (!isModelLoaded) {
      console.log(
        "[MCP] ⏳ Model not loaded yet, skipping system prompt update"
      );
      return;
    }

    // Check if user has a custom prompt (different from default)
    const isCustomPrompt =
      baseSystemPrompt && !baseSystemPrompt.startsWith("You are SHIELD");

    if (isMCPReady && mcpEnabled) {
      // Build prompt with MCP tools enabled
      const config: SystemPromptConfig = {
        modelFamily,
        capabilities,
        customPrompt: isCustomPrompt ? baseSystemPrompt : undefined,
        mcpEnabled: true,
        webSearchEnabled,
      };

      const {
        prompt: builtPrompt,
        includedModules,
        estimatedTokens,
      } = buildSystemPrompt(config);

      // Still append the detailed MCP prompt for now (it has the examples)
      const mcpPrompt = getMCPSystemPrompt();
      const fullPrompt = `${builtPrompt}\n\n${mcpPrompt}`;

      console.log("[MCP] ✅ Built system prompt with MCP");
      console.log("[MCP] - Model family:", modelFamily);
      console.log("[MCP] - Included modules:", includedModules);
      console.log("[MCP] - Estimated tokens:", estimatedTokens);
      console.log("[MCP] - Full prompt length:", fullPrompt.length);

      setSystemPrompt(fullPrompt);
    } else {
      // Build prompt without MCP tools
      const config: SystemPromptConfig = {
        modelFamily,
        capabilities,
        customPrompt: isCustomPrompt ? baseSystemPrompt : undefined,
        mcpEnabled: false,
        webSearchEnabled,
      };

      const {
        prompt: builtPrompt,
        includedModules,
        estimatedTokens,
      } = buildSystemPrompt(config);

      console.log("[MCP] ❌ MCP not ready or not enabled");
      console.log("[MCP] - Model family:", modelFamily);
      console.log("[MCP] - Included modules:", includedModules);
      console.log("[MCP] - Estimated tokens:", estimatedTokens);

      setSystemPrompt(builtPrompt);
    }
  }, [
    isModelLoaded,
    isMCPReady,
    mcpEnabled,
    baseSystemPrompt,
    setSystemPrompt,
    modelFamily,
    capabilities,
    webSearchEnabled,
  ]);
}
