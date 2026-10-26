/**
 * An agent's icon: one per role, with a status dot - blue and pulsing while
 * it works, then green, amber or red for how it ended.
 */

import type { AgentRole } from "@/agents/types";
import type { AgentRunView } from "@/agents/runView";
import { ROLE_LOOKS, STATUS_LOOK } from "./agentLooks";
import { cn } from "@/lib/utils";

interface AgentIconProps {
  role: AgentRole | "orchestrator";
  status?: AgentRunView["status"];
  size?: "sm" | "md";
  className?: string;
}

export function AgentIcon({
  role,
  status,
  size = "md",
  className,
}: AgentIconProps) {
  const { Icon, tone, label } = ROLE_LOOKS[role];
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-md",
        size === "md" ? "h-8 w-8" : "h-6 w-6",
        tone,
        className
      )}
      title={label}
    >
      <Icon className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
      {status && (
        <span
          aria-label={STATUS_LOOK[status].label}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
            STATUS_LOOK[status].dot
          )}
        />
      )}
    </span>
  );
}
