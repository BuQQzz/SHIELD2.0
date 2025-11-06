import { LlamaModel, LlamaContext } from "node-llama-cpp";
import path from "path";

export interface ContextCreationResult {
  context: LlamaContext;
  actualContextSize: number;
  warning?: string;
}

/**
 * Manages context creation and VRAM optimization for llama.cpp
 * Handles context size configuration with automatic fallback for insufficient VRAM
 */
export class LlamaContextManager {
  /**
   * Create context with requested size, with fallback for insufficient VRAM
   */
  async createContext(
    model: LlamaModel,
    requestedSize: number,
    modelPath?: string
  ): Promise<ContextCreationResult> {
    let contextSize = requestedSize;
    let context: LlamaContext | null = null;
    let warning: string | undefined;

    // Try to create context with requested size, fallback if insufficient VRAM
    try {
      context = await model.createContext({
        contextSize,
      });
      return { context, actualContextSize: contextSize };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's a VRAM-related error
      if (
        errorMsg.includes("too large") ||
        errorMsg.includes("VRAM") ||
        errorMsg.includes("memory")
      ) {
        console.warn(
          `[LlamaContextManager] VRAM insufficient for context size ${contextSize}, trying reduced sizes...`
        );

        // Try progressively smaller context sizes
        const fallbackSizes = [16384, 8192, 4096, 2048, 1024, 512];

        for (const fallbackSize of fallbackSizes) {
          if (fallbackSize >= contextSize) continue; // Skip if not smaller

          try {
            context = await model.createContext({
              contextSize: fallbackSize,
            });

            warning = `⚠️ Insufficient VRAM for requested context size (${contextSize}). Reduced to ${fallbackSize} tokens. This large model is using system RAM for some layers, which will be slower. For better performance, consider using a smaller model or upgrading your GPU.`;
            console.warn(`[LlamaContextManager] ${warning}`);
            contextSize = fallbackSize;
            break;
          } catch {
            continue;
          }
        }
      } else {
        // Non-VRAM related error, rethrow
        throw error;
      }
    }

    if (!context) {
      // If all fallbacks failed, throw a more helpful error
      const modelName = modelPath ? path.basename(modelPath) : "unknown model";
      throw new Error(
        `Unable to load this model even with minimum context size. The model (${modelName}) requires more VRAM than available. Try:\n` +
          `1. A smaller quantization (e.g., Q4_K_S, Q3_K_M instead of Q4_K_M)\n` +
          `2. A smaller model (e.g., 7B instead of 32B)\n` +
          `3. Freeing up VRAM by closing other applications\n` +
          `4. Upgrading your GPU`
      );
    }

    return { context, actualContextSize: contextSize, warning };
  }
}
