/**
 * System Prompts Configuration
 *
 * Model-specific and capability-based system prompts for SHIELD 2.0
 * Based on modern prompting techniques: ReAct, Chain-of-Thought, Function Calling
 */

import type {
  SystemPromptConfig,
  ModelFamily,
  PromptCapability,
  BuiltPrompt,
  ToolDefinition,
} from "../types/prompts";
import { isMutatingTool } from "./toolClassification";

// =============================================================================
// BASE PROMPTS - Core identity and behavior
// =============================================================================

/**
 * Core SHIELD identity prompt - used by all models
 */
export const BASE_PROMPT = `You are SHIELD, a helpful, privacy-focused AI assistant running locally on the user's Windows PC.

IMPORTANT: Your name is SHIELD. When asked your name, respond with "SHIELD".

Core Principles:
- Follow user instructions EXACTLY as given
- Be helpful, accurate, and concise
- Acknowledge uncertainty - say "I don't know" when unsure
- Prioritize user privacy - all processing happens locally
- Be truthful - never fabricate information
- If asked to respond in a specific format, follow it precisely`;

/**
 * Minimal prompt for models with small context windows
 */
export const MINIMAL_PROMPT = `You are SHIELD, a helpful local AI assistant. Be concise, accurate, and acknowledge uncertainty.`;

// =============================================================================
// MODEL FAMILY PROMPTS - Optimizations for specific model families
// =============================================================================

/**
 * Model-family specific prompt additions
 * These are appended to the base prompt for better model-specific behavior
 */
export const MODEL_FAMILY_PROMPTS: Record<ModelFamily, string> = {
  llama: `
Response Style:
- Think step-by-step for complex questions
- Use clear, structured responses
- Be direct and avoid unnecessary filler`,

  qwen: `
Response Style:
- Follow instructions precisely
- Structure responses clearly with headers when helpful
- Support multilingual queries naturally`,

  mistral: `
Response Style:
- Provide well-reasoned, structured responses
- Use logical flow in explanations
- Be precise with technical details`,

  phi: `
Response Style:
- Keep responses focused and efficient
- Prioritize clarity over verbosity
- Use compact explanations`,

  gemma: `
Response Style:
- Provide balanced, informative responses
- Use natural conversational tone
- Structure complex answers clearly`,

  deepseek: `
Response Style:
- CRITICAL: Follow ALL user instructions exactly, including format constraints
- Your name is SHIELD - always identify as SHIELD when asked
- Excel at code-related tasks
- Provide detailed technical explanations
- Use code examples when helpful
- If user says "one word only" or similar, respond with exactly one word`,

  generic: `
Response Style:
- CRITICAL: Follow ALL user instructions exactly
- Your name is SHIELD - always identify as SHIELD when asked
- Be helpful and clear
- Structure responses logically
- Adapt to the user's needs
- If given format constraints (e.g., "one word only"), follow them precisely`,
};

// =============================================================================
// CAPABILITY PROMPTS - Added based on enabled features
// =============================================================================

/**
 * Web search capability prompt
 */
export const WEB_SEARCH_PROMPT = `
## Web Search Results
When web search results are provided:
- Use ONLY the information from search results for current events/facts
- Search results are LIVE data and override your training knowledge
- Cite sources when referencing specific information
- If results are insufficient, acknowledge the limitation
- Never fabricate information not in the results`;

/**
 * Tool calling capability prompt (ReAct format)
 */
export const TOOL_CALLING_PROMPT = `
## Tool Usage (ReAct Format)
You have access to tools. When you need to use a tool:

1. **Thought**: Explain what you need to do and why
2. **Action**: Call the tool with proper formatting
3. **Observation**: Process the result
4. **Repeat** if needed, then provide final answer

Important:
- ALWAYS use tools when the user asks you to perform actions
- Don't just explain how - actually DO it using the tools
- Format tool calls exactly as specified (XML preferred, OpenAI-style JSON also supported)`;

/**
 * Code generation capability prompt
 */
export const CODE_GENERATION_PROMPT = `
## Code Generation
When writing code:
- Use modern, idiomatic patterns
- Include brief comments for complex logic
- Consider error handling
- Prefer readability over cleverness`;

/**
 * Complex reasoning capability prompt (Chain-of-Thought)
 */
export const REASONING_PROMPT = `
## Complex Reasoning
For complex questions:
- Break down the problem into steps
- Show your reasoning process
- Consider multiple perspectives
- Verify your logic before concluding`;

/**
 * Structured output capability prompt
 */
export const STRUCTURED_OUTPUT_PROMPT = `
## Structured Output
When asked for structured data (JSON, lists, tables):
- Follow the exact format requested
- Ensure valid syntax
- Include all required fields`;

// =============================================================================
// MCP TOOL PROMPTS - File system and tool calling
// =============================================================================

/**
 * Generate MCP tool prompt with ReAct examples
 */
