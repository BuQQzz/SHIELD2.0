/**
 * Remote model providers: an OpenAI-compatible API the user connects with
 * their own key, so the harness can run on a hosted model.
 *
 * SHIELD is local-first, so a remote provider is something the user chooses
 * on purpose: the messages, and whatever the model reads with its tools, leave
 * the device. These types are shared by the main process, which holds the keys
 * and talks to the provider, and the renderer, which never sees a key.
 */

/** Presets fill in a provider's address and what SHIELD can ask it for */
export type ProviderPresetId = "experiential" | "custom";

export interface ProviderPreset {
  id: ProviderPresetId;
  name: string;
  baseUrl: string;
  /**
   * The provider can be told to route a request only to providers that keep
   * no copy of it, and says which route served it (see remoteEndpoint.ts).
   */
  supportsZdr: boolean;
  /** One line under the preset in the form */
  note: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "experiential",
    name: "Experiential Labs",
    baseUrl: "https://api.experientiallabs.ai/v1",
    supportsZdr: true,
    note: "A gateway to hosted models. Can route only to zero-data-retention providers.",
  },
  {
    id: "custom",
    name: "Other OpenAI-compatible API",
    baseUrl: "",
    supportsZdr: false,
    note: "Any server that speaks the OpenAI chat completions API.",
  },
];

/** What the user entered; the key is kept apart, in the main process */
export interface ProviderConfig {
  /** Lowercase letters, digits and dashes: it goes into model ids */
  id: string;
  name: string;
  presetId: ProviderPresetId;
  /** Ends in /v1 or the like, without a trailing slash */
  baseUrl: string;
  /**
   * Only use the provider when it confirms a request was served with zero
   * data retention. Meaningful only for a preset that supportsZdr.
   */
  requireZdr: boolean;
  /** Context window to assume for a model that does not report one */
  defaultContext: number;
  /** When the user accepted that their messages leave the device (ISO) */
  acknowledgedAt: string;
}

/** What the user fills in to add or change a provider */
export interface ProviderInput {
  /** Set to change a saved provider */
  id?: string;
  name: string;
  presetId: ProviderPresetId;
  /** Empty means the preset's address */
  baseUrl?: string;
  requireZdr: boolean;
  defaultContext?: number;
  /** The user accepted that their messages leave the device */
  acknowledged: boolean;
}

/** What the renderer gets: the config, and whether a key is saved */
export interface ProviderSummary extends ProviderConfig {
  hasKey: boolean;
  /** The last four characters of the key, to tell keys apart */
  keyHint: string;
}

/** A model a provider offers, as its model list describes it */
export interface RemoteModel {
  /** The id to send as `model` */
  id: string;
  contextLength?: number;
  /** Every route for this model keeps no copy of a request */
  zdr?: boolean;
  /** Some route does, and a request can ask for it */
  zdrOnRequest?: boolean;
  noTraining?: boolean;
}

/** Why a request was not served the way it was asked to be */
export interface ProviderTestResult {
  ok: boolean;
  /** What went wrong, in a sentence the user can read */
  error?: string;
  models?: RemoteModel[];
}
