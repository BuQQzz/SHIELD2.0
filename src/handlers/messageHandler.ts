import type { Message } from "../hooks/useLlama";
import { withSteer } from "./steer";
import type { ModelSettings } from "../types/settings";
import type { NativeToolResult } from "../types/nativeTools";
import { useSettingsStore } from "../store/settingsStore";
import { orchestratorRounds } from "../agents/delegate";
import { useGenerationStore } from "../store/generationStore";
import { processMCPToolCalls, unrunToolCallsNote } from "./mcpMessageHandler";
import {
  readFailedEditFiles,
  recordNoteFor,
  takeLedgerNote,
} from "./workLedger";
import { resultPayload } from "./mcpToolHandler";
import { recallFor } from "./memoryRecall";
import { checkPlan, planRemarks, takePlanNote } from "./sessionPlan";
import { useConversationStore } from "@/stores/conversation-store";
import { useTeamStore } from "@/stores/team-store";
import { unbackedRoleNote } from "../agents/teamClaims";
import {
  CHANGE_NOTE,
  isChangeRequest,
  isProjectQuestion,
  QUESTION_NOTE,
} from "../agents/teamRouting";

/**
 * A file's current contents for SHIELD's own checks, through the filesystem
 * server (so only inside the allowed folder); null when it cannot be read.
 */
async function readProjectFile(path: string): Promise<string | null> {
  const result = await window.electronAPI?.mcp?.callTool({
    serverName: "filesystem",
    tool: "read_text_file",
    arguments: { path },
  });
  if (!result?.success || (result.data as { isError?: unknown })?.isError) {
    return null;
  }
  return resultPayload(result.data);
}

/**
 * After a turn in a code session: when the final reply talks about a change
 * whose edit failed and is still not in the file, put SHIELD's record under
 * the reply, for the user; and check the plan's completed steps the same way.
 */
async function noteUnappliedEdits(workspace?: string): Promise<void> {
  const conversation = useConversationStore.getState().currentConversation;
  const answer = conversation?.messages.at(-1);
  if (!conversation || answer?.role !== "assistant") return;
  const files = await readFailedEditFiles(
    conversation.messages,
    readProjectFile
  );
  checkPlan(conversation.messages, files);
  const note = recordNoteFor(
    answer.content,
    conversation.messages,
    files,
    workspace
  );
  // An agent team's answer that credits a role which never ran
  const team = useTeamStore.getState();
  const teamNote = (conversation as { team?: boolean }).team
    ? unbackedRoleNote(
        answer.content,
        (team.runsByConversation[conversation.id] ?? []).slice(
          team.turnStart[conversation.id] ?? 0
        )
      )
    : "";
  const combined = [note, teamNote].filter(Boolean).join(" ");
  if (!combined) return;
  useConversationStore.getState().updateConversation({
    messages: conversation.messages.map((message) =>
      message.id === answer.id ? { ...message, recordNote: combined } : message
    ),
  });
}
import { extractToolCalls } from "./mcpToolHandler";
import {
  hasUnsupportedNativeToolCall,
  UNSUPPORTED_NATIVE_TOOL_CALL_MESSAGE,
} from "./toolCallParsing";
import {
  buildMCPRetryPrompt,
  isLikelyMCPToolIntent,
  shouldRetryWithMCP,
} from "./mcpRetryPolicy";
import type { ToolCallRequest } from "./mcpToolHandler";
import type { MCPToolResult } from "@/types";
import { parseAllThinking } from "../utils/thinkingParser";
import { detectTruncation } from "../utils/messageTruncation";
import { kindOf } from "../lib/sessions";
import type { ConversationKind } from "../types/conversation";

const FILE_WORDS =
  /\b(?:folders?|director(?:y|ies)|dirs?|workspace|files?|paths?|projects?|repos?|repositor(?:y|ies)|codebase|readme)\b|\bin here\b/i;
/** main.ts, notes.txt, package.json */
const FILE_NAME =
  /\b[\w-]+\.(?:[cm]?[jt]sx?|json|md|txt|py|html?|css|scss|ya?ml|toml|xml|csv|log|ini|cfg|env|ps1|bat|cmd|sh|cs|java|go|rs|c|cpp|h|hpp|rb|php|sql)\b/i;
