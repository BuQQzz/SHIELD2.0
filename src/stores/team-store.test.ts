import { beforeEach, describe, expect, it } from "vitest";
import { useTeamStore } from "./team-store";

const start = (runId: string) => ({
  type: "start" as const,
  runId,
  role: "coder" as const,
  task: "t",
});

beforeEach(() => {
  useTeamStore.setState({
    runsByConversation: {},
    turnStart: {},
    selectedRunId: null,
    followLatest: true,
  });
});

describe("team store turns", () => {
  it("marks where each message's delegations start, per conversation", () => {
    const { record, beginTurn } = useTeamStore.getState();
    beginTurn("c1");
    record("c1", start("h1"));
    record("c1", start("h2"));
    beginTurn("c1"); // a second message
    record("c1", start("h3"));
    beginTurn("c2");

    const { turnStart, runsByConversation } = useTeamStore.getState();
    expect(turnStart).toEqual({ c1: 2, c2: 0 });
    expect(
      runsByConversation.c1?.slice(turnStart.c1 ?? 0).map((r) => r.id)
    ).toEqual(["h3"]);
  });
});
