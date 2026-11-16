/**
 * A side panel the user can widen: drag its edge, use the arrow keys on it,
 * double-click to go back to the default. The width is remembered per
 * panel on this computer. The Team panel was a fixed 320 px, and agents'
 * reports were crammed into it on a large window (2026-11-16).
 */

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  width: number;
  onWidth: (width: number) => void;
  onReset: () => void;
  /** Which edge of the panel the handle is on; a right-hand panel grows leftwards */
  edge?: "left" | "right";
  label: string;
}

/** The draggable edge of a side panel */
export function ResizeHandle({
  width,
  onWidth,
  onReset,
  edge = "left",
  label,
}: ResizeHandleProps) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const sign = edge === "left" ? -1 : 1;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width };
        setDragging(true);
        // No text selected as the pointer crosses the chat while dragging
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onWidth(start.current.width + sign * (event.clientX - start.current.x));
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        start.current = null;
        setDragging(false);
        document.body.style.userSelect = "";
      }}
      onLostPointerCapture={() => {
        start.current = null;
        setDragging(false);
        document.body.style.userSelect = "";
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 64 : 16;
        if (event.key === "ArrowLeft") onWidth(width - sign * step);
        else if (event.key === "ArrowRight") onWidth(width + sign * step);
        else return;
        event.preventDefault();
      }}
      className={cn(
        "group absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none outline-none",
        edge === "left" ? "-left-1" : "-right-1"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-foreground/20 group-focus-visible:bg-signal",
          dragging && "bg-signal"
        )}
      />
    </div>
  );
}
