import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { TeamPanel } from "./TeamPanel";
import { useTeamStore } from "@/stores/team-store";
import type { AgentEvent } from "@/agents/events";

const CONV = "conv-1";
const record = (...events: AgentEvent[]) =>
  act(() =>
    events.forEach((event) => useTeamStore.getState().record(CONV, event))
  );

const coder: AgentEvent = {
  type: "start",
  runId: "h1",
  role: "coder",
  task: "Fix the bug in calc.py",
};
const tester: AgentEvent = {
  type: "start",
  runId: "h2",
  role: "tester",
  task: "Run the tests",
};
const end = (
  runId: string,
  status: "DONE" | "PARTIAL" = "DONE"
): Extract<AgentEvent, { type: "end" }> => ({
  type: "end",
  runId,
  status,
  summary: `${runId} summary`,
  workLines: ["- files: calc.py edited"],
  steps: 1,
  contextPercent: 30,
});

beforeEach(() => {
  localStorage.clear();
  useTeamStore.setState({
    runsByConversation: {},
    selectedRunId: null,
    followLatest: true,
    collapsed: false,
  });
});
afterEach(cleanup);

const panel = (teamMode = true) =>
  render(<TeamPanel conversationId={CONV} teamMode={teamMode} />);

describe("TeamPanel", () => {
  it("is not there outside Team mode until an agent has run", () => {
    const { container } = panel(false);
    expect(container.innerHTML).toBe("");
    record(coder);
    expect(screen.getByRole("complementary", { name: "Team" })).toBeTruthy();
  });

  it("explains itself in Team mode before any agent starts", () => {
    panel();
    expect(screen.getByText(/No agents yet/)).toBeTruthy();
  });

  it("lists each agent with its role, state and task, and opens the one that starts", () => {
    panel();
    record(coder, {
      type: "tool",
      runId: "h1",
      callId: "h1-1",
      tool: "read_text_file",
      target: "/p/calc.py",
    });
    const row = screen.getByRole("button", {
      name: /Coder.*Working.*Fix the bug/,
    });
    expect(row).toBeTruthy();
    expect(screen.getByText("1 working")).toBeTruthy();
    // a newly started agent is opened on its own: its task and live step show
    const detail = screen.getByTestId("agent-detail");
    expect(within(detail).getByText(/Fix the bug in calc.py/)).toBeTruthy();
    expect(within(detail).getByText(/Reading calc.py/)).toBeTruthy();
  });

  it("shows what the agent says, its tools with their output, and how it ended", () => {
    panel();
    record(
      coder,
      { type: "reply", runId: "h1", text: "Found it: line 2 subtracts." },
      {
        type: "tool",
        runId: "h1",
        callId: "h1-1",
        tool: "edit_file",
        target: "/p/calc.py",
      },
      {
        type: "result",
        runId: "h1",
        callId: "h1-1",
        ok: true,
        refused: false,
        text: "@@ -1 +1 @@ diff",
      },
      end("h1")
    );
    const detail = screen.getByTestId("agent-detail");
    expect(
      within(detail).getByText("Found it: line 2 subtracts.")
    ).toBeTruthy();
    fireEvent.click(within(detail).getByText(/Edited calc.py/));
    expect(within(detail).getByText("@@ -1 +1 @@ diff")).toBeTruthy();
    expect(within(detail).getByText("h1 summary")).toBeTruthy();
    expect(within(detail).getByText("Checked by SHIELD")).toBeTruthy();
    expect(within(detail).getByText("- files: calc.py edited")).toBeTruthy();
    expect(within(detail).getByText("Done")).toBeTruthy();
  });

  it("shows a refused call as not allowed, and a hand-over as such", () => {
    panel();
    record(
      { ...tester },
      {
        type: "tool",
        runId: "h2",
        callId: "h2-1",
        tool: "edit_file",
        target: "/p/add.sh",
      },
      {
        type: "result",
        runId: "h2",
        callId: "h2-1",
        ok: false,
        refused: true,
        text: "Not run: tester may only change test files",
      },
      { type: "checkpoint", runId: "h2", percent: 72 },
      { ...end("h2", "PARTIAL"), reason: "its context reached 70%" }
    );
    expect(screen.getByText(/not allowed/)).toBeTruthy();
    expect(screen.getByText(/reached the checkpoint/)).toBeTruthy();
    expect(screen.getByText("its context reached 70%")).toBeTruthy();
    expect(screen.getAllByText("Handed over").length).toBeGreaterThan(0);
  });

  it("streams what the model is writing, or says it is thinking", () => {
    panel();
    record(coder, { type: "session", runId: "h1", sessionId: "agent-1" });
    expect(screen.getByText("Thinking")).toBeTruthy();
    act(() => {
      useTeamStore.getState().streamToken("agent-1", "Let me ");
      useTeamStore.getState().streamToken("agent-1", "read it");
    });
    expect(screen.getByText("Let me read it")).toBeTruthy();
    expect(screen.queryByText("Thinking")).toBeNull();
  });

  it("lets the user open another agent, and stops following the newest until asked", () => {
    panel();
    record(coder, end("h1"), tester);
    // following: the new tester is open
    expect(
      within(screen.getByTestId("agent-detail")).getByText(/Run the tests/)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Coder/ }));
    expect(
      within(screen.getByTestId("agent-detail")).getByText(/Fix the bug/)
    ).toBeTruthy();

    // a later agent no longer steals the view
    record({ type: "start", runId: "h3", role: "reviewer", task: "Review it" });
    expect(
      within(screen.getByTestId("agent-detail")).getByText(/Fix the bug/)
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Follow the agent that is working" })
    );
    expect(
      within(screen.getByTestId("agent-detail")).getByText(/Review it/)
    ).toBeTruthy();
  });

  it("goes back to the list", () => {
    panel();
    record(coder);
    fireEvent.click(screen.getByRole("button", { name: "Back to the agents" }));
    expect(screen.queryByTestId("agent-detail")).toBeNull();
    expect(screen.getByText("Pick an agent to watch it work.")).toBeTruthy();
  });

  it("collapses to a rail of icons, remembers it, and opens an agent from the rail", () => {
    panel();
    record(coder, end("h1"), tester);
    fireEvent.click(screen.getByRole("button", { name: "Collapse the team" }));

    expect(screen.queryByText("Fix the bug in calc.py")).toBeNull();
    expect(localStorage.getItem("shield.teamPanel.collapsed")).toBe("1");
    const rail = screen.getByRole("complementary", { name: "Team" });
    expect(
      within(rail).getByRole("button", { name: "Coder, Done" })
    ).toBeTruthy();
    expect(
      within(rail).getByRole("button", { name: "Tester, Working" })
    ).toBeTruthy();

    fireEvent.click(within(rail).getByRole("button", { name: "Coder, Done" }));
    expect(
      within(screen.getByTestId("agent-detail")).getByText(/Fix the bug/)
    ).toBeTruthy();
    expect(localStorage.getItem("shield.teamPanel.collapsed")).toBe("0");
  });

  it("keeps each conversation's agents apart", () => {
    panel();
    record(coder);
    cleanup();
    render(<TeamPanel conversationId="another" teamMode />);
    expect(screen.getByText(/No agents yet/)).toBeTruthy();
  });
});
