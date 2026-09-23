import { describe, expect, it } from "vitest";
import {
  migrateMcpSettings,
  mergeWithDefaults,
  isValidSettings,
} from "./SettingsValidation";
import { DEFAULT_SETTINGS } from "./SettingsCategories";

describe("migrateMcpSettings", () => {
  it("defaults to ask when there is nothing stored", () => {
    expect(migrateMcpSettings(undefined)).toEqual({});
  });

  it("gives a legacy block that showed the dialog the ask mode", () => {
    const migrated = migrateMcpSettings({
      showPermissionDialog: true,
      allowedTools: ["read_file"],
    });

    expect(migrated.mode).toBe("ask");
  });

  it("treats a suppressed permission dialog as auto mode", () => {
    // Someone who turned the dialog off was already running unattended
    const migrated = migrateMcpSettings({
      showPermissionDialog: false,
      allowedTools: ["read_file"],
    });

    expect(migrated.mode).toBe("auto");
  });

  it("strips settings that permission modes replace", () => {
    const migrated = migrateMcpSettings({
      showPermissionDialog: false,
      rememberChoices: true,
      allowedServers: ["filesystem"],
      hybridParserEnabled: true,
      autoInitialize: false,
      allowedTools: ["read_file"],
    }) as Record<string, unknown>;

    expect(migrated).not.toHaveProperty("showPermissionDialog");
    expect(migrated).not.toHaveProperty("rememberChoices");
    expect(migrated).not.toHaveProperty("allowedServers");
    expect(migrated).not.toHaveProperty("hybridParserEnabled");
    // Was never in the Settings type, but real settings.json files carry it
    expect(migrated).not.toHaveProperty("autoInitialize");
  });

  it("keeps the settings that survive", () => {
    const migrated = migrateMcpSettings({
      allowedTools: ["read_file", "search_files"],
      maxToolCallsPerTurn: 3,
      auditLogRetentionDays: 7,
    });

    expect(migrated.allowedTools).toEqual(["read_file", "search_files"]);
    expect(migrated.maxToolCallsPerTurn).toBe(3);
    expect(migrated.auditLogRetentionDays).toBe(7);
  });

  it("does not overwrite a mode that is already set", () => {
    const migrated = migrateMcpSettings({
      mode: "readonly",
      showPermissionDialog: true,
    });

    expect(migrated.mode).toBe("readonly");
  });

  it("replaces an unrecognised mode rather than trusting it", () => {
    const migrated = migrateMcpSettings({
      mode: "yolo",
    } as unknown as Parameters<typeof migrateMcpSettings>[0]);

    expect(migrated.mode).toBe("ask");
  });
});

describe("mergeWithDefaults", () => {
  it("migrates the mcp block on load", () => {
    const merged = mergeWithDefaults({
      mcp: {
        showPermissionDialog: false,
        allowedTools: ["read_file"],
      },
    } as unknown as Parameters<typeof mergeWithDefaults>[0]);

    expect(merged.mcp.mode).toBe("auto");
    expect(merged.mcp).not.toHaveProperty("showPermissionDialog");
  });

  it("gives a fresh install the ask mode", () => {
    expect(mergeWithDefaults({}).mcp.mode).toBe("ask");
    expect(DEFAULT_SETTINGS.mcp.mode).toBe("ask");
  });

  it("fills in maxToolRounds for settings written before it existed", () => {
    const merged = mergeWithDefaults({
      mcp: { allowedTools: [] },
    } as unknown as Parameters<typeof mergeWithDefaults>[0]);

    expect(merged.mcp.maxToolRounds).toBe(DEFAULT_SETTINGS.mcp.maxToolRounds);
  });
});

describe("isValidSettings", () => {
  it("accepts settings that still carry legacy mcp keys", () => {
    const legacy = {
      ...DEFAULT_SETTINGS,
      mcp: {
        ...DEFAULT_SETTINGS.mcp,
        showPermissionDialog: true,
        rememberChoices: false,
      },
    };

    expect(isValidSettings(legacy)).toBe(true);
  });

  it("rejects an unrecognised permission mode", () => {
    const bad = {
      ...DEFAULT_SETTINGS,
      mcp: { ...DEFAULT_SETTINGS.mcp, mode: "bypass" },
    };

    expect(isValidSettings(bad)).toBe(false);
  });

  it("rejects a non-numeric maxToolRounds", () => {
    const bad = {
      ...DEFAULT_SETTINGS,
      mcp: { ...DEFAULT_SETTINGS.mcp, maxToolRounds: "lots" },
    };

    expect(isValidSettings(bad)).toBe(false);
  });

  it("accepts settings with and without a workspace folder", () => {
    expect(isValidSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(
      isValidSettings({
        ...DEFAULT_SETTINGS,
        mcp: { ...DEFAULT_SETTINGS.mcp, workspaceFolder: "D:\\Projects\\app" },
      })
    ).toBe(true);
  });

  it("rejects a workspace folder that is not a string", () => {
    const bad = {
      ...DEFAULT_SETTINGS,
      mcp: { ...DEFAULT_SETTINGS.mcp, workspaceFolder: ["C:\\"] },
    };

    expect(isValidSettings(bad)).toBe(false);
  });
});
