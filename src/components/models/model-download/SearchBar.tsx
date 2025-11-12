/**
 * Search Bar - Model search input
 */

import { cn } from "@/lib/utils";

interface SearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function SearchBar({ searchQuery, setSearchQuery }: SearchBarProps) {
  return (
    <div className="mt-4">
      <input
        type="text"
        placeholder="Search models..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={cn(
          "w-full px-3 py-2 rounded-md border bg-background",
          "text-sm placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring"
        )}
      />
    </div>
  );
}
