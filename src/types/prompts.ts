/**
 * Prompt-related types for model-specific system prompts
 */

/**
 * Capabilities that affect prompt composition
 */
export type PromptCapability =
  | "toolCalling"
  | "webSearch"
  | "codeGeneration"
  | "complexReasoning"
  | "structuredOutput"
  | "longContext";

/**
 * Model family identifiers for prompt selection
 */
export type ModelFamily =
  | "llama"
  | "qwen"
  | "mistral"
  | "phi"
  | "gemma"
  | "deepseek"
  | "generic";

/**
 * Configuration for building a system prompt
 */
export interface SystemPromptConfig {
  /** Model family for model-specific optimizations */
  modelFamily: ModelFamily;
  /** Active capabilities that affect prompt content */
  capabilities: PromptCapability[];
  /** User's custom prompt (if any) - takes priority */
  customPrompt?: string;
  /** Whether MCP tools are enabled */
  mcpEnabled?: boolean;
  /** Available MCP tools (for tool descriptions) */
  availableTools?: ToolDefinition[];
  /** Directories the MCP servers are permitted to touch */
  allowedPaths?: string[];
  /**
   * Plan mode: the model describes what it would do instead of doing it.
   * Nothing executes, so the prompt must not ask for tool call syntax.
   */
  planOnly?: boolean;
}

/**
 * Tool definition for prompt generation
 */
export interface ToolDefinition {
  /** Tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Server name (for MCP) */
  serverName?: string;
  /** Parameter definitions */
  parameters?: ToolParameter[];
  /** MCP tool annotations, when the server supplies them */
  annotations?: {
    /** Server's own claim that the tool does not change anything */
    readOnlyHint?: boolean;
  };
}

/**
 * Parameter definition for tools
 */
export interface ToolParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: "string" | "number" | "boolean" | "object" | "array";
  /** Description of the parameter */
  description: string;
  /** Whether the parameter is required */
  required: boolean;
  /** Example value */
  example?: string;
}

/**
 * Prompt module - a composable piece of a system prompt
 */
export interface PromptModule {
  /** Unique identifier */
  id: string;
  /** Module content */
  content: string;
  /** Priority for ordering (lower = earlier in prompt) */
  priority: number;
  /** Required capabilities to include this module */
  requiredCapabilities?: PromptCapability[];
  /** Model families this module is optimized for (empty = all) */
  modelFamilies?: ModelFamily[];
}

/**
 * Built system prompt result
 */
export interface BuiltPrompt {
  /** The final assembled prompt */
  prompt: string;
  /** Modules that were included */
  includedModules: string[];
  /** Estimated token count (rough) */
  estimatedTokens: number;
}
