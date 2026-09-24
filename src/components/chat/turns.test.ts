import { describe, expect, it } from "vitest";
import {
  baseName,
  diffStat,
  groupIntoTurns,
  groupLabel,
  stepDetail,
  stepLabel,
  turnStats,
} from "./turns";
import type { Message } from "@/types/conversation";

let n = 0;
const msg = (
  role: "user" | "assistant",
  content: string,
  extra: Partial<Message> = {}
): Message => ({
  id: `m${n++}`,
  role,
  content,
  timestamp: new Date(),
  ...extra,
});

const tool = (name: string, target?: string, success = true): Message =>
  msg("user", "<tool_result><result>ok</result></tool_result>", {
    toolResult: { tool: name, serverName: "filesystem", success, target },
  });

describe("groupIntoTurns", () => {
  it("puts a reply's text and tool calls under one turn", () => {
    const messages = [
      msg("user", "build it"),
      msg("assistant", "Listing first"),
      tool("list_directory", "C:/p"),
      msg("assistant", "Creating folders"),
      tool("create_directory", "C:/p/src"),
      tool("create_directory", "C:/p/src/components"),
      msg("assistant", "Done"),
      msg("user", "thanks"),
    ];

    const turns = groupIntoTurns(messages);
    expect(turns.map((t) => t.kind)).toEqual(["user", "assistant", "user"]);

    const reply = turns[1]!;
    if (reply.kind !== "assistant") throw new Error("expected a reply");
    expect(reply.parts.map((p) => p.kind)).toEqual([
      "text",
      "tools",
      "text",
      "tools",
      "text",
    ]);
    // The two folder creations with no text between them form one group
    const group = reply.parts[3]!;
    expect(group.kind === "tools" && group.messages.length).toBe(2);
  });

  it("keeps a run of steps together across replies that were only a call", () => {
    const bareCall = `<tool_call>
<server>filesystem</server>
<tool>create_directory</tool>
<arguments>{"path":"b"}</arguments>
</tool_call>`;
    const turns = groupIntoTurns([
      msg("user", "go"),
      msg("assistant", "Making folders"),
      tool("create_directory", "a"),
      msg("assistant", bareCall),
      tool("create_directory", "b"),
    ]);
    const reply = turns[1]!;
    if (reply.kind !== "assistant") throw new Error("expected a reply");
    expect(reply.parts.map((p) => p.kind)).toEqual(["text", "tools"]);
    const group = reply.parts[1]!;
    expect(group.kind === "tools" && group.messages.length).toBe(2);
  });

  it("treats tool results as part of the reply, not user turns", () => {
    const turns = groupIntoTurns([msg("user", "hi"), tool("read_file")]);
    expect(turns.map((t) => t.kind)).toEqual(["user", "assistant"]);
  });
});

describe("labels", () => {
  it("names the step by what it did", () => {
    expect(
      stepLabel("write_file", "filesystem", "C:\\p\\index.html", "done")
    ).toBe("Wrote index.html");
    expect(stepLabel("edit_file", "filesystem", "styles.css", "running")).toBe(
      "Editing styles.css"
    );
    expect(stepLabel("fetch", "web", undefined, "done")).toBe("web.fetch");
  });

  it("summarises a group", () => {
    expect(
      groupLabel([tool("create_directory"), tool("create_directory")])
    ).toBe("Created 2 folders");
    expect(groupLabel([tool("read_file"), tool("write_file")])).toBe(
      "Used 2 tools"
    );
  });

  it("takes the last path segment", () => {
    expect(baseName("C:\\Users\\me\\Searcher\\")).toBe("Searcher");
    expect(baseName("src/app.js")).toBe("app.js");
  });
});

describe("step details", () => {
  it("counts diff lines for an edit", () => {
    const diff =
      "--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-old line\n+new line\n+another\n same";
    expect(diffStat(diff)).toBe("+2 −1");
    expect(stepDetail("edit_file", diff, true)).toBe("+2 −1");
  });

  it("drops the redundant 'Successfully wrote' line", () => {
    expect(
      stepDetail("write_file", "Successfully wrote to C:\\a.txt", true)
    ).toBe("");
  });

  it("shows the first line of a failure", () => {
    expect(
      stepDetail("edit_file", "Input validation error\nmore detail", false)
    ).toBe("Input validation error");
  });
});

describe("turnStats", () => {
  it("sums every generation in the reply", () => {
    const stats = turnStats([
      msg("assistant", "a", {
        stats: { outputTokens: 100, tokensPerSecond: 50, durationMs: 2000 },
      }),
      tool("read_file"),
      msg("assistant", "b", {
        stats: { outputTokens: 300, tokensPerSecond: 50, durationMs: 6000 },
      }),
    ]);
    expect(stats).toEqual({
      outputTokens: 400,
      durationMs: 8000,
      tokensPerSecond: 50,
    });
  });
});
