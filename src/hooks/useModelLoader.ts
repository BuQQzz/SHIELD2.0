import { useEffect, useCallback } from "react";
import type { ModelOption } from "@/config/models";
import { isRuntimeAvailable } from "../config/models";

interface UseModelLoaderProps {
  isInitialized: boolean;
  isModelLoaded: boolean;
  isLoading: boolean;
  currentModel: { name: string; uri: string } | null;
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
  // Auto-load model on initialization
  useEffect(() => {
    if (
      isInitialized &&
      !isModelLoaded &&
      !isLoading &&
      !currentModel &&
      installedModels.length > 0
    ) {
      console.log("[App] Auto-loading default model...");
      // Try to find the default model, or use the first installed model
      // SHIELD can run (an installed Bonsai needs a runtime still to come)
      const runnable = installedModels.filter(isRuntimeAvailable);
      const defaultModel =
        runnable.find((m) => m.id === currentModelId) || runnable[0];

      if (defaultModel) {
        console.log(
          `[App] Loading ${defaultModel.displayName} (${defaultModel.id})`
        );
        // The fallback may not be the model currentModelId names. Without
        // this the header showed "Select Model", the prompt used the generic
        // family and capabilities were missing, all for a loaded model.
        setCurrentModelId(defaultModel.id);
        loadModel({
          id: defaultModel.id,
          name: defaultModel.name,
          uri: defaultModel.uri,
          contextSize: defaultModel.contextSize,
        }).catch((err) => {
          console.error("[App] Failed to auto-load model:", err);
        });
      } else {
        console.log("[App] No installed models found to auto-load");
      }
    }
  }, [
    isInitialized,
    isModelLoaded,
    isLoading,
    currentModel,
    loadModel,
    currentModelId,
    setCurrentModelId,
    installedModels,
  ]);

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
          contextSize: model.contextSize,
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
