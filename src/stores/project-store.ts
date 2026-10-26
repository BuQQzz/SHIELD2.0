/**
 * Projects: named groups that chats and code sessions run under, shared by
 * both views. Saved by the main process (electron/services/
 * ProjectStorageService); a conversation names its project by id.
 */

import { create } from "zustand";
import type { Project } from "@/types/electron";
import { folderName } from "@/lib/sessions";

interface ProjectState {
  projects: Project[];
  loadProjects: () => Promise<void>;
  /** A new project; named after its folder when no name is given */
  createProject: (name: string, folder?: string) => Promise<Project | null>;
  updateProject: (
    id: string,
    changes: Partial<Pick<Project, "name" | "folder">>
  ) => Promise<void>;
  /** Deletes the project; its conversations stay, outside any project */
  deleteProject: (id: string) => Promise<void>;
}

const byName = (a: Project, b: Project) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],

  loadProjects: async () => {
    const result = await window.conversations?.listProjects?.();
    set({ projects: [...(result?.projects ?? [])].sort(byName) });
  },

  createProject: async (name, folder) => {
    const now = new Date().toISOString();
    const project: Project = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || (folder ? folderName(folder) : "New project"),
      ...(folder ? { folder } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const result = await window.conversations?.saveProject?.(project);
    if (!result?.success || !result.project) return null;
    set({ projects: [...get().projects, result.project].sort(byName) });
    return result.project;
  },

  updateProject: async (id, changes) => {
    const current = get().projects.find((p) => p.id === id);
    if (!current) return;
    const result = await window.conversations?.saveProject?.({
      ...current,
      ...changes,
    });
    if (!result?.success || !result.project) return;
    set({
      projects: get()
        .projects.map((p) => (p.id === id ? result.project! : p))
        .sort(byName),
    });
  },

  deleteProject: async (id) => {
    const result = await window.conversations?.deleteProject?.(id);
    if (!result?.success) return;
    set({ projects: get().projects.filter((p) => p.id !== id) });
  },
}));
