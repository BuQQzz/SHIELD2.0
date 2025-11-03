import { X } from "lucide-react";
import { motion } from "framer-motion";

interface TagProps {
  label: string;
  onRemove?: () => void;
  variant?: "default" | "compact";
}

export function Tag({ label, onRemove, variant = "default" }: TagProps) {
  const isCompact = variant === "compact";

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={`inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary ${
        isCompact ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      }`}
    >
      <span className="font-medium">{label}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded-full hover:bg-primary/20 transition-colors p-0.5"
          aria-label={`Remove ${label} tag`}
        >
          <X className={isCompact ? "h-2.5 w-2.5" : "h-3 w-3"} />
        </button>
      )}
    </motion.span>
  );
}
