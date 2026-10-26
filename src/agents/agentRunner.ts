/**
 * Runs one sub-agent to the end of its task.
 *
 * The agent works in a session of its own (its own history, the shared
 * model), through the same tool loop as the main chat, so every guard that
 * loop has - repeat calls, cut-off calls, result size, untrusted-result
 * envelopes - applies to it too. On top, this adds what a team needs:
 *
 * - a context meter on every result, and a hard checkpoint at 70%, where the
 *   agent must write a hand-off instead of carrying on (history is not
 *   summarised away: that lost detail)
 * - limits per role that SHIELD enforces (roles.ts), and a cap on commands
 * - a record of what the tools actually did, which the report carries next
 *   to the agent's own claims
 * - a hand-off kept from the first step, so a run that dies or is stopped
 *   can still be continued by a fresh agent from facts
 *
 * Everything outside (the model, the tools and their permissions) is
 * injected, so the same code runs in the app and in a headless test.
 */

import {
  extractToolCalls,
  type ToolCallRequest,
} from "../handlers/mcpToolHandler";
import { processMCPToolCalls } from "../handlers/mcpMessageHandler";
import type { MCPToolResult } from "../types/electron";
import {
  DENIED_BY_USER,
  describeWork,
  EMPTY_WORK,
  HANDOFF_FORMAT,
  handoffNote,
  parseHandoff,
  stripHandoff,
} from "./handoff";
import { isChangeRequest } from "./teamRouting";
import {
  CHECKPOINT_AT,
  checkToolUse,
  roleSpec,
  TEAM_NOTE_TOOL_NAME,
  type RoleSpec,
} from "./roles";
import type { AgentEvent } from "./events";
import type { TeamRun } from "./team";
import type {
  AgentReport,
  AgentRole,
  AgentStatus,
  StoredHandoff,
  VerifiedWork,
} from "./types";

