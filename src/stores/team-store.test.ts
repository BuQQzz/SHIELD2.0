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

  it("puts saved runs back once, never over runs that are live, and keeps them out of the next plan", () => {
    const saved = [
      {
        id: "h1",
        role: "coder" as const,
        task: "t",
        status: "DONE" as const,
        steps: [],
        live: "",
        contextPercent: 0,
        checkpointed: false,
        workLines: [],
        startedAt: 1,
      },
    ];
    const { hydrate, record } = useTeamStore.getState();
    hydrate("c1", saved);
    expect(useTeamStore.getState().runsByConversation.c1).toEqual(saved);
    expect(useTeamStore.getState().turnStart.c1).toBe(1);

    // a second hydrate (the conversation list reloading) changes nothing
    hydrate("c1", [{ ...saved[0]!, id: "other" }]);
    expect(
      useTeamStore.getState().runsByConversation.c1?.map((r) => r.id)
    ).toEqual(["h1"]);

    // live runs are never replaced by saved ones
    record("c2", start("live"));
    hydrate("c2", saved);
    expect(
      useTeamStore.getState().runsByConversation.c2?.map((r) => r.id)
    ).toEqual(["live"]);

    // nothing saved, nothing to do
    hydrate("c3", []);
    expect(useTeamStore.getState().runsByConversation.c3).toBeUndefined();
  });
});