export function generateMCPToolPrompt(
  tools: ToolDefinition[],
  allowedPaths: string[] = []
): string {
  if (tools.length === 0) return "";

  // Group by the server that actually exposes each tool, so the model sees
  // the real server names it has to put in <server>...</server>.
  const byServer = new Map<string, ToolDefinition[]>();
  for (const tool of tools) {
    const server = tool.serverName ?? "filesystem";
    const existing = byServer.get(server);
    if (existing) {
      existing.push(tool);
    } else {
      byServer.set(server, [tool]);
    }
  }

  const describeTool = (tool: ToolDefinition): string => {
    const params = tool.parameters
      ?.map(
        (p) =>
          `  - ${p.name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`
      )
      .join("\n");
    return `**${tool.name}**: ${tool.description}${params ? `\nParameters:\n${params}` : ""}`;
  };

  const toolDescriptions = Array.from(byServer.entries())
    .map(([server, serverTools]) => {
      const heading = `### Server: \`${server}\``;
      return `${heading}\n\n${serverTools.map(describeTool).join("\n\n")}`;
    })
    .join("\n\n");

  // Build the worked example from a tool that actually exists, rather than
  // hardcoding one that may not be exposed by the connected servers.
  const exampleTool =
    tools.find((t) => t.name === "write_file") ??
    tools.find((t) => (t.parameters?.length ?? 0) > 0) ??
    tools[0]!;
  const exampleServer = exampleTool.serverName ?? "filesystem";
  const exampleArgs = JSON.stringify(
    Object.fromEntries(
      (exampleTool.parameters ?? [])
        .filter((p) => p.required)
        .map((p) => [p.name, p.example ?? `<${p.type}>`])
    )
  );

  const accessSection =
    allowedPaths.length > 0
      ? `
## Accessible Directories
You can ONLY access these directories and their subfolders:
${allowedPaths.map((p) => `- ${p}`).join("\n")}

Always use a full path beginning with one of these. Never guess a path such as "/" or "C:\\".
`
      : "";

  return `
## 🔧 Available Tools

${toolDescriptions}
${accessSection}

## Tool Call Format
Use this exact XML format to call tools:

<tool_call>
<server>${exampleServer}</server>
<tool>tool_name</tool>
<arguments>{"param": "value"}</arguments>
</tool_call>

Alternative (native function-calling models):

\`\`\`json
{
  "tool_calls": [
    {
      "type": "function",
      "function": {
        "name": "${exampleServer}.tool_name",
        "arguments": { "param": "value" }
      }
    }
  ]
}
\`\`\`

## Example

Thought: I need to use ${exampleTool.name} to complete this request.

<tool_call>
<server>${exampleServer}</server>
<tool>${exampleTool.name}</tool>
<arguments>${exampleArgs}</arguments>
</tool_call>

Observation: <the tool result appears here>

Then summarise the result for the user in plain language.

## CRITICAL RULES
1. **ALWAYS USE TOOLS** - When asked to perform an action, USE the tools
2. **NEVER JUST EXPLAIN** - Don't tell users how to do it manually
3. **ONLY USE LISTED TOOLS** - Never invent a tool that is not listed above
4. **USE FULL PATHS** - Windows paths like C:\\Users\\...`;
}

/**
 * Plan mode prompt.
 *
 * Replaces the tool-calling instructions entirely rather than appending to
 * them. If the model is still shown tool call syntax it will use it, and the
 * permission layer then has to refuse every call - which reads to the user as
 * the app being broken rather than as a deliberate mode.
 */
export function generatePlanModePrompt(
  tools: ToolDefinition[],
  allowedPaths: string[] = []
): string {
  if (tools.length === 0) return "";

  const readTools = tools.filter((tool) => !isMutatingTool(tool));
  const writeTools = tools.filter((tool) => isMutatingTool(tool));

  const list = (items: ToolDefinition[]) =>
    items
      .map(
        (tool) =>
          `- **${tool.name}** (${tool.serverName ?? "filesystem"}): ${tool.description}`
      )
      .join("\n");

  const accessSection =
    allowedPaths.length > 0
      ? `\nYou can only reach these directories:\n${allowedPaths.map((p) => `- ${p}`).join("\n")}\n`
      : "";

  const writeSection =
    writeTools.length > 0
      ? `
### Tools that will NOT run
Calling one of these records it as a step in the plan instead of doing it:
${list(writeTools)}
`
      : "";

  return `
## Plan Mode

You are planning a change, not making one. Investigate first, then lay out what
you intend to do and let the user decide whether to go ahead.

### Tools you CAN use right now
These run normally. Use them to ground the plan in what is actually there -
do not ask the user to paste file contents you could read yourself.
${list(readTools)}
${writeSection}${accessSection}
### How to call a read tool
Reads use the same format as normal. Emit it exactly like this - a function
call written in prose or a code block will NOT run:

<tool_call>
<server>${readTools[0]?.serverName ?? "filesystem"}</server>
<tool>${readTools[0]?.name ?? "read_file"}</tool>
<arguments>{"path": "C:\\\\Users\\\\Name\\\\Desktop\\\\file.txt"}</arguments>
</tool_call>

Make one call, wait for the result, then continue. Do not repeat a call you
have already made - if you already have the contents, use them.

### How to work
1. Read whatever you need first: list the directory, open the relevant files.
   A plan written without looking at the files is guesswork.
2. State what the user is asking for, in one sentence.
3. List the steps you would take, in order. For each one name the tool and the
   exact arguments, and quote the specific content you would write.
4. Flag anything risky, ambiguous or that you are unsure about.
5. Finish by offering the user their options, in these words or close to them:
   "Tell me to adjust anything. When you are happy, I can save this plan to a
   file, or you can switch to Auto mode and I will carry it out."

### Rules
- Do NOT say a file has been created or changed. Nothing you plan has happened.
- Earlier messages may show tools being called and completing. Reads still
  work; changes do not.
- Be concrete. "Write the corrected sentence to fixed.txt" is a plan;
  "modify the file" is not.
- Never write a tool call as prose or inside a code block. Either emit the
  XML form above so it actually runs, or describe the step in plain English.`;
}

