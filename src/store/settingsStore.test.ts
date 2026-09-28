import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/types/settings";

// The user's saved settings: not the defaults
const saved = {
  ...DEFAULT_SETTINGS,
  model: { ...DEFAULT_SETTINGS.model, maxTokens: 8192 },
  webSearch: { ...DEFAULT_SETTINGS.webSearch, enabled: true },
};

/** A settings file that answers when told to */
function persistence() {
  let finishLoad: (value: typeof saved) => void = () => undefined;
  const load = vi.fn(
    () => new Promise<typeof saved>((resolve) => (finishLoad = resolve))
  );
  const save = vi.fn(async () => ({ success: true }));
  vi.stubGlobal("window", {
    electronAPI: { settingsPersistence: { load, save } },
  });
  return { load, save, finishLoad: () => finishLoad(saved) };
}

// 2026-09-28: a code session opened at start-up saved its folder before the
// user's settings had loaded, over them: 8192 became the default 2048 and
// web search went off
describe("settings saved before they have loaded", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("waits for the load in progress and keeps the user's settings", async () => {
    const file = persistence();
    const { useSettingsStore } = await import("./settingsStore");
    const store = useSettingsStore.getState();

    const loaded = store.loadSettings();
    const update = store.updateSettings({
      mcp: { ...DEFAULT_SETTINGS.mcp, workspaceFolder: "C:/p/EXPERIMENT" },
    });
    expect(file.save).not.toHaveBeenCalled();

    file.finishLoad();
    await Promise.all([loaded, update]);
    expect(file.save).toHaveBeenCalledTimes(1);
    expect(file.save).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ maxTokens: 8192 }),
        webSearch: expect.objectContaining({ enabled: true }),
        mcp: expect.objectContaining({ workspaceFolder: "C:/p/EXPERIMENT" }),
      })
    );
  });

  it("loads first when nothing has loaded them yet", async () => {
    const file = persistence();
    const { useSettingsStore } = await import("./settingsStore");

    const update = useSettingsStore
      .getState()
      .updateSettings({ privacy: { ...DEFAULT_SETTINGS.privacy } });
    expect(file.load).toHaveBeenCalledTimes(1);
    file.finishLoad();
    await update;
    expect(useSettingsStore.getState().settings.model.maxTokens).toBe(8192);
  });
});
