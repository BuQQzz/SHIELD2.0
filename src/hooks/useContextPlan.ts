import { useEffect, useState } from "react";
import type { ContextPlan } from "@/types/electron";

/**
 * A model's context plan from the main process, which caches it. `failed`
 * when the model file cannot be read.
 */
export function useContextPlan(modelId: string) {
  const [plan, setPlan] = useState<ContextPlan | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.llama
      .getContextPlan(modelId)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.plan) setPlan(result.plan);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  return { plan, failed };
}
