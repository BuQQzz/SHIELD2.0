/**
 * AuditLogTypes Tests
 */

import { describe, it, expect } from "vitest";
import {
  parseLogEntries,
  generateLogId,
  filterLogEntries,
  calculateStatistics,
  type AuditLogEntry,
} from "./AuditLogTypes";

describe("AuditLogTypes", () => {
  describe("generateLogId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateLogId();
      const id2 = generateLogId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it("should include timestamp in ID", () => {
      const id = generateLogId();
      const timestamp = id.split("-")[0];

      expect(Number(timestamp)).toBeGreaterThan(0);
    });
  });

  describe("parseLogEntries", () => {
    it("should convert string timestamps to Date objects", () => {
      const rawEntries = [
        {
          id: "123",
          timestamp: "2025-11-04T12:00:00.000Z",
          serverName: "filesystem",
          tool: "read_file",
          arguments: { path: "/test" },
          approved: true,
        },
      ];

      const parsed = parseLogEntries(rawEntries);

      expect(parsed[0].timestamp).toBeInstanceOf(Date);
    });

    it("should handle userApproval timestamps", () => {
      const rawEntries = [
        {
          id: "123",
          timestamp: "2025-11-04T12:00:00.000Z",
          serverName: "filesystem",
          tool: "read_file",
          arguments: {},
          approved: true,
          userApproval: {
            timestamp: "2025-11-04T12:00:05.000Z",
            remembered: true,
          },
        },
      ];

      const parsed = parseLogEntries(rawEntries);

      expect(parsed[0].userApproval?.timestamp).toBeInstanceOf(Date);
      expect(parsed[0].userApproval?.remembered).toBe(true);
    });
  });

  describe("filterLogEntries", () => {
    const testLogs: AuditLogEntry[] = [
      {
        id: "1",
        timestamp: new Date("2025-11-04T10:00:00Z"),
        serverName: "filesystem",
        tool: "read_file",
        arguments: {},
        approved: true,
      },
      {
        id: "2",
        timestamp: new Date("2025-11-04T11:00:00Z"),
        serverName: "filesystem",
        tool: "write_file",
        arguments: {},
        approved: false,
      },
      {
        id: "3",
        timestamp: new Date("2025-11-04T12:00:00Z"),
        serverName: "web",
        tool: "search",
        arguments: {},
        approved: true,
      },
    ];

    it("should filter by server name", () => {
      const results = filterLogEntries(testLogs, { serverName: "filesystem" });

      expect(results).toHaveLength(2);
      expect(results.every((log) => log.serverName === "filesystem")).toBe(
        true
      );
    });

    it("should filter by tool name", () => {
      const results = filterLogEntries(testLogs, { tool: "read_file" });

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe("read_file");
    });

    it("should filter by approval status", () => {
      const results = filterLogEntries(testLogs, { approved: true });

      expect(results).toHaveLength(2);
      expect(results.every((log) => log.approved === true)).toBe(true);
    });

    it("should filter by date range", () => {
      const results = filterLogEntries(testLogs, {
        startDate: new Date("2025-11-04T10:30:00Z"),
        endDate: new Date("2025-11-04T11:30:00Z"),
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("2");
    });

    it("should apply limit", () => {
      const results = filterLogEntries(testLogs, { limit: 2 });

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("2");
      expect(results[1].id).toBe("3");
    });

    it("should combine multiple filters", () => {
      const results = filterLogEntries(testLogs, {
        serverName: "filesystem",
        approved: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("1");
    });
  });

  describe("calculateStatistics", () => {
    const testLogs: AuditLogEntry[] = [
      {
        id: "1",
        timestamp: new Date(),
        serverName: "filesystem",
        tool: "read_file",
        arguments: {},
        approved: true,
      },
      {
        id: "2",
        timestamp: new Date(),
        serverName: "filesystem",
        tool: "write_file",
        arguments: {},
        approved: false,
      },
      {
        id: "3",
        timestamp: new Date(),
        serverName: "web",
        tool: "search",
        arguments: {},
        approved: true,
      },
    ];

    it("should count total calls", () => {
      const stats = calculateStatistics(testLogs);

      expect(stats.totalCalls).toBe(3);
    });

    it("should count approved and denied calls", () => {
      const stats = calculateStatistics(testLogs);

      expect(stats.approvedCalls).toBe(2);
      expect(stats.deniedCalls).toBe(1);
    });

    it("should count calls by server", () => {
      const stats = calculateStatistics(testLogs);

      expect(stats.byServer["filesystem"]).toBe(2);
      expect(stats.byServer["web"]).toBe(1);
    });

    it("should count calls by tool", () => {
      const stats = calculateStatistics(testLogs);

      expect(stats.byTool["read_file"]).toBe(1);
      expect(stats.byTool["write_file"]).toBe(1);
      expect(stats.byTool["search"]).toBe(1);
    });

    it("should handle empty logs", () => {
      const stats = calculateStatistics([]);

      expect(stats.totalCalls).toBe(0);
      expect(stats.approvedCalls).toBe(0);
      expect(stats.deniedCalls).toBe(0);
      expect(Object.keys(stats.byServer)).toHaveLength(0);
    });
  });
});
