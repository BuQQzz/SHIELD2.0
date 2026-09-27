import { randomUUID } from "node:crypto";
import {
  LlamaChat,
  LlamaText,
  SpecialTokensText,
  type LlamaChatSession,
  type ChatModelFunctionCall,
  type ChatHistoryItem,
  type ChatModelFunctions,
  type LLamaChatGenerateResponseOptions,
} from "node-llama-cpp";
import type { ToolDefinition } from "../types/prompts.js";
import type { NativeToolResult } from "../types/nativeTools.js";
import { buildNativeTools } from "./nativeTools.js";
import { Gemma4ToolChatWrapper } from "./Gemma4ToolChatWrapper.js";
import { parseGemmaToolCall } from "./gemmaToolProtocol.js";

const CALL_START = "<|tool_call>";
const CALL_END = "<tool_call|>";

/** Preserve preceding thoughts/text while removing the parsed call text. */
function beforeCall(
  response: Extract<ChatHistoryItem, { type: "model" }>["response"]
) {
  const kept: typeof response = [];
  for (const piece of response) {
    const text =
      typeof piece === "string"
        ? piece
        : piece.type === "segment"
          ? piece.text
          : "";
    const start = text.indexOf(CALL_START);
    if (start < 0) {
      kept.push(piece);
      continue;
    }
    if (start > 0)
      kept.push(
        typeof piece === "string"
          ? text.slice(0, start)
          : {
              ...piece,
              ...(piece.type === "segment"
                ? { text: text.slice(0, start), raw: undefined, ended: true }
                : {}),
            }
      );
    break;
  }
  return kept;
}

interface PendingCall {
  id: string;
  call: Omit<ChatModelFunctionCall, "result">;
}

/** Native generation stops before execution; the renderer owns permission and execution. */
export class NativeChatSession {
  private chat: LlamaChat;
  private wrapper: Gemma4ToolChatWrapper;
  private pending: PendingCall[] = [];

  constructor(private session: LlamaChatSession) {
    this.wrapper =
      session.chatWrapper instanceof Gemma4ToolChatWrapper
        ? session.chatWrapper
        : new Gemma4ToolChatWrapper();
    this.chat = new LlamaChat({
      contextSequence: session.sequence,
      chatWrapper: this.wrapper,
    });
  }

  cancelPending(): void {
    if (this.pending.length === 0) return;
    this.settlePending(
      this.pending.map(({ id }) => ({
        callId: id,
        result:
          "No result was received for this tool request before the turn was stopped or replaced. Do not assume it ran or succeeded. Check the current state before repeating a change.",
      }))
    );
  }

  dispose(): void {
    this.pending = [];
    this.chat.dispose({ disposeSequence: false });
  }

  private settlePending(results: NativeToolResult[]): void {
    if (
      results.length !== this.pending.length ||
      new Set(results.map((result) => result.callId)).size !== results.length ||
      results.some(
        (result) => !this.pending.some(({ id }) => id === result.callId)
      )
    ) {
      throw new Error("Native tool results do not match the pending request.");
    }
    const history = this.session.getChatHistory();
    const last = history[history.length - 1];
    if (!last || last.type !== "model") {
      throw new Error("Native tool results have no matching assistant turn.");
    }
    const response = [...last.response];
    for (const { id, call } of this.pending) {
      response.push({
        ...call,
        result: results.find((result) => result.callId === id)!.result,
      });
    }
    this.session.setChatHistory([
      ...history.slice(0, -1),
      { type: "model", response },
    ]);
    this.pending = [];
  }

