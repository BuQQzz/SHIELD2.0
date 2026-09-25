import { useEffect, useCallback, useRef } from "react";
import type { ModelOption } from "@/config/models";
import { isRuntimeAvailable } from "../config/models";
import { useSettingsStore } from "../store/settingsStore";
import { pickStartupModel } from "./startupModel";

/** The user's context choice for a model; undefined = recommended */
function chosenContextSize(modelId: string): number | undefined {
  return useSettingsStore.getState().settings.model.contextByModel?.[modelId];
}

interface UseModelLoaderProps {
  isInitialized: boolean;
  isModelLoaded: boolean;
  isLoading: boolean;
  currentModel: { id: string; name: string; uri: string } | null;
  currentModelId: string;
  loadModel: (model: {
    id: string;
    name: string;
    uri: string;
    contextSize?: number;
  }) => Promise<void>;
  setCurrentModelId: (id: string) => void;
  installedModels: ModelOption[]; // Add installed models prop
}

export function useModelLoader({
  isInitialized,
  isModelLoaded,
  isLoading,
  currentModel,
  currentModelId,
  loadModel,
  setCurrentModelId,
  installedModels,
}: UseModelLoaderProps) {
  // The saved per-model context choice has to be known before loading
  const settingsLoaded = useSettingsStore((state) => state.hasLoaded);
  // Once per session: a load that fails or is held back for lack of memory
  // leaves no model loaded, which would otherwise start the next attempt
  const startupDone = useRef(false);

  // At startup, select the last model. Load it only if the user asked for
  // that (Settings > Model); otherwise the chat offers it with one click.
  useEffect(() => {
    if (
      startupDone.current ||
      !settingsLoaded ||
      !isInitialized ||
      isModelLoaded ||
      isLoading ||
      currentModel ||
      installedModels.length === 0
    ) {
      return;
    }
    startupDone.current = true;

    const { model: modelSettings } = useSettingsStore.getState().settings;
    const startupModel = pickStartupModel(
      installedModels,
      modelSettings.lastModelId,
      currentModelId
    );
    if (!startupModel) {
      console.log("[App] No installed model SHIELD can run");
      return;
    }
    // The fallback may not be the model currentModelId names. Without this
    // the header showed "Select Model", the prompt used the generic family
    // and capabilities were missing, all for a loaded model.
    setCurrentModelId(startupModel.id);
    if (!modelSettings.loadOnStartup) {
      console.log(`[App] ${startupModel.displayName} selected, not loaded`);
      return;
    }

    console.log(
      `[App] Loading ${startupModel.displayName} (${startupModel.id}) at startup`
    );
    loadModel({
      id: startupModel.id,
      name: startupModel.name,
      uri: startupModel.uri,
      contextSize: chosenContextSize(startupModel.id),
    }).catch((err) => {
      console.error("[App] Failed to load model at startup:", err);
    });
  }, [
    settingsLoaded,
    isInitialized,
    isModelLoaded,
    isLoading,
    currentModel,
    loadModel,
    currentModelId,
    setCurrentModelId,
    installedModels,
  ]);

  // Remember the loaded model, so the next start offers it first
  const loadedId = isModelLoaded ? currentModel?.id : undefined;
  useEffect(() => {
    if (!loadedId) return;
    const { settings, updateSettings } = useSettingsStore.getState();
    if (settings.model.lastModelId === loadedId) return;
    void updateSettings({
      model: { ...settings.model, lastModelId: loadedId },
    });
  }, [loadedId]);

  const handleModelSelect = useCallback(
    async (model: ModelOption) => {
      if (isLoading || !isRuntimeAvailable(model)) return;

      console.log("[App] Switching to model:", model.displayName);
      setCurrentModelId(model.id);

      try {
        await loadModel({
          id: model.id,
          name: model.name,
          uri: model.uri,
          contextSize: chosenContextSize(model.id),
        });
        console.log("[App] Model switched successfully");
      } catch (err) {
        console.error("[App] Failed to switch model:", err);
      }
    },
    [isLoading, loadModel, setCurrentModelId]
  );

  return { handleModelSelect };
}