// =============================================================================
// PROMPT BUILDER - Assembles the final system prompt
// =============================================================================

/**
 * Build a complete system prompt based on configuration
 */
export function buildSystemPrompt(config: SystemPromptConfig): BuiltPrompt {
  const includedModules: string[] = [];
  const parts: string[] = [];

  // If user has a custom prompt, use it as the base (but still add capability prompts)
  if (config.customPrompt && config.customPrompt.trim()) {
    parts.push(config.customPrompt);
    includedModules.push("custom");
  } else {
    // Use minimal prompt for phi (small context) or full base prompt
    if (config.modelFamily === "phi") {
      parts.push(MINIMAL_PROMPT);
      includedModules.push("minimal-base");
    } else {
      parts.push(BASE_PROMPT);
      includedModules.push("base");

      // Add model-family specific prompt
      const familyPrompt = MODEL_FAMILY_PROMPTS[config.modelFamily];
      if (familyPrompt) {
        parts.push(familyPrompt);
        includedModules.push(`family-${config.modelFamily}`);
      }
    }
  }

  // Add capability-based prompts
  if (config.capabilities.includes("complexReasoning")) {
    parts.push(REASONING_PROMPT);
    includedModules.push("reasoning");
  }

  if (config.capabilities.includes("codeGeneration")) {
    parts.push(CODE_GENERATION_PROMPT);
    includedModules.push("code-generation");
  }

  if (config.capabilities.includes("structuredOutput")) {
    parts.push(STRUCTURED_OUTPUT_PROMPT);
    includedModules.push("structured-output");
  }

  // Add web search prompt if enabled
  if (config.webSearchEnabled) {
    parts.push(WEB_SEARCH_PROMPT);
    includedModules.push("web-search");
  }

  // Add MCP tool prompt if enabled.
  // Only describe tools the connected servers actually expose - never a
  // hardcoded guess, or the model is told about tools that do not exist.
  const tools = config.availableTools ?? [];
  if (config.mcpEnabled && tools.length > 0) {
    if (config.planOnly) {
      // Plan mode replaces the tool instructions rather than adding to them
      parts.push(generatePlanModePrompt(tools, config.allowedPaths));
      includedModules.push("plan-mode");
    } else {
      parts.push(TOOL_CALLING_PROMPT);
      parts.push(generateMCPToolPrompt(tools, config.allowedPaths));
      includedModules.push("tool-calling");
      includedModules.push("mcp-tools");
    }
  }

  const prompt = parts.join("\n");

  // Rough token estimate (1 token ≈ 4 chars for English)
  const estimatedTokens = Math.ceil(prompt.length / 4);

  return {
    prompt,
    includedModules,
    estimatedTokens,
  };
}

/**
 * Detect model family from model name/ID
 */
export function detectModelFamily(modelName: string): ModelFamily {
  const name = modelName.toLowerCase();

  if (name.includes("llama")) return "llama";
  if (name.includes("qwen")) return "qwen";
  if (name.includes("mistral") || name.includes("mixtral")) return "mistral";
  if (name.includes("phi")) return "phi";
  if (name.includes("gemma")) return "gemma";
  if (name.includes("deepseek")) return "deepseek";

  return "generic";
}

/**
 * Get capabilities from model config
 */
export function getCapabilitiesFromModel(modelCapabilities: {
  toolCalling?: boolean;
  complexReasoning?: boolean;
  webSearch?: boolean;
  structuredOutput?: boolean;
  codeGeneration?: boolean;
  longContext?: boolean;
}): PromptCapability[] {
  const caps: PromptCapability[] = [];

  if (modelCapabilities.toolCalling) caps.push("toolCalling");
  if (modelCapabilities.complexReasoning) caps.push("complexReasoning");
  if (modelCapabilities.webSearch) caps.push("webSearch");
  if (modelCapabilities.structuredOutput) caps.push("structuredOutput");
  if (modelCapabilities.codeGeneration) caps.push("codeGeneration");
  if (modelCapabilities.longContext) caps.push("longContext");

  return caps;
}

/**
 * Get a simple default prompt (for settings default)
 */
export function getDefaultSystemPrompt(): string {
  return BASE_PROMPT;
}
