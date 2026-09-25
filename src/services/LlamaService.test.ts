// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("node-llama-cpp", () => ({}));

const { LlamaService } = await import("./LlamaService");

describe("LlamaService.cleanup", () => {
  it("frees the model even when freeing the context fails", async () => {
    const service = new LlamaService();
    const context = {
      dispose: vi.fn().mockRejectedValue(new Error("context busy")),
    };
    const model = { dispose: vi.fn().mockResolvedValue(undefined) };
    Object.assign(service, { context, model });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await service.cleanup();

    expect(context.dispose).toHaveBeenCalled();
    expect(model.dispose).toHaveBeenCalled();
    expect(service.isModelLoaded()).toBe(false);
  });
});
