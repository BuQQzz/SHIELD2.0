/**
 * Saved remote providers and their keys
 *
 * The provider list is a JSON file in the app's data folder. Each key is
 * encrypted with the operating system's credential store (Electron's
 * safeStorage: DPAPI on Windows) before it is written, and only the main
 * process ever decrypts it: the renderer gets a summary that says whether a
 * key is saved and shows its last four characters. Where the system cannot
 * encrypt, no key is saved at all - never one in plain text.
 */

import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import {
  PROVIDER_PRESETS,
  type ProviderConfig,
  type ProviderInput,
  type ProviderSummary,
} from "../../src/types/providers.js";
import {
  normaliseBaseUrl,
  type RemoteProviderSource,
} from "../../src/services/remote/remoteEndpoint.js";

/** The system's encryption; Electron's safeStorage in the app */
export interface KeyCipher {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(encrypted: Buffer): string;
}

interface StoredProvider extends ProviderConfig {
  /** The key, encrypted, as base64 */
  key?: string;
  keyHint?: string;
}

interface StoreFile {
  version: 1;
  providers: StoredProvider[];
}

const DEFAULT_CONTEXT = 32768;
const MIN_CONTEXT = 4096;
const MAX_CONTEXT = 2_000_000;

function slug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return base || "provider";
}

function cleanKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) throw new Error("Enter the API key.");
  const odd = [...key].some((c) => {
    const code = c.charCodeAt(0);
    return code < 32 || code === 127 || /\s/.test(c);
  });
  if (key.length > 512 || odd) {
    throw new Error("That does not look like an API key.");
  }
  return key;
}

export class ProviderStore implements RemoteProviderSource {
  constructor(
    private readonly file: string,
    private readonly cipher: KeyCipher
  ) {}

  /** Whether a key can be saved here */
  encryptionAvailable(): boolean {
    try {
      return this.cipher.isAvailable();
    } catch {
      return false;
    }
  }

  private read(): StoredProvider[] {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(this.file, "utf8")
      ) as Partial<StoreFile>;
      return Array.isArray(parsed.providers) ? parsed.providers : [];
    } catch {
      return [];
    }
  }

  private write(providers: StoredProvider[]): void {
    const data: StoreFile = { version: 1, providers };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  private static summary(stored: StoredProvider): ProviderSummary {
    const { key, keyHint, ...config } = stored;
    return { ...config, hasKey: !!key, keyHint: keyHint ?? "" };
  }

  list(): ProviderSummary[] {
    return this.read().map(ProviderStore.summary);
  }

  /**
   * Save a new provider (a key is required) or change one. Without `apiKey`
   * a saved provider keeps its key.
   */
  save(input: ProviderInput, apiKey?: string): ProviderSummary {
    const name = input.name.trim();
    if (!name || name.length > 60) {
      throw new Error("Give the provider a name of up to 60 characters.");
    }
    const preset = PROVIDER_PRESETS.find((p) => p.id === input.presetId);
    if (!preset) throw new Error("Unknown provider type.");
    if (!input.acknowledged) {
      throw new Error(
        "Confirm that your messages, and any files the model reads, will be sent to this provider."
      );
    }
    const baseUrl = normaliseBaseUrl(input.baseUrl?.trim() || preset.baseUrl);

    const providers = this.read();
    const existing = input.id
      ? providers.find((p) => p.id === input.id)
      : undefined;
    if (input.id && !existing) throw new Error("That provider is gone.");

    const stored: StoredProvider = {
      id: existing?.id ?? this.newId(name, providers),
      name,
      presetId: preset.id,
      baseUrl,
      // Only a preset that can report how it served a request can be held to it
      requireZdr: preset.supportsZdr && input.requireZdr,
      defaultContext: Math.min(
        MAX_CONTEXT,
        Math.max(MIN_CONTEXT, input.defaultContext ?? DEFAULT_CONTEXT)
      ),
      acknowledgedAt: existing?.acknowledgedAt || new Date().toISOString(),
      key: existing?.key,
      keyHint: existing?.keyHint,
    };

    if (apiKey !== undefined) {
      if (!this.encryptionAvailable()) {
        throw new Error(
          "This system cannot encrypt keys, so SHIELD will not save one."
        );
      }
      const key = cleanKey(apiKey);
      stored.key = this.cipher.encrypt(key).toString("base64");
      stored.keyHint = key.slice(-4);
    } else if (!stored.key) {
      throw new Error("Enter the API key.");
    }

    this.write(
      existing
        ? providers.map((p) => (p.id === stored.id ? stored : p))
        : [...providers, stored]
    );
    return ProviderStore.summary(stored);
  }

  remove(id: string): boolean {
    const providers = this.read();
    const kept = providers.filter((p) => p.id !== id);
    if (kept.length === providers.length) return false;
    this.write(kept);
    return true;
  }

  /** The provider and its decrypted key; for the main process only */
  resolve(id: string): { config: ProviderConfig; apiKey: string } | undefined {
    const stored = this.read().find((p) => p.id === id);
    if (!stored?.key) return undefined;
    try {
      const apiKey = this.cipher.decrypt(Buffer.from(stored.key, "base64"));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key, keyHint, ...config } = stored;
      return { config, apiKey };
    } catch (error) {
      // A key written under another Windows account cannot be read back
      console.warn(
        `[ProviderStore] Could not decrypt the key of ${id}:`,
        error instanceof Error ? error.message : error
      );
      return undefined;
    }
  }

  private newId(name: string, providers: StoredProvider[]): string {
    for (;;) {
      const id = `${slug(name)}-${randomBytes(2).toString("hex")}`;
      if (!providers.some((p) => p.id === id)) return id;
    }
  }
}
