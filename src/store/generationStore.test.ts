import { beforeEach, describe, expect, it } from "vitest";
import { useGenerationStore } from "./generationStore";

const store = () => useGenerationStore.getState();

beforeEach(() => {
  useGenerationStore.setState({
    context: { used: 1000, size: 8192 },
    progress: null,
    lastSummary: null,
  });
});

describe("generation store", () => {
  it("moves the context ring as a reply is read and written", () => {
    store().setProgress({
      phase: "reading",
      done: 3000,
      total: 5000,
      cached: 2000,
      contextUsed: 3000,
    });
    expect(store().context).toEqual({ used: 3000, size: 8192 });

    store().setProgress({
      phase: "writing",
      generated: 40,
      tokensPerSecond: 25,
      contextUsed: 5040,
    });
    expect(store().context).toEqual({ used: 5040, size: 8192 });
  });

  it("leaves the ring alone while summarising and when the reply ends", () => {
    store().setProgress({ phase: "summarising" });
    expect(store().context?.used).toBe(1000);
    store().setProgress(null);
    expect(store().context?.used).toBe(1000);
    expect(store().progress).toBeNull();
  });

  it("does not invent a window before one is known", () => {
    useGenerationStore.setState({ context: null });
    store().setProgress({
      phase: "writing",
      generated: 1,
      tokensPerSecond: 0,
      contextUsed: 10,
    });
    expect(store().context).toBeNull();
  });

  it("keeps a summary for the reply that needed it, and only that one", () => {
    store().record(null, { used: 2000, size: 8192 }, "capsule text");
    expect(store().lastSummary).toBe("capsule text");
    store().record(null, { used: 2100, size: 8192 });
    expect(store().lastSummary).toBeNull();
  });
});
