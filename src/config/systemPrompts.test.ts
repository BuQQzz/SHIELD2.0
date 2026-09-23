import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  generateMCPToolPrompt,
  generatePlanModePrompt,
} from "./systemPrompts";
import type { SystemPromptConfig, ToolDefinition } from "../types/prompts";

const baseConfig: SystemPromptConfig = {
  modelFamily: "qwen",
  capabilities: [],
  mcpEnabled: true,
};

const tools: ToolDefinition[] = [
  {
    name: "search_files",
    description: "Recursively search for files matching a pattern",
    serverName: "filesystem",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "Root to search",
        required: true,
      },
      {
        name: "pattern",
        type: "string",
        description: "Glob pattern",
        required: true,
      },
    ],
  },
  {
    name: "fetch",
    description: "Fetch a URL",
    serverName: "web",
    parameters: [
      {
        name: "url",
        type: "string",
        description: "URL to fetch",
        required: true,
      },
    ],
  },
];

describe("buildSystemPrompt tool section", () => {
  it("omits the tool section when no tools are available", () => {
    const { prompt, includedModules } = buildSystemPrompt({
      ...baseConfig,
      availableTools: [],
    });

    expect(includedModules).not.toContain("mcp-tools");
    expect(prompt).not.toContain("Available Tools");
    expect(prompt).not.toContain("<tool_call>");
  });

  it("describes the tools that are actually available", () => {
    const { prompt, includedModules } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
    });

    expect(includedModules).toContain("mcp-tools");
    expect(prompt).toContain("search_files");
    expect(prompt).toContain("Recursively search for files matching a pattern");
    expect(prompt).toContain("fetch");
  });

  it("does not invent tools that no server exposes", () => {
    const { prompt } = buildSystemPrompt({
      ...baseConfig,
      availableTools: [tools[0]!],
    });

    // write_file / list_directory used to be injected from a hardcoded list
    expect(prompt).not.toContain("write_file");
    expect(prompt).not.toContain("list_directory");
  });

  it("includes the tool call section exactly once", () => {
    const { prompt } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
    });

    const occurrences = prompt.split("## 🔧 Available Tools").length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("generateMCPToolPrompt", () => {
  it("returns nothing when there are no tools", () => {
    expect(generateMCPToolPrompt([])).toBe("");
  });

  it("groups tools under the server that exposes them", () => {
    const prompt = generateMCPToolPrompt(tools);
    expect(prompt).toContain("### Server: `filesystem`");
    expect(prompt).toContain("### Server: `web`");
  });

  it("builds the worked example from a real tool", () => {
    const prompt = generateMCPToolPrompt([tools[1]!]);
    expect(prompt).toContain("<server>web</server>");
    expect(prompt).toContain("<tool>fetch</tool>");
    // and never falls back to a filesystem example that server cannot serve
    expect(prompt).not.toContain("<server>filesystem</server>");
  });

  it("marks required parameters", () => {
    const prompt = generateMCPToolPrompt(tools);
    expect(prompt).toContain("pattern (string, required)");
  });

  // Agent benchmark, 2026-09-22: the model copied an "Observation:" line from
  // the example and invented the tool's result before anything ran.
  it("never shows a result template the model could fill in itself", () => {
    const prompt = buildSystemPrompt({
      ...baseConfig,
      mcpEnabled: true,
      availableTools: tools,
    }).prompt;
    expect(prompt).not.toMatch(/Observation:/);
    expect(prompt).not.toMatch(/^Thought:/m);
    expect(prompt).toContain("Stop after </tool_call>");
  });

  it("teaches a single call format", () => {
    const prompt = generateMCPToolPrompt(tools);
    expect(prompt).toContain("<tool_call>");
    expect(prompt).not.toContain('"tool_calls"');
  });
});

describe("accessible directories", () => {
  it("lists the directories the servers may touch", () => {
    const prompt = generateMCPToolPrompt(tools, [
      "C:\\Users\\me\\Desktop",
      "C:\\Users\\me\\Documents",
    ]);

    expect(prompt).toContain("Accessible Directories");
    expect(prompt).toContain("C:\\Users\\me\\Desktop");
    expect(prompt).toContain("C:\\Users\\me\\Documents");
  });

  it("omits the section when no roots are known", () => {
    expect(generateMCPToolPrompt(tools)).not.toContain(
      "Accessible Directories"
    );
  });

  it("is threaded through buildSystemPrompt", () => {
    const { prompt } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
      allowedPaths: ["C:\\Users\\me\\Desktop", "C:\\Users\\me\\Documents"],
    });

    expect(prompt).toContain("Accessible Directories");
    expect(prompt).toContain("C:\\Users\\me\\Desktop");
  });

  // A single folder is a workspace the user picked. Without saying so,
  // "what's in this folder?" was answered by guessing Documents.
  it("presents a single folder as the user's current folder", () => {
    const prompt = generateMCPToolPrompt(tools, [
      "C:\\Users\\me\\Projects\\app",
    ]);

    expect(prompt).toContain("## Current Folder");
    expect(prompt).toContain("C:\\Users\\me\\Projects\\app");
    expect(prompt).toContain('"this folder"');
    expect(prompt).not.toContain("Accessible Directories");
  });
});

