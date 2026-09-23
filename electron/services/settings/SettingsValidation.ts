/**
 * Settings Validation and Migration
 *
 * This module provides validation logic for settings and handles merging
 * user settings with defaults for backward compatibility.
 */

import {
  Settings,
  DEFAULT_SETTINGS,
  FILESYSTEM_TOOLS,
  LEGACY_DEFAULT_ALLOWED_TOOLS,
  PERMISSION_MODES,
  type PermissionMode,
} from "./SettingsCategories";

/**
 * Settings that predate permission modes and are now folded into `mcp.mode`
 * or dropped entirely. Left in a stored settings.json they are harmless, but
 * they show up in exports and invite someone to "wire them up" later.
 */
interface LegacyMcpSettings {
  showPermissionDialog?: boolean;
  rememberChoices?: boolean;
  allowedServers?: string[];
  hybridParserEnabled?: boolean;
  /** Never declared in Settings and never read - found in stored files */
  autoInitialize?: boolean;
}

/**
 * Bring a stored mcp block up to the current shape.
 *
 * A user who had turned the permission dialog off was, in effect, already
 * running in auto mode, so that is where they land. Everyone else gets "ask",
 * which is the behaviour they had before modes existed.
 */
export function migrateMcpSettings(
  stored: (Partial<Settings["mcp"]> & LegacyMcpSettings) | undefined
): Partial<Settings["mcp"]> {
  if (!stored) return {};

  const {
    showPermissionDialog,
    rememberChoices: _rememberChoices,
    allowedServers: _allowedServers,
    hybridParserEnabled: _hybridParserEnabled,
    autoInitialize: _autoInitialize,
    ...current
  } = stored;

  const migrated: Partial<Settings["mcp"]> = { ...current };

  if (!isPermissionMode(migrated.mode)) {
    migrated.mode = showPermissionDialog === false ? "auto" : "ask";
  }

  // Still on the old three-tool default means the list was never chosen:
  // those users could not edit, search or use read_text_file without
  // hunting for switches. Move them to the full set. A list anyone actually
  // edited is left exactly as it is.
  if (isLegacyDefaultAllowlist(migrated.allowedTools)) {
    migrated.allowedTools = [...FILESYSTEM_TOOLS];
  }

  return migrated;
}

function isLegacyDefaultAllowlist(tools: unknown): boolean {
  return (
    Array.isArray(tools) &&
    tools.length === LEGACY_DEFAULT_ALLOWED_TOOLS.length &&
    LEGACY_DEFAULT_ALLOWED_TOOLS.every((tool) => tools.includes(tool))
  );
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return (
    typeof value === "string" &&
    (PERMISSION_MODES as readonly string[]).includes(value)
  );
}

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
      ...migrateMcpSettings(settings.mcp),
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
    // Legacy keys are tolerated here - migrateMcpSettings strips them on load.
    if (
      typeof mcp.enabled !== "boolean" ||
      !Array.isArray(mcp.allowedTools) ||
      typeof mcp.auditLogRetentionDays !== "number" ||
      typeof mcp.maxToolCallsPerTurn !== "number"
    ) {
      return false;
    }

    if (mcp.mode !== undefined && !isPermissionMode(mcp.mode)) {
      return false;
    }

    if (
      mcp.maxToolRounds !== undefined &&
      typeof mcp.maxToolRounds !== "number"
    ) {
      return false;
    }

    if (
      mcp.workspaceFolder !== undefined &&
      typeof mcp.workspaceFolder !== "string"
    ) {
      return false;
    }
  }

  return true;
}
