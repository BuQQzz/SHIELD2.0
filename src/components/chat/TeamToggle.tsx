/**
 * Team toggle: a Code session can be led by an orchestrator that hands work
 * to a coder, a tester and a reviewer instead of doing it itself. A
 * per-session choice, next to the permission mode it works under.
 *
 * A model that cannot run a team has it off; one that failed the check has
 * it off until the user accepts a caution (remembered for that model).
 */

import { useState } from "react";
import { Users } from "lucide-react";
import { useConversationStore } from "@/stores/conversation-store";
import type { TeamAvailability } from "@/agents/teamFit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TeamToggleProps {
  availability?: TeamAvailability;
  modelId?: string;
  modelName?: string;
}

const AVAILABLE: TeamAvailability = { state: "available", untested: false };

export function TeamToggle({
  availability = AVAILABLE,
  modelId,
  modelName,
}: TeamToggleProps) {
  const stored = useConversationStore(
    (state) => state.currentConversation?.team ?? false
  );
  const override = useConversationStore(
    (state) => state.currentConversation?.teamOverride
  );
  const updateConversation = useConversationStore(
    (state) => state.updateConversation
  );
  const [asking, setAsking] = useState(false);

  const unavailable = availability.state === "unavailable";
  const needsCaution = availability.state === "caution" && override !== modelId;
  const team = stored && !unavailable && !needsCaution;

  const title = unavailable
    ? `Team is off: ${availability.reason}`
    : needsCaution
      ? `Team is off for ${modelName ?? "this model"}: it is not suited to it. Click to read why and turn it on anyway.`
      : team
        ? "Team on: an orchestrator hands the work to a coder, tester and reviewer. Click to work alone."
        : availability.state === "available" && availability.untested
          ? "Team off. Turn on to have an orchestrator hand work to a coder, tester and reviewer. Not tried with this model yet."
          : "Team off. Turn on to have an orchestrator hand work to a coder, tester and reviewer.";

  const onClick = () => {
    if (unavailable) return;
    if (needsCaution) {
      setAsking(true);
      return;
    }
    updateConversation({ team: !team });
  };

  return (
    <>
      <button
        type="button"
        aria-pressed={team}
        aria-disabled={unavailable}
        onClick={onClick}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
          unavailable
            ? "cursor-not-allowed text-muted-foreground/50"
            : "hover:bg-accent hover:text-foreground"
        } ${team ? "bg-accent text-foreground" : "text-muted-foreground"}`}
        title={title}
      >
        <Users className="h-3.5 w-3.5" />
        Team
      </button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Team is not suited to {modelName ?? "this model"}
            </DialogTitle>
            <DialogDescription>
              {availability.state === "caution" ? availability.note : ""} It may
              fail to hand out work or stop partway. You can turn it on anyway;
              SHIELD will remember that for this model.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                updateConversation({ team: true, teamOverride: modelId });
                setAsking(false);
              }}
            >
              Turn on anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
