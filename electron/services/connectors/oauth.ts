/**
 * Signing in to an online connector, in the user's own browser
 *
 * OAuth for a desktop app (RFC 8252): SHIELD opens the service's sign-in
 * page in the default browser, and the service sends the browser back to a
 * one-off listener on 127.0.0.1 with a code, which the MCP SDK trades for
 * tokens. SHIELD registers itself with the service the first time (dynamic
 * client registration), so the user never handles a client id.
 *
 * The SDK drives the flow through an OAuthClientProvider; this one keeps its
 * state in the ConnectorStore, encrypted.
 */

import http from "http";
import { randomBytes } from "crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { ConnectorStore } from "./ConnectorStore.js";

const CALLBACK_PATH = "/callback";

export function redirectUrlFor(port: number): string {
  return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
}

export class ConnectorOAuth implements OAuthClientProvider {
  /** Set once the SDK has asked for the browser sign-in */
  authorizationUrl: URL | null = null;
  private expectedState: string | null = null;

  constructor(
    private readonly id: string,
    private readonly store: ConnectorStore,
    private readonly port: number,
    /** Opens the sign-in page; null when no one is there to sign in */
    private readonly openBrowser: ((url: string) => void) | null
  ) {}

  get redirectUrl(): string {
    return redirectUrlFor(this.port);
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "SHIELD",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // A desktop app cannot keep a secret; PKCE protects the code instead
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    this.expectedState = randomBytes(16).toString("hex");
    return this.expectedState;
  }

  /** The state this sign-in must come back with */
  get pendingState(): string | null {
    return this.expectedState;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const client = this.store.getSecrets(this.id).oauth?.client as
      (OAuthClientInformationMixed & { redirect_uris?: string[] }) | undefined;
    if (!client) return undefined;
    // Registered for another port: the service would refuse this redirect
    const uris = client.redirect_uris;
    if (Array.isArray(uris) && !uris.includes(this.redirectUrl)) {
      return undefined;
    }
    return client;
  }

  saveClientInformation(client: OAuthClientInformationMixed): void {
    this.store.updateSecrets(this.id, (s) => {
      s.oauth = {
        ...s.oauth,
        client: client as Record<string, unknown>,
        redirectPort: this.port,
      };
    });
  }

  tokens(): OAuthTokens | undefined {
    return this.store.getSecrets(this.id).oauth?.tokens as
      OAuthTokens | undefined;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.store.updateSecrets(this.id, (s) => {
      s.oauth = { ...s.oauth, tokens: tokens as Record<string, unknown> };
    });
  }

  redirectToAuthorization(url: URL): void {
    this.authorizationUrl = url;
    // Only http(s): the address comes from the service's metadata
    if (this.openBrowser && /^https?:$/.test(url.protocol)) {
      this.openBrowser(url.toString());
    }
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.store.updateSecrets(this.id, (s) => {
      s.oauth = { ...s.oauth, codeVerifier };
    });
  }

  codeVerifier(): string {
    const verifier = this.store.getSecrets(this.id).oauth?.codeVerifier;
    if (!verifier) throw new Error("No sign-in is in progress");
    return verifier;
  }

  invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery"
  ): void {
    this.store.updateSecrets(this.id, (s) => {
      if (!s.oauth) return;
      if (scope === "all" || scope === "client") delete s.oauth.client;
      if (scope === "all" || scope === "tokens") delete s.oauth.tokens;
      if (scope === "all" || scope === "verifier") delete s.oauth.codeVerifier;
    });
  }
}

/** The page the browser shows once it has handed the code over */
function page(title: string, text: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:90vh;margin:0;background:#f6f6f4;color:#222">
<div style="text-align:center;max-width:28rem"><h1 style="font-size:1.25rem">${title}</h1><p>${text}</p></div></body>`;
}

export interface Loopback {
  port: number;
  /** Resolves with the code the service sent back for this state */
  waitForCode(state: () => string | null, timeoutMs: number): Promise<string>;
  close(): void;
}

/**
 * A listener on 127.0.0.1 for the browser's return. Tries `preferredPort`
 * first - the port the saved registration names - and else any free port.
 */
export async function startLoopback(preferredPort?: number): Promise<Loopback> {
  let deliver: ((query: URLSearchParams) => void) | null = null;
  let abandon: (() => void) | null = null;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    const failed = url.searchParams.get("error");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      failed
        ? page(
            "Sign-in did not finish",
            "You can close this tab and try again in SHIELD."
          )
        : page("Signed in", "You can close this tab and go back to SHIELD.")
    );
    deliver?.(url.searchParams);
  });

  const listen = (port: number) =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  try {
    await listen(preferredPort ?? 0);
  } catch {
    await listen(0);
  }
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    port,
    waitForCode: (state, timeoutMs) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          deliver = null;
          abandon = null;
          reject(new Error("Sign-in timed out. Try connecting again."));
        }, timeoutMs);
        abandon = () => {
          clearTimeout(timer);
          deliver = null;
          abandon = null;
          reject(new Error("Sign-in was cancelled"));
        };
        deliver = (query) => {
          const error = query.get("error");
          const code = query.get("code");
          const expected = state();
          if (expected && query.get("state") !== expected) return; // Not ours
          clearTimeout(timer);
          deliver = null;
          abandon = null;
          if (error) {
            reject(
              new Error(
                `Sign-in was not completed: ${query.get("error_description") ?? error}`
              )
            );
          } else if (code) {
            resolve(code);
          } else {
            reject(new Error("The service sent no sign-in code back."));
          }
        };
      }),
    /** Stops listening; a sign-in still waiting ends as cancelled */
    close: () => {
      abandon?.();
      server.close();
      server.closeAllConnections?.();
    },
  };
}
