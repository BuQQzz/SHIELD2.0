import { beforeEach, describe, expect, it } from "vitest";
import { askRepeat, spendCheck, useTurnAskStore } from "./turnAskStore";
import { useGenerationStore } from "./generationStore";

describe("useTurnAskStore", () => {
  beforeEach(() => {
    useGenerationStore.getState().setStopRequested(false);
    useTurnAskStore.setState({ pending: null, resolve: null });
  });

  it("waits for the user's answer and clears the ask", async () => {
    const asked = askRepeat("run_command (curl)");
    expect(useTurnAskStore.getState().pending).toEqual({
      kind: "repeat",
      text: "run_command (curl)",
    });
    useTurnAskStore.getState().answer(true);
    await expect(asked).resolves.toBe(true);
    expect(useTurnAskStore.getState().pending).toBeNull();
  });

  it("answers no when the user presses Stop", async () => {
    const asked = askRepeat("read_text_file");
    useGenerationStore.getState().setStopRequested(true);
    await expect(asked).resolves.toBe(false);
    expect(useTurnAskStore.getState().pending).toBeNull();
  });

  it("does not ask once Stop was pressed", async () => {
    useGenerationStore.getState().setStopRequested(true);
    await expect(askRepeat("list_directory")).resolves.toBe(false);
    expect(useTurnAskStore.getState().pending).toBeNull();
  });
});

describe("spendCheck", () => {
  beforeEach(() => {
    useGenerationStore.getState().setStopRequested(false);
    useTurnAskStore.setState({ pending: null, resolve: null });
  });

  it("never asks without a limit", async () => {
    await expect(spendCheck(undefined, () => 99)()).resolves.toBe(true);
    await expect(spendCheck(0, () => 99)()).resolves.toBe(true);
  });

  it("asks at the limit, then again a limit's worth later", async () => {
    let spent = 0.4;
    const check = spendCheck(1, () => spent);
    await expect(check()).resolves.toBe(true);
    expect(useTurnAskStore.getState().pending).toBeNull();

    spent = 1.05;
    const first = check();
    expect(useTurnAskStore.getState().pending).toEqual({
      kind: "spend",
      text: "$1.05 so far, past your limit of $1.00",
    });
    useTurnAskStore.getState().answer(true);
    await expect(first).resolves.toBe(true);

    // Allowed: not asked again until another dollar is spent
    spent = 1.9;
    await expect(check()).resolves.toBe(true);
    spent = 2.1;
    const second = check();
    useTurnAskStore.getState().answer(false);
    await expect(second).resolves.toBe(false);
  });
});

describe("idleCheck", () => {
  beforeEach(() => {
    useGenerationStore.getState().setStopRequested(false);
    useTurnAskStore.setState({ pending: null, resolve: null });
  });

  it("asks at 60 calls without a change, then 60 later, and again after a change", async () => {
    const { idleCheck, IDLE_CALLS } = await import("./turnAskStore");
    const check = idleCheck();
    await expect(check(IDLE_CALLS - 1)).resolves.toBe(true);
    expect(useTurnAskStore.getState().pending).toBeNull();

    const first = check(IDLE_CALLS);
    expect(useTurnAskStore.getState().pending).toEqual({
      kind: "idle",
      text: "60 tool calls without changing a file",
    });
    useTurnAskStore.getState().answer(true);
    await expect(first).resolves.toBe(true);
    await expect(check(IDLE_CALLS + 30)).resolves.toBe(true);

    // A change starts the count again: asked at 60 once more
    await expect(check(5)).resolves.toBe(true);
    const again = check(IDLE_CALLS);
    useTurnAskStore.getState().answer(false);
    await expect(again).resolves.toBe(false);
  });
});
