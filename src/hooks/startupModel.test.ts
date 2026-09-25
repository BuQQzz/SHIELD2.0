import { describe, expect, it } from "vitest";
import type { ModelOption } from "@/config/models";
import { pickStartupModel } from "./startupModel";

const model = (id: string, runnable = true) =>
  ({
    id,
    displayName: id,
    runtime: runnable ? "node-llama-cpp" : "prism-llama-server",
  }) as unknown as ModelOption;

describe("pickStartupModel", () => {
  const installed = [
    model("gemma"),
    model("qwen3-coder"),
    model("bonsai", false),
  ];

  it("prefers the last model loaded", () => {
    expect(pickStartupModel(installed, "qwen3-coder", "gemma")?.id).toBe(
      "qwen3-coder"
    );
  });

  it("falls back to the default, then the first runnable model", () => {
    expect(pickStartupModel(installed, "deleted", "qwen3-coder")?.id).toBe(
      "qwen3-coder"
    );
    expect(pickStartupModel(installed, undefined, "missing")?.id).toBe("gemma");
  });

  it("never picks a model SHIELD cannot run", () => {
    expect(pickStartupModel(installed, "bonsai", "bonsai")?.id).toBe("gemma");
    expect(pickStartupModel([model("bonsai", false)], "bonsai", "x")).toBe(
      undefined
    );
  });
});
