// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildServerArgs, defaultThreads, findLlamaServer } from "./launch";
import { chunkProgress, SseParser } from "./sse";

describe("buildServerArgs", () => {
  const args = buildServerArgs({
    modelPath: "D:/m.gguf",
    contextSize: 32768,
    port: 51234,
    threads: 8,
  });
  const value = (flag: string) => args[args.indexOf(flag) + 1];

  it("listens on localhost only", () => {
    expect(value("--host")).toBe("127.0.0.1");
    expect(value("--port")).toBe("51234");
  });

  it("uses the measured profile", () => {
    expect(value("--ctx-size")).toBe("32768");
    expect(value("--fit")).toBe("on");
    expect(value("--parallel")).toBe("1");
    expect(value("--ubatch-size")).toBe("2048");
    expect(value("--spec-type")).toBe("ngram-mod");
    expect(value("--threads")).toBe("8");
  });

  it("never fixes a layer placement that could spill out of VRAM", () => {
    expect(args).not.toContain("--n-gpu-layers");
    expect(args).not.toContain("--n-cpu-moe");
  });
});

describe("defaultThreads", () => {
  it("uses half the logical CPUs, at most 8", () => {
    expect(defaultThreads(24)).toBe(8);
    expect(defaultThreads(8)).toBe(4);
    expect(defaultThreads(1)).toBe(1);
  });
});

describe("findLlamaServer", () => {
  it("prefers SHIELD_LLAMA_SERVER", () => {
    expect(
      findLlamaServer(
        { SHIELD_LLAMA_SERVER: "C:/x/llama-server.exe" },
        () => true
      )
    ).toBe("C:/x/llama-server.exe");
  });

  it("returns undefined when nothing exists", () => {
    expect(findLlamaServer({}, () => false)).toBeUndefined();
  });
});

describe("SseParser", () => {
  it("joins events split across chunks", () => {
    const parser = new SseParser();
    expect(parser.push('data: {"choices":[{"delta":{"content":"He')).toEqual(
      []
    );
    const chunks = parser.push(
      'llo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n'
    );
    expect(chunks.map((c) => c.choices?.[0]?.delta?.content)).toEqual([
      "Hello",
      " world",
    ]);
  });

  it("skips [DONE], comments and malformed events", () => {
    const parser = new SseParser();
    expect(
      parser.push(
        ': ping\ndata: {broken\ndata: {"usage":{"prompt_tokens":3,"completion_tokens":2}}\ndata: [DONE]\n'
      )
    ).toEqual([{ usage: { prompt_tokens: 3, completion_tokens: 2 } }]);
  });

  it("handles CRLF line endings", () => {
    const parser = new SseParser();
    expect(parser.push('data: {"choices":[]}\r\n\r\n')).toEqual([
      { choices: [] },
    ]);
  });
});

// Shaped like llama-server b10685's chunks with return_progress and
// timings_per_token (probed 2026-09-25)
const timings = (predicted_n: number, predicted_per_second = 0) => ({
  prompt_n: 20,
  prompt_ms: 18,
  predicted_n,
  predicted_ms: 1,
  predicted_per_second,
});

describe("chunkProgress", () => {
  it("reports reading, counting the cached part as read", () => {
    expect(
      chunkProgress(
        {
          choices: [{ delta: { content: null } }],
          timings: timings(0),
          prompt_progress: {
            total: 1545,
            cache: 1525,
            processed: 1525,
            time_ms: 0,
          },
        },
        0
      )
    ).toEqual({
      phase: "reading",
      done: 1525,
      total: 1545,
      cached: 1525,
      contextUsed: 1525,
    });
  });

  it("reports each generated token on top of the prompt", () => {
    expect(
      chunkProgress(
        {
          choices: [{ delta: { content: "1" } }],
          timings: timings(5, 24.5),
        },
        1545
      )
    ).toEqual({
      phase: "writing",
      generated: 5,
      tokensPerSecond: 24.5,
      contextUsed: 1550,
    });
  });

  it("counts generated tokens even when no text is streamed (thinking)", () => {
    expect(
      chunkProgress(
        {
          choices: [{ delta: { reasoning_content: "hmm" } }],
          timings: timings(3),
        },
        100
      )?.phase
    ).toBe("writing");
  });

  it("says nothing for a chunk with neither", () => {
    expect(chunkProgress({ choices: [] }, 100)).toBeNull();
    expect(chunkProgress({ timings: timings(0) }, 100)).toBeNull();
  });
});
