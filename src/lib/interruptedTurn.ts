/**
 * A turn SHIELD closed in the middle of
 *
 * opencode picks a run up again after a restart (research, 2026-11-23).
 * Here a turn marks its chat while it works (Conversation.turnRunning, saved
 * with the chat as the turn goes); a clean end, Stop or an error clears it.
 * A chat opened with the mark of an earlier run of SHIELD was cut off by
 * SHIELD closing or crashing, and the chat offers to carry on.
 */

/** This run of SHIELD: a mark from another run is a turn that was cut off */
export const APP_RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function interrupted(turnRunning: string | undefined): boolean {
  return Boolean(turnRunning) && turnRunning !== APP_RUN;
}

/** Sent to the model with "Continue" after a restart */
export const RESUME_NOTE =
  "[SHIELD: SHIELD closed in the middle of your last task and has been restarted. Anything you started that kept running (a server, a watcher) has stopped. Check where the work stands, then carry on with the task until it is done.]";
