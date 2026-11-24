import { describe, expect, it } from "vitest";
import { callDropped, cutCallStart, hostedOverflow } from "./replyLimits";

describe("hostedOverflow", () => {
  it("reads OpenAI and OpenRouter wording", () => {
    expect(
      hostedOverflow(
        400,
        `{"error":{"message":"This endpoint's maximum context length is 131072 tokens. However, you requested about 140,312 tokens (107,544 of text input, 32,768 in the output)."}}`
      )
    ).toEqual({ prompt: 140312, limit: 131072 });
    expect(
      hostedOverflow(400, `{"error":{"code":"context_length_exceeded"}}`)
    ).toEqual({});
  });

  it("reads Anthropic and Gemini wording", () => {
    expect(
      hostedOverflow(400, "prompt is too long: 210000 tokens > 200000 maximum")
    ).toEqual({ prompt: 210000, limit: 200000 });
    expect(
      hostedOverflow(
        400,
        "The input token count (1100000) exceeds the maximum number of tokens allowed (1048576)."
      )
    ).toEqual({ prompt: 1100000, limit: 1048576 });
  });

  it("takes a bare 413 as too long", () => {
    expect(hostedOverflow(413, "Payload Too Large")).toEqual({});
  });

  it("leaves other refusals alone", () => {
    expect(hostedOverflow(400, `{"error":"bad key"}`)).toBeNull();
    expect(hostedOverflow(429, "context length exceeded")).toBeNull();
    expect(
      hostedOverflow(
        400,
        "max_tokens is too large: 32768. This model supports at most 8192 completion tokens"
      )
    ).toBeNull();
  });
});

describe("cutCallStart", () => {
  const call = (args: string) =>
    `<tool_call>\n<server>filesystem</server>\n<tool>write_file</tool>\n<arguments>${args}</arguments>\n</tool_call>\n`;

  it("finds a call whose arguments end mid-value", () => {
    const reply = `Writing it.\n${call('{"path":"a.js","content":"one')}`;
    expect(cutCallStart(reply)).toBe("Writing it.\n".length);
  });

  it("leaves whole calls and plain text alone", () => {
    expect(cutCallStart(call('{"path":"a.js","content":"x"}'))).toBeNull();
    expect(cutCallStart(call(""))).toBeNull();
    expect(cutCallStart("Just an answer that ran long")).toBeNull();
  });

  it("looks only at the last call", () => {
    const whole = call('{"path":"a.js","content":"x"}');
    const cut = call('{"path":"b.js","content":"y');
    expect(cutCallStart(whole + cut)).toBe(whole.length);
  });
});

describe("callDropped", () => {
  it("tells a dropped call from thinking by where the tokens went", () => {
    // GLM 5.3 Flash and Gemini 3.8 Flash at a 2,000-token limit (2026-11-23)
    expect(callDropped({ completion_tokens: 2000 }, 141)).toBe(true);
    expect(callDropped({ completion_tokens: 757 }, 0)).toBe(true);
    // DeepSeek V4.1 Flash: thought out
    expect(callDropped({ completion_tokens: 2000 }, 7087)).toBe(false);
  });

  it("counts thinking the provider kept to itself", () => {
    expect(
      callDropped(
        {
          completion_tokens: 2000,
          completion_tokens_details: { reasoning_tokens: 1900 },
        },
        0
      )
    ).toBe(false);
  });

  it("is not a reply that stopped far short of the limit", () => {
    // GLM 5.3 Flash: 49 of 32,768 tokens, twice (2026-11-24)
    expect(callDropped({ completion_tokens: 49 }, 0, 32768)).toBe(false);
    expect(callDropped({ completion_tokens: 2000 }, 141, 2000)).toBe(true);
  });

  it("needs a token count", () => {
    expect(callDropped(undefined, 0)).toBe(false);
    expect(callDropped({}, 0)).toBe(false);
  });
});
