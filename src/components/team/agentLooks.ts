/**
 * How each agent role and run state looks in the Team panel: icon, tint and
 * wording. Kept apart from the components so they stay refresh-friendly.
 */

import { CodeXml, FlaskConical, ScanSearch, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AgentRole } from "@/agents/types";
import type { AgentRunView } from "@/agents/runView";

export interface RoleLook {
  label: string;
  Icon: LucideIcon;
  /** Tint for the icon's badge; readable in light and dark */
  tone: string;
}

export const ROLE_LOOKS: Record<AgentRole | "orchestrator", RoleLook> = {
  orchestrator: {
    label: "Orchestrator",
    Icon: Workflow,
    tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  coder: {
    label: "Coder",
    Icon: CodeXml,
    tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  tester: {
    label: "Tester",
    Icon: FlaskConical,
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  reviewer: {
    label: "Reviewer",
    Icon: ScanSearch,
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
};

export const STATUS_LOOK: Record<
  AgentRunView["status"],
  { label: string; dot: string; text: string }
> = {
  running: {
    label: "Working",
    dot: "bg-sky-500 animate-pulse",
    text: "text-sky-600 dark:text-sky-400",
  },
  DONE: {
    label: "Done",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  PARTIAL: {
    label: "Handed over",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  BLOCKED: {
    label: "Blocked",
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
  },
  FAILED: {
    label: "Failed",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  },
};
