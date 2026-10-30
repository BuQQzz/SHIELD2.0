import { app, ipcMain, safeStorage } from "electron";
import path from "path";
import type { ModelRuntime } from "../../src/services/ModelRuntime.js";
import { listRemoteModels } from "../../src/services/remote/remoteModels.js";
import type {
  ProviderInput,
  ProviderTestResult,
} from "../../src/types/providers.js";
import { ProviderStore, type KeyCipher } from "../services/ProviderStore.js";

/** The operating system's credential store, as the provider store needs it */
const systemCipher: KeyCipher = {
  isAvailable: () =>
    safeStorage.isEncryptionAvailable() &&
    // Linux without a keyring falls back to a fixed password: not encryption
    !(
      process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text"
    ),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (encrypted) => safeStorage.decryptString(encrypted),
};

const failure = (error: unknown) => ({
  success: false as const,
  error: error instanceof Error ? error.message : "Unknown error",
});

/**
 * Remote providers: the user's own API keys for hosted models. Keys are
 * encrypted at rest and never leave this process; the renderer sees a summary
 * (name, address, whether a key is saved and its last four characters).
 */
export function registerProviderHandlers(runtime: ModelRuntime): ProviderStore {
  const store = new ProviderStore(
    path.join(app.getPath("userData"), "providers.json"),
    systemCipher
  );
  runtime.setProviderSource(store);

  ipcMain.handle("providers:list", () => ({
    success: true,
    providers: store.list(),
    encryptionAvailable: store.encryptionAvailable(),
  }));

  ipcMain.handle(
    "providers:save",
    (_event, input: ProviderInput, apiKey?: string) => {
      try {
        return { success: true, provider: store.save(input, apiKey) };
      } catch (error) {
        return failure(error);
      }
    }
  );

  ipcMain.handle("providers:remove", async (_event, id: string) => {
    try {
      const removed = store.remove(id);
      if (removed) await runtime.forgetProvider(id);
      return { success: removed };
    } catch (error) {
      return failure(error);
    }
  });

  // Allow or stop allowing one model without a zero-retention route
  ipcMain.handle(
    "providers:allow-model",
    (_event, id: string, modelId: string, allowed: boolean) => {
      try {
        return {
          success: true,
          provider: store.setAllowedModel(id, modelId, allowed),
        };
      } catch (error) {
        return failure(error);
      }
    }
  );

  // Also the check that a saved key works
  ipcMain.handle(
    "providers:models",
    async (_event, id: string): Promise<ProviderTestResult> => {
      const found = store.resolve(id);
      if (!found) {
        return {
          ok: false,
          error: "No key is saved for that provider, or it cannot be read.",
        };
      }
      return listRemoteModels({
        name: found.config.name,
        baseUrl: found.config.baseUrl,
        apiKey: found.apiKey,
      });
    }
  );

  return store;
}
