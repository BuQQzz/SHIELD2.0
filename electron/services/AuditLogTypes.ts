/**
 * Audit Log Types and Utilities
 * 
 * Type definitions and utility functions for MCP audit logging.
 */

/**
 * Audit Log Entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  serverName: string;
  tool: string;
  arguments: Record<string, unknown>;
  approved: boolean;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  userApproval?: {
    timestamp: Date;
    remembered: boolean;
  };
}

/**
 * Audit Log Query Options
 */
export interface AuditLogQueryOptions {
  serverName?: string;
  tool?: string;
  startDate?: Date;
  endDate?: Date;
  approved?: boolean;
  limit?: number;
}

/**
 * Audit Log Statistics
 */
export interface AuditLogStatistics {
  totalCalls: number;
  approvedCalls: number;
  deniedCalls: number;
  byServer: Record<string, number>;
  byTool: Record<string, number>;
}

/**
 * Raw log entry from JSON (with string dates)
 */
interface RawLogEntry {
  id: string;
  timestamp: string;
  serverName: string;
  tool: string;
  arguments: Record<string, unknown>;
  approved: boolean;
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  userApproval?: {
    timestamp: string;
    remembered: boolean;
  };
}

/**
 * Convert log entries from JSON format (with string dates) to typed format
 */
export function parseLogEntries(entries: unknown[]): AuditLogEntry[] {
  return (entries as RawLogEntry[]).map(entry => ({
    ...entry,
    timestamp: new Date(entry.timestamp),
    userApproval: entry.userApproval
      ? {
          ...entry.userApproval,
          timestamp: new Date(entry.userApproval.timestamp),
        }
      : undefined,
  }));
}

/**
 * Generate unique log entry ID
 */
export function generateLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Filter log entries based on query options
 */
export function filterLogEntries(
  logs: AuditLogEntry[],
  options: AuditLogQueryOptions
): AuditLogEntry[] {
  let results = [...logs];

  // Filter by server name
  if (options.serverName) {
    results = results.filter(log => log.serverName === options.serverName);
  }

  // Filter by tool
  if (options.tool) {
    results = results.filter(log => log.tool === options.tool);
  }

  // Filter by approval status
  if (options.approved !== undefined) {
    results = results.filter(log => log.approved === options.approved);
  }

  // Filter by date range
  if (options.startDate) {
    results = results.filter(log => log.timestamp >= options.startDate!);
  }
  if (options.endDate) {
    results = results.filter(log => log.timestamp <= options.endDate!);
  }

  // Apply limit
  if (options.limit) {
    results = results.slice(-options.limit);
  }

  return results;
}

/**
 * Calculate statistics from log entries
 */
export function calculateStatistics(logs: AuditLogEntry[]): AuditLogStatistics {
  const stats: AuditLogStatistics = {
    totalCalls: logs.length,
    approvedCalls: logs.filter(log => log.approved).length,
    deniedCalls: logs.filter(log => !log.approved).length,
    byServer: {},
    byTool: {},
  };

  // Count by server and tool
  logs.forEach(log => {
    stats.byServer[log.serverName] = (stats.byServer[log.serverName] || 0) + 1;
    stats.byTool[log.tool] = (stats.byTool[log.tool] || 0) + 1;
  });

  return stats;
}
