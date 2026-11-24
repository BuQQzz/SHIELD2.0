/**
 * A hosted request that ran into a limit: the window, or the reply's own
 *
 * Over an hour-long task the history grows past what the size estimate
 * says, and a reply that writes a large file can reach max_tokens in the
 * middle of its call. Both ended the turn. opencode makes room and sends
 * again when the provider says the prompt is too long, and on a reply cut
 * at the output limit tells the model to go on in smaller pieces
 * (research, 2026-11-23). The same here, once each.
 */

export interface Overflow {
  /** The prompt's size as the provider counted it, when it says */
  prompt?: number;
  /** The model's window as the provider gives it, when it says */
  limit?: number;
}

/** How providers word "the prompt is over the window" */
const OVERFLOW =
  /context[_ ]length|context window|maximum context|prompt is too long|too many (?:input )?tokens|input token count|exceeds? the (?:maximum|max)\b[^.]*tokens|request too large|input is too long/i;

/** A max_tokens complaint is about the reply, not the window */
const REPLY_SETTING = /max_(?:completion_)?tokens|completion tokens/i;

function num(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const value = Number(text.replace(/[,_]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function first(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const found = num(pattern.exec(text)?.[1]);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The provider refused the prompt as over the model's window; null for any
 * other error. Wordings seen: OpenAI and OpenRouter ("maximum context length
 * is 131072 tokens. However, you requested about 140000 tokens"),
 * Anthropic ("prompt is too long: 210000 tokens > 200000 maximum"), Gemini
 * ("input token count (1100000) exceeds the maximum number of tokens
 * allowed (1048576)"), and a bare 413.
 */
export function hostedOverflow(status: number, body: string): Overflow | null {
  if (status === 413) return {};
  if (status !== 400 && status !== 422) return null;
  if (!OVERFLOW.test(body)) return null;
  if (REPLY_SETTING.test(body) && !/context/i.test(body)) return null;
  const prompt = first(body, [
    /requested (?:about )?([\d,]+) tokens/i,
    /prompt is too long:\s*([\d,]+) tokens/i,
    /input token count\s*\(?([\d,]+)/i,
    /([\d,]+) tokens? (?:exceeds|is more than|>)/i,
  ]);
  const limit = first(body, [
    /maximum context length is ([\d,]+)/i,
    /context (?:length|window)(?: of| is)? ([\d,]+)/i,
    /tokens? > ([\d,]+)/i,
    /maximum number of tokens allowed \(?([\d,]+)/i,
  ]);
  return {
    ...(prompt !== undefined ? { prompt } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

const OPEN = "<tool_call>";

/**
 * Where a tool call cut off by the reply limit starts in the reply, or null
 * when the reply's last call is whole. A call is cut when its arguments do
 * not parse: the stream ended inside them, and SHIELD only closed the tags.
 */
export function cutCallStart(reply: string): number | null {
  const start = reply.lastIndexOf(OPEN);
  if (start < 0) return null;
  const call = /<arguments>([\s\S]*)<\/arguments>\s*<\/tool_call>\s*$/.exec(
    reply.slice(start)
  );
  if (!call) return start;
  const args = call[1]!.trim();
  if (args === "") return null;
  try {
    JSON.parse(args);
    return null;
  } catch {
    return start;
  }
}

/** Characters of thinking per token, counted low so thinking is not undercounted */
const THINKING_CHARS_PER_TOKEN = 4;

/**
 * An empty reply that reached the limit while writing a call the provider
 * never streamed: some send a call's arguments only once it is whole, and
 * drop a cut one. Told apart from thinking by the token count: GLM 5.3
 * Flash spent 2,000 tokens with 141 characters of thinking, Gemini 3.8
 * Flash 757 with none, and both looked like an empty reply (2026-11-23,
 * reply limit lowered for the test). DeepSeek V4.1 Flash's 2,000 tokens
 * were 7,087 characters of thinking: thought out, not cut.
 */
export function callDropped(
  usage:
    | {
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number } | null;
      }
    | undefined,
  thinkingChars: number,
  /** The reply limit the request was sent with */
  maxTokens?: number
): boolean {
  const spent = usage?.completion_tokens;
  if (!spent) return false;
  // "length" well short of the limit is the provider ending the reply, not
  // the limit: GLM 5.3 Flash came back empty at 49 of 32,768 tokens twice,
  // and was told its call was cut (2026-11-24). An empty reply, then
  if (maxTokens && spent < maxTokens / 2) return false;
  // A provider that keeps the thinking to itself still counts it
  const thought = Math.max(
    usage.completion_tokens_details?.reasoning_tokens ?? 0,
    thinkingChars / THINKING_CHARS_PER_TOKEN
  );
  return spent - thought > spent / 2;
}
