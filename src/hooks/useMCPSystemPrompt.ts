/**
 * MCP System Prompt Hook
 *
 * Manages MCP system prompt updates based on MCP readiness and settings
 */

import { useEffect } from "react";
import { getMCPSystemPrompt } from "@/handlers/mcpToolHandler";

interface UseMCPSystemPromptProps {
  isModelLoaded: boolean;
  isMCPReady: boolean;
  mcpEnabled: boolean;
  baseSystemPrompt: string;
  setSystemPrompt: (prompt: string) => Promise<void>;
}

export function useMCPSystemPrompt({
  isModelLoaded,
  isMCPReady,
  mcpEnabled,
  baseSystemPrompt,
  setSystemPrompt,
}: UseMCPSystemPromptProps) {
  useEffect(() => {
    console.log("[MCP] System prompt effect triggered", {
      isModelLoaded,
      isMCPReady,
      mcpEnabled,
      shouldAddMCP: isMCPReady && mcpEnabled,
    });

    // Only set system prompt if model is loaded
    if (!isModelLoaded) {
      console.log(
        "[MCP] ⏳ Model not loaded yet, skipping system prompt update"
      );
      return;
    }

    if (isMCPReady && mcpEnabled) {
      const mcpPrompt = getMCPSystemPrompt();
      const fullPrompt = `${baseSystemPrompt}\n\n${mcpPrompt}`;
      console.log("[MCP] ✅ MCP is ready and enabled, adding system prompt");
      console.log("[MCP] Full system prompt length:", fullPrompt.length);
      console.log("[MCP] MCP tools section:", mcpPrompt);
      setSystemPrompt(fullPrompt);
    } else {
      console.log(
        "[MCP] ❌ MCP not ready or not enabled, using base system prompt only"
      );
      console.log("[MCP] - isMCPReady:", isMCPReady);
      console.log("[MCP] - mcpEnabled:", mcpEnabled);
      setSystemPrompt(baseSystemPrompt);
    }
  }, [
    isModelLoaded,
    isMCPReady,
    mcpEnabled,
    baseSystemPrompt,
    setSystemPrompt,
  ]);
}
