/**
 * Agent teams in the app: handles the orchestrator's delegate calls.
 *
 * Every other tool call goes straight to the usual handler. A delegate call
 * runs a sub-agent (src/agents) in a model session of its own, and each tool
 * call the agent makes goes through the same permission flow and prompts as
 * any other, under the worker policy - so a user in Ask mode approves a
 * coder's edits exactly as they would the main chat's.
 */

import { useCallback, useEffect, useState } from "react";
import { handleDelegate } from "@/agents/delegation";
import {
  isDelegateTool,
  TEAM_NOTE_TOOL,
  withDelegateNudge,
} from "@/agents/delegate";
import { toolsForRole } from "@/agents/roles";
import { teamFor } from "@/agents/team";
import type { AgentRunDeps } from "@/agents/agentRunner";
import { buildSystemPrompt, detectModelFamily } from "@/config/systemPrompts";
import { useGenerationStore } from "@/store/generationStore";
import { useTeamStore } from "@/stores/team-store";
import type { ToolCallRequest } from "@/handlers/mcpToolHandler";
import type { MCPToolResult } from "@/types/electron";
import type { ToolDefinition } from "@/types/prompts";
import type { ToolPolicy } from "./useToolPolicy";

interface Sampling {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
}

interface UseAgentTeamProps {
  conversationId: string | undefined;
  /** The session is led by an orchestrator */
  teamMode: boolean;
  /** The app's handler for one tool call; takes the policy to decide it under */
  handleToolCallRequest: (
    request: ToolCallRequest,
    options?: { policy?: ToolPolicy }
  ) => Promise<MCPToolResult>;
  /** What sub-agents work under: the session's normal tools and permissions */
  workerPolicy: ToolPolicy;
  allowedPaths: string[];
  workspaceFolder?: string;
  modelName?: string;
  sampling: Sampling;
}

function must<T extends { success: boolean; error?: string }>(
  result: T,
  what: string
): T {
  if (!result.success) {
    throw new Error(result.error ?? `${what} failed`);
  }
  return result;
}

export function useAgentTeam({
  conversationId,
  teamMode,
  handleToolCallRequest,
  workerPolicy,
  allowedPaths,
  workspaceFolder,
  modelName,
  sampling,
}: UseAgentTeamProps) {
  /** What the running sub-agent last did, for the UI */
  const [activity, setActivity] = useState<string | null>(null);

  // Text a sub-agent's model is writing, for the Team panel
  useEffect(
    () =>
      window.llama.onAgentToken(({ sessionId, token }) =>
        useTeamStore.getState().streamToken(sessionId, token)
      ),
    []
  );

  const handleToolCall = useCallback(
    async (request: ToolCallRequest): Promise<MCPToolResult> => {
      const team = teamFor(conversationId ?? "no-conversation");
      if (teamMode) {
        const refused = team.checkOrchestratorCall(request.tool);
        if (refused) return { success: false, error: refused };
      }
      if (!isDelegateTool(request.tool)) {
        const result = await handleToolCallRequest(request);
        // Saving a plan is not progress: say what comes next
        return teamMode && request.tool === "update_plan"
          ? withDelegateNudge(result)
          : result;
      }

      const deps: AgentRunDeps = {
        openSession: async (prompt) => {
          const opened = must(
            await window.llama.agentOpen(prompt),
            "Opening an agent session"
          );
          return opened.sessionId ?? "";
        },
        chat: async (sessionId, message) => {
          const reply = must(
            await window.llama.agentChat(sessionId, message, sampling),
            "The agent's model request"
          );
          return reply.response ?? "";
        },
        contextOf: async (sessionId) => {
          const context = must(
            await window.llama.agentContext(sessionId),
            "Reading the agent's context"
          );
          return { used: context.used ?? 0, size: context.size ?? 1 };
        },
        closeSession: async (sessionId) => {
          await window.llama.agentClose(sessionId);
        },
        execute: (call) =>
          handleToolCallRequest(call, { policy: workerPolicy }),
        buildPrompt: (spec) =>
          buildSystemPrompt({
            modelFamily: detectModelFamily(modelName ?? "generic"),
            // lean on purpose: the role prompt is the instruction
            capabilities: [],
            customPrompt: spec.prompt,
            mcpEnabled: true,
            nativeTools: false,
            availableTools: [
              ...toolsForRole(spec.role, workerPolicy.advertisedTools),
              TEAM_NOTE_TOOL as unknown as ToolDefinition,
            ],
            allowedPaths,
          }).prompt,
        workspaceFolder,
        isStopped: () => useGenerationStore.getState().stopRequested,
        onProgress: setActivity,
        onEvent: (event) =>
          useTeamStore
            .getState()
            .record(conversationId ?? "no-conversation", event),
      };

      try {
        return await handleDelegate(request.arguments, team, deps);
      } finally {
        setActivity(null);
      }
    },
    [
      handleToolCallRequest,
      teamMode,
      workerPolicy,
      allowedPaths,
      workspaceFolder,
      modelName,
      sampling,
      conversationId,
    ]
  );

  return { handleToolCall, activity };
}
