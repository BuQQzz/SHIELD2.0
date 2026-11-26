import { describe, expect, it } from "vitest";
import { fromBashCall } from "./bashTool";
import { extractToolCalls } from "../handlers/toolCallParsing";

describe("fromBashCall", () => {
  it("turns a bash call into the run_command SHIELD runs", () => {
    expect(
      fromBashCall({
        serverName: "filesystem",
        tool: "bash",
        arguments: {
          command: "python3 -m unittest",
          description: "Run the tests",
          timeout: 300000,
          run_in_background: false,
        },
      })
    ).toEqual({
      serverName: "terminal",
      tool: "run_command",
      arguments: {
        command: "python3 -m unittest",
        reason: "Run the tests",
        timeout_seconds: 300,
      },
    });
  });

  it("keeps background, takes a small timeout as seconds, and names the command when undescribed", () => {
    const call = fromBashCall({
      serverName: "terminal",
      tool: "bash",
      arguments: {
        command: "python3 server.py",
        timeout: 90,
        run_in_background: true,
      },
    });
    expect(call.arguments).toEqual({
      command: "python3 server.py",
      reason: "Runs python3 server.py",
      timeout_seconds: 90,
      background: true,
    });
  });

  it("leaves other calls alone", () => {
    const call = {
      serverName: "filesystem",
      tool: "read_text_file",
      arguments: { path: "a" },
    };
    expect(fromBashCall(call)).toBe(call);
  });

  it("runs a call to the terminal server's own name as bash", () => {
    const [call] = extractToolCalls(
      '<tool_call>\n<server>filesystem</server>\n<tool>terminal</tool>\n<arguments>{"command":"ls","description":"List files"}</arguments>\n</tool_call>'
    );
    expect(call).toMatchObject({
      serverName: "terminal",
      tool: "run_command",
      arguments: { command: "ls", reason: "List files" },
    });
    // Without a command it is not a shell call, and stays unknown
    const odd = { serverName: "x", tool: "terminal", arguments: {} };
    expect(fromBashCall(odd)).toBe(odd);
  });

  it("is applied by the parser, so the rest of SHIELD sees run_command", () => {
    const [call] = extractToolCalls(
      '<tool_call>\n<server>terminal</server>\n<tool>bash</tool>\n<arguments>{"command":"ls","description":"List files"}</arguments>\n</tool_call>'
    );
    expect(call?.tool).toBe("run_command");
    expect(call?.arguments).toEqual({ command: "ls", reason: "List files" });
  });
});
