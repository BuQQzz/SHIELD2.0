/**
 * Model Sampling
 *
 * The sampling a model's makers recommend: from its GGUF file
 * (`general.sampling.*`, written by llama.cpp's converter and the
 * quantizers) or else SHIELD's catalog. One global setting did not suit
 * every model: Gemma 4 at temperature 0.21 with repeat penalty 1.1 wrote
 * "diag.ps1" as "dialect.ps1" and "Dg3" and ran to its 8,192-token limit,
 * where its file asks for temperature 1, top-k 64, top-p 0.95 and no repeat
 * penalty (2026-09-26).
 */

export interface SamplingValues {
  temperature: number;
  topK: number;
  topP: number;
  repeatPenalty: number;
}

export interface RecommendedSampling extends Partial<SamplingValues> {
  /** Where the values come from, for the settings panel */
  source: "model" | "catalog";
}

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** The file stores float32: 0.949999988079071 is 0.95 */
const tidy = (value: number | undefined) =>
  value === undefined ? undefined : Math.round(value * 1000) / 1000;

/** `general.sampling` as node-llama-cpp reads it from a GGUF's metadata */
export function samplingFromGguf(
  sampling: unknown
): RecommendedSampling | null {
  if (!sampling || typeof sampling !== "object") return null;
  const fields = sampling as Record<string, unknown>;
  const values = {
    temperature: tidy(finite(fields.temp)),
    topK: finite(fields.top_k),
    topP: tidy(finite(fields.top_p)),
    repeatPenalty: tidy(finite(fields.penalty_repeat)),
  };
  if (Object.values(values).every((value) => value === undefined)) {
    return null;
  }
  return { source: "model", ...values };
}

/**
 * The highest temperature a model's recommendation gets while tools are
 * available. Tool calls copy paths and names exactly: replaying one task
 * at Gemma's recommended 1.0, four of six runs mistyped a path ("tpc" for
 * "tmp", "SHEILD", "WiFi"), and with the thinking budget fixed one of three
 * still failed and one took 15 rounds; at 0.5 both runs were clean in four
 * (2026-09-26). The user chose the cap.
 */
export const TOOL_TEMPERATURE_CAP = 0.5;

/**
 * What a request uses: the model's recommendation where it gives one, the
 * user's setting where it does not. A model that states its sampling but
 * no repeat penalty gets none (1.0, llama.cpp's default) rather than the
 * user's: Gemma's file leaves it out, and the 1.1 it inherited mangled the
 * file names it had to repeat.
 */
export function effectiveSampling(
  user: SamplingValues,
  recommended: RecommendedSampling | null | undefined,
  { toolsAvailable = false }: { toolsAvailable?: boolean } = {}
): SamplingValues {
  if (!recommended) return user;
  const temperature = recommended.temperature ?? user.temperature;
  return {
    temperature: toolsAvailable
      ? Math.min(temperature, TOOL_TEMPERATURE_CAP)
      : temperature,
    topK: recommended.topK ?? user.topK,
    topP: recommended.topP ?? user.topP,
    repeatPenalty: recommended.repeatPenalty ?? 1,
  };
}

/** "temperature 1 · top-k 64 · top-p 0.95 · no repeat penalty" */
export function describeSampling(values: SamplingValues): string {
  return [
    `temperature ${values.temperature}`,
    `top-k ${values.topK}`,
    `top-p ${values.topP}`,
    values.repeatPenalty === 1
      ? "no repeat penalty"
      : `repeat penalty ${values.repeatPenalty}`,
  ].join(" · ");
}
