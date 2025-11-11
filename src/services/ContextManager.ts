import { LlamaModel, LlamaContext } from "node-llama-cpp";
import path from "path";

export interface ContextConfig {
  contextSize: number;
}

export interface ContextCreationResult {
  context: LlamaContext;
  actualContextSize: number;
  warning?: string;
}

/**
 * Manages context creation and VRAM allocation
 * Handles fallback to smaller context sizes when VRAM is insufficient
 */
export class ContextManager {
  /**
   * Create context with fallback to smaller sizes if VRAM is insufficient
   */
  async createContext(
    model: LlamaModel,
    config: ContextConfig,
    modelPath?: string
  ): Promise<ContextCreationResult> {
    let contextSize = config.contextSize;
    let context: LlamaContext | null = null;
    let warning: string | undefined;

    // Try to create context with requested size, fallback if insufficient VRAM
    let contextCreated = false;
    try {
      context = await model.createContext({
        contextSize,
      });
      contextCreated = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's a VRAM-related error
      if (
        errorMsg.includes("too large") ||
        errorMsg.includes("VRAM") ||
        errorMsg.includes("memory")
      ) {
        console.warn(
          `[ContextManager] VRAM insufficient for context size ${contextSize}, trying reduced sizes...`
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
            console.warn(`[ContextManager] ${warning}`);
            contextSize = fallbackSize;
            contextCreated = true;
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

    if (!contextCreated || !context) {
      // If all fallbacks failed, throw a more helpful error
      const modelName = modelPath ? path.basename(modelPath) : "model";
      throw new Error(
        `Unable to load this model even with minimum context size. The model (${modelName}) requires more VRAM than available. Try:\n` +
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
}
