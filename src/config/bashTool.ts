/**
 * bash: the terminal as hosted models know it
 *
 * Claude Code and opencode both give their models a tool named bash, with
 * a command, a short description, a timeout in milliseconds and
 * run_in_background, and hosted models are trained on that shape. They get
 * it here (the user's call, 2026-11-24); local models keep run_command,
 * which Bonsai 2 was tuned with.
 *
 * Only the name and arguments differ. The parser turns a bash call into
 * run_command (toolCallParsing.ts extractToolCalls), so permissions, the
 * persistent shell, Tasks running, the history and the work record all
 * handle it as one; only the model's own text says bash.
 */

import type { ToolDefinition } from "../types/prompts";
import type { ToolCallRequest } from "../handlers/toolCallParsing";
import { RUN_COMMAND_TOOL_NAME } from "./commandSafety";

export const BASH_TOOL_NAME = "bash";

/** run_command's definition from the terminal server, as bash */
export function bashToolFrom(runCommand: ToolDefinition): ToolDefinition {
  const description = (runCommand.description ?? "")
    .replace(
      "set background: true instead",
      "set run_in_background: true instead"
    )
    .replace("showing them your reason", "showing them your description")
    .replace("pass a larger timeout_seconds", "pass a larger timeout");
  return {
    ...runCommand,
    name: BASH_TOOL_NAME,
    description,
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
        description: {
          type: "string",
          description:
            "Clear, concise description of what this command does in 5-10 words, shown to the user",
        },
        timeout: {
          type: "number",
          description:
            "Optional timeout in milliseconds (default 120000, at most 600000)",
        },
        run_in_background: {
          type: "boolean",
          description:
            "Set to true to keep the command running, such as a server, and return at once with a job number. Read its output with command_output and stop it with stop_command.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  };
}

/** A timeout as bash takes it (milliseconds) in run_command's seconds */
function timeoutSeconds(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // A model that sends seconds anyway: 600 ms is no timeout anyone means
  return n <= 600 ? n : Math.ceil(n / 1000);
}

/**
 * A call to "terminal", the shell's server name, with bash's command:
 * DeepSeek V4.1 Flash wrote two of these in one run (2026-11-26) and got
 * "no tool called 'terminal'". It means bash, so it runs as bash.
 */
function isTerminalAsBash(call: ToolCallRequest): boolean {
  return (
    call.tool === "terminal" && typeof call.arguments?.command === "string"
  );
}

/** A bash call as the run_command SHIELD runs; any other call as it is */
export function fromBashCall(call: ToolCallRequest): ToolCallRequest {
  if (call.tool !== BASH_TOOL_NAME && !isTerminalAsBash(call)) return call;
  const args = call.arguments ?? {};
  const command = typeof args.command === "string" ? args.command : "";
  const description =
    typeof args.description === "string" && args.description.trim()
      ? args.description.trim()
      : "";
  const timeout = timeoutSeconds(args.timeout);
  return {
    ...call,
    serverName: "terminal",
    tool: RUN_COMMAND_TOOL_NAME,
    arguments: {
      command,
      // The user sees the command itself when one asks (a delete)
      reason: description || `Runs ${command.slice(0, 120)}`,
      ...(timeout !== undefined ? { timeout_seconds: timeout } : {}),
      ...(args.run_in_background === true ? { background: true } : {}),
    },
  };
}
