import { useEffect, useState } from "react";
import type { RecommendedSampling } from "@/services/modelSampling";

/**
 * The sampling a library model recommends - from its GGUF, else SHIELD's
 * catalog - read by the main process, which caches it. Null while unknown,
 * for no model, and for a model that recommends nothing.
 */
export function useRecommendedSampling(
  modelId: string | null | undefined
): RecommendedSampling | null {
  const [found, setFound] = useState<{
    modelId: string;
    sampling: RecommendedSampling | null;
  } | null>(null);

  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    window.llama
      .getRecommendedSampling(modelId)
      .then((result) => {
        if (!cancelled) {
          setFound({ modelId, sampling: result.sampling ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setFound({ modelId, sampling: null });
      });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  return modelId && found?.modelId === modelId ? found.sampling : null;
}
