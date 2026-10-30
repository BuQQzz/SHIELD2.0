import { describe, expect, it } from "vitest";
import { hasDsml, normaliseDsml, withoutDsmlTags } from "./dsml";
import {
  cutOffToolCall,
  extractToolCalls,
  stripToolCallMarkup,
  streamingToolCallPreview,
  unreadableToolCall,
} from "./toolCallParsing";

/** The marker as the model wrote it: two fullwidth bars either side of DSML */
const B = "\uFF5C\uFF5C";
const open = (tag: string) => `<${B}DSML${B} ${tag}`;
const close = (tag: string) => `</${B}DSML${B} ${tag}>`;

/** Message 24 of the conversation that failed (deepseek-v4.1-flash-1017) */
const WRITE_FILE = `${open("calls>")}
${open('invoke name="write_file">')}
${open('parameter name="path" string="true">')}C:\\Users\\imend\\Desktop\\Projects\\Shield2.0Projects\\Website\\next.config.ts${close("parameter")}
${open('parameter name="content" string="true">')}import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
${close("parameter")}
${close("invoke")}
${close("calls")}`;

/** Message 14: a SHIELD call whose </tool> came out as a closing DSML tag */
const UPDATE_PLAN = `<tool_call>
<server>plan</server>
<tool>update_plan</${B}DSML${B} parameter>
<arguments>{"plan": [{"step": "Scaffold Next.js", "status": "in_progress"}, {"step": "Verify", "status": "pending"}]}</arguments>
</tool_call>`;

describe("DeepSeek's tool-call markup", () => {
  it("is recognised only when it is there", () => {
    expect(hasDsml("plain text with <tool_call>")).toBe(false);
    expect(hasDsml(WRITE_FILE)).toBe(true);
    expect(normaliseDsml("no markup")).toBe("no markup");
  });

  it("runs a whole call written in it: the path and the file, exactly", () => {
    const [call, ...others] = extractToolCalls(WRITE_FILE);
    expect(others).toEqual([]);
    expect(call).toMatchObject({
      serverName: "filesystem",
      tool: "write_file",
      format: "xml",
    });
    expect(call?.arguments.path).toBe(
      "C:\\Users\\imend\\Desktop\\Projects\\Shield2.0Projects\\Website\\next.config.ts"
    );
    expect(call?.arguments.content).toBe(
      'import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {\n  reactStrictMode: true,\n};\n\nexport default nextConfig;\n'
    );
  });

  it("reads several calls, and sends a tool to the server it lives on", () => {
    const calls = extractToolCalls(
      `${open("calls>")}
${open('invoke name="run_command">')}${open('parameter name="command" string="true">')}npm install${close("parameter")}${close("invoke")}
${open('invoke name="update_plan">')}${open('parameter name="plan" string="false">')}[{"step":"a","status":"pending"}]${close("parameter")}${close("invoke")}
${close("calls")}`
    );
    expect(calls.map((c) => [c.serverName, c.tool])).toEqual([
      ["terminal", "run_command"],
      ["plan", "update_plan"],
    ]);
    expect(calls[0]?.arguments).toEqual({ command: "npm install" });
    // string="false": the value is JSON, not text
    expect(calls[1]?.arguments.plan).toEqual([
      { step: "a", status: "pending" },
    ]);
  });

  it("takes a server given in the name", () => {
    const [call] = extractToolCalls(
      `${open('invoke name="agents.delegate">')}${open('parameter name="role">')}coder${close("parameter")}${close("invoke")}`
    );
    expect(call).toMatchObject({ serverName: "agents", tool: "delegate" });
  });

  it("reads the original single-bar markup too", () => {
    const [call] = extractToolCalls(
      `<\uFF5CDSML\uFF5Cfunction_calls><\uFF5CDSML\uFF5Cinvoke name="read_file"><\uFF5CDSML\uFF5Cparameter name="path" string="true">a.txt</\uFF5CDSML\uFF5Cparameter></\uFF5CDSML\uFF5Cinvoke></\uFF5CDSML\uFF5Cfunction_calls>`
    );
    expect(call).toMatchObject({
      tool: "read_file",
      arguments: { path: "a.txt" },
    });
  });

  it("mends a SHIELD call whose closing tag came out in DSML", () => {
    const [call] = extractToolCalls(UPDATE_PLAN);
    expect(call).toMatchObject({ serverName: "plan", tool: "update_plan" });
    expect(call?.arguments.plan).toHaveLength(2);
    // It was an "unreadable call" before; now there is nothing to complain of
    expect(unreadableToolCall(UPDATE_PLAN)).toBeNull();
  });

  it("does not show the markup to the user", () => {
    expect(stripToolCallMarkup(`Writing the config.\n${WRITE_FILE}`)).toBe(
      "Writing the config."
    );
    expect(stripToolCallMarkup(UPDATE_PLAN)).toBe("");
    // A call that never finished leaves no tag behind either
    expect(
      stripToolCallMarkup(`Hmm ${open("calls>")}${open("invoke na")}`)
    ).toBe("Hmm");
  });

  it("holds a call that is still being written out of the live text", () => {
    const partial = `Let me write it.\n${open("calls>")}\n${open('invoke name="write_file">')}\n${open('parameter name="path" string="true">')}C:\\site\\next.config.ts${close("parameter")}\n${open('parameter name="content" string="true">')}import typ`;
    expect(streamingToolCallPreview(partial)).toEqual({
      text: "Let me write it.",
      pendingTool: "write_file",
      pendingTarget: "C:\\site\\next.config.ts",
    });
    // And once finished it is an ordinary call, shown as a step
    expect(streamingToolCallPreview(WRITE_FILE).text).toBe("");
  });

  it("answers a call cut off in its arguments like any other", () => {
    const partial = `${open("calls>")}${open('invoke name="write_file">')}${open('parameter name="content" string="true">')}import typ`;
    expect(cutOffToolCall(partial)?.argumentsError).toMatch(/cut off/);
    expect(cutOffToolCall(WRITE_FILE)).toBeNull();
  });

  it("leaves a reply that only mentions the word alone", () => {
    expect(stripToolCallMarkup("DSML is DeepSeek's markup.")).toBe(
      "DSML is DeepSeek's markup."
    );
    expect(withoutDsmlTags("DSML is a word")).toBe("DSML is a word");
  });
});
