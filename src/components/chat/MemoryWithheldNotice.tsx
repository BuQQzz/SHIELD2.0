/**
 * Above the input, for a hosted model whose requests are not held to zero
 * retention: the user's memory (notes, recalled conversations, the memory
 * search tools) is not sent to it, and one click shares it with this model.
 * Once shared, the line says so and offers to stop.
 */

import { Brain } from "lucide-react";
import type { ModelOption } from "@/config/models";
import { useCloudStore } from "@/stores/cloud-store";

export function MemoryWithheldNotice({ model }: { model?: ModelOption }) {
  const shareMemory = useCloudStore((state) => state.shareMemory);
  const cloud = model?.cloud;
  if (!model || !cloud || cloud.zdrHeld) return null;
  const shared = !!cloud.memoryShared;
  const button =
    "shrink-0 rounded px-1.5 py-0.5 text-foreground underline-offset-2 hover:underline";
  return (
    <div
      className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 text-xs text-muted-foreground"
      data-memory-withheld={shared ? "shared" : "withheld"}
    >
      <Brain className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {shared
          ? `Your memory is shared with ${model.displayName}, which may keep what it is sent.`
          : `Your memory is not sent to ${model.displayName}: its requests are not held to zero retention, so ${cloud.providerName} may keep them.`}
      </span>
      <button
        className={button}
        onClick={() =>
          void shareMemory(cloud.providerId, model.displayName, !shared)
        }
      >
        {shared ? "Stop sharing" : "Share with this model"}
      </button>
    </div>
  );
}
