import { isRuntimeAvailable, type ModelOption } from "@/config/models";

/**
 * The model SHIELD selects at startup: the last one loaded, else the
 * default, else the first installed model it can run (an installed Bonsai
 * needs a runtime still to come). Undefined when none can run.
 */
export function pickStartupModel(
  installed: ModelOption[],
  lastModelId: string | undefined,
  defaultModelId: string
): ModelOption | undefined {
  const runnable = installed.filter(isRuntimeAvailable);
  return (
    runnable.find((m) => m.id === lastModelId) ??
    runnable.find((m) => m.id === defaultModelId) ??
    runnable[0]
  );
}
