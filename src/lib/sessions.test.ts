import { describe, expect, it } from "vitest";
import {
  folderName,
  inProject,
  kindOf,
  ofKind,
  outsideProjects,
  viewKind,
} from "./sessions";

describe("sessions", () => {
  it("maps the chat and code views to their kind, and nothing else", () => {
    expect(viewKind("chat")).toBe("chat");
    expect(viewKind("code")).toBe("code");
    expect(viewKind("library")).toBeNull();
    expect(viewKind("plugins")).toBeNull();
  });

  it("treats conversations from before the split as chats", () => {
    expect(kindOf({})).toBe("chat");
    expect(kindOf(null)).toBe("chat");
    expect(kindOf({ kind: "code" })).toBe("code");
  });

  it("lists one kind, keeping the newest-first order", () => {
    const list = [
      { id: "a", kind: "code" as const },
      { id: "b" },
      { id: "c", kind: "code" as const },
      { id: "d", kind: "chat" as const },
    ];
    expect(ofKind(list, "code").map((c) => c.id)).toEqual(["a", "c"]);
    expect(ofKind(list, "chat").map((c) => c.id)).toEqual(["b", "d"]);
  });

  it("names a folder by its last segment", () => {
    expect(folderName(String.raw`C:\Users\me\Continue\wifi`)).toBe("wifi");
    expect(folderName("C:/work/app/")).toBe("app");
  });

  it("splits conversations into projects and the rest", () => {
    const list = [
      { id: "a", projectId: "p1" },
      { id: "b" },
      { id: "c", projectId: "p2" },
      { id: "d", projectId: "gone" },
      { id: "e", projectId: "p1" },
    ];
    const projects = [{ id: "p1" }, { id: "p2" }];
    expect(inProject(list, "p1").map((c) => c.id)).toEqual(["a", "e"]);
    // A conversation whose project was deleted is listed with the rest
    expect(outsideProjects(list, projects).map((c) => c.id)).toEqual([
      "b",
      "d",
    ]);
  });
});