describe("plan mode prompt", () => {
  it("shows the call syntax, because reads still have to run", () => {
    const { prompt, includedModules } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
      planOnly: true,
    });

    expect(includedModules).toContain("plan-mode");
    // Earlier this asserted the opposite. Withholding the syntax meant the
    // model invented its own, nothing ran, and it looped retrying.
    expect(prompt).toContain("<tool_call>");
  });

  it("replaces the tool calling instructions rather than adding to them", () => {
    const { includedModules } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
      planOnly: true,
    });

    expect(includedModules).not.toContain("tool-calling");
    expect(includedModules).not.toContain("mcp-tools");
  });

  it("still names the tools so the plan can reference real ones", () => {
    const { prompt } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
      planOnly: true,
    });

    expect(prompt).toContain("search_files");
    expect(prompt).toContain("fetch");
  });

  it("tells the model reads still work", () => {
    // A planner that cannot read the files can only guess at the change
    const { prompt } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
      planOnly: true,
    });

    expect(prompt).toContain("Plan Mode");
    expect(prompt).toMatch(/Tools you CAN use right now/i);
    expect(prompt).toMatch(/do not ask the user to paste file contents/i);
  });

  it("separates the tools that run from the ones that only get recorded", () => {
    const withWrite = [
      ...tools,
      {
        name: "write_file",
        description: "Write a file",
        serverName: "filesystem",
        parameters: [],
      },
    ];

    const prompt = generatePlanModePrompt(withWrite);

    expect(prompt).toMatch(/Tools you CAN use right now/);
    expect(prompt).toMatch(/Tools that will NOT run/);

    const runnable = prompt.slice(
      prompt.indexOf("Tools you CAN use"),
      prompt.indexOf("Tools that will NOT run")
    );
    expect(runnable).toContain("search_files");
    expect(runnable).not.toContain("write_file");
  });

  it("omits the not-run section when only reads are available", () => {
    // `fetch` is not in the known read list, so it classifies as mutating
    const readsOnly = tools.filter((t) => t.name === "search_files");
    expect(generatePlanModePrompt(readsOnly)).not.toMatch(
      /Tools that will NOT run/
    );
  });

  it("treats an unknown tool as one that will not run", () => {
    // Same fail-closed rule as the policy layer
    const prompt = generatePlanModePrompt(tools);
    const notRun = prompt.slice(prompt.indexOf("Tools that will NOT run"));
    expect(notRun).toContain("fetch");
  });

  it("tells the model to offer saving the plan or switching to Auto", () => {
    const prompt = generatePlanModePrompt(tools);

    // The prompt wraps, so allow any whitespace between words
    expect(prompt).toMatch(/save this plan to a\s+file/i);
    expect(prompt).toMatch(/switch to Auto mode/i);
  });

  it("tells the model how to actually call a read tool", () => {
    // Without the format the model invents one, e.g. read_file("path"), and
    // nothing runs - it then loops trying again
    const prompt = generatePlanModePrompt(tools);

    expect(prompt).toContain("<tool_call>");
    expect(prompt).toContain("<arguments>");
    expect(prompt).toMatch(/code block will NOT run/i);
  });

  it("warns against repeating a call it already made", () => {
    expect(generatePlanModePrompt(tools)).toMatch(
      /Do not repeat a call you\s+have already made/i
    );
  });

  it("forbids claiming a change was made", () => {
    const prompt = generatePlanModePrompt(tools);
    expect(prompt).toMatch(/Nothing you plan has happened/i);
  });

  it("carries the accessible directories through", () => {
    const { prompt } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
      planOnly: true,
      allowedPaths: ["C:\\Users\\me\\Desktop"],
    });

    expect(prompt).toContain("C:\\Users\\me\\Desktop");
  });

  it("emits nothing when there are no tools", () => {
    expect(generatePlanModePrompt([])).toBe("");
  });

  it("normal mode is unaffected", () => {
    const { prompt, includedModules } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
    });

    expect(includedModules).toContain("mcp-tools");
    expect(includedModules).not.toContain("plan-mode");
    expect(prompt).toContain("<tool_call>");
  });
});
