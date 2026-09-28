/**
 * Code Model Hint
 *
 * Code sessions work best with a coding model. Switching views never loads
 * one - a load takes ~20 s and a lot of memory, and the user chose not to
 * (2026-09-26) - so a chat model in a Code session gets a quiet suggestion.
 * Gemma 4 12B finished a 13-file task but misspelled names and contradicted
 * itself where Qwen3-Coder did not.
 */

import { Code2 } from "lucide-react";
import type { ModelOption } from "@/config/models";
import { isCodingModel } from "@/lib/sessions";

interface CodeModelHintProps {
  currentModelId?: string;
  /** Installed models, to suggest one */
  models: ModelOption[];
  onLoad: (model: ModelOption) => void;
}

export function CodeModelHint({
  currentModelId,
  models,
  onLoad,
}: CodeModelHintProps) {
  if (!currentModelId || isCodingModel(currentModelId)) return null;
  const coder = models.find((model) => isCodingModel(model.id));
  if (!coder) return null;
  const current = models.find((model) => model.id === currentModelId);

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 text-xs text-muted-foreground">
      <Code2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {current?.displayName ?? "This model"} is made for chat;{" "}
        {coder.displayName} is better at code.
      </span>
      <button
        onClick={() => onLoad(coder)}
        className="shrink-0 rounded px-1.5 py-0.5 text-foreground underline-offset-2 hover:underline"
      >
        Load {coder.displayName}
      </button>
    </div>
  );
}
