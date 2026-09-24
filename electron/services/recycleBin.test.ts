import { describe, expect, it, vi } from "vitest";
import path from "path";
import os from "os";
import { DELETE_TOOL, moveToRecycleBin } from "./recycleBin";

const workspace = path.join(os.homedir(), "Projects", "EXPERIMENT");
const file = path.join(workspace, "awsome sauce.md");

const deps = (exists = true) => ({
  exists: vi.fn().mockResolvedValue(exists),
  trash: vi.fn().mockResolvedValue(undefined),
});

describe("moveToRecycleBin", () => {
  it("moves the file to the Recycle Bin and says it can be restored", async () => {
    const d = deps();
    const result = await moveToRecycleBin(file, [workspace], d);

    expect(d.trash).toHaveBeenCalledWith(file);
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).toContain("Recycle Bin");
  });

  it("never bins the allowed folder itself", async () => {
    const d = deps();
    const result = await moveToRecycleBin(workspace, [workspace], d);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Refusing");
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("matches the allowed folder case-insensitively, as Windows does", async () => {
    const d = deps();
    const result = await moveToRecycleBin(
      workspace.toUpperCase(),
      [workspace],
      d
    );
    expect(result.success).toBe(false);
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("reports a missing file instead of pretending", async () => {
    const d = deps(false);
    const result = await moveToRecycleBin(file, [workspace], d);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Nothing to delete");
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("reports a failed move", async () => {
    const d = deps();
    d.trash.mockRejectedValue(new Error("in use by another program"));
    const result = await moveToRecycleBin(file, [workspace], d);

    expect(result.success).toBe(false);
    expect(result.error).toContain("in use by another program");
  });

  it("rejects an empty path", async () => {
    expect((await moveToRecycleBin("", [workspace], deps())).success).toBe(
      false
    );
  });
});

describe("DELETE_TOOL", () => {
  it("is described as destructive so permission modes treat it as a change", () => {
    expect(DELETE_TOOL.annotations.readOnlyHint).toBe(false);
    expect(DELETE_TOOL.annotations.destructiveHint).toBe(true);
    expect(DELETE_TOOL.inputSchema.required).toEqual(["path"]);
  });
});
