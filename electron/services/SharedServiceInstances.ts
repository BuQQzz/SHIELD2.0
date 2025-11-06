/**
 * Shared service instances for IPC handlers
 * This ensures services are singletons and can be shared across handlers
 */

import { app } from "electron";
import { getLlamaService } from "../../src/services/LlamaService.js";
import { getModelDownloadService } from "./ModelDownloadService.js";

// Create singleton instances
export const llamaService = getLlamaService();
export const modelDownloadService = getModelDownloadService(app.getPath("userData"));
