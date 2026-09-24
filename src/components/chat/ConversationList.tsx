import type { ConversationMetadata } from "@/types/electron";
import { Check, Trash2, X } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { compactAge, dateGroup } from "./conversationDates";

interface ConversationListProps {
  conversations: ConversationMetadata[];
  currentConversationId?: string | null;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
}

export const ConversationList = memo(function ConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onDelete,
}: ConversationListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const now = new Date();
    const byGroup = new Map<string, ConversationMetadata[]>();
    for (const conversation of conversations) {
      const label = dateGroup(new Date(conversation.updatedAt), now);
      byGroup.set(label, [...(byGroup.get(label) ?? []), conversation]);
    }
    return [...byGroup.entries()];
  }, [conversations]);

  if (conversations.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        No chats yet
      </p>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      {groups.map(([label, items]) => (
        <section key={label}>
          <h3 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            {label}
          </h3>
          <ul className="space-y-px">
            {items.map((conversation) => {
              const active = currentConversationId === conversation.id;
              const confirming = deletingId === conversation.id;
              return (
                <li key={conversation.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !confirming && onSelect(conversation.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !confirming) {
                        onSelect(conversation.id);
                      }
                    }}
                    title={conversation.preview || conversation.title}
                    className={cn(
                      "group relative flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      confirming && "bg-destructive/10"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-signal" />
                    )}
                    {confirming ? (
                      <>
                        <span className="flex-1 truncate text-destructive">
                          Delete this chat?
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(conversation.id);
                            setDeletingId(null);
                          }}
                          className="rounded p-1 text-destructive hover:bg-destructive/15"
                          title="Delete"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(null);
                          }}
                          className="rounded p-1 hover:bg-accent"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate">
                          {conversation.title}
                        </span>
                        <span className="font-instrument text-[10px] text-muted-foreground/70 group-hover:hidden">
                          {compactAge(new Date(conversation.updatedAt))}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(conversation.id);
                          }}
                          className="hidden rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive group-hover:block"
                          title="Delete chat"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
});
