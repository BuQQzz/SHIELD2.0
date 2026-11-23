/**
 * What a hosted model is doing before it writes, with how long it has been
 * at it. It reports no reading progress and may think for minutes without
 * streaming the thinking: "Reading the conversation…" for all of that read
 * as stuck (2026-11-16). So: sending, then thinking or working on the tool
 * results, with the seconds, and a word after a long wait that this is
 * the model thinking, not a hang.
 */

import { useElapsed, waitText } from "@/lib/hostedWait";

export function HostedWaitLabel({
  provider,
  afterTools,
  since,
  retry,
}: {
  provider: string;
  afterTools: boolean;
  since: number;
  retry?: { attempt: number; reason: string };
}) {
  const seconds = useElapsed(since);
  return <>{waitText(provider, afterTools, seconds, retry)}</>;
}
