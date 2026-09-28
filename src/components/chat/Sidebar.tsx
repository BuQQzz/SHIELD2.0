"use client";

import {
  Blocks,
  Code2,
  FolderPlus,
  Library,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useChatStore, type AppView } from "@/stores/chat-store";
import { useConversationStore } from "@/stores/conversation-store";
import { SidebarModelPicker } from "@/components/shell/SidebarModelPicker";
import type { ModelOption } from "@/config/models";
import { cn } from "@/lib/utils";
import { kindOf, ofKind, outsideProjects, viewKind } from "@/lib/sessions";
import type { ConversationKind } from "@/types/conversation";
import { useProjectStore } from "@/stores/project-store";
import { ConversationList } from "./ConversationList";
import { ProjectList } from "./ProjectList";

interface SidebarProps {
  /**
   * A new chat, or a new Code session (which asks for its folder unless its
   * project has one), optionally in a project
   */
  onNewChat?: (kind: ConversationKind, projectId?: string) => void;
  onNewFromTemplate?: () => void;
  onOpenSettings?: () => void;
  models: ModelOption[];
  currentModelId?: string;
  isModelLoading: boolean;
  isModelLoaded: boolean;
  onModelSelect: (model: ModelOption) => void;
}

interface NavItem {
  view: AppView;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

const NAV: NavItem[] = [
  { view: "chat", label: "Chat", icon: MessageSquare },
  { view: "code", label: "Code", icon: Code2 },
  { view: "library", label: "Model Library", icon: Library },
  { view: "plugins", label: "Plugins", icon: Blocks },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
      {children}
    </h2>
  );
}

