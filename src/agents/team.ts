/**
 * One team's shared state for a conversation: the notes every agent sees and
 * the hand-offs that let a PARTIAL run be continued. In memory for now: a
 * restart forgets them (the hand-offs are only useful while the task is live).
 */

import type { StoredHandoff } from "./types";

export const MAX_NOTES = 30;
export const MAX_NOTE_CHARS = 200;

export class TeamRun {
  private notes: string[] = [];
  private handoffs = new Map<string, StoredHandoff>();
  private counter = 0;
  private delegations = 0;
  /** Delegations this turn that did not end DONE (PARTIAL, BLOCKED, FAILED) */
  private problems = 0;
  /** The orchestrator's last tool call this turn, to catch a plan-saving loop */
  private lastOrchestratorTool: string | null = null;
  /** PARTIAL hand-offs of this turn that no later run has continued, newest last */
  private openPartials: string[] = [];

  /** A note from an agent; returns what was kept */
  addNote(text: string): string {
    const note = text.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
    if (!note) return "";
    this.notes.push(note);
    if (this.notes.length > MAX_NOTES) this.notes.shift();
    return note;
  }

  /** The notes as a fresh agent is shown them, or "" when there are none */
  notesBlock(): string {
    return this.notes.length
      ? `Team notes so far:\n${this.notes.map((n) => `- ${n}`).join("\n")}`
      : "";
  }

  getNotes(): readonly string[] {
    return this.notes;
  }

  nextHandoffId(): string {
    this.counter += 1;
    return `h${this.counter}`;
  }

  saveHandoff(handoff: StoredHandoff): void {
    this.handoffs.set(handoff.id, handoff);
    const open = this.openPartials.indexOf(handoff.id);
    if (handoff.status === "PARTIAL" && handoff.finished) {
      if (open < 0) this.openPartials.push(handoff.id);
    } else if (open >= 0) {
      this.openPartials.splice(open, 1);
    }
  }

  /**
   * The newest PARTIAL hand-off of a role that nothing has continued yet.
   * The orchestrator was told to pass continue_from after a PARTIAL report
   * and wrote its own summary into the task instead (live, 2026-10-20), so
   * the fresh agent never got SHIELD's record of what was done.
   */
  openPartialFor(role: string): StoredHandoff | undefined {
    for (const id of [...this.openPartials].reverse()) {
      const handoff = this.handoffs.get(id);
      if (handoff?.role === role) return handoff;
    }
    return undefined;
  }

  /** A run continued this hand-off: it is no longer open */
  markContinued(id: string): void {
    this.openPartials = this.openPartials.filter((open) => open !== id);
  }

  getHandoff(id: string): StoredHandoff | undefined {
    return this.handoffs.get(id);
  }

  /** A new user message: the orchestrator may delegate again */
  beginTurn(): void {
    this.delegations = 0;
    this.openPartials = [];
    this.lastOrchestratorTool = null;
    this.problems = 0;
  }

  /** How a delegation ended, for deciding whether the turn's work is finished */
  recordOutcome(status: string): void {
    if (status !== "DONE") this.problems += 1;
  }

  /** At least one delegation this turn, and every one ended DONE */
  allDelegationsDone(): boolean {
    return this.delegations > 0 && this.problems === 0;
  }

  /**
   * Why the orchestrator may not make this call now, or null. A plan changes
   * nothing, and a small model took saving it for progress: live
   * (2026-10-20) one called update_plan seven times in a row and never
   * delegated, a nudge in the result notwithstanding. A second plan update
   * with no delegation in between is refused.
   */
  checkOrchestratorCall(tool: string): string | null {
    if (tool === "update_plan" && this.lastOrchestratorTool === "update_plan") {
      return "Not run: you updated the plan and have not delegated since. A plan does nothing by itself. Your next call must be delegate: give the step that is in progress to a coder, tester or reviewer.";
    }
    this.lastOrchestratorTool = tool;
    return null;
  }

  /** False once the turn's delegations are used up */
  countDelegation(limit: number): boolean {
    if (this.delegations >= limit) return false;
    this.delegations += 1;
    return true;
  }
}

const teams = new Map<string, TeamRun>();

export function teamFor(conversationId: string): TeamRun {
  let team = teams.get(conversationId);
  if (!team) {
    team = new TeamRun();
    teams.set(conversationId, team);
  }
  return team;
}

export function forgetTeam(conversationId: string): void {
  teams.delete(conversationId);
}
