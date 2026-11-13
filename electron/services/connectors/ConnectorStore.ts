/**
 * The user's connectors and their secrets
 *
 * A JSON file in the app's data folder. A connector's secrets - its token,
 * the values of its environment variables, its OAuth sign-in - are one
 * object, encrypted with the system's credential store before it is written
 * (as ProviderStore does with API keys). Where the system cannot encrypt,
 * secrets are kept in memory for this run only and never written in plain
 * text: the user signs in again after a restart.
 */

import fs from "fs";
import path from "path";
import type { KeyCipher } from "../ProviderStore.js";
import type { ConnectorConfig } from "../../../src/config/connectors.js";

/** Everything secret about one connector */
export interface ConnectorSecrets {
  /** Sent as `Authorization: Bearer` (token auth, or a manual address) */
  token?: string;
  /** Environment of a local server */
  env?: Record<string, string>;
  oauth?: {
    /** The registration the server gave SHIELD (client_id, ...) */
    client?: Record<string, unknown>;
    tokens?: Record<string, unknown>;
    codeVerifier?: string;
    /** The loopback port the registration's redirect address names */
    redirectPort?: number;
  };
}

interface StoreFile {
  version: 1;
  connectors: Array<ConnectorConfig & { secrets?: string }>;
}

export class ConnectorStore {
  private configs: ConnectorConfig[] = [];
  private secrets = new Map<string, ConnectorSecrets>();
  private loaded = false;

  constructor(
    private readonly file: string,
    private readonly cipher: KeyCipher
  ) {}

  /** Whether secrets outlive this run */
  canPersistSecrets(): boolean {
    try {
      return this.cipher.isAvailable();
    } catch {
      return false;
    }
  }

  list(): ConnectorConfig[] {
    this.load();
    return this.configs.map((config) => ({ ...config }));
  }

  get(id: string): ConnectorConfig | undefined {
    this.load();
    const config = this.configs.find((c) => c.id === id);
    return config ? { ...config } : undefined;
  }

  /** Adds or replaces a connector */
  put(config: ConnectorConfig): void {
    this.load();
    const at = this.configs.findIndex((c) => c.id === config.id);
    if (at >= 0) this.configs[at] = { ...config };
    else this.configs.push({ ...config });
    this.save();
  }

  remove(id: string): void {
    this.load();
    this.configs = this.configs.filter((c) => c.id !== id);
    this.secrets.delete(id);
    this.save();
  }

  getSecrets(id: string): ConnectorSecrets {
    this.load();
    return structuredClone(this.secrets.get(id) ?? {});
  }

  /** Changes a connector's secrets; the change is saved at once */
  updateSecrets(id: string, change: (s: ConnectorSecrets) => void): void {
    this.load();
    const next = this.getSecrets(id);
    change(next);
    this.secrets.set(id, next);
    this.save();
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    let parsed: StoreFile;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as StoreFile;
    } catch {
      return; // No file yet, or unreadable: start empty
    }
    if (!Array.isArray(parsed?.connectors)) return;
    for (const { secrets, ...config } of parsed.connectors) {
      this.configs.push(config as ConnectorConfig);
      if (secrets && this.canPersistSecrets()) {
        try {
          const plain = this.cipher.decrypt(Buffer.from(secrets, "base64"));
          this.secrets.set(config.id, JSON.parse(plain) as ConnectorSecrets);
        } catch (error) {
          console.error(
            `[ConnectorStore] Could not read the saved sign-in of ${config.id}:`,
            error
          );
        }
      }
    }
  }

  private save(): void {
    const persist = this.canPersistSecrets();
    const file: StoreFile = {
      version: 1,
      connectors: this.configs.map((config) => {
        const secrets = this.secrets.get(config.id);
        const empty = !secrets || Object.keys(secrets).length === 0;
        return persist && !empty
          ? {
              ...config,
              secrets: this.cipher
                .encrypt(JSON.stringify(secrets))
                .toString("base64"),
            }
          : config;
      }),
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(file, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
}
