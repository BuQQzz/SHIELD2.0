/**
 * Whether a model should lead an agent team, from what the catalog knows
 * about it. A model that cannot run a team at all is off for good; one that
 * failed the check is off until the user accepts a caution; the rest are on.
 */

import { usesLlamaServer, type ModelOption } from "@/config/models";

export type TeamAvailability =
  /** Allowed: "good", or "untested" with nothing against it */
  | { state: "available"; untested: boolean; note?: string }
  /** The model failed the check: off unless the user accepts the caution */
  | { state: "caution"; note: string }
  /** The model's runtime cannot run a team */
  | { state: "unavailable"; reason: string };

type Candidate = Pick<ModelOption, "runtime" | "team"> | undefined | null;

export function teamAvailability(model: Candidate): TeamAvailability {
  // No model chosen yet: no opinion
  if (!model) return { state: "available", untested: false };
  if (!usesLlamaServer(model.runtime)) {
    return {
      state: "unavailable",
      reason:
        "A team needs a model that runs on SHIELD's llama-server (such as Bonsai or Qwen3 Coder); this one does not.",
    };
  }
  const known = model.team;
  if (known?.fit === "poor") return { state: "caution", note: known.note };
  if (known?.fit === "good") {
    return { state: "available", untested: false, note: known.note };
  }
  return {
    state: "available",
    untested: true,
    note: known?.note ?? "Not tried as a team yet.",
  };
}

/** The model card's line about teams: a short label and what it rests on */
export function teamLabel(model: Candidate): {
  label: string;
  title: string;
  tone: "good" | "neutral" | "bad";
} {
  const result = teamAvailability(model);
  if (result.state === "unavailable") {
    return {
      label: "Team: not available",
      title: result.reason,
      tone: "neutral",
    };
  }
  if (result.state === "caution") {
    return { label: "Team: not suited", title: result.note, tone: "bad" };
  }
  return result.untested
    ? {
        label: "Team: untested",
        title: result.note ?? "Not tried as a team yet.",
        tone: "neutral",
      }
    : {
        label: "Team: works",
        title: result.note ?? "Has run as a team.",
        tone: "good",
      };
}

/**
 * Team is on for the session but the model in use should not run it, and the
 * user has not accepted the caution for this model: turn it off
 */
export function shouldTurnTeamOff(
  conversation: { team?: boolean; teamOverride?: string } | null | undefined,
  modelId: string | undefined,
  availability: TeamAvailability
): boolean {
  if (!conversation?.team) return false;
  if (availability.state === "unavailable") return true;
  return (
    availability.state === "caution" && conversation.teamOverride !== modelId
  );
}
