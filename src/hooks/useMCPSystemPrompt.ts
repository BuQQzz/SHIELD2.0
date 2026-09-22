/**
 * MCP System Prompt Hook
 *
 * Manages system prompt composition based on model capabilities,
 * MCP readiness, and user settings. Uses the new prompt builder system.
 */

import { useEffect, useMemo } from "react";
import {
  buildSystemPrompt,
  detectModelFamily,
  getCapabilitiesFromModel,
} from "@/config/systemPrompts";
import type { SystemPromptConfig, ToolDefinition } from "@/types/prompts";

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
  /** Tools exposed by the connected MCP servers */
  availableTools?: ToolDefinition[];
  /** True while the MCP tool list is still being fetched */
  toolsLoading?: boolean;
  /** Directories the MCP servers are permitted to touch */
  allowedPaths?: string[];
  /** Plan mode - describe intended tool calls instead of making them */
  planOnly?: boolean;
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
  availableTools,
  toolsLoading = false,
  allowedPaths,
  planOnly = false,
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

    // MCP is up but we have not heard back from the servers yet. Publishing
    // now would hand the model a prompt with no tools, and it would correctly
    // answer "I can't do that" until the real list arrives.
    if (isMCPReady && mcpEnabled && toolsLoading) {
      console.log(
        "[MCP] ⏳ Waiting for the MCP tool list before setting prompt"
      );
      return;
    }

    if (isMCPReady && mcpEnabled) {
      // Build prompt with MCP tools enabled
      const config: SystemPromptConfig = {
        modelFamily,
        capabilities,
        customPrompt: isCustomPrompt ? baseSystemPrompt : undefined,
        mcpEnabled: true,
        webSearchEnabled,
        availableTools,
        allowedPaths,
        planOnly,
      };

      const {
        prompt: builtPrompt,
        includedModules,
        estimatedTokens,
      } = buildSystemPrompt(config);

      console.log("[MCP] ✅ Built system prompt with MCP");
      console.log("[MCP] - Model family:", modelFamily);
      console.log("[MCP] - Included modules:", includedModules);
      console.log("[MCP] - Estimated tokens:", estimatedTokens);
      console.log("[MCP] - Tool count:", availableTools?.length ?? 0);
      console.log("[MCP] - Full prompt length:", builtPrompt.length);

      setSystemPrompt(builtPrompt);
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
    availableTools,
    toolsLoading,
    allowedPaths,
    planOnly,
  ]);
}
