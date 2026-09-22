/**
 * Harness strategies under test.
 *
 * xml    - what the app does today: SHIELD's prompt builder describes the
 *          tools and the XML call format, SHIELD's parser extracts calls,
 *          results go back as a user-turn continuation (mcpMessageHandler).
 * native - node-llama-cpp function calling: tools are passed as functions,
 *          the model's own chat template renders them, generation is
 *          grammar-constrained, and results use the template's native
 *          tool-result slot.
 */

import {
  LlamaChatSession,
  QwenChatWrapper,
  type ChatWrapper,
  resolveChatWrapper,
  type ChatSessionModelFunctions,
  type GbnfJsonSchema,
  type LlamaContext,
  type LlamaModel,
} from "node-llama-cpp";
import {
  buildSystemPrompt,
  detectModelFamily,
  getCapabilitiesFromModel,
} from "../../src/config/systemPrompts";
import { MODEL_CATALOG } from "../../src/config/models";
import { processMCPToolCalls } from "../../src/handlers/mcpMessageHandler";
import {
  extractToolCalls,
  stripToolCallMarkup,
} from "../../src/handlers/mcpToolHandler";
import { resultText, SERVER_NAME, type BenchMCP } from "./mcp";

export interface Sampling {
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  seed: number;
}

export interface StrategyRun {
  answer: string;
  /** Model replies that looked like a tool call but did not parse */
  malformed: number;
  /** Size of the system prompt the strategy built (excludes native docs) */
  systemPromptTokens: number;
  inputTokens: number;
  outputTokens: number;
  /** Raw model replies, in order (xml only) */
  transcript?: string[];
}

export interface StrategyContext {
  model: LlamaModel;
  context: LlamaContext;
  modelName: string;
  mcp: BenchMCP;
  dir: string;
  prompt: string;
  sampling: Sampling;
}

// The app's default limits (mcpMessageHandler). xml gets them from the real
// loop; native has to enforce them itself.
const MAX_TOOL_ROUNDS = 5;
const MAX_CALLS_PER_ROUND = 5;

/**
 * The capabilities the app would use for this model file: the catalog entry
 * that names the same file, else the Qwen 2.5 7B entry's flags.
 *
 *   file://dir/Name.gguf            -> matched on "name.gguf"
 *   hf:Owner/Repo-GGUF:Q4_K_M       -> matched on "repo" + quant
 *                                      (downloaded as hf_Owner_Repo.Q4_K_M.gguf)
 */
function appCapabilities(modelFile: string) {
  const file = modelFile.toLowerCase();
  const entry = MODEL_CATALOG.find((m) => {
    const uri = m.uri.toLowerCase();
    if (uri.startsWith("file://")) {
      return file === uri.split("/").pop();
    }
    const [, repoPath = "", quant = ""] = uri.split(":");
    const repo = (repoPath.split("/").pop() ?? "").replace(/-gguf$/, "");
    return repo !== "" && file.includes(repo) && file.includes(quant);
  });
  return getCapabilitiesFromModel(
    entry?.capabilities ?? {
      toolCalling: false,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      codeGeneration: true,
      longContext: true,
    }
  );
}

function sessionPromptOptions(s: Sampling) {
  return {
    temperature: s.temperature,
    maxTokens: s.maxTokens,
    topP: s.topP,
    topK: s.topK,
    repeatPenalty: { penalty: s.repeatPenalty },
    seed: s.seed,
  };
}

async function withSession<T>(
  ctx: StrategyContext,
  systemPrompt: string,
  fn: (session: LlamaChatSession) => Promise<T>,
  chatWrapper: ChatWrapper = resolveChatWrapper(ctx.model)
): Promise<T & { inputTokens: number; outputTokens: number }> {
  const sequence = ctx.context.getSequence();
  const session = new LlamaChatSession({
    contextSequence: sequence,
    chatWrapper,
    systemPrompt,
    autoDisposeSequence: true,
  });
  try {
    const result = await fn(session);
    return {
      ...result,
      inputTokens: sequence.tokenMeter.usedInputTokens,
      outputTokens: sequence.tokenMeter.usedOutputTokens,
    };
  } finally {
    session.dispose();
  }
}

