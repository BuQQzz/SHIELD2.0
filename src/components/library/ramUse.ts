import type { ContextPlan } from "@/types/electron";

/** Below this a model's RAM use is not worth a label */
export const RAM_LABEL_MIN_BYTES = 1024 ** 3;
/** A smaller context is offered only if it saves at least this much */
const LIGHTER_SAVING_BYTES = 2 * 1024 ** 3;

export interface RamUse {
  /** The context size the model loads with */
  contextSize: number;
  ramBytes: number;
  /** The largest smaller context that saves a meaningful amount of RAM */
  lighter?: { contextSize: number; ramBytes: number };
}

/**
 * How much system RAM a model keeps resident at the context it loads with
 * (`chosen`, else the recommended size). Null when it barely uses any.
 */
export function describeRamUse(
  plan: ContextPlan,
  chosen?: number
): RamUse | null {
  const size = chosen ?? plan.recommended;
  const current =
    plan.options.find((o) => o.contextSize >= size) ?? plan.options.at(-1);
  const ramBytes = current?.memory?.ramBytes;
  if (!current || ramBytes === undefined || ramBytes < RAM_LABEL_MIN_BYTES) {
    return null;
  }

  const lighter = plan.options
    .filter(
      (o) =>
        o.contextSize < current.contextSize &&
        o.memory !== undefined &&
        ramBytes - o.memory.ramBytes >= LIGHTER_SAVING_BYTES
    )
    .at(-1);

  return {
    contextSize: current.contextSize,
    ramBytes,
    lighter: lighter?.memory && {
      contextSize: lighter.contextSize,
      ramBytes: lighter.memory.ramBytes,
    },
  };
}
