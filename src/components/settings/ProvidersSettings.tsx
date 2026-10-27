import { useEffect, useState } from "react";
import { Cloud, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCloudStore } from "@/stores/cloud-store";
import {
  PROVIDER_PRESETS,
  type ProviderPresetId,
  type ProviderSummary,
} from "@/types/providers";

interface FormProps {
  /** The provider being changed; none for a new one */
  initial?: ProviderSummary;
  encryptionAvailable: boolean;
  onDone: () => void;
}

function ProviderForm({ initial, encryptionAvailable, onDone }: FormProps) {
  const [presetId, setPresetId] = useState<ProviderPresetId>(
    initial?.presetId ?? "experiential"
  );
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId)!;
  const [name, setName] = useState(initial?.name ?? preset.name);
  const [nameEdited, setNameEdited] = useState(!!initial);
  const [baseUrl, setBaseUrl] = useState(
    initial && initial.baseUrl !== preset.baseUrl ? initial.baseUrl : ""
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [requireZdr, setRequireZdr] = useState(initial?.requireZdr ?? true);
  const [acknowledged, setAcknowledged] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choosePreset = (id: ProviderPresetId) => {
    setPresetId(id);
    const next = PROVIDER_PRESETS.find((p) => p.id === id)!;
    if (!nameEdited) setName(next.name);
    setBaseUrl("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await window.providers.save(
        {
          id: initial?.id,
          name,
          presetId,
          baseUrl: baseUrl.trim() || undefined,
          requireZdr: preset.supportsZdr && requireZdr,
          acknowledged,
        },
        apiKey.trim() || undefined
      );
      if (!result.success) {
        setError(result.error ?? "Could not save the provider.");
        return;
      }
      setApiKey("");
      const store = useCloudStore.getState();
      await store.loadProviders();
      // Shows at once whether the key works
      await store.fetchModels(true);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {!initial && (
        <div className="flex gap-2">
          {PROVIDER_PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={p.id === presetId ? "default" : "outline"}
              onClick={() => choosePreset(p.id)}
            >
              {p.name}
            </Button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{preset.note}</p>

      <div className="space-y-1">
        <Label htmlFor="provider-name">Name</Label>
        <Input
          id="provider-name"
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setNameEdited(true);
          }}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="provider-url">Address</Label>
        <Input
          id="provider-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={preset.baseUrl || "https://api.example.com/v1"}
        />
        {preset.baseUrl && (
          <p className="text-xs text-muted-foreground">
            Leave empty for {preset.baseUrl}. A self-hosted gateway on this
            computer can use http://127.0.0.1:8000/v1.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="provider-key">API key</Label>
        <div className="relative">
          <Input
            id="provider-key"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              initial
                ? `Saved, ending ${initial.keyHint}. Leave empty to keep it.`
                : "Paste your key"
            }
            className="pr-10"
            disabled={!encryptionAvailable}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          >
            {showKey ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {encryptionAvailable
            ? "Encrypted with your system's credential store. It stays in SHIELD's main process and is never shown again."
            : "This system cannot encrypt keys, so SHIELD will not save one."}
        </p>
      </div>

      {preset.supportsZdr && (
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="provider-zdr">Require zero data retention</Label>
            <p className="text-xs text-muted-foreground">
              Each request asks to be routed only through providers that keep no
              copy of it, and SHIELD throws away any reply the gateway does not
              confirm as served that way. Needs a Pro plan.
            </p>
          </div>
          <Switch
            id="provider-zdr"
            checked={requireZdr}
            onCheckedChange={setRequireZdr}
          />
        </div>
      )}

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I understand that my messages, and the contents of any files the model
          reads, are sent to this provider. Models that run on this computer
          never send anything.
        </span>
      </label>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={saving || !name.trim() || !acknowledged}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

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
