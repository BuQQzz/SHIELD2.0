/**
 * MCPService Tests
 */

import { describe, it, expect } from "vitest";
import {
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

    it("should reject when no path is provided", () => {
      const result = validateFilesystemPath({}, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No path provided");
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
