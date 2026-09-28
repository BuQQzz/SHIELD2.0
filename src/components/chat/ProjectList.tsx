/**
 * Projects in the sidebar: each a collapsible group of its chats or code
 * sessions (the view's kind), with a button to start a new one in it.
 * Conversations under no project are listed below, by the Sidebar.
 */

import {
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConversationMetadata, Project } from "@/types/electron";
import type { ConversationKind } from "@/types/conversation";
import { cn } from "@/lib/utils";
import { folderName, inProject } from "@/lib/sessions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConversationList } from "./ConversationList";

const COLLAPSED_KEY = "shield.collapsedProjects";

/** Which projects the user folded away; a convenience, so it may be lost */
function loadCollapsed(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(ids: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Private window or blocked storage: folding just is not remembered
  }
}

interface ProjectListProps {
  projects: Project[];
  /** The view's conversations (one kind) */
  conversations: ConversationMetadata[];
  kind: ConversationKind;
  currentConversationId?: string | null;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
  onMove: (conversationId: string, projectId: string | null) => void;
  onNewInProject: (projectId: string) => void;
  onRename: (projectId: string, name: string) => void;
  onChooseFolder: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

export function ProjectList({
  projects,
  conversations,
  kind,
  currentConversationId,
  onSelect,
  onDelete,
  onMove,
  onNewInProject,
  onRename,
  onChooseFolder,
  onDeleteProject,
}: ProjectListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const noun = kind === "code" ? "session" : "chat";

  useEffect(() => {
    if (renamingId) renameRef.current?.select();
  }, [renamingId]);

  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    saveCollapsed(next);
  };

  const finishRename = (id: string, value: string) => {
    setRenamingId(null);
    const name = value.trim();
    if (name) onRename(id, name);
  };

  return (
    <div className="space-y-1 pb-2">
      {projects.map((project) => {
        const sessions = inProject(conversations, project.id);
        const open = !collapsed.has(project.id);
        const Icon = open ? FolderOpen : Folder;
        return (
          <section key={project.id}>
            <div
              className="group flex h-8 items-center gap-1 rounded-md pl-1 pr-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              title={project.folder ?? project.name}
            >
              <button
                onClick={() => toggle(project.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    open && "rotate-90"
                  )}
                />
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {renamingId === project.id ? (
                  <input
                    ref={renameRef}
                    defaultValue={project.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => finishRename(project.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        finishRename(project.id, e.currentTarget.value);
                      }
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="h-6 min-w-0 flex-1 rounded bg-accent/60 px-1.5 text-[13px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-signal/60"
                  />
                ) : (
                  <span className="truncate font-medium text-foreground/90">
                    {project.name}
                  </span>
                )}
                {kind === "code" &&
                  project.folder &&
                  renamingId !== project.id && (
                    <span className="truncate text-[11px] text-muted-foreground/60">
                      {folderName(project.folder) !== project.name
                        ? folderName(project.folder)
                        : ""}
                    </span>
                  )}
                <span className="ml-auto pl-1 font-instrument text-[10px] text-muted-foreground/50 group-hover:hidden">
                  {sessions.length || ""}
                </span>
              </button>
              <button
                onClick={() => onNewInProject(project.id)}
                title={`New ${noun} in ${project.name}`}
                className="hidden rounded p-1 hover:bg-accent group-hover:block"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    title="Project options"
                    className="hidden rounded p-1 hover:bg-accent group-hover:block data-[state=open]:block"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    className="text-[13px]"
                    onSelect={() => onNewInProject(project.id)}
                  >
                    New {noun} here
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-[13px]"
                    onSelect={() => setRenamingId(project.id)}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-[13px]"
                    onSelect={() => onChooseFolder(project.id)}
                  >
                    {project.folder ? "Change folder…" : "Set folder…"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-[13px] text-destructive focus:text-destructive"
                    onSelect={() => setConfirmDelete(project.id)}
                  >
                    Delete project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {confirmDelete === project.id && (
              <div className="mx-1 my-1 rounded-md bg-destructive/10 px-2 py-1.5 text-xs">
                <p className="text-destructive">
                  Delete "{project.name}"? Its chats and sessions stay, outside
                  any project.
                </p>
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="rounded px-2 py-0.5 hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDelete(null);
                      onDeleteProject(project.id);
                    }}
                    className="rounded bg-destructive/80 px-2 py-0.5 text-destructive-foreground hover:bg-destructive"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {open && (
              <div className="ml-3 border-l border-border/50 pl-1.5">
                <ConversationList
                  flat
                  conversations={sessions}
                  currentConversationId={currentConversationId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  projects={projects}
                  onMove={onMove}
                  emptyText={`No ${noun}s yet`}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