export function Sidebar({
  onNewChat,
  onNewFromTemplate,
  onOpenSettings,
  models,
  currentModelId,
  isModelLoading,
  isModelLoaded,
  onModelSelect,
}: SidebarProps) {
  const {
    sidebarOpen,
    sidebarCollapsed: collapsed,
    toggleSidebarCollapse,
    activeView,
    setActiveView,
  } = useChatStore();
  const {
    conversations,
    currentConversation,
    loadConversationList,
    loadConversation,
    deleteConversation,
    searchConversations,
    moveToProject,
  } = useConversationStore();
  const {
    projects,
    loadProjects,
    createProject,
    updateProject,
    deleteProject,
  } = useProjectStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  /** Naming a new chat project inline */
  const [naming, setNaming] = useState(false);

  // Load conversations and projects on mount
  useEffect(() => {
    loadConversationList();
    void loadProjects();
  }, [loadConversationList, loadProjects]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    if (value.trim()) {
      searchConversations(value);
    } else {
      loadConversationList();
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    if (searchInput) handleSearch("");
  };

  // The kind of session the list shows: the view's, or from the library and
  // plugins, the open conversation's
  const sessionKind = viewKind(activeView) ?? kindOf(currentConversation);
  const sessions = ofKind(conversations, sessionKind);
  const code = sessionKind === "code";

  const handleNewChat = () => {
    if (!viewKind(activeView)) setActiveView(sessionKind);
    onNewChat?.(sessionKind);
  };

  const handleSelectConversation = (conversationId: string) => {
    loadConversation(conversationId);
    setActiveView(sessionKind);
  };

  const handleNewInProject = (projectId: string) => {
    if (!viewKind(activeView)) setActiveView(sessionKind);
    onNewChat?.(sessionKind, projectId);
  };

  // A code project is a folder: pick it, and start a session there. A chat
  // project is a name.
  const handleNewProject = async () => {
    if (!code) {
      setNaming(true);
      return;
    }
    const folder = await window.electronAPI.mcp.chooseWorkspace();
    if (!folder) return;
    const project = await createProject("", folder);
    if (project) handleNewInProject(project.id);
  };

  const handleChooseProjectFolder = async (projectId: string) => {
    const folder = await window.electronAPI.mcp.chooseWorkspace();
    if (folder) await updateProject(projectId, { folder });
  };

  const finishNaming = async (value: string) => {
    setNaming(false);
    if (value.trim()) await createProject(value);
  };

  const searching = searchInput.trim().length > 0;
  const loose = outsideProjects(sessions, projects);

  if (!sidebarOpen) return null;

  return (
    <div className="flex h-full flex-col border-r border-border/60 bg-sidebar/40">
      {/* ── Top half: brand, actions, navigation, model ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className={cn(
            "flex h-14 shrink-0 items-center",
            collapsed ? "justify-center" : "justify-between pl-4 pr-2"
          )}
        >
          {!collapsed && (
            <img
              src="./shield-logo.png"
              alt="SHIELD"
              className="h-9 w-auto object-contain"
            />
          )}
          <button
            onClick={toggleSidebarCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* New chat */}
        <div className={cn("flex gap-1.5 pb-4", collapsed ? "px-3" : "px-3")}>
          <button
            onClick={handleNewChat}
            title={code ? "New code session in a project folder" : "New chat"}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
              collapsed && "px-0"
            )}
          >
            <Plus className="h-4 w-4" />
            {!collapsed && (code ? "New session" : "New chat")}
          </button>
          {!collapsed && !code && onNewFromTemplate && (
            <button
              onClick={onNewFromTemplate}
              title="New chat from a template"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="px-3 pb-4">
          {!collapsed && <SectionLabel>Workspace</SectionLabel>}
          <ul className="space-y-0.5">
            {NAV.map(({ view, label, icon: Icon, soon }) => {
              const active = activeView === view;
              return (
                <li key={view}>
                  <button
                    disabled={soon}
                    onClick={() => setActiveView(view)}
                    title={collapsed ? label : soon ? "Coming soon" : ""}
                    className={cn(
                      "relative flex h-9 w-full items-center gap-3 rounded-lg text-sm transition-colors",
                      collapsed ? "justify-center" : "px-2.5",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      soon &&
                        "cursor-default opacity-50 hover:bg-transparent hover:text-muted-foreground"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-nav-active"
                        className="absolute inset-0 rounded-lg bg-accent"
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 38,
                        }}
                      />
                    )}
                    <Icon
                      className={cn(
                        "relative h-4 w-4 shrink-0",
                        active && "text-signal"
                      )}
                    />
                    {!collapsed && (
                      <>
                        <span className="relative flex-1 text-left">
                          {label}
                        </span>
                        {soon && (
                          <span className="relative rounded border border-border/80 px-1 font-instrument text-[9px] uppercase tracking-wider">
                            Soon
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Model */}
        <div className="px-3 pb-3">
          {!collapsed && <SectionLabel>Model</SectionLabel>}
          <SidebarModelPicker
            models={models}
            currentModelId={currentModelId}
            isLoading={isModelLoading}
            isModelLoaded={isModelLoaded}
            collapsed={collapsed}
            onSelect={(model) => {
              onModelSelect(model);
              if (!viewKind(activeView)) setActiveView(sessionKind);
            }}
            onOpenLibrary={() => setActiveView("library")}
          />
        </div>
      </div>

      {/* ── Bottom half: chats ── */}
      {!collapsed ? (
        <div className="flex h-1/2 min-h-0 shrink-0 flex-col border-t border-border/60">
          <div className="flex h-10 shrink-0 items-center gap-1 pl-5 pr-3">
            {searchOpen ? (
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder={code ? "Search sessions" : "Search chats"}
                  value={searchInput}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                  className="h-7 w-full rounded-md bg-accent/60 pl-7 pr-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-signal/60"
                />
              </div>
            ) : (
              <span className="flex-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                {code ? "Sessions" : "Chats"}
                <span className="ml-1.5 font-instrument normal-case tracking-normal text-muted-foreground/50">
                  {sessions.length}
                </span>
              </span>
            )}
            {!searchOpen && (
              <button
                onClick={() => void handleNewProject()}
                title={
                  code
                    ? "New project: pick its folder"
                    : "New project for chats"
                }
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              title={
                searchOpen
                  ? "Close search"
                  : code
                    ? "Search sessions"
                    : "Search chats"
              }
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {searchOpen ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Scroll area; fades out at the top edge */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 [mask-image:linear-gradient(to_bottom,transparent,black_12px)]">
            {naming && (
              <input
                autoFocus
                placeholder="Project name"
                onBlur={(e) => void finishNaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    void finishNaming(e.currentTarget.value);
                  if (e.key === "Escape") setNaming(false);
                }}
                className="mb-1 h-8 w-full rounded-md bg-accent/60 px-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-signal/60"
              />
            )}
            {searching || projects.length === 0 ? (
              <ConversationList
                conversations={sessions}
                currentConversationId={currentConversation?.id}
                onSelect={handleSelectConversation}
                onDelete={deleteConversation}
                projects={projects.length ? projects : undefined}
                onMove={moveToProject}
              />
            ) : (
              <>
                <ProjectList
                  projects={projects}
                  conversations={sessions}
                  kind={sessionKind}
                  currentConversationId={currentConversation?.id}
                  onSelect={handleSelectConversation}
                  onDelete={deleteConversation}
                  onMove={moveToProject}
                  onNewInProject={handleNewInProject}
                  onRename={(id, name) => void updateProject(id, { name })}
                  onChooseFolder={(id) => void handleChooseProjectFolder(id)}
                  onDeleteProject={(id) =>
                    void deleteProject(id).then(() => loadConversationList())
                  }
                />
                <h3 className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                  Not in a project
                </h3>
                <ConversationList
                  conversations={loose}
                  currentConversationId={currentConversation?.id}
                  onSelect={handleSelectConversation}
                  onDelete={deleteConversation}
                  projects={projects}
                  onMove={moveToProject}
                  emptyText={code ? "No other sessions" : "No other chats"}
                />
              </>
            )}
          </div>

          {onOpenSettings && (
            <div className="shrink-0 border-t border-border/60 p-2">
              <button
                onClick={onOpenSettings}
                className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
            </div>
          )}
        </div>
      ) : (
        onOpenSettings && (
          <div className="flex shrink-0 justify-center p-3">
            <button
              onClick={onOpenSettings}
              title="Settings"
              className="rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        )
      )}
    </div>
  );
}
