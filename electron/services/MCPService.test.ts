/**
 * MCPService Tests
 */

import { describe, it, expect } from "vitest";
import {
  resolveToolPaths,
  validateFilesystemPath,
  OFFICIAL_MCP_SERVERS,
} from "./MCPServerConfig";
import path from "path";
import os from "os";

describe("MCPServerConfig", () => {
  describe("validateFilesystemPath", () => {
    const config = OFFICIAL_MCP_SERVERS.filesystem;

    it("should allow paths within Documents folder", () => {
      const docsPath = path.join(os.homedir(), "Documents", "test.txt");
      const result = validateFilesystemPath({ path: docsPath }, config);

      expect(result.success).toBe(true);
    });

    it("should allow paths within Desktop folder", () => {
      const desktopPath = path.join(os.homedir(), "Desktop", "file.txt");
      const result = validateFilesystemPath({ path: desktopPath }, config);

      expect(result.success).toBe(true);
    });

    it("should reject paths outside allowed directories", () => {
      const systemPath = "C:\\Windows\\System32\\test.txt";
      const result = validateFilesystemPath({ path: systemPath }, config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Access denied");
    });

    // list_allowed_directories takes no arguments. Rejecting calls without a
    // "path" meant it, move_file and read_multiple_files could never run.
    it("allows a tool call that has no path argument", () => {
      expect(validateFilesystemPath({}, config).success).toBe(true);
    });

    it("rejects an empty path", () => {
      const result = validateFilesystemPath({ path: "" }, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No path provided");
    });

    it("checks both ends of a move", () => {
      const inside = path.join(os.homedir(), "Documents", "a.txt");
      const outside = "C:/Windows/System32/a.txt";

      expect(
        validateFilesystemPath({ source: inside, destination: inside }, config)
          .success
      ).toBe(true);
      expect(
        validateFilesystemPath({ source: inside, destination: outside }, config)
          .success
      ).toBe(false);
    });

    it("checks every path in read_multiple_files", () => {
      const inside = path.join(os.homedir(), "Desktop", "a.txt");
      const outside = "C:/Windows/win.ini";

      expect(validateFilesystemPath({ paths: [inside] }, config).success).toBe(
        true
      );
      expect(
        validateFilesystemPath({ paths: [inside, outside] }, config).success
      ).toBe(false);
    });

    it("should normalize paths before validation", () => {
      const unnormalizedPath = path.join(
        os.homedir(),
        "Documents",
        "..",
        "Documents",
        "test.txt"
      );
      const result = validateFilesystemPath({ path: unnormalizedPath }, config);

      expect(result.success).toBe(true);
    });
  });

  describe("OFFICIAL_MCP_SERVERS", () => {
    it("should define filesystem server configuration", () => {
      expect(OFFICIAL_MCP_SERVERS.filesystem).toBeDefined();
      expect(OFFICIAL_MCP_SERVERS.filesystem.package).toBe(
        "@modelcontextprotocol/server-filesystem"
      );
      expect(OFFICIAL_MCP_SERVERS.filesystem.requiresApproval).toBe(true);
    });

    it("should have allowed paths configured", () => {
      const { allowedPaths } = OFFICIAL_MCP_SERVERS.filesystem;

      expect(allowedPaths).toHaveLength(2);
      expect(allowedPaths[0]).toContain("Documents");
      expect(allowedPaths[1]).toContain("Desktop");
    });

    it("should have permissions defined", () => {
      const { permissions } = OFFICIAL_MCP_SERVERS.filesystem;

      expect(permissions).toContain("read");
      expect(permissions).toContain("write");
      expect(permissions).toContain("list");
    });
  });
});

// Captured in the app, 2026-09-22: Qwen3-Coder sent {"path": "."} for
// "what's in this folder?" and SHIELD resolved it to its own install
// directory, denied it, and the model apologised for a correct call.
describe("resolveToolPaths", () => {
  const workspace = path.join(os.homedir(), "Projects", "app");

  it("resolves '.' to the workspace, not the process directory", () => {
    expect(resolveToolPaths({ path: "." }, workspace).path).toBe(workspace);
  });

  it("resolves bare file names inside the workspace", () => {
    expect(resolveToolPaths({ path: "README.md" }, workspace).path).toBe(
      path.join(workspace, "README.md")
    );
  });

  it("resolves move and multi-file arguments too", () => {
    const out = resolveToolPaths(
      { source: "a.txt", destination: "b.txt", paths: ["c.txt"] },
      workspace
    );
    expect(out.source).toBe(path.join(workspace, "a.txt"));
    expect(out.destination).toBe(path.join(workspace, "b.txt"));
    expect(out.paths).toEqual([path.join(workspace, "c.txt")]);
  });

  it("leaves absolute paths and other arguments alone", () => {
    const abs = path.join(os.homedir(), "Desktop", "x.txt");
    const out = resolveToolPaths({ path: abs, pattern: "*.md" }, workspace);
    expect(out.path).toBe(abs);
    expect(out.pattern).toBe("*.md");
  });

  it("still denies a relative path that climbs out of the workspace", () => {
    const resolved = resolveToolPaths({ path: "../../secret" }, workspace);
    const result = validateFilesystemPath(resolved, {
      ...OFFICIAL_MCP_SERVERS.filesystem!,
      allowedPaths: [workspace],
    });
    expect(result.success).toBe(false);
  });
});
