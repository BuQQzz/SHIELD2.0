/**
 * Team toggle: a Code session can be led by an orchestrator that hands work
 * to a coder, a tester and a reviewer instead of doing it itself. A
 * per-session choice, next to the permission mode it works under.
 */

import { Users } from "lucide-react";
import { useConversationStore } from "@/stores/conversation-store";

export function TeamToggle() {
  const team = useConversationStore(
    (state) => state.currentConversation?.team ?? false
  );
  const updateConversation = useConversationStore(
    (state) => state.updateConversation
  );

  return (
    <button
      type="button"
      aria-pressed={team}
      onClick={() => updateConversation({ team: !team })}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-foreground ${
        team ? "bg-accent text-foreground" : "text-muted-foreground"
      }`}
      title={
        team
          ? "Team on: an orchestrator hands the work to a coder, tester and reviewer. Click to work alone."
          : "Team off. Turn on to have an orchestrator hand work to a coder, tester and reviewer (needs a llama-server model)."
      }
    >
      <Users className="h-3.5 w-3.5" />
      Team
    </button>
  );
}