export async function runXml(ctx: StrategyContext): Promise<StrategyRun> {
  const systemPrompt = buildSystemPrompt({
    modelFamily: detectModelFamily(ctx.modelName),
    capabilities: appCapabilities(ctx.modelName),
    mcpEnabled: true,
    availableTools: ctx.mcp.toolDefs,
    allowedPaths: [ctx.dir],
  }).prompt;

  const result = await withSession(ctx, systemPrompt, async (session) => {
    const opts = sessionPromptOptions(ctx.sampling);
    let malformed = 0;
    const transcript: string[] = [];
    // A reply is malformed when it tried to call a tool and the parser
    // either found nothing or could not read the arguments.
    const inspect = (reply: string) => {
      transcript.push(reply);
      const calls = extractToolCalls(reply);
      if (
        calls.some((c) => c.argumentsError) ||
        (calls.length === 0 &&
          /<tool_call|<\/tool_call>|"tool_calls"/.test(reply))
      ) {
        malformed++;
      }
      return reply;
    };

    let reply = inspect(await session.prompt(ctx.prompt, opts));

    // The app's own tool loop, so the benchmark measures shipped behaviour.
    await processMCPToolCalls(
      { id: "bench", role: "assistant", content: reply, timestamp: new Date() },
      {
        onToolCallDetected: (call) =>
          ctx.mcp.execute(call.serverName, call.tool, call.arguments),
        addMessage: () => {},
        continueConversation: async (text) => {
          reply = inspect(await session.prompt(text, opts));
          return reply;
        },
      }
    );

    return {
      answer: stripToolCallMarkup(reply).trim(),
      malformed,
      transcript,
    };
  });

  return {
    ...result,
    systemPromptTokens: ctx.model.tokenize(systemPrompt).length,
  };
}

/**
 * Convert an MCP JSON Schema into the subset node-llama-cpp can turn into a
 * grammar. Anything it cannot express falls back to a permissive schema so a
 * tool is never silently dropped.
 */
export function toGbnfSchema(schema: unknown): GbnfJsonSchema {
  const s = (schema ?? {}) as Record<string, unknown>;
  const description =
    typeof s.description === "string" ? { description: s.description } : {};
  const permissive: GbnfJsonSchema = {
    type: ["string", "number", "boolean", "null"],
    ...description,
  };

  const variants = (s.anyOf ?? s.oneOf) as unknown[] | undefined;
  if (Array.isArray(variants)) {
    return { oneOf: variants.map(toGbnfSchema), ...description };
  }
  if (Array.isArray(s.enum)) {
    return {
      enum: s.enum as (string | number | boolean | null)[],
      ...description,
    };
  }
  if (s.const !== undefined) {
    return {
      const: s.const as string | number | boolean | null,
      ...description,
    };
  }

  const basic = ["string", "number", "integer", "boolean", "null"] as const;
  type Basic = (typeof basic)[number];
  if (Array.isArray(s.type)) {
    const types = (s.type as string[]).filter((t): t is Basic =>
      (basic as readonly string[]).includes(t)
    );
    return types.length > 0 ? { type: types, ...description } : permissive;
  }

  switch (s.type) {
    case "object": {
      const props = (s.properties ?? {}) as Record<string, unknown>;
      const keys = Object.keys(props);
      if (keys.length === 0) {
        return { type: "object", additionalProperties: true, ...description };
      }
      // node-llama-cpp's grammar emits every declared property regardless of
      // `required`, so the model would be forced to invent values for
      // optional parameters. Let optional ones be null instead; stripNulls
      // removes them before the call reaches MCP.
      const required = (s.required as string[]) ?? [];
      return {
        type: "object",
        properties: Object.fromEntries(
          keys.map((k) => {
            const converted = toGbnfSchema(props[k]);
            if (required.includes(k)) return [k, converted];
            const { description: propDescription, ...rest } =
              converted as Record<string, unknown>;
            return [
              k,
              {
                oneOf: [rest as GbnfJsonSchema, { type: "null" }],
                ...(typeof propDescription === "string"
                  ? {
                      description: `${propDescription} (optional; null to omit)`,
                    }
                  : { description: "optional; null to omit" }),
              },
            ];
          })
        ),
        required: required.filter((k) => keys.includes(k)),
        ...description,
      };
    }
    case "array":
      return {
        type: "array",
        ...(s.items ? { items: toGbnfSchema(s.items) } : {}),
        ...description,
      };
    case "string": {
      const format =
        s.format === "date-time" || s.format === "date" || s.format === "time"
          ? { format: s.format }
          : {};
      return { type: "string", ...format, ...description } as GbnfJsonSchema;
    }
    case "number":
    case "integer":
    case "boolean":
    case "null":
      return { type: s.type, ...description };
    default:
      return permissive;
  }
}

