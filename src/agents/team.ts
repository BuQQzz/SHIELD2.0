/**
 * One team's shared state for a conversation: the notes every agent sees and
 * the hand-offs that let a PARTIAL run be continued. In memory for now: a
 * restart forgets them (the hand-offs are only useful while the task is live).
 */

import { FileClaims } from "./parallel";
import type { StoredHandoff } from "./types";

export const MAX_NOTES = 30;
export const MAX_NOTE_CHARS = 200;

export class TeamRun {
  /** Files running agents are changing (agents/parallel.ts) */
  readonly claims = new FileClaims();
  private notes: string[] = [];
  /**
   * Agents running now, with the notes their teammates sent them since
   * their last step (delivered with their next tool result)
   */
  private running = new Map<
    string,
    { role: string; task: string; inbox: string[] }
  >();
  private handoffs = new Map<string, StoredHandoff>();
  private counter = 0;
  private delegations = 0;
  /** PARTIAL hand-offs of this turn that no later run has continued, newest last */
  private openPartials: string[] = [];

  /**
   * A note from an agent; returns what was kept. `from` is the running agent
   * that wrote it; `to` names one teammate working at the same time (a role
   * or a run id), else every running teammate gets it. Agents that start
   * later see it among the team notes.
   */
  addNote(
    text: string,
    from?: { runId: string; role: string },
    to?: string
  ): string {
    const note = text.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
    if (!note) return "";
    const target = to?.trim().toLowerCase() || undefined;
    this.notes.push(
      from && target ? `${from.role} to ${target}: ${note}` : note
    );
    if (this.notes.length > MAX_NOTES) this.notes.shift();
    for (const [runId, agent] of this.running) {
      if (runId === from?.runId) continue;
      if (target && target !== runId && target !== agent.role) continue;
      agent.inbox.push(from ? `${from.role} (${from.runId}): ${note}` : note);
    }
    return note;
  }

  /** An agent started: teammates' notes now reach it while it works */
  join(runId: string, role: string, task: string): void {
    this.running.set(runId, { role, task, inbox: [] });
  }

  leave(runId: string): void {
    this.running.delete(runId);
  }

  /** The notes sent to a running agent since it last looked, emptied */
  takeInbox(runId: string): string[] {
    const agent = this.running.get(runId);
    if (!agent || agent.inbox.length === 0) return [];
    const notes = agent.inbox;
    agent.inbox = [];
    return notes;
  }

  /**
   * The teammates working at the same time as `runId`, for its first
   * message, or "" when it works alone
   */
  teammatesBlock(runId: string): string {
    const others = [...this.running].filter(([id]) => id !== runId);
    if (others.length === 0) return "";
    const lines = others.map(
      ([id, agent]) =>
        `- ${agent.role} (${id}): ${agent.task.replace(/\s+/g, " ").slice(0, 120)}`
    );
    return `Working at the same time as you:\n${lines.join("\n")}\nUse add_team_note with "to" set to one of them (its role or id) to tell it something it needs: a file you changed that it uses, a decision, a problem you found in its area. Their notes to you arrive with your tool results.`;
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
