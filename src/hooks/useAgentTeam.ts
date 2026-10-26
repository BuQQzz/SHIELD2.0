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
import { isDelegateTool, TEAM_NOTE_TOOL } from "@/agents/delegate";
import { planStepsFromRuns } from "@/agents/teamPlan";
import { MAX_SAVED_RUNS } from "@/agents/runView";
import { toolsForRole } from "@/agents/roles";
import { teamFor } from "@/agents/team";
import type { AgentRunDeps } from "@/agents/agentRunner";
import { buildSystemPrompt, detectModelFamily } from "@/config/systemPrompts";
import { useGenerationStore } from "@/store/generationStore";
import { useConversationStore } from "@/stores/conversation-store";
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
  /** The app's handler for one tool call; takes the policy to decide it under */
  handleToolCallRequest: (
    request: ToolCallRequest,
    options?: { policy?: ToolPolicy; agent?: string }
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

/**
 * The session's plan checklist follows the delegations: a step when an agent
 * starts, ticked when it ends DONE (agents/teamPlan.ts). Not the
 * orchestrator's to keep: it stalled on it (five live runs).
 */
function syncPlan(conversationId: string): void {
  const { runsByConversation, turnStart } = useTeamStore.getState();
  const runs = (runsByConversation[conversationId] ?? []).slice(
    turnStart[conversationId] ?? 0
  );
  const steps = planStepsFromRuns(runs);
  const conversations = useConversationStore.getState();
  if (
    steps.length === 0 ||
    conversations.currentConversation?.id !== conversationId
  ) {
    return;
  }
  conversations.updateConversation({
    plan: { steps, updatedAt: new Date().toISOString(), by: "model" },
  });
}

/** The runs go into the conversation, saved with it, so they survive a restart */
function saveRuns(conversationId: string): void {
  const conversations = useConversationStore.getState();
  if (conversations.currentConversation?.id !== conversationId) return;
  const runs = useTeamStore.getState().runsByConversation[conversationId] ?? [];
  conversations.updateConversation({ agentRuns: runs.slice(-MAX_SAVED_RUNS) });
}

export function useAgentTeam({
  conversationId,
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
      if (!isDelegateTool(request.tool)) return handleToolCallRequest(request);
      const team = teamFor(conversationId ?? "no-conversation");

      const deps: AgentRunDeps = {
        openSession: async (prompt) => {
          const opened = must(
            await window.llama.agentOpen(prompt),
            "Opening an agent session"
          );
          return opened.sessionId ?? "";
        },
        chat: async (sessionId, message, options) => {
          const reply = must(
            await window.llama.agentChat(sessionId, message, {
              ...sampling,
              ...options,
            }),
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
        execute: (call, context) =>
          handleToolCallRequest(call, {
            policy: workerPolicy,
            agent: context?.role,
          }),
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
        onEvent: (event) => {
          const id = conversationId ?? "no-conversation";
          useTeamStore.getState().record(id, event);
          if (event.type === "start" || event.type === "end") syncPlan(id);
          if (event.type === "end") saveRuns(id);
        },
      };

      try {
        return await handleDelegate(request.arguments, team, deps);
      } finally {
        setActivity(null);
      }
    },
    [
      handleToolCallRequest,
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
