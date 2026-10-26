import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CodeModelHint } from "./CodeModelHint";
import { isCodingModel } from "@/lib/sessions";
import type { ModelOption } from "@/config/models";

const option = (id: string, displayName: string): ModelOption => ({
  id,
  name: displayName,
  displayName,
  uri: "",
  size: "",
  description: "",
  contextSize: 32768,
  runtime: "node-llama-cpp",
});

const gemma = option("gemma-4-12b", "Gemma 4 12B");
const qwen = option("qwen3-coder-30b", "Qwen3 Coder 30B");

describe("isCodingModel", () => {
  it("goes by the catalog's roles", () => {
    expect(isCodingModel("qwen3-coder-30b")).toBe(true);
    expect(isCodingModel("gemma-4-12b")).toBe(false);
    expect(isCodingModel("not-in-the-catalog")).toBe(false);
    expect(isCodingModel(undefined)).toBe(false);
  });
});

describe("CodeModelHint", () => {
  it("suggests an installed coding model in place of a chat model", () => {
    const onLoad = vi.fn();
    render(
      <CodeModelHint
        currentModelId="gemma-4-12b"
        models={[gemma, qwen]}
        onLoad={onLoad}
      />
    );
    expect(screen.getByText(/Gemma 4 12B is made for chat/)).toBeTruthy();
    fireEvent.click(screen.getByText("Load Qwen3 Coder 30B"));
    expect(onLoad).toHaveBeenCalledWith(qwen);
  });

  it("stays out of the way with a coding model, or none to suggest", () => {
    const { container, rerender } = render(
      <CodeModelHint
        currentModelId="qwen3-coder-30b"
        models={[gemma, qwen]}
        onLoad={vi.fn()}
      />
    );
    expect(container.textContent).toBe("");
    rerender(
      <CodeModelHint
        currentModelId="gemma-4-12b"
        models={[gemma]}
        onLoad={vi.fn()}
      />
    );
    expect(container.textContent).toBe("");
  });
});
