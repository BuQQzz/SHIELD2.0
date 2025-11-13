import { motion } from "framer-motion";
import { Globe, ExternalLink, Clock, CheckCircle2 } from "lucide-react";
import type { SearchResult } from "@/types/electron";

interface WebSearchResultsProps {
  results: SearchResult[];
  isSearching?: boolean;
}

export function WebSearchResults({
  results,
  isSearching = false,
}: WebSearchResultsProps) {
  if (isSearching) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 rounded-lg border bg-muted/30 p-3"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Globe className="h-4 w-4" />
          </motion.div>
          <span>Searching the web...</span>
        </div>
      </motion.div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-lg border bg-muted/30 p-3"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span>Sources found ({results.length})</span>
      </div>

      <div className="space-y-2">
        {results.map((result, index) => (
          <motion.div
            key={`${result.url}-${index}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group flex items-start gap-2 rounded-md p-2 transition-colors hover:bg-background/50"
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {index + 1}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h4 className="line-clamp-1 text-sm font-medium">
                  {result.title}
                </h4>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </a>
              </div>

              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {result.snippet}
              </p>

              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Globe className="h-3 w-3" />
                <span className="truncate">{new URL(result.url).hostname}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Results will be included in the AI's context</span>
      </div>
    </motion.div>
  );
}
