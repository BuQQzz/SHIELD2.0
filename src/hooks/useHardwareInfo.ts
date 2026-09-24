import { useEffect, useState } from "react";
import type { HardwareInfo } from "@/config/models";

/**
 * GPU memory and system RAM, for model recommendations. null until read,
 * and stays null if the main process cannot tell.
 */
export function useHardwareInfo(enabled = true): HardwareInfo | null {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);

  useEffect(() => {
    if (!enabled || hardware) return;
    let cancelled = false;
    window.electronAPI.modelDownload
      .getHardware()
      .then((result) => {
        if (!cancelled && result.success && result.hardware) {
          setHardware(result.hardware);
        }
      })
      .catch((error) => {
        console.error("[useHardwareInfo] Failed to read hardware:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, hardware]);

  return hardware;
}
