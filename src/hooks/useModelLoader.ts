import { useEffect, useCallback } from "react";
import { AVAILABLE_MODELS } from "../config/models";
import type { ModelOption } from "../components/chat/ModelSelector";

interface UseModelLoaderProps {
  isInitialized: boolean;
  isModelLoaded: boolean;
  isLoading: boolean;
  currentModel: { name: string; uri: string } | null;
  currentModelId: string;
  loadModel: (model: {
    name: string;
    uri: string;
    contextSize?: number;
  }) => Promise<void>;
  setCurrentModelId: (id: string) => void;
}

export function useModelLoader({
  isInitialized,
  isModelLoaded,
  isLoading,
  currentModel,
  currentModelId,
  loadModel,
  setCurrentModelId,
}: UseModelLoaderProps) {
  // Auto-load model on initialization
  useEffect(() => {
    if (isInitialized && !isModelLoaded && !isLoading && !currentModel) {
      console.log("[App] Auto-loading default model...");
      const defaultModel = AVAILABLE_MODELS.find(
        (m) => m.id === currentModelId
      );
      if (defaultModel) {
        loadModel({
          name: defaultModel.name,
          uri: defaultModel.uri,
          contextSize: defaultModel.contextSize,
        }).catch((err) => {
          console.error("[App] Failed to auto-load model:", err);
        });
      }
    }
  }, [
    isInitialized,
    isModelLoaded,
    isLoading,
    currentModel,
    loadModel,
    currentModelId,
  ]);

  const handleModelSelect = useCallback(
    async (model: ModelOption) => {
      if (isLoading) return;

      console.log("[App] Switching to model:", model.displayName);
      setCurrentModelId(model.id);

      try {
        await loadModel({
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
