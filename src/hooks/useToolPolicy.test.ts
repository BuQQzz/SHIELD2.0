import { describe, expect, it } from "vitest";
import { resolveToolPolicy } from "./useToolPolicy";
import type { ToolDefinition } from "@/types/prompts";

const tool = (name: string): ToolDefinition => ({
  name,
  description: name,
  serverName: "filesystem",
  parameters: [],
});

const SERVER_TOOLS = [
  tool("read_file"),
  tool("list_directory"),
  tool("search_files"),
  tool("write_file"),
  tool("edit_file"),
];

const ALL_ALLOWED = SERVER_TOOLS.map((t) => t.name);

const names = (tools: ToolDefinition[]) => tools.map((t) => t.name);

const policyFor = (mode: "ask" | "auto" | "plan" | "readonly") =>
  resolveToolPolicy({
    mode,
    allowedTools: ALL_ALLOWED,
    serverTools: SERVER_TOOLS,
  });

describe("the allowlist applies in every mode", () => {
  it.each(["ask", "auto", "plan", "readonly"] as const)(
    "%s never advertises a tool the user disabled",
    (mode) => {
      const policy = resolveToolPolicy({
        mode,
        allowedTools: ["read_file"],
        serverTools: SERVER_TOOLS,
      });

      expect(names(policy.advertisedTools)).toEqual(["read_file"]);
    }
  );

  it("a mode cannot widen the allowlist", () => {
    const policy = resolveToolPolicy({
      mode: "auto",
      allowedTools: [],
      serverTools: SERVER_TOOLS,
    });

    expect(policy.advertisedTools).toEqual([]);
  });
});

describe("ask mode", () => {
  const policy = policyFor("ask");

  it("asks before every call", () => {
    expect(policy.decide(tool("read_file"))).toBe("ask");
    expect(policy.decide(tool("write_file"))).toBe("ask");
  });

  it("advertises everything allowed", () => {
    expect(names(policy.advertisedTools)).toEqual(ALL_ALLOWED);
  });
});

describe("auto mode", () => {
  const policy = policyFor("auto");

  it("runs reads without prompting", () => {
    expect(policy.decide(tool("read_file"))).toBe("run");
    expect(policy.decide(tool("list_directory"))).toBe("run");
    expect(policy.decide(tool("search_files"))).toBe("run");
  });

  it("asks before anything that can change a file", () => {
    expect(policy.decide(tool("write_file"))).toBe("ask");
    expect(policy.decide(tool("edit_file"))).toBe("ask");
  });

  it("asks for a tool it does not recognise", () => {
    expect(policy.decide({ name: "send_email" })).toBe("ask");
  });
});

describe("plan mode", () => {
  const policy = policyFor("plan");

  it("runs reads, so the plan is based on the real files", () => {
    // A planner that cannot read can only guess at what it is changing
    expect(policy.decide(tool("read_file"))).toBe("run");
    expect(policy.decide(tool("list_directory"))).toBe("run");
    expect(policy.decide(tool("search_files"))).toBe("run");
  });

  it("records changes instead of making them", () => {
    expect(policy.decide(tool("write_file"))).toBe("block");
    expect(policy.decide(tool("edit_file"))).toBe("block");
  });

  it("blocks an unrecognised tool rather than running it", () => {
    expect(policy.decide({ name: "send_email" })).toBe("block");
  });

  it("still advertises mutating tools, so a plan can reference them", () => {
    expect(names(policy.advertisedTools)).toContain("write_file");
  });

  it("reports that it is planning", () => {
    expect(policy.isPlanning).toBe(true);
    expect(policyFor("auto").isPlanning).toBe(false);
  });
});

describe("readonly mode", () => {
  const policy = policyFor("readonly");

  it("never tells the model that mutating tools exist", () => {
    expect(names(policy.advertisedTools)).toEqual([
      "read_file",
      "list_directory",
      "search_files",
    ]);
  });

  it("runs reads without prompting", () => {
    expect(policy.decide(tool("read_file"))).toBe("run");
  });

  it("blocks a mutating tool if the model calls one anyway", () => {
    expect(policy.decide(tool("write_file"))).toBe("block");
  });

  it("is not planning", () => {
    expect(policy.isPlanning).toBe(false);
  });
});

describe("server annotations", () => {
  it("lets a server mark an unfamiliar tool safe to run", () => {
    const fetchPage: ToolDefinition = {
      name: "fetch_page",
      description: "fetch",
      serverName: "web",
      annotations: { readOnlyHint: true },
    };

    const policy = resolveToolPolicy({
      mode: "auto",
      allowedTools: ["fetch_page"],
      serverTools: [fetchPage],
    });

    expect(policy.decide(fetchPage)).toBe("run");
  });

  it("hides an annotated mutating tool in readonly mode", () => {
    const postMessage: ToolDefinition = {
      name: "post_message",
      description: "post",
      serverName: "chat",
      annotations: { readOnlyHint: false },
    };

    const policy = resolveToolPolicy({
      mode: "readonly",
      allowedTools: ["post_message"],
      serverTools: [postMessage],
    });

    expect(policy.advertisedTools).toEqual([]);
  });
});
