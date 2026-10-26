import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { TOOL_LABEL_MS, WorkGroup } from "./WorkGroup";
import type { WorkItem } from "./turns";
import { useGenerationStore } from "@/store/generationStore";
import type { ChatProgress } from "@/types/electron";

const readNotes: WorkItem = {
  kind: "tool",
  message: {
    id: "r1",
    role: "user",
    content: "The Orchid meeting is at 4:15 PM.",
    timestamp: new Date(2026, 8, 26),
    toolResult: {
      tool: "read_text_file",
      serverName: "filesystem",
      success: true,
      target: "C:/work/notes.txt",
    },
  },
};

const writing = (generated: number): ChatProgress => ({
  phase: "writing",
  generated,
  tokensPerSecond: 40,
  contextUsed: 3000 + generated,
});

const header = (container: HTMLElement) =>
  container.querySelector("button > span.truncate") as HTMLElement;

afterEach(() => {
  vi.useRealTimers();
  useGenerationStore.setState({ progress: null });
});

describe("WorkGroup header", () => {
  it("keeps the thinking line on screen while its count climbs", () => {
    useGenerationStore.setState({ progress: writing(10) });
    const { container } = render(
      <WorkGroup items={[readNotes]} live={{ busy: true }} />
    );
    const line = header(container);
    expect(line.textContent).toContain("Thinking");

    // Gemma reports every token; the page takes one update per 150 ms.
    // Keyed by the whole text, each one restarted a fade and the header
    // stayed blank (2026-09-26)
    for (const generated of [20, 30, 40]) {
      act(() => useGenerationStore.setState({ progress: writing(generated) }));
      expect(header(container)).toBe(line);
    }
  });

  it("shows a new kind of work at once", () => {
    // It used to wait for the old line to fade out, and Gemma's work
    // changed faster than that
    useGenerationStore.setState({ progress: writing(10) });
    const { container, rerender } = render(
      <WorkGroup items={[readNotes]} live={{ busy: true }} />
    );
    rerender(
      <WorkGroup
        items={[readNotes]}
        live={{
          runningTool: {
            tool: "read_text_file",
            serverName: "filesystem",
            target: "C:/work/notes.txt",
          },
          busy: false,
        }}
      />
    );
    expect(header(container).textContent).toBe("Reading notes.txt…");
  });

  it("holds a finished tool's label long enough to read", () => {
    vi.useFakeTimers();
    const tool = {
      tool: "read_text_file",
      serverName: "filesystem",
      target: "C:/work/notes.txt",
    };
    const { container, rerender } = render(
      <WorkGroup
        items={[readNotes]}
        live={{ runningTool: tool, busy: false }}
      />
    );
    expect(header(container).textContent).toBe("Reading notes.txt…");

    // Done in ~30 ms; the model reads the result
    rerender(
      <WorkGroup items={[readNotes]} live={{ runningTool: null, busy: true }} />
    );
    expect(header(container).textContent).toBe("Reading notes.txt…");

    act(() => vi.advanceTimersByTime(TOOL_LABEL_MS));
    expect(header(container).textContent).toBe("Reading the conversation…");
  });

  it("lets the next tool replace a held label at once", () => {
    vi.useFakeTimers();
    const read = (target: string) => ({
      tool: "read_text_file",
      serverName: "filesystem",
      target,
    });
    const { container, rerender } = render(
      <WorkGroup
        items={[readNotes]}
        live={{ runningTool: read("C:/work/a.txt"), busy: false }}
      />
    );
    rerender(
      <WorkGroup items={[readNotes]} live={{ runningTool: null, busy: true }} />
    );
    rerender(
      <WorkGroup
        items={[readNotes]}
        live={{ runningTool: read("C:/work/b.txt"), busy: false }}
      />
    );
    expect(header(container).textContent).toBe("Reading b.txt…");
  });

  it("says what it did once the work is done", () => {
    const { container } = render(<WorkGroup items={[readNotes]} live={null} />);
    expect(header(container).textContent).toBe("Read notes.txt");
  });
});