  async prompt(
    message: string,
    tools: ToolDefinition[],
    options: Omit<
      LLamaChatGenerateResponseOptions<ChatModelFunctions>,
      | "grammar"
      | "functions"
      | "maxParallelFunctionCalls"
      | "onFunctionCall"
      | "customStopTriggers"
      | "onFunctionCallParamsChunk"
    >,
    toolResults?: NativeToolResult[]
  ): Promise<{ responseText: string; stopReason: string }> {
    options.signal?.throwIfAborted();
    const { functions, toolsByName } = buildNativeTools(tools);
    this.wrapper.setAvailableFunctions(functions);
    if (toolResults !== undefined) {
      if (this.pending.length === 0) {
        throw new Error(
          "Native tool results arrived after their request ended."
        );
      }
      this.settlePending(toolResults);
    } else {
      this.cancelPending();
      this.session.setChatHistory([
        ...this.session.getChatHistory(),
        { type: "user", text: message },
        { type: "model", response: [] },
      ]);
    }

    const inputHistory = this.session.getChatHistory();
    const oldLast = inputHistory[inputHistory.length - 1];
    const previousResponse = oldLast?.type === "model" ? oldLast.response : [];
    let visibleBuffer = "";
    let inToolCall = false;
    const result = await this.chat.generateResponse(inputHistory, {
      ...options,
      // Supplying `functions` activates the library's ordinary JSON grammar,
      // which corrupts Gemma's special-quoted native arguments. Declarations
      // are supplied by our wrapper instead; the strict parser validates calls.
      customStopTriggers: [LlamaText(new SpecialTokensText(CALL_END))],
      onTextChunk: (chunk) => {
        if (inToolCall) return;
        visibleBuffer += chunk;
        const start = visibleBuffer.indexOf(CALL_START);
        if (start >= 0) {
          if (start > 0) options.onTextChunk?.(visibleBuffer.slice(0, start));
          visibleBuffer = "";
          inToolCall = true;
          return;
        }
        // Hold a possible split marker so it never flashes in the chat UI.
        let suffix = 0;
        for (let i = 1; i < CALL_START.length; i++) {
          if (visibleBuffer.endsWith(CALL_START.slice(0, i))) suffix = i;
        }
        const safeLength = visibleBuffer.length - suffix;
        if (safeLength > 0)
          options.onTextChunk?.(visibleBuffer.slice(0, safeLength));
        visibleBuffer = visibleBuffer.slice(safeLength);
      },
    });
    options.signal?.throwIfAborted();
    const generated = result.fullResponse ?? [result.response];
    const generatedText = generated
      .map((piece) => (typeof piece === "string" ? piece : piece.text))
      .join("");
    // This method installs exactly one custom stop trigger, so this metadata
    // proves the closing token was generated even though llama removed it.
    const parseText =
      generatedText +
      (result.metadata.stopReason === "customStopTrigger" ? CALL_END : "");
    const cleanResponse = beforeCall(generated);
    const visibleText = cleanResponse
      .filter((piece): piece is string => typeof piece === "string")
      .join("");
    const cleanHistory: ChatHistoryItem[] = [
      ...result.lastEvaluation.cleanHistory.slice(0, -1),
      { type: "model", response: [...previousResponse, ...cleanResponse] },
    ];
    this.session.setChatHistory(cleanHistory);
    let call: ReturnType<typeof parseGemmaToolCall>;
    try {
      call = parseGemmaToolCall(parseText);
      // A quoted spelling of a call is not sufficient: generation must have
      // reached the real native end-of-call control token installed above.
      if (call && result.metadata.stopReason !== "customStopTrigger") {
        throw new Error("Native call did not reach its control-token boundary");
      }
      if (call && !toolsByName.has(call.name))
        throw new Error("Unavailable native tool");
    } catch {
      const warning =
        "SHIELD could not read this model's tool request. No tool from this reply was run. Ask to continue or try a smaller request.";
      this.session.setChatHistory([
        ...cleanHistory.slice(0, -1),
        {
          type: "model",
          response: [...previousResponse, ...cleanResponse, warning],
        },
      ]);
      return {
        responseText: `${visibleText}\n\n${warning}`,
        stopReason: result.metadata.stopReason,
      };
    }
    if (!call) {
      if (visibleBuffer) options.onTextChunk?.(visibleBuffer);
      return {
        responseText: result.response,
        stopReason: result.metadata.stopReason,
      };
    }
    const tool = toolsByName.get(call.name)!;
    const id = `native-${randomUUID()}`;
    this.pending.push({
      id,
      call: {
        type: "functionCall",
        name: call.name,
        description: functions[call.name]?.description,
        params: call.params,
        rawCall: this.wrapper
          .generateFunctionCall(call.name, call.params)
          .toJSON(),
      },
    });
    const envelopes = [
      {
        id,
        type: "function",
        function: {
          name: `${tool.serverName ?? "filesystem"}.${tool.name}`,
          arguments: JSON.stringify(call.params),
        },
      },
    ];
    // The existing renderer parses this envelope, requests permission, and
    // returns results by id. Escape markup and fence delimiters so file
    // contents cannot become calls or prematurely end the JSON envelope.
    const envelope =
      envelopes.length > 0
        ? `\n\n\`\`\`json\n${JSON.stringify({ tool_calls: envelopes }).replace(/</g, "\\u003c").replace(/`/g, "\\u0060")}\n\`\`\``
        : "";
    return {
      responseText: visibleText + envelope,
      stopReason: result.metadata.stopReason,
    };
  }
}