/** Library names, not files: "the newest Node.js release" */
const LIBRARY_NAMES = /\b(?:node|vue|next|nuxt|react|express|three|d3)\.js\b/gi;
/** C:\Users\..., ./src, ../docs */
const PATH = /\b[a-z]:[\\/]|(?:^|[\s"'`(])\.{1,2}[\\/]/i;

/**
 * Whether a message is about the user's files - "what's in this folder?",
 * "read notes.txt", "how is this project laid out?" - rather than a
 * question the model answers from what it knows.
 */
export function refersToFiles(content: string): boolean {
  return (
    FILE_WORDS.test(content) ||
    FILE_NAME.test(content.replace(LIBRARY_NAMES, "")) ||
    PATH.test(content)
  );
}

/**
 * Generate a unique message ID
 */
let messageIdCounter = 0;
export function generateMessageId(): string {
  return `${Date.now()}-${messageIdCounter++}`;
}

interface MessageHandlerProps {
  isModelLoaded: boolean;
  currentConversation: {
    id: string;
    messages: Message[];
    /** Code sessions have the file tools; chats (and older chats) do not */
    kind?: ConversationKind;
    /** Led by an orchestrator that delegates; it has no file tools itself */
    team?: boolean;
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
      toolResults?: NativeToolResult[];
      thinking?: boolean;
    }
  ) => Promise<string>;
  addMessage: (message: Message) => void;
  generateTitle: (userMessage: string) => Promise<string | null>;
  updateTitle: (title: string) => void;
  saveCurrentConversation: () => Promise<void>;
  modelSettings: ModelSettings;
  handleToolCallRequest?: (request: ToolCallRequest) => Promise<MCPToolResult>;
  isMCPReady?: boolean;
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
  handleToolCallRequest,
  isMCPReady = false,
}: MessageHandlerProps) {
  // Web search is a tool the model calls (web_search, fetch_page) rather
  // than a search run before the message
  // `modelNote` goes to the model with the message but is not shown or
  // saved as what the user typed (the facts behind "Draft AGENTS.md")
  // `shown`: the message is in the chat already (steer left over at the end
  // of a turn, sent as the next message)
  return async (
    content: string,
    options?: { modelNote?: string; shown?: boolean }
  ) => {
    if (!isModelLoaded) {
      return;
    }

    // Add user message FIRST so UI updates immediately
    const userMessage: Message = {
      id: generateMessageId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    if (!options?.shown) {
      setMessages((prev) => [...prev, userMessage]);
      addMessage(userMessage);
    }
    useGenerationStore.getState().setStopRequested(false);

    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    const assistantMessageId = generateMessageId();

    try {
      const { settings } = useSettingsStore.getState();

      let messageWithContext = content;

      // File tools, and everything that pushes the model towards them,
      // belong to Code sessions
      const fileTools = kindOf(currentConversation) === "code";
      // The orchestrator of an agent team has no file tools: nudging it to
      // use them would only make it ask for what it cannot have
      const teamMode = !!currentConversation?.team;
      const allowedTools = settings.mcp.allowedTools ?? [];
      const shouldForceMCPFirstAttempt =
        fileTools &&
        !teamMode &&
        isMCPReady &&
        allowedTools.length > 0 &&
        isLikelyMCPToolIntent(content);

      if (shouldForceMCPFirstAttempt) {
        messageWithContext = buildMCPRetryPrompt(content, allowedTools);
      }

      // The system prompt names the folder, yet Qwen3-Coder still guessed
      // Documents and then its own project path for "what's in this folder?".
      // Restated next to the request, where recency makes it hard to miss -
      // for requests about files only: next to every message it sent the
      // model listing and reading files for questions like "explain MCP"
      // (2026-09-25). Only the model sees this; the stored message is the
      // user's text.
      const workspace = settings.mcp.workspaceFolder;
      if (
        fileTools &&
        workspace &&
        settings.mcp.enabled &&
        isMCPReady &&
        (refersToFiles(content) || isLikelyMCPToolIntent(content))
      ) {
        messageWithContext += `\n\n[Current folder: ${workspace}]`;
      }

      // The last turn ended at the tool-round limit with calls still pending
      const unrun = currentConversation?.messages.at(-1)?.unrunToolCalls;
      if (unrun?.length) {
        messageWithContext += `\n\n${unrunToolCallsNote(unrun)}`;
      }

      // What the model changed and ran, from the tools' results - sent after
      // new work, so its own earlier claims are not its only record. Then the
      // session's plan while steps are open: it lives on the conversation,
      // so clearing the model's history never loses it
      if (fileTools && currentConversation) {
        const files = await readFailedEditFiles(
          currentConversation.messages,
          readProjectFile
        );
        const record = takeLedgerNote(
          currentConversation.id,
          currentConversation.messages,
          workspace,
          files
        );
        if (record) messageWithContext += `\n\n${record}`;
        // The orchestrator has no update_plan: its plan is built from its
        // delegations (agents/teamPlan.ts), so the note that says "keep it
        // current with update_plan" is not sent
        const plan = useConversationStore.getState().currentConversation?.plan;
        const planText = teamMode
          ? ""
          : takePlanNote(
              currentConversation.id,
              currentConversation.messages,
              plan,
              planRemarks(
                plan?.steps ?? [],
                currentConversation.messages,
                files
              )
            );
        if (planText) messageWithContext += `\n\n${planText}`;
        // A question goes to the reviewer, a change straight to the coder
        if (teamMode && isProjectQuestion(content)) {
          messageWithContext += `\n\n${QUESTION_NOTE}`;
        } else if (teamMode && isChangeRequest(content)) {
          messageWithContext += `\n\n${CHANGE_NOTE}`;
        }
      }

      // Earlier conversations that may bear on this message, found by
      // SHIELD rather than left for the model to think of searching
      if (currentConversation) {
        const recall = await recallFor(content, currentConversation.id);
        if (recall) messageWithContext += `\n\n${recall}`;
      }

      if (options?.modelNote) messageWithContext += `\n\n${options.modelNote}`;

      const returnedResponse = await sendStreamingMessage(
        messageWithContext,
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
          // The orchestrator only routes: no long thought for a greeting
          ...(teamMode ? { thinking: false } : {}),
        }
      );

      // The returned reply is complete; the streamed one only when nothing
      // came back. Streamed tokens can arrive after the reply (a cached
      // reply at 70 tok/s) and be missed: the chat kept "I'll check the
      // current Node.js release version for you by" - 57 of 212 characters,
      // without its tool call (2026-09-24).
      const finalContent = returnedResponse || streamingContentRef.current;
      const unsupportedNativeCall = hasUnsupportedNativeToolCall(finalContent);
      const safeFinalContent = unsupportedNativeCall
        ? UNSUPPORTED_NATIVE_TOOL_CALL_MESSAGE
        : finalContent;

      // Parse and extract thinking/reasoning content from various XML formats
      const { reasoning, thinking, processedContent } = parseAllThinking(
        safeFinalContent,
        false,
        settings.webSearch.showReasoning
      );

      let assistantProcessedContent = processedContent;
      let assistantReasoning = reasoning;
      let assistantThinking = thinking;
      // A retry is still the same visible reply. Preserve a capsule written
      // by the first attempt if the retry has enough room and writes none.
      let replySummary = useGenerationStore.getState().lastSummary;
      let replyCapsule = useGenerationStore.getState().lastCapsule;

      const hasToolCalls =
        extractToolCalls(processedContent, {
          enableOpenAIToolCalls: true,
          enableXmlToolCalls: true,
        }).length > 0;

      const shouldRunMCPRetry =
        !unsupportedNativeCall &&
        !hasToolCalls &&
        fileTools &&
        !teamMode &&
        isMCPReady &&
        (settings.mcp.allowedTools?.length ?? 0) > 0 &&
        shouldRetryWithMCP(content, processedContent);

      if (shouldRunMCPRetry) {
        setStreamingContent("");
        streamingContentRef.current = "";

        const retryResponse = await sendStreamingMessage(
          buildMCPRetryPrompt(content, settings.mcp.allowedTools),
          (token) => {
            streamingContentRef.current += token;
            setStreamingContent(streamingContentRef.current);
          },
          {
            temperature: 0.2,
            maxTokens: modelSettings.maxTokens,
            topP: 0.9,
            topK: 40,
            repeatPenalty: 1.1,
          }
        );

        const retryFinalContent = retryResponse || streamingContentRef.current;
        const safeRetryContent = hasUnsupportedNativeToolCall(retryFinalContent)
          ? UNSUPPORTED_NATIVE_TOOL_CALL_MESSAGE
          : retryFinalContent;
        const retryParsed = parseAllThinking(
          safeRetryContent,
          false,
          settings.webSearch.showReasoning
        );

        assistantProcessedContent = retryParsed.processedContent;
        assistantReasoning = retryParsed.reasoning;
        assistantThinking = retryParsed.thinking;
        replySummary =
          useGenerationStore.getState().lastSummary ?? replySummary;
        replyCapsule =
          useGenerationStore.getState().lastCapsule ?? replyCapsule;
      }

      // Detect truncation
      const wasTruncated =
        !unsupportedNativeCall &&
        detectTruncation(finalContent, {
          maxTokens: modelSettings.maxTokens,
        });

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: assistantProcessedContent,
        timestamp: new Date(),
        truncated: wasTruncated,
        reasoning: assistantReasoning,
        thinking: assistantThinking,
        stats: useGenerationStore.getState().lastStats ?? undefined,
        summary: replySummary ?? undefined,
        capsule: replyCapsule ?? undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      addMessage(assistantMessage);
      setStreamingContent("");
      streamingContentRef.current = "";

      // Check for MCP tool calls in the AI response
      if (handleToolCallRequest) {
        await processMCPToolCalls(assistantMessage, {
          onToolCallDetected: handleToolCallRequest,
          addMessage,
          enableHybridParser: true,
          maxToolCallsPerTurn: settings.mcp.maxToolCallsPerTurn,
          maxToolRounds: teamMode
            ? orchestratorRounds(settings.mcp.maxToolRounds)
            : settings.mcp.maxToolRounds,
          workspaceFolder: settings.mcp.workspaceFolder,
          isStopped: () => useGenerationStore.getState().stopRequested,
          // About a third of the context window for any one result (~3 chars
          // per token for code), so the request and the reply still fit
          maxResultChars: Math.max(
            2000,
            Math.floor(
              (useGenerationStore.getState().context?.size ?? 8192) * 0.35 * 3
            )
          ),
          continueConversation: async (resultPrompt: string, toolResults) => {
            const toolPrompt = withSteer(
              resultPrompt,
              useGenerationStore.getState().takeSteer()
            );
            // Continue the conversation with tool results
            setIsGenerating(true);
            setStreamingContent("");
            streamingContentRef.current = "";

            const toolMessageId = generateMessageId();

            // Not setIsGenerating(false) after: the turn runs on (the next
            // tool, a delegation) until handleSend's own finally. Set false
            // here, the Stop button went and the input opened mid-turn
            const returned = await sendStreamingMessage(
              toolPrompt,
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
                ...(toolResults?.length ? { toolResults } : {}),
                ...(teamMode ? { thinking: false } : {}),
              }
            );

            const rawToolReply = returned || streamingContentRef.current;
            const toolReply = hasUnsupportedNativeToolCall(rawToolReply)
              ? UNSUPPORTED_NATIVE_TOOL_CALL_MESSAGE
              : rawToolReply;

            const toolResponseMessage: Message = {
              id: toolMessageId,
              role: "assistant",
              content: toolReply,
              timestamp: new Date(),
              stats: useGenerationStore.getState().lastStats ?? undefined,
              summary: useGenerationStore.getState().lastSummary ?? undefined,
              capsule: useGenerationStore.getState().lastCapsule ?? undefined,
            };

            setMessages((prev) => [...prev, toolResponseMessage]);
            addMessage(toolResponseMessage);
            setStreamingContent("");
            streamingContentRef.current = "";

            // Hand the reply back so follow-up tool calls get executed too
            return toolReply;
          },
        });
      }

      if (fileTools) await noteUnappliedEdits(workspace);

      // Generate title for first message in conversation
      if (currentConversation && currentConversation.messages.length === 0) {
        const generatedTitle = await generateTitle(content);
        if (generatedTitle) {
          updateTitle(generatedTitle);
        }
      }

      await saveCurrentConversation();
    } catch (err) {
      console.error("[MessageHandler] Error during message handling:", err);
      console.error(
        "[MessageHandler] Error stack:",
        err instanceof Error ? err.stack : "N/A"
      );

      const isAbortError =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("abort"));

      if (isAbortError) {
        console.log("[MessageHandler] Aborted by user");
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
