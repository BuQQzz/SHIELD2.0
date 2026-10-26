// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ProjectStorageService, type Project } from "./ProjectStorageService";

describe("ProjectStorageService", () => {
  let dir = "";
  let store: ProjectStorageService;
  const project = (id: string, name: string): Project => ({
    id,
    name,
    createdAt: "2026-09-28T08:00:00Z",
    updatedAt: "2026-09-28T08:00:00Z",
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "shield-projects-"));
    store = new ProjectStorageService(path.join(dir, "projects.json"));
  });
  afterEach(() => fs.rm(dir, { recursive: true, force: true }));

  it("starts with no projects when there is no file", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("adds, replaces and removes projects", async () => {
    await store.save(project("p1", "wifi"));
    await store.save(project("p2", "Stocks"));
    await store.save({ ...project("p1", "Wi-Fi tools"), folder: "C:/wifi" });
    expect((await store.list()).map((p) => [p.id, p.name, p.folder])).toEqual([
      ["p1", "Wi-Fi tools", "C:/wifi"],
      ["p2", "Stocks", undefined],
    ]);
    await store.remove("p1");
    expect((await store.list()).map((p) => p.id)).toEqual(["p2"]);
  });

  it("reads a damaged file as no projects rather than failing", async () => {
    await fs.writeFile(path.join(dir, "projects.json"), "{not json");
    expect(await store.list()).toEqual([]);
  });
});
