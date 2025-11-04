/**
 * Audit Log Service
 * 
 * Tracks all MCP operations locally for transparency and security auditing.
 * Provides comprehensive logging of tool calls, permissions, and results.
 */

import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import {
  type AuditLogEntry,
  type AuditLogQueryOptions,
  type AuditLogStatistics,
  parseLogEntries,
  generateLogId,
  filterLogEntries,
  calculateStatistics,
} from './AuditLogTypes.js';

/**
 * Audit Log Service Class
 * Singleton service for tracking MCP operations
 */
class AuditLogService {
  private static instance: AuditLogService | null = null;
  private logsDir: string;
  private currentLogFile: string;
  private logs: AuditLogEntry[] = [];
  private maxLogsInMemory = 1000;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.logsDir = path.join(app.getPath('userData'), 'mcp-audit-logs');
    this.currentLogFile = this.getLogFilePath();
  }

  /**
   * Get AuditLogService singleton instance
   */
  public static getInstance(): AuditLogService {
    if (!AuditLogService.instance) {
      AuditLogService.instance = new AuditLogService();
    }
    return AuditLogService.instance;
  }

  /**
   * Initialize audit log service
   */
  public async initialize(): Promise<void> {
    try {
      // Create logs directory if it doesn't exist
      await fs.mkdir(this.logsDir, { recursive: true });

      // Load recent logs into memory
      await this.loadRecentLogs();

      console.log('[AuditLogService] Initialized successfully');
    } catch (error) {
      console.error('[AuditLogService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Get log file path for current date
   */
  private getLogFilePath(date: Date = new Date()): string {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logsDir, `mcp-audit-${dateStr}.json`);
  }

  /**
   * Load recent logs from disk into memory
   */
  private async loadRecentLogs(): Promise<void> {
    try {
      const logFile = this.currentLogFile;
      
      // Check if log file exists
      try {
        await fs.access(logFile);
      } catch {
        // File doesn't exist yet, that's fine
        this.logs = [];
        return;
      }

      // Read and parse log file
      const content = await fs.readFile(logFile, 'utf-8');
      const entries = JSON.parse(content);
      
      // Convert timestamp strings back to Date objects
      this.logs = parseLogEntries(entries);

      console.log(`[AuditLogService] Loaded ${this.logs.length} recent logs`);
    } catch (error) {
      console.error('[AuditLogService] Failed to load logs:', error);
      this.logs = [];
    }
  }

  /**
   * Log an MCP tool call
   */
  public async logToolCall(
    serverName: string,
    tool: string,
    args: Record<string, unknown>,
    approved: boolean,
    userApproval?: { remembered: boolean }
  ): Promise<string> {
    const entry: AuditLogEntry = {
      id: generateLogId(),
      timestamp: new Date(),
      serverName,
      tool,
      arguments: args,
      approved,
      userApproval: userApproval
        ? {
            timestamp: new Date(),
            remembered: userApproval.remembered,
          }
        : undefined,
    };

    // Add to memory
    this.logs.push(entry);

    // Trim if exceeds max
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs = this.logs.slice(-this.maxLogsInMemory);
    }

    // Persist to disk
    await this.persistLogs();

    console.log(`[AuditLogService] Logged tool call: ${serverName}.${tool}`);

    return entry.id;
  }

  /**
   * Update log entry with result
   */
  public async updateLogResult(
    id: string,
    result: { success: boolean; data?: unknown; error?: string }
  ): Promise<void> {
    const entry = this.logs.find(log => log.id === id);
    if (!entry) {
      console.warn(`[AuditLogService] Log entry ${id} not found`);
      return;
    }

    entry.result = result;

    // Persist to disk
    await this.persistLogs();
  }

  /**
   * Query audit logs
   */
  public async queryLogs(options: AuditLogQueryOptions = {}): Promise<AuditLogEntry[]> {
    return filterLogEntries(this.logs, options);
  }

  /**
   * Get all logs for a specific date
   */
  public async getLogsByDate(date: Date): Promise<AuditLogEntry[]> {
    const logFile = this.getLogFilePath(date);

    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const entries = JSON.parse(content);
      
      return parseLogEntries(entries);
    } catch {
      return [];
    }
  }

  /**
   * Get statistics about MCP usage
   */
  public async getStatistics(): Promise<AuditLogStatistics> {
    return calculateStatistics(this.logs);
  }

  /**
   * Clear all logs (use with caution)
   */
  public async clearLogs(): Promise<void> {
    this.logs = [];
    
    // Delete all log files
    try {
      const files = await fs.readdir(this.logsDir);
      for (const file of files) {
        if (file.startsWith('mcp-audit-')) {
          await fs.unlink(path.join(this.logsDir, file));
        }
      }
      console.log('[AuditLogService] All logs cleared');
    } catch (error) {
      console.error('[AuditLogService] Failed to clear logs:', error);
      throw error;
    }
  }

  /**
   * Export logs to JSON
   */
  public async exportLogs(outputPath: string): Promise<void> {
    try {
      await fs.writeFile(outputPath, JSON.stringify(this.logs, null, 2), 'utf-8');
      console.log(`[AuditLogService] Exported ${this.logs.length} logs to ${outputPath}`);
    } catch (error) {
      console.error('[AuditLogService] Failed to export logs:', error);
      throw error;
    }
  }

  /**
   * Persist logs to disk
   */
  private async persistLogs(): Promise<void> {
    try {
      await fs.writeFile(
        this.currentLogFile,
        JSON.stringify(this.logs, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[AuditLogService] Failed to persist logs:', error);
    }
  }
}

// Export singleton instance
export const auditLogService = AuditLogService.getInstance();
export type { AuditLogEntry, AuditLogQueryOptions } from './AuditLogTypes.js';
