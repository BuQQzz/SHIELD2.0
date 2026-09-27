import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  generateMCPToolPrompt,
  generatePlanModePrompt,
  generateNativeToolPrompt,
  usesNativeToolCalling,
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

describe("native Gemma tool prompts", () => {
  const write: ToolDefinition = {
    name: "edit_file",
    description: "Edit a file",
    serverName: "filesystem",
  };

  it("uses native functions without teaching XML or duplicating schemas", () => {
    const { prompt, includedModules } = buildSystemPrompt({
      ...baseConfig,
      modelFamily: "gemma",
      nativeTools: true,
      availableTools: [...tools, write],
      allowedPaths: ["C:\\work"],
    });

    expect(includedModules).toContain("native-tools");
    expect(includedModules).not.toContain("mcp-tools");
    expect(prompt).toContain("native function call");
    expect(prompt).not.toContain("<tool_call>");
    expect(prompt).not.toContain("Tool Call Format");
    expect(prompt).not.toContain("Parameters:");
    expect(prompt).toContain("Current Folder");
    expect(prompt).toContain("C:\\work");
    expect(prompt).toContain('"here"');
    expect(prompt).toContain("oldText");
    expect(prompt).toContain("newText");
    expect(prompt).toContain("Never invent a tool result");
    expect(prompt).toContain("untrusted data");
  });

  it("native Plan mode keeps reads available and never encourages a write call", () => {
    const { prompt, includedModules } = buildSystemPrompt({
      ...baseConfig,
      modelFamily: "gemma",
      nativeTools: true,
      planOnly: true,
      availableTools: [...tools, write],
    });

    expect(includedModules).toContain("plan-mode");
    expect(prompt).toContain("Only read functions are available");
    expect(prompt).toContain(
      "Investigate with the available read functions first"
    );
    expect(prompt).toContain("Nothing you plan has happened");
    expect(prompt).toContain("Do not attempt to call a function that writes");
    expect(prompt).not.toContain("edit_file");
    expect(prompt).not.toContain("<tool_call>");
  });

  it("retains the Plan guard when no read functions are available", () => {
    const { prompt } = buildSystemPrompt({
      ...baseConfig,
      nativeTools: true,
      planOnly: true,
      availableTools: [write],
    });

    expect(prompt).toContain("Plan Mode");
    expect(prompt).toContain("No read functions are currently available");
    expect(prompt).not.toContain("edit_file");
  });

  it("keeps the legacy Qwen call format and omits native instructions with no tools", () => {
    const legacy = buildSystemPrompt({ ...baseConfig, availableTools: tools });
    expect(legacy.prompt).toContain("<tool_call>");
    expect(legacy.includedModules).not.toContain("native-tools");
    expect(generateNativeToolPrompt([])).toBe("");
  });

  it.each([
    "Gemma-4-12B-it",
    "Gemma 4 12B Instruct",
    "google/gemma-4-12b-it",
    "gemma4",
  ])("enables native tools for %s", (name) =>
    expect(usesNativeToolCalling(name)).toBe(true)
  );

  it.each(["Gemma 3 12B", "gemma-40-it", "gemma-4b-it", "Qwen3-Coder", ""])(
    "does not enable native tools for %s",
    (name) => expect(usesNativeToolCalling(name)).toBe(false)
  );
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

describe("edit rule", () => {
  const editFile: ToolDefinition = {
    name: "edit_file",
    description: "Edit a file",
    serverName: "filesystem",
    parameters: [],
  };

  it("tells the model to edit rather than rewrite when edit_file exists", () => {
    const prompt = generateMCPToolPrompt([editFile]);
    expect(prompt).toContain("EDIT, DON'T REWRITE");
    expect(prompt).toContain('"oldText"');
  });

  it("says nothing about edits without edit_file", () => {
    expect(generateMCPToolPrompt(tools)).not.toContain("EDIT, DON'T REWRITE");
  });

  // Qwen3-Coder ended a finished web answer with list_allowed_directories
  it("tells the model a finished answer needs no tool call", () => {
    const prompt = generateMCPToolPrompt(tools);
    expect(prompt).toContain("5. **ANSWER, THEN STOP**");
    expect(generateMCPToolPrompt([editFile])).toContain(
      "6. **EDIT, DON'T REWRITE**"
    );
  });
});

describe("web search section", () => {
  const webSearch: ToolDefinition = {
    name: "web_search",
    description: "Search the web",
    serverName: "web",
    parameters: [],
  };

  it("is included when the web_search tool is offered", () => {
    const { prompt, includedModules } = buildSystemPrompt({
      ...baseConfig,
      availableTools: [...tools, webSearch],
    });
    expect(includedModules).toContain("web-search");
    expect(prompt).toContain("fetch_page");
  });

  it("is left out when web search is off (no web tools offered)", () => {
    const { prompt, includedModules } = buildSystemPrompt({
      ...baseConfig,
      availableTools: tools,
    });
    expect(includedModules).not.toContain("web-search");
    expect(prompt).not.toContain("## Web Search");
  });
});
