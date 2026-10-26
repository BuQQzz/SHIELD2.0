import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentsMdHint } from "./AgentsMdHint";

describe("AgentsMdHint", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("offers a draft", () => {
    const onDraft = vi.fn();
    render(<AgentsMdHint folder="C:/p/cart" onDraft={onDraft} />);
    fireEvent.click(screen.getByText("Draft one"));
    expect(onDraft).toHaveBeenCalledTimes(1);
  });

  it("stays away for that folder after Not now", () => {
    const { unmount } = render(
      <AgentsMdHint folder="C:/p/cart" onDraft={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Not now"));
    expect(screen.queryByText("Draft one")).toBeNull();
    unmount();
    render(<AgentsMdHint folder="C:\\P\\Cart\\" onDraft={vi.fn()} />);
    expect(screen.queryByText("Draft one")).toBeNull();
    cleanup();
    render(<AgentsMdHint folder="C:/p/other" onDraft={vi.fn()} />);
    expect(screen.getByText("Draft one")).toBeTruthy();
  });
});
