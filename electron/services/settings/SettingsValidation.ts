/**
 * Settings Validation and Migration
 *
 * This module provides validation logic for settings and handles merging
 * user settings with defaults for backward compatibility.
 */

import { Settings, DEFAULT_SETTINGS } from "./SettingsCategories";

/**
 * Merge user settings with defaults (handles new settings)
 */
export function mergeWithDefaults(settings: Partial<Settings>): Settings {
  return {
    model: {
      ...DEFAULT_SETTINGS.model,
      ...settings.model,
    },
    system: {
      ...DEFAULT_SETTINGS.system,
      ...settings.system,
    },
    privacy: {
      ...DEFAULT_SETTINGS.privacy,
      ...settings.privacy,
    },
    webSearch: {
      ...DEFAULT_SETTINGS.webSearch,
      ...settings.webSearch,
    },
    mcp: {
      ...DEFAULT_SETTINGS.mcp,
      ...settings.mcp,
    },
  };
}

/**
 * Validate settings structure
 */
export function isValidSettings(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;

  const obj = data as Record<string, unknown>;

  // Check model settings
  if (!obj.model || typeof obj.model !== "object") return false;
  const model = obj.model as Record<string, unknown>;
  if (
    typeof model.temperature !== "number" ||
    typeof model.topP !== "number" ||
    typeof model.topK !== "number" ||
    typeof model.repeatPenalty !== "number" ||
    typeof model.contextLength !== "number" ||
    typeof model.maxTokens !== "number"
  ) {
    return false;
  }

  // Check system settings
  if (!obj.system || typeof obj.system !== "object") return false;
  const system = obj.system as Record<string, unknown>;
  if (
    typeof system.systemPrompt !== "string" ||
    typeof system.autoSave !== "boolean" ||
    typeof system.confirmDelete !== "boolean" ||
    !system.theme ||
    !["light", "dark", "system"].includes(system.theme as string) ||
    (system.modelDirectory !== undefined &&
      typeof system.modelDirectory !== "string")
  ) {
    return false;
  }

  // Check privacy settings
  if (!obj.privacy || typeof obj.privacy !== "object") return false;
  const privacy = obj.privacy as Record<string, unknown>;
  if (
    typeof privacy.telemetry !== "boolean" ||
    typeof privacy.analytics !== "boolean"
  ) {
    return false;
  }

  // Check webSearch settings (optional for backward compatibility)
  if (obj.webSearch) {
    if (typeof obj.webSearch !== "object") return false;
    const webSearch = obj.webSearch as Record<string, unknown>;
    if (
      typeof webSearch.enabled !== "boolean" ||
      typeof webSearch.maxResults !== "number" ||
      typeof webSearch.cacheEnabled !== "boolean" ||
      typeof webSearch.cacheTTL !== "number" ||
      webSearch.provider !== "duckduckgo" ||
      typeof webSearch.showReasoning !== "boolean"
    ) {
      return false;
    }
  }

  // Check mcp settings (optional for backward compatibility)
  if (obj.mcp) {
    if (typeof obj.mcp !== "object") return false;
    const mcp = obj.mcp as Record<string, unknown>;
    if (
      typeof mcp.enabled !== "boolean" ||
      !Array.isArray(mcp.allowedServers) ||
      !Array.isArray(mcp.allowedTools) ||
      typeof mcp.showPermissionDialog !== "boolean" ||
      typeof mcp.rememberChoices !== "boolean" ||
      typeof mcp.auditLogRetentionDays !== "number" ||
      typeof mcp.hybridParserEnabled !== "boolean" ||
      typeof mcp.maxToolCallsPerTurn !== "number"
    ) {
      return false;
    }
  }

  return true;
}
