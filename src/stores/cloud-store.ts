import { create } from "zustand";
import type { FetchedModels } from "@/lib/cloudModels";
import type { ProviderSummary } from "@/types/providers";

/**
 * The user's remote providers and the models each one offers.
 *
 * The provider list is read from the main process at once (it is a local
 * file). A provider's models are fetched only when asked for - opening the
 * model picker, or Settings - never at startup: SHIELD does not contact a
 * provider until the user reaches for one.
 */
interface CloudStore {
  providers: ProviderSummary[];
  /** Whether this system can encrypt a key at all */
  encryptionAvailable: boolean;
  loaded: boolean;
  fetched: Record<string, FetchedModels | undefined>;
  fetching: boolean;
  /** When the providers were last asked, so opening the picker is not a request each time */
  fetchedAt: number;
  loadProviders: () => Promise<void>;
  /**
   * Ask each provider with a key for its models. Not again within a minute
   * of the last time, unless `force` (the user pressed Check, or changed a
   * provider).
   */
  fetchModels: (force?: boolean) => Promise<void>;
}

const REFRESH_AFTER_MS = 60_000;

export const useCloudStore = create<CloudStore>((set, get) => ({
  providers: [],
  encryptionAvailable: true,
  loaded: false,
  fetched: {},
  fetching: false,
  fetchedAt: 0,

  loadProviders: async () => {
    try {
      const result = await window.providers.list();
      if (!result.success) return;
      set((state) => ({
        providers: result.providers,
        encryptionAvailable: result.encryptionAvailable,
        loaded: true,
        // A provider that is gone, or was changed, is asked again
        fetched: Object.fromEntries(
          Object.entries(state.fetched).filter(([id]) =>
            result.providers.some((p) => p.id === id)
          )
        ),
      }));
    } catch (error) {
      console.error("[cloud] Could not read the providers:", error);
    }
  },

  fetchModels: async (force = false) => {
    if (get().fetching) return;
    const targets = get().providers.filter((p) => p.hasKey);
    if (targets.length === 0) return;
    const { fetchedAt, fetched } = get();
    const everyoneAsked = targets.every((p) => fetched[p.id]);
    if (!force && everyoneAsked && Date.now() - fetchedAt < REFRESH_AFTER_MS) {
      return;
    }
    set({ fetching: true });
    try {
      const results = await Promise.all(
        targets.map(async (provider) => {
          const result = await window.providers.models(provider.id);
          const entry: FetchedModels = result.ok
            ? { models: result.models ?? [] }
            : { models: [], error: result.error };
          return [provider.id, entry] as const;
        })
      );
      set((state) => ({
        fetched: { ...state.fetched, ...Object.fromEntries(results) },
        fetchedAt: Date.now(),
      }));
    } catch (error) {
      console.error("[cloud] Could not fetch the models:", error);
    } finally {
      set({ fetching: false });
    }
  },
}));
