import type { ConversationMetadata, Project } from "@/types/electron";
import { Check, FolderInput, Trash2, X } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { compactAge, dateGroup } from "./conversationDates";

interface ConversationListProps {
  conversations: ConversationMetadata[];
  currentConversationId?: string | null;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  /** One flat list, without date headings (inside a project) */
  flat?: boolean;
  /** Shown when there is nothing to list */
  emptyText?: string;
  /** Projects a conversation can be moved into */
  projects?: Project[];
  onMove?: (conversationId: string, projectId: string | null) => void;
}

/** "Move to project": each project, and out of any */
function MoveMenu({
  conversation,
  projects,
  onMove,
}: {
  conversation: ConversationMetadata;
  projects: Project[];
  onMove: (conversationId: string, projectId: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="hidden rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground group-hover:block data-[state=open]:block"
          title="Move to project"
        >
          <FolderInput className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel className="text-xs">
          Move to project
        </DropdownMenuLabel>
        {projects.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No projects yet
          </p>
        )}
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onSelect={() => onMove(conversation.id, project.id)}
            className="text-[13px]"
          >
            <span className="flex-1 truncate">{project.name}</span>
            {conversation.projectId === project.id && (
              <Check className="h-3.5 w-3.5" />
            )}
          </DropdownMenuItem>
        ))}
        {conversation.projectId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onMove(conversation.id, null)}
              className="text-[13px]"
            >
              Remove from project
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ConversationList = memo(function ConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onDelete,
  flat = false,
  emptyText = "No chats yet",
  projects,
  onMove,
}: ConversationListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groups = useMemo<[string, ConversationMetadata[]][]>(() => {
    if (flat) return [["", conversations]];
    const now = new Date();
    const byGroup = new Map<string, ConversationMetadata[]>();
    for (const conversation of conversations) {
      const label = dateGroup(new Date(conversation.updatedAt), now);
      byGroup.set(label, [...(byGroup.get(label) ?? []), conversation]);
    }
    return [...byGroup.entries()];
  }, [conversations, flat]);

  if (conversations.length === 0) {
    return (
      <p
        className={cn(
          "px-2 text-xs text-muted-foreground",
          flat ? "py-1.5" : "py-6 text-center"
        )}
      >
        {emptyText}
      </p>
    );
  }

  return (
    <div className={cn(flat ? "pb-1" : "space-y-3 pb-2")}>
      {groups.map(([label, items]) => (
        <section key={label || "all"}>
          {label && (
            <h3 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              {label}
            </h3>
          )}
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
                      "group relative flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[13px] transition-colors",
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
                        {projects && onMove && (
                          <MoveMenu
                            conversation={conversation}
                            projects={projects}
                            onMove={onMove}
                          />
                        )}
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
