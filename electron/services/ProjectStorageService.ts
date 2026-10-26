/**
 * Projects: named groups that chats and code sessions run under. A project
 * can have a folder - its code sessions start there without asking - and
 * later carries what SHIELD learns about the project (docs/HANDOFF.md,
 * "Memory: where this is going"). Kept in one small JSON file next to the
 * conversations; a conversation names its project by id.
 */

import fs from "fs/promises";
import path from "path";

export interface Project {
  id: string;
  name: string;
  /** The project's folder: code sessions in it work there */
  folder?: string;
  createdAt: string;
  updatedAt: string;
}

export class ProjectStorageService {
  constructor(private readonly file: string) {}

  async list(): Promise<Project[]> {
    try {
      const data = JSON.parse(await fs.readFile(this.file, "utf-8")) as {
        projects?: Project[];
      };
      return Array.isArray(data.projects) ? data.projects : [];
    } catch {
      return [];
    }
  }

  private async write(projects: Project[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ projects }, null, 2), "utf-8");
    await fs.rename(temp, this.file);
  }

  /** Adds a project, or replaces the one with its id */
  async save(project: Project): Promise<Project> {
    const projects = await this.list();
    const saved = { ...project, updatedAt: new Date().toISOString() };
    const at = projects.findIndex((p) => p.id === project.id);
    if (at === -1) projects.push(saved);
    else projects[at] = saved;
    await this.write(projects);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const projects = await this.list();
    await this.write(projects.filter((p) => p.id !== id));
  }
}
