import { describe, expect, it } from "vitest";
import { sendWhatWaits, withSteer } from "./steer";

describe("withSteer", () => {
  it("leaves a result alone when the user sent nothing", () => {
    expect(withSteer("<tool_result>ok</tool_result>", [])).toBe(
      "<tool_result>ok</tool_result>"
    );
  });

  it("adds the user's messages after the result, in order", () => {
    const text = withSteer("<tool_result>ok</tool_result>", [
      "use pytest",
      "and keep it short",
    ]);
    expect(text.startsWith("<tool_result>ok</tool_result>\n\n")).toBe(true);
    expect(text).toContain(
      '[The user sent this while you were working: "use pytest", then "and keep it short".'
    );
  });
});

describe("sendWhatWaits", () => {
  function waiting(steer: string[], queue: string[], stopAfter = Infinity) {
    const sent: [string, { shown?: boolean } | undefined][] = [];
    const restored: string[] = [];
    const deps = {
      canGoOn: () => sent.length < stopAfter,
      takeSteer: () => steer.splice(0),
      nextQueued: () => queue.shift(),
      takeQueue: () => queue.splice(0),
      send: async (content: string, options?: { shown?: boolean }) => {
        sent.push([content, options]);
      },
      restore: (text: string) => restored.push(text),
    };
    return { deps, sent, restored };
  }

  it("sends leftover steer first, as one message already shown", async () => {
    const { deps, sent } = waiting(["use pytest", "and be quick"], []);
    await sendWhatWaits(deps);
    expect(sent).toEqual([["use pytest\n\nand be quick", { shown: true }]]);
  });

  it("sends each queued message as a turn of its own, in order", async () => {
    const { deps, sent } = waiting([], ["add sub", "then review"]);
    await sendWhatWaits(deps);
    expect(sent).toEqual([
      ["add sub", undefined],
      ["then review", undefined],
    ]);
  });

  it("after Stop, puts everything waiting back in the box instead", async () => {
    const { deps, sent, restored } = waiting(["use pytest"], ["add sub"], 0);
    await sendWhatWaits(deps);
    expect(sent).toEqual([]);
    expect(restored).toEqual(["use pytest\n\nadd sub"]);
  });

  it("stops mid-queue when a turn is stopped", async () => {
    const { deps, sent, restored } = waiting([], ["a", "b", "c"], 1);
    await sendWhatWaits(deps);
    expect(sent.map(([content]) => content)).toEqual(["a"]);
    expect(restored).toEqual(["b\n\nc"]);
  });
});
