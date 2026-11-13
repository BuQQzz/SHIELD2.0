import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Loader2,
  Plug,
  Plus,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  splitArgs,
  type CatalogEntry,
  type ConnectorSummary,
  type ManualConnectorInput,
} from "@/config/connectors";

const api = () => window.electronAPI?.connectors;

/** The connectors and catalog, kept in step with the main process */
function useConnectors() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [canSaveSecrets, setCanSaveSecrets] = useState(true);

  const refresh = useCallback(async () => {
    const result = await api()?.list();
    if (result?.success) setConnectors(result.connectors);
  }, []);

  useEffect(() => {
    void api()
      ?.catalog()
      .then((result) => {
        if (!result?.success) return;
        setCatalog(result.catalog);
        setCanSaveSecrets(result.canSaveSecrets);
      });
    void refresh();
    return api()?.onChanged(() => void refresh());
  }, [refresh]);

  return { catalog, connectors, canSaveSecrets };
}

/** Shows a failed call's message; true when it worked */
function report(result: { success: boolean; error?: string } | undefined) {
  if (result && !result.success)
    toast.error(result.error ?? "Something went wrong");
  return Boolean(result?.success);
}

export function ConnectorsSection({ contextSize }: { contextSize?: number }) {
  const { catalog, connectors, canSaveSecrets } = useConnectors();
  const [manualOpen, setManualOpen] = useState(false);

  const added = useMemo(
    () => new Set(connectors.map((c) => c.catalogId).filter(Boolean)),
    [connectors]
  );
  const available = catalog.filter((entry) => !added.has(entry.id));
  const toolTokens = connectors
    .filter((c) => c.state === "connected")
    .reduce((sum, c) => sum + c.toolTokens, 0);

  return (
    <div className="space-y-8">
      {!canSaveSecrets && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This system has no keyring to encrypt sign-ins with, so SHIELD keeps
          them only until it closes. You will sign in again next time.
        </p>
      )}

      {connectors.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Connected services</h2>
            {toolTokens > 0 && (
              <span className="text-xs text-muted-foreground">
                Their tools use about {toolTokens.toLocaleString()} tokens of
                every request
                {contextSize
                  ? ` (${Math.round((toolTokens / contextSize) * 100)}% of the model's ${Math.round(contextSize / 1024)}K window)`
                  : ""}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {connectors.map((connector) => (
              <ConnectorCard key={connector.id} connector={connector} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Add a service</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setManualOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add your own server
          </Button>
        </div>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every service in the list is added.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {available.map((entry) => (
              <CatalogCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <ManualDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}

function CatalogCard({ entry }: { entry: CatalogEntry }) {
  const [busy, setBusy] = useState(false);
  const [askToken, setAskToken] = useState(false);
  const [token, setToken] = useState("");

  const connect = async () => {
    if (entry.auth === "token" && !token.trim()) {
      setAskToken(true);
      return;
    }
    setBusy(true);
    const result = await api()?.addFromCatalog(entry.id, token || undefined);
    setBusy(false);
    if (report(result)) {
      setToken("");
      setAskToken(false);
    }
  };

  return (
    <div className="rounded-2xl bg-background p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-signal-soft">
          <Plug className="h-4 w-4 text-signal" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{entry.name}</h3>
          <p className="text-xs text-muted-foreground">{entry.description}</p>
        </div>
        <Button size="sm" onClick={connect} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
        </Button>
      </div>
      {entry.auth === "oauth" && busy && (
        <p className="mt-3 text-xs text-muted-foreground">
          Finish signing in in your browser, then come back here.
        </p>
      )}
      {askToken && entry.tokenHelp && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {entry.tokenHelp.text}{" "}
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-signal hover:underline"
              onClick={() =>
                void window.electronAPI.system.openExternal(
                  entry.tokenHelp!.url
                )
              }
            >
              Create one <ExternalLink className="h-3 w-3" />
            </button>
          </p>
          <Input
            type="password"
            placeholder="Paste the token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void connect()}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

function StateLine({ connector }: { connector: ConnectorSummary }) {
  const tools = connector.tools.length - connector.disabledTools.length;
  switch (connector.state) {
    case "connected":
      return (
        <span className="text-emerald-600 dark:text-emerald-400">
          Connected · {tools} tool{tools === 1 ? "" : "s"} on
        </span>
      );
    case "connecting":
      return <span>Connecting...</span>;
    case "signing-in":
      return <span>Waiting for you to sign in in the browser...</span>;
    case "needs-auth":
      return (
        <span className="text-amber-600 dark:text-amber-400">
          Needs you to sign in
        </span>
      );
    case "error":
      return (
        <span className="text-destructive">
          Could not connect{connector.error ? `: ${connector.error}` : ""}
        </span>
      );
    default:
      return <span>Off</span>;
  }
}

function ConnectorCard({ connector }: { connector: ConnectorSummary }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const disabled = new Set(connector.disabledTools);
  const canConnect =
    connector.enabled &&
    (connector.state === "needs-auth" || connector.state === "error");
  const signedIn =
    connector.kind === "remote" &&
    connector.auth !== "none" &&
    connector.hasCredentials;

  const run = async (
    action: () => Promise<{ success: boolean; error?: string }> | undefined
  ) => {
    setBusy(true);
    report(await action());
    setBusy(false);
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-background shadow-card">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-signal-soft">
          {connector.kind === "local" ? (
            <Terminal className="h-4 w-4 text-signal" />
          ) : (
            <Plug className="h-4 w-4 text-signal" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{connector.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            <StateLine connector={connector} />
          </p>
        </div>
        {canConnect && (
          <Button
            size="sm"
            onClick={() => run(() => api()?.connect(connector.id))}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : connector.state === "needs-auth" ? (
              "Sign in"
            ) : (
              "Retry"
            )}
          </Button>
        )}
        <Switch
          checked={connector.enabled}
          onCheckedChange={(enabled) =>
            void run(() => api()?.setEnabled(connector.id, enabled))
          }
          aria-label={`Use ${connector.name}`}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
          aria-label="Details"
          aria-expanded={open}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="space-y-4 bg-muted/30 px-5 py-4">
          <p className="break-all text-xs text-muted-foreground">
            {connector.kind === "remote"
              ? connector.url
              : [connector.command, ...connector.args].join(" ")}
          </p>

          {connector.tools.length > 0 ? (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <Label className="text-xs">Tools the model may use</Label>
                <span className="text-xs text-muted-foreground">
                  ~{connector.toolTokens.toLocaleString()} tokens
                </span>
              </div>
              <ul className="space-y-1.5">
                {connector.tools.map((tool) => (
                  <li key={tool.name} className="flex items-start gap-3">
                    <Switch
                      className="mt-0.5"
                      checked={!disabled.has(tool.name)}
                      onCheckedChange={(on) =>
                        void api()?.setToolEnabled(connector.id, tool.name, on)
                      }
                      aria-label={tool.name}
                    />
                    <div className="min-w-0">
                      <span className="font-mono text-xs">{tool.name}</span>
                      {!tool.readOnly && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          can change things
                        </span>
                      )}
                      {tool.description && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Its tools show here once it is connected.
            </p>
          )}

          <div className="flex gap-2">
            {signedIn && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => run(() => api()?.signOut(connector.id))}
              >
                Sign out
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive"
              onClick={() => run(() => api()?.remove(connector.id))}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "KEY=value" lines into an object; lines without "=" are skipped */
function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) env[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return env;
}

function ManualDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<"remote" | "local">("remote");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [command, setCommand] = useState("");
  const [env, setEnv] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setUrl("");
    setToken("");
    setCommand("");
    setEnv("");
  };

  const add = async () => {
    let input: ManualConnectorInput;
    if (kind === "remote") {
      input = { kind, name, url, token: token || undefined };
    } else {
      const [cmd = "", ...args] = splitArgs(command);
      input = { kind, name, command: cmd, args, env: parseEnv(env) };
    }
    setBusy(true);
    const result = await api()?.addManual(input);
    setBusy(false);
    if (report(result)) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add your own server</DialogTitle>
          <DialogDescription>
            Any MCP server: an online one by its address, or one SHIELD starts
            on this PC.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["remote", "Online"],
              ["local", "On this PC"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
                kind === value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="connector-name">Name</Label>
            <Input
              id="connector-name"
              placeholder={kind === "remote" ? "My server" : "Git"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {kind === "remote" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="connector-url">Address</Label>
                <Input
                  id="connector-url"
                  placeholder="https://example.com/mcp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connector-token">Token (optional)</Label>
                <Input
                  id="connector-token"
                  type="password"
                  placeholder="Leave empty to sign in in the browser if it asks"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="connector-command">Command</Label>
                <Input
                  id="connector-command"
                  className="font-mono text-xs"
                  placeholder="npx -y @modelcontextprotocol/server-memory"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="connector-env">
                  Environment variables (optional, one KEY=value per line)
                </Label>
                <Textarea
                  id="connector-env"
                  className="font-mono text-xs"
                  rows={3}
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                />
              </div>
              <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                SHIELD runs this command with your account's access. Add only
                servers you trust. Its tools still ask before they run, except
                in modes that run everything.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={add} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Add and connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
