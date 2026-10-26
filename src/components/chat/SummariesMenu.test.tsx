import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SummariesMenu, type ChatSummary } from "./SummariesMenu";
import { SummaryStep } from "./ToolStep";
import { useSummaryFocus } from "@/stores/summary-focus-store";

const capsule = (state: string) =>
  `## Earlier in this conversation\n\nWhat the user asked, oldest first:\n1. "explain HTTP"\n2. "what about TCP?"\n\nYour note:\nState: ${state}\nDecisions: none\nNext: nothing`;

const summary = (id: string, state: string): ChatSummary => ({
  id,
  summary: capsule(state),
  timestamp: new Date(2026, 8, 25, 17, 35),
});

afterEach(() => {
  vi.useRealTimers();
  useSummaryFocus.setState({ focusedId: null });
});

describe("SummariesMenu", () => {
  it("shows nothing until the chat has a summary", () => {
    const { container } = render(
      <SummariesMenu conversationId="c1" summaries={[]} />
    );
    expect(container.textContent).toBe("");
  });

  it("announces a summary added to this chat, then quiets down", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <SummariesMenu conversationId="c1" summaries={[]} />
    );
    rerender(
      <SummariesMenu
        conversationId="c1"
        summaries={[summary("m1", "Explained HTTP")]}
      />
    );
    expect(screen.getByText("Earlier turns summarised")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();

    act(() => vi.advanceTimersByTime(4500));
    // The label leaves through an exit animation; the count stays
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("does not announce the summaries of a chat being opened", () => {
    const { rerender } = render(
      <SummariesMenu conversationId="c1" summaries={[]} />
    );
    rerender(
      <SummariesMenu
        conversationId="c2"
        summaries={[summary("m1", "a"), summary("m2", "b")]}
      />
    );
    expect(screen.queryByText("Earlier turns summarised")).toBeNull();
    expect(screen.getByText("2")).toBeTruthy();
  });
});

describe("SummaryStep", () => {
  it("opens and scrolls into view when the menu picks it", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<SummaryStep id="m1" summary={capsule("Explained HTTP")} />);
    expect(screen.queryByText(/State: Explained HTTP/)).toBeNull();

    act(() => useSummaryFocus.getState().focus("m1"));

    expect(screen.getByText(/State: Explained HTTP/)).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
    // Handled, so picking it again works
    expect(useSummaryFocus.getState().focusedId).toBeNull();
  });

  it("ignores a pick meant for another summary", () => {
    render(<SummaryStep id="m1" summary={capsule("Explained HTTP")} />);
    act(() => useSummaryFocus.getState().focus("m2"));
    expect(screen.queryByText(/State: Explained HTTP/)).toBeNull();
    fireEvent.click(screen.getByText("Summarised earlier turns to free space"));
    expect(screen.getByText(/State: Explained HTTP/)).toBeTruthy();
  });
});