/** Drop the nulls toGbnfSchema uses to stand in for omitted optionals. */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)])
    );
  }
  return value;
}

export async function runNative(
  ctx: StrategyContext,
  chatWrapper?: ChatWrapper
): Promise<StrategyRun> {
  // Same identity/behaviour prompt as the app, minus the tool-format section:
  // the chat template documents the functions itself.
  const base = buildSystemPrompt({
    modelFamily: detectModelFamily(ctx.modelName),
    capabilities: appCapabilities(ctx.modelName),
    mcpEnabled: false,
  }).prompt;
  const systemPrompt = `${base}

## Accessible Directories
You can ONLY access these directories and their subfolders:
- ${ctx.dir}
Always use a full path beginning with one of these.`;

  const maxCalls = MAX_TOOL_ROUNDS * MAX_CALLS_PER_ROUND;
  let callCount = 0;
  const abort = new AbortController();

  const functions: ChatSessionModelFunctions = Object.fromEntries(
    ctx.mcp.rawTools.map((tool) => [
      tool.name,
      {
        description: tool.description,
        params: toGbnfSchema(tool.inputSchema),
        // A throwing handler aborts the whole prompt, so failures and policy
        // refusals are returned to the model as results instead.
        handler: async (params: unknown) => {
          callCount++;
          if (callCount > maxCalls) {
            if (callCount > maxCalls + 2) abort.abort();
            return "Error: tool call limit reached for this turn. Answer the user now without calling more tools.";
          }
          const res = await ctx.mcp.execute(
            SERVER_NAME,
            tool.name,
            (stripNulls(params) ?? {}) as Record<string, unknown>
          );
          return resultText(res);
        },
      },
    ])
  );

  const result = await withSession(
    ctx,
    systemPrompt,
    async (session) => {
      const answer = await session.prompt(ctx.prompt, {
        ...sessionPromptOptions(ctx.sampling),
        functions,
        signal: abort.signal,
        stopOnAbortSignal: true,
      });
      return { answer: answer.trim(), malformed: 0 };
    },
    chatWrapper
  );

  return {
    ...result,
    systemPromptTokens: ctx.model.tokenize(systemPrompt).length,
  };
}

export const STRATEGIES = {
  xml: runXml,
  native: (ctx: StrategyContext) => runNative(ctx),
  // Qwen3-Coder resolves to the generic ChatML wrapper in node-llama-cpp
  // 3.15-3.21 (its <function=...> template is not recognised), which teaches a
  // non-native call syntax. Force the Qwen/Hermes JSON <tool_call> wrapper.
  "native-qwen": (ctx: StrategyContext) =>
    runNative(ctx, new QwenChatWrapper()),
} as const;

export type StrategyName = keyof typeof STRATEGIES;
