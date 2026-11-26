/**
 * The width of a side panel the user can resize (components/ui/ResizeHandle),
 * kept within a share of the window and remembered on this computer.
 */

import { useCallback, useEffect, useState } from "react";

interface PanelWidthOptions {
  /** localStorage key */
  key: string;
  defaultWidth: number;
  minWidth: number;
  /** Share of the window the panel may take at most */
  maxShare: number;
  /**
   * Pixels kept for the rest of the window (the sidebar and the chat). On a
   * 920 px window a share alone let the Team panel squeeze the chat to a
   * word per line (2026-11-16)
   */
  reserve?: number;
}

const clampTo = (width: number, min: number, maxShare: number, reserve = 0) => {
  const max = Math.min(
    window.innerWidth * maxShare,
    window.innerWidth - reserve
  );
  return Math.round(Math.max(min, Math.min(width, max)));
};

function readWidth(key: string, fallback: number): number {
  try {
    const saved = Number(localStorage.getItem(key));
    return Number.isFinite(saved) && saved > 0 ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function usePanelWidth({
  key,
  defaultWidth,
  minWidth,
  maxShare,
  reserve,
}: PanelWidthOptions) {
  const [width, setWidthState] = useState(() =>
    clampTo(readWidth(key, defaultWidth), minWidth, maxShare, reserve)
  );

  const setWidth = useCallback(
    (next: number) => {
      const clamped = clampTo(next, minWidth, maxShare, reserve);
      setWidthState(clamped);
      try {
        localStorage.setItem(key, String(clamped));
      } catch {
        // Not remembered; the panel still resizes
      }
    },
    [key, minWidth, maxShare, reserve]
  );

  // A smaller window must not leave the panel wider than its share
  useEffect(() => {
    const onResize = () =>
      setWidthState((current) => clampTo(current, minWidth, maxShare, reserve));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minWidth, maxShare, reserve]);

  const reset = useCallback(
    () => setWidth(defaultWidth),
    [setWidth, defaultWidth]
  );
  return { width, setWidth, reset };
}
