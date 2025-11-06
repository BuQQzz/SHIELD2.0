/**
 * SettingsCategories and SettingsValidation Tests
 */

import { describe, it, expect } from "vitest";
import { Settings, DEFAULT_SETTINGS } from "./SettingsCategories";
import { mergeWithDefaults, isValidSettings } from "./SettingsValidation";

describe("SettingsCategories", () => {
  describe("DEFAULT_SETTINGS", () => {
    it("should have all required model settings", () => {
      expect(DEFAULT_SETTINGS.model).toBeDefined();
      expect(DEFAULT_SETTINGS.model.temperature).toBe(0.7);
      expect(DEFAULT_SETTINGS.model.topP).toBe(0.9);
      expect(DEFAULT_SETTINGS.model.topK).toBe(40);
      expect(DEFAULT_SETTINGS.model.repeatPenalty).toBe(1.1);
      expect(DEFAULT_SETTINGS.model.contextLength).toBe(4096);
      expect(DEFAULT_SETTINGS.model.maxTokens).toBe(2048);
    });

    it("should have all required system settings", () => {
      expect(DEFAULT_SETTINGS.system).toBeDefined();
      expect(DEFAULT_SETTINGS.system.systemPrompt).toBe(
        "You are a helpful AI assistant."
      );
      expect(DEFAULT_SETTINGS.system.autoSave).toBe(true);
      expect(DEFAULT_SETTINGS.system.confirmDelete).toBe(true);
      expect(DEFAULT_SETTINGS.system.theme).toBe("system");
      expect(DEFAULT_SETTINGS.system.modelDirectory).toBeUndefined();
    });

    it("should have all required privacy settings", () => {
      expect(DEFAULT_SETTINGS.privacy).toBeDefined();
      expect(DEFAULT_SETTINGS.privacy.telemetry).toBe(false);
      expect(DEFAULT_SETTINGS.privacy.analytics).toBe(false);
    });

    it("should have all required webSearch settings", () => {
      expect(DEFAULT_SETTINGS.webSearch).toBeDefined();
      expect(DEFAULT_SETTINGS.webSearch.enabled).toBe(false);
      expect(DEFAULT_SETTINGS.webSearch.maxResults).toBe(5);
      expect(DEFAULT_SETTINGS.webSearch.cacheEnabled).toBe(true);
      expect(DEFAULT_SETTINGS.webSearch.cacheTTL).toBe(1440);
      expect(DEFAULT_SETTINGS.webSearch.provider).toBe("duckduckgo");
      expect(DEFAULT_SETTINGS.webSearch.showReasoning).toBe(false);
    });

    it("should have all required mcp settings", () => {
      expect(DEFAULT_SETTINGS.mcp).toBeDefined();
      expect(DEFAULT_SETTINGS.mcp.enabled).toBe(false);
      expect(DEFAULT_SETTINGS.mcp.allowedServers).toEqual(["filesystem"]);
      expect(DEFAULT_SETTINGS.mcp.showPermissionDialog).toBe(true);
      expect(DEFAULT_SETTINGS.mcp.rememberChoices).toBe(false);
      expect(DEFAULT_SETTINGS.mcp.auditLogRetentionDays).toBe(30);
    });
  });
});

