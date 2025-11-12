/**
 * Context Manager - Handles context creation with VRAM fallback
 * Manages context size allocation and automatic fallback on memory errors
 */

import { LlamaModel, LlamaContext } from "node-llama-cpp";
import path from "path";

export interface ContextCreationOptions {
  model: LlamaModel;
  requestedContextSize: number;
  modelPath: string;
}

export interface ContextCreationResult {
  context: LlamaContext;
  actualContextSize: number;
  warning?: string;
}

/**
 * Attempts to create context with the requested size
 */
async function tryCreateContext(
  model: LlamaModel,
  contextSize: number
): Promise<LlamaContext | null> {
  try {
    return await model.createContext({ contextSize });
  } catch {
    return null;
  }
}

/**
 * Check if error is VRAM-related
 */
function isVRAMError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error);
  return (
    errorMsg.includes("too large") ||
    errorMsg.includes("VRAM") ||
    errorMsg.includes("memory")
  );
}

/**
 * Creates context with automatic fallback on VRAM errors
 * Tries progressively smaller context sizes until one succeeds
 */
export async function createContextWithFallback(
  options: ContextCreationOptions
): Promise<ContextCreationResult> {
  const { model, requestedContextSize, modelPath } = options;
  let contextSize = requestedContextSize;
  let context: LlamaContext | null = null;
  let warning: string | undefined;

  // Try to create context with requested size
  try {
    context = await model.createContext({ contextSize });
  } catch (error) {
    // Check if it's a VRAM-related error
    if (!isVRAMError(error)) {
      throw error;
    }

    console.warn(
      `[ContextManager] VRAM insufficient for context size ${contextSize}, trying reduced sizes...`
    );

    // Try progressively smaller context sizes
    const fallbackSizes = [16384, 8192, 4096, 2048, 1024, 512];

    for (const fallbackSize of fallbackSizes) {
      if (fallbackSize >= contextSize) continue; // Skip if not smaller

      context = await tryCreateContext(model, fallbackSize);
      if (context) {
        warning = `⚠️ Insufficient VRAM for requested context size (${contextSize}). Reduced to ${fallbackSize} tokens. This large model is using system RAM for some layers, which will be slower. For better performance, consider using a smaller model or upgrading your GPU.`;
        console.warn(`[ContextManager] ${warning}`);
        contextSize = fallbackSize;
        break;
      }
    }
  }

  // If all attempts failed, throw helpful error
  if (!context) {
    throw new Error(
      `Unable to load this model even with minimum context size. The model (${path.basename(modelPath)}) requires more VRAM than available. Try:\n` +
        `1. A smaller quantization (e.g., Q4_K_S, Q3_K_M instead of Q4_K_M)\n` +
        `2. A smaller model (e.g., 7B instead of 32B)\n` +
        `3. Freeing up VRAM by closing other applications\n` +
        `4. Upgrading your GPU`
    );
  }

  return {
    context,
    actualContextSize: contextSize,
    warning,
  };
}
