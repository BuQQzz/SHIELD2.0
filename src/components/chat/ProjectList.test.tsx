import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationMetadata, Project } from "@/types/electron";
import { ProjectList } from "./ProjectList";

const project = (id: string, name: string, folder?: string): Project => ({
  id,
  name,
  folder,
  createdAt: "2026-09-28T08:00:00Z",
  updatedAt: "2026-09-28T08:00:00Z",
});

const session = (
  id: string,
  title: string,
  projectId?: string
): ConversationMetadata => ({
  id,
  title,
  preview: "",
  messageCount: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  kind: "code",
  projectId,
});

const props = () => ({
  projects: [
    project("p1", "wifi", String.raw`C:\Continue\wifi`),
    project("p2", "Stocks"),
  ],
  conversations: [
    session("c1", "Folder Contents Inquiry", "p1"),
    session("c2", "Loose session"),
  ],
  kind: "code" as const,
  onSelect: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
  onNewInProject: vi.fn(),
  onRename: vi.fn(),
  onChooseFolder: vi.fn(),
  onDeleteProject: vi.fn(),
});

describe("ProjectList", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("lists each project with its own sessions", () => {
    render(<ProjectList {...props()} />);
    expect(screen.getByText("wifi")).toBeTruthy();
    expect(screen.getByText("Folder Contents Inquiry")).toBeTruthy();
    expect(screen.getByText("Stocks")).toBeTruthy();
    expect(screen.getByText("No sessions yet")).toBeTruthy();
    // Sessions outside any project are the Sidebar's to list
    expect(screen.queryByText("Loose session")).toBeNull();
  });

  it("starts a new session in a project", () => {
    const p = props();
    render(<ProjectList {...p} />);
    fireEvent.click(screen.getByTitle("New session in Stocks"));
    expect(p.onNewInProject).toHaveBeenCalledWith("p2");
  });

  it("folds a project away and remembers it", () => {
    const { unmount } = render(<ProjectList {...props()} />);
    fireEvent.click(screen.getByText("wifi"));
    expect(screen.queryByText("Folder Contents Inquiry")).toBeNull();
    unmount();
    render(<ProjectList {...props()} />);
    expect(screen.queryByText("Folder Contents Inquiry")).toBeNull();
  });

  it("opens a session in a project", () => {
    const p = props();
    render(<ProjectList {...p} />);
    fireEvent.click(screen.getByText("Folder Contents Inquiry"));
    expect(p.onSelect).toHaveBeenCalledWith("c1");
  });
});
