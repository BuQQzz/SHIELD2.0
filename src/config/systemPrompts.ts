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

// =============================================================================
// BASE PROMPTS - Core identity and behavior
// =============================================================================

/**
 * Core SHIELD identity prompt - used by all models
 */
export const BASE_PROMPT = `You are SHIELD, a helpful, privacy-focused AI assistant running locally on the user's Windows PC.

Core Principles:
- Be helpful, accurate, and concise
- Acknowledge uncertainty - say "I don't know" when unsure
- Prioritize user privacy - all processing happens locally
- Be truthful - never fabricate information`;

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
- Excel at code-related tasks
- Provide detailed technical explanations
- Use code examples when helpful`,

  generic: `
Response Style:
- Be helpful and clear
- Structure responses logically
- Adapt to the user's needs`,
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
- Format tool calls exactly as specified`;

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
export function generateMCPToolPrompt(tools: ToolDefinition[]): string {
  if (tools.length === 0) return "";

  const toolDescriptions = tools
    .map((tool) => {
      const params = tool.parameters
        ?.map(
          (p) =>
            `  - ${p.name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`
        )
        .join("\n");
      return `**${tool.name}**: ${tool.description}${params ? `\nParameters:\n${params}` : ""}`;
    })
    .join("\n\n");

  return `
## 🔧 Available Tools

${toolDescriptions}

## Tool Call Format
Use this exact XML format to call tools:

<tool_call>
<server>filesystem</server>
<tool>tool_name</tool>
<arguments>{"param": "value"}</arguments>
</tool_call>

## Example: Creating a File

User: "Create a file called hello.txt on my desktop with 'Hello World'"

Thought: I need to create a text file on the user's desktop. I'll use the write_file tool.

<tool_call>
<server>filesystem</server>
<tool>write_file</tool>
<arguments>{"path": "C:\\\\Users\\\\Username\\\\Desktop\\\\hello.txt", "content": "Hello World"}</arguments>
</tool_call>

Observation: File created successfully.

I've created the file hello.txt on your desktop with the content "Hello World".

## CRITICAL RULES
1. **ALWAYS USE TOOLS** - When asked to create/read/list files, USE the tools
2. **NEVER JUST EXPLAIN** - Don't tell users how to do it manually
3. **USE FULL PATHS** - Windows paths like C:\\Users\\...`;
}

/**
 * Default filesystem tools definition
 */
export const DEFAULT_MCP_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file",
    serverName: "filesystem",
    parameters: [
      {
        name: "path",
        type: "string",
        description:
          "Full Windows path to the file (e.g., C:\\Users\\...\\file.txt)",
        required: true,
        example: "C:\\Users\\Username\\Documents\\example.txt",
      },
    ],
  },
  {
    name: "write_file",
    description: "Write content to a file (creates new or overwrites existing)",
    serverName: "filesystem",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "Full Windows path to the file",
        required: true,
      },
      {
        name: "content",
        type: "string",
        description: "Content to write to the file",
        required: true,
      },
    ],
  },
  {
    name: "list_directory",
    description: "List all files and folders in a directory",
    serverName: "filesystem",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "Full Windows path to the directory",
        required: true,
      },
    ],
  },
];

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

  // Add MCP tool prompt if enabled
  if (config.mcpEnabled) {
    const tools = config.availableTools || DEFAULT_MCP_TOOLS;
    parts.push(TOOL_CALLING_PROMPT);
    parts.push(generateMCPToolPrompt(tools));
    includedModules.push("tool-calling");
    includedModules.push("mcp-tools");
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