export interface AgentRunDeps {
  openSession(systemPrompt: string): Promise<string>;
  /** `thinking: false` asks a thinking model to answer without thought */
  chat(
    sessionId: string,
    message: string,
    options?: { thinking?: boolean }
  ): Promise<string>;
  /** Tokens the session's last request used, and the window */
  contextOf(sessionId: string): Promise<{ used: number; size: number }>;
  closeSession(sessionId: string): Promise<void>;
  /** Runs a call through the app's permission policy and tools */
  execute(
    call: ToolCallRequest,
    context?: { role: AgentRole }
  ): Promise<MCPToolResult>;
  /** The system prompt for a role: its text plus the tools it may use */
  buildPrompt(spec: RoleSpec): string;
  workspaceFolder?: string;
  isStopped?: () => boolean;
  /** Share of the window at which an agent must hand over; default 70% */
  checkpointAt?: number;
  /** One line per step, for the user to see what the agent is doing */
  onProgress?: (line: string) => void;
  /** Everything the run does, for the Team panel */
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentRunInput {
  role: AgentRole;
  task: string;
  /** The hand-off of an earlier PARTIAL run to carry on from */
  continueFrom?: StoredHandoff;
  team: TeamRun;
}

const checkpointNotice = (at: number) =>
  `\n[SHIELD: your context is ${Math.round(at * 100)}% full. Stop working now. Do not call any more tools. Reply with your HANDOFF block and nothing else.]`;

/**
 * Asked of an agent that stopped without a report: out of room, out of
 * steps, or just ending. A reviewer once ended on a malformed tool call, so
 * with no findings and no hand-off; the orchestrator then told the user the
 * review had confirmed everything was correct. Findings first, so the
 * reader gets what was seen, then the hand-off.
 */
/** For a thinking model that spent the whole reply on thought and said nothing */
/**
 * The task's file names as full paths in the project folder. Told only "calc.py"
 * and the folder (in its prompt, below the tool list), Bonsai 27B's coder read a
 * name of its own (calcs.py, calculators/calculator.py) in 7 of 12 first calls;
 * with this note, 0 of 12 (the folder alone: 5 of 12; 2026-10-26).
 */
export function namedFilesNote(task: string, folder?: string): string {
  if (!folder) return "";
  const sep = folder.includes("\\") && !folder.includes("/") ? "\\" : "/";
  const base = folder.replace(/[\\/]+$/, "");
  const names = [
    ...task.matchAll(
      /(?<![\w/\\.:~-])((?:[\w-]+[/\\])*[\w-]{2,}\.[A-Za-z][A-Za-z0-9]{0,5})(?![\w/\\-])/g
    ),
  ].map((m) => m[1]!);
  const paths = [...new Set(names)].map(
    (name) => `${base}${sep}${name.replace(/[/\\]/g, sep)}`
  );
  return paths.length
    ? `[Files named in the task, in the project folder: ${paths.join("; ")}]`
    : "";
}

const SHORT_REPORT_REQUEST = `[SHIELD: your last reply was empty. Do not think at length. Reply in a few short lines: what you did and saw, then your HANDOFF block:\n${HANDOFF_FORMAT}]`;

const REPORT_REQUEST = `[SHIELD: stop here. Do not call any tool. Reply now with your report: first what you did and found, in plain words, quoting real output (a reviewer lists each problem with file and line, or says "no problems found"); then your HANDOFF block, in this format:\n${HANDOFF_FORMAT}]`;

/** After this many refused calls following the checkpoint, the run is ended */
const MAX_REFUSALS_AFTER_CHECKPOINT = 2;

const pathOf = (call: ToolCallRequest) => {
  const a = call.arguments;
  const value = a.path ?? a.destination ?? a.source;
  return typeof value === "string" ? value : "";
};

const shortPath = (path: string) => path.split(/[\\/]/).slice(-2).join("/");

function describeCall(role: AgentRole, call: ToolCallRequest): string {
  if (call.tool === "run_command") {
    const command = String(call.arguments.command ?? "").slice(0, 80);
    return `${role}: ran ${command}`;
  }
  const path = pathOf(call);
  return `${role}: ${call.tool}${path ? ` ${shortPath(path)}` : ""}`;
}

/** The text of a tool result, as the model would read it */
/** What the approval bar's Deny returns (useMCPDialogs) */
const USER_DENIED = "User denied permission";

function resultText(result: MCPToolResult): string {
  if (!result.success) return result.error ?? "";
  const data = result.data as
    { content?: { text?: string }[] } | string | undefined;
  if (typeof data === "string") return data;
  return (data?.content ?? []).map((part) => part.text ?? "").join("\n");
}

function recordCall(
  work: VerifiedWork,
  call: ToolCallRequest,
  result: MCPToolResult
): void {
  const path = pathOf(call);
  const fileActions: Record<string, VerifiedWork["files"][number]["action"]> = {
    write_file: "written",
    edit_file: "edited",
    move_file: "moved",
    delete_file: "deleted",
    create_directory: "directory",
  };
  const action = fileActions[call.tool];
  if (action) {
    work.files.push({
      path: shortPath(path) || path,
      action,
      ok: result.success,
    });
    return;
  }
  if (call.tool === "run_command") {
    const text = resultText(result);
    const exit = /^Exit code (-?\d+)/.exec(text);
    const suspect = /but (\d+) lines? of the output look/.exec(text);
    work.commands.push({
      command: String(call.arguments.command ?? ""),
      exitCode: result.success && exit ? Number(exit[1]) : null,
      suspectLines: suspect ? Number(suspect[1]) : 0,
    });
  }
}

/** How much of a tool's output the Team panel keeps per step */
const EVENT_TEXT_CHARS = 1200;

function endEvent(report: AgentReport): AgentEvent {
  return {
    type: "end",
    runId: report.handoffId,
    status: report.status,
    summary: report.summary,
    reason: report.reason,
    workLines: describeWork(report.work),
    steps: report.steps,
    contextPercent: report.contextPercent,
  };
}

// The server files thinking apart, yet a coder's reply was once a bare
// "</think>", shown in the Team panel as the agent's words (2026-10-26)
const withoutToolCalls = (text: string) =>
  text
    .replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, "")
    .replace(/<\/?think>/gi, "")
    .trim();

const failed = (
  input: AgentRunInput,
  handoffId: string,
  reason: string
): AgentReport => ({
  role: input.role,
  status: "FAILED",
  handoffId,
  summary: "",
  parsed: { found: false, done: "", inProgress: "", next: "", notes: "" },
  work: { files: [], commands: [], refused: [] },
  steps: 0,
  contextPercent: 0,
  reason,
});

