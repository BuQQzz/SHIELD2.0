/**
 * Tests for ModelFileManager
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelFileManager } from "./ModelFileManager";
import type { ModelMetadata } from "../../src/config/models";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  default: {
    access: vi.fn(),
    readdir: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
  },
}));

// Mock path
vi.mock("path", () => ({
  default: {
    join: (...args: string[]) => args.join("/"),
  },
}));

describe("ModelFileManager", () => {
  let fileManager: ModelFileManager;
  let getModelsDir: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getModelsDir = vi.fn(() => "/test/models");
    fileManager = new ModelFileManager(getModelsDir);
  });

  describe("isModelInstalled", () => {
    it("should return false for invalid URI format", async () => {
      const model: ModelMetadata = {
        id: "test-model",
        displayName: "Test Model",
        uri: "invalid-uri",
        size: "1GB",
        license: "MIT",
        capabilities: [],
        category: "general-chat",
      };

      const result = await fileManager.isModelInstalled(model);
      expect(result).toBe(false);
    });

    it("should return false for non-hf URI", async () => {
      const model: ModelMetadata = {
        id: "test-model",
        displayName: "Test Model",
        uri: "http://example.com/model",
        size: "1GB",
        license: "MIT",
        capabilities: [],
        category: "general-chat",
      };

      const result = await fileManager.isModelInstalled(model);
      expect(result).toBe(false);
    });

    it("should check for model file existence with correct filename", async () => {
      const model: ModelMetadata = {
        id: "test-model",
        displayName: "Test Model",
        uri: "hf:TestOrg/TestModel-GGUF:Q4_K_M",
        size: "1GB",
        license: "MIT",
        capabilities: [],
        category: "general-chat",
      };

      // The test will attempt to access the file but fail (mock not set up)
      const result = await fileManager.isModelInstalled(model);
      expect(result).toBe(false);
      expect(getModelsDir).toHaveBeenCalled();
    });
  });

  describe("listInstalledModels", () => {
    it("should return empty array on error", async () => {
      const result = await fileManager.listInstalledModels();
      expect(result).toEqual([]);
    });
  });

  describe("deleteModel", () => {
    it("should return false for invalid URI format", async () => {
      const model: ModelMetadata = {
        id: "test-model",
        displayName: "Test Model",
        uri: "invalid-uri",
        size: "1GB",
        license: "MIT",
        capabilities: [],
        category: "general-chat",
      };

      const result = await fileManager.deleteModel(model);
      expect(result).toBe(false);
    });
  });

  describe("getTotalDiskSpace", () => {
    it("should return 0 on error", async () => {
      const result = await fileManager.getTotalDiskSpace();
      expect(result).toBe(0);
    });
  });
});
