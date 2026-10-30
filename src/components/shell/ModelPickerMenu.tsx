/**
 * The list both model pickers show: the installed models, then the hosted
 * ones.
 *
 * A hosted model the provider reports no zero-retention route for carries its
 * own switch. Turning it on allows that one model without dropping the
 * requirement for every other model of the provider (see cloudModels.ts and
 * ProviderStore.setAllowedModel); its replies are then marked "keeps data"
 * instead of "zero retention".
 */

import { useState } from "react";
import { Check, Cloud, Library } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { isRuntimeAvailable, type ModelOption } from "@/config/models";
import { useCloudStore } from "@/stores/cloud-store";

interface ModelPickerMenuProps {
  /** Installed models, and hosted ones (runtime "remote") */
  models: ModelOption[];
  currentModelId?: string;
  onSelect: (model: ModelOption) => void;
  onOpenLibrary: () => void;
  onOpenSettings?: () => void;
}

/** The per-model opt-out, next to a hosted model with no zero-retention route */
function ZdrAllowSwitch({
  providerId,
  providerName,
  modelId,
  allowed,
}: {
  providerId: string;
  providerName: string;
  modelId: string;
  allowed: boolean;
}) {
  const allowModel = useCloudStore((state) => state.allowModel);
  const [busy, setBusy] = useState(false);

  return (
    // The switch must not close the menu or choose the model by itself
    <span
      className="flex shrink-0 items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="text-[10px] text-muted-foreground">
        {allowed ? "Allowed" : "Allow"}
      </span>
      <Switch
        checked={allowed}
        disabled={busy}
        aria-label={
          allowed
            ? `Stop allowing ${modelId} without zero data retention`
            : `Use ${modelId} without zero data retention`
        }
        title={
          allowed
            ? `Allowed without zero retention. ${providerName} may keep what you send. Turn off to require it again.`
            : `${providerName} reports no zero-retention route for ${modelId}. Turn on to use it anyway: what you send may be kept.`
        }
        onCheckedChange={(next) => {
          setBusy(true);
          void allowModel(providerId, modelId, next).finally(() =>
            setBusy(false)
          );
        }}
      />
    </span>
  );
}

export function ModelPickerMenu({
  models,
  currentModelId,
  onSelect,
  onOpenLibrary,
  onOpenSettings,
}: ModelPickerMenuProps) {
  const providers = useCloudStore((state) => state.providers);
  const fetched = useCloudStore((state) => state.fetched);
  const fetching = useCloudStore((state) => state.fetching);

  const installed = models.filter((m) => m.runtime !== "remote");
  const cloud = models.filter((m) => m.runtime === "remote");
  const providersWithKey = providers.filter((p) => p.hasKey);
  const fetchErrors = providersWithKey.filter((p) => fetched[p.id]?.error);

  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Installed models
      </DropdownMenuLabel>
      {installed.length === 0 && (
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          Nothing installed yet. Get one from the library.
        </p>
      )}
      {installed.map((model) => {
        const runnable = isRuntimeAvailable(model);
        return (
          <DropdownMenuItem
            key={model.id}
            disabled={!runnable}
            onClick={() => onSelect(model)}
            className="flex items-center gap-2 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {model.displayName}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {runnable ? (
                  <span className="font-instrument">{model.size}</span>
                ) : (
                  "Needs PrismML's runtime - coming soon"
                )}
              </span>
            </span>
            {model.id === currentModelId && (
              <Check className="h-4 w-4 shrink-0 text-signal" />
            )}
          </DropdownMenuItem>
        );
      })}

      {(providersWithKey.length > 0 || cloud.length > 0) && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <Cloud className="h-3 w-3" />
            Cloud: what you send leaves this device
          </DropdownMenuLabel>
          {cloud.length === 0 && (
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              {fetching ? "Asking your providers…" : "No models listed."}
            </p>
          )}
          {cloud.map((model) => {
            const info = model.cloud;
            const blocked = info?.blocked;
            // A model with no zero-retention route: the switch decides, so a
            // click on the row itself must not try to load it yet
            const needsAllow = !!info?.noZdrRoute && !!info.zdrRequired;
            return (
              <DropdownMenuItem
                key={model.id}
                onSelect={(event) => {
                  if (needsAllow && !info?.zdrAllowed) {
                    event.preventDefault();
                    return;
                  }
                  onSelect(model);
                }}
                className="flex items-center gap-2 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {model.displayName}
                  </span>
                  <span
                    className="block truncate text-[11px] text-muted-foreground"
                    title={blocked}
                  >
                    {model.size}
                  </span>
                </span>
                {needsAllow && info && (
                  <ZdrAllowSwitch
                    providerId={info.providerId}
                    providerName={info.providerName}
                    modelId={model.displayName}
                    allowed={!!info.zdrAllowed}
                  />
                )}
                {model.id === currentModelId && (
                  <Check className="h-4 w-4 shrink-0 text-signal" />
                )}
              </DropdownMenuItem>
            );
          })}
          {fetchErrors.map((provider) => (
            <p key={provider.id} className="px-2 pb-2 text-xs text-destructive">
              {fetched[provider.id]?.error}
            </p>
          ))}
        </>
      )}

      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onOpenLibrary} className="gap-2 py-2">
        <Library className="h-4 w-4" />
        Open Model Library
      </DropdownMenuItem>
      {onOpenSettings && (
        <DropdownMenuItem onClick={onOpenSettings} className="gap-2 py-2">
          <Cloud className="h-4 w-4" />
          {providers.length === 0
            ? "Add a cloud provider…"
            : "Manage cloud providers…"}
        </DropdownMenuItem>
      )}
    </>
  );
}
