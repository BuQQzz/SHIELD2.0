import { describe, expect, it } from "vitest";
import { useGenerationStore } from "./generationStore";

describe("a turn's end", () => {
  it("is Stop, or the next message, whichever comes first", () => {
    const store = useGenerationStore.getState();
    const first = store.beginTurn();
    expect(useGenerationStore.getState().turnOver(first)).toBe(false);

    useGenerationStore.getState().setStopRequested(true);
    expect(useGenerationStore.getState().turnOver(first)).toBe(true);

    // The next message clears Stop, but the stopped turn stays over: its
    // tool loop must not go on into the new conversation
    const second = useGenerationStore.getState().beginTurn();
    expect(useGenerationStore.getState().turnOver(first)).toBe(true);
    expect(useGenerationStore.getState().turnOver(second)).toBe(false);
  });
});
