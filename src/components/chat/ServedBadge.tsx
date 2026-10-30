import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { servedLabel, type ServedBy } from "@/utils/served";

/**
 * Under a hosted model's reply: who answered, and whether that route keeps a
 * copy of the request, as the provider reported it.
 */
export function ServedBadge({ servedBy }: { servedBy: ServedBy }) {
  const label = servedLabel(servedBy);
  return (
    <span
      title={label.title}
      className={cn(
        "inline-flex items-center gap-1",
        label.tone === "good" && "text-signal/80",
        label.tone === "warn" && "text-amber-500"
      )}
    >
      <Cloud className="h-3 w-3" />
      {label.text}
      <span className="text-muted-foreground/40">·</span>
    </span>
  );
}
