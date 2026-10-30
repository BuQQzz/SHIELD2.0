// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderStore, type KeyCipher } from "./ProviderStore";
import type { ProviderInput } from "../../src/types/providers";

/** Not encryption, but reversible and unlike the plain text: enough to test the store */
function fakeCipher(available = true): KeyCipher {
  return {
    isAvailable: () => available,
    encrypt: (plain) => Buffer.from(`enc(${[...plain].reverse().join("")})`),
    decrypt: (data) => [...data.toString().slice(4, -1)].reverse().join(""),
  };
}

const experiential: ProviderInput = {
  name: "Experiential Labs",
  presetId: "experiential",
  requireZdr: true,
  acknowledged: true,
};

describe("ProviderStore", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "shield-providers-"));
    file = path.join(dir, "providers.json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("saves a provider with the preset's address and returns no key", () => {
    const store = new ProviderStore(file, fakeCipher());
    const saved = store.save(experiential, "xpl_abcdef123456");

    expect(saved).toMatchObject({
      name: "Experiential Labs",
      presetId: "experiential",
      baseUrl: "https://api.experientiallabs.ai/v1",
      requireZdr: true,
      hasKey: true,
      keyHint: "3456",
    });
    expect(saved.id).toMatch(/^experiential-labs-[0-9a-f]{4}$/);
    expect(saved.acknowledgedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(saved)).not.toContain("xpl_abcdef123456");
    expect(store.list()).toEqual([saved]);
  });

  it("never writes the key as plain text", () => {
    new ProviderStore(file, fakeCipher()).save(
      experiential,
      "xpl_abcdef123456"
    );
    const onDisk = fs.readFileSync(file, "utf8");
    expect(onDisk).not.toContain("xpl_abcdef123456");
    expect(onDisk).toContain("keyHint");
  });

  it("decrypts the key for the main process only, via resolve", () => {
    const store = new ProviderStore(file, fakeCipher());
    const { id } = store.save(experiential, "xpl_abcdef123456");
    const resolved = store.resolve(id);
    expect(resolved?.apiKey).toBe("xpl_abcdef123456");
    expect(resolved?.config).not.toHaveProperty("key");
    expect(store.resolve("nope")).toBeUndefined();
  });

  it("refuses to save a key when the system cannot encrypt", () => {
    const store = new ProviderStore(file, fakeCipher(false));
    expect(store.encryptionAvailable()).toBe(false);
    expect(() => store.save(experiential, "xpl_abcdef123456")).toThrow(
      /cannot encrypt/
    );
    expect(fs.existsSync(file)).toBe(false);
  });

  it("needs the user's confirmation that messages leave the device", () => {
    const store = new ProviderStore(file, fakeCipher());
    expect(() =>
      store.save({ ...experiential, acknowledged: false }, "xpl_abcdef123456")
    ).toThrow(/Confirm that your messages/);
  });

  it("needs a key for a new provider, and rejects one that is not a key", () => {
    const store = new ProviderStore(file, fakeCipher());
    expect(() => store.save(experiential)).toThrow(/Enter the API key/);
    expect(() => store.save(experiential, "  ")).toThrow(/Enter the API key/);
    expect(() => store.save(experiential, "two words")).toThrow(
      /does not look like an API key/
    );
  });

  it("can only hold a preset to zero data retention if it supports it", () => {
    const store = new ProviderStore(file, fakeCipher());
    const custom = store.save(
      {
        name: "Local gateway",
        presetId: "custom",
        baseUrl: "http://127.0.0.1:8000/v1",
        requireZdr: true,
        acknowledged: true,
      },
      "sk-local-1234"
    );
    expect(custom.requireZdr).toBe(false);
    expect(custom.baseUrl).toBe("http://127.0.0.1:8000/v1");
  });

  it("checks the address", () => {
    const store = new ProviderStore(file, fakeCipher());
    expect(() =>
      store.save(
        {
          name: "Odd",
          presetId: "custom",
          baseUrl: "http://example.com/v1",
          requireZdr: false,
          acknowledged: true,
        },
        "sk-1234"
      )
    ).toThrow(/https/);
  });

  it("changes a provider and keeps its key unless a new one is given", () => {
    const store = new ProviderStore(file, fakeCipher());
    const first = store.save(experiential, "xpl_abcdef123456");

    const renamed = store.save({
      ...experiential,
      id: first.id,
      name: "Exp",
      requireZdr: false,
    });
    expect(renamed).toMatchObject({
      id: first.id,
      name: "Exp",
      requireZdr: false,
      keyHint: "3456",
      acknowledgedAt: first.acknowledgedAt,
    });
    expect(store.resolve(first.id)?.apiKey).toBe("xpl_abcdef123456");

    store.save({ ...experiential, id: first.id }, "xpl_newkey9999");
    expect(store.resolve(first.id)?.apiKey).toBe("xpl_newkey9999");
    expect(store.list()).toHaveLength(1);
  });

  it("keeps the context in a sensible range", () => {
    const store = new ProviderStore(file, fakeCipher());
    expect(
      store.save({ ...experiential, defaultContext: 10 }, "xpl_abcdef123456")
        .defaultContext
    ).toBe(4096);
  });

  it("gives two providers of one name different ids, and removes by id", () => {
    const store = new ProviderStore(file, fakeCipher());
    const a = store.save(experiential, "xpl_aaaaaaaaaaaa");
    const b = store.save(experiential, "xpl_bbbbbbbbbbbb");
    expect(a.id).not.toBe(b.id);

    expect(store.remove(a.id)).toBe(true);
    expect(store.remove(a.id)).toBe(false);
    expect(store.list().map((p) => p.id)).toEqual([b.id]);
  });

  it("does not return a key it cannot decrypt", () => {
    const store = new ProviderStore(file, fakeCipher());
    const { id } = store.save(experiential, "xpl_abcdef123456");
    const broken: KeyCipher = {
      ...fakeCipher(),
      decrypt: () => {
        throw new Error("different Windows account");
      },
    };
    expect(new ProviderStore(file, broken).resolve(id)).toBeUndefined();
  });

  it("starts empty when there is no file or it is damaged", () => {
    expect(new ProviderStore(file, fakeCipher()).list()).toEqual([]);
    fs.writeFileSync(file, "{ not json");
    expect(new ProviderStore(file, fakeCipher()).list()).toEqual([]);
  });
});