describe("SettingsValidation", () => {
  describe("mergeWithDefaults", () => {
    it("should merge partial settings with defaults", () => {
      const partialSettings = {
        model: {
          temperature: 0.8,
        },
      };

      const merged = mergeWithDefaults(partialSettings);

      expect(merged.model.temperature).toBe(0.8);
      expect(merged.model.topP).toBe(DEFAULT_SETTINGS.model.topP);
      expect(merged.system).toEqual(DEFAULT_SETTINGS.system);
      expect(merged.privacy).toEqual(DEFAULT_SETTINGS.privacy);
      expect(merged.webSearch).toEqual(DEFAULT_SETTINGS.webSearch);
      expect(merged.mcp).toEqual(DEFAULT_SETTINGS.mcp);
    });

    it("should handle empty object by returning defaults", () => {
      const merged = mergeWithDefaults({});

      expect(merged).toEqual(DEFAULT_SETTINGS);
    });

    it("should merge multiple categories", () => {
      const partialSettings = {
        model: {
          temperature: 0.5,
          maxTokens: 1024,
        },
        system: {
          theme: "dark" as const,
        },
        privacy: {
          telemetry: true,
        },
      };

      const merged = mergeWithDefaults(partialSettings);

      expect(merged.model.temperature).toBe(0.5);
      expect(merged.model.maxTokens).toBe(1024);
      expect(merged.model.topP).toBe(DEFAULT_SETTINGS.model.topP);
      expect(merged.system.theme).toBe("dark");
      expect(merged.system.autoSave).toBe(DEFAULT_SETTINGS.system.autoSave);
      expect(merged.privacy.telemetry).toBe(true);
      expect(merged.privacy.analytics).toBe(DEFAULT_SETTINGS.privacy.analytics);
    });
  });

  describe("isValidSettings", () => {
    it("should validate correct settings structure", () => {
      const validSettings: Settings = {
        model: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          repeatPenalty: 1.1,
          contextLength: 4096,
          maxTokens: 2048,
        },
        system: {
          systemPrompt: "Test prompt",
          autoSave: true,
          confirmDelete: false,
          theme: "light",
        },
        privacy: {
          telemetry: false,
          analytics: false,
        },
        webSearch: {
          enabled: true,
          maxResults: 10,
          cacheEnabled: true,
          cacheTTL: 1440,
          provider: "duckduckgo",
          showReasoning: true,
        },
        mcp: {
          enabled: true,
          allowedServers: ["filesystem"],
          showPermissionDialog: true,
          rememberChoices: false,
          auditLogRetentionDays: 30,
        },
      };

      expect(isValidSettings(validSettings)).toBe(true);
    });

    it("should reject null or undefined", () => {
      expect(isValidSettings(null)).toBe(false);
      expect(isValidSettings(undefined)).toBe(false);
    });

    it("should reject non-object values", () => {
      expect(isValidSettings("string")).toBe(false);
      expect(isValidSettings(123)).toBe(false);
      expect(isValidSettings(true)).toBe(false);
    });

    it("should reject missing model settings", () => {
      const invalidSettings = {
        system: DEFAULT_SETTINGS.system,
        privacy: DEFAULT_SETTINGS.privacy,
      };

      expect(isValidSettings(invalidSettings)).toBe(false);
    });

    it("should reject invalid model settings types", () => {
      const invalidSettings = {
        model: {
          temperature: "0.7", // Should be number
          topP: 0.9,
          topK: 40,
          repeatPenalty: 1.1,
          contextLength: 4096,
          maxTokens: 2048,
        },
        system: DEFAULT_SETTINGS.system,
        privacy: DEFAULT_SETTINGS.privacy,
      };

      expect(isValidSettings(invalidSettings)).toBe(false);
    });

    it("should reject missing system settings", () => {
      const invalidSettings = {
        model: DEFAULT_SETTINGS.model,
        privacy: DEFAULT_SETTINGS.privacy,
      };

      expect(isValidSettings(invalidSettings)).toBe(false);
    });

    it("should reject invalid theme value", () => {
      const invalidSettings = {
        model: DEFAULT_SETTINGS.model,
        system: {
          ...DEFAULT_SETTINGS.system,
          theme: "invalid",
        },
        privacy: DEFAULT_SETTINGS.privacy,
      };

      expect(isValidSettings(invalidSettings)).toBe(false);
    });

    it("should accept valid theme values", () => {
      const themes = ["light", "dark", "system"];

      themes.forEach((theme) => {
        const settings = {
          model: DEFAULT_SETTINGS.model,
          system: {
            ...DEFAULT_SETTINGS.system,
            theme,
          },
          privacy: DEFAULT_SETTINGS.privacy,
        };

        expect(isValidSettings(settings)).toBe(true);
      });
    });

    it("should reject missing privacy settings", () => {
      const invalidSettings = {
        model: DEFAULT_SETTINGS.model,
        system: DEFAULT_SETTINGS.system,
      };

      expect(isValidSettings(invalidSettings)).toBe(false);
    });

    it("should accept settings without webSearch (backward compatibility)", () => {
      const settingsWithoutWebSearch = {
        model: DEFAULT_SETTINGS.model,
        system: DEFAULT_SETTINGS.system,
        privacy: DEFAULT_SETTINGS.privacy,
      };

      expect(isValidSettings(settingsWithoutWebSearch)).toBe(true);
    });

    it("should reject invalid webSearch settings if present", () => {
      const invalidSettings = {
        model: DEFAULT_SETTINGS.model,
        system: DEFAULT_SETTINGS.system,
        privacy: DEFAULT_SETTINGS.privacy,
        webSearch: {
          enabled: "true", // Should be boolean
          maxResults: 5,
          cacheEnabled: true,
          cacheTTL: 1440,
          provider: "duckduckgo",
          showReasoning: false,
        },
      };

      expect(isValidSettings(invalidSettings)).toBe(false);
    });

    it("should accept settings without mcp (backward compatibility)", () => {
      const settingsWithoutMCP = {
        model: DEFAULT_SETTINGS.model,
        system: DEFAULT_SETTINGS.system,
        privacy: DEFAULT_SETTINGS.privacy,
      };

      expect(isValidSettings(settingsWithoutMCP)).toBe(true);
    });

    it("should reject invalid mcp settings if present", () => {
      const invalidSettings = {
        model: DEFAULT_SETTINGS.model,
        system: DEFAULT_SETTINGS.system,
        privacy: DEFAULT_SETTINGS.privacy,
        mcp: {
          enabled: true,
          allowedServers: "filesystem", // Should be array
          showPermissionDialog: true,
          rememberChoices: false,
          auditLogRetentionDays: 30,
        },
      };

      expect(isValidSettings(invalidSettings)).toBe(false);
    });

    it("should accept modelDirectory as undefined or string", () => {
      const settingsWithoutModelDir = {
        model: DEFAULT_SETTINGS.model,
        system: {
          ...DEFAULT_SETTINGS.system,
          modelDirectory: undefined,
        },
        privacy: DEFAULT_SETTINGS.privacy,
      };

      const settingsWithModelDir = {
        model: DEFAULT_SETTINGS.model,
        system: {
          ...DEFAULT_SETTINGS.system,
          modelDirectory: "/path/to/models",
        },
        privacy: DEFAULT_SETTINGS.privacy,
      };

      expect(isValidSettings(settingsWithoutModelDir)).toBe(true);
      expect(isValidSettings(settingsWithModelDir)).toBe(true);
    });

    it("should reject invalid modelDirectory type", () => {
      const invalidSettings = {
        model: DEFAULT_SETTINGS.model,
        system: {
          ...DEFAULT_SETTINGS.system,
          modelDirectory: 123, // Should be string or undefined
        },
        privacy: DEFAULT_SETTINGS.privacy,
      };

      expect(isValidSettings(invalidSettings)).toBe(false);
    });
  });
});
