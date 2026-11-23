/**
 * Run rules: how much SHIELD steers a model through a long turn
 *
 * The turn guards (a progress check every 10 rounds, "otherwise answer the
 * user now" after every result, "explain the failure") were made for small
 * local models that drift, loop or forget the task. Hosted models seldom
 * need them: in 18 runs on six flash models (easy, bug-fix and 25-test
 * builds, 2026-11-22) no guard was ever needed, and on hour-long tasks the
 * guards are what would stop them. The user steers a hosted model instead
 * (Enter while it works: handlers/steer.ts) or presses Stop.
 *
 * Only steering differs. Safety is the same for every model: permission
 * prompts, path checks, memory rules, results as untrusted data, trash
 * instead of delete, and the identical-call guard.
 */

import { isRemoteModelId } from "../services/remote/remoteEndpoint";

export type RunProfile = "cloud" | "local";

export interface RunRules {
  profile: RunProfile;
  /** Rounds between progress checks in a solo turn; undefined = none */
  progressCheckEvery?: number;
  /**
   * After each round's results, tell the model to answer now unless it
   * needs another tool, and to explain any failure. Off for cloud: a model
   * told after every failing test to "explain the failure" stops to explain.
   */
  nudgeEachRound: boolean;
}

/** A local solo turn's tool rounds are checked for progress this often */
export const PROGRESS_CHECK_ROUNDS = 10;

export function runProfileFor(modelId: string | undefined | null): RunProfile {
  return modelId && isRemoteModelId(modelId) ? "cloud" : "local";
}

export function runRulesFor(modelId: string | undefined | null): RunRules {
  return runProfileFor(modelId) === "cloud"
    ? { profile: "cloud", nudgeEachRound: false }
    : {
        profile: "local",
        progressCheckEvery: PROGRESS_CHECK_ROUNDS,
        nudgeEachRound: true,
      };
}
