import {
  Gemma4ChatWrapper,
  LlamaText,
  SpecialTokensText,
  type ChatModelFunctions,
  type ChatWrapperGenerateContextStateOptions,
} from "node-llama-cpp";

const special = (text: string) => new SpecialTokensText(text);
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Gemma's delimiters are special tokens; user/tool text stays ordinary text. */
function formatValue(value: unknown): LlamaText {
  if (typeof value === "string") {
    return LlamaText(special('<|"|>'), value, special('<|"|>'));
  }
  if (Array.isArray(value)) {
    return LlamaText(
      "[",
      LlamaText.joinValues(",", value.map(formatValue)),
      "]"
    );
  }
  if (isObject(value)) {
    return LlamaText(
      "{",
      LlamaText.joinValues(
        ",",
        Object.keys(value)
          .sort()
          .map((key) => LlamaText(key, ":", formatValue(value[key])))
      ),
      "}"
    );
  }
  return LlamaText(value == null ? "null" : String(value));
}

/** Retain constraints, but describe nullable grammar placeholders natively. */
function declarationSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(declarationSchema);
  if (!isObject(value)) return value;
  if (Array.isArray(value.oneOf)) {
    const withoutNull = value.oneOf.filter(
      (branch) => !isObject(branch) || branch.type !== "null"
    );
    if (withoutNull.length === 1 && withoutNull.length < value.oneOf.length) {
      return {
        ...(declarationSchema(withoutNull[0]) as Record<string, unknown>),
        ...(typeof value.description === "string"
          ? { description: value.description }
          : {}),
        nullable: true,
      };
    }
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "type"
        ? Array.isArray(child)
          ? child.map((type) => String(type).toUpperCase())
          : String(child).toUpperCase()
        : key === "properties" && isObject(child)
          ? Object.fromEntries(
              Object.entries(child).map(([name, schema]) => [
                name,
                declarationSchema(schema),
              ])
            )
          : ["oneOf", "anyOf", "items", "additionalProperties"].includes(key)
            ? declarationSchema(child)
            : child,
    ])
  );
}

/**
 * node-llama-cpp 3.21.1's Gemma wrapper predates the installed GGUF's tool
 * template: it double-wraps JSON arguments and uses legacy result markers.
 * Render the native declarations, calls and results from Google's Gemma 4
 * prompt specification. The library's generic JSON call grammar is not used.
 */
export class Gemma4ToolChatWrapper extends Gemma4ChatWrapper {
  private availableFunctions: ChatModelFunctions = {};
  constructor() {
    super();
    Object.assign(this.settings.functions.call, {
      paramsPrefix: "",
      suffix: LlamaText(special("<tool_call|>")),
    });
    Object.assign(this.settings.functions.result, {
      prefix: LlamaText(
        special("<|tool_response>"),
        "response:{{functionName}}{value:"
      ),
      suffix: LlamaText("}", special("<tool_response|>")),
    });
  }

  setAvailableFunctions(functions: ChatModelFunctions): void {
    this.availableFunctions = functions;
  }

  override generateContextState(
    options: ChatWrapperGenerateContextStateOptions
  ) {
    return super.generateContextState({
      ...options,
      availableFunctions: options.availableFunctions ?? this.availableFunctions,
    });
  }

  override generateFunctionCall(name: string, params: unknown): LlamaText {
    return LlamaText(
      special("<|tool_call>"),
      "call:",
      name,
      formatValue(params ?? {}),
      special("<tool_call|>")
    );
  }

  override generateAvailableFunctionsSystemText(
    functions: ChatModelFunctions,
    { documentParams = true }: { documentParams?: boolean }
  ): LlamaText {
    return LlamaText(
      Object.entries(functions).map(([name, definition]) => {
        const declaration = {
          description: definition.description ?? "",
          ...(documentParams && definition.params
            ? { parameters: declarationSchema(definition.params) }
            : {}),
        };
        return LlamaText(
          special("<|tool>"),
          "declaration:",
          name,
          formatValue(declaration),
          special("<tool|>")
        );
      })
    );
  }

  override generateFunctionCallResult(
    name: string,
    _params: unknown,
    result: unknown
  ): LlamaText {
    return LlamaText(
      special("<|tool_response>"),
      "response:",
      name,
      formatValue(isObject(result) ? result : { value: result }),
      special("<tool_response|>")
    );
  }
}
