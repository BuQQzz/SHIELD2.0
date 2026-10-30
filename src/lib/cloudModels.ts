/**
 * Hosted models as the model pickers list them
 *
 * A provider's models are not in SHIELD's library; they come from the
 * provider's own list and are shown next to the installed ones, marked as
 * cloud. The list is read when the user asks for it (opening the picker,
 * Settings): SHIELD does not contact a provider at startup.
 */

import type { ModelCapabilities, ModelOption } from "@/config/models";
import {
  parseRemoteModelId,
  remoteModelId,
} from "@/services/remote/remoteEndpoint";
import { zdrBlock } from "@/services/remote/remoteModels";
import type { ProviderSummary, RemoteModel } from "@/types/providers";

/** What one provider's model list came back as */
export interface FetchedModels {
  models: RemoteModel[];
  error?: string;
}

/**
 * Hosted models are assumed capable: nothing here can tell a small model from
 * a large one, and the warnings these flags drive are about local models
 * that were not made for tools.
 */
const HOSTED_CAPABILITIES: ModelCapabilities = {
  toolCalling: true,
  complexReasoning: true,
  webSearch: true,
  structuredOutput: true,
  longContext: true,
  codeGeneration: true,
  multilingual: "good",
  temperatureRange: { min: 0, max: 1, default: 0.7 },
};

/** The line under a hosted model's name */
export function cloudLine(option: Pick<ModelOption, "cloud">): string {
  const cloud = option.cloud;
  if (!cloud) return "";
  if (cloud.blocked) return `${cloud.providerName} · no zero-retention route`;
  if (cloud.zdrRequired && cloud.noZdrRoute && cloud.zdrAllowed)
    return `${cloud.providerName} · no zero retention (you allowed it)`;
  if (cloud.zdrRequired) return `${cloud.providerName} · zero retention`;
  return `${cloud.providerName} · cloud`;
}

function optionFor(provider: ProviderSummary, model: RemoteModel): ModelOption {
  const id = remoteModelId(provider.id, model.id);
  // The provider itself says no route for this model keeps nothing
  const noZdrRoute = model.zdr === false && model.zdrOnRequest !== true;
  const zdrAllowed = (provider.allowNoZdr ?? []).includes(model.id);
  const blocked =
    provider.requireZdr && !zdrAllowed
      ? zdrBlock(provider.name, model)
      : undefined;
  const option: ModelOption = {
    id,
    // The id, not the model's name: it is what the prompt builder reads to
    // tell a hosted model from a local one of the same name
    name: id,
    displayName: model.id,
    uri: id,
    size: "",
    description: `Runs at ${provider.name}. What you send leaves this device.`,
    contextSize: model.contextLength ?? provider.defaultContext,
    capabilities: HOSTED_CAPABILITIES,
    runtime: "remote",
    cloud: {
      providerId: provider.id,
      providerName: provider.name,
      zdrRequired: provider.requireZdr,
      zdr: model.zdr,
      noZdrRoute,
      zdrAllowed,
      blocked: blocked
        ? `No zero-retention route. Turn on the switch to use it anyway, or pick another model.`
        : undefined,
    },
  };
  option.size = cloudLine(option);
  return option;
}

/**
 * Every hosted model of the providers that have a key. `current` is the
 * loaded model if it is a hosted one: it is listed even before (or without)
 * a fetch of its provider's models, so the header can name it.
 */
export function cloudModelOptions(
  providers: ProviderSummary[],
  fetched: Record<string, FetchedModels | undefined>,
  current?: { id: string; contextSize?: number } | null
): ModelOption[] {
  const options: ModelOption[] = [];
  for (const provider of providers) {
    if (!provider.hasKey) continue;
    for (const model of fetched[provider.id]?.models ?? []) {
      options.push(optionFor(provider, model));
    }
  }

  const loaded = current ? parseRemoteModelId(current.id) : null;
  if (current && loaded && !options.some((o) => o.id === current.id)) {
    const provider = providers.find((p) => p.id === loaded.providerId);
    if (provider) {
      options.unshift({
        ...optionFor(provider, {
          id: loaded.model,
          contextLength: current.contextSize,
        }),
      });
    }
  }
  return options;
}