export async function runAgent(
  input: AgentRunInput,
  deps: AgentRunDeps
): Promise<AgentReport> {
  const { role, team } = input;
  const spec = roleSpec(role);
  const checkpointAt = deps.checkpointAt ?? CHECKPOINT_AT;
  const handoffId = team.nextHandoffId();
  const work: VerifiedWork = {
    ...EMPTY_WORK,
    files: [],
    commands: [],
    refused: [],
  };

  // Kept from the first step: a run that dies or is stopped can be continued
  const store = (
    status: AgentStatus,
    parsed = parseHandoff(""),
    finished = false
  ) =>
    team.saveHandoff({
      id: handoffId,
      role,
      task: input.task,
      status,
      finished,
      parsed,
      work,
    });
  store("PARTIAL");

  const emit = (event: AgentEvent) => {
    try {
      deps.onEvent?.(event);
    } catch (error) {
      console.warn("[agents] An event listener failed:", error);
    }
  };
  emit({
    type: "start",
    runId: handoffId,
    role,
    task: input.task,
    continuesFrom: input.continueFrom?.id,
  });

  const seed = [
    `TASK:\n${input.task}`,
    namedFilesNote(input.task, deps.workspaceFolder),
    input.continueFrom
      ? handoffNote({
          fromRole: input.continueFrom.role,
          status: input.continueFrom.status,
          parsed: input.continueFrom.parsed,
          work: input.continueFrom.work,
        })
      : "",
    team.notesBlock(),
    "Begin.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let sessionId: string;
  try {
    sessionId = await deps.openSession(deps.buildPrompt(spec));
  } catch (error) {
    const report = failed(
      input,
      handoffId,
      error instanceof Error ? error.message : String(error)
    );
    emit(endEvent(report));
    return report;
  }
  emit({ type: "session", runId: handoffId, sessionId });

  /** A model reply, shown as the agent speaking (its tool-call markup left out) */
  const chat = async (message: string, options?: { thinking?: boolean }) => {
    const text = await deps.chat(sessionId, message, options);
    const said = withoutToolCalls(text);
    if (said) emit({ type: "reply", runId: handoffId, text: said });
    return text;
  };

  let steps = 0;
  let commandsRun = 0;
  let checkpointing = false;
  let refusalsAfterCheckpoint = 0;
  let lastPercent = 0;
  let reply = "";
  let stoppedByUser = false;

  const refuse = (why: string): MCPToolResult => ({
    success: false,
    // "Not run:" - the tool loop does not remember these as the turn's result
    error: `Not run: ${why}`,
  });

  const run = async (call: ToolCallRequest): Promise<MCPToolResult> => {
    deps.onProgress?.(describeCall(role, call));

    if (call.tool === TEAM_NOTE_TOOL_NAME) {
      const kept = team.addNote(String(call.arguments.text ?? ""));
      return kept
        ? { success: true, data: `Noted for the team: ${kept}` }
        : refuse('add_team_note needs "text".');
    }
    if (checkpointing) {
      refusalsAfterCheckpoint += 1;
      return refuse(
        "your context is nearly full. Stop now and reply with your HANDOFF block."
      );
    }
    const why = checkToolUse(role, call);
    if (why) {
      work.refused.push(
        `${role} ${call.tool}${pathOf(call) ? ` ${shortPath(pathOf(call))}` : ""}`
      );
      return refuse(why);
    }
    if (call.tool === "run_command") {
      if (commandsRun >= spec.maxCommands) {
        work.refused.push(
          `${role} run_command (over the limit of ${spec.maxCommands})`
        );
        return refuse(
          `you have run ${spec.maxCommands} commands, the most a ${role} may. Report what you have: write your HANDOFF block now.`
        );
      }
      commandsRun += 1;
    }
    const result = await deps.execute(call, { role });
    if (!result.success && result.error === USER_DENIED) {
      work.refused.push(
        `${role} ${call.tool}${pathOf(call) ? ` ${shortPath(pathOf(call))}` : ""} ${DENIED_BY_USER}`
      );
      return result;
    }
    recordCall(work, call, result);
    store("PARTIAL");
    return result;
  };

  const execute = async (call: ToolCallRequest): Promise<MCPToolResult> => {
    steps += 1;
    const callId = `${handoffId}-${steps}`;
    emit({
      type: "tool",
      runId: handoffId,
      callId,
      tool: call.tool,
      target: pathOf(call) || String(call.arguments.command ?? "") || undefined,
    });
    const result = await run(call);
    const text = resultText(result);
    emit({
      type: "result",
      runId: handoffId,
      callId,
      ok: result.success,
      // by SHIELD's rules ("Not run: …") or by the user in Ask mode
      refused:
        !result.success &&
        (text.startsWith("Not run:") || text === USER_DENIED),
      text: text.slice(0, EVENT_TEXT_CHARS),
    });
    return result;
  };

  let reason: string | undefined;
  try {
    const size = (await deps.contextOf(sessionId)).size;
    reply = await chat(seed);

    await processMCPToolCalls(
      {
        id: `${handoffId}-0`,
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      },
      {
        onToolCallDetected: execute,
        addMessage: () => {},
        continueConversation: async (text) => {
          if (deps.isStopped?.()) {
            stoppedByUser = true;
            return reply;
          }
          const context = await deps.contextOf(sessionId);
          // The new result is not counted yet: ~3 characters per token
          const fraction = (context.used + text.length / 3) / context.size;
          lastPercent = Math.round(fraction * 100);
          emit({ type: "context", runId: handoffId, percent: lastPercent });
          let message = `${text}\n[Context: ${lastPercent}% used]`;
          if (!checkpointing && fraction >= checkpointAt) {
            checkpointing = true;
            emit({
              type: "checkpoint",
              runId: handoffId,
              percent: lastPercent,
            });
            message += checkpointNotice(checkpointAt);
          }
          reply = await chat(message);
          return reply;
        },
        maxToolRounds: spec.maxRounds,
        maxToolCallsPerTurn: 1,
        maxResultChars: Math.max(2000, Math.floor(size / 2)),
        workspaceFolder: deps.workspaceFolder,
        isStopped: () =>
          deps.isStopped?.() === true ||
          refusalsAfterCheckpoint >= MAX_REFUSALS_AFTER_CHECKPOINT,
      }
    );
    if (deps.isStopped?.()) stoppedByUser = true;

    // Still calling tools: the step limit, a checkpoint it ignored, or Stop
    const unfinished =
      extractToolCalls(reply, {
        enableOpenAIToolCalls: true,
        enableXmlToolCalls: true,
      }).length > 0;
    let finalText = reply;
    // No HANDOFF block means no report, whether the agent ran out of room
    // or just ended - on a malformed tool call, say. Ask once for it.
    const wroteHandoff = parseHandoff(reply).found;
    const needsReport = unfinished || !wroteHandoff;
    if (stoppedByUser) {
      reason = "the user stopped it";
    } else if (needsReport) {
      if (unfinished || checkpointing) {
        reason = checkpointing
          ? `its context reached ${Math.round(checkpointAt * 100)}%`
          : `it used all ${spec.maxRounds} steps it is allowed`;
      }
      // Without thought: a reviewer that had already answered thought for
      // 8,192 tokens on this request and never wrote it (2026-10-26)
      finalText = await chat(REPORT_REQUEST, { thinking: false });
      if (!finalText.trim()) {
        finalText = await chat(SHORT_REPORT_REQUEST, { thinking: false });
      }
    }

    const parsed = parseHandoff(finalText);
    const finished =
      !unfinished &&
      !stoppedByUser &&
      refusalsAfterCheckpoint < MAX_REFUSALS_AFTER_CHECKPOINT;
    // What the reader gets: the report, else what the agent said before it
    const summary =
      withoutToolCalls(stripHandoff(finalText)) ||
      (needsReport ? withoutToolCalls(stripHandoff(reply)) : "");

    let status: AgentStatus;
    if (!finished) {
      status = "PARTIAL";
    } else if (parsed.found) {
      // A hand-off without a status word after the checkpoint is not "done"
      status = parsed.status ?? (checkpointing ? "PARTIAL" : "DONE");
    } else if (summary) {
      status = "DONE";
      reason ??= "it wrote no HANDOFF block, so only its summary is known";
    } else {
      status = "PARTIAL";
      reason ??= "it ended without a report";
    }
    // A coder that misread a path and stopped was filed DONE with "files:
    // none changed", and the orchestrator took the change as made (2026-10-25)
    if (
      status === "DONE" &&
      role === "coder" &&
      isChangeRequest(input.task) &&
      work.commands.length === 0 &&
      ![work, input.continueFrom?.work].some((done) =>
        done?.files.some((file) => file.ok)
      )
    ) {
      status = "PARTIAL";
      reason = [
        reason,
        "it was asked for a change but changed no file. If the change was already in place, tell the user; otherwise give it what it lacked",
      ]
        .filter(Boolean)
        .join("; ");
    }
    if (status === "PARTIAL" && !reason && checkpointing) {
      reason = `its context reached ${Math.round(checkpointAt * 100)}%`;
    }
    if (status === "BLOCKED" && !reason) {
      reason = parsed.notes || parsed.next || undefined;
    }
    store(status, parsed, true);

    const report: AgentReport = {
      role,
      status,
      handoffId,
      summary,
      parsed,
      work,
      steps,
      contextPercent: lastPercent,
      reason,
    };
    emit(endEvent(report));
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store("PARTIAL");
    const report: AgentReport = {
      ...failed(input, handoffId, `the run broke: ${message}`),
      work,
      steps,
      contextPercent: lastPercent,
    };
    emit(endEvent(report));
    return report;
  } finally {
    await deps.closeSession(sessionId).catch(() => {});
  }
}
