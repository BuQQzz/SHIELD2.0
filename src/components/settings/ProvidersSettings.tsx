import { useEffect, useState } from "react";
import { Cloud, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCloudStore } from "@/stores/cloud-store";
import type { ProviderSummary } from "@/types/providers";
import { ProviderForm } from "./ProviderForm";

export function ProvidersSettings() {
  const providers = useCloudStore((state) => state.providers);
  const encryptionAvailable = useCloudStore(
    (state) => state.encryptionAvailable
  );
  const fetched = useCloudStore((state) => state.fetched);
  const fetching = useCloudStore((state) => state.fetching);
  const loadProviders = useCloudStore((state) => state.loadProviders);
  const fetchModels = useCloudStore((state) => state.fetchModels);
  const [editing, setEditing] = useState<ProviderSummary | "new" | null>(null);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const remove = async (provider: ProviderSummary) => {
    if (
      !confirm(
        `Remove ${provider.name}? Its saved key is deleted from this computer.`
      )
    ) {
      return;
    }
    await window.providers.remove(provider.id);
    await loadProviders();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
        <Cloud className="mt-0.5 h-5 w-5 text-primary" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">Cloud providers</p>
          <p className="text-xs text-muted-foreground">
            Run SHIELD on a hosted model with your own API key. Everything you
            send goes to the provider, including files the model reads with its
            tools; models on this computer never send anything. SHIELD talks to
            a provider only when you pick one of its models or open this list.
          </p>
        </div>
      </div>

      {providers.map((provider) => {
        const result = fetched[provider.id];
        return (
          <div
            key={provider.id}
            className="flex items-start justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-medium">{provider.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {provider.baseUrl} · key ending {provider.keyHint}
              </p>
              <p className="text-xs text-muted-foreground">
                {provider.requireZdr
                  ? "Zero data retention required"
                  : "Zero data retention not required"}
                {provider.requireZdr && provider.allowNoZdr?.length
                  ? ` · ${provider.allowNoZdr.length} model${provider.allowNoZdr.length === 1 ? "" : "s"} allowed without it`
                  : ""}
                {result && !result.error && ` · ${result.models.length} models`}
              </p>
              {result?.error && (
                <p className="text-xs text-destructive">{result.error}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void fetchModels(true)}
                disabled={fetching}
              >
                {fetching ? "Checking…" : "Check"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Edit"
                onClick={() => setEditing(provider)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Remove"
                onClick={() => void remove(provider)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}

      {editing ? (
        <ProviderForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? undefined : editing}
          encryptionAvailable={encryptionAvailable}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing("new")}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add a provider
        </Button>
      )}
    </div>
  );
}
